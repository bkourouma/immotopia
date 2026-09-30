import { computeLatePenaltyPreview, MAX_MONTHLY_PENALTY_RATE } from '../../utils/syndic-penalty';

/** BUG-2026-09-30-053 : l'aperçu reprend la règle de l'API (taux mensuel au prorata, plafonné au reste dû). */
describe('computeLatePenaltyPreview', () => {
  it('300 000 à 10 % par mois pendant 15 jours = 15 000', () => {
    expect(computeLatePenaltyPreview(300000, 10, 15)).toBe(15000);
  });

  it('258 jours à 10 % = 258 000, au moins un jour compte', () => {
    expect(computeLatePenaltyPreview(300000, 10, 258)).toBe(258000);
    expect(computeLatePenaltyPreview(300000, 10, 0)).toBe(1000);
  });

  it('ne dépasse jamais le reste dû', () => {
    expect(computeLatePenaltyPreview(300000, 10, 400)).toBe(300000);
  });

  it('plafond de saisie aligné sur l’API', () => {
    expect(MAX_MONTHLY_PENALTY_RATE).toBe(10);
  });
});
