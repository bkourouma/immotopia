import { describe, expect, it } from 'vitest';
import {
  allocationPrecisionFor,
  distributeFixedAmount,
  lotTypesMissingFromRates,
  lotsWithShares,
  previewAllocation,
  previewScheduleAllocation,
  type AllocationPreviewLot,
  type AllocationPreviewResult
} from '../../utils/charge-allocation-preview';

/**
 * Miroir de `packages/api/__tests__/unit/syndics.charge-allocation-methods.test.ts` :
 * mêmes jeux de cas, mêmes messages (l'aperçu web doit donner le résultat de l'API).
 */

const lot = (id: string, lotNumber: string, lotType = 'APARTMENT', generalShares = 100): AllocationPreviewLot => ({
  id,
  lotNumber,
  lotType,
  generalShares
});

const cents = (value: number) => Math.round(value * 100);
const sumCents = (result: AllocationPreviewResult) => result.lines.reduce((sum, line) => sum + cents(line.amount), 0);
const amounts = (result: AllocationPreviewResult) => result.lines.map(line => line.amount);

describe('previewAllocation - tantièmes (SHARES)', () => {
  it('répartit au prorata et la somme vaut exactement le total', () => {
    const result = previewAllocation({
      method: 'SHARES',
      totalAmount: 1000,
      lots: [lot('a', '1', 'APARTMENT', 600), lot('b', '2', 'APARTMENT', 400)]
    });
    expect(result.error).toBeNull();
    expect(amounts(result)).toEqual([600, 400]);
    expect(result.totalAmount).toBe(1000);
    expect(sumCents(result)).toBe(100000);
  });

  it('le dernier lot absorbe le reste de l’arrondi', () => {
    const result = previewAllocation({
      method: 'SHARES',
      totalAmount: 100,
      lots: [lot('a', '1', 'APARTMENT', 1), lot('b', '2', 'APARTMENT', 1), lot('c', '3', 'APARTMENT', 1)]
    });
    expect(amounts(result)).toEqual([33.33, 33.33, 33.34]);
    expect(sumCents(result)).toBe(10000);
  });

  it('exclut un lot à 0 tantième', () => {
    const result = previewAllocation({
      method: 'SHARES',
      totalAmount: 500,
      lots: [lot('a', '1', 'APARTMENT', 250), lot('z', '2', 'PARKING', 0), lot('b', '3', 'APARTMENT', 250)]
    });
    expect(result.lines.map(l => l.lotId)).toEqual(['a', 'b']);
    expect(sumCents(result)).toBe(50000);
  });

  it('refuse (sans lever) quand tous les lots sont à 0 tantième', () => {
    const result = previewAllocation({ method: 'SHARES', totalAmount: 100, lots: [lot('a', '1', 'APARTMENT', 0)] });
    expect(result.error).toBe('Aucun lot avec des tantièmes : impossible de répartir par tantièmes');
    expect(result.lines).toEqual([]);
    expect(result.totalAmount).toBe(0);
  });

  it('refuse un total nul, négatif ou absent', () => {
    for (const totalAmount of [0, -5, null, undefined]) {
      expect(previewAllocation({ method: 'SHARES', totalAmount, lots: [lot('a', '1')] }).error).toBe(
        'Le montant total à répartir doit être strictement positif'
      );
    }
  });

  it('refuse une liste de lots vide et un mode inconnu', () => {
    expect(previewAllocation({ method: 'SHARES', totalAmount: 10, lots: [] }).error).toBe(
      'Aucun lot à appeler pour cette répartition'
    );
    expect(previewAllocation({ method: 'NOPE' as any, totalAmount: 10, lots: [lot('a', '1')] }).error).toBe(
      'Mode de répartition inconnu'
    );
  });
});

describe('previewAllocation - équitable (EQUAL)', () => {
  it('divise exactement quand le total est divisible', () => {
    const result = previewAllocation({
      method: 'EQUAL',
      totalAmount: 900,
      lots: [lot('a', '1'), lot('b', '2'), lot('c', '3')]
    });
    expect(amounts(result)).toEqual([300, 300, 300]);
    expect(sumCents(result)).toBe(90000);
  });

  it('donne le reste au dernier lot', () => {
    const result = previewAllocation({
      method: 'EQUAL',
      totalAmount: 100,
      lots: [lot('a', '1'), lot('b', '2'), lot('c', '3')]
    });
    expect(amounts(result)).toEqual([33.33, 33.33, 33.34]);
  });

  it('ignore les tantièmes (un lot à 0 tantième est appelé)', () => {
    const result = previewAllocation({
      method: 'EQUAL',
      totalAmount: 100,
      lots: [lot('a', '1', 'APARTMENT', 0), lot('b', '2', 'APARTMENT', 500)]
    });
    expect(amounts(result)).toEqual([50, 50]);
  });

  it('refuse un total trop faible pour le nombre de lots', () => {
    const three = [lot('a', '1'), lot('b', '2'), lot('c', '3')];
    expect(previewAllocation({ method: 'EQUAL', totalAmount: 0.02, lots: three }).error).toMatch(/trop faible/);
    // 2 F entre 3 lots : le franc est la plus petite unité du FCFA.
    expect(previewAllocation({ method: 'EQUAL', totalAmount: 2, currency: 'XOF', lots: three }).error).toMatch(
      /trop faible pour être réparti à parts égales entre 3 lots/
    );
  });

  it('fonctionne avec un seul lot', () => {
    const result = previewAllocation({ method: 'EQUAL', totalAmount: 123.45, lots: [lot('a', '1')] });
    expect(amounts(result)).toEqual([123.45]);
    expect(result.totalAmount).toBe(123.45);
  });
});

describe('previewAllocation - par type de lot (BY_LOT_TYPE)', () => {
  const lots = [lot('a', '1', 'APARTMENT'), lot('b', '2', 'APARTMENT'), lot('p', '3', 'PARKING')];

  it('applique le montant de chaque type et le total est la somme', () => {
    const result = previewAllocation({
      method: 'BY_LOT_TYPE',
      lots,
      lotTypeRates: { APARTMENT: 25000, PARKING: 5000.5 }
    });
    expect(amounts(result)).toEqual([25000, 25000, 5000.5]);
    expect(result.totalAmount).toBe(55000.5);
    expect(result.lines.map(l => l.lotType)).toEqual(['APARTMENT', 'APARTMENT', 'PARKING']);
  });

  it('ignore totalAmount', () => {
    const result = previewAllocation({
      method: 'BY_LOT_TYPE',
      lots,
      totalAmount: 1,
      lotTypeRates: { APARTMENT: 10, PARKING: 2 }
    });
    expect(result.totalAmount).toBe(22);
  });

  it('refuse un type absent du barème en nommant le type', () => {
    const result = previewAllocation({ method: 'BY_LOT_TYPE', lots, lotTypeRates: { APARTMENT: 100 } });
    expect(result.error).toBe(
      'Le barème par type de lot est incomplet : aucun montant pour Parking. Complétez-le dans les paramètres de la copropriété.'
    );
    expect(result.errorKind).toBe('LOT_TYPE_RATES');
  });

  it('refuse un barème vide ou indisponible', () => {
    const empty =
      'Le barème par type de lot de cette copropriété est vide : renseignez-le dans les paramètres de la copropriété.';
    expect(previewAllocation({ method: 'BY_LOT_TYPE', lots, lotTypeRates: {} }).error).toBe(empty);
    expect(previewAllocation({ method: 'BY_LOT_TYPE', lots, lotTypeRates: null }).error).toBe(empty);
    expect(previewAllocation({ method: 'BY_LOT_TYPE', lots, lotTypeRates: {} }).errorKind).toBe('LOT_TYPE_RATES');
  });

  it('exclut un lot dont le type est explicitement à 0', () => {
    const result = previewAllocation({ method: 'BY_LOT_TYPE', lots, lotTypeRates: { APARTMENT: 100, PARKING: 0 } });
    expect(result.lines.map(l => l.lotId)).toEqual(['a', 'b']);
    expect(result.totalAmount).toBe(200);
  });

  it('refuse quand tous les types sont à 0', () => {
    expect(
      previewAllocation({ method: 'BY_LOT_TYPE', lots: [lot('a', '1')], lotTypeRates: { APARTMENT: 0 } }).error
    ).toMatch(/Aucun lot à appeler/);
  });

  it("ne pose pas d'errorKind sur les autres erreurs", () => {
    const result = previewAllocation({ method: 'EQUAL', lots, totalAmount: 0 });
    expect(result.error).not.toBeNull();
    expect(result.errorKind ?? null).toBeNull();
  });
});

describe('previewAllocation - précision et tri', () => {
  const three = [lot('a', '1'), lot('b', '2'), lot('c', '3')];

  it('XOF : précision au franc, parts entières', () => {
    expect(allocationPrecisionFor('XOF')).toBe('UNIT');
    expect(allocationPrecisionFor('xaf')).toBe('UNIT');
    expect(allocationPrecisionFor('EUR')).toBe('CENT');
    expect(allocationPrecisionFor(null)).toBe('CENT');
    const equal = previewAllocation({ method: 'EQUAL', totalAmount: 100000, currency: 'XOF', lots: three });
    expect(amounts(equal)).toEqual([33333, 33333, 33334]);
    expect(equal.totalAmount).toBe(100000);
    const shares = previewAllocation({ method: 'SHARES', totalAmount: 100000, currency: 'XOF', lots: three });
    expect(amounts(shares)).toEqual([33333, 33333, 33334]);
  });

  it('centime : parts au centime', () => {
    const result = previewAllocation({ method: 'EQUAL', totalAmount: 100000, currency: 'EUR', lots: three });
    expect(amounts(result)).toEqual([33333.33, 33333.33, 33333.34]);
    expect(sumCents(result)).toBe(10000000);
  });

  it('trie par numéro de lot numérique (2 avant 10) et le reste va au dernier', () => {
    const result = previewAllocation({
      method: 'EQUAL',
      totalAmount: 100,
      currency: 'XOF',
      lots: [lot('l10', '10'), lot('l2', '2'), lot('l1', '1')]
    });
    expect(result.lines.map(l => l.lotNumber)).toEqual(['1', '2', '10']);
    expect(amounts(result)).toEqual([33, 33, 34]);
  });

  it('ne modifie pas ses arguments', () => {
    const input = [lot('l10', '10'), lot('l2', '2')];
    previewAllocation({ method: 'EQUAL', totalAmount: 100, lots: input });
    expect(input.map(l => l.id)).toEqual(['l10', 'l2']);
  });
});

describe('lotTypesMissingFromRates', () => {
  it('liste les types présents sans montant (0 compte comme un montant)', () => {
    expect(
      lotTypesMissingFromRates([{ lotType: 'PARKING' }, { lotType: 'APARTMENT' }, { lotType: 'OFFICE' }], {
        APARTMENT: 0
      })
    ).toEqual(['PARKING', 'OFFICE']);
  });
});

describe('programmation FIXED', () => {
  const datasets: Array<{ total: number; shares: number[] }> = [
    { total: 100000, shares: [600, 400] },
    { total: 100, shares: [1, 1, 1] },
    { total: 12345.67, shares: [333, 333, 334] },
    { total: 99999.99, shares: [137, 211, 59, 593] },
    { total: 0.07, shares: [3, 5, 7] },
    { total: 1000000, shares: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
    { total: 20000.05, shares: [250, 750] }
  ];

  it.each(datasets)('SHARES (centimes) : mêmes montants que previewAllocation pour %j', ({ total, shares }) => {
    const lots = shares.map((generalShares, index) =>
      lot(`lot-${index}`, String(index + 1), 'APARTMENT', generalShares)
    );
    const schedule = previewScheduleAllocation({ method: 'SHARES', totalAmount: total, currency: 'EUR', lots });
    const direct = previewAllocation({ method: 'SHARES', totalAmount: total, currency: 'EUR', lots });
    expect(schedule.error).toBeNull();
    expect(schedule.lines.map(l => ({ lotId: l.lotId, amount: l.amount }))).toEqual(
      direct.lines.map(l => ({ lotId: l.lotId, amount: l.amount }))
    );
    expect(sumCents(schedule)).toBe(cents(total));
  });

  it('SHARES : lots principaux seulement (parking exclu), repli sur tous si aucun principal', () => {
    const mixed = [lot('a', '1', 'APARTMENT', 100), lot('p', '2', 'PARKING', 100), lot('o', '3', 'OFFICE', 100)];
    expect(distributeFixedAmount(1000, mixed).map(l => l.lotId)).toEqual(['a', 'o']);
    const parkings = [lot('p1', '1', 'PARKING', 100), lot('p2', '2', 'PARKING', 100)];
    expect(distributeFixedAmount(1000, parkings).map(l => l.lotId)).toEqual(['p1', 'p2']);
  });

  it('SHARES avec lots annexes : parking inclus comme l’appel direct (A1 100, A2 200, C1 300, P1 400)', () => {
    const lots = [
      lot('a1', 'A1', 'APARTMENT', 100),
      lot('a2', 'A2', 'APARTMENT', 200),
      lot('c1', 'C1', 'COMMERCIAL', 300),
      lot('p1', 'P1', 'PARKING', 400)
    ];
    const withAnnex = previewScheduleAllocation({
      method: 'SHARES',
      totalAmount: 1000000,
      lots,
      includeAnnexLots: true
    });
    expect(amounts(withAnnex)).toEqual([100000, 200000, 300000, 400000]);
    const mainOnly = previewScheduleAllocation({
      method: 'SHARES',
      totalAmount: 1000000,
      lots,
      includeAnnexLots: false
    });
    expect(mainOnly.lines.map(l => l.lotId)).toEqual(['a1', 'a2', 'c1']);
  });

  it('SHARES : parts égales si personne n’a de tantièmes', () => {
    const lots = [lot('a', '1', 'APARTMENT', 0), lot('b', '2', 'APARTMENT', 0)];
    const result = previewScheduleAllocation({ method: 'SHARES', totalAmount: 100, lots });
    expect(amounts(result)).toEqual([50, 50]);
  });

  it('EQUAL et BY_LOT_TYPE : lots actifs (tantièmes > 0), ou tous si aucun n’en a', () => {
    const lots = [lot('a', '1', 'APARTMENT', 100), lot('z', '2', 'PARKING', 0), lot('b', '3', 'APARTMENT', 100)];
    expect(lotsWithShares(lots).map(l => l.id)).toEqual(['a', 'b']);
    const equal = previewScheduleAllocation({ method: 'EQUAL', totalAmount: 100, lots });
    expect(equal.lines.map(l => l.lotId)).toEqual(['a', 'b']);
    const byType = previewScheduleAllocation({
      method: 'BY_LOT_TYPE',
      lots,
      lotTypeRates: { APARTMENT: 10, PARKING: 5 }
    });
    expect(byType.totalAmount).toBe(20);
    const noShares = previewScheduleAllocation({
      method: 'EQUAL',
      totalAmount: 100,
      lots: [lot('a', '1', 'APARTMENT', 0), lot('b', '2', 'APARTMENT', 0)]
    });
    expect(amounts(noShares)).toEqual([50, 50]);
  });

  it('SHARES : total invalide', () => {
    expect(previewScheduleAllocation({ method: 'SHARES', totalAmount: 0, lots: [lot('a', '1')] }).error).toBe(
      'Le montant total à répartir doit être strictement positif'
    );
  });
});
