import dayjs from 'dayjs';
import { ChargeScheduleAmountSource, ChargeScheduleFrequency, ChargeScheduleRun } from '../../../types/syndic-types';
import { dateFormat } from '../../../i18n/format';
import { t } from '../../../i18n/t';

/**
 * Onglet « Programmation » (lot S4, besoin 6) : appels de charges
 * automatiques. Contrat :
 * `packages/api/src/routes/syndic-charge-schedules-routes.ts`.
 */

export const frequencyLabels: Record<ChargeScheduleFrequency, string> = {
  MONTHLY: t('Mensuelle'),
  QUARTERLY: t('Trimestrielle'),
  SEMIANNUAL: t('Semestrielle'),
  ANNUAL: t('Annuelle')
};

export const amountSourceLabels: Record<ChargeScheduleAmountSource, string> = {
  BUDGET: t('Budget approuvé'),
  FIXED: t('Montant fixe')
};

export const runStatusConfig: Record<ChargeScheduleRun['status'], { color: string; label: string }> = {
  SUCCESS: { color: 'green', label: t('Réussie') },
  FAILED: { color: 'red', label: t('Échec') },
  SKIPPED: { color: 'default', label: t('Ignorée (déjà traitée)') }
};

export const runTriggerLabels: Record<ChargeScheduleRun['trigger'], string> = {
  CRON: t('Automatique'),
  MANUAL: t('Manuelle')
};

/**
 * L'API journalise deux refus d'émission sous forme de CODE brut (pas une
 * phrase) : agence suspendue, ou abonnement sans le module Syndic / en
 * lecture seule (audit sécurité, lot S4). Tout autre message d'erreur —
 * conflit 409, message technique générique — est déjà une phrase lisible et
 * s'affiche tel quel.
 */
const SCHEDULE_ERROR_CODE_LABELS: Record<string, string> = {
  TENANT_INACTIVE: t('Agence suspendue : réactivez-la avant de rejouer cette période avec « Exécuter maintenant ».'),
  SUBSCRIPTION_DENIED: t(
    'Abonnement sans module Syndic, ou en lecture seule : régularisez puis rejouez cette période avec « Exécuter maintenant ».'
  )
};

export function describeScheduleError(error: string | null | undefined): string | null {
  if (!error) return null;
  return SCHEDULE_ERROR_CODE_LABELS[error] ?? error;
}

export function formatDay(value: string | null | undefined): string {
  if (!value) return '—';
  return dayjs(value).format(dateFormat('short'));
}
