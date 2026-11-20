import { ManagementFeeBase, ManagementFeeMode } from '@prisma/client';
import { computeAllocationFee, FeeTerms } from '../../src/lib/rental-fees/fee-terms';

/**
 * Revue locative (lot 6, H3) : en FCFA, jamais de décimales. Les honoraires
 * d'une échéance réglée en plusieurs fois s'arrondissent en CUMULÉ : la somme
 * des parts vaut le forfait (ou le pourcentage) arrondi une seule fois.
 */

const fixed = (amount: number): FeeTerms => ({
  managementFeeMode: ManagementFeeMode.FIXED,
  managementFeeRate: null,
  managementFeeFixedAmount: amount,
  managementFeeBase: ManagementFeeBase.RENT_ONLY
});

const percent = (rate: number, base: ManagementFeeBase = ManagementFeeBase.ALL_COLLECTED): FeeTerms => ({
  managementFeeMode: ManagementFeeMode.PERCENT,
  managementFeeRate: rate,
  managementFeeFixedAmount: null,
  managementFeeBase: base
});

/** Rejoue des règlements successifs sur une échéance et totalise les parts. */
function replay(
  parts: number[],
  total: number,
  terms: FeeTerms,
  opts: { vat?: { registered: boolean; rate: number }; agent?: number | null; amountRent?: number } = {}
) {
  let prior = 0;
  const sums = { fee: 0, vat: 0, agent: 0 };
  const fees: number[] = [];
  for (const amount of parts) {
    const result = computeAllocationFee({
      amount,
      priorAmount: prior,
      installment: { amountRent: opts.amountRent ?? total, total },
      terms,
      vat: opts.vat ?? { registered: false, rate: 0 },
      agentSharePercent: opts.agent ?? null
    });
    fees.push(result.feeAmount);
    sums.fee += result.feeAmount;
    sums.vat += result.vatAmount;
    sums.agent += result.agentShareAmount;
    prior += amount;
  }
  return { ...sums, fees };
}

describe('computeAllocationFee : arrondi cumulé (FCFA sans décimales)', () => {
  it('forfait de 1 001 payé en 2 moitiés : 1 001 au total (et non 1 002)', () => {
    const { fee, fees } = replay([50000, 50000], 100000, fixed(1001));
    expect(fee).toBe(1001);
    expect(fees).toEqual([501, 500]);
  });

  it('forfait de 1 001 payé en 3 tiers : 1 001 au total', () => {
    const { fee, fees } = replay([30000, 30000, 40000], 100000, fixed(1001));
    expect(fee).toBe(1001);
    expect(fees.every(Number.isInteger)).toBe(true);
  });

  it('forfait payé en 3 parts égales : 1 001 au total, entiers', () => {
    const { fee, fees } = replay([100, 100, 100], 300, fixed(1001));
    expect(fee).toBe(1001);
    expect(fees.every(Number.isInteger)).toBe(true);
  });

  it('pourcentage cumulé : arrondi une seule fois sur l’échéance soldée en trois fois', () => {
    const { fee } = replay([335, 335, 335], 1005, percent(7));
    expect(fee).toBe(Math.round(1005 * 0.07));
  });

  it('pourcentage sur le loyer seul, échéance réglée en deux fois', () => {
    const { fee } = replay([700, 303], 1003, percent(5, ManagementFeeBase.RENT_ONLY), { amountRent: 803 });
    expect(fee).toBe(Math.round(803 * 0.05));
  });

  it('TVA et part de l’agent : cumul arrondi une seule fois, entiers partout', () => {
    const { fee, vat, agent } = replay([50000, 50000], 100000, fixed(1001), {
      vat: { registered: true, rate: 18 },
      agent: 50
    });
    expect(fee).toBe(1001);
    expect(vat).toBe(Math.round((1001 * 18) / 100));
    expect(agent).toBe(Math.round((1001 * 50) / 100));
  });

  it('une affectation unique donne le même résultat qu’avant (sans priorAmount)', () => {
    const result = computeAllocationFee({
      amount: 100000,
      installment: { amountRent: 100000, total: 100000 },
      terms: fixed(1001),
      vat: { registered: true, rate: 18 },
      agentSharePercent: null
    });
    expect(result.feeAmount).toBe(1001);
    expect(result.vatAmount).toBe(180);
  });

  it('le cumul est plafonné au total de l’échéance : un surplus ne facture rien de plus', () => {
    const { fee } = replay([100000, 5000], 100000, fixed(1001));
    expect(fee).toBe(1001);
  });
});
