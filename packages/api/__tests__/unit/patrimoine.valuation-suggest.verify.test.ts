/**
 * Cohérence temporelle suggestion / vérification (spec 024, anomalie B1 de la recette de la PR #52) :
 * la suggestion est calculée à un instant t, la ligne est enregistrée à la date du jour (minuit UTC).
 * Une méthode calculée doit survivre à cet aller-retour, mais un montant retouché doit retomber en MANUAL.
 */

import {
  buildSuggestion,
  verifiedMethod,
  type SuggestAssetInput
} from '../../src/services/patrimoine-assets/valuation-suggest';

const ASSET: SuggestAssetInput = {
  assetClass: 'VEHICLE_EQUIPMENT',
  currency: 'XOF',
  exchangeRateToXof: null,
  details: { kind: 'Pick-up', usefulLifeYears: 5, residualValuePercent: 10 },
  acquisitionCost: 10_000_000,
  acquisitionDate: new Date('2024-01-15T00:00:00Z')
};

const MIDNIGHT = new Date('2026-09-29T00:00:00Z');
const AFTERNOON = new Date('2026-09-29T14:37:12Z');

function lineOf(amount: number) {
  return { method: 'DEPRECIATION_LINEAR' as const, valuatedAt: MIDNIGHT, estimatedValue: amount, currency: 'XOF' };
}

describe('suggestion puis enregistrement le même jour', () => {
  it('la suggestion calculée dans la journée est retrouvée par la vérification à minuit', () => {
    const suggestion = buildSuggestion(ASSET, null, AFTERNOON);
    expect(suggestion).toMatchObject({ ok: true, method: 'DEPRECIATION_LINEAR' });
    if (!suggestion.ok) return;
    expect(verifiedMethod(ASSET, null, lineOf(suggestion.amount))).toBe('DEPRECIATION_LINEAR');
  });

  it('la suggestion porte la date de valeur (jour UTC) sur laquelle elle est calculée', () => {
    const suggestion = buildSuggestion(ASSET, null, AFTERNOON);
    expect(suggestion).toMatchObject({ ok: true, valueDate: '2026-09-29' });
  });

  it('un montant retouché reste dégradé en MANUAL (non-falsification)', () => {
    const suggestion = buildSuggestion(ASSET, null, AFTERNOON);
    if (!suggestion.ok) throw new Error('suggestion attendue');
    expect(verifiedMethod(ASSET, null, lineOf(suggestion.amount + 1000))).toBe('MANUAL');
    expect(verifiedMethod(ASSET, null, lineOf(suggestion.amount * 2))).toBe('MANUAL');
  });
});
