/**
 * Hypothèses de projection (lot 3, spec 025).
 *
 * Les taux par défaut sont des hypothèses NOMINALES INDICATIVES, pas des
 * prévisions : ils vivent ici en constantes nommées, modifiables sans
 * migration, et l'interface les affiche pour que l'utilisateur les corrige.
 * Les classes `VEHICLE_EQUIPMENT` valent 0 % : leur amortissement vient des
 * `details` de l'actif, pas d'un taux de classe.
 */

import type { AssetClassKey } from '../assets';

export type { AssetClassKey };

export type ProjectionScenarioKey = 'PRUDENT' | 'CENTRAL' | 'OPTIMISTIC';

export const PROJECTION_SCENARIO_KEYS: readonly ProjectionScenarioKey[] = ['PRUDENT', 'CENTRAL', 'OPTIMISTIC'];

/** Forme du contrat : une classe absente prend la valeur du scénario de base. */
export interface ProjectionAssumptions {
  growthPercentByClass: Partial<Record<AssetClassKey, number>>;
  inflationPercent: number;
}

/** Hypothèses complètes : toutes les classes sont renseignées. */
export interface ResolvedAssumptions {
  growthPercentByClass: Record<AssetClassKey, number>;
  inflationPercent: number;
}

export const GROWTH_MIN = -50;
export const GROWTH_MAX = 100;
export const INFLATION_MIN = 0;
export const INFLATION_MAX = 100;
export const MAX_HORIZON_YEARS = 30;
export const MAX_OPERATIONS = 50;

export const PRUDENT_ASSUMPTIONS: ResolvedAssumptions = {
  growthPercentByClass: {
    REAL_ESTATE: 2,
    BUSINESS_EQUITY: 0,
    INVENTORY: 0,
    CASH: 0,
    SAVINGS_INVESTMENT: 2,
    RECEIVABLE: 0,
    AGRICULTURE: 0,
    MOVABLE: 0,
    VEHICLE_EQUIPMENT: 0,
    OTHER: 0
  },
  inflationPercent: 4
};

export const CENTRAL_ASSUMPTIONS: ResolvedAssumptions = {
  growthPercentByClass: {
    REAL_ESTATE: 4,
    BUSINESS_EQUITY: 5,
    INVENTORY: 2,
    CASH: 0,
    SAVINGS_INVESTMENT: 4,
    RECEIVABLE: 0,
    AGRICULTURE: 3,
    MOVABLE: 2,
    VEHICLE_EQUIPMENT: 0,
    OTHER: 0
  },
  inflationPercent: 3
};

export const OPTIMISTIC_ASSUMPTIONS: ResolvedAssumptions = {
  growthPercentByClass: {
    REAL_ESTATE: 6,
    BUSINESS_EQUITY: 10,
    INVENTORY: 4,
    CASH: 0,
    SAVINGS_INVESTMENT: 6,
    RECEIVABLE: 0,
    AGRICULTURE: 6,
    MOVABLE: 4,
    VEHICLE_EQUIPMENT: 0,
    OTHER: 0
  },
  inflationPercent: 2
};

export const DEFAULT_ASSUMPTIONS: Record<ProjectionScenarioKey, ResolvedAssumptions> = {
  PRUDENT: PRUDENT_ASSUMPTIONS,
  CENTRAL: CENTRAL_ASSUMPTIONS,
  OPTIMISTIC: OPTIMISTIC_ASSUMPTIONS
};

export interface ResolveAssumptionsResult {
  assumptions: ResolvedAssumptions;
  /** Classes dont le taux a été surchargé (dans l'ordre des clés reçues). */
  overriddenClasses: AssetClassKey[];
  inflationOverridden: boolean;
}

/**
 * Scénario de base + surcharges. Renvoie une copie : ni la table par défaut
 * ni les surcharges reçues ne sont jamais modifiées ou partagées.
 */
export function resolveAssumptions(
  baseScenario: ProjectionScenarioKey,
  overrides?: Partial<ProjectionAssumptions>
): ResolveAssumptionsResult {
  const base = DEFAULT_ASSUMPTIONS[baseScenario];
  const growthPercentByClass = { ...base.growthPercentByClass };
  const overriddenClasses: AssetClassKey[] = [];

  for (const [key, value] of Object.entries(overrides?.growthPercentByClass ?? {})) {
    if (typeof value !== 'number') continue;
    const assetClass = key as AssetClassKey;
    growthPercentByClass[assetClass] = value;
    overriddenClasses.push(assetClass);
  }

  const inflation = overrides?.inflationPercent;
  return {
    assumptions: { growthPercentByClass, inflationPercent: inflation ?? base.inflationPercent },
    overriddenClasses,
    inflationOverridden: inflation !== undefined
  };
}
