/**
 * Validation zod des corps de requête du lot 9 (`lib/sales/schemas.ts`) —
 * en particulier les combinaisons refusées avant même d'atteindre le service :
 * mode de commission incohérent, prix plancher au-dessus du prix demandé,
 * dates renversées, décision d'offre sans les champs qu'elle exige.
 */

import { createMandateSchema, offerDecisionSchema, createAgreementSchema } from '../../src/lib/sales/schemas';

const baseMandate = {
  propertyId: 'prop-1',
  sellerClientId: 'client-1',
  mandateType: 'EXCLUSIVE' as const,
  askingPrice: 50_000_000,
  commissionMode: 'PERCENT' as const,
  commissionRate: 5,
  commissionPayer: 'SELLER' as const,
  startDate: '2026-09-23'
};

describe('createMandateSchema', () => {
  it('accepte un mandat valide au pourcentage', () => {
    expect(() => createMandateSchema.parse(baseMandate)).not.toThrow();
  });

  it('refuse le mode PERCENT sans taux de commission', () => {
    const { commissionRate: _commissionRate, ...rest } = baseMandate;
    expect(() => createMandateSchema.parse(rest)).toThrow();
  });

  it('refuse le mode FIXED sans montant forfaitaire', () => {
    expect(() =>
      createMandateSchema.parse({ ...baseMandate, commissionMode: 'FIXED', commissionRate: undefined })
    ).toThrow();
  });

  it('refuse un prix plancher supérieur au prix demandé', () => {
    expect(() => createMandateSchema.parse({ ...baseMandate, minimumPrice: 60_000_000 })).toThrow();
  });

  it('accepte un prix plancher inférieur ou égal au prix demandé', () => {
    expect(() => createMandateSchema.parse({ ...baseMandate, minimumPrice: 45_000_000 })).not.toThrow();
  });

  it('refuse une date de fin antérieure à la date de début', () => {
    expect(() => createMandateSchema.parse({ ...baseMandate, endDate: '2026-01-01' })).toThrow();
  });

  it('refuse un taux de commission au-delà de 20 %', () => {
    expect(() => createMandateSchema.parse({ ...baseMandate, commissionRate: 25 })).toThrow();
  });
});

describe('offerDecisionSchema', () => {
  it('exige un montant pour une contre-offre (COUNTER)', () => {
    expect(() => offerDecisionSchema.parse({ action: 'COUNTER' })).toThrow();
    expect(() => offerDecisionSchema.parse({ action: 'COUNTER', counterAmount: 45_000_000 })).not.toThrow();
  });

  it('exige un motif pour un refus (REJECT)', () => {
    expect(() => offerDecisionSchema.parse({ action: 'REJECT' })).toThrow();
    expect(() => offerDecisionSchema.parse({ action: 'REJECT', reason: 'Prix trop bas' })).not.toThrow();
  });

  it('exige un motif pour un retrait (WITHDRAW)', () => {
    expect(() => offerDecisionSchema.parse({ action: 'WITHDRAW' })).toThrow();
  });

  it('accepte une acceptation sans champ supplémentaire', () => {
    expect(() => offerDecisionSchema.parse({ action: 'ACCEPT' })).not.toThrow();
  });

  it('refuse une action inconnue', () => {
    expect(() => offerDecisionSchema.parse({ action: 'CANCEL' })).toThrow();
  });
});

describe('createAgreementSchema', () => {
  it('accepte un corps vide : tous les champs sont optionnels à la création', () => {
    expect(() => createAgreementSchema.parse({})).not.toThrow();
  });

  it('refuse un prix négatif ou nul', () => {
    expect(() => createAgreementSchema.parse({ price: 0 })).toThrow();
    expect(() => createAgreementSchema.parse({ price: -1 })).toThrow();
  });
});
