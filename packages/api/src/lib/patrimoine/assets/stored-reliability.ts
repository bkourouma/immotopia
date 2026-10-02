/**
 * Fiabilité stockée et effective d'une valorisation (lot 2, spec 024).
 *
 * Le serveur la calcule à l'écriture (service des actifs, module Bien,
 * bascule d'un lot de chantier) ; la lecture la recalcule à la date du jour
 * pour l'ancienneté et avec le statut juridique COURANT de l'actif, jamais
 * celui d'il y a un an. `reliabilityReasons` est donc écrit à la saisie, mais
 * la lecture ne s'y fie pas : elle recalcule (voir `plan.md` du lot 2).
 *
 * Fonctions pures, sans accès aux données : `lib/` n'importe aucun service.
 */

import type { AssetClassKey } from './asset-classes';
import { computeReliability, type Reliability, type ReliabilityReason } from './reliability';
import type { ValuationMethodKey } from './valuation-methods';

export interface ReliabilityLine {
  method: ValuationMethodKey;
  valuatedAt: Date;
  source: string | null;
  /** Valeur stockée à la saisie ; nulle avant le lot 2. */
  reliability: Reliability | null;
}

export interface ReliabilityView {
  reliability: Reliability | null;
  reliabilityReasons: ReliabilityReason[];
}

/** Statut juridique brut des détails d'un actif immobilier ; nul pour les autres classes ou s'il est absent. */
export function legalStatusOf(assetClass: AssetClassKey, details: unknown): string | null {
  if (assetClass !== 'REAL_ESTATE' || typeof details !== 'object' || details === null) return null;
  const value = (details as Record<string, unknown>).legalStatus;
  return typeof value === 'string' && value ? value : null;
}

/** Fiabilité à stocker pour une ligne qu'on écrit. */
export function computeStoredReliability(
  asset: { assetClass: AssetClassKey; details: unknown },
  line: Omit<ReliabilityLine, 'reliability'>,
  asOf: Date = new Date()
): { reliability: Reliability; reliabilityReasons: ReliabilityReason[] } {
  const result = computeReliability({
    assetClass: asset.assetClass,
    method: line.method,
    valuatedAt: line.valuatedAt,
    asOf,
    hasSource: !!line.source,
    legalStatus: legalStatusOf(asset.assetClass, asset.details)
  });
  return { reliability: result.level, reliabilityReasons: result.reasons };
}

/** Fiabilité effective à `asOf` ; une ligne antérieure au lot 2 (fiabilité nulle) reste inconnue. */
export function effectiveReliability(
  asset: { assetClass: AssetClassKey; details: unknown },
  line: ReliabilityLine,
  asOf: Date = new Date()
): ReliabilityView {
  if (!line.reliability) return { reliability: null, reliabilityReasons: ['METHOD_MANUAL_NO_SOURCE'] };
  const { reliability, reliabilityReasons } = computeStoredReliability(asset, line, asOf);
  return { reliability, reliabilityReasons };
}
