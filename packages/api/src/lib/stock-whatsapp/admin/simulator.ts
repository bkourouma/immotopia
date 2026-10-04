import { randomUUID } from 'crypto';
import { AsyncResource } from 'async_hooks';
import { Prisma } from '@prisma/client';
import { prisma } from '../../../utils/database';
import { whatsappInventorySimulatorAvailable } from '../../../config/env';
import { AppError, ErrorCode, NotFoundError } from '../../../middleware/error-middleware';
import { logger } from '../../../utils/logger';
import { normalizePhoneE164 } from '../../phone/e164';
import { CAPTURE_MAX_BYTES } from '../capture-files';
import { handleInboundMessage } from '../engine/index';
import { runSessionTimers } from '../engine/timers';
import { depositSimulatorMedia, listUnknownSenderOutbox } from '../transport/log-transport';
import type { InboundMessage, OutboundMessage } from '../types';
import { isUuid } from './schemas';
import {
  getSessionForTenant,
  messageSelect,
  sessionSelect,
  toConversationMessage,
  toSessionView,
  type ConversationMessage,
  type MessageRecord,
  type SessionRecord,
  type SessionView
} from './sessions';

/**
 * Simulateur de l'inventaire par WhatsApp (lot 041, W13) — recette sans Meta.
 *
 * DISPONIBILITÉ (W13-R1) : seulement avec le transport `log`, et en
 * `NODE_ENV=production` seulement avec `WHATSAPP_INVENTORY_SIMULATOR=1`
 * (écart E1) — `whatsappInventorySimulatorAvailable` (`config/env.ts`). Sinon
 * `404 STOCK_WHATSAPP_SIMULATOR_UNAVAILABLE`, AVANT toute lecture (la route
 * pose `requireSimulatorAvailable` en tête, avant la garde et le fichier).
 *
 * INJECTION (W13-R3) : le message passe par le MÊME moteur que le webhook
 * (`handleInboundMessage`), avec `via = SIMULATOR`, HORS du contexte de la
 * requête de l'administrateur : comme un message Meta, il ne porte ni agence
 * ambiante ni acteur (le moteur résout l'agence depuis l'inscription et passe
 * l'acteur explicitement à l'audit). La photo est déposée dans le magasin de
 * médias du transport `log` et relue par `fetchMedia`.
 *
 * NUMÉRO LIBRE (W7) : un numéro qui porte une inscription non révoquée, dans
 * cette agence ou une autre, est refusé — sans dire laquelle — pour qu'une
 * agence ne puisse jamais parler au nom du chef d'une autre.
 */

// ---------------------------------------------------------------------------
// Disponibilité
// ---------------------------------------------------------------------------

export function isWhatsappSimulatorAvailable(): boolean {
  return whatsappInventorySimulatorAvailable;
}

export function simulatorUnavailableError(): AppError {
  return new AppError(
    "Le simulateur WhatsApp n'est pas disponible sur ce serveur.",
    404,
    ErrorCode.STOCK_WHATSAPP_SIMULATOR_UNAVAILABLE
  );
}

export function assertSimulatorAvailable(): void {
  if (!isWhatsappSimulatorAvailable()) throw simulatorUnavailableError();
}

// ---------------------------------------------------------------------------
// Hors du contexte de la requête
// ---------------------------------------------------------------------------

/**
 * Contexte asynchrone capturé au chargement du module, hors de toute requête :
 * y exécuter le moteur le soustrait à l'agence et à l'acteur ambiants
 * (`AsyncLocalStorage` de `tenant-context` et `request-context`), exactement
 * comme le traitement d'un événement du webhook.
 */
const outsideRequest = new AsyncResource('StockWhatsappSimulator');

function runOutsideRequest<T>(fn: () => T): T {
  return outsideRequest.runInAsyncScope(fn);
}

// ---------------------------------------------------------------------------
// Fil des numéros libres (entrants), le temps du processus
// ---------------------------------------------------------------------------

type FreeInbound = { id: string; createdAt: Date; message: ConversationMessage };

const FREE_MAX_NUMBERS = 50;
const FREE_MAX_PER_NUMBER = 50;
const freeInbound = new Map<string, FreeInbound[]>();

function freeKey(tenantId: string, e164: string): string {
  return `${tenantId}|${e164}`;
}

function rememberFreeInbound(tenantId: string, e164: string, message: ConversationMessage): void {
  const key = freeKey(tenantId, e164);
  const entries = freeInbound.get(key) ?? [];
  entries.push({ id: message.id, createdAt: new Date(message.createdAt), message });
  if (entries.length > FREE_MAX_PER_NUMBER) entries.splice(0, entries.length - FREE_MAX_PER_NUMBER);
  freeInbound.delete(key);
  freeInbound.set(key, entries);
  while (freeInbound.size > FREE_MAX_NUMBERS) {
    const oldest = freeInbound.keys().next().value;
    if (oldest === undefined) break;
    freeInbound.delete(oldest);
  }
}

/** Remise à zéro de la mémoire du simulateur (tests). */
export function resetSimulatorMemoryForTests(): void {
  freeInbound.clear();
}

function outboundToConversation(entry: { sentAt: Date; message: OutboundMessage }, index: number): ConversationMessage {
  const { message } = entry;
  const interactive =
    message.kind === 'BUTTONS'
      ? message.buttons.map(button => ({ id: button.id, title: button.title }))
      : message.kind === 'LIST'
        ? message.rows.map(row =>
            row.description !== undefined
              ? { id: row.id, title: row.title, description: row.description }
              : { id: row.id, title: row.title }
          )
        : null;
  return {
    // Identifiant stable le temps du processus : la boîte d'envoi n'en porte pas.
    id: `out-${entry.sentAt.getTime()}-${index}`,
    direction: 'OUTBOUND',
    kind: message.kind,
    text: message.text,
    interactive: interactive && interactive.length > 0 ? interactive : null,
    captureId: null,
    via: null,
    sendError: null,
    createdAt: entry.sentAt.toISOString()
  };
}

// ---------------------------------------------------------------------------
// Cible d'un message
// ---------------------------------------------------------------------------

export type SimulatorTarget = { registrationId: string } | { freePhone: string };

export type SimulatorContent =
  | { kind: 'TEXT'; text: string }
  | { kind: 'REPLY'; replyId: string; replyTitle: string | null }
  | { kind: 'IMAGE'; buffer: Buffer; mimeType: string; caption: string | null };

function phoneInvalid(): AppError {
  return new AppError('Numéro de téléphone invalide.', 400, ErrorCode.STOCK_WHATSAPP_PHONE_INVALID);
}

function freePhoneUnavailable(): AppError {
  return new AppError(
    'Ce numéro est inscrit : choisissez son inscription, ou un autre numéro libre.',
    400,
    ErrorCode.VALIDATION_ERROR
  );
}

/**
 * Inscription de l'agence (tout statut : une inscription révoquée sert à jouer
 * le refus M06 en recette), ou `NotFoundError` comme un objet inexistant.
 */
async function registrationPhoneForTenant(tenantId: string, registrationId: string): Promise<string> {
  if (!isUuid(registrationId)) throw new NotFoundError('Inscription introuvable.');
  const registration = await prisma.stockWhatsappRegistration.findFirst({
    where: { id: registrationId, tenantId },
    select: { phoneE164: true }
  });
  if (!registration) throw new NotFoundError('Inscription introuvable.');
  return registration.phoneE164;
}

/**
 * Le numéro libre, normalisé, s'il ne porte AUCUNE inscription non révoquée sur
 * la plateforme. Lecture transverse assumée (même règle que l'unicité W3-R4) :
 * en SQL brut, elle ne rend qu'un booléen, jamais l'agence ni l'inscription.
 */
async function freePhoneE164(raw: string): Promise<string> {
  const e164 = normalizePhoneE164(raw);
  if (!e164) throw phoneInvalid();
  const rows = await prisma.$queryRaw<Array<{ taken: boolean }>>(Prisma.sql`
    SELECT EXISTS (
      SELECT 1 FROM stock_whatsapp_registrations
      WHERE phone_e164 = ${e164} AND status <> 'REVOKED'
    ) AS taken
  `);
  if (rows[0]?.taken) throw freePhoneUnavailable();
  return e164;
}

// ---------------------------------------------------------------------------
// Injection (W13-R3)
// ---------------------------------------------------------------------------

/**
 * `POST …/simulator/messages`. Rend aussitôt l'identifiant du message
 * (`sim-<uuid>`) ; le moteur le traite ensuite, comme le webhook
 * (`setImmediate`). La conversation se relit par `GET …/simulator/conversation`.
 */
export async function injectSimulatorMessage(
  tenantId: string,
  target: SimulatorTarget,
  content: SimulatorContent,
  now: Date = new Date()
): Promise<{ metaMessageId: string }> {
  assertSimulatorAvailable();

  const isFree = 'freePhone' in target;
  const fromE164 = isFree
    ? await freePhoneE164(target.freePhone)
    : await registrationPhoneForTenant(tenantId, target.registrationId);

  const metaMessageId = `sim-${randomUUID()}`;
  const base = { metaMessageId, fromE164, receivedAt: now, sentAt: now, via: 'SIMULATOR' as const };

  let message: InboundMessage;
  switch (content.kind) {
    case 'TEXT':
      message = { ...base, kind: 'TEXT', text: content.text };
      break;
    case 'REPLY':
      message = {
        ...base,
        kind: 'REPLY',
        replyId: content.replyId,
        replyTitle: content.replyTitle ?? content.replyId,
        contextMessageId: null
      };
      break;
    case 'IMAGE': {
      if (content.buffer.length > CAPTURE_MAX_BYTES) {
        throw new AppError('Photo de plus de 10 Mo.', 413, ErrorCode.STOCK_WHATSAPP_FILE_TOO_LARGE);
      }
      const mediaId = depositSimulatorMedia(content.buffer, content.mimeType);
      message = {
        ...base,
        kind: 'IMAGE',
        media: { mediaId, mimeType: content.mimeType, providerSha256: null, caption: content.caption }
      };
      break;
    }
  }

  if (isFree) {
    // Un numéro inconnu n'a pas de journal en base (W7) : son fil vit en mémoire.
    rememberFreeInbound(tenantId, fromE164, {
      id: metaMessageId,
      direction: 'INBOUND',
      kind: content.kind,
      text: content.kind === 'TEXT' ? content.text.slice(0, 1000) : content.kind === 'IMAGE' ? content.caption : null,
      interactive:
        content.kind === 'REPLY' ? [{ id: content.replyId, title: content.replyTitle ?? content.replyId }] : null,
      captureId: null,
      via: 'SIMULATOR',
      sendError: null,
      createdAt: now.toISOString()
    });
  }

  runOutsideRequest(() => {
    setImmediate(() => {
      handleInboundMessage(message).catch((error: unknown) => {
        // `handleInboundMessage` ne lève jamais ; défense en profondeur, sans le numéro.
        logger.error('Inventaire WhatsApp : message du simulateur non traité', {
          tenantId,
          metaMessageId,
          error: error instanceof Error ? error.name : 'inconnue'
        });
      });
    });
  });

  return { metaMessageId };
}

// ---------------------------------------------------------------------------
// Conversation (W13-R4)
// ---------------------------------------------------------------------------

/** Messages rendus au plus par lecture (les plus récents). */
export const SIMULATOR_CONVERSATION_MAX = 200;

export type SimulatorConversation = { session: SessionView | null; messages: ConversationMessage[] };

/** `GET …/simulator/conversation` — inscription de l'agence, ou numéro libre. */
export async function getSimulatorConversation(
  tenantId: string,
  target: SimulatorTarget,
  after: Date | null
): Promise<SimulatorConversation> {
  assertSimulatorAvailable();

  if ('freePhone' in target) {
    const e164 = normalizePhoneE164(target.freePhone);
    if (!e164) throw phoneInvalid();
    const inbound = (freeInbound.get(freeKey(tenantId, e164)) ?? [])
      .filter(entry => !after || entry.createdAt.getTime() > after.getTime())
      .map(entry => entry.message);
    const outbound = listUnknownSenderOutbox(e164, after ?? undefined).map(outboundToConversation);
    const messages = [...inbound, ...outbound]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(-SIMULATOR_CONVERSATION_MAX);
    return { session: null, messages };
  }

  if (!isUuid(target.registrationId)) throw new NotFoundError('Inscription introuvable.');
  const registration = await prisma.stockWhatsappRegistration.findFirst({
    where: { id: target.registrationId, tenantId },
    select: { id: true }
  });
  if (!registration) throw new NotFoundError('Inscription introuvable.');

  const session = ((await prisma.stockWhatsappSession.findFirst({
    where: { tenantId, registrationId: registration.id, closedAt: null },
    select: sessionSelect
  })) ??
    (await prisma.stockWhatsappSession.findFirst({
      where: { tenantId, registrationId: registration.id },
      orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
      select: sessionSelect
    }))) as SessionRecord | null;

  const rows = (await prisma.stockWhatsappMessage.findMany({
    where: {
      tenantId,
      registrationId: registration.id,
      ...(after ? { createdAt: { gt: after } } : {})
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: SIMULATOR_CONVERSATION_MAX,
    select: messageSelect
  })) as MessageRecord[];

  return {
    session: session ? toSessionView(session) : null,
    messages: rows.reverse().map(toConversationMessage)
  };
}

// ---------------------------------------------------------------------------
// Horloge (W13-R5)
// ---------------------------------------------------------------------------

/**
 * `POST …/simulator/sessions/{sessionId}/advance` — recule `lastInboundAt` de
 * 10 ou 30 minutes puis lance aussitôt le passage de la tâche pour CETTE
 * session (relance M23, expiration M24). Une session close est rendue telle
 * quelle : il n'y a plus d'échéance à jouer.
 */
export async function advanceSimulatorSession(
  tenantId: string,
  sessionId: string,
  minutes: 10 | 30
): Promise<SessionView> {
  assertSimulatorAvailable();

  const session = await getSessionForTenant(tenantId, sessionId);
  if (session.closedAt) return toSessionView(session);

  const shifted = new Date(session.lastInboundAt.getTime() - minutes * 60_000);
  const updated = await prisma.stockWhatsappSession.updateMany({
    where: { id: session.id, tenantId, closedAt: null, lastInboundAt: session.lastInboundAt },
    data: { lastInboundAt: shifted }
  });
  if (updated.count === 1) {
    await runOutsideRequest(() => runSessionTimers({ sessionId: session.id }));
  }

  return toSessionView(await getSessionForTenant(tenantId, session.id));
}
