import { applyShare, computeTax } from '../../src/lib/patrimoine/tax/engine';
import type { TaxContext, TaxEngineInput, TaxParameterRow } from '../../src/lib/patrimoine/tax/types';

function param(overrides: Partial<TaxParameterRow> & Pick<TaxParameterRow, 'id' | 'key'>): TaxParameterRow {
  return {
    country: 'CI',
    year: 2026,
    taxKind: 'PROPERTY_TAX',
    propertyKind: 'ANY',
    occupancy: 'ANY',
    ownerKind: 'ANY',
    bracketIndex: 0,
    lowerBound: null,
    upperBound: null,
    value: null,
    valueText: null,
    unit: 'PERCENT',
    label: overrides.id,
    source: 'Fixture fictive',
    sourceUrl: null,
    status: 'VALIDE',
    notes: null,
    ...overrides
  };
}

const CTX: TaxContext = { propertyKind: 'BUILT', occupancy: 'RENTED', ownerKind: 'INDIVIDUAL' };

function baseInput(overrides: Partial<TaxEngineInput> = {}): TaxEngineInput {
  return {
    country: 'CI',
    fiscalYear: 2026,
    propertyKind: CTX.propertyKind,
    occupancy: CTX.occupancy,
    ownerKind: CTX.ownerKind,
    annualRent: 1_000_000,
    declaredRentalValue: null,
    marketValue: null,
    exemptUntilYear: null,
    ...overrides
  };
}

describe('computeTax — bâti loué, cas nominal (taux fictif 10 %)', () => {
  const rows: TaxParameterRow[] = [
    param({ id: 'base', key: 'base', valueText: 'RENTAL_VALUE', unit: 'CODE' }),
    param({ id: 'rate', key: 'rate', value: 10 })
  ];

  it('calcule le principal : 1 000 000 × 10 % = 100 000', () => {
    const result = computeTax('PROPERTY_TAX', baseInput(), rows);

    expect(result.applicable).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.amountFull).toBe(100_000);
    expect(result.baseKind).toBe('RENTAL_VALUE');
    expect(result.lines.map(l => l.code)).toEqual(['BASE', 'TAXABLE_BASE', 'PRINCIPAL']);
    expect(result.allParametersValidated).toBe(true);
  });
});

describe('computeTax — base', () => {
  it('NO_BASE : valeur vénale nulle pour un bien non bâti (MARKET_VALUE)', () => {
    const rows: TaxParameterRow[] = [
      param({ id: 'base', key: 'base', valueText: 'MARKET_VALUE', unit: 'CODE', propertyKind: 'UNBUILT' }),
      param({ id: 'rate', key: 'rate', propertyKind: 'UNBUILT', value: 10 })
    ];

    const result = computeTax(
      'PROPERTY_TAX',
      baseInput({ propertyKind: 'UNBUILT', occupancy: 'VACANT', annualRent: 0, marketValue: null }),
      rows
    );

    expect(result.reason).toBe('NO_BASE');
    expect(result.applicable).toBe(true);
    expect(result.amountFull).toBe(0);
    expect(result.warnings).toContain('NO_MARKET_VALUE');
  });

  it("valeur locative estimée par ratio quand aucun loyer n'est connu (avertissement RENTAL_VALUE_ESTIMATED)", () => {
    const rows: TaxParameterRow[] = [
      param({ id: 'base', key: 'base', valueText: 'RENTAL_VALUE', unit: 'CODE' }),
      param({ id: 'ratio', key: 'rental_value_ratio', value: 6 }),
      param({ id: 'rate', key: 'rate', value: 10 })
    ];

    const result = computeTax(
      'PROPERTY_TAX',
      baseInput({ occupancy: 'OWNER_OCCUPIED', annualRent: 0, declaredRentalValue: null, marketValue: 50_000_000 }),
      rows
    );

    // 50 000 000 × 6 % = 3 000 000 de base estimée, × 10 % = 300 000.
    expect(result.warnings).toContain('RENTAL_VALUE_ESTIMATED');
    expect(result.amountFull).toBe(300_000);
  });

  it('la valeur locative saisie (déclarée) est prioritaire sur le loyer et le ratio', () => {
    const rows: TaxParameterRow[] = [
      param({ id: 'base', key: 'base', valueText: 'RENTAL_VALUE', unit: 'CODE' }),
      param({ id: 'ratio', key: 'rental_value_ratio', value: 6 }),
      param({ id: 'rate', key: 'rate', value: 10 })
    ];

    const result = computeTax(
      'PROPERTY_TAX',
      baseInput({ annualRent: 1_000_000, declaredRentalValue: 2_000_000, marketValue: 50_000_000 }),
      rows
    );

    expect(result.warnings).not.toContain('RENTAL_VALUE_ESTIMATED');
    // Valeur déclarée 2 000 000 × 10 % = 200 000, pas le loyer (1 000 000).
    expect(result.amountFull).toBe(200_000);
  });

  it('base inconnue (code non reconnu) → avertissement UNKNOWN_BASE_KIND et raison NO_BASE', () => {
    const rows: TaxParameterRow[] = [
      param({ id: 'base', key: 'base', valueText: 'SOMETHING_ELSE', unit: 'CODE' }),
      param({ id: 'rate', key: 'rate', value: 10 })
    ];

    const result = computeTax('PROPERTY_TAX', baseInput(), rows);

    expect(result.warnings).toContain('UNKNOWN_BASE_KIND');
    expect(result.reason).toBe('NO_BASE');
    expect(result.amountFull).toBe(0);
  });
});

describe('computeTax — abattement et arrondi de base', () => {
  it("applique un abattement avant de calculer l'impôt", () => {
    const rows: TaxParameterRow[] = [
      param({ id: 'base', key: 'base', valueText: 'RENTAL_VALUE', unit: 'CODE' }),
      param({ id: 'abatement', key: 'abatement_rate', value: 20 }),
      param({ id: 'rate', key: 'rate', value: 10 })
    ];

    const result = computeTax('PROPERTY_TAX', baseInput({ annualRent: 1_000_000 }), rows);

    // Base 1 000 000, abattement 20 % → base imposable 800 000, impôt 10 % = 80 000.
    const abatementLine = result.lines.find(l => l.code === 'ABATEMENT');
    expect(abatementLine).toBeDefined();
    expect(abatementLine?.amount).toBe(-200_000);
    expect(result.amountFull).toBe(80_000);
  });

  it('arrondit la base imposable au multiple inférieur (base_rounding_down)', () => {
    const rows: TaxParameterRow[] = [
      param({ id: 'base', key: 'base', valueText: 'RENTAL_VALUE', unit: 'CODE' }),
      param({ id: 'rounding', key: 'base_rounding_down', value: 1000, unit: 'AMOUNT' }),
      param({ id: 'rate', key: 'rate', value: 10 })
    ];

    const result = computeTax('PROPERTY_TAX', baseInput({ annualRent: 1_234_567 }), rows);

    const taxableBaseLine = result.lines.find(l => l.code === 'TAXABLE_BASE');
    expect(taxableBaseLine?.amount).toBe(1_234_000);
    expect(result.amountFull).toBe(123_400);
  });
});

describe('computeTax — tranches et minimum', () => {
  const rows: TaxParameterRow[] = [
    param({ id: 'base', key: 'base', valueText: 'RENTAL_VALUE', unit: 'CODE' }),
    param({ id: 'b0', key: 'bracket_rate', bracketIndex: 0, lowerBound: 0, upperBound: 500_000, value: 5 }),
    param({ id: 'b1', key: 'bracket_rate', bracketIndex: 1, lowerBound: 500_000, upperBound: null, value: 10 }),
    param({ id: 'minimum', key: 'minimum_amount', value: 60_000, unit: 'AMOUNT' })
  ];

  it('calcule un impôt progressif par tranches', () => {
    // 500 000 × 5 % + 500 000 × 10 % = 25 000 + 50 000 = 75 000 (> minimum).
    const result = computeTax('PROPERTY_TAX', baseInput({ annualRent: 1_000_000 }), rows);

    expect(result.lines.filter(l => l.code === 'BRACKET')).toHaveLength(2);
    expect(result.amountFull).toBe(75_000);
    expect(result.lines.some(l => l.code === 'MINIMUM')).toBe(false);
  });

  it('applique le minimum quand le calcul par tranches est inférieur', () => {
    // Base 300 000 : 300 000 × 5 % = 15 000, inférieur au minimum 60 000.
    const result = computeTax('PROPERTY_TAX', baseInput({ annualRent: 300_000 }), rows);

    expect(result.amountFull).toBe(60_000);
    const minimumLine = result.lines.find(l => l.code === 'MINIMUM');
    expect(minimumLine).toBeDefined();
    expect(minimumLine?.amount).toBe(45_000);
  });
});

describe('computeTax — surtaxes', () => {
  it("applique une surtaxe sur l'impôt (surcharge_on_tax_rate) et une sur la base (surcharge_on_base_rate)", () => {
    const rows: TaxParameterRow[] = [
      param({ id: 'base', key: 'base', valueText: 'RENTAL_VALUE', unit: 'CODE' }),
      param({ id: 'rate', key: 'rate', value: 10 }),
      param({ id: 'sur-tax', key: 'surcharge_on_tax_rate', value: 5 }),
      param({ id: 'sur-base', key: 'surcharge_on_base_rate', value: 1 })
    ];

    // Base 1 000 000 → principal 100 000.
    // Surtaxe sur impôt : 100 000 × 5 % = 5 000.
    // Surtaxe sur base : 1 000 000 × 1 % = 10 000.
    // Total = 100 000 + 5 000 + 10 000 = 115 000.
    const result = computeTax('PROPERTY_TAX', baseInput({ annualRent: 1_000_000 }), rows);

    expect(result.lines.filter(l => l.code === 'SURCHARGE')).toHaveLength(2);
    expect(result.amountFull).toBe(115_000);
  });
});

describe('computeTax — applicabilité et exemptions', () => {
  it('applicable = 0 → NOT_APPLICABLE, montant 0', () => {
    const rows: TaxParameterRow[] = [
      param({ id: 'applicable', key: 'applicable', value: 0, unit: 'BOOLEAN' }),
      param({ id: 'base', key: 'base', valueText: 'RENTAL_VALUE', unit: 'CODE' }),
      param({ id: 'rate', key: 'rate', value: 10 })
    ];

    const result = computeTax('PROPERTY_TAX', baseInput(), rows);

    expect(result.applicable).toBe(false);
    expect(result.reason).toBe('NOT_APPLICABLE');
    expect(result.amountFull).toBe(0);
  });

  it('exempt = 1 → EXEMPT avec une ligne EXEMPTION sourcée, montant 0', () => {
    const rows: TaxParameterRow[] = [
      param({ id: 'exempt', key: 'exempt', value: 1, unit: 'BOOLEAN', source: 'Article fictif 42' }),
      param({ id: 'base', key: 'base', valueText: 'RENTAL_VALUE', unit: 'CODE' }),
      param({ id: 'rate', key: 'rate', value: 10 })
    ];

    const result = computeTax('PROPERTY_TAX', baseInput(), rows);

    expect(result.reason).toBe('EXEMPT');
    expect(result.amountFull).toBe(0);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0].code).toBe('EXEMPTION');
    expect(result.lines[0].source).toBe('Article fictif 42');
    expect(result.lines[0].parameterId).toBe('exempt');
  });

  it('exemptUntilYear = année courante → TEMPORARY_EXEMPTION', () => {
    const rows: TaxParameterRow[] = [
      param({ id: 'base', key: 'base', valueText: 'RENTAL_VALUE', unit: 'CODE' }),
      param({ id: 'rate', key: 'rate', value: 10 })
    ];

    const result = computeTax('PROPERTY_TAX', baseInput({ fiscalYear: 2026, exemptUntilYear: 2026 }), rows);

    expect(result.reason).toBe('TEMPORARY_EXEMPTION');
    expect(result.amountFull).toBe(0);
  });

  it("exemptUntilYear = année précédente (N+1 par rapport à l'exonération) → imposé normalement", () => {
    const rows: TaxParameterRow[] = [
      param({ id: 'base', key: 'base', valueText: 'RENTAL_VALUE', unit: 'CODE' }),
      param({ id: 'rate', key: 'rate', value: 10 })
    ];

    const result = computeTax(
      'PROPERTY_TAX',
      baseInput({ fiscalYear: 2027, exemptUntilYear: 2026, annualRent: 1_000_000 }),
      rows
    );

    expect(result.reason).toBeNull();
    expect(result.amountFull).toBe(100_000);
  });
});

describe('computeTax — pays et paramètres manquants', () => {
  it('pays nul → UNSUPPORTED_COUNTRY', () => {
    const result = computeTax('PROPERTY_TAX', baseInput({ country: null }), []);

    expect(result.reason).toBe('UNSUPPORTED_COUNTRY');
    expect(result.applicable).toBe(false);
    expect(result.amountFull).toBe(0);
  });

  it("pas de taux ni de tranches → NO_PARAMETERS avec l'avertissement MISSING_RATE", () => {
    const rows: TaxParameterRow[] = [param({ id: 'base', key: 'base', valueText: 'RENTAL_VALUE', unit: 'CODE' })];

    const result = computeTax('PROPERTY_TAX', baseInput(), rows);

    expect(result.reason).toBe('NO_PARAMETERS');
    expect(result.applicable).toBe(false);
    expect(result.warnings).toContain('MISSING_RATE');
  });
});

describe('computeTax — allParametersValidated', () => {
  it('vrai quand toutes les lignes utilisées sont VALIDE', () => {
    const rows: TaxParameterRow[] = [
      param({ id: 'base', key: 'base', valueText: 'RENTAL_VALUE', unit: 'CODE', status: 'VALIDE' }),
      param({ id: 'rate', key: 'rate', value: 10, status: 'VALIDE' })
    ];

    const result = computeTax('PROPERTY_TAX', baseInput(), rows);

    expect(result.allParametersValidated).toBe(true);
    expect(result.warnings).not.toContain('PARAMETERS_NOT_VALIDATED');
  });

  it("faux dès qu'une ligne utilisée est A_VALIDER", () => {
    const rows: TaxParameterRow[] = [
      param({ id: 'base', key: 'base', valueText: 'RENTAL_VALUE', unit: 'CODE', status: 'VALIDE' }),
      param({ id: 'rate', key: 'rate', value: 10, status: 'A_VALIDER' })
    ];

    const result = computeTax('PROPERTY_TAX', baseInput(), rows);

    expect(result.allParametersValidated).toBe(false);
    expect(result.warnings).toContain('PARAMETERS_NOT_VALIDATED');
  });
});

describe('applyShare', () => {
  const computations = [
    {
      taxKind: 'PROPERTY_TAX' as const,
      amountFull: 100_000,
      applicable: true,
      reason: null,
      parametersYear: 2026,
      parametersFallback: false,
      baseKind: null,
      lines: [],
      warnings: [],
      allParametersValidated: true
    },
    {
      taxKind: 'RENTAL_INCOME_TAX' as const,
      amountFull: 30_000,
      applicable: true,
      reason: null,
      parametersYear: 2026,
      parametersFallback: false,
      baseKind: null,
      lines: [],
      warnings: [],
      allParametersValidated: true
    }
  ];

  it('une part de 0 % donne 0', () => {
    const result = applyShare(computations, 0);
    expect(result.amountShareByKind.PROPERTY_TAX).toBe(0);
    expect(result.amountShareByKind.RENTAL_INCOME_TAX).toBe(0);
    expect(result.totalShare).toBe(0);
  });

  it('une part de 100 % donne le montant entier', () => {
    const result = applyShare(computations, 100);
    expect(result.amountShareByKind.PROPERTY_TAX).toBe(100_000);
    expect(result.amountShareByKind.RENTAL_INCOME_TAX).toBe(30_000);
    expect(result.totalShare).toBe(130_000);
  });

  it('une part de 33,3333 % est arrondie au franc CFA', () => {
    const result = applyShare(computations, 33.3333);
    // 100 000 × 0,333333 = 33 333,3 → 33 333 ; 30 000 × 0,333333 = 9 999,99 → 10 000.
    expect(result.amountShareByKind.PROPERTY_TAX).toBe(33_333);
    expect(result.amountShareByKind.RENTAL_INCOME_TAX).toBe(10_000);
    expect(result.totalShare).toBe(43_333);
  });
});

describe('arrondi XOF du montant final', () => {
  it('arrondit un montant non entier au franc le plus proche', () => {
    const rows: TaxParameterRow[] = [
      param({ id: 'base', key: 'base', valueText: 'GROSS_RENT', unit: 'CODE' }),
      param({ id: 'rate', key: 'rate', value: 3 })
    ];

    // 1 234 567 × 3 % = 37 037,01 → arrondi à 37 037.
    const result = computeTax('PROPERTY_TAX', baseInput({ annualRent: 1_234_567 }), rows);

    expect(result.amountFull).toBe(37_037);
  });
});
