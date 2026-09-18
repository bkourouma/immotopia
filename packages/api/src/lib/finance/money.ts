/**
 * Primitives monetaires partagees par tous les modules financiers.
 *
 * Extrait de `lib/syndics/finance-utils.ts` (decision D1 du plan de mise en
 * oeuvre) : la copropriete et les futurs comptes de tiers (lot 1) arrondissent
 * les montants de la meme facon, et ce calcul ne doit exister qu'a un seul
 * endroit. `finance-utils.ts` re-exporte ces symboles pour que les imports
 * existants continuent de fonctionner sans modification.
 */

export const MONEY_PRECISION = 2;

export function roundMoney(value: number): number {
  return Number(value.toFixed(MONEY_PRECISION));
}
