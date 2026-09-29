import { COMPUTED_VALUATION_METHODS, suggestValuation, toXof } from '../../lib/patrimoine/assets';
import type {
  AssetClassKey,
  SuggestRefusalReason,
  SuggestValuationResult,
  ValuationMethodKey
} from '../../lib/patrimoine/assets';

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
  | { ok: false; missing: string[]; reason?: SuggestRefusalReason };

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
      lastValuation: last && amount !== null ? { valuatedAt: last.valuatedAt, estimatedValue: amount } : null,
      currency: asset.currency
    },
    asOf
  );
  if (!result.ok)
    return result.reason
      ? { ok: false, missing: result.missing, reason: result.reason }
      : { ok: false, missing: result.missing };
  return {
    ok: true,
    amount: result.amount,
    currency: asset.currency,
    method: result.method,
    assumptions: result.assumptions
  };
}

export interface VerifiableLine {
  method: ValuationMethodKey;
  valuatedAt: Date;
  estimatedValue: number;
  currency: string;
}

/** Écart toléré entre le montant saisi et le montant recalculé : 1 en XOF, 0,01 ailleurs. */
const TOLERANCE_XOF = 1;
const TOLERANCE_OTHER = 0.01;

/**
 * Méthode à stocker pour une ligne écrite. Une méthode calculée n'est conservée
 * que si le serveur retrouve le montant (recalcul à la date de la ligne, avec la
 * valorisation antérieure de l'actif) ; sinon `MANUAL` : un montant retouché à la
 * main n'est jamais présenté comme calculé. Les autres méthodes passent telles quelles.
 */
export function verifiedMethod(
  asset: SuggestAssetInput,
  last: SuggestLastValuation | null,
  line: VerifiableLine
): ValuationMethodKey {
  if (!(COMPUTED_VALUATION_METHODS as readonly string[]).includes(line.method)) return line.method;
  const suggestion = buildSuggestion(asset, last, line.valuatedAt);
  if (!suggestion.ok || suggestion.method !== line.method) return 'MANUAL';
  // La ligne est en XOF ou dans la devise de l'actif ; la suggestion, toujours dans celle de l'actif.
  const expected =
    line.currency === asset.currency
      ? suggestion.amount
      : toXof(suggestion.amount, asset.currency, asset.exchangeRateToXof);
  if (expected === null) return 'MANUAL';
  const tolerance = line.currency === 'XOF' ? TOLERANCE_XOF : TOLERANCE_OTHER;
  return Math.abs(expected - line.estimatedValue) <= tolerance ? line.method : 'MANUAL';
}
