import { activeLocale } from '../../i18n/format';
import { t } from '../../i18n/t';
import type { InsuranceClaimStatus } from '../../types/insurance-types';

/**
 * Libellés et formateurs des écrans assurances, sinistres et carnet
 * d'entretien. Les valeurs sont les énumérations de l'API (contrat 032).
 */

export const COVERAGE_VALUES = ['MULTIRISK_HOME', 'MULTIRISK_BUILDING', 'OWNER_LIABILITY', 'OTHER'] as const;
export const CAUSE_VALUES = ['WATER_DAMAGE', 'FIRE', 'THEFT', 'STRUCTURAL', 'STORM', 'OTHER'] as const;
export const DOC_KIND_VALUES = [
  'PHOTO_BEFORE',
  'PHOTO_AFTER',
  'QUOTE',
  'EXPERT_REPORT',
  'INSURER_LETTER',
  'INVOICE'
] as const;
export const LOG_CATEGORY_VALUES = [
  'PLUMBING',
  'ELECTRICAL',
  'AIR_CONDITIONING',
  'GENERATOR',
  'ROOF_WATERPROOFING',
  'PAINTING',
  'OTHER'
] as const;

export const CLAIM_STATUS_VALUES: InsuranceClaimStatus[] = [
  'DECLARED',
  'INSURER_NOTIFIED',
  'EXPERTISE',
  'SETTLED',
  'REJECTED',
  'CLOSED'
];

/** Parcours nominal d'un sinistre (le rejet remplace « Indemnisé »). */
export const CLAIM_FLOW: InsuranceClaimStatus[] = ['DECLARED', 'INSURER_NOTIFIED', 'EXPERTISE', 'SETTLED', 'CLOSED'];

export function policyStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    UPCOMING: t('À venir'),
    ACTIVE: t('Active'),
    EXPIRING_SOON: t('Expire bientôt'),
    EXPIRED: t('Expirée')
  };
  return labels[status] ?? status;
}

export function policyStatusColor(status: string): string {
  return { UPCOMING: 'blue', ACTIVE: 'green', EXPIRING_SOON: 'orange', EXPIRED: 'red' }[status] ?? 'default';
}

export function claimStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    DECLARED: t('Déclaré'),
    INSURER_NOTIFIED: t('Assureur prévenu'),
    EXPERTISE: t('Expertise'),
    SETTLED: t('Indemnisé'),
    REJECTED: t('Rejeté'),
    CLOSED: t('Clos')
  };
  return labels[status] ?? status;
}

export function claimStatusColor(status: string): string {
  return (
    { DECLARED: 'blue', INSURER_NOTIFIED: 'geekblue', EXPERTISE: 'purple', SETTLED: 'green', REJECTED: 'red' }[
      status
    ] ?? 'default'
  );
}

export function coverageLabel(value: string): string {
  const labels: Record<string, string> = {
    MULTIRISK_HOME: t('Multirisque habitation'),
    MULTIRISK_BUILDING: t('Multirisque immeuble'),
    OWNER_LIABILITY: t('Responsabilité du propriétaire'),
    OTHER: t('Autre')
  };
  return labels[value] ?? value;
}

export function causeLabel(value: string): string {
  const labels: Record<string, string> = {
    WATER_DAMAGE: t('Dégât des eaux'),
    FIRE: t('Incendie'),
    THEFT: t('Vol'),
    STRUCTURAL: t('Dommage structurel'),
    STORM: t('Tempête'),
    OTHER: t('Autre')
  };
  return labels[value] ?? value;
}

export function docKindLabel(value: string): string {
  const labels: Record<string, string> = {
    PHOTO_BEFORE: t('Photo avant'),
    PHOTO_AFTER: t('Photo après'),
    QUOTE: t('Devis'),
    EXPERT_REPORT: t("Rapport d'expertise"),
    INSURER_LETTER: t("Courrier de l'assureur"),
    INVOICE: t('Facture')
  };
  return labels[value] ?? value;
}

export function logCategoryLabel(value: string): string {
  const labels: Record<string, string> = {
    PLUMBING: t('Plomberie'),
    ELECTRICAL: t('Électricité'),
    AIR_CONDITIONING: t('Climatisation'),
    GENERATOR: t('Groupe électrogène'),
    ROOF_WATERPROOFING: t('Toiture et étanchéité'),
    PAINTING: t('Peinture'),
    OTHER: t('Autre')
  };
  return labels[value] ?? value;
}

export function options(values: readonly string[], label: (v: string) => string) {
  return values.map(value => ({ value, label: label(value) }));
}

/** Devise affichée : « FCFA » pour le franc CFA (XOF), sinon le code ISO. */
export function currencyLabel(currency: string | null | undefined): string {
  return !currency || currency === 'XOF' ? 'FCFA' : currency;
}

/** Montant lisible ; tiret si absent. Seul formateur de montant du module. */
export function formatAmount(value: number | null | undefined, currency = 'XOF'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const nombre = new Intl.NumberFormat(activeLocale(), { maximumFractionDigits: 0 }).format(value);
  return `${nombre} ${currencyLabel(currency)}`;
}

/** Date (jour) lisible ; tiret si absente. */
export function formatDay(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(activeLocale(), { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

/** Date et heure lisibles. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(activeLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
