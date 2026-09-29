import { suggestValuation, toXof } from '../../lib/patrimoine/assets';
import type { AssetClassKey, SuggestValuationResult, ValuationMethodKey } from '../../lib/patrimoine/assets';

/**
 * Suggestion de valeur d'un actif (lot 2, spec 024) : adapte les lignes et les
 * détails de l'actif à la fonction pure du domaine. Aucune écriture.
 */

export type SuggestResponse =
  | {
      ok: true;
      amount: number;
      currency: string;
      method: ValuationMethodKey;
      assumptions: { key: string; value: string | number }[];
    }
  | { ok: false; missing: string[] };

export interface SuggestAssetInput {
  assetClass: AssetClassKey;
  currency: string;
  exchangeRateToXof: number | null;
  details: unknown;
  acquisitionCost: number | null;
  acquisitionDate: Date | null;
}

export interface SuggestLastValuation {
  valuatedAt: Date;
  estimatedValue: number;
  currency: string;
}

/** Ramène un montant de ligne dans la devise de l'actif (une ligne est en XOF ou dans la devise de l'actif). */
function inAssetCurrency(asset: SuggestAssetInput, line: SuggestLastValuation): number | null {
  if (line.currency === asset.currency) return line.estimatedValue;
  const xof = toXof(line.estimatedValue, line.currency, asset.exchangeRateToXof);
  if (xof === null) return null;
  return asset.exchangeRateToXof && asset.exchangeRateToXof > 0 ? xof / asset.exchangeRateToXof : null;
}

export function buildSuggestion(
  asset: SuggestAssetInput,
  last: SuggestLastValuation | null,
  asOf: Date
): SuggestResponse {
  const amount = last ? inAssetCurrency(asset, last) : null;
  const result: SuggestValuationResult = suggestValuation(
    {
      assetClass: asset.assetClass,
      details: (asset.details ?? {}) as Record<string, unknown>,
      acquisitionCost: asset.acquisitionCost,
      acquisitionDate: asset.acquisitionDate,
      lastValuation: last && amount !== null ? { valuatedAt: last.valuatedAt, estimatedValue: amount } : null
    },
    asOf
  );
  if (!result.ok) return { ok: false, missing: result.missing };
  return {
    ok: true,
    amount: result.amount,
    currency: asset.currency,
    method: result.method,
    assumptions: result.assumptions
  };
}
