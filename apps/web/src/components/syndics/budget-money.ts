/**
 * Montants des budgets et campagnes Syndic : arrondi et précision selon la devise.
 * Le franc CFA (XOF, XAF, FCFA) n'a pas de subdivision : jamais de décimales,
 * ni à l'écran ni à la saisie. Les autres devises gardent 2 décimales.
 */

import { isZeroDecimalCurrency } from '../../utils/zero-decimal-currencies';

export function currencyFractionDigits(currency: string | null | undefined): 0 | 2 {
  // Devise non renseignée : le formulaire applique XOF par défaut.
  const code = (currency ?? 'XOF').replace(/\s/g, '').toUpperCase() || 'XOF';
  return isZeroDecimalCurrency(code) ? 0 : 2;
}

/** Arrondit un montant à la précision de la devise (entier en FCFA, centime sinon). */
export function roundToCurrency(value: number, currency: string | null | undefined): number {
  const scale = currencyFractionDigits(currency) === 0 ? 1 : 100;
  return Math.round(value * scale) / scale;
}

/** Somme de montants de postes, arrondie à la précision de la devise. */
export function sumAmounts(
  amounts: Array<number | string | null | undefined> | undefined,
  currency: string | null | undefined
): number {
  const total = (amounts ?? []).reduce<number>((acc, raw) => {
    const amount = Number(raw);
    return acc + (Number.isFinite(amount) ? amount : 0);
  }, 0);
  return roundToCurrency(total, currency);
}

/**
 * Total à afficher pour un budget : somme de ses postes quand il en a
 * (données historiques dont le total enregistré diverge), sinon le total enregistré.
 */
export function budgetDisplayTotal(budget: {
  totalAmount?: number | string | null;
  currency?: string | null;
  lines?: Array<{ amountForecast?: number | string | null }> | null;
}): number {
  if (budget.lines && budget.lines.length > 0) {
    return sumAmounts(
      budget.lines.map(line => line.amountForecast),
      budget.currency
    );
  }
  return Number(budget.totalAmount || 0);
}
