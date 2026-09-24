import { ManagementFeeBase, ManagementFeeMode } from '@prisma/client';
import { computeAllocationFee, FeeTerms, feeTermsSchema, resolveFeeTerms } from '../../src/lib/rental-fees/fee-terms';

/**
 * Honoraires de gestion — lot 2 de la gestion locative.
 *
 * Trois niveaux de conditions (bail, propriétaire, agence), deux modes
 * (pourcentage, forfait par échéance), et un calcul par encaissement qui fige
 * ce qui est dû à l'agence, à l'État et au gestionnaire.
 */

const percent = (rate: number, base: ManagementFeeBase = ManagementFeeBase.RENT_ONLY): FeeTerms => ({
  managementFeeMode: ManagementFeeMode.PERCENT,
  managementFeeRate: rate,
  managementFeeFixedAmount: null,
  managementFeeBase: base
});

const fixed = (amount: number): FeeTerms => ({
  managementFeeMode: ManagementFeeMode.FIXED,
  managementFeeRate: null,
  managementFeeFixedAmount: amount,
  managementFeeBase: ManagementFeeBase.RENT_ONLY
});

describe('resolveFeeTerms', () => {
  it('fait passer le bail avant le propriétaire, et le propriétaire avant l’agence', () => {
    expect(resolveFeeTerms({ lease: percent(6), owner: percent(8), agency: percent(10) })).toMatchObject({
      source: 'LEASE',
      managementFeeRate: 6
    });
    expect(resolveFeeTerms({ lease: null, owner: percent(8), agency: percent(10) })).toMatchObject({
      source: 'OWNER',
      managementFeeRate: 8
    });
    expect(resolveFeeTerms({ lease: null, owner: null, agency: percent(10) })).toMatchObject({ source: 'AGENCY' });
  });

  it("ignore un niveau qui n'a pas de quoi calculer", () => {
    const agencyWithoutRate = { ...percent(0), managementFeeRate: null };
    expect(resolveFeeTerms({ agency: agencyWithoutRate })).toEqual({ source: 'NONE' });
    expect(
      resolveFeeTerms({ owner: { ...fixed(0), managementFeeFixedAmount: null }, agency: percent(10) })
    ).toMatchObject({
      source: 'AGENCY'
    });
  });

  it('accepte un taux de zéro : un propriétaire exonéré n’est pas un propriétaire non paramétré', () => {
    expect(resolveFeeTerms({ owner: percent(0), agency: percent(10) })).toMatchObject({
      source: 'OWNER',
      managementFeeRate: 0
    });
  });
});

describe('computeAllocationFee', () => {
  const vat = { registered: true, rate: 18 };

  it('prend le taux sur la part payée seulement', () => {
    const fee = computeAllocationFee({
      amount: 50_000,
      installment: { amountRent: 200_000, total: 200_000 },
      terms: percent(10),
      vat,
      agentSharePercent: null
    });
    expect(fee).toMatchObject({ feeAmount: 5_000, vatAmount: 900, agentShareAmount: 0 });
  });

  it("limite l'assiette « loyer seul » à la part loyer, au prorata", () => {
    const base = { amount: 50_000, installment: { amountRent: 90_000, total: 100_000 }, vat, agentSharePercent: null };
    expect(computeAllocationFee({ ...base, terms: percent(10) }).feeAmount).toBe(4_500);
    expect(computeAllocationFee({ ...base, terms: percent(10, ManagementFeeBase.ALL_COLLECTED) }).feeAmount).toBe(
      5_000
    );
  });

  it('porte le forfait une seule fois sur une échéance payée en deux fois', () => {
    const inst = { amountRent: 200_000, total: 200_000 };
    const first = computeAllocationFee({
      amount: 120_000,
      installment: inst,
      terms: fixed(15_000),
      vat,
      agentSharePercent: null
    });
    const second = computeAllocationFee({
      amount: 80_000,
      installment: inst,
      terms: fixed(15_000),
      vat,
      agentSharePercent: null
    });
    expect(first.feeAmount + second.feeAmount).toBe(15_000);
  });

  it("ne facture pas de TVA quand l'agence n'y est pas assujettie", () => {
    const fee = computeAllocationFee({
      amount: 200_000,
      installment: { amountRent: 200_000, total: 200_000 },
      terms: percent(10),
      vat: { registered: false, rate: 18 },
      agentSharePercent: null
    });
    expect(fee.vatAmount).toBe(0);
    expect(fee.vatRate).toBeNull();
  });

  it('calcule la part du gestionnaire sur les honoraires HT', () => {
    const fee = computeAllocationFee({
      amount: 200_000,
      installment: { amountRent: 200_000, total: 200_000 },
      terms: percent(10),
      vat,
      agentSharePercent: 30
    });
    expect(fee).toMatchObject({ feeAmount: 20_000, vatAmount: 3_600, agentShareAmount: 6_000 });
  });

  it('arrondit au franc', () => {
    const fee = computeAllocationFee({
      amount: 33_335,
      installment: { amountRent: 33_335, total: 33_335 },
      terms: percent(10),
      vat,
      agentSharePercent: null
    });
    // 3 333,5 arrondi à 3 334 ; TVA 600,12 arrondie à 600.
    expect(fee.feeAmount).toBe(3_334);
    expect(fee.vatAmount).toBe(600);
  });
});

describe('feeTermsSchema', () => {
  it('exige le taux en pourcentage et le montant en forfait', () => {
    expect(() => feeTermsSchema.parse({ managementFeeMode: 'PERCENT', managementFeeRate: null })).toThrow();
    expect(() => feeTermsSchema.parse({ managementFeeMode: 'FIXED', managementFeeFixedAmount: null })).toThrow();
  });

  it("efface la valeur de l'autre mode", () => {
    expect(
      feeTermsSchema.parse({ managementFeeMode: 'FIXED', managementFeeRate: 10, managementFeeFixedAmount: 15_000 })
    ).toEqual({
      managementFeeMode: 'FIXED',
      managementFeeRate: null,
      managementFeeFixedAmount: 15_000,
      managementFeeBase: 'RENT_ONLY'
    });
  });
});
