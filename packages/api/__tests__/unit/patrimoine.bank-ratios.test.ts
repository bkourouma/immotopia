import {
  computeBankRatios,
  debtServiceCoverageRatio,
  cashOnCash,
  grossYield,
  internalRateOfReturn,
  loanToValue,
  netNetYield,
  netYield,
  projectedYieldAtHorizon,
  solveIrr,
  type YieldInput
} from '../../src/lib/patrimoine/yield';

const FLAT = { years: 1, valueGrowthRate: 0, rentGrowthRate: 0, expenseGrowthRate: 0, vacancyRate: 0 };

const financed: YieldInput = {
  annualRent: 12_000_000,
  currentValue: 100_000_000,
  costBasis: 80_000_000,
  annualExpenses: 2_000_000,
  annualLoanPayments: 3_000_000,
  loanRemainingCapital: 40_000_000,
  loanInitialCapital: 60_000_000,
  hasActiveLoan: true
};

const withVacancy = { ...FLAT, years: 10, vacancyRate: 0.05 };

describe('DSCR', () => {
  it('cas nominal : (12 M x 0,95 - 2 M) / 3 M', () => {
    const r = debtServiceCoverageRatio(financed, withVacancy);
    expect(r.reason).toBeNull();
    expect(r.value).toBeCloseTo(9_400_000 / 3_000_000, 10);
  });

  it('sans pret actif : null NO_ACTIVE_LOAN', () => {
    expect(debtServiceCoverageRatio({ ...financed, hasActiveLoan: false }, withVacancy)).toEqual({
      value: null,
      reason: 'NO_ACTIVE_LOAN'
    });
  });

  it('pret actif sans mensualite sur 12 mois : null NO_DEBT_SERVICE', () => {
    expect(debtServiceCoverageRatio({ ...financed, annualLoanPayments: 0 }, withVacancy)).toEqual({
      value: null,
      reason: 'NO_DEBT_SERVICE'
    });
  });

  it('deduit le pret actif des mensualites quand hasActiveLoan est absent', () => {
    const { hasActiveLoan: _ignored, ...legacy } = financed;
    expect(debtServiceCoverageRatio(legacy, withVacancy).value).not.toBeNull();
    expect(debtServiceCoverageRatio({ ...legacy, annualLoanPayments: 0 }, withVacancy).reason).toBe('NO_ACTIVE_LOAN');
  });
});

describe('LTV', () => {
  it('cas nominal : 40 M / 100 M = 40 %', () => {
    expect(loanToValue(financed)).toEqual({ value: 40, reason: null });
  });

  it('sans valeur : null NO_VALUE', () => {
    expect(loanToValue({ ...financed, currentValue: 0 })).toEqual({ value: null, reason: 'NO_VALUE' });
  });

  it('sans pret actif : null NO_ACTIVE_LOAN', () => {
    expect(loanToValue({ ...financed, hasActiveLoan: false })).toEqual({ value: null, reason: 'NO_ACTIVE_LOAN' });
  });
});

describe('Cash-on-cash', () => {
  it('cas nominal : (11,4 - 2 - 3) M / (80 - 60 = 20) M = 32 %', () => {
    const r = cashOnCash(financed, withVacancy);
    expect(r.reason).toBeNull();
    expect(r.value).toBeCloseTo(32, 10);
  });

  it('sans cout de revient : null NO_COST_BASIS', () => {
    expect(cashOnCash({ ...financed, costBasis: 0 }, withVacancy)).toEqual({ value: null, reason: 'NO_COST_BASIS' });
  });

  it('bien entierement finance (ou au-dela) : null NO_EQUITY', () => {
    expect(cashOnCash({ ...financed, loanInitialCapital: 80_000_000 }, withVacancy).reason).toBe('NO_EQUITY');
    expect(cashOnCash({ ...financed, loanInitialCapital: 95_000_000 }, withVacancy).reason).toBe('NO_EQUITY');
  });

  it('sans pret actif : fonds propres = cout de revient (defini, pas null)', () => {
    const r = cashOnCash(
      { ...financed, hasActiveLoan: false, annualLoanPayments: 0, loanInitialCapital: 0, loanRemainingCapital: 0 },
      withVacancy
    );
    expect(r.reason).toBeNull();
    expect(r.value).toBeCloseTo((9_400_000 / 80_000_000) * 100, 10);
  });
});

describe('TRI (avant financement)', () => {
  const bond: YieldInput = {
    annualRent: 10,
    currentValue: 100,
    costBasis: 100,
    annualExpenses: 0,
    annualLoanPayments: 0
  };

  it('cout 100, flux 10, valeur terminale 100 a 1 an : 10 % exactement', () => {
    const r = internalRateOfReturn(bond, FLAT);
    expect(r.reason).toBeNull();
    expect(r.value).toBeCloseTo(10, 6);
  });

  it('horizons 2 et 30 ans : flux constants + valeur terminale = coupon', () => {
    expect(internalRateOfReturn(bond, { ...FLAT, years: 30 }).value).toBeCloseTo(10, 6);
    expect(internalRateOfReturn(bond, { ...FLAT, years: 2 }).value).toBeCloseTo(10, 6);
  });

  it('exclut mensualites et capital emprunte (avant financement)', () => {
    const loaned = {
      ...bond,
      annualLoanPayments: 50,
      loanInitialCapital: 90,
      loanRemainingCapital: 80,
      hasActiveLoan: true
    };
    expect(internalRateOfReturn(loaned, FLAT).value).toBeCloseTo(10, 6);
  });

  it('applique la vacance : 10 x 0,5 + 100 sur 100 = 5 %', () => {
    expect(internalRateOfReturn(bond, { ...FLAT, vacancyRate: 0.5 }).value).toBeCloseTo(5, 6);
  });

  it('croissances non nulles, chiffre a la main', () => {
    // cout 100, loyer 10 (+10 %/an), charges 0, valeur 100 (+20 %/an), 2 ans.
    // flux1 = 10 x 1,1 = 11 ; flux2 = 10 x 1,21 = 12,1 + valeur 100 x 1,44 = 144 -> 156,1.
    // VAN(r) = -100 + 11/(1+r) + 156,1/(1+r)^2 = 0 ; avec x = 1/(1+r) :
    // 156,1 x^2 + 11 x - 100 = 0 -> x = (-11 + sqrt(121 + 62440)) / 312,2 = (-11 + 250,12) / 312,2 = 0,7659
    // soit r = 1/x - 1 = 30,6 %.
    const x = (-11 + Math.sqrt(121 + 4 * 156.1 * 100)) / (2 * 156.1);
    const expected = (1 / x - 1) * 100;
    const r = internalRateOfReturn(bond, {
      years: 2,
      valueGrowthRate: 0.2,
      rentGrowthRate: 0.1,
      expenseGrowthRate: 0,
      vacancyRate: 0
    });
    expect(r.reason).toBeNull();
    expect(r.value).toBeCloseTo(expected, 6);
    expect(r.value).toBeCloseTo(30.6, 0);
  });

  it('montants en XOF (~1e8) : meme taux, tolerance relative', () => {
    const big: YieldInput = { ...bond, annualRent: 10e8, currentValue: 100e8, costBasis: 100e8 };
    expect(internalRateOfReturn(big, FLAT).value).toBeCloseTo(10, 6);
  });

  it('valeur terminale nulle : null NO_VALUE', () => {
    expect(internalRateOfReturn({ ...bond, currentValue: 0 }, FLAT)).toEqual({ value: null, reason: 'NO_VALUE' });
  });

  it('sans cout de revient : null NO_COST_BASIS', () => {
    expect(internalRateOfReturn({ ...bond, costBasis: 0 }, FLAT)).toEqual({ value: null, reason: 'NO_COST_BASIS' });
  });

  it('pas de changement de signe : null NOT_CONVERGENT', () => {
    const loser: YieldInput = {
      annualRent: 0,
      currentValue: 1,
      costBasis: 100,
      annualExpenses: 50,
      annualLoanPayments: 0
    };
    expect(internalRateOfReturn(loser, { ...FLAT, years: 5 })).toEqual({ value: null, reason: 'NOT_CONVERGENT' });
  });

  it('taux hors borne (> 1000 %) : null NOT_CONVERGENT, sans boucle infinie', () => {
    const jackpot: YieldInput = {
      annualRent: 100_000,
      currentValue: 1,
      costBasis: 1,
      annualExpenses: 0,
      annualLoanPayments: 0
    };
    expect(internalRateOfReturn(jackpot, { ...FLAT, years: 3 })).toEqual({ value: null, reason: 'NOT_CONVERGENT' });
  });

  it('solveIrr refuse des flux non finis', () => {
    expect(solveIrr([-100, Number.NaN, 110])).toBeNull();
    expect(solveIrr([-100, Infinity])).toBeNull();
  });

  it('retrouve un TRI negatif (perte en capital)', () => {
    const r = solveIrr([-100, 80]);
    expect(r).not.toBeNull();
    expect(r as number).toBeCloseTo(-0.2, 8);
  });
});

describe('computeBankRatios', () => {
  it('renvoie les quatre ratios', () => {
    const ratios = computeBankRatios(financed, withVacancy);
    expect(Object.keys(ratios).sort()).toEqual(['cashOnCash', 'dscr', 'irr', 'ltv']);
    expect(ratios.ltv.value).toBe(40);
  });

  it('un bien sans donnee ne produit que des null avec raison, jamais 0', () => {
    const empty: YieldInput = {
      annualRent: 0,
      currentValue: 0,
      costBasis: 0,
      annualExpenses: 0,
      annualLoanPayments: 0
    };
    const ratios = computeBankRatios(empty, withVacancy);
    for (const ratio of Object.values(ratios)) {
      expect(ratio.value).toBeNull();
      expect(ratio.reason).not.toBeNull();
    }
  });
});

describe('non-regression des rendements existants (champs optionnels ignores)', () => {
  const base: YieldInput = {
    annualRent: 12_000_000,
    currentValue: 100_000_000,
    costBasis: 80_000_000,
    annualExpenses: 2_000_000,
    annualLoanPayments: 3_000_000
  };

  it('les champs de pret ne changent pas les rendements', () => {
    const extended = { ...base, loanRemainingCapital: 1, loanInitialCapital: 2, hasActiveLoan: true };
    expect(grossYield(extended)).toBe(grossYield(base));
    expect(netYield(extended)).toBe(netYield(base));
    expect(netNetYield(extended)).toBe(netNetYield(base));
    expect(projectedYieldAtHorizon(extended, 5, withVacancy)).toEqual(projectedYieldAtHorizon(base, 5, withVacancy));
    expect(grossYield(base)).toBeCloseTo(12, 10);
    expect(netYield(base)).toBeCloseTo(10, 10);
    expect(netNetYield(base)).toBeCloseTo(8.75, 10);
  });
});
