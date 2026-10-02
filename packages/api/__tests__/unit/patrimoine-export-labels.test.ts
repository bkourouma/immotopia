import { valuationMethodLabel } from '../../src/lib/patrimoine/export/labels';
import { VALUATION_METHODS } from '../../src/lib/patrimoine/asset-schemas';

describe('valuationMethodLabel', () => {
  it('chaque méthode a un libellé français, jamais la clé brute', () => {
    for (const method of VALUATION_METHODS) {
      expect(valuationMethodLabel(method, 'fr')).not.toBe(method);
    }
  });

  it('libellés des méthodes du lot 2', () => {
    expect(valuationMethodLabel('DEPRECIATION_LINEAR', 'fr')).toBe('Amortissement linéaire');
    expect(valuationMethodLabel('BALANCE', 'fr')).toBe('Solde');
    expect(valuationMethodLabel('UNIT_COST', 'fr')).toBe('Quantité × coût unitaire');
    expect(valuationMethodLabel('BALANCE', 'en')).toBe('Balance');
  });
});
