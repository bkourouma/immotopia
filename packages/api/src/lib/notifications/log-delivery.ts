/**
 * Enveloppe pour les envois EXISTANTS (e-mail, WhatsApp, SMS deja partis par
 * leur propre code) : on journalise sans rien changer a leur comportement.
 *
 * - La ligne PENDING est ecrite avant `run()` ; si l'ecriture echoue, `run()`
 *   part quand meme.
 * - L'erreur eventuelle de `run()` est relancee telle quelle, apres avoir note
 *   l'echec. Le retour de l'appelant ne change pas (il le capture par fermeture).
 * - Une erreur de journalisation n'atteint jamais l'appelant.
 */
import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';
import { describeError, describeFailure } from './describe-error';
import { normalizeLink } from './link';
import { redactEmailAddress } from './redact';
import { resolveRecipient } from './recipient';
import type { LogNotificationDeliveryInput } from './types';
import type { Prisma } from '@prisma/client';

export async function logNotificationDelivery(input: LogNotificationDeliveryInput): Promise<void> {
  let notificationId: string | null = null;
  let deliveryId: string | null = null;
  try {
    const r = await resolveRecipient(input.recipient, input.tenantId);
    const rawTarget = input.target ?? (input.channel === 'EMAIL' ? r.email : r.phone);
    // Adresse masquee (prelevements) : ni la cible ni un libelle qui est l'adresse ne sont ecrits en clair.
    const target =
      input.redactTarget && rawTarget && rawTarget.includes('@') ? redactEmailAddress(rawTarget) : rawTarget;
    const label = input.redactTarget && r.label.includes('@') ? redactEmailAddress(r.label) : r.label;
    // Jamais rejouable : on ne garde AUCUN contenu d'envoi, seulement le drapeau.
    const resendPayload =
      input.replayable === false || input.redactTarget ? { replayable: false } : (input.resendPayload ?? null);
    const created = await prisma.userNotification.create({
      data: {
        tenantId: input.tenantId,
        recipientUserId: r.userId,
        recipientContactId: r.contactId,
        recipientLabel: label,
        key: input.key,
        title: input.title,
        body: input.body,
        link: normalizeLink(input.link),
        status: 'PENDING',
        senderUserId: input.senderUserId ?? null,
        relatedEntityType: input.relatedEntity?.type ?? null,
        relatedEntityId: input.relatedEntity?.id ?? null,
        deliveries: {
          create: [
            {
              tenantId: input.tenantId,
              channel: input.channel,
              status: 'PENDING',
              target,
              ...(resendPayload ? { resendPayload: resendPayload as Prisma.InputJsonValue } : {})
            }
          ]
        }
      },
      select: { id: true, deliveries: { select: { id: true } } }
    });
    notificationId = created.id;
    deliveryId = created.deliveries[0]?.id ?? null;
  } catch (error) {
    logger.error('Journal de notification: ligne non ecrite, envoi poursuivi', {
      tenantId: input.tenantId,
      key: input.key,
      error: describeError(error)
    });
  }

  let status: 'SENT' | 'SKIPPED' | 'FAILED' = 'SENT';
  let failureReason: string | null = null;
  let providerMessageId: string | null = null;
  let thrown = false;
  let thrownError: unknown;
  try {
    const outcome = await input.run();
    if (outcome) {
      status = outcome.status;
      failureReason = outcome.failureReason ?? null;
      providerMessageId = outcome.providerMessageId ?? null;
    }
  } catch (error) {
    thrown = true;
    thrownError = error;
    status = 'FAILED';
    // Base : nom + code seulement. Le logger n'en recoit pas plus ici : l'erreur est relancee
    // a l'appelant, qui journalise son propre detail (un message de transport peut porter
    // un numero ou un code de signature).
    failureReason = describeFailure(error);
  }

  if (notificationId && deliveryId) {
    try {
      const now = new Date();
      await prisma.notificationDelivery.updateMany({
        where: { id: deliveryId, tenantId: input.tenantId },
        data: {
          status,
          failureReason,
          providerMessageId,
          attempts: { increment: 1 },
          lastAttemptAt: now,
          ...(status === 'SENT' ? { sentAt: now } : {})
        }
      });
      await prisma.userNotification.updateMany({
        where: { id: notificationId, tenantId: input.tenantId },
        data: { status, failureReason, ...(status === 'SENT' ? { sentAt: now } : {}) }
      });
    } catch (error) {
      logger.error('Journal de notification: statut non ecrit', { notificationId, error: describeError(error) });
    }
  }

  if (thrown) throw thrownError;
}
