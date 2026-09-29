/**
 * Sélection des paramètres fiscaux (lot P4, territoire A1).
 *
 * Contrat : section 2 de `p4-contrat.md`. Fonctions pures, aucune dépendance
 * externe.
 */

import type { FiscalCountry, TaxContext, TaxKind, TaxParameterRow } from './types';

export interface PickedParametersYear {
  year: number | null;
  fallback: boolean;
  rows: TaxParameterRow[];
}

/**
 * Choisit l'année de paramètres applicable : la plus grande année ≤
 * `fiscalYear` pour ce pays et cet impôt. `fallback` est vrai si l'année
 * choisie diffère de `fiscalYear` (repli sur une année antérieure). Aucune
 * ligne éligible → `{ year: null, fallback: false, rows: [] }`.
 */
export function pickParametersYear(
  rows: TaxParameterRow[],
  country: FiscalCountry,
  taxKind: TaxKind,
  fiscalYear: number
): PickedParametersYear {
  const eligibleYears = rows
    .filter(row => row.country === country && row.taxKind === taxKind && row.year <= fiscalYear)
    .map(row => row.year);

  if (eligibleYears.length === 0) {
    return { year: null, fallback: false, rows: [] };
  }

  const year = Math.max(...eligibleYears);
  const yearRows = rows.filter(row => row.country === country && row.taxKind === taxKind && row.year === year);

  return { year, fallback: year !== fiscalYear, rows: yearRows };
}

const PROPERTY_KIND_WEIGHT = 4;
const OCCUPANCY_WEIGHT = 2;
const OWNER_KIND_WEIGHT = 1;

function specificity(row: TaxParameterRow, ctx: TaxContext): number | null {
  if (row.propertyKind !== 'ANY' && row.propertyKind !== ctx.propertyKind) {
    return null;
  }
  if (row.occupancy !== 'ANY' && row.occupancy !== ctx.occupancy) {
    return null;
  }
  if (row.ownerKind !== 'ANY' && row.ownerKind !== ctx.ownerKind) {
    return null;
  }

  let score = 0;
  if (row.propertyKind !== 'ANY') score += PROPERTY_KIND_WEIGHT;
  if (row.occupancy !== 'ANY') score += OCCUPANCY_WEIGHT;
  if (row.ownerKind !== 'ANY') score += OWNER_KIND_WEIGHT;
  return score;
}

/**
 * Résout, pour une clé donnée et un contexte, la ligne de paramètre la plus
 * spécifique (candidate = chaque sélecteur vaut ANY ou la valeur du
 * contexte). Seules les lignes `bracketIndex === 0` sont considérées.
 */
export function resolveParameter(rows: TaxParameterRow[], key: string, ctx: TaxContext): TaxParameterRow | null {
  let best: TaxParameterRow | null = null;
  let bestScore = -1;

  for (const row of rows) {
    if (row.key !== key || row.bracketIndex !== 0) continue;
    const score = specificity(row, ctx);
    if (score === null) continue;
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }

  return best;
}

/**
 * Résout les tranches (`bracket_rate`) du meilleur niveau de spécificité,
 * triées par `bracketIndex`.
 */
export function resolveBrackets(rows: TaxParameterRow[], ctx: TaxContext): TaxParameterRow[] {
  const candidates = rows.filter(row => row.key === 'bracket_rate');

  let bestScore = -1;
  for (const row of candidates) {
    const score = specificity(row, ctx);
    if (score !== null && score > bestScore) {
      bestScore = score;
    }
  }

  if (bestScore < 0) return [];

  return candidates.filter(row => specificity(row, ctx) === bestScore).sort((a, b) => a.bracketIndex - b.bracketIndex);
}

/**
 * Résout, pour chaque `bracketIndex`, la meilleure ligne de surtaxe pour la
 * clé donnée (`surcharge_on_tax_rate` ou `surcharge_on_base_rate`).
 */
export function resolveSurcharges(rows: TaxParameterRow[], key: string, ctx: TaxContext): TaxParameterRow[] {
  const candidates = rows.filter(row => row.key === key);
  const byIndex = new Map<number, { row: TaxParameterRow; score: number }>();

  for (const row of candidates) {
    const score = specificity(row, ctx);
    if (score === null) continue;
    const existing = byIndex.get(row.bracketIndex);
    if (!existing || score > existing.score) {
      byIndex.set(row.bracketIndex, { row, score });
    }
  }

  return Array.from(byIndex.values())
    .sort((a, b) => a.row.bracketIndex - b.row.bracketIndex)
    .map(entry => entry.row);
}
