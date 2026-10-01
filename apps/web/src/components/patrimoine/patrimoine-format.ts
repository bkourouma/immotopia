import { activeLocale } from '../../i18n/format';
import { t } from '../../i18n/t';

/**
 * Formateurs communs des écrans Patrimoine.
 *
 * Contrat de l'API : `grossYield`, `netYield`, `netNetYield` (bien, entité,
 * consolidation) sont déjà des POURCENTAGES — 4.44 veut dire 4,44 % — et non
 * des fractions. Ne jamais les multiplier par 100 (BUG-2026-09-30-035).
 * (`occupancyRate` et les taux d'hypothèse de projection, eux, sont des fractions.)
 */
export function formatYieldPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return (
    new Intl.NumberFormat(activeLocale(), {
      style: 'decimal',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value) + ' %'
  );
}

/** Date-heure ISO renvoyée par l'API, lisible ; la valeur brute si elle n'est pas une date. */
export function formatAsOf(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(activeLocale(), { dateStyle: 'long', timeStyle: 'short' }).format(date);
}

/** DSCR : ratio de couverture (1.25 = « 1,25 x »), tiret si indéterminé. */
export function formatDscr(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const valeur = new Intl.NumberFormat(activeLocale(), {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
  return t('{{valeur}} x', { valeur });
}
