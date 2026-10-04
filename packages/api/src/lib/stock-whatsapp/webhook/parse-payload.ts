import { waIdToE164 } from '../../phone/e164';
import type { InboundMessage } from '../types';

/**
 * Lecture du corps d'un webhook Meta WhatsApp Cloud (lot 041, spec W6-R6).
 *
 * `object = whatsapp_business_account`, puis `entry[].changes[].value` où
 * `field = messages`, pour la seule ligne `metadata.phone_number_id` attendue
 * (une autre ligne Meta du même compte est ignorée). Les messages deviennent
 * des `InboundMessage` ; les statuts de remise sont rendus à part (journalisés
 * puis ignorés). `contacts[].profile.name` n'est jamais lu (minimisation).
 *
 * Fonction pure, défensive : un élément mal formé est compté et sauté, jamais
 * une exception. Aucune journalisation (le corps porte des numéros).
 */

export type ParsedInboundEvent = {
  message: InboundMessage;
  /** `type` d'origine chez Meta (colonne `message_type`, 40 caractères). */
  messageType: string;
};

export type ParsedStatusEvent = {
  /** wamid du message visé. */
  metaMessageId: string;
  /** sent | delivered | read | failed (20 caractères). */
  deliveryStatus: string;
};

export type ParsedWebhookPayload = {
  messages: ParsedInboundEvent[];
  statuses: ParsedStatusEvent[];
  /** Changements ignorés : autre champ, autre ligne Meta, objet inattendu. */
  ignoredChanges: number;
  /** Messages sans identifiant ou sans expéditeur lisible. */
  invalidMessages: number;
  /**
   * Messages dont l'horodatage Meta dépasse `MAX_MESSAGE_AGE_MS` : ignorés, ni
   * enregistrés ni traités (rejeu d'un corps signé après la purge des
   * événements, voir `MAX_MESSAGE_AGE_MS`).
   */
  staleMessages: number;
};

const TEXT_MAX = 4096;
const CAPTION_MAX = 1024;
const REPLY_FIELD_MAX = 256;
const META_ID_MAX = 256;

/**
 * Âge maximal d'un message entrant, mesuré entre son `timestamp` Meta et
 * l'heure du serveur à la réception : 7 jours.
 *
 * Le dédoublonnage repose sur l'unicité de `metaMessageId`, mais les
 * événements sont purgés à 30 jours (`EVENT_RETENTION_MS`,
 * `src/jobs/stock-whatsapp-job.ts`). Sans cette borne, un corps signé capturé
 * puis rejoué après la purge serait retraité comme neuf. Meta ne renvoie un
 * événement non acquitté que pendant 36 heures (W6-R7) : 7 jours couvre
 * largement ses renvois et reste inférieur à la rétention, donc tout message
 * accepté a encore sa ligne d'unicité. Un horodatage absent ou illisible ne
 * déclenche pas ce filtre (heure de réception par défaut) : le corps étant
 * signé, il vient bien de Meta.
 */
export const MAX_MESSAGE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Types d'image acceptés pour un document traité comme une photo (W4-R8). */
const IMAGE_DOCUMENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type Json = Record<string, unknown>;

function asObject(value: unknown): Json | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function cut(value: string, max: number): string {
  const chars = Array.from(value);
  return chars.length <= max ? value : chars.slice(0, max).join('');
}

function nonEmpty(value: unknown, max: number): string | null {
  const text = asString(value);
  if (text === null || text.length === 0 || text.length > max) return null;
  return text;
}

function parseTimestamp(value: unknown, fallback: Date): Date {
  const seconds = Number(asString(value) ?? value);
  if (!Number.isFinite(seconds) || seconds <= 0) return fallback;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

type MessageBody =
  | { kind: 'TEXT'; text: string }
  | {
      kind: 'IMAGE';
      media: { mediaId: string; mimeType: string; providerSha256: string | null; caption: string | null };
    }
  | { kind: 'REPLY'; replyId: string; replyTitle: string; contextMessageId: string | null }
  | { kind: 'UNSUPPORTED'; originalType: string };

function mediaOf(raw: unknown): {
  mediaId: string;
  mimeType: string;
  providerSha256: string | null;
  caption: string | null;
} | null {
  const media = asObject(raw);
  const mediaId = nonEmpty(media?.id, META_ID_MAX);
  if (!media || !mediaId) return null;
  const caption = asString(media.caption);
  const sha256 = asString(media.sha256);
  return {
    mediaId,
    mimeType: cut(asString(media.mime_type) ?? 'application/octet-stream', 100),
    providerSha256: sha256 && sha256.length > 0 ? cut(sha256, 128) : null,
    caption: caption && caption.length > 0 ? cut(caption, CAPTION_MAX) : null
  };
}

function bodyOf(raw: Json, type: string): MessageBody {
  switch (type) {
    case 'text': {
      const text = asString(asObject(raw.text)?.body);
      return text === null ? { kind: 'UNSUPPORTED', originalType: type } : { kind: 'TEXT', text: cut(text, TEXT_MAX) };
    }
    case 'image': {
      const media = mediaOf(raw.image);
      return media ? { kind: 'IMAGE', media } : { kind: 'UNSUPPORTED', originalType: type };
    }
    case 'document': {
      // W4-R8 : un document dont le type DÉCLARÉ est une image est traité comme une photo.
      const media = mediaOf(raw.document);
      if (media && IMAGE_DOCUMENT_TYPES.has(media.mimeType.toLowerCase())) return { kind: 'IMAGE', media };
      return { kind: 'UNSUPPORTED', originalType: type };
    }
    case 'interactive': {
      const interactive = asObject(raw.interactive);
      const reply = asObject(interactive?.button_reply) ?? asObject(interactive?.list_reply);
      const replyId = nonEmpty(reply?.id, REPLY_FIELD_MAX);
      if (!reply || !replyId) return { kind: 'UNSUPPORTED', originalType: type };
      const contextId = nonEmpty(asObject(raw.context)?.id, META_ID_MAX);
      return {
        kind: 'REPLY',
        replyId,
        replyTitle: cut(asString(reply.title) ?? '', REPLY_FIELD_MAX),
        contextMessageId: contextId
      };
    }
    default:
      return { kind: 'UNSUPPORTED', originalType: cut(type || 'unknown', 40) };
  }
}

/**
 * Convertit un corps de webhook déjà vérifié (signature juste) en événements.
 * `receivedAt` : heure du serveur à la réception, la même pour tout le corps.
 */
export function parseMetaWebhookPayload(
  body: unknown,
  options: { phoneNumberId: string | undefined; receivedAt: Date }
): ParsedWebhookPayload {
  const result: ParsedWebhookPayload = {
    messages: [],
    statuses: [],
    ignoredChanges: 0,
    invalidMessages: 0,
    staleMessages: 0
  };
  const root = asObject(body);
  if (!root || root.object !== 'whatsapp_business_account') {
    result.ignoredChanges += 1;
    return result;
  }

  for (const entry of asArray(root.entry)) {
    for (const change of asArray(asObject(entry)?.changes)) {
      const changeObject = asObject(change);
      const value = asObject(changeObject?.value);
      if (!changeObject || changeObject.field !== 'messages' || !value) {
        result.ignoredChanges += 1;
        continue;
      }
      const phoneNumberId = asString(asObject(value.metadata)?.phone_number_id);
      if (!options.phoneNumberId || phoneNumberId !== options.phoneNumberId) {
        result.ignoredChanges += 1;
        continue;
      }

      for (const rawMessage of asArray(value.messages)) {
        const message = asObject(rawMessage);
        const metaMessageId = nonEmpty(message?.id, META_ID_MAX);
        const fromE164 = waIdToE164(asString(message?.from) ?? '');
        if (!message || !metaMessageId || !fromE164) {
          result.invalidMessages += 1;
          continue;
        }
        const sentAt = parseTimestamp(message.timestamp, options.receivedAt);
        if (options.receivedAt.getTime() - sentAt.getTime() > MAX_MESSAGE_AGE_MS) {
          // Rejeu probable d'un corps ancien : compté, jamais enregistré.
          result.staleMessages += 1;
          continue;
        }
        const type = asString(message.type) ?? 'unknown';
        const parsedBody = bodyOf(message, type);
        result.messages.push({
          messageType: cut(type, 40),
          message: {
            metaMessageId,
            fromE164,
            receivedAt: options.receivedAt,
            sentAt,
            via: 'META',
            ...parsedBody
          } as InboundMessage
        });
      }

      for (const rawStatus of asArray(value.statuses)) {
        const status = asObject(rawStatus);
        const metaMessageId = nonEmpty(status?.id, META_ID_MAX);
        const deliveryStatus = asString(status?.status);
        if (!status || !metaMessageId || !deliveryStatus) {
          result.invalidMessages += 1;
          continue;
        }
        result.statuses.push({ metaMessageId, deliveryStatus: cut(deliveryStatus, 20) });
      }
    }
  }
  return result;
}
