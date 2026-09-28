import {
  annualizeRent,
  grossYield,
  latentCapitalGain,
  loanPaymentsForYear,
  netNetYield,
  netYield,
  projectedYieldAtHorizon,
  projectYield,
  remainingLoanMonths,
  type YieldInput
} from '../../src/lib/patrimoine/yield';

describe('annualizeRent — periodicite du bail', () => {
  it('multiplie par 12 un loyer mensuel (par defaut)', () => {
    expect(annualizeRent(100_000, 'MONTHLY')).toBe(1_200_000);
    expect(annualizeRent(100_000, undefined)).toBe(1_200_000);
    expect(annualizeRent(100_000, null)).toBe(1_200_000);
  });

  it('multiplie par 4 un loyer trimestriel', () => {
    expect(annualizeRent(300_000, 'QUARTERLY')).toBe(1_200_000);
  });

  it('multiplie par 2 un loyer semestriel', () => {
    expect(annualizeRent(600_000, 'SEMIANNUAL')).toBe(1_200_000);
  });

  it("ne multiplie pas un loyer annuel (deja l'annee)", () => {
    expect(annualizeRent(1_200_000, 'ANNUAL')).toBe(1_200_000);
  });
});

describe('Patrimoine yield helpers', () => {
  const baseInput: YieldInput = {
    annualRent: 12_000_000,
    currentValue: 100_000_000,
    costBasis: 80_000_000,
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
  });

  it('costBasis nul (inconnu) : net-net et plus-value latente sont null, jamais 0 ou trompeurs', () => {
    const unknownCostBasis = { ...baseInput, costBasis: 0 };
    expect(netNetYield(unknownCostBasis)).toBeNull();
    expect(latentCapitalGain(unknownCostBasis)).toBeNull();
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
    expect(summary.latentCapitalGain).toBeGreaterThan(baseInput.currentValue - baseInput.costBasis);
  });

  it("accepte des taux de croissance negatifs, jusqu'a -50 %", () => {
    const assumptions = { valueGrowthRate: -0.5, rentGrowthRate: -0.5, expenseGrowthRate: -0.5, vacancyRate: 0 };
    const summary = projectedYieldAtHorizon(baseInput, 1, assumptions);
    expect(summary.grossYield).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(summary.grossYield)).toBe(true);
  });

  it("un pret a taux d'interet 0 reste accepte (pas de division ni de garde qui le rejette)", () => {
    const zeroRateLoanInput: YieldInput = {
      ...baseInput,
      loans: [{ monthlyPayment: 100_000, remainingMonths: 24 }]
    };
    expect(() => loanPaymentsForYear(zeroRateLoanInput, 1)).not.toThrow();
  });
});

describe('remainingLoanMonths', () => {
  const now = new Date('2026-01-15T00:00:00.000Z');

  it("s'arrete a la date de fin du pret", () => {
    expect(remainingLoanMonths({ endDate: '2026-04-15T00:00:00.000Z', monthlyPayment: 100_000 }, now)).toBe(3);
  });

  it('renvoie 0 pour un pret deja termine', () => {
    expect(remainingLoanMonths({ endDate: '2025-01-01T00:00:00.000Z', monthlyPayment: 100_000 }, now)).toBe(0);
  });

  it('deduit la duree du capital restant faute de date de fin exploitable', () => {
    expect(remainingLoanMonths({ remainingCapital: 500_000, monthlyPayment: 100_000 }, now)).toBe(5);
  });
});

describe('loanPaymentsForYear — un pret termine cesse de peser sur la projection', () => {
  it("n'impute plus les mensualites d'un pret dont l'echeancier est deja epuise l'annee suivante", () => {
    const input: YieldInput = {
      annualRent: 12_000_000,
      currentValue: 100_000_000,
      costBasis: 80_000_000,
      annualExpenses: 0,
      annualLoanPayments: 100_000 * 12,
      loans: [{ monthlyPayment: 100_000, remainingMonths: 12 }]
    };

    // Annee 1 : les 12 mensualites restantes sont dues.
    expect(loanPaymentsForYear(input, 1)).toBe(1_200_000);
    // Annee 2 : le pret est deja solde, plus rien a deduire.
    expect(loanPaymentsForYear(input, 2)).toBe(0);
  });

  it('repartit un pret solde en cours de premiere annee (6 mensualites restantes)', () => {
    const input: YieldInput = {
      annualRent: 0,
      currentValue: 0,
      costBasis: 0,
      annualExpenses: 0,
      annualLoanPayments: 100_000 * 6,
      loans: [{ monthlyPayment: 100_000, remainingMonths: 6 }]
    };
    expect(loanPaymentsForYear(input, 1)).toBe(600_000);
    expect(loanPaymentsForYear(input, 2)).toBe(0);
  });
});
