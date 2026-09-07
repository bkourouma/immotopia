import {
  grossYield,
  latentCapitalGain,
  netNetYield,
  netYield,
  projectedYieldAtHorizon,
  projectYield,
  type YieldInput
} from '../../src/lib/patrimoine/yield';

describe('Patrimoine yield helpers', () => {
  const baseInput: YieldInput = {
    annualRent: 12_000_000,
    currentValue: 100_000_000,
    acquisitionCost: 80_000_000,
    annualExpenses: 2_000_000,
    annualLoanPayments: 3_000_000
  };

  it('computes gross yield', () => {
    expect(grossYield(baseInput)).toBeCloseTo(12, 5);
  });

  it('computes net yield', () => {
    expect(netYield(baseInput)).toBeCloseTo(10, 5);
  });

  it('computes net-net yield', () => {
    expect(netNetYield(baseInput)).toBeCloseTo(8.75, 5);
  });

  it('computes latent capital gain', () => {
    expect(latentCapitalGain(baseInput)).toBe(20_000_000);
  });

  it('returns 0 yield when denominator is 0', () => {
    expect(grossYield({ ...baseInput, currentValue: 0 })).toBe(0);
    expect(netYield({ ...baseInput, currentValue: 0 })).toBe(0);
    expect(netNetYield({ ...baseInput, acquisitionCost: 0 })).toBe(0);
  });

  it('projects yearly performance with growth assumptions', () => {
    const projection = projectYield(baseInput, 3, {
      valueGrowthRate: 0.03,
      rentGrowthRate: 0.02,
      expenseGrowthRate: 0.01,
      vacancyRate: 0.05
    });

    expect(projection).toHaveLength(3);
    expect(projection[0].year).toBe(1);
    expect(projection[2].year).toBe(3);
    expect(projection[0].estimatedValue).toBeGreaterThan(baseInput.currentValue);
    expect(projection[2].cumulativeRent).toBeGreaterThan(projection[0].cumulativeRent);
    expect(projection[2].cumulativeExpenses).toBeGreaterThan(projection[0].cumulativeExpenses);
  });

  it('computes projected yield summary at horizon', () => {
    const summary = projectedYieldAtHorizon(baseInput, 3, {
      valueGrowthRate: 0.03,
      rentGrowthRate: 0.02,
      expenseGrowthRate: 0.01,
      vacancyRate: 0.05
    });

    expect(summary.year).toBe(3);
    expect(summary.grossYield).toBeGreaterThan(0);
    expect(summary.netYield).toBeGreaterThan(0);
    expect(summary.latentCapitalGain).toBeGreaterThan(baseInput.currentValue - baseInput.acquisitionCost);
  });
});
