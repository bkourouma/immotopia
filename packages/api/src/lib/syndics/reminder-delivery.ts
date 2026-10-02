import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';
import { notifyChargeCallReminder } from './notifications';

/**
 * Envoie la notification d'une relance déjà enregistrée. Un échec d'envoi
 * (serveur mail, exception) ne fait pas perdre la relance : elle reste en
 * base, passe au statut `FAILED`, et l'appelant en est averti par le retour
 * (`notificationFailed`). Le message technique de l'erreur (« 554 … ») va aux
 * journaux seulement, jamais à la réponse HTTP.
 */
export async function deliverReminderNotification(
  reminderId: string,
  tenantId: string
): Promise<{ notificationFailed: boolean }> {
  try {
    await notifyChargeCallReminder(reminderId);
    return { notificationFailed: false };
  } catch (notifyError) {
    logger.warn('Reminder created but notification failed', { reminderId, notifyError });
    try {
      await prisma.paymentReminder.updateMany({
        where: { id: reminderId, chargeCall: { syndicate: { tenantId } } },
        data: { status: 'FAILED' }
      });
    } catch (updateError) {
      logger.warn('Reminder status could not be set to FAILED', { reminderId, updateError });
    }
    return { notificationFailed: true };
  }
}
