import { describe, expect, it } from 'vitest';
import { budgetDisplayTotal, currencyFractionDigits, roundToCurrency, sumAmounts } from '../budget-money';

describe('budget-money', () => {
  it('donne 0 décimale en FCFA et 2 ailleurs', () => {
    for (const c of ['XOF', 'xaf', 'FCFA', undefined, null]) expect(currencyFractionDigits(c)).toBe(0);
    expect(currencyFractionDigits('EUR')).toBe(2);
  });

  it('couvre toutes les devises sans sous-unité, quelle que soit la casse', () => {
    for (const c of ['CFA', 'cfa', 'XPF', 'GNF', 'KMF', 'DJF', 'BIF', 'RWF', 'fcfa', 'F CFA']) {
      expect(currencyFractionDigits(c)).toBe(0);
    }
  });

  it('arrondit selon la devise', () => {
    expect(roundToCurrency(100.6, 'XOF')).toBe(101);
    expect(roundToCurrency(100.456, 'EUR')).toBe(100.46);
  });

  it('somme les postes en ignorant les valeurs vides', () => {
    expect(sumAmounts([100000, '250000', null, undefined, 50000], 'XOF')).toBe(400000);
    expect(sumAmounts([0.1, 0.2], 'EUR')).toBe(0.3);
  });

  it('le total affiché d’un budget est la somme de ses postes quand il en a', () => {
    expect(
      budgetDisplayTotal({
        totalAmount: 999,
        currency: 'XOF',
        lines: [{ amountForecast: 300 }, { amountForecast: '200' }]
      })
    ).toBe(500);
    expect(budgetDisplayTotal({ totalAmount: '750', currency: 'XOF', lines: [] })).toBe(750);
  });
});
