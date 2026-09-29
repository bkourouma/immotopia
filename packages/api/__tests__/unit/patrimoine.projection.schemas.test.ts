import {
  projectionAssumptionsSchema,
  projectionRequestSchema,
  scenarioBodySchema,
  scenarioUpdateSchema,
  simulationOperationSchema
} from '../../src/lib/patrimoine/projection';

const sell = { type: 'SELL_ASSET', year: 1, assetId: 'a1' };

function paths(result: { success: boolean; error?: { issues: { path: (string | number)[] }[] } }): string[] {
  return result.error?.issues.map(issue => issue.path.join('.')) ?? [];
}

describe('schémas de projection', () => {
  it('accepte une requête minimale et une requête complète', () => {
    expect(projectionRequestSchema.safeParse({ horizonYears: 10, baseScenario: 'CENTRAL' }).success).toBe(true);
    const full = projectionRequestSchema.safeParse({
      horizonYears: 10,
      baseScenario: 'PRUDENT',
      assumptions: { growthPercentByClass: { REAL_ESTATE: -50, CASH: 100 }, inflationPercent: 100 },
      operations: [
        sell,
        { type: 'BUY_ASSET', year: 2, assetClass: 'REAL_ESTATE', name: 'Villa', price: 1000, growthPercent: 3 },
        { type: 'TAKE_LOAN', year: 3, amount: 1000, annualRatePercent: 8, termYears: 5 },
        { type: 'PREPAY_LOAN', year: 4, loanId: 'l1', amount: 10 },
        { type: 'MONTHLY_SAVING', fromYear: 1, toYear: 10, amount: 100 }
      ],
      compareScenarios: true
    });
    expect(full.success).toBe(true);
  });

  it('refuse les champs inconnus (strict)', () => {
    expect(projectionRequestSchema.safeParse({ horizonYears: 5, baseScenario: 'CENTRAL', extra: 1 }).success).toBe(
      false
    );
    expect(simulationOperationSchema.safeParse({ ...sell, extra: 1 }).success).toBe(false);
    expect(projectionAssumptionsSchema.safeParse({ growthPercentByClass: { FOO: 1 } }).success).toBe(false);
  });

  it('borne l’horizon : entier de 1 à 30', () => {
    for (const horizonYears of [0, 31, 2.5]) {
      expect(projectionRequestSchema.safeParse({ horizonYears, baseScenario: 'CENTRAL' }).success).toBe(false);
    }
    for (const horizonYears of [1, 30]) {
      expect(projectionRequestSchema.safeParse({ horizonYears, baseScenario: 'CENTRAL' }).success).toBe(true);
    }
  });

  it('borne les hypothèses', () => {
    expect(projectionAssumptionsSchema.safeParse({ growthPercentByClass: { REAL_ESTATE: -50.1 } }).success).toBe(false);
    expect(projectionAssumptionsSchema.safeParse({ growthPercentByClass: { REAL_ESTATE: 100.1 } }).success).toBe(false);
    expect(projectionAssumptionsSchema.safeParse({ inflationPercent: -1 }).success).toBe(false);
    expect(projectionAssumptionsSchema.safeParse({ inflationPercent: 101 }).success).toBe(false);
  });

  it('borne les montants, taux, durées et noms des opérations', () => {
    const bad = [
      { ...sell, salePrice: 0 },
      { ...sell, salePrice: 1_000_000_000_000 },
      { ...sell, feesPercent: 101 },
      { ...sell, year: 0 },
      { type: 'BUY_ASSET', year: 1, assetClass: 'CASH', name: 'x'.repeat(201), price: 10 },
      { type: 'BUY_ASSET', year: 1, assetClass: 'CASH', name: '', price: 10 },
      { type: 'BUY_ASSET', year: 1, assetClass: 'CASH', name: 'x', price: -5 },
      { type: 'TAKE_LOAN', year: 1, amount: 10, annualRatePercent: 101, termYears: 5 },
      { type: 'TAKE_LOAN', year: 1, amount: 10, annualRatePercent: 5, termYears: 31 },
      { type: 'PREPAY_LOAN', year: 1, loanId: 'l', amount: 0 },
      { type: 'MONTHLY_SAVING', fromYear: 1, amount: 0 }
    ];
    for (const op of bad) expect(simulationOperationSchema.safeParse(op).success).toBe(false);
    expect(simulationOperationSchema.safeParse({ ...sell, salePrice: 999_999_999_999.99 }).success).toBe(true);
  });

  it('refuse plus de 50 opérations', () => {
    const operations = Array.from({ length: 51 }, () => sell);
    expect(projectionRequestSchema.safeParse({ horizonYears: 5, baseScenario: 'CENTRAL', operations }).success).toBe(
      false
    );
    expect(
      projectionRequestSchema.safeParse({ horizonYears: 5, baseScenario: 'CENTRAL', operations: operations.slice(1) })
        .success
    ).toBe(true);
  });

  it('reporte year hors horizon sur operations.<i>.year', () => {
    const result = projectionRequestSchema.safeParse({
      horizonYears: 5,
      baseScenario: 'CENTRAL',
      operations: [sell, { ...sell, year: 6 }]
    });
    expect(result.success).toBe(false);
    expect(paths(result)).toEqual(['operations.1.year']);
  });

  it('reporte fromYear et toYear incohérents sur leur champ', () => {
    const result = projectionRequestSchema.safeParse({
      horizonYears: 5,
      baseScenario: 'CENTRAL',
      operations: [
        { type: 'MONTHLY_SAVING', fromYear: 4, toYear: 2, amount: 10 },
        { type: 'MONTHLY_SAVING', fromYear: 6, toYear: 7, amount: 10 }
      ]
    });
    expect(paths(result)).toEqual(['operations.0.toYear', 'operations.1.fromYear', 'operations.1.toYear']);
  });

  it('valide un scénario enregistré : nom 1..120 et mêmes contrôles', () => {
    const body = { name: 'Plan', horizonYears: 5, baseScenario: 'CENTRAL' };
    expect(scenarioBodySchema.safeParse(body).success).toBe(true);
    expect(scenarioBodySchema.safeParse({ ...body, name: '' }).success).toBe(false);
    expect(scenarioBodySchema.safeParse({ ...body, name: 'x'.repeat(121) }).success).toBe(false);
    expect(scenarioBodySchema.safeParse({ ...body, compareScenarios: true }).success).toBe(false);
    expect(paths(scenarioBodySchema.safeParse({ ...body, operations: [{ ...sell, year: 9 }] }))).toEqual([
      'operations.0.year'
    ]);
  });

  it('accepte une mise à jour partielle', () => {
    expect(scenarioUpdateSchema.safeParse({}).success).toBe(true);
    expect(scenarioUpdateSchema.safeParse({ name: 'Nouveau' }).success).toBe(true);
    expect(scenarioUpdateSchema.safeParse({ horizonYears: 40 }).success).toBe(false);
  });
});
