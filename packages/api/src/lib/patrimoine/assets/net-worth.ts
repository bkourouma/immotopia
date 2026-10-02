/**
 * Valeur nette d'un patrimoine multi-actifs (lot 1, FR-005 à FR-007).
 *
 * Fonctions pures, sans Prisma : les montants arrivent en `number` (la couche
 * service convertit les `Decimal`) et ressortent en XOF, arrondis au franc par
 * `roundMoneyXof`.
 *
 * Règles retenues :
 *
 * - **Valeur courante d'un actif** = sa dernière valorisation à la date de
 *   calcul, convertie en XOF avec le taux saisi sur l'actif.
 * - **Actifs comptés** : `ACTIVE`, plus les `DISPOSED` dont la sortie est
 *   postérieure à la date de calcul (ils étaient encore détenus).
 * - **Actifs exclus, et signalés** : archivés, cédés avant la date, sans
 *   valorisation à la date, ou en devise étrangère sans taux exploitable.
 *   Mieux vaut un actif signalé qu'une valeur inventée.
 * - **Dettes** = capital restant dû des prêts `ACTIVE`, adossés ou non. Un prêt
 *   adossé à un actif exclu reste compté : la dette existe toujours.
 * - **Valeur nette** = actifs - dettes, sans plancher : une valeur négative
 *   est affichée telle quelle.
 */

import { roundMoneyXof, roundPercent } from '../../finance/money';
import { ASSET_CLASSES, type AssetClassKey } from './asset-classes';
import type { Reliability } from './reliability';
import { isStale } from './staleness';

const BASE_CURRENCY = 'XOF';

export type NetWorthAssetStatus = 'ACTIVE' | 'DISPOSED' | 'ARCHIVED';
export type NetWorthLoanStatus = 'ACTIVE' | 'CLOSED' | 'DEFAULTED';
export type NetWorthAssetExclusionReason = 'NO_VALUATION' | 'MISSING_EXCHANGE_RATE' | 'DISPOSED' | 'ARCHIVED';

export interface NetWorthValuationInput {
  valuatedAt: Date;
  estimatedValue: number;
  currency: string;
  /** Fiabilité de la valorisation ; absente ou nulle (antérieure au lot 2) : comptée comme peu fiable. */
  reliability?: Reliability | null;
}

export interface NetWorthAssetInput {
  id: string;
  name: string;
  assetClass: AssetClassKey;
  status: NetWorthAssetStatus;
  currency: string;
  exchangeRateToXof: number | null;
  disposedAt: Date | null;
  valuations: NetWorthValuationInput[];
}

export interface NetWorthLoanInput {
  id: string;
  /** Nul : dette personnelle non adossée. */
  assetId: string | null;
  remainingCapital: number;
  currency: string;
  status: NetWorthLoanStatus;
  exchangeRateToXof: number | null;
}

export interface NetWorthClassBreakdown {
  assetClass: AssetClassKey;
  value: number;
  count: number;
  /** Part de la valeur totale des actifs, de 0 à 100 sur deux décimales ; 0 si le total est nul. */
  share: number;
}

export interface NetWorthResult {
  currency: 'XOF';
  asOf: Date;
  totalAssets: number;
  totalDebts: number;
  netWorth: number;
  /** Part de `totalAssets` reposant sur des valeurs de fiabilité LOW ou inconnue, de 0 à 100 ; 0 si le total est nul. */
  lowReliabilityShare: number;
  byClass: NetWorthClassBreakdown[];
  assets: { id: string; valueXof: number; valuatedAt: Date; reliability: Reliability | null; stale: boolean }[];
  excluded: { assetId: string; reason: NetWorthAssetExclusionReason }[];
  excludedLoans: { loanId: string; reason: 'MISSING_EXCHANGE_RATE' }[];
}

export interface NetWorthHistoryPoint {
  date: Date;
  totalAssets: number;
  totalDebts: number;
  netWorth: number;
}

/**
 * Dernière valorisation dont la date est antérieure ou égale à `asOf`.
 * Les valorisations peuvent arriver dans le désordre ; à date égale, la
 * dernière saisie (la plus loin dans le tableau) l'emporte.
 */
export function currentValueAt(
  asset: Pick<NetWorthAssetInput, 'valuations'>,
  asOf: Date
): NetWorthValuationInput | null {
  let best: NetWorthValuationInput | null = null;
  for (const valuation of asset.valuations) {
    if (valuation.valuatedAt.getTime() > asOf.getTime()) continue;
    if (best === null || valuation.valuatedAt.getTime() >= best.valuatedAt.getTime()) {
      best = valuation;
    }
  }
  return best;
}

/**
 * Convertit un montant en XOF. Le XOF ne dépend d'aucun taux ; une autre
 * devise sans taux strictement positif ne peut pas être convertie (`null`).
 */
export function toXof(amount: number, currency: string, rate: number | null): number | null {
  if (currency.trim().toUpperCase() === BASE_CURRENCY) return amount;
  if (rate === null || !Number.isFinite(rate) || rate <= 0) return null;
  return amount * rate;
}

type AssetEvaluation =
  | { included: true; valueXof: number; valuatedAt: Date; reliability: Reliability | null }
  | { included: false; reason: NetWorthAssetExclusionReason };

/** Un actif cédé compte encore tant que la date de sortie n'est pas atteinte. */
function statusExclusion(asset: NetWorthAssetInput, asOf: Date): NetWorthAssetExclusionReason | null {
  if (asset.status === 'ARCHIVED') return 'ARCHIVED';
  if (asset.status === 'DISPOSED') {
    const stillHeld = asset.disposedAt !== null && asset.disposedAt.getTime() > asOf.getTime();
    return stillHeld ? null : 'DISPOSED';
  }
  return null;
}

function evaluateAsset(asset: NetWorthAssetInput, asOf: Date): AssetEvaluation {
  const reason = statusExclusion(asset, asOf);
  if (reason) return { included: false, reason };

  const valuation = currentValueAt(asset, asOf);
  if (!valuation) return { included: false, reason: 'NO_VALUATION' };

  const converted = toXof(valuation.estimatedValue, valuation.currency, asset.exchangeRateToXof);
  if (converted === null) return { included: false, reason: 'MISSING_EXCHANGE_RATE' };

  return {
    included: true,
    valueXof: roundMoneyXof(converted),
    valuatedAt: valuation.valuatedAt,
    reliability: valuation.reliability ?? null
  };
}

function buildByClass(
  assets: NetWorthAssetInput[],
  values: Map<string, number>,
  totalAssets: number
): NetWorthClassBreakdown[] {
  const totals = new Map<AssetClassKey, { value: number; count: number }>();
  for (const asset of assets) {
    const value = values.get(asset.id);
    if (value === undefined) continue;
    const entry = totals.get(asset.assetClass) ?? { value: 0, count: 0 };
    entry.value += value;
    entry.count += 1;
    totals.set(asset.assetClass, entry);
  }

  return ASSET_CLASSES.flatMap(assetClass => {
    const entry = totals.get(assetClass);
    if (!entry) return [];
    const share = totalAssets > 0 ? roundPercent((entry.value / totalAssets) * 100) : 0;
    return [{ assetClass, value: entry.value, count: entry.count, share }];
  }).sort((a, b) => b.value - a.value);
}

function computeDebts(loans: NetWorthLoanInput[]): Pick<NetWorthResult, 'totalDebts' | 'excludedLoans'> {
  let totalDebts = 0;
  const excludedLoans: NetWorthResult['excludedLoans'] = [];

  for (const loan of loans) {
    if (loan.status !== 'ACTIVE') continue;
    const converted = toXof(loan.remainingCapital, loan.currency, loan.exchangeRateToXof);
    if (converted === null) {
      excludedLoans.push({ loanId: loan.id, reason: 'MISSING_EXCHANGE_RATE' });
    } else {
      totalDebts += roundMoneyXof(converted);
    }
  }
  return { totalDebts, excludedLoans };
}

/** Valeur nette à la date `asOf`. Voir l'en-tête du fichier pour les règles d'inclusion. */
export function computeNetWorth(assets: NetWorthAssetInput[], loans: NetWorthLoanInput[], asOf: Date): NetWorthResult {
  const included: NetWorthResult['assets'] = [];
  const excluded: NetWorthResult['excluded'] = [];
  const values = new Map<string, number>();
  let totalAssets = 0;
  let lowReliabilityValue = 0;

  for (const asset of assets) {
    const evaluation = evaluateAsset(asset, asOf);
    if (!evaluation.included) {
      excluded.push({ assetId: asset.id, reason: evaluation.reason });
      continue;
    }
    included.push({
      id: asset.id,
      valueXof: evaluation.valueXof,
      valuatedAt: evaluation.valuatedAt,
      reliability: evaluation.reliability,
      stale: isStale(asset.assetClass, evaluation.valuatedAt, asOf)
    });
    values.set(asset.id, evaluation.valueXof);
    totalAssets += evaluation.valueXof;
    if (evaluation.reliability === null || evaluation.reliability === 'LOW') lowReliabilityValue += evaluation.valueXof;
  }

  const { totalDebts, excludedLoans } = computeDebts(loans);

  return {
    currency: BASE_CURRENCY,
    asOf,
    totalAssets,
    totalDebts,
    netWorth: totalAssets - totalDebts,
    lowReliabilityShare: totalAssets > 0 ? roundPercent((lowReliabilityValue / totalAssets) * 100) : 0,
    byClass: buildByClass(assets, values, totalAssets),
    assets: included,
    excluded,
    excludedLoans
  };
}

/**
 * Évolution de la valeur nette : un point par date, trié par date croissante.
 *
 * Limite du lot 1 : les dettes utilisent le capital restant dû AUJOURD'HUI, à
 * chaque date. Aucun amortissement n'est reconstitué, donc la courbe passée
 * sous-estime la dette réelle de l'époque (le capital était plus élevé) et
 * ignore les prêts déjà soldés. Seule la part « actifs » suit vraiment le
 * temps, par les valorisations datées.
 */
export function computeNetWorthHistory(
  assets: NetWorthAssetInput[],
  loans: NetWorthLoanInput[],
  dates: Date[]
): NetWorthHistoryPoint[] {
  return [...dates]
    .sort((a, b) => a.getTime() - b.getTime())
    .map(date => {
      const { totalAssets, totalDebts, netWorth } = computeNetWorth(assets, loans, date);
      return { date, totalAssets, totalDebts, netWorth };
    });
}
