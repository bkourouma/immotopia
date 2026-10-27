import { t } from '../../i18n/t';

/** Libellé lisible de la cause d'échec d'une relance ; code inconnu : message brut ou code. */
export function reminderFailureLabel(code: string | null | undefined, fallbackMessage?: string | null): string {
  switch (code) {
    case 'SMTP_REJECTED':
      return t('Le serveur de messagerie a refusé l’e-mail');
    case 'TIMEOUT':
      return t('Délai dépassé : le serveur de messagerie n’a pas répondu');
    case 'ERROR':
      return t('Erreur d’envoi');
    case 'NO_OWNER':
      return t('Aucun copropriétaire rattaché au lot');
    case 'OWNER_NOT_CURRENT':
      return t('Le propriétaire du lot n’est plus le copropriétaire actuel');
    case 'ALREADY_PAID':
      return t('L’appel est déjà soldé');
    case 'NO_EMAIL':
      return t('Le copropriétaire n’a pas d’adresse e-mail');
    case 'NOTIFICATION_DISABLED':
      return t('La notification de relance est désactivée pour l’agence');
    case 'REMINDER_NOT_FOUND':
      return t('Relance introuvable');
    default:
      return fallbackMessage || code || '';
  }
}

/** Motif pour lequel un appel est écarté des relances groupées. */
export function reminderExclusionLabel(reason: string | null | undefined, fallbackLabel?: string | null): string {
  switch (reason) {
    case 'PAYMENT_PLAN_ACTIVE':
      return t('Plan de paiement actif');
    case 'REMINDER_TOO_RECENT':
      return t('Relance trop récente');
    case 'DECLARED_PAYMENT_PENDING':
      return t('Paiement déclaré en cours de vérification');
    default:
      return fallbackLabel || reason || '';
  }
}
