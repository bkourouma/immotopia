import {
  ProjectionOperationError,
  applyOperations,
  projectNetWorth,
  resolveAssumptions,
  simulateProjection,
  type ProjectionAssetInput,
  type ProjectionInput,
  type SimulationOperation
} from '../../src/lib/patrimoine/projection';

const TODAY = new Date('2026-01-01T00:00:00Z');
const assumptions = resolveAssumptions('CENTRAL', {
  growthPercentByClass: { REAL_ESTATE: 0 },
  inflationPercent: 0
}).assumptions;

function asset(overrides: Partial<ProjectionAssetInput> & { id: string }): ProjectionAssetInput {
  return {
    name: overrides.id,
    assetClass: 'REAL_ESTATE',
    status: 'ACTIVE',
    valueXof: 20_000_000,
    details: {},
    lastValuedAt: TODAY,
    ...overrides
  };
}

const loan = {
  id: 'l1',
  assetId: null,
  remainingCapital: 12_000_000,
  annualRatePercent: 6,
  monthlyPayment: 200_000,
  endDate: null,
  status: 'ACTIVE' as const
};

const baseInput: ProjectionInput = {
  today: TODAY,
  assets: [asset({ id: 'house' }), asset({ id: 'bank', assetClass: 'CASH', valueXof: 10_000_000 })],
  loans: [loan]
};

function cashAt(points: { byClass: { assetClass: string; value: number }[] }): number {
  return points.byClass.find(entry => entry.assetClass === 'CASH')?.value ?? 0;
}

function at<T>(list: T[], index: number): T {
  const value = list[index];
  if (value === undefined) throw new Error(`Index ${index} absent`);
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function run(operations: SimulationOperation[], input = baseInput, horizon = 3) {
  return simulateProjection(input, assumptions, horizon, operations);
}

function errorOf(operations: SimulationOperation[], horizon = 3): ProjectionOperationError {
  try {
    run(operations, baseInput, horizon);
  } catch (error) {
    if (error instanceof ProjectionOperationError) return error;
  }
  throw new Error('Aucune ProjectionOperationError levée');
}

function baseDebtsAt(year: number): number {
  return at(projectNetWorth(baseInput, assumptions, 3).points, year).debts;
}

describe('simulation d’opérations', () => {
  it('sans opération : simulée = base', () => {
    const { base, simulated, delta } = run([]);
    expect(simulated.points).toEqual(base.points);
    expect(delta.every(entry => entry.netWorth === 0)).toBe(true);
  });

  it('vente à 20 000 000 avec 3 % de frais : trésorerie + 19 400 000, valeur nette − 600 000', () => {
    const { base, simulated, delta } = run([
      { type: 'SELL_ASSET', year: 1, assetId: 'house', salePrice: 20_000_000, feesPercent: 3 }
    ]);
    expect(cashAt(at(simulated.points, 1)) - cashAt(at(base.points, 1))).toBe(19_400_000);
    expect(delta[1]?.netWorth).toBe(-600_000);
    expect(delta[0]?.netWorth).toBe(0);
    expect(simulated.points[1]?.byClass.some(entry => entry.assetClass === 'REAL_ESTATE')).toBe(false);
  });

  it('vente sans prix : valeur projetée de l’actif', () => {
    const grown = resolveAssumptions('CENTRAL', {
      growthPercentByClass: { REAL_ESTATE: 10 },
      inflationPercent: 0
    }).assumptions;
    const { simulated } = simulateProjection(baseInput, grown, 2, [{ type: 'SELL_ASSET', year: 2, assetId: 'house' }]);
    expect(cashAt(at(simulated.points, 2))).toBe(10_000_000 + 24_200_000);
  });

  it('remboursement anticipé de 5 000 000 : dettes − 5 000 000, trésorerie − 5 000 000', () => {
    const { base, simulated, delta } = run([{ type: 'PREPAY_LOAN', year: 1, loanId: 'l1', amount: 5_000_000 }]);
    expect(at(base.points, 1).debts - at(simulated.points, 1).debts).toBe(5_000_000);
    expect(cashAt(at(base.points, 1)) - cashAt(at(simulated.points, 1))).toBe(5_000_000);
    expect(delta[1]?.netWorth).toBe(0);
    expect(at(delta, 2).netWorth).toBeGreaterThan(0);
    expect(at(delta, 3).netWorth).toBeGreaterThan(at(delta, 2).netWorth);
  });

  it('emprunt de 10 000 000 à 8 % sur 5 ans : trésorerie et dettes + 10 000 000, valeur nette inchangée', () => {
    const { base, simulated, delta } = run([
      { type: 'TAKE_LOAN', year: 1, amount: 10_000_000, annualRatePercent: 8, termYears: 5 }
    ]);
    expect(cashAt(at(simulated.points, 1)) - cashAt(at(base.points, 1))).toBe(10_000_000);
    expect(at(simulated.points, 1).debts - at(base.points, 1).debts).toBe(10_000_000);
    expect(delta[1]?.netWorth).toBe(0);
    // Les mensualités ne sont pas prélevées sur la trésorerie (pas de flux de revenus modélisé) :
    // le capital remboursé fait monter la valeur nette, il ne la baisse pas.
    expect(at(delta, 2).netWorth).toBe(10_000_000 - (at(simulated.points, 2).debts - baseDebtsAt(2)));
  });

  it('emprunt : la dette est amortie sur la durée (soldée à l’échéance)', () => {
    const { simulated } = run(
      [{ type: 'TAKE_LOAN', year: 1, amount: 10_000_000, annualRatePercent: 8, termYears: 2 }],
      baseInput,
      4
    );
    const baseDebts = projectNetWorth(baseInput, assumptions, 4).points.map(point => point.debts);
    const extra = simulated.points.map((point, index) => point.debts - (baseDebts[index] ?? 0));
    expect(extra).toEqual([0, 10_000_000, expect.any(Number), 0, 0]);
    expect(extra[2]).toBeGreaterThan(0);
    expect(extra[2]).toBeLessThan(10_000_000);
  });

  it('épargne mensuelle de 100 000 sur 2 ans à 0 % : trésorerie + 2 400 000', () => {
    const { base, simulated } = run([{ type: 'MONTHLY_SAVING', fromYear: 1, toYear: 2, amount: 100_000 }]);
    expect(cashAt(at(simulated.points, 1)) - cashAt(at(base.points, 1))).toBe(1_200_000);
    expect(cashAt(at(simulated.points, 2)) - cashAt(at(base.points, 2))).toBe(2_400_000);
    expect(cashAt(at(simulated.points, 3)) - cashAt(at(base.points, 3))).toBe(2_400_000);
  });

  it('épargne sans toYear : jusqu’à l’horizon', () => {
    const { simulated } = run([{ type: 'MONTHLY_SAVING', fromYear: 2, amount: 100_000 }]);
    expect(cashAt(at(simulated.points, 1))).toBe(10_000_000);
    expect(cashAt(at(simulated.points, 3))).toBe(10_000_000 + 2_400_000);
  });

  it('achat : trésorerie − prix, nouvel actif à la croissance de la classe ou imposée', () => {
    const { simulated, delta } = run([
      {
        type: 'BUY_ASSET',
        year: 1,
        assetClass: 'SAVINGS_INVESTMENT',
        name: 'Placement',
        price: 4_000_000,
        growthPercent: 10
      }
    ]);
    expect(delta[1]?.netWorth).toBe(0);
    expect(cashAt(at(simulated.points, 1))).toBe(6_000_000);
    expect(delta[2]?.netWorth).toBe(400_000);
    const byClass = run([{ type: 'BUY_ASSET', year: 1, assetClass: 'AGRICULTURE', name: 'Champ', price: 1_000_000 }]);
    expect(byClass.delta[2]?.netWorth).toBe(30_000);
  });

  it('trésorerie négative autorisée et signalée', () => {
    const noCash: ProjectionInput = { ...baseInput, assets: [asset({ id: 'house' })] };
    const { simulated } = run(
      [{ type: 'BUY_ASSET', year: 2, assetClass: 'OTHER', name: 'X', price: 1_000_000 }],
      noCash
    );
    expect(cashAt(at(simulated.points, 2))).toBe(-1_000_000);
    expect(simulated.warnings).toEqual(
      expect.arrayContaining([
        { code: 'NEGATIVE_CASH', year: 2 },
        { code: 'NEGATIVE_CASH', year: 3 }
      ])
    );
  });

  it('applique les opérations d’une même année dans l’ordre fourni', () => {
    const noCash: ProjectionInput = { ...baseInput, assets: [asset({ id: 'house' })] };
    const ok = run(
      [
        { type: 'SELL_ASSET', year: 1, assetId: 'house', salePrice: 5_000_000 },
        { type: 'BUY_ASSET', year: 1, assetClass: 'OTHER', name: 'X', price: 5_000_000 }
      ],
      noCash
    );
    expect(ok.simulated.warnings.some(w => w.code === 'NEGATIVE_CASH')).toBe(false);
    const reversed = run(
      [
        { type: 'BUY_ASSET', year: 1, assetClass: 'OTHER', name: 'X', price: 5_000_000 },
        { type: 'SELL_ASSET', year: 1, assetId: 'house', salePrice: 5_000_000 }
      ],
      noCash
    );
    // Trésorerie négative au milieu de l'année mais nulle en fin d'année : seul l'état de fin d'année est signalé.
    expect(reversed.simulated.points[1]?.netWorth).toBe(ok.simulated.points[1]?.netWorth);
  });

  it('refuse la vente double, sur le champ assetId de la deuxième opération', () => {
    const error = errorOf([
      { type: 'SELL_ASSET', year: 1, assetId: 'house' },
      { type: 'SELL_ASSET', year: 2, assetId: 'house' }
    ]);
    expect([error.index, error.field]).toEqual([1, 'assetId']);
  });

  it('refuse un remboursement supérieur au restant dû projeté', () => {
    const error = errorOf([{ type: 'PREPAY_LOAN', year: 1, loanId: 'l1', amount: 12_000_001 }]);
    expect([error.index, error.field]).toEqual([0, 'amount']);
    const afterPayments = errorOf([{ type: 'PREPAY_LOAN', year: 3, loanId: 'l1', amount: 12_000_000 }]);
    expect(afterPayments.field).toBe('amount');
  });

  it('refuse un actif ou une dette inconnus, une année hors horizon, trop d’opérations', () => {
    expect(errorOf([{ type: 'SELL_ASSET', year: 1, assetId: 'ghost' }]).message).toMatch(/introuvable/);
    expect(errorOf([{ type: 'PREPAY_LOAN', year: 1, loanId: 'ghost', amount: 1 }]).field).toBe('loanId');
    expect(errorOf([{ type: 'SELL_ASSET', year: 4, assetId: 'house' }]).field).toBe('year');
    expect(errorOf([{ type: 'MONTHLY_SAVING', fromYear: 2, toYear: 9, amount: 1 }]).field).toBe('toYear');
    const many = Array.from({ length: 51 }, () => ({ type: 'MONTHLY_SAVING' as const, fromYear: 1, amount: 1 }));
    expect(errorOf(many).field).toBe('operations');
  });

  it('refuse de vendre un actif cédé ; mode tolérant : avertissement', () => {
    const disposed: ProjectionInput = { ...baseInput, assets: [asset({ id: 'old', status: 'DISPOSED' })] };
    expect(() => run([{ type: 'SELL_ASSET', year: 1, assetId: 'old' }], disposed)).toThrow(ProjectionOperationError);
    const result = applyOperations(
      disposed,
      [
        { type: 'SELL_ASSET', year: 1, assetId: 'old' },
        { type: 'SELL_ASSET', year: 1, assetId: 'ghost' },
        { type: 'PREPAY_LOAN', year: 1, loanId: 'ghost', amount: 1 }
      ],
      assumptions,
      2,
      { lenientReferences: true }
    );
    expect(result.warnings).toEqual([
      { code: 'OPERATION_NOT_APPLICABLE', index: 0, reason: 'ASSET_NOT_ACTIVE' },
      { code: 'OPERATION_NOT_APPLICABLE', index: 1, reason: 'ASSET_NOT_FOUND' },
      { code: 'OPERATION_NOT_APPLICABLE', index: 2, reason: 'LOAN_NOT_FOUND' }
    ]);
  });

  it('n’altère jamais l’entrée gelée récursivement', () => {
    const frozen = deepFreeze(structuredClone(baseInput));
    const before = JSON.stringify(frozen);
    const result = simulateProjection(frozen, assumptions, 3, [
      { type: 'SELL_ASSET', year: 1, assetId: 'house' },
      { type: 'PREPAY_LOAN', year: 1, loanId: 'l1', amount: 1_000_000 },
      { type: 'MONTHLY_SAVING', fromYear: 1, amount: 10 }
    ]);
    expect(JSON.stringify(frozen)).toBe(before);
    expect(result.simulated.points).toHaveLength(4);
  });

  it('horizon 30 avec opérations : 31 points et delta par année', () => {
    const { simulated, delta } = simulateProjection(baseInput, assumptions, 30, [
      { type: 'MONTHLY_SAVING', fromYear: 1, amount: 1000 }
    ]);
    expect(simulated.points).toHaveLength(31);
    expect(delta).toHaveLength(31);
    expect(delta[30]?.netWorth).toBe(30 * 12_000);
  });
});
