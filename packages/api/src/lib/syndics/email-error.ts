/**
 * Classement neutre des erreurs d'envoi d'e-mail (nodemailer), partagé par les
 * quittances, les avis d'appel, la programmation et les relances. Le texte brut
 * de l'erreur ne va qu'aux journaux : seul le code et un message générique sont
 * stockés et affichés.
 */

export type ReceiptEmailErrorCode = 'SMTP_REJECTED' | 'TIMEOUT' | 'ERROR';

/** Message générique stocké et affiché ; l'erreur brute ne va qu'aux journaux. */
export const RECEIPT_EMAIL_ERROR_MESSAGES: Record<ReceiptEmailErrorCode, string> = {
  SMTP_REJECTED: "Le serveur de messagerie a refusé l'e-mail.",
  TIMEOUT: "Le serveur de messagerie n'a pas répondu à temps.",
  ERROR: "L'envoi de l'e-mail a échoué."
};

/** Classe une erreur d'envoi (nodemailer) sans en conserver le texte. */
export function classifyEmailError(error: unknown): ReceiptEmailErrorCode {
  const detail = (error ?? {}) as { code?: unknown; responseCode?: unknown };
  const code = typeof detail.code === 'string' ? detail.code : '';
  const responseCode = typeof detail.responseCode === 'number' ? detail.responseCode : 0;
  if (['ETIMEDOUT', 'ETIMEOUT', 'ESOCKETTIMEDOUT', 'ECONNRESET', 'ECONNECTION'].includes(code)) return 'TIMEOUT';
  if (responseCode >= 500 || ['EENVELOPE', 'EMESSAGE', 'EAUTH'].includes(code)) return 'SMTP_REJECTED';
  return 'ERROR';
}
