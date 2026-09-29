import type { AssetClass, NetWorthExclusionReason, NetWorthResult } from '../../../services/patrimoine-assets-service';

export interface ClassBreakdownRow {
  assetClass: AssetClass;
  value: number;
  count: number;
  /** Part du total des actifs, en fraction (0..1), recalculée depuis les valeurs. */
  share: number;
}

/**
 * Répartition affichée : on recalcule la part depuis `value / totalAssets`
 * plutôt que de relire `share` (fraction ou points, le contrat ne le dit pas).
 * Les classes sans valeur sont écartées, l'ordre est décroissant en valeur.
 */
export function computeClassBreakdown(result: Pick<NetWorthResult, 'byClass' | 'totalAssets'>): ClassBreakdownRow[] {
  const total = result.byClass.reduce((sum, row) => sum + Math.max(0, row.value), 0) || result.totalAssets;
  return result.byClass
    .filter(row => row.value > 0 || row.count > 0)
    .map(row => ({
      assetClass: row.assetClass,
      value: row.value,
      count: row.count,
      share: total > 0 ? Math.max(0, row.value) / total : 0
    }))
    .sort((a, b) => b.value - a.value);
}

/** Raisons d'exclusion à signaler : un actif cédé ou archivé volontairement n'est pas une anomalie. */
const ANOMALY_REASONS: ReadonlyArray<NetWorthExclusionReason> = ['NO_VALUATION', 'MISSING_EXCHANGE_RATE'];

/** Actifs exclus du total par anomalie (sans valeur, taux de change manquant). */
export function anomalousExclusions(result: Pick<NetWorthResult, 'excluded'>): NetWorthResult['excluded'] {
  return result.excluded.filter(item => ANOMALY_REASONS.includes(item.reason));
}

/** Nouvel utilisateur : rien de compté et rien d'exclu, donc rien à afficher qu'un état vide. */
export function isNetWorthEmpty(result: NetWorthResult): boolean {
  return (
    result.assets.length === 0 &&
    result.excluded.length === 0 &&
    result.totalDebts === 0 &&
    result.totalAssets === 0 &&
    result.byClass.every(row => row.count === 0)
  );
}

/** `YYYY-MM-DD` d'il y a `months` mois, pour la fenêtre par défaut de la courbe. */
export function monthsAgoIso(months: number, now: Date = new Date()): string {
  const date = new Date(now);
  date.setMonth(date.getMonth() - months);
  return date.toISOString().slice(0, 10);
}
