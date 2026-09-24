/**
 * Calcul de la commission de vente et répartition HT/TVA d'un règlement
 * (`lib/sales/commissions.ts`) — lot 9.
 *
 * Fonctions pures uniquement (`computeCommissionAmounts`,
 * `splitCommissionPaymentAmount`) : pas de Prisma à simuler, comme
 * `finance.money.test.ts` pour `roundMoneyXof` dont elles dépendent.
 */

import { computeCommissionAmounts, splitCommissionPaymentAmount } from '../../src/lib/sales/commissions';

describe('computeCommissionAmounts', () => {
  it('calcule une commission au pourcentage, agence assujettie à la TVA', () => {
    const mandate = { commissionMode: 'PERCENT' as const, commissionRate: 5, commissionFixedAmount: null };
    const result = computeCommissionAmounts(mandate, 48_000_000, true, 18);
    expect(result.amountExclTax).toBe(2_400_000);
    expect(result.vatRate).toBe(18);
    expect(result.vatAmount).toBe(432_000);
    expect(result.amountInclTax).toBe(2_832_000);
  });

  it('ignore le taux de TVA des paramètres quand l’agence n’y est pas assujettie', () => {
    const mandate = { commissionMode: 'PERCENT' as const, commissionRate: 5, commissionFixedAmount: null };
    const result = computeCommissionAmounts(mandate, 48_000_000, false, 18);
    expect(result.vatRate).toBe(0);
    expect(result.vatAmount).toBe(0);
    expect(result.amountInclTax).toBe(result.amountExclTax);
  });

  it('calcule un forfait, indépendant du prix de vente', () => {
    const mandate = { commissionMode: 'FIXED' as const, commissionRate: null, commissionFixedAmount: 1_500_000 };
    const result = computeCommissionAmounts(mandate, 90_000_000, true, 18);
    expect(result.amountExclTax).toBe(1_500_000);
    expect(result.vatAmount).toBe(270_000);
    expect(result.amountInclTax).toBe(1_770_000);
  });

  it('arrondit le HT à l’unité (franc CFA)', () => {
    // 33 333 333 * 3,3 % = 1 099 999,989
    const mandate = { commissionMode: 'PERCENT' as const, commissionRate: 3.3, commissionFixedAmount: null };
    const result = computeCommissionAmounts(mandate, 33_333_333, false, 18);
    expect(Number.isInteger(result.amountExclTax)).toBe(true);
    expect(result.amountExclTax).toBe(1_100_000);
  });
});

describe('splitCommissionPaymentAmount', () => {
  const commission = { vatRate: 18, amountExclTax: 2_400_000, amountInclTax: 2_832_000 };

  it("prend tout en HT quand l'agence n'est pas assujettie (vatRate = 0)", () => {
    const result = splitCommissionPaymentAmount(1_000_000, {
      vatRate: 0,
      amountExclTax: 1_000_000,
      amountInclTax: 1_000_000
    });
    expect(result.htPart).toBe(1_000_000);
    expect(result.vatPart).toBe(0);
  });

  it('répartit un règlement partiel au prorata, HT arrondi et TVA au reste', () => {
    // 1 000 000 * 2 400 000 / 2 832 000 = 847 457,627...
    const result = splitCommissionPaymentAmount(1_000_000, commission);
    expect(result.htPart).toBe(847_458);
    expect(result.vatPart).toBe(152_542);
    // L'écriture tombe juste : HT + TVA == le montant encaissé.
    expect(result.htPart + result.vatPart).toBe(1_000_000);
  });

  it('répartit un règlement du solde intégral en respectant les montants figés de la commission', () => {
    const result = splitCommissionPaymentAmount(2_832_000, commission);
    expect(result.htPart).toBe(2_400_000);
    expect(result.vatPart).toBe(432_000);
  });

  it('ne divise jamais par zéro quand amountInclTax est nul', () => {
    const result = splitCommissionPaymentAmount(0, { vatRate: 18, amountExclTax: 0, amountInclTax: 0 });
    expect(result).toEqual({ htPart: 0, vatPart: 0 });
  });
});
