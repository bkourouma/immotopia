/**
 * Bornes de taille, montants et dates des schémas du patrimoine multi-actifs :
 * une valeur hors colonne doit être refusée en validation, jamais en 500 Prisma.
 */
import {
  createAssetSchema,
  createAssetValuationSchema,
  createDebtSchema,
  disposeAssetSchema,
  setAssetHoldingSchema,
  suggestValuationSchema,
  updateAssetSchema,
  updateAssetValuationSchema,
  updateDebtSchema,
  validateAssetDetails,
  ASSET_DETAILS_MAX_BYTES,
  MAX_MONEY,
  parseStrictDate
} from '../../src/lib/patrimoine/asset-schemas';

const cashDetails = { institution: 'Banque', cashKind: 'BANK' };
const asset = { name: 'Compte', assetClass: 'CASH', details: cashDetails } as const;
const debt = {
  lender: 'Banque',
  capitalAmount: 100,
  remainingCapital: 50,
  interestRate: 5,
  monthlyPayment: 2,
  startDate: '2025-01-01',
  endDate: '2030-01-01'
};

const fieldsOf = (result: { success: boolean; error?: { issues: { path: (string | number)[] }[] } }) =>
  result.error?.issues.map(i => i.path.join('.')) ?? [];

describe('textes', () => {
  it('nom et source à 200 caractères, notes à 2000', () => {
    expect(createAssetSchema.safeParse({ ...asset, name: 'a'.repeat(200), notes: 'n'.repeat(2000) }).success).toBe(
      true
    );
    expect(createAssetSchema.safeParse({ ...asset, name: 'a'.repeat(201) }).success).toBe(false);
    expect(createAssetSchema.safeParse({ ...asset, notes: 'n'.repeat(2001) }).success).toBe(false);
    const valuation = { valuatedAt: '2026-01-01', estimatedValue: 1 };
    expect(createAssetValuationSchema.safeParse({ ...valuation, source: 's'.repeat(200) }).success).toBe(true);
    expect(createAssetValuationSchema.safeParse({ ...valuation, source: 's'.repeat(201) }).success).toBe(false);
    expect(createDebtSchema.safeParse({ ...debt, lender: 'b'.repeat(201) }).success).toBe(false);
  });

  it('les textes des details sont bornés à 200 caractères', () => {
    expect(() => validateAssetDetails('CASH', { ...cashDetails, institution: 'i'.repeat(200) })).not.toThrow();
    expect(() => validateAssetDetails('CASH', { ...cashDetails, institution: 'i'.repeat(201) })).toThrow(
      expect.objectContaining({ errors: [{ field: 'details.institution', message: expect.any(String) }] })
    );
  });

  it('refuse des details de plus de 8 Ko sérialisés, avec le champ details', () => {
    expect(ASSET_DETAILS_MAX_BYTES).toBe(8192);
    const big = { ...cashDetails, extra: 'x'.repeat(ASSET_DETAILS_MAX_BYTES) };
    expect(() => validateAssetDetails('CASH', big)).toThrow(
      expect.objectContaining({
        name: 'ValidationError',
        statusCode: 422,
        errors: [{ field: 'details', message: expect.any(String) }]
      })
    );
  });
});

describe('montants et taux', () => {
  it('borne les montants à la colonne Decimal(14,2)', () => {
    const valuation = { valuatedAt: '2026-01-01' };
    expect(createAssetValuationSchema.safeParse({ ...valuation, estimatedValue: MAX_MONEY }).success).toBe(true);
    expect(createAssetValuationSchema.safeParse({ ...valuation, estimatedValue: MAX_MONEY + 1 }).success).toBe(false);
    expect(createAssetValuationSchema.safeParse({ ...valuation, estimatedValue: 1e300 }).success).toBe(false);
    expect(createAssetSchema.safeParse({ ...asset, acquisitionCost: 1e13 }).success).toBe(false);
    for (const field of ['capitalAmount', 'remainingCapital', 'monthlyPayment'] as const) {
      expect(createDebtSchema.safeParse({ ...debt, [field]: 1e13 }).success).toBe(false);
    }
  });

  it('refuse Infinity et NaN', () => {
    expect(createAssetValuationSchema.safeParse({ valuatedAt: '2026-01-01', estimatedValue: Infinity }).success).toBe(
      false
    );
    expect(createAssetValuationSchema.safeParse({ valuatedAt: '2026-01-01', estimatedValue: NaN }).success).toBe(false);
    expect(createDebtSchema.safeParse({ ...debt, interestRate: Infinity }).success).toBe(false);
    expect(createAssetSchema.safeParse({ ...asset, currency: 'EUR', exchangeRateToXof: Infinity }).success).toBe(false);
  });

  it('interestRate <= 99,9999 et taux de change entre 0,000001 et 1 milliard', () => {
    expect(createDebtSchema.safeParse({ ...debt, interestRate: 99.9999 }).success).toBe(true);
    expect(createDebtSchema.safeParse({ ...debt, interestRate: 100 }).success).toBe(false);
    const eur = { ...asset, currency: 'EUR' };
    expect(createAssetSchema.safeParse({ ...eur, exchangeRateToXof: 0.000001 }).success).toBe(true);
    expect(createAssetSchema.safeParse({ ...eur, exchangeRateToXof: 0.0000001 }).success).toBe(false);
    expect(createAssetSchema.safeParse({ ...eur, exchangeRateToXof: 1_000_000_000 }).success).toBe(true);
    expect(createAssetSchema.safeParse({ ...eur, exchangeRateToXof: 1_000_000_001 }).success).toBe(false);
    expect(updateDebtSchema.safeParse({ interestRate: 1000 }).success).toBe(false);
  });

  it('les montants des details sont finis et plafonnés', () => {
    expect(() =>
      validateAssetDetails('INVENTORY', { designation: 'd', unit: 'u', quantity: 1e15, unitCost: 1 })
    ).toThrow();
    expect(() =>
      validateAssetDetails('INVENTORY', { designation: 'd', unit: 'u', quantity: 1, unitCost: Infinity })
    ).toThrow();
  });
});

describe('dates', () => {
  it('accepte AAAA-MM-JJ et une date-heure ISO, produit un Date', () => {
    const parsed = createAssetValuationSchema.parse({ valuatedAt: '2026-01-31', estimatedValue: 1 });
    expect(parsed.valuatedAt.toISOString()).toBe('2026-01-31T00:00:00.000Z');
    expect(
      createAssetValuationSchema
        .parse({ valuatedAt: '2026-01-31T10:00:00Z', estimatedValue: 1 })
        .valuatedAt.toISOString()
    ).toBe('2026-01-31T10:00:00.000Z');
    expect(disposeAssetSchema.safeParse({ disposedAt: '2026-03-01' }).success).toBe(true);
  });

  it.each([
    null,
    0,
    1735689600000,
    true,
    false,
    {},
    [],
    '',
    'demain',
    '2026-02-30',
    '2026-13-01',
    '01/02/2026',
    '1899-12-31',
    '2101-01-01'
  ])('refuse %p pour une date obligatoire', value => {
    expect(createAssetValuationSchema.safeParse({ valuatedAt: value, estimatedValue: 1 }).success).toBe(false);
    expect(disposeAssetSchema.safeParse({ disposedAt: value }).success).toBe(false);
    expect(createDebtSchema.safeParse({ ...debt, startDate: value }).success).toBe(false);
  });

  it('bornes 1900-01-01 et 2100-12-31 incluses', () => {
    expect(parseStrictDate('1900-01-01')).not.toBeNull();
    expect(parseStrictDate('2100-12-31')).not.toBeNull();
    expect(parseStrictDate('2100-12-31T23:59:59.999Z')).not.toBeNull();
    expect(parseStrictDate('2101-01-01T00:00:00Z')).toBeNull();
  });

  it('les dates facultatives refusent nombres et booléens mais gardent null pour effacer', () => {
    expect(updateAssetSchema.safeParse({ acquisitionDate: null }).success).toBe(true);
    expect(updateAssetSchema.safeParse({ acquisitionDate: 0 }).success).toBe(false);
    expect(updateAssetSchema.safeParse({ acquisitionDate: false }).success).toBe(false);
    expect(setAssetHoldingSchema.safeParse({ sharePercent: 10, effectiveFrom: 5 }).success).toBe(false);
    expect(setAssetHoldingSchema.safeParse({ sharePercent: 10, effectiveFrom: null }).success).toBe(true);
    expect(fieldsOf(updateAssetSchema.safeParse({ acquisitionDate: 12 }))).toEqual(['acquisitionDate']);
  });
});

describe('valorisations (lot 2)', () => {
  const valuation = { valuatedAt: '2026-01-01', estimatedValue: 10 };

  it('accepte les 11 méthodes et refuse une méthode inconnue', () => {
    const methods = [
      'MANUAL',
      'MARKET_ESTIMATE',
      'EXPERT_APPRAISAL',
      'DEPRECIATION_LINEAR',
      'DEPRECIATION_DECLINING',
      'EQUITY_SHARE',
      'UNIT_COST',
      'BALANCE',
      'ACCRUED_SAVINGS',
      'DISCOUNTED_CLAIM',
      'UNIT_VALUE'
    ];
    for (const method of methods) {
      expect(createAssetValuationSchema.safeParse({ ...valuation, method }).success).toBe(true);
    }
    expect(createAssetValuationSchema.safeParse({ ...valuation, method: 'MAGIC' }).success).toBe(false);
  });

  it('refuse reliability et reliabilityReasons dans le corps (création et modification)', () => {
    for (const extra of [{ reliability: 'HIGH' }, { reliabilityReasons: ['METHOD_EXPERT'] }]) {
      expect(createAssetValuationSchema.safeParse({ ...valuation, ...extra }).success).toBe(false);
      expect(updateAssetValuationSchema.safeParse({ estimatedValue: 1, ...extra }).success).toBe(false);
      expect(createAssetSchema.safeParse({ ...asset, initialValuation: { ...valuation, ...extra } }).success).toBe(
        false
      );
    }
  });

  it('suggestion : asOf facultatif au format AAAA-MM-JJ, champs inconnus refusés', () => {
    expect(suggestValuationSchema.safeParse({}).success).toBe(true);
    expect(suggestValuationSchema.safeParse({ asOf: '2026-06-30' }).success).toBe(true);
    expect(suggestValuationSchema.safeParse({ asOf: 'hier' }).success).toBe(false);
    expect(suggestValuationSchema.safeParse({ asOf: '2026-06-30', amount: 1 }).success).toBe(false);
  });
});
