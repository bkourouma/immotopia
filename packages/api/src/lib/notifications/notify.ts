/**
 * Service central : ecrit la notification D'ABORD, puis tente les canaux.
 * `notify` ne leve jamais ; l'echec d'un canal met sa delivery en FAILED
 * (avec la raison) et n'annule rien.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';
import { aggregateStatus, describeError, sendOnChannel } from './deliver';
import { normalizeLink } from './link';
import { isReplayableVariables } from './replayable';
import { resolveRecipient, type ResolvedRecipient } from './recipient';
import type { NotificationChannelKey, NotificationStatusKey, NotifyInput, ResendPayload } from './types';

export interface NotifyResult {
  notifications: Array<{ id: string; recipientLabel: string; status: NotificationStatusKey }>;
}

function targetFor(channel: NotificationChannelKey, r: ResolvedRecipient): string | null {
  if (channel === 'EMAIL') return r.email;
  if (channel === 'WHATSAPP' || channel === 'SMS') return r.phone;
  return null;
}

/** Ce qui sert a l'envoi immediat (jamais stocke tel quel). */
function sendPayloadFor(
  channel: NotificationChannelKey,
  input: NotifyInput,
  r: ResolvedRecipient
): ResendPayload | null {
  if (channel !== 'WHATSAPP') return null;
  return {
    ...(input.whatsapp ? { whatsapp: input.whatsapp } : {}),
    ...(r.contactId ? { contactId: r.contactId } : {})
  };
}

/** Ce qui est conserve pour rejouer : liste blanche des variables du gabarit, sinon non rejouable. */
function payloadFor(channel: NotificationChannelKey, input: NotifyInput, r: ResolvedRecipient): ResendPayload | null {
  if (channel !== 'WHATSAPP') return null;
  if (input.whatsapp && !isReplayableVariables(input.whatsapp.variables, input.whatsapp.notificationKey)) {
    return { replayable: false };
  }
  return sendPayloadFor(channel, input, r);
}

/** Une notification pour un destinataire. Peut lever : l'appelant (notify) rattrape. */
async function notifyOne(input: NotifyInput, channels: NotificationChannelKey[], r: ResolvedRecipient) {
  const now = new Date();
  // Lien ramene a son chemin relatif ; un lien vers une autre origine est supprime.
  const link = normalizeLink(input.link);
  const deliveries: Prisma.NotificationDeliveryUncheckedCreateWithoutNotificationInput[] = channels.map(channel => {
    const target = targetFor(channel, r);
    const base = { tenantId: input.tenantId, channel, target };
    if (channel === 'IN_APP') {
      // L'ecriture EST la remise ; sans compte, personne ne verra la cloche.
      return r.userId
        ? { ...base, status: 'SENT', attempts: 1, lastAttemptAt: now, sentAt: now }
        : { ...base, status: 'SKIPPED', failureReason: 'Destinataire sans compte : pas de boite de reception.' };
    }
    const payload = payloadFor(channel, input, r);
    return { ...base, status: 'PENDING', ...(payload ? { resendPayload: payload as Prisma.InputJsonValue } : {}) };
  });

  // 1. Persist-first : la notification existe avant tout envoi.
  const created = await prisma.userNotification.create({
    data: {
      tenantId: input.tenantId,
      recipientUserId: r.userId,
      recipientContactId: r.contactId,
      recipientLabel: r.label,
      key: input.key,
      title: input.title,
      body: input.body,
      link,
      status: 'PENDING',
      senderUserId: input.senderUserId ?? null,
      relatedEntityType: input.relatedEntity?.type ?? null,
      relatedEntityId: input.relatedEntity?.id ?? null,
      ...(input.metadata ? { metadata: input.metadata as Prisma.InputJsonValue } : {}),
      deliveries: { create: deliveries }
    },
    select: { id: true, deliveries: { select: { id: true, channel: true, status: true, failureReason: true } } }
  });

  // 2. Canaux externes, un par un ; chaque mise a jour de journal est isolee.
  const state = created.deliveries.map(d => ({ ...d }));
  for (const delivery of state) {
    if (delivery.channel === 'IN_APP' || delivery.status !== 'PENDING') continue;
    const outcome = await sendOnChannel(delivery.channel, {
      tenantId: input.tenantId,
      title: input.title,
      body: input.body,
      link,
      target: targetFor(delivery.channel, r),
      payload: sendPayloadFor(delivery.channel, input, r)
    });
    delivery.status = outcome.status;
    delivery.failureReason = outcome.failureReason ?? null;
    try {
      await prisma.notificationDelivery.updateMany({
        where: { id: delivery.id, tenantId: input.tenantId },
        data: {
          status: outcome.status,
          failureReason: outcome.failureReason ?? null,
          providerMessageId: outcome.providerMessageId ?? null,
          attempts: { increment: 1 },
          lastAttemptAt: new Date(),
          ...(outcome.status === 'SENT' ? { sentAt: new Date() } : {})
        }
      });
    } catch (error) {
      logger.error('Notification: journal de canal non ecrit', {
        tenantId: input.tenantId,
        notificationId: created.id,
        channel: delivery.channel,
        error: describeError(error)
      });
    }
  }

  // 3. Statut agregat.
  const agg = aggregateStatus(state);
  try {
    await prisma.userNotification.updateMany({
      where: { id: created.id, tenantId: input.tenantId },
      data: {
        status: agg.status,
        failureReason: agg.failureReason,
        ...(agg.status === 'SENT' ? { sentAt: new Date() } : {})
      }
    });
  } catch (error) {
    logger.error('Notification: statut agrege non ecrit', { notificationId: created.id, error: describeError(error) });
  }
  return { id: created.id, recipientLabel: r.label, status: agg.status };
}

/** Envoie une notification a chaque destinataire. Ne leve JAMAIS. */
export async function notify(input: NotifyInput): Promise<NotifyResult> {
  const result: NotifyResult = { notifications: [] };
  try {
    const channels = input.channels?.length ? [...new Set(input.channels)] : (['IN_APP'] as NotificationChannelKey[]);
    for (const recipient of input.recipients ?? []) {
      try {
        const resolved = await resolveRecipient(recipient);
        result.notifications.push(await notifyOne(input, channels, resolved));
      } catch (error) {
        // La base est injoignable pour ce destinataire : on le consigne, sans bloquer l'appelant.
        logger.error('Notification: destinataire non traite', {
          tenantId: input.tenantId,
          key: input.key,
          error: describeError(error)
        });
      }
    }
  } catch (error) {
    logger.error('Notification: echec inattendu', { key: input.key, error: describeError(error) });
  }
  return result;
}
