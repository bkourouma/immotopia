/**
 * Relance des canaux en echec d'une notification. Ne rejoue QUE les FAILED
 * (et les PENDING perimes depuis plus de 5 minutes ; jamais un envoi parti, ni un envoi volontairement ignore).
 *
 * Garde-fous (audit de securite du lot) :
 *  - une livraison marquee `replayable: false` (message de signature, adresse
 *    masquee, variables sensibles) n'est jamais rejouee ;
 *  - le consentement du canal est revalide pour un contact CRM, et les SMS
 *    repassent par les gardes SMS de signature (indicatif, numero du contact,
 *    plafond) ; un SMS sans contact CRM n'est pas rejouable ;
 *  - verrou anti double envoi : FAILED -> PENDING en un `updateMany` conditionnel,
 *    rejoue seulement si une ligne a bien ete prise ;
 *  - un message prive (MESSAGE_RECEIVED) n'est ni listable ni renvoyable ici.
 */
import { prisma } from '../../utils/database';
import { t } from '../../i18n';
import { NotFoundError } from '../../middleware/error-middleware';
import { aggregateStatus, sendOnChannel } from './deliver';
import { MESSAGE_NOTIFICATION_KEY } from './keys';
import { getAdminNotification } from './queries';
import { replayRefusal } from './replay-guards';
import type { AdminNotificationDetail, NotificationChannelKey, ResendPayload } from './types';

const STALE_PENDING_MS = 5 * 60 * 1000;

export async function resendNotification(input: {
  tenantId: string;
  notificationId: string;
  channels?: NotificationChannelKey[];
}): Promise<AdminNotificationDetail> {
  const { tenantId, notificationId } = input;
  // Meme erreur qu'une notification inexistante quand elle est d'une autre agence
  // ou quand c'est un message prive.
  const notification = await prisma.userNotification.findFirst({
    where: { id: notificationId, tenantId, key: { not: MESSAGE_NOTIFICATION_KEY } },
    select: {
      id: true,
      key: true,
      title: true,
      body: true,
      link: true,
      recipientUserId: true,
      recipientContactId: true,
      deliveries: {
        where: { tenantId },
        select: {
          id: true,
          channel: true,
          status: true,
          target: true,
          failureReason: true,
          resendPayload: true,
          lastAttemptAt: true,
          updatedAt: true,
          createdAt: true
        }
      }
    }
  });
  if (!notification) throw new NotFoundError(t('Notification introuvable.'));

  const wanted = input.channels?.length ? new Set<string>(input.channels) : null;
  const state = notification.deliveries.map(d => ({
    id: d.id,
    channel: d.channel,
    status: d.status as string,
    failureReason: d.failureReason
  }));

  const staleBefore = new Date(Date.now() - STALE_PENDING_MS);
  for (const delivery of notification.deliveries) {
    // Une livraison PENDING depuis plus de 5 minutes (envoi interrompu) vaut FAILED rejouable.
    const lastActivity = delivery.lastAttemptAt ?? delivery.updatedAt ?? delivery.createdAt;
    const stalePending = delivery.status === 'PENDING' && lastActivity < staleBefore;
    if (delivery.status !== 'FAILED' && !stalePending) continue;
    const previousStatus = delivery.status;
    if (wanted && !wanted.has(delivery.channel)) continue;
    const entry = state.find(s => s.id === delivery.id);
    const payload = (delivery.resendPayload as ResendPayload | null) ?? null;

    const refusal = await replayRefusal({
      tenantId,
      channel: delivery.channel,
      target: delivery.target,
      payload,
      recipientContactId: notification.recipientContactId,
      recipientUserId: notification.recipientUserId,
      notificationKey: notification.key
    });
    if (refusal) {
      // Reste FAILED : on explique seulement pourquoi.
      await prisma.notificationDelivery.updateMany({
        where: { id: delivery.id, tenantId, status: previousStatus },
        data: { status: 'FAILED', failureReason: refusal }
      });
      if (entry) {
        entry.status = 'FAILED';
        entry.failureReason = refusal;
      }
      continue;
    }

    // Verrou anti double envoi : deux renvois simultanes ne rejouent pas deux fois.
    // Condition sur l'ancien etat (et, pour un PENDING perime, sur son anciennete).
    const lock = await prisma.notificationDelivery.updateMany({
      where: {
        id: delivery.id,
        tenantId,
        status: previousStatus,
        ...(stalePending ? { updatedAt: { lt: staleBefore } } : {})
      },
      data: { status: 'PENDING' }
    });
    if (lock.count !== 1) continue;

    const outcome = await sendOnChannel(delivery.channel, {
      tenantId,
      title: notification.title,
      body: notification.body,
      link: notification.link,
      target: delivery.target,
      payload
    });
    // Un envoi impossible a rejouer reste en echec : on ne le masque pas en SKIPPED.
    const replayable = outcome.status !== 'SKIPPED';
    const status = replayable ? outcome.status : 'FAILED';
    const failureReason = replayable
      ? (outcome.failureReason ?? null)
      : `Relance impossible : ${outcome.failureReason ?? 'envoi non rejouable'}`;
    const now = new Date();
    await prisma.notificationDelivery.updateMany({
      where: { id: delivery.id, tenantId },
      data: {
        status,
        failureReason,
        providerMessageId: outcome.providerMessageId ?? null,
        attempts: { increment: 1 },
        lastAttemptAt: now,
        ...(status === 'SENT' ? { sentAt: now } : {})
      }
    });
    if (entry) {
      entry.status = status;
      entry.failureReason = failureReason;
    }
  }

  const agg = aggregateStatus(state);
  await prisma.userNotification.updateMany({
    where: { id: notificationId, tenantId },
    data: {
      status: agg.status,
      failureReason: agg.failureReason,
      ...(agg.status === 'SENT' ? { sentAt: new Date() } : {})
    }
  });
  return getAdminNotification(tenantId, notificationId);
}
