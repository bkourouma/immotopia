import { ManagementFeeBase, ManagementFeeMode } from '@prisma/client';
import { baseSourceId, sharedSourceId, shareLabel, splitAmount } from '../../src/lib/ownership/split';
import { computeOwnerStatement } from '../../src/lib/patrimoine/owner-statement-computation';

/**
 * Indivision — lot 4.
 *
 * Deux exigences : la somme des parts vaut toujours le montant d'origine (le
 * compte 4712 doit rester égal à la somme des comptes des propriétaires), et
 * une même pièce se répartit toujours de la même façon, quel que soit le
 * compte qui fait le calcul.
 */

describe('splitAmount', () => {
  const thirds = [
    { ownerClientId: 'c', sharePercent: 33.3334 },
    { ownerClientId: 'a', sharePercent: 33.3333 },
    { ownerClientId: 'b', sharePercent: 33.3333 }
  ];

  it('donne le reste d’arrondi au dernier, et retombe exactement sur le total', () => {
    const parts = splitAmount(100_000, thirds);
    expect(parts.get('a')).toBe(33_333);
    expect(parts.get('b')).toBe(33_333);
    expect(parts.get('c')).toBe(33_334);
    expect([...parts.values()].reduce((sum, v) => sum + v, 0)).toBe(100_000);
  });

  it('répartit toujours de la même façon, quel que soit l’ordre reçu', () => {
    const reversed = splitAmount(100_000, [...thirds].reverse());
    expect([...reversed.entries()].sort()).toEqual([...splitAmount(100_000, thirds).entries()].sort());
  });

  it('garde les centimes d’un montant qui en a', () => {
    const parts = splitAmount(1250.5, [
      { ownerClientId: 'a', sharePercent: 50 },
      { ownerClientId: 'b', sharePercent: 50 }
    ]);
    expect((parts.get('a') ?? 0) + (parts.get('b') ?? 0)).toBe(1250.5);
  });
});

describe('identifiants d’une pièce répartie', () => {
  it('embarquent la part, et se ramènent à la pièce d’origine', () => {
    const id = sharedSourceId('alloc-1', 'owner-9', 50);
    expect(id).toBe('alloc-1:owner-9:50.0000');
    expect(baseSourceId(id)).toBe('alloc-1');
    expect(baseSourceId('alloc-1')).toBe('alloc-1');
    // Une autre part donne une autre pièce : l'ancienne se contre-passe.
    expect(sharedSourceId('alloc-1', 'owner-9', 40)).not.toBe(id);
  });

  it('écrivent la part à la française', () => {
    expect(shareLabel(50)).toBe('50 %');
    expect(shareLabel(33.3333)).toBe('33,3333 %');
  });
});

describe('relevé d’un indivisaire', () => {
  it('ne reprend que sa quote-part du bien, loyers, honoraires et dépenses compris', () => {
    const result = computeOwnerStatement({
      periodStart: new Date(Date.UTC(2026, 8, 1)),
      periodEnd: new Date(Date.UTC(2026, 8, 30, 23, 59, 59, 999)),
      propertyIds: ['prop-1'],
      installments: [
        {
          propertyId: 'prop-1',
          dueDate: new Date(Date.UTC(2026, 8, 5)),
          countsAsDue: true,
          amountRent: 200_000,
          amountService: 0,
          amountOtherFees: 0,
          penaltyAmount: 0,
          allocations: [{ amount: 200_000, paidAt: new Date(Date.UTC(2026, 8, 6)) }]
        }
      ],
      expenses: [{ propertyId: 'prop-1', label: 'Plomberie', amount: 30_000, category: 'ROUTINE_MAINTENANCE' as any }],
      fees: [
        {
          propertyId: 'prop-1',
          feeAmount: 20_000,
          vatAmount: 3_600,
          mode: ManagementFeeMode.PERCENT,
          rate: 10,
          feeBase: ManagementFeeBase.RENT_ONLY,
          vatRate: 18
        }
      ],
      shareByProperty: new Map([['prop-1', 40]])
    });

    expect(result.totalRevenue).toBe(80_000);
    expect(result.totalManagementFees).toBe(8_000);
    expect(result.totalManagementFeesVat).toBe(1_440);
    expect(result.totalExpenses).toBe(12_000);
    expect(result.netAmount).toBe(80_000 - 8_000 - 1_440 - 12_000);
    expect(result.items[0].label).toBe('Loyers encaissés (quote-part 40 %)');
  });
});
