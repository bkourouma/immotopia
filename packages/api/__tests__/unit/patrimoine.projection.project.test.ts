import {
  DEFAULT_ASSUMPTIONS,
  resolveAssumptions,
  projectNetWorth,
  type ProjectionAssetInput,
  type ProjectionInput,
  type ProjectionLoanInput
} from '../../src/lib/patrimoine/projection';

const TODAY = new Date('2026-01-01T00:00:00Z');

function asset(overrides: Partial<ProjectionAssetInput> & { id: string }): ProjectionAssetInput {
  return {
    name: overrides.id,
    assetClass: 'REAL_ESTATE',
    status: 'ACTIVE',
    valueXof: 10_000_000,
    details: {},
    lastValuedAt: TODAY,
    ...overrides
  };
}

function loan(overrides: Partial<ProjectionLoanInput> & { id: string }): ProjectionLoanInput {
  return {
    assetId: null,
    remainingCapital: 12_000_000,
    annualRatePercent: 6,
    monthlyPayment: 200_000,
    endDate: null,
    status: 'ACTIVE',
    ...overrides
  };
}

function input(assets: ProjectionAssetInput[], loans: ProjectionLoanInput[] = []): ProjectionInput {
  return { today: TODAY, assets, loans };
}

const flat = resolveAssumptions('CENTRAL', {
  growthPercentByClass: { REAL_ESTATE: 5 },
  inflationPercent: 0
}).assumptions;

describe('projection de la valeur nette', () => {
  it('croissance composée : 10 000 000 à 5 % donne 10 500 000, 11 025 000, 11 576 250', () => {
    const result = projectNetWorth(input([asset({ id: 'a' })]), flat, 3);
    expect(result.points.map(point => point.year)).toEqual([0, 1, 2, 3]);
    expect(result.points.map(point => point.netWorth)).toEqual([10_000_000, 10_500_000, 11_025_000, 11_576_250]);
    expect(result.points[3]?.byClass).toEqual([{ assetClass: 'REAL_ESTATE', value: 11_576_250 }]);
  });

  it('véhicule à annuité et plancher explicites : 4 600 000, 2 800 000, 1 000 000', () => {
    const vehicle = asset({
      id: 'v',
      assetClass: 'VEHICLE_EQUIPMENT',
      valueXof: 6_400_000,
      details: { annuityXof: 1_800_000, residualValueXof: 1_000_000 }
    });
    const result = projectNetWorth(input([vehicle]), flat, 4);
    expect(result.points.map(point => point.netWorth)).toEqual([6_400_000, 4_600_000, 2_800_000, 1_000_000, 1_000_000]);
  });

  it('véhicule : annuité déduite de la durée d’utilité et du pourcentage résiduel', () => {
    const vehicle = asset({
      id: 'v',
      assetClass: 'VEHICLE_EQUIPMENT',
      valueXof: 10_000_000,
      details: { usefulLifeYears: 5, residualValuePercent: 20 }
    });
    const values = projectNetWorth(input([vehicle]), flat, 6).points.map(point => point.netWorth);
    expect(values).toEqual([10_000_000, 8_400_000, 6_800_000, 5_200_000, 3_600_000, 2_000_000, 2_000_000]);
  });

  it('véhicule dégressif : taux constant, plancher respecté', () => {
    const vehicle = asset({
      id: 'v',
      assetClass: 'VEHICLE_EQUIPMENT',
      valueXof: 10_000_000,
      details: { depreciationMethod: 'DECLINING', decliningRatePercent: 50, residualValuePercent: 20 }
    });
    const values = projectNetWorth(input([vehicle]), flat, 3).points.map(point => point.netWorth);
    expect(values).toEqual([10_000_000, 5_000_000, 2_500_000, 2_000_000]);
  });

  it('véhicule sans détails d’amortissement : valeur constante', () => {
    const vehicle = asset({ id: 'v', assetClass: 'VEHICLE_EQUIPMENT', valueXof: 3_000_000 });
    const values = projectNetWorth(input([vehicle]), flat, 3).points.map(point => point.netWorth);
    expect(values).toEqual([3_000_000, 3_000_000, 3_000_000, 3_000_000]);
  });

  it('épargne avec taux propre : ce taux prime sur tous les scénarios', () => {
    const savings = asset({
      id: 's',
      assetClass: 'SAVINGS_INVESTMENT',
      valueXof: 1_000_000,
      details: { expectedRatePercent: 10 }
    });
    for (const scenario of Object.values(DEFAULT_ASSUMPTIONS)) {
      expect(projectNetWorth(input([savings]), scenario, 2).points[2]?.netWorth).toBe(1_210_000);
    }
  });

  it('épargne sans taux : hypothèse de la classe ; surcharge d’actif prioritaire', () => {
    const plain = asset({ id: 's', assetClass: 'SAVINGS_INVESTMENT', valueXof: 1_000_000 });
    expect(projectNetWorth(input([plain]), DEFAULT_ASSUMPTIONS.CENTRAL, 1).points[1]?.netWorth).toBe(1_040_000);
    const overridden = { ...plain, growthPercentOverride: 0 };
    expect(projectNetWorth(input([overridden]), DEFAULT_ASSUMPTIONS.CENTRAL, 1).points[1]?.netWorth).toBe(1_000_000);
  });

  it('trois scénarios ordonnés : prudent <= central <= optimiste', () => {
    const data = input([
      asset({ id: 'r' }),
      asset({ id: 'b', assetClass: 'BUSINESS_EQUITY' }),
      asset({ id: 'm', assetClass: 'MOVABLE' })
    ]);
    const [prudent, central, optimistic] = (['PRUDENT', 'CENTRAL', 'OPTIMISTIC'] as const).map(key => {
      const points = projectNetWorth(data, DEFAULT_ASSUMPTIONS[key], 10).points;
      return points[10]?.netWorth ?? 0;
    });
    expect(prudent).toBeLessThanOrEqual(central ?? 0);
    expect(central).toBeLessThanOrEqual(optimistic ?? 0);
    expect(prudent).toBeLessThan(optimistic ?? 0);
  });

  it('valeurs réelles : déflatées par l’inflation composée', () => {
    const assumptions = resolveAssumptions('CENTRAL', {
      growthPercentByClass: { REAL_ESTATE: 0 },
      inflationPercent: 10
    }).assumptions;
    const points = projectNetWorth(input([asset({ id: 'a' })]), assumptions, 2).points;
    expect(points.map(point => point.realNetWorth)).toEqual([10_000_000, 9_090_909, 8_264_463]);
    expect(points[2]?.netWorth).toBe(10_000_000);
  });

  it('actif sans valeur : signalé et ignoré', () => {
    const result = projectNetWorth(input([asset({ id: 'a' }), asset({ id: 'x', valueXof: null })]), flat, 1);
    expect(result.warnings).toEqual([{ code: 'ASSET_WITHOUT_VALUE', assetId: 'x' }]);
    expect(result.points[0]?.assets).toBe(10_000_000);
  });

  it('dette amortie mois par mois : 11 860 000 après un mois, capital baissant chaque année', () => {
    const noGrowth = resolveAssumptions('CENTRAL', { inflationPercent: 0 }).assumptions;
    const result = projectNetWorth(input([], [loan({ id: 'l' })]), noGrowth, 2);
    const debts = result.points.map(point => point.debts);
    expect(debts[0]).toBe(12_000_000);
    expect(debts[1]).toBeLessThan(12_000_000);
    expect(debts[1]).toBeGreaterThan(debts[2] ?? 0);
    // 12 mensualités calculées à la main : intérêts mensuels = capital × 6 % / 12.
    let remaining = 12_000_000;
    for (let month = 0; month < 12; month += 1) remaining -= 200_000 - (remaining * 0.06) / 12;
    expect(debts[1]).toBe(Math.round(remaining));
    expect(result.points[1]?.netWorth).toBe(-(debts[1] ?? 0));
  });

  it('dette à mensualité insuffisante : avertissement, capital constant', () => {
    const result = projectNetWorth(input([], [loan({ id: 'l', monthlyPayment: 50_000 })]), flat, 2);
    expect(result.warnings).toEqual([{ code: 'LOAN_PAYMENT_TOO_LOW', loanId: 'l' }]);
    expect(result.points[2]?.debts).toBe(12_000_000);
  });

  it('dette soldée : disparaît du total ; dette non active ignorée', () => {
    const small = loan({ id: 's', remainingCapital: 1_000_000 });
    const closed = loan({ id: 'c', status: 'CLOSED' });
    const points = projectNetWorth(input([], [small, closed]), flat, 2).points;
    expect(points[0]?.debts).toBe(1_000_000);
    expect(points[1]?.debts).toBe(0);
    expect(points[2]?.debts).toBe(0);
  });

  it('dette à échéance : le remboursement s’arrête à la date de fin', () => {
    const endDate = new Date('2026-07-01T00:00:00Z');
    const points = projectNetWorth(input([], [loan({ id: 'l', endDate })]), flat, 3).points;
    expect(points[1]?.debts).toBeGreaterThan(0);
    expect(points[1]?.debts).toBe(points[3]?.debts);
  });

  it('horizons 1 et 30 : N + 1 points', () => {
    const data = input([asset({ id: 'a' })]);
    expect(projectNetWorth(data, flat, 1).points).toHaveLength(2);
    const long = projectNetWorth(data, flat, 30).points;
    expect(long).toHaveLength(31);
    expect(long[30]?.netWorth).toBe(Math.round(10_000_000 * Math.pow(1.05, 30)));
  });

  it('classes présentes triées par valeur décroissante ; archivés ignorés', () => {
    const data = input([
      asset({ id: 'a', valueXof: 1_000_000 }),
      asset({ id: 'b', assetClass: 'CASH', valueXof: 5_000_000 }),
      asset({ id: 'c', assetClass: 'OTHER', status: 'ARCHIVED' })
    ]);
    expect(projectNetWorth(data, flat, 0).points[0]?.byClass.map(entry => entry.assetClass)).toEqual([
      'CASH',
      'REAL_ESTATE'
    ]);
  });

  it('ne modifie pas l’entrée', () => {
    const data = input([asset({ id: 'a' })], [loan({ id: 'l' })]);
    const before = JSON.stringify(data);
    projectNetWorth(data, flat, 5);
    expect(JSON.stringify(data)).toBe(before);
  });
});

describe('avertissement LOAN_MATURED_WITH_BALANCE', () => {
  const warnings = (loans: ProjectionLoanInput[]) => projectNetWorth(input([], loans), flat, 3).warnings;

  it('dette échue en 2025 avec 5 000 000 restants : avertissement une seule fois, valeur constante', () => {
    const matured = loan({
      id: 'echue',
      remainingCapital: 5_000_000,
      annualRatePercent: 0,
      monthlyPayment: 100_000,
      endDate: new Date('2025-06-01T00:00:00Z')
    });
    const result = projectNetWorth(input([], [matured]), flat, 3);
    expect(result.warnings.filter(w => w.code === 'LOAN_MATURED_WITH_BALANCE')).toEqual([
      { code: 'LOAN_MATURED_WITH_BALANCE', loanId: 'echue' }
    ]);
    expect(result.points.map(point => point.debts)).toEqual([5_000_000, 5_000_000, 5_000_000, 5_000_000]);
  });

  it('dette normale soldée avant l’échéance : aucun avertissement', () => {
    const normal = loan({
      id: 'normale',
      remainingCapital: 1_200_000,
      annualRatePercent: 0,
      monthlyPayment: 100_000,
      endDate: new Date('2028-01-01T00:00:00Z')
    });
    expect(warnings([normal]).filter(w => w.code === 'LOAN_MATURED_WITH_BALANCE')).toEqual([]);
  });

  it('dette in fine (intérêts seulement) qui arrive à terme dans l’horizon : avertissement une fois', () => {
    const inFine = loan({
      id: 'infine',
      remainingCapital: 10_000_000,
      annualRatePercent: 6,
      monthlyPayment: 50_000,
      endDate: new Date('2027-06-01T00:00:00Z')
    });
    const result = warnings([inFine]).filter(w => w.code === 'LOAN_MATURED_WITH_BALANCE');
    expect(result).toEqual([{ code: 'LOAN_MATURED_WITH_BALANCE', loanId: 'infine' }]);
  });

  it('une dette échue et soldée (restant nul) ne déclenche rien', () => {
    const done = loan({ id: 'soldee', remainingCapital: 0, endDate: new Date('2025-06-01T00:00:00Z') });
    expect(warnings([done]).filter(w => w.code === 'LOAN_MATURED_WITH_BALANCE')).toEqual([]);
  });
});

describe('prudent ≤ central ≤ optimiste, à chaque année', () => {
  it('vaut pour un patrimoine de classes variées avec une dette', () => {
    const classes = [
      'REAL_ESTATE',
      'BUSINESS_EQUITY',
      'INVENTORY',
      'CASH',
      'SAVINGS_INVESTMENT',
      'RECEIVABLE',
      'AGRICULTURE',
      'MOVABLE',
      'VEHICLE_EQUIPMENT',
      'OTHER'
    ] as const;
    const assets = classes.map((assetClass, index) =>
      asset({ id: `a${index}`, assetClass, valueXof: 1_000_000 * (index + 1) })
    );
    const loans = [loan({ id: 'l', remainingCapital: 8_000_000, annualRatePercent: 6, monthlyPayment: 150_000 })];
    const runs = (['PRUDENT', 'CENTRAL', 'OPTIMISTIC'] as const).map(key =>
      projectNetWorth(input(assets, loans), resolveAssumptions(key).assumptions, 30)
    );
    for (let year = 0; year <= 30; year += 1) {
      const [prudent, central, optimistic] = runs.map(run => run.points[year]?.netWorth ?? Number.NaN);
      expect(prudent).toBeLessThanOrEqual(central as number);
      expect(central).toBeLessThanOrEqual(optimistic as number);
    }
    expect(runs[0]?.points[30]?.netWorth).toBeLessThan(runs[2]?.points[30]?.netWorth as number);
  });
});
