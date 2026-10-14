import crypto, { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../utils/database';
import { logger } from '../../../utils/logger';
import { CAPTURE_MAX_BYTES } from '../capture-files';
import { MediaFetchError, type OutboundMessage, type WhatsappTransport } from '../types';
import { boundOutboundMessage } from './message-limits';

/**
 * Transport `log` de l'inventaire par WhatsApp (lot 041, spec W1-R2, W13-R3).
 *
 * Développement, staging et tests : RIEN ne part sur le réseau. Chaque message
 * sortant d'un chef inscrit est écrit dans `StockWhatsappMessage` (le
 * simulateur le relit) ; ceux adressés à un numéro inconnu (`log: null`) sont
 * gardés en mémoire, le temps du processus, pour le fil « Numéro inconnu » du
 * simulateur (W13-R4). Les photos injectées par le simulateur sont déposées
 * dans un magasin de médias en mémoire et relues par `fetchMedia`, comme le
 * ferait l'API Graph.
 *
 * Ce fichier porte aussi `recordOutboundMessage`, l'écriture du journal de
 * conversation partagée avec le transport `meta`.
 */

// ---------------------------------------------------------------------------
// Journal de conversation (StockWhatsappMessage), commun à `log` et `meta`
// ---------------------------------------------------------------------------

export type OutboundLogTarget = {
  tenantId: string;
  registrationId: string;
  sessionId: string | null;
  captureId: string | null;
};

const MESSAGE_TEXT_MAX = 1000;
const SEND_ERROR_MAX = 500;

function cut(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length <= max ? value : chars.slice(0, max).join('');
}

function interactiveOf(message: OutboundMessage): Prisma.InputJsonValue | undefined {
  if (message.kind === 'BUTTONS') return message.buttons.map(button => ({ id: button.id, title: button.title }));
  if (message.kind === 'LIST') return message.rows.map(row => ({ id: row.id, title: row.title }));
  return undefined;
}

/**
 * Écrit un message sortant DÉJÀ borné dans le journal de conversation. Ne lève
 * jamais : un journal manqué ne défait pas l'envoi (il est signalé au journal
 * technique, sans le texte ni le numéro).
 */
export async function recordOutboundMessage(
  target: OutboundLogTarget,
  bounded: OutboundMessage,
  result: { metaMessageId: string | null; error: string | null }
): Promise<void> {
  try {
    const interactive = interactiveOf(bounded);
    await prisma.stockWhatsappMessage.create({
      data: {
        tenantId: target.tenantId,
        registrationId: target.registrationId,
        sessionId: target.sessionId,
        captureId: target.captureId,
        direction: 'OUTBOUND',
        kind: bounded.kind,
        text: cut(bounded.text, MESSAGE_TEXT_MAX),
        ...(interactive !== undefined ? { interactive } : {}),
        metaMessageId: result.metaMessageId,
        sendError: result.error ? cut(result.error, SEND_ERROR_MAX) : null
      }
    });
  } catch (error) {
    logger.error('Inventaire WhatsApp : message sortant non journalisé', {
      tenantId: target.tenantId,
      registrationId: target.registrationId,
      error: error instanceof Error ? error.name : 'inconnue'
    });
  }
}

// ---------------------------------------------------------------------------
// Magasin de médias du simulateur (W13-R3)
// ---------------------------------------------------------------------------

/** Durée de vie d'un média déposé : bien au-delà du traitement d'un message. */
const SIMULATOR_MEDIA_TTL_MS = 60 * 60 * 1000;
/** Plafond de médias gardés en mémoire (les plus anciens sortent d'abord). */
const SIMULATOR_MEDIA_MAX_ENTRIES = 50;

const SIMULATOR_MEDIA_PREFIX = 'sim-media-';

type StoredMedia = { buffer: Buffer; mimeType: string; sha256: string; storedAt: number };

const simulatorMedia = new Map<string, StoredMedia>();

function pruneSimulatorMedia(now: number): void {
  for (const [id, media] of simulatorMedia) {
    if (now - media.storedAt > SIMULATOR_MEDIA_TTL_MS) simulatorMedia.delete(id);
  }
  while (simulatorMedia.size > SIMULATOR_MEDIA_MAX_ENTRIES) {
    const oldest = simulatorMedia.keys().next().value;
    if (oldest === undefined) break;
    simulatorMedia.delete(oldest);
  }
}

/**
 * Dépose une photo injectée par le simulateur et rend son `mediaId`, à placer
 * dans `InboundMessage.media.mediaId` : le moteur la relit par
 * `getWhatsappTransport().fetchMedia(mediaId)`, comme une photo Meta.
 * Le type annoncé est rendu tel quel : le type réel se lit aux octets
 * (`storeCapturePhoto`).
 */
export function depositSimulatorMedia(buffer: Buffer, mimeType: string): string {
  const now = Date.now();
  const mediaId = `${SIMULATOR_MEDIA_PREFIX}${randomUUID()}`;
  const copy = Buffer.from(buffer);
  simulatorMedia.set(mediaId, {
    buffer: copy,
    mimeType,
    sha256: crypto.createHash('sha256').update(copy).digest('hex'),
    storedAt: now
  });
  pruneSimulatorMedia(now);
  return mediaId;
}

// ---------------------------------------------------------------------------
// Boîte d'envoi des numéros inconnus (W13-R4, fil « Numéro inconnu »)
// ---------------------------------------------------------------------------

export type UnknownSenderOutboxEntry = { sentAt: Date; message: OutboundMessage };

const OUTBOX_MAX_NUMBERS = 50;
const OUTBOX_MAX_PER_NUMBER = 50;

const unknownSenderOutbox = new Map<string, UnknownSenderOutboxEntry[]>();

function pushUnknownSenderOutbox(toE164: string, message: OutboundMessage): void {
  const entries = unknownSenderOutbox.get(toE164) ?? [];
  entries.push({ sentAt: new Date(), message });
  if (entries.length > OUTBOX_MAX_PER_NUMBER) entries.splice(0, entries.length - OUTBOX_MAX_PER_NUMBER);
  // Réinsertion : l'ordre de la Map suit l'activité la plus récente.
  unknownSenderOutbox.delete(toE164);
  unknownSenderOutbox.set(toE164, entries);
  while (unknownSenderOutbox.size > OUTBOX_MAX_NUMBERS) {
    const oldest = unknownSenderOutbox.keys().next().value;
    if (oldest === undefined) break;
    unknownSenderOutbox.delete(oldest);
  }
}

/**
 * Messages que le bot a adressés à un numéro SANS inscription, en transport
 * `log`, depuis le démarrage du processus (fil « Numéro inconnu » du
 * simulateur). Vide en `meta` : rien n'y est conservé.
 */
export function listUnknownSenderOutbox(toE164: string, after?: Date): UnknownSenderOutboxEntry[] {
  const entries = unknownSenderOutbox.get(toE164) ?? [];
  return entries.filter(entry => !after || entry.sentAt.getTime() > after.getTime()).map(entry => ({ ...entry }));
}

/** Remise à zéro des mémoires du transport `log` (tests). */
export function resetLogTransportMemoryForTests(): void {
  simulatorMedia.clear();
  unknownSenderOutbox.clear();
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export function createLogTransport(): WhatsappTransport {
  return {
    id: 'log',

    async send({ toE164, message, log }) {
      const bounded = boundOutboundMessage(message);
      const result = { metaMessageId: null, error: null };
      if (log) {
        await recordOutboundMessage(log, bounded, result);
      } else {
        pushUnknownSenderOutbox(toE164, bounded);
      }
      return result;
    },

    async markRead() {
      // Rien à accuser : aucun message n'est venu de Meta.
    },

    async fetchMedia(mediaId) {
      pruneSimulatorMedia(Date.now());
      const media = simulatorMedia.get(mediaId);
      if (!media) throw new MediaFetchError('NOT_FOUND', 'Média du simulateur introuvable ou expiré.');
      if (media.buffer.length > CAPTURE_MAX_BYTES) {
        throw new MediaFetchError('TOO_LARGE', 'Média de plus de 10 Mo.');
      }
      return { buffer: Buffer.from(media.buffer), declaredMimeType: media.mimeType, providerSha256: media.sha256 };
    }
  };
}
