/**
 * Tests de l'agrégation pure de consolidation patrimoniale (lot P4,
 * territoire A2, `lib/patrimoine/entities/consolidation.ts`).
 */

import { consolidateHoldings, type ConsolidationHoldingInput } from '../../src/lib/patrimoine/entities/consolidation';
import type { YieldInput } from '../../src/lib/patrimoine/yield';

function yieldInput(overrides: Partial<YieldInput> = {}): YieldInput {
  return {
    annualRent: 0,
    currentValue: 0,
    costBasis: 0,
    annualExpenses: 0,
    annualLoanPayments: 0,
    ...overrides
  };
}

describe('consolidateHoldings', () => {
  it('pondère les montants par la quote-part, sur un seul bien détenu à 50 %', () => {
    const holdings: ConsolidationHoldingInput[] = [
      {
        propertyId: 'p1',
        title: 'Bien 1',
        internalReference: 'REF-1',
        sharePercent: 50,
        pending: false,
        yieldInput: yieldInput({ annualRent: 1_200_000, currentValue: 20_000_000, annualExpenses: 200_000 }),
        outstandingDebt: 5_000_000
      }
    ];

    const { totals, properties } = consolidateHoldings(holdings);

    expect(properties[0].estimatedValue).toBe(10_000_000);
    expect(properties[0].outstandingDebt).toBe(2_500_000);
    expect(properties[0].annualRent).toBe(600_000);
    expect(properties[0].annualExpenses).toBe(100_000);
    // Le rendement est un ratio, insensible à la quote-part.
    expect(properties[0].grossYield).toBeCloseTo(6, 5);

    expect(totals.estimatedValue).toBe(10_000_000);
    expect(totals.outstandingDebt).toBe(2_500_000);
    expect(totals.netEquity).toBe(7_500_000);
    expect(totals.propertiesCount).toBe(1);
  });

  it('exclut les rattachements `pending` des totaux mais les garde dans `properties`', () => {
    const holdings: ConsolidationHoldingInput[] = [
      {
        propertyId: 'p1',
        title: 'Bien 1',
        internalReference: 'REF-1',
        sharePercent: 100,
        pending: false,
        yieldInput: yieldInput({ annualRent: 1_000_000, currentValue: 10_000_000 }),
        outstandingDebt: 0
      },
      {
        propertyId: 'p2',
        title: 'Bien 2 (futur)',
        internalReference: 'REF-2',
        sharePercent: 100,
        pending: true,
        yieldInput: yieldInput({ annualRent: 5_000_000, currentValue: 50_000_000 }),
        outstandingDebt: 0
      }
    ];

    const { totals, properties } = consolidateHoldings(holdings);

    expect(properties).toHaveLength(2);
    expect(properties.find(p => p.propertyId === 'p2')?.pending).toBe(true);
    expect(totals.propertiesCount).toBe(1);
    expect(totals.estimatedValue).toBe(10_000_000);
    expect(totals.annualRent).toBe(1_000_000);
  });

  it('signale `costBasisIncomplete` et renvoie `netNetYield`/`latentCapitalGain` nuls quand un coût de revient est inconnu', () => {
    const holdings: ConsolidationHoldingInput[] = [
      {
        propertyId: 'p1',
        title: 'Bien 1',
        internalReference: 'REF-1',
        sharePercent: 100,
        pending: false,
        yieldInput: yieldInput({ annualRent: 1_000_000, currentValue: 10_000_000, costBasis: 8_000_000 }),
        outstandingDebt: 0
      },
      {
        propertyId: 'p2',
        title: 'Bien 2',
        internalReference: 'REF-2',
        sharePercent: 100,
        pending: false,
        // costBasis 0 = inconnu (voir lib/patrimoine/yield.ts, hasCostBasis).
        yieldInput: yieldInput({ annualRent: 500_000, currentValue: 5_000_000, costBasis: 0 }),
        outstandingDebt: 0
      }
    ];

    const { totals } = consolidateHoldings(holdings);

    expect(totals.costBasisIncomplete).toBe(true);
    expect(totals.netNetYield).toBeNull();
    expect(totals.latentCapitalGain).toBeNull();
  });

  it('calcule des rendements agrégés cohérents quand tous les coûts de revient sont connus', () => {
    const holdings: ConsolidationHoldingInput[] = [
      {
        propertyId: 'p1',
        title: 'Bien 1',
        internalReference: 'REF-1',
        sharePercent: 100,
        pending: false,
        yieldInput: yieldInput({
          annualRent: 1_000_000,
          currentValue: 10_000_000,
          costBasis: 8_000_000,
          annualExpenses: 100_000,
          annualLoanPayments: 200_000
        }),
        outstandingDebt: 0
      },
      {
        propertyId: 'p2',
        title: 'Bien 2',
        internalReference: 'REF-2',
        sharePercent: 100,
        pending: false,
        yieldInput: yieldInput({
          annualRent: 500_000,
          currentValue: 5_000_000,
          costBasis: 4_000_000,
          annualExpenses: 50_000,
          annualLoanPayments: 0
        }),
        outstandingDebt: 0
      }
    ];

    const { totals } = consolidateHoldings(holdings);

    expect(totals.costBasisIncomplete).toBe(false);
    // (1_500_000 - 150_000) / 15_000_000 * 100
    expect(totals.netYield).toBeCloseTo(9, 5);
    expect(totals.netNetYield).not.toBeNull();
    expect(totals.latentCapitalGain).toBe(15_000_000 - 12_000_000);
  });
});
