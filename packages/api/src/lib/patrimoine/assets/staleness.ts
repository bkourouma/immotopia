/**
 * Péremption des valeurs par classe d'actif (lot 2, spec 024).
 *
 * Un solde de compte vieillit vite, un terrain lentement : le seuil est en
 * mois et propre à la classe. Constantes nommées, ajustables sans migration.
 */

import type { AssetClassKey } from './asset-classes';

export const STALENESS_MONTHS: Record<AssetClassKey, number> = {
  CASH: 3,
  INVENTORY: 3,
  SAVINGS_INVESTMENT: 6,
  RECEIVABLE: 6,
  AGRICULTURE: 6,
  VEHICLE_EQUIPMENT: 12,
  BUSINESS_EQUITY: 12,
  REAL_ESTATE: 24,
  MOVABLE: 24,
  OTHER: 12
};

const DAYS_PER_MONTH = 365.25 / 12;
const MS_PER_DAY = 86_400_000;

/** Mois écoulés (fractionnaires) entre deux dates, mois moyen de 30,4375 jours ; négatif si `to` précède `from`. */
export function monthsBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_DAY / DAYS_PER_MONTH;
}

/** Sans valorisation, la valeur est périmée : rien n'atteste qu'elle soit à jour. */
export function isStale(assetClass: AssetClassKey, valuatedAt: Date | null, asOf: Date): boolean {
  if (valuatedAt === null) return true;
  return monthsBetween(valuatedAt, asOf) > STALENESS_MONTHS[assetClass];
}
