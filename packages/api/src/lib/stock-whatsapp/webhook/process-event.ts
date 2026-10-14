import { Prisma } from '@prisma/client';
import { runWithLanguage } from '../../../i18n';
import { prisma } from '../../../utils/database';
import { logger } from '../../../utils/logger';
import { botMessages } from '../bot-messages';
import { handleInboundMessage } from '../engine';
import { hashSender } from '../sender-hash';
import { getWhatsappTransport } from '../transport';
import { deserializeInboundMessage } from './record-event';

/**
 * Traitement d'un événement du webhook WhatsApp Cloud (lot 041, spec W6-R7,
 * W7-R1, W1-R5 ; contrat plan §3.3).
 *
 * 1. Réclame l'événement par mise à jour conditionnelle : `RECEIVED →
 *    PROCESSING`, ou reprise d'un `PROCESSING` abandonné depuis plus de
 *    5 minutes (arrêt de l'API), trois tentatives au plus (la première et deux
 *    reprises par la tâche), puis `FAILED`.
 * 2. Accuse la lecture (transport `meta`), sans bloquer.
 * 3. Numéro sans AUCUNE inscription : M01, au plus une fois par 24 heures et
 *    par empreinte d'expéditeur (W7-R1) ; aucune session, aucune capture,
 *    aucun téléchargement de média, rien n'est journalisé dans la
 *    conversation d'une agence.
 *    Numéro inscrit, y compris révoqué (le moteur répond alors M06, W3-7) :
 *    `handleInboundMessage` (moteur, W3).
 * 4. Efface la copie transitoire `payload` (le numéro en clair) dès la fin.
 *
 * Ne lève jamais : appelé par `setImmediate` après la réponse à Meta et par la
 * tâche planifiée. Aucun journal ne contient le numéro ni le texte du message.
 */

/** Un événement `PROCESSING` plus ancien est réputé abandonné (W6-R7). */
export const WEBHOOK_PROCESSING_STALE_MS = 5 * 60 * 1000;
/** Tentatives au plus : la première, puis deux reprises par la tâche (W6-R7). */
export const WEBHOOK_EVENT_MAX_ATTEMPTS = 3;
/** Fenêtre de la réponse unique à un numéro inconnu (W7-R1). */
export const UNKNOWN_SENDER_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

function errorLabel(error: unknown): string {
  return error instanceof Error ? error.name : 'inconnue';
}

async function claimEvent(eventId: string, now: Date): Promise<boolean> {
  const staleBefore = new Date(now.getTime() - WEBHOOK_PROCESSING_STALE_MS);
  const claim = await prisma.whatsappCloudEvent.updateMany({
    where: {
      id: eventId,
      kind: 'MESSAGE',
      attempts: { lt: WEBHOOK_EVENT_MAX_ATTEMPTS },
      OR: [{ status: 'RECEIVED' }, { status: 'PROCESSING', claimedAt: { lt: staleBefore } }]
    },
    data: { status: 'PROCESSING', claimedAt: now, attempts: { increment: 1 } }
  });
  return claim.count === 1;
}

/** Événement abandonné après ses trois tentatives : `FAILED`, copie effacée. */
async function failExhaustedEvent(eventId: string, now: Date): Promise<void> {
  const staleBefore = new Date(now.getTime() - WEBHOOK_PROCESSING_STALE_MS);
  await prisma.whatsappCloudEvent.updateMany({
    where: {
      id: eventId,
      kind: 'MESSAGE',
      attempts: { gte: WEBHOOK_EVENT_MAX_ATTEMPTS },
      OR: [{ status: 'RECEIVED' }, { status: 'PROCESSING', claimedAt: { lt: staleBefore } }]
    },
    data: {
      status: 'FAILED',
      processedAt: now,
      payload: Prisma.DbNull,
      error: 'Abandonné après trois tentatives.'
    }
  });
}

/** Clôt un événement réclamé par CE traitement (un autre l'a peut-être repris depuis). */
async function finishEvent(
  eventId: string,
  claimedAt: Date,
  status: 'PROCESSED' | 'FAILED',
  error: string | null
): Promise<void> {
  await prisma.whatsappCloudEvent.updateMany({
    where: { id: eventId, status: 'PROCESSING', claimedAt },
    data: { status, processedAt: new Date(), payload: Prisma.DbNull, error }
  });
}

/**
 * M01 au plus une fois par 24 heures et par empreinte d'expéditeur. La
 * décision se prend sous un verrou consultatif de l'empreinte : deux messages
 * simultanés du même inconnu ne reçoivent qu'une réponse. L'envoi suit, hors
 * transaction ; sans inscription, rien n'est journalisé (`log: null`).
 */
async function replyToUnknownSender(eventId: string, senderHash: string, toE164: string, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - UNKNOWN_SENDER_REPLY_WINDOW_MS);
  const lockKey = `stock-whatsapp-unknown:${senderHash}`;
  const due = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
    const recent = await tx.whatsappCloudEvent.findFirst({
      where: { senderHash, unknownReplySentAt: { gt: since } },
      select: { id: true }
    });
    if (recent) return false;
    await tx.whatsappCloudEvent.update({ where: { id: eventId }, data: { unknownReplySentAt: now } });
    return true;
  });
  if (!due) return false;
  const result = await getWhatsappTransport().send({
    toE164,
    // M01 (spec §10). Numéro inconnu : aucune langue de chef connue, le français s'applique (§8.5).
    message: runWithLanguage('fr', () => botMessages.unknownNumber()),
    log: null
  });
  if (result.error) {
    logger.warn('Inventaire WhatsApp : réponse au numéro inconnu non remise', { eventId, error: result.error });
  }
  return true;
}

/** Traite un événement `MESSAGE` du webhook. Ne lève jamais. */
export async function processWebhookEvent(eventId: string): Promise<void> {
  const now = new Date();
  let claimed = false;
  try {
    claimed = await claimEvent(eventId, now);
    if (!claimed) {
      await failExhaustedEvent(eventId, now);
      return;
    }

    const event = await prisma.whatsappCloudEvent.findUnique({
      where: { id: eventId },
      select: { payload: true, senderHash: true }
    });
    const message = deserializeInboundMessage(event?.payload ?? null);
    if (!message) {
      await finishEvent(eventId, now, 'FAILED', 'Copie du message absente ou illisible.');
      return;
    }

    const transport = getWhatsappTransport();
    if (message.via === 'META') {
      // W1-R5 : accusé de lecture, jamais bloquant (`markRead` ne lève pas).
      void transport.markRead(message.metaMessageId);
    }

    // Lecture transverse assumée (spec §8.2) : l'agence se déduit de l'inscription.
    // Une inscription RÉVOQUÉE va aussi au moteur, qui répond M06 (W3-7, W12) :
    // seul un numéro qui n'a jamais été inscrit reçoit M01.
    const registration = await prisma.stockWhatsappRegistration.findFirst({
      where: { phoneE164: message.fromE164 },
      select: { id: true }
    });

    if (!registration) {
      await replyToUnknownSender(eventId, event?.senderHash ?? hashSender(message.fromE164), message.fromE164, now);
      await finishEvent(eventId, now, 'PROCESSED', null);
      return;
    }

    try {
      await handleInboundMessage(message);
    } catch (error) {
      // Le moteur ne doit jamais lever ; s'il le fait, l'événement reste
      // `PROCESSING` : la tâche le reprend après 5 minutes (W6-R7).
      logger.error('Inventaire WhatsApp : le moteur a levé une erreur', { eventId, error: errorLabel(error) });
      await prisma.whatsappCloudEvent
        .updateMany({
          where: { id: eventId, status: 'PROCESSING', claimedAt: now },
          data: { error: `Erreur du moteur (${errorLabel(error)}).` }
        })
        .catch(() => undefined);
      return;
    }
    await finishEvent(eventId, now, 'PROCESSED', null);
  } catch (error) {
    logger.error("Inventaire WhatsApp : traitement d'un événement du webhook en échec", {
      eventId,
      claimed,
      error: errorLabel(error)
    });
  }
}

/** Traite des événements UN PAR UN, dans l'ordre du corps reçu (W4-R9). Ne lève jamais. */
export async function processWebhookEventsInOrder(eventIds: readonly string[]): Promise<void> {
  for (const eventId of eventIds) {
    await processWebhookEvent(eventId);
  }
}
