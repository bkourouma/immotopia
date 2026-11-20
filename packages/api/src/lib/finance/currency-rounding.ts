import { roundMoney, roundMoneyXof } from './money';

/**
 * Arrondi selon la devise (revue locative, décision H3).
 *
 * Le franc CFA (FCFA, XOF, XAF) n'a pas de subdivision : en FCFA les montants
 * sont entiers de bout en bout. Les autres devises gardent deux décimales. Une
 * devise absente est le FCFA, devise par défaut de la plateforme.
 */
const WHOLE_UNIT_CURRENCIES = new Set(['FCFA', 'XOF', 'XAF', 'CFA']);

export function isWholeUnitCurrency(currency?: string | null): boolean {
  if (!currency) return true;
  return WHOLE_UNIT_CURRENCIES.has(currency.trim().toUpperCase());
}

/** Arrondit un montant à l'unité en FCFA/XOF/XAF, au centime sinon. */
export function roundForCurrency(value: number, currency?: string | null): number {
  return isWholeUnitCurrency(currency) ? roundMoneyXof(value) : roundMoney(value);
}

/**
 * Répartit `total` selon des poids : chaque part est arrondie (à l'unité en
 * FCFA), le reste d'arrondi va au DERNIER élément, de sorte que la somme des
 * parts vaut toujours `total`. Poids tous nuls : tout au dernier élément.
 */
export function apportionAmount(total: number, weights: number[], currency?: string | null): number[] {
  if (weights.length === 0) return [];
  const sumWeights = weights.reduce((sum, weight) => sum + weight, 0);
  const parts: number[] = [];
  let allotted = 0;
  weights.forEach((weight, index) => {
    if (index === weights.length - 1) {
      parts.push(roundForCurrency(total - allotted, currency));
      return;
    }
    const part = sumWeights > 0 ? roundForCurrency((total * weight) / sumWeights, currency) : 0;
    allotted = roundForCurrency(allotted + part, currency);
    parts.push(part);
  });
  return parts;
}
