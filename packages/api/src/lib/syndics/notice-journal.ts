/**
 * Aucune notification ne se perd : un avis d'appel de charges, une relance ou
 * un reçu laisse TOUJOURS une trace persistante pour son copropriétaire, même
 * quand le canal e-mail n'a rien tenté (SMTP absent, notification désactivée
 * par l'agence, pas d'adresse). L'envoi réel journalise déjà sa propre ligne
 * (`emailService.sendEmail({ journal })`, `sendWhatsappNotification`) ; ce module
 * n'écrit que le cas où AUCUN envoi n'a eu lieu : une ligne `SKIPPED` avec sa
 * raison, via le service central (`logNotificationDelivery`).
 *
 * Règles de sécurité : e-mails financiers non rejouables (`replayable: false`),
 * corps court et sans lien de paiement (il porte un jeton). Le destinataire
 * est le contact : s'il a un compte (même adresse e-mail dans l'agence), la
 * ligne apparaît dans sa cloche ; sinon elle est journalisée par contact.
 * Ne lève jamais.
 */
import { t } from '../../i18n';
import { logger } from '../../utils/logger';
import { logNotificationDelivery } from '../notifications/log-delivery';

export type NoticeSkipCause = 'EMAIL_NOT_CONFIGURED' | 'NOTIFICATION_DISABLED' | 'NO_EMAIL';

/** Raison lisible (texte français = clé de traduction) d'un avis non envoyé. */
export function noticeSkipReason(cause: NoticeSkipCause): string {
  switch (cause) {
    case 'EMAIL_NOT_CONFIGURED':
      return t('Canal indisponible : aucun service e-mail n’est configuré sur le serveur.');
    case 'NOTIFICATION_DISABLED':
      return t('Canal indisponible : l’envoi par e-mail est désactivé pour cette agence.');
    default:
      return t('Aucune adresse e-mail pour ce copropriétaire.');
  }
}

export interface JournalSkippedNoticeInput {
  tenantId: string;
  /** Clé métier (ex. CHARGE_CALL_ISSUED). */
  key: string;
  title: string;
  body: string;
  contactId: string;
  email?: string | null;
  relatedEntity: { type: string; id: string };
  cause: NoticeSkipCause;
}

export async function journalSkippedNotice(input: JournalSkippedNoticeInput): Promise<void> {
  try {
    await logNotificationDelivery({
      tenantId: input.tenantId,
      recipient: { contactId: input.contactId, ...(input.email?.trim() ? { email: input.email.trim() } : {}) },
      key: input.key,
      title: input.title,
      body: input.body,
      channel: 'EMAIL',
      replayable: false,
      relatedEntity: input.relatedEntity,
      run: async () => ({ status: 'SKIPPED', failureReason: noticeSkipReason(input.cause) })
    });
  } catch (error) {
    logger.error('Journal des avis de charges: ligne non écrite', {
      tenantId: input.tenantId,
      key: input.key,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
