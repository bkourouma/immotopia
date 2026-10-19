import { prisma } from '../../utils/database';
import { logger } from '../../utils/logger';
import { classifyEmailError, RECEIPT_EMAIL_ERROR_MESSAGES, type ReceiptEmailErrorCode } from './email-error';
import { notifyChargeCallReminder } from './notifications';

/** Cause d'échec d'une relance : erreur d'envoi classée, ou motif pour lequel rien n'est parti. */
export type ReminderFailureCode =
  | ReceiptEmailErrorCode
  | 'NO_OWNER'
  | 'OWNER_NOT_CURRENT'
  | 'ALREADY_PAID'
  | 'NO_EMAIL'
  | 'NOTIFICATION_DISABLED'
  | 'REMINDER_NOT_FOUND';

/** Messages génériques, sûrs à afficher : le texte brut d'une erreur ne va qu'aux journaux. */
export const REMINDER_FAILURE_MESSAGES: Record<ReminderFailureCode, string> = {
  ...RECEIPT_EMAIL_ERROR_MESSAGES,
  NO_OWNER: 'Aucun copropriétaire rattaché au lot.',
  OWNER_NOT_CURRENT: "Le propriétaire du lot n'est plus le copropriétaire actuel.",
  ALREADY_PAID: "L'appel est déjà soldé.",
  NO_EMAIL: "Le copropriétaire n'a pas d'adresse e-mail.",
  NOTIFICATION_DISABLED: "La notification de relance est désactivée pour l'agence.",
  REMINDER_NOT_FOUND: 'Relance introuvable.'
};

export interface ReminderDeliveryResult {
  notificationFailed: boolean;
  failureCode?: ReminderFailureCode;
  failureMessage?: string;
}

/**
 * Envoie la notification d'une relance déjà enregistrée. Un échec d'envoi
 * (serveur mail, exception) ou une relance qui n'a pu partir nulle part (pas de
 * copropriétaire, pas d'e-mail…) ne fait pas perdre la relance : elle reste en
 * base, passe au statut `FAILED` avec sa cause (`failureCode`, `failureMessage`),
 * et l'appelant en est averti par le retour. Le message technique de l'erreur
 * (« 554 … ») va aux journaux seulement, jamais à la réponse HTTP.
 */
export async function deliverReminderNotification(
  reminderId: string,
  tenantId: string
): Promise<ReminderDeliveryResult> {
  let failureCode: ReminderFailureCode;
  try {
    const outcome = await notifyChargeCallReminder(reminderId);
    if (!outcome.skipped) return { notificationFailed: false };
    failureCode = outcome.skipped === 'NO_OWNER_CONTACT' ? 'NO_OWNER' : outcome.skipped;
    logger.warn('Reminder created but not sent', { reminderId, skipped: outcome.skipped });
  } catch (notifyError) {
    logger.warn('Reminder created but notification failed', { reminderId, notifyError });
    failureCode = classifyEmailError(notifyError);
  }

  const failureMessage = REMINDER_FAILURE_MESSAGES[failureCode];
  try {
    await prisma.paymentReminder.updateMany({
      where: { id: reminderId, chargeCall: { syndicate: { tenantId } } },
      data: { status: 'FAILED', failureCode, failureMessage }
    });
  } catch (updateError) {
    logger.warn('Reminder status could not be set to FAILED', { reminderId, updateError });
  }
  return { notificationFailed: true, failureCode, failureMessage };
}
