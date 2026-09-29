/**
 * Fiabilité d'une valorisation (lot 2, spec 024).
 *
 * Niveau de base selon la méthode, puis perte d'un ou deux niveaux selon
 * l'ancienneté, puis plafond selon le statut juridique (immobilier). Les
 * raisons sont des clés stables, traduites côté web.
 */

import { FRAGILE_LEGAL_STATUSES, type AssetClassKey } from './asset-classes';
import { monthsBetween, STALENESS_MONTHS } from './staleness';
import type { ValuationMethodKey } from './valuation-methods';

export type Reliability = 'HIGH' | 'MEDIUM' | 'LOW';

export type ReliabilityReason =
  | 'METHOD_EXPERT'
  | 'METHOD_BALANCE'
  | 'METHOD_COMPUTED'
  | 'METHOD_MANUAL_WITH_SOURCE'
  | 'METHOD_MANUAL_NO_SOURCE'
  | 'STALE_ONE_LEVEL'
  | 'STALE_TWO_LEVELS'
  | 'LEGAL_STATUS_FRAGILE'
  | 'LEGAL_STATUS_UNKNOWN';

export interface ReliabilityInput {
  assetClass: AssetClassKey;
  method: ValuationMethodKey;
  valuatedAt: Date;
  asOf: Date;
  hasSource: boolean;
  /** Statut juridique brut des détails ; seul l'immobilier en tient compte. */
  legalStatus?: string | null;
}

export interface ReliabilityResult {
  level: Reliability;
  reasons: ReliabilityReason[];
}

const LEVELS: Reliability[] = ['LOW', 'MEDIUM', 'HIGH'];

function rank(level: Reliability): number {
  return LEVELS.indexOf(level);
}

/** Niveau et raison de départ : la saisie manuelle n'est jamais « élevée ». */
function baseLevel(method: ValuationMethodKey, hasSource: boolean): { level: Reliability; reason: ReliabilityReason } {
  switch (method) {
    case 'EXPERT_APPRAISAL':
      return { level: 'HIGH', reason: 'METHOD_EXPERT' };
    case 'BALANCE':
      return { level: 'HIGH', reason: 'METHOD_BALANCE' };
    // Une estimation de marché est une saisie : sans source, elle n'est pas plus fiable qu'une saisie manuelle.
    case 'MANUAL':
    case 'MARKET_ESTIMATE':
      return hasSource
        ? { level: 'MEDIUM', reason: 'METHOD_MANUAL_WITH_SOURCE' }
        : { level: 'LOW', reason: 'METHOD_MANUAL_NO_SOURCE' };
    default:
      return { level: 'MEDIUM', reason: 'METHOD_COMPUTED' };
  }
}

/** Niveaux perdus : un au-delà du seuil de la classe, deux au-delà du double. */
function stalenessPenalty(assetClass: AssetClassKey, valuatedAt: Date, asOf: Date): 0 | 1 | 2 {
  const age = monthsBetween(valuatedAt, asOf);
  const threshold = STALENESS_MONTHS[assetClass];
  if (age > 2 * threshold) return 2;
  return age > threshold ? 1 : 0;
}

/** Plafond juridique : fragile → LOW ; absent → MEDIUM ; les autres statuts ne plafonnent pas. */
function legalCap(legalStatus: string | null | undefined): { cap: Reliability; reason: ReliabilityReason } | null {
  if (!legalStatus) return { cap: 'MEDIUM', reason: 'LEGAL_STATUS_UNKNOWN' };
  if ((FRAGILE_LEGAL_STATUSES as readonly string[]).includes(legalStatus)) {
    return { cap: 'LOW', reason: 'LEGAL_STATUS_FRAGILE' };
  }
  return null;
}

export function computeReliability(input: ReliabilityInput): ReliabilityResult {
  const base = baseLevel(input.method, input.hasSource);
  const reasons: ReliabilityReason[] = [base.reason];
  let score = rank(base.level);

  const penalty = stalenessPenalty(input.assetClass, input.valuatedAt, input.asOf);
  if (penalty > 0) {
    reasons.push(penalty === 2 ? 'STALE_TWO_LEVELS' : 'STALE_ONE_LEVEL');
    score = Math.max(0, score - penalty);
  }

  const cap = input.assetClass === 'REAL_ESTATE' ? legalCap(input.legalStatus) : null;
  if (cap) {
    // La raison est toujours posée : elle porte l'avertissement (statut fragile) ou l'invite à renseigner.
    score = Math.min(score, rank(cap.cap));
    reasons.push(cap.reason);
  }

  return { level: LEVELS[score], reasons };
}
