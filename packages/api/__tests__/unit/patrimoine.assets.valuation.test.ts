/**
 * Suggestion de valeur par classe (lot 2, spec 024) : les scénarios chiffrés
 * de la spec sont reproduits à l'unité.
 */

import { suggestValuation, yearsBetween, type SuggestValuationInput } from '../../src/lib/patrimoine/assets';

const AS_OF = new Date('2026-09-29T00:00:00Z');
const DAY = 86_400_000;
/** Date située `years` années (365,25 jours) avant AS_OF. */
const yearsAgo = (years: number) => new Date(AS_OF.getTime() - years * 365.25 * DAY);

function input(overrides: Partial<SuggestValuationInput>): SuggestValuationInput {
  return {
    assetClass: 'OTHER',
    details: {},
    acquisitionCost: null,
    acquisitionDate: null,
    lastValuation: null,
    ...overrides
  };
}

describe('yearsBetween', () => {
  it('compte 365,25 jours par an', () => {
    expect(yearsBetween(yearsAgo(2), AS_OF)).toBeCloseTo(2, 10);
    expect(yearsBetween(yearsAgo(0.5), AS_OF)).toBeCloseTo(0.5, 10);
  });
});

describe('VEHICLE_EQUIPMENT', () => {
  const details = { kind: 'Camion', usefulLifeYears: 5, residualValuePercent: 10 };

  it('amortissement linéaire : 10 000 000 sur 2 ans, durée 5 ans, résiduelle 10 % = 6 400 000', () => {
    const result = suggestValuation(
      input({ assetClass: 'VEHICLE_EQUIPMENT', details, acquisitionCost: 10_000_000, acquisitionDate: yearsAgo(2) }),
      AS_OF
    );
    expect(result).toMatchObject({ ok: true, amount: 6_400_000, method: 'DEPRECIATION_LINEAR' });
    if (result.ok) expect(result.assumptions).toContainEqual({ key: 'usefulLifeYears', value: 5 });
  });

  it('ne descend jamais sous la valeur résiduelle', () => {
    const result = suggestValuation(
      input({ assetClass: 'VEHICLE_EQUIPMENT', details, acquisitionCost: 10_000_000, acquisitionDate: yearsAgo(20) }),
      AS_OF
    );
    expect(result).toMatchObject({ ok: true, amount: 1_000_000 });
  });

  it('résiduelle par défaut : 0', () => {
    const result = suggestValuation(
      input({
        assetClass: 'VEHICLE_EQUIPMENT',
        details: { kind: 'a', usefulLifeYears: 4 },
        acquisitionCost: 8_000_000,
        acquisitionDate: yearsAgo(2)
      }),
      AS_OF
    );
    expect(result).toMatchObject({ ok: true, amount: 4_000_000 });
  });

  it('amortissement dégressif avec plancher résiduel', () => {
    const declining = {
      kind: 'a',
      depreciationMethod: 'DECLINING',
      decliningRatePercent: 20,
      residualValuePercent: 10
    };
    const base = { assetClass: 'VEHICLE_EQUIPMENT' as const, details: declining, acquisitionCost: 10_000_000 };
    expect(suggestValuation(input({ ...base, acquisitionDate: yearsAgo(2) }), AS_OF)).toMatchObject({
      ok: true,
      amount: 6_400_000,
      method: 'DEPRECIATION_DECLINING'
    });
    expect(suggestValuation(input({ ...base, acquisitionDate: yearsAgo(30) }), AS_OF)).toMatchObject({
      ok: true,
      amount: 1_000_000
    });
  });

  it('liste les champs manquants', () => {
    expect(suggestValuation(input({ assetClass: 'VEHICLE_EQUIPMENT', details: { kind: 'a' } }), AS_OF)).toEqual({
      ok: false,
      missing: ['acquisitionCost', 'acquisitionDate', 'usefulLifeYears']
    });
    expect(
      suggestValuation(
        input({
          assetClass: 'VEHICLE_EQUIPMENT',
          details: { kind: 'a', depreciationMethod: 'DECLINING' },
          acquisitionCost: 1,
          acquisitionDate: yearsAgo(1)
        }),
        AS_OF
      )
    ).toEqual({ ok: false, missing: ['decliningRatePercent'] });
  });

  it('refuse une date d’acquisition postérieure à la date de calcul', () => {
    const result = suggestValuation(
      input({
        assetClass: 'VEHICLE_EQUIPMENT',
        details,
        acquisitionCost: 1,
        acquisitionDate: new Date(AS_OF.getTime() + DAY)
      }),
      AS_OF
    );
    expect(result).toEqual({ ok: false, missing: [], reason: 'ACQUISITION_DATE_IN_FUTURE' });
  });
});

describe('BUSINESS_EQUITY', () => {
  const base = { companyName: 'X', legalForm: 'SARL', country: 'CI', ownershipPercent: 30 };

  it('30 % de 200 000 000 = 60 000 000', () => {
    const result = suggestValuation(
      input({ assetClass: 'BUSINESS_EQUITY', details: { ...base, companyValue: 200_000_000 } }),
      AS_OF
    );
    expect(result).toMatchObject({ ok: true, amount: 60_000_000, method: 'EQUITY_SHARE' });
  });

  it('retombe sur résultat net × multiple', () => {
    const result = suggestValuation(
      input({ assetClass: 'BUSINESS_EQUITY', details: { ...base, netIncome: 20_000_000, earningsMultiple: 5 } }),
      AS_OF
    );
    expect(result).toMatchObject({ ok: true, amount: 30_000_000 });
  });

  it('refuse sans valeur d’entreprise exploitable', () => {
    expect(suggestValuation(input({ assetClass: 'BUSINESS_EQUITY', details: base }), AS_OF)).toEqual({
      ok: false,
      missing: ['companyValue']
    });
    expect(
      suggestValuation(input({ assetClass: 'BUSINESS_EQUITY', details: { ...base, netIncome: 10 } }), AS_OF)
    ).toEqual({ ok: false, missing: ['companyValue'] });
  });
});

describe('INVENTORY', () => {
  it('120 × 8 500, décote 10 % = 918 000', () => {
    const details = { designation: 'Ciment', quantity: 120, unit: 'sac', unitCost: 8_500, writeDownPercent: 10 };
    expect(suggestValuation(input({ assetClass: 'INVENTORY', details }), AS_OF)).toMatchObject({
      ok: true,
      amount: 918_000,
      method: 'UNIT_COST'
    });
  });

  it('décote absente : 0 %', () => {
    const details = { quantity: 120, unitCost: 8_500 };
    expect(suggestValuation(input({ assetClass: 'INVENTORY', details }), AS_OF)).toMatchObject({ amount: 1_020_000 });
  });

  it('signale la quantité manquante', () => {
    expect(suggestValuation(input({ assetClass: 'INVENTORY', details: { unitCost: 1 } }), AS_OF)).toEqual({
      ok: false,
      missing: ['quantity']
    });
  });
});

describe('SAVINGS_INVESTMENT', () => {
  const details = { savingsKind: 'PLACEMENT', expectedRatePercent: 6, principal: 5_000_000 };

  it('5 000 000 à 6 % sur 6 mois = 5 147 815', () => {
    const result = suggestValuation(
      input({
        assetClass: 'SAVINGS_INVESTMENT',
        details,
        lastValuation: { valuatedAt: yearsAgo(0.5), estimatedValue: 5_000_000 }
      }),
      AS_OF
    );
    expect(result).toMatchObject({ ok: true, amount: 5_147_815, method: 'ACCRUED_SAVINGS' });
  });

  it('sans valorisation : capital `principal` capitalisé depuis la date d’acquisition', () => {
    const result = suggestValuation(
      input({ assetClass: 'SAVINGS_INVESTMENT', details, acquisitionDate: yearsAgo(0.5) }),
      AS_OF
    );
    expect(result).toMatchObject({ ok: true, amount: 5_147_815 });
  });

  it('la dernière valorisation prime sur `principal`', () => {
    const result = suggestValuation(
      input({
        assetClass: 'SAVINGS_INVESTMENT',
        details,
        lastValuation: { valuatedAt: yearsAgo(1), estimatedValue: 1_000_000 }
      }),
      AS_OF
    );
    expect(result).toMatchObject({ amount: 1_060_000 });
  });

  it('liste capital et taux manquants', () => {
    expect(
      suggestValuation(input({ assetClass: 'SAVINGS_INVESTMENT', details: {}, acquisitionDate: yearsAgo(1) }), AS_OF)
    ).toEqual({ ok: false, missing: ['principal', 'expectedRatePercent'] });
  });
});

describe('RECEIVABLE', () => {
  it('4 000 000 recouvrable à 75 % = 3 000 000', () => {
    const details = { debtor: 'Awa', principal: 4_000_000, collectibilityPercent: 75 };
    expect(suggestValuation(input({ assetClass: 'RECEIVABLE', details }), AS_OF)).toMatchObject({
      ok: true,
      amount: 3_000_000,
      method: 'DISCOUNTED_CLAIM'
    });
  });

  it('exige capital et taux de recouvrement', () => {
    expect(suggestValuation(input({ assetClass: 'RECEIVABLE', details: { debtor: 'A' } }), AS_OF)).toEqual({
      ok: false,
      missing: ['principal', 'collectibilityPercent']
    });
  });
});

describe('AGRICULTURE', () => {
  it('élevage : effectif × valeur unitaire', () => {
    const details = { agricultureKind: 'LIVESTOCK', headcount: 40, unitValue: 150_000 };
    expect(suggestValuation(input({ assetClass: 'AGRICULTURE', details }), AS_OF)).toMatchObject({
      ok: true,
      amount: 6_000_000,
      method: 'UNIT_VALUE'
    });
  });

  it('plantation : surface × valeur unitaire', () => {
    const details = { agricultureKind: 'PLANTATION', areaHectares: 2.5, unitValue: 1_000_000 };
    expect(suggestValuation(input({ assetClass: 'AGRICULTURE', details }), AS_OF)).toMatchObject({ amount: 2_500_000 });
  });

  it('récolte : effectif comme quantité', () => {
    const details = { agricultureKind: 'HARVEST', headcount: 10, unitValue: 5_000 };
    expect(suggestValuation(input({ assetClass: 'AGRICULTURE', details }), AS_OF)).toMatchObject({ amount: 50_000 });
  });

  it('signale la quantité propre au type', () => {
    expect(
      suggestValuation(
        input({ assetClass: 'AGRICULTURE', details: { agricultureKind: 'PLANTATION', unitValue: 1 } }),
        AS_OF
      )
    ).toEqual({ ok: false, missing: ['areaHectares'] });
    expect(
      suggestValuation(input({ assetClass: 'AGRICULTURE', details: { agricultureKind: 'LIVESTOCK' } }), AS_OF)
    ).toEqual({ ok: false, missing: ['headcount', 'unitValue'] });
  });
});

describe('classes sans méthode calculable', () => {
  it.each(['MOVABLE', 'OTHER', 'REAL_ESTATE'] as const)('%s : ok false, aucun champ manquant', assetClass => {
    expect(suggestValuation(input({ assetClass }), AS_OF)).toEqual({ ok: false, missing: [] });
  });

  it('CASH : invite à saisir le solde', () => {
    expect(suggestValuation(input({ assetClass: 'CASH' }), AS_OF)).toEqual({ ok: false, missing: ['balance'] });
  });
});

describe('date d’acquisition future : seules les classes qui l’utilisent la refusent', () => {
  const future = new Date(AS_OF.getTime() + DAY);

  it('épargne sans valorisation : refus motivé', () => {
    const details = { savingsKind: 'PLACEMENT', expectedRatePercent: 6, principal: 5_000_000 };
    expect(
      suggestValuation(input({ assetClass: 'SAVINGS_INVESTMENT', details, acquisitionDate: future }), AS_OF)
    ).toEqual({ ok: false, missing: [], reason: 'ACQUISITION_DATE_IN_FUTURE' });
  });

  it('épargne avec valorisation antérieure : la date d’acquisition future est ignorée', () => {
    const details = { savingsKind: 'PLACEMENT', expectedRatePercent: 6 };
    const result = suggestValuation(
      input({
        assetClass: 'SAVINGS_INVESTMENT',
        details,
        acquisitionDate: future,
        lastValuation: { valuatedAt: yearsAgo(1), estimatedValue: 1_000_000 }
      }),
      AS_OF
    );
    expect(result).toMatchObject({ ok: true, amount: 1_060_000 });
  });

  it('stock, créance, entreprise, agriculture : la date d’acquisition future n’empêche rien', () => {
    expect(
      suggestValuation(
        input({
          assetClass: 'RECEIVABLE',
          details: { principal: 100, collectibilityPercent: 50 },
          acquisitionDate: future
        }),
        AS_OF
      )
    ).toMatchObject({ ok: true, amount: 50 });
    expect(
      suggestValuation(
        input({ assetClass: 'INVENTORY', details: { quantity: 2, unitCost: 10 }, acquisitionDate: future }),
        AS_OF
      )
    ).toMatchObject({ ok: true, amount: 20 });
  });
});

describe('montant nul ou hors bornes', () => {
  it('stock de quantité 0 : ZERO_VALUE', () => {
    expect(suggestValuation(input({ assetClass: 'INVENTORY', details: { quantity: 0, unitCost: 10 } }), AS_OF)).toEqual(
      {
        ok: false,
        missing: [],
        reason: 'ZERO_VALUE'
      }
    );
  });

  it('décote de 100 % : ZERO_VALUE', () => {
    expect(
      suggestValuation(
        input({ assetClass: 'INVENTORY', details: { quantity: 5, unitCost: 10, writeDownPercent: 100 } }),
        AS_OF
      )
    ).toMatchObject({ ok: false, reason: 'ZERO_VALUE' });
  });

  it('véhicule totalement amorti sans résiduelle : ZERO_VALUE', () => {
    expect(
      suggestValuation(
        input({
          assetClass: 'VEHICLE_EQUIPMENT',
          details: { kind: 'a', usefulLifeYears: 4 },
          acquisitionCost: 8_000_000,
          acquisitionDate: yearsAgo(10)
        }),
        AS_OF
      )
    ).toEqual({ ok: false, missing: [], reason: 'ZERO_VALUE' });
  });

  it('épargne à 100 % sur 7 979 ans : le calcul déborde en Infinity, OUT_OF_RANGE', () => {
    expect(
      suggestValuation(
        input({
          assetClass: 'SAVINGS_INVESTMENT',
          details: { savingsKind: 'PLACEMENT', expectedRatePercent: 100, principal: 1000 },
          acquisitionDate: yearsAgo(7979)
        }),
        AS_OF
      )
    ).toEqual({ ok: false, missing: [], reason: 'OUT_OF_RANGE' });
  });

  it('au-delà de 999 999 999 999,99 : OUT_OF_RANGE', () => {
    expect(
      suggestValuation(
        input({ assetClass: 'AGRICULTURE', details: { agricultureKind: 'LIVESTOCK', headcount: 1e12, unitValue: 10 } }),
        AS_OF
      )
    ).toMatchObject({ ok: false, reason: 'OUT_OF_RANGE' });
  });

  it('exactement le plafond : accepté', () => {
    expect(
      suggestValuation(
        input({
          assetClass: 'AGRICULTURE',
          currency: 'EUR',
          details: { agricultureKind: 'LIVESTOCK', headcount: 1, unitValue: 999_999_999_999.99 }
        }),
        AS_OF
      )
    ).toMatchObject({ ok: true, amount: 999_999_999_999.99 });
  });
});

describe('arrondi selon la devise', () => {
  const details = { agricultureKind: 'LIVESTOCK', headcount: 1, unitValue: 1234.56 };

  it('XOF : au franc', () => {
    expect(suggestValuation(input({ assetClass: 'AGRICULTURE', details }), AS_OF)).toMatchObject({ amount: 1235 });
  });

  it('EUR : 1 234,56 reste 1 234,56', () => {
    expect(suggestValuation(input({ assetClass: 'AGRICULTURE', details, currency: 'EUR' }), AS_OF)).toMatchObject({
      ok: true,
      amount: 1234.56
    });
  });
});
