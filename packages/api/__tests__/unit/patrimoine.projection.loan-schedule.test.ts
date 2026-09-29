import {
  amortizeMonth,
  levelPayment,
  monthsUntil,
  paymentTooLow,
  remainingAtMonth
} from '../../src/lib/patrimoine/projection';

const loan = { remainingCapital: 12_000_000, annualRatePercent: 6, monthlyPayment: 200_000, monthsLeft: null };

describe('échéancier de dette', () => {
  it('premier mois : 60 000 d’intérêts, 140 000 de capital, 11 860 000 restants', () => {
    expect(amortizeMonth({ remaining: 12_000_000 }, 6, 200_000)).toEqual({
      interest: 60_000,
      principal: 140_000,
      remaining: 11_860_000
    });
    expect(remainingAtMonth(loan, 1)).toBe(11_860_000);
    expect(remainingAtMonth(loan, 0)).toBe(12_000_000);
  });

  it('plancher zéro : une mensualité trop basse ne fait pas grossir la dette', () => {
    const result = amortizeMonth({ remaining: 12_000_000 }, 6, 50_000);
    expect(result.principal).toBe(0);
    expect(result.remaining).toBe(12_000_000);
  });

  it('s’arrête au solde sans capital négatif', () => {
    expect(amortizeMonth({ remaining: 100_000 }, 0, 200_000).remaining).toBe(0);
    expect(remainingAtMonth({ ...loan, remainingCapital: 500_000 }, 24)).toBe(0);
  });

  it('s’arrête à l’échéance en conservant le capital dû', () => {
    const atMaturity = remainingAtMonth({ ...loan, monthsLeft: 2 }, 2);
    expect(remainingAtMonth({ ...loan, monthsLeft: 2 }, 12)).toBe(atMaturity);
    expect(atMaturity).toBeGreaterThan(0);
    expect(remainingAtMonth({ ...loan, monthsLeft: 0 }, 12)).toBe(12_000_000);
  });

  it('détecte une mensualité qui ne couvre pas les intérêts', () => {
    expect(paymentTooLow({ ...loan, monthlyPayment: 60_000 })).toBe(true);
    expect(paymentTooLow({ ...loan, monthlyPayment: 60_001 })).toBe(false);
    expect(paymentTooLow(loan)).toBe(false);
    expect(paymentTooLow({ ...loan, remainingCapital: 0, monthlyPayment: 0 })).toBe(false);
  });

  it('calcule l’annuité constante', () => {
    expect(levelPayment(1_200_000, 0, 1)).toBe(100_000);
    const payment = levelPayment(10_000_000, 8, 5);
    expect(Math.round(payment)).toBe(202_764);
    expect(
      remainingAtMonth(
        { remainingCapital: 10_000_000, annualRatePercent: 8, monthlyPayment: payment, monthsLeft: 60 },
        60
      )
    ).toBe(0);
  });

  it('compte les mois entiers jusqu’à l’échéance', () => {
    const today = new Date('2026-01-15T00:00:00Z');
    expect(monthsUntil(null, today)).toBeNull();
    expect(monthsUntil(new Date('2027-01-15T00:00:00Z'), today)).toBe(12);
    expect(monthsUntil(new Date('2027-01-14T00:00:00Z'), today)).toBe(11);
    expect(monthsUntil(new Date('2025-01-01T00:00:00Z'), today)).toBe(0);
  });
});

describe('mensualité constante : taux quasi nul', () => {
  it('un taux annuel de 1e-14 % (mensuel < 1e-9) est traité comme nul, jamais Infinity', () => {
    const payment = levelPayment(1_200_000, 1e-12, 20);
    expect(Number.isFinite(payment)).toBe(true);
    expect(payment).toBeCloseTo(1_200_000 / 240, 6);
    expect(levelPayment(1_200_000, 0, 20)).toBeCloseTo(5_000, 6);
  });

  it('un taux ordinaire garde la formule d’annuité', () => {
    expect(levelPayment(10_000_000, 6, 10)).toBeCloseTo(111_020.5, 0);
  });
});
