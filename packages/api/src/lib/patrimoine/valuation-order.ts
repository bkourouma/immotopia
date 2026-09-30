/**
 * Ordre unique des valorisations d'un bien (BUG-2026-09-30-099).
 *
 * La valeur courante d'un bien est sa DERNIÈRE valorisation : date de
 * valorisation, puis horodatage de création comme départage, puis id. Trier
 * par date seule laissait l'ordre indéterminé quand deux valorisations
 * portent le même jour (valorisation automatique d'un chantier + saisie
 * manuelle) : la plus ancienne pouvait l'emporter. Toute lecture de
 * « dernière valorisation » (vue consolidée, rendement, fiche, portail,
 * export) passe par ce module.
 */
export const VALUATION_ORDER_BY = [
  { valuatedAt: 'desc' as const },
  { createdAt: 'desc' as const },
  { id: 'desc' as const }
];

export interface OrderedValuation {
  id: string;
  valuatedAt: Date;
  createdAt: Date;
}

/** Comparateur décroissant : la plus récente d'abord. */
export function compareValuationsDesc(a: OrderedValuation, b: OrderedValuation): number {
  return (
    b.valuatedAt.getTime() - a.valuatedAt.getTime() ||
    b.createdAt.getTime() - a.createdAt.getTime() ||
    (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
  );
}

/** La dernière valorisation d'une liste, ou `undefined`. */
export function latestValuation<T extends OrderedValuation>(valuations: T[]): T | undefined {
  return valuations.length === 0 ? undefined : [...valuations].sort(compareValuationsDesc)[0];
}
