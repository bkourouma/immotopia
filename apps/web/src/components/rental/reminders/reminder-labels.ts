import type {
  RentalReminderChannel,
  RentalReminderExclusionReason,
  RentalReminderLevel,
  RentalReminderStatus
} from '../../../types/rental-payment-reminder';
import { t } from '../../../i18n/t';

/** Plafond de lignes cochables dans une relance par lot (brief : 200). */
export const REMINDER_BATCH_MAX = 200;
/** Le contrat n'accepte que 1 à 100 échéances par appel : au-delà, la sélection part en tranches séquentielles. */
export const REMINDER_BATCH_CHUNK = 100;

export function reminderChannelLabel(channel: RentalReminderChannel): string {
  return channel === 'WHATSAPP' ? t('WhatsApp') : t('E-mail');
}

export function reminderLevelLabel(level: number | null | undefined): string {
  switch (level) {
    case 1:
      return t('Niveau 1 · rappel amiable');
    case 2:
      return t('Niveau 2 · relance ferme');
    case 3:
      return t('Niveau 3 · dernier avis');
    default:
      return level ? t('Niveau {{level}}', { level }) : '-';
  }
}

export function reminderStatusLabel(status: RentalReminderStatus): string {
  switch (status) {
    case 'SENT':
      return t('Envoyée');
    case 'DELIVERED':
      return t('Remise');
    case 'FAILED':
      return t('Échec');
    default:
      return status;
  }
}

export function reminderExclusionText(reason: RentalReminderExclusionReason | string | null | undefined): string {
  switch (reason) {
    case 'ALREADY_PAID':
      return t('Échéance déjà soldée');
    case 'PENDING_DECLARATION':
      return t('Paiement déclaré en cours de vérification');
    case 'PENDING_ONLINE_ATTEMPT':
      return t('Paiement en ligne en cours');
    case 'TOO_SOON':
      return t('Relance trop récente (7 jours minimum entre deux niveaux)');
    case 'MAX_LEVEL_REACHED':
      return t('Les trois niveaux ont déjà été envoyés');
    case 'NO_CURRENT_TENANT':
      return t('Aucun locataire actuel sur le bail');
    case 'LEASE_NOT_ACTIVE':
      return t("Le bail n'est pas actif");
    case 'NO_CONTACT_CHANNEL':
      return t('Aucun e-mail ni WhatsApp utilisable');
    case 'EVENT_DISABLED':
      return t("Cette notification est désactivée dans la configuration de l'agence");
    case 'NOT_DUE_YET':
      return t("L'échéance n'est pas encore dans la fenêtre de relance");
    default:
      return reason ? String(reason) : '';
  }
}

/** Code technique d'échec d'envoi : message brut si inconnu. */
export function reminderFailureText(code: string | null | undefined): string {
  if (!code) return t("L'envoi a échoué");
  return t("L'envoi a échoué ({{code}})", { code });
}

export function asReminderLevel(level: number | null | undefined): RentalReminderLevel | null {
  return level === 1 || level === 2 || level === 3 ? level : null;
}
