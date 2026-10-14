import { Prisma } from '@prisma/client';
import { prisma } from '../../../utils/database';
import { hashSender } from '../sender-hash';
import type { InboundMessage } from '../types';
import type { ParsedInboundEvent, ParsedWebhookPayload } from './parse-payload';

/**
 * Journal du webhook WhatsApp Cloud (lot 041, spec W6-R7, W6-R8).
 *
 * Chaque message est INSÉRÉ dans `whatsapp_cloud_events` AVANT la réponse
 * `200` à Meta : un arrêt de l'API après l'insertion laisse un événement
 * `RECEIVED` que la tâche reprend. L'unicité de `metaMessageId` (index unique
 * partiel sur `kind = MESSAGE`) absorbe les renvois de Meta : un doublon n'est
 * ni réinséré ni retraité.
 *
 * Modèle GLOBAL (l'agence n'est pas encore connue) : l'expéditeur n'y figure
 * qu'en empreinte (`hashSender`) ; `payload`, copie TRANSITOIRE du message
 * (numéro compris), est effacé au traitement et au plus tard après 1 heure
 * (tâche). Les statuts de remise sont journalisés `STATUS` / `IGNORED`, sans
 * copie ni empreinte.
 */

/** Forme JSON de `payload` : un `InboundMessage` aux dates ISO. */
type SerializedInboundMessage = Omit<InboundMessage, 'receivedAt' | 'sentAt'> & {
  receivedAt: string;
  sentAt: string;
};

export function serializeInboundMessage(message: InboundMessage): Prisma.InputJsonValue {
  const serialized = {
    ...message,
    receivedAt: message.receivedAt.toISOString(),
    sentAt: message.sentAt.toISOString()
  } as SerializedInboundMessage;
  return serialized as unknown as Prisma.InputJsonValue;
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

/** Relit `payload` ; `null` s'il n'a pas la forme attendue (effacé, tronqué, ancien). */
export function deserializeInboundMessage(payload: unknown): InboundMessage | null {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const raw = payload as Record<string, unknown>;
  if (
    typeof raw.metaMessageId !== 'string' ||
    typeof raw.fromE164 !== 'string' ||
    !isDate(raw.receivedAt) ||
    !isDate(raw.sentAt) ||
    (raw.via !== 'META' && raw.via !== 'SIMULATOR')
  ) {
    return null;
  }
  const base = {
    metaMessageId: raw.metaMessageId,
    fromE164: raw.fromE164,
    receivedAt: new Date(raw.receivedAt),
    sentAt: new Date(raw.sentAt),
    via: raw.via
  } as const;
  switch (raw.kind) {
    case 'TEXT':
      return typeof raw.text === 'string' ? { ...base, kind: 'TEXT', text: raw.text } : null;
    case 'IMAGE': {
      const media = raw.media as Record<string, unknown> | null | undefined;
      if (!media || typeof media.mediaId !== 'string' || typeof media.mimeType !== 'string') return null;
      return {
        ...base,
        kind: 'IMAGE',
        media: {
          mediaId: media.mediaId,
          mimeType: media.mimeType,
          providerSha256: typeof media.providerSha256 === 'string' ? media.providerSha256 : null,
          caption: typeof media.caption === 'string' ? media.caption : null
        }
      };
    }
    case 'REPLY':
      if (typeof raw.replyId !== 'string' || typeof raw.replyTitle !== 'string') return null;
      return {
        ...base,
        kind: 'REPLY',
        replyId: raw.replyId,
        replyTitle: raw.replyTitle,
        contextMessageId: typeof raw.contextMessageId === 'string' ? raw.contextMessageId : null
      };
    case 'UNSUPPORTED':
      return typeof raw.originalType === 'string'
        ? { ...base, kind: 'UNSUPPORTED', originalType: raw.originalType }
        : null;
    default:
      return null;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Insère l'événement d'un message entrant. Rend son identifiant, ou `null`
 * si ce `metaMessageId` est déjà connu (renvoi de Meta, ou message du
 * simulateur rejoué). Toute autre erreur remonte (la route répond alors `500`
 * et Meta renverra l'événement).
 */
export async function recordInboundMessageEvent(event: ParsedInboundEvent): Promise<string | null> {
  const { message } = event;
  try {
    const created = await prisma.whatsappCloudEvent.create({
      data: {
        kind: 'MESSAGE',
        status: 'RECEIVED',
        metaMessageId: message.metaMessageId,
        senderHash: hashSender(message.fromE164),
        messageType: event.messageType.slice(0, 40),
        payload: serializeInboundMessage(message),
        via: message.via,
        receivedAt: message.receivedAt
      },
      select: { id: true }
    });
    return created.id;
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}

export type RecordedWebhook = {
  /** Événements nouveaux, dans l'ordre du corps, à traiter par `processWebhookEvent`. */
  eventIds: string[];
  duplicates: number;
  statuses: number;
};

/** Insère tous les événements d'un corps de webhook, messages puis statuts. */
export async function recordWebhookEvents(parsed: ParsedWebhookPayload, receivedAt: Date): Promise<RecordedWebhook> {
  const recorded: RecordedWebhook = { eventIds: [], duplicates: 0, statuses: 0 };
  for (const event of parsed.messages) {
    const id = await recordInboundMessageEvent(event);
    if (id) recorded.eventIds.push(id);
    else recorded.duplicates += 1;
  }
  if (parsed.statuses.length > 0) {
    await prisma.whatsappCloudEvent.createMany({
      data: parsed.statuses.map(status => ({
        kind: 'STATUS' as const,
        status: 'IGNORED' as const,
        metaMessageId: status.metaMessageId,
        deliveryStatus: status.deliveryStatus,
        via: 'META' as const,
        receivedAt,
        processedAt: receivedAt
      }))
    });
    recorded.statuses = parsed.statuses.length;
  }
  return recorded;
}
