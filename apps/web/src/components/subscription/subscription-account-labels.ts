import type { CapacityKeyCode } from '../../services/subscription-v2-service';
import type { StatusTone } from '../primitives';
import { activeLocale } from '../../i18n/format';
import { t } from '../../i18n/t';

/**
 * Libellés et formats communs aux onglets de « Abonnement et factures ».
 * Des fonctions et non des constantes : un `t()` évalué à l'import resterait
 * figé dans la langue active à ce moment-là.
 */

export function capacityLabel(key: CapacityKeyCode): string {
  const labels: Record<CapacityKeyCode, string> = {
    LOTS: t('Lots'),
    COPROPRIETES: t('Copropriétés'),
    CHANTIERS: t('Chantiers'),
    BIENS_DETENUS: t('Biens détenus'),
    ACTIFS: t('Actifs'),
    PHOTOS_INVENTAIRE: t('Photos d’inventaire analysées (par mois)'),
    SIGNATURES_MENSUELLES: t('Signatures électroniques (par mois)')
  };
  return labels[key] ?? key;
}

export function moduleLabel(key: string): string {
  const labels: Record<string, string> = {
    MODULE_AGENCY: t('Agence'),
    MODULE_SYNDIC: t('Syndic'),
    MODULE_PROMOTER: t('Promoteur'),
    MODULE_PATRIMOINE: t('Patrimoine')
  };
  return labels[key] ?? key;
}

export function phaseInfo(phase: string): { label: string; tone: StatusTone } {
  const labels: Record<string, { label: string; tone: StatusTone }> = {
    TRIAL: { label: t('Essai'), tone: 'info' },
    ACTIVE: { label: t('Actif'), tone: 'success' },
    GRACE: { label: t('Grâce'), tone: 'warning' },
    READ_ONLY: { label: t('Lecture seule'), tone: 'danger' }
  };
  return labels[phase] ?? { label: t('Aucun abonnement'), tone: 'neutral' };
}

export function formatLongDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(activeLocale(), { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Message d'une erreur d'API, sinon le repli donné. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof message === 'string' && message ? message : fallback;
}

/** Capacités apportées, en une ligne (« 10 Lots, 1 Chantiers »). */
export function capacitiesSummary(capacities: Partial<Record<CapacityKeyCode, number>>): string {
  return (Object.entries(capacities) as [CapacityKeyCode, number][])
    .filter(([, value]) => value > 0)
    .map(([key, value]) => `${value.toLocaleString(activeLocale())} ${capacityLabel(key)}`)
    .join(', ');
}
