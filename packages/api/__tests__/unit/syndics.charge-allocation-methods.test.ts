/**
 * Menu lot 2 — répartition d'un appel de charges entre les lots (fonction pure).
 */
import {
  allocateCharge,
  allocationPrecisionFor,
  ChargeAllocationError,
  lotTypesMissingFromRates,
  parseLotTypeRates,
  type AllocationLot,
  type AllocationResult
} from '../../src/lib/syndics/charge-allocation-methods';
import { distributeFixedAmount } from '../../src/lib/syndics/charge-schedule-periods';

const lot = (id: string, lotNumber: string, lotType = 'APARTMENT', generalShares = 100): AllocationLot => ({
  id,
  lotNumber,
  lotType,
  generalShares
});

const cents = (value: number) => Math.round(value * 100);
const sumCents = (result: AllocationResult) => result.lots.reduce((sum, line) => sum + cents(line.amount), 0);
const amounts = (result: AllocationResult) => result.lots.map(line => line.amount);

describe('allocateCharge - tantièmes (SHARES)', () => {
  it('répartit au prorata et la somme vaut exactement le total', () => {
    const result = allocateCharge({
      method: 'SHARES',
      totalAmount: 1000,
      lots: [lot('a', '1', 'APARTMENT', 600), lot('b', '2', 'APARTMENT', 400)]
    });
    expect(amounts(result)).toEqual([600, 400]);
    expect(result.totalAmount).toBe(1000);
    expect(sumCents(result)).toBe(100000);
    expect(result.excludedLotIds).toEqual([]);
  });

  it('le dernier lot absorbe le reste de l’arrondi', () => {
    const result = allocateCharge({
      method: 'SHARES',
      totalAmount: 100,
      lots: [lot('a', '1', 'APARTMENT', 1), lot('b', '2', 'APARTMENT', 1), lot('c', '3', 'APARTMENT', 1)]
    });
    expect(amounts(result)).toEqual([33.33, 33.33, 33.34]);
    expect(sumCents(result)).toBe(10000);
  });

  it('exclut un lot à 0 tantième et le liste', () => {
    const result = allocateCharge({
      method: 'SHARES',
      totalAmount: 500,
      lots: [lot('a', '1', 'APARTMENT', 250), lot('z', '2', 'PARKING', 0), lot('b', '3', 'APARTMENT', 250)]
    });
    expect(result.lots.map(l => l.lotId)).toEqual(['a', 'b']);
    expect(result.excludedLotIds).toEqual(['z']);
    expect(sumCents(result)).toBe(50000);
  });

  it('refuse quand tous les lots sont à 0 tantième', () => {
    expect(() => allocateCharge({ method: 'SHARES', totalAmount: 100, lots: [lot('a', '1', 'APARTMENT', 0)] })).toThrow(
      ChargeAllocationError
    );
  });

  it('refuse un total nul, négatif ou absent', () => {
    for (const totalAmount of [0, -5, null, undefined]) {
      expect(() => allocateCharge({ method: 'SHARES', totalAmount, lots: [lot('a', '1')] })).toThrow(
        ChargeAllocationError
      );
    }
  });

  it('refuse une liste de lots vide et un mode inconnu', () => {
    expect(() => allocateCharge({ method: 'SHARES', totalAmount: 10, lots: [] })).toThrow(ChargeAllocationError);
    expect(() => allocateCharge({ method: 'NOPE' as any, totalAmount: 10, lots: [lot('a', '1')] })).toThrow(
      'Mode de répartition inconnu'
    );
  });
});

describe('allocateCharge - équitable (EQUAL)', () => {
  it('divise exactement quand le total est divisible', () => {
    const result = allocateCharge({
      method: 'EQUAL',
      totalAmount: 900,
      lots: [lot('a', '1'), lot('b', '2'), lot('c', '3')]
    });
    expect(amounts(result)).toEqual([300, 300, 300]);
    expect(sumCents(result)).toBe(90000);
  });

  it('donne le reste au dernier lot', () => {
    const result = allocateCharge({
      method: 'EQUAL',
      totalAmount: 100,
      lots: [lot('a', '1'), lot('b', '2'), lot('c', '3')]
    });
    expect(amounts(result)).toEqual([33.33, 33.33, 33.34]);
    expect(sumCents(result)).toBe(10000);
  });

  it('ignore les tantièmes (un lot à 0 tantième est appelé)', () => {
    const result = allocateCharge({
      method: 'EQUAL',
      totalAmount: 100,
      lots: [lot('a', '1', 'APARTMENT', 0), lot('b', '2', 'APARTMENT', 500)]
    });
    expect(amounts(result)).toEqual([50, 50]);
  });

  it('refuse un total trop faible pour le nombre de lots', () => {
    const three = [lot('a', '1'), lot('b', '2'), lot('c', '3')];
    expect(() => allocateCharge({ method: 'EQUAL', totalAmount: 0.02, lots: three })).toThrow(
      /trop faible pour être réparti à parts égales entre 3 lots/
    );
    expect(() => allocateCharge({ method: 'EQUAL', totalAmount: 2, precision: 'UNIT', lots: three })).toThrow(
      ChargeAllocationError
    );
  });

  it('fonctionne avec un seul lot', () => {
    const result = allocateCharge({ method: 'EQUAL', totalAmount: 123.45, lots: [lot('a', '1')] });
    expect(amounts(result)).toEqual([123.45]);
    expect(result.totalAmount).toBe(123.45);
  });
});

describe('allocateCharge - par type de lot (BY_LOT_TYPE)', () => {
  const lots = [lot('a', '1', 'APARTMENT'), lot('b', '2', 'APARTMENT'), lot('p', '3', 'PARKING')];

  it('applique le montant de chaque type et le total est la somme', () => {
    const result = allocateCharge({
      method: 'BY_LOT_TYPE',
      lots,
      lotTypeRates: { APARTMENT: 25000, PARKING: 5000.5 }
    });
    expect(amounts(result)).toEqual([25000, 25000, 5000.5]);
    expect(result.totalAmount).toBe(55000.5);
    expect(sumCents(result)).toBe(cents(result.totalAmount));
  });

  it('ignore totalAmount', () => {
    const result = allocateCharge({
      method: 'BY_LOT_TYPE',
      lots,
      totalAmount: 1,
      lotTypeRates: { APARTMENT: 10, PARKING: 2 }
    });
    expect(result.totalAmount).toBe(22);
  });

  it('refuse un type absent du barème en nommant le type', () => {
    expect(() => allocateCharge({ method: 'BY_LOT_TYPE', lots, lotTypeRates: { APARTMENT: 100 } })).toThrow(
      /aucun montant pour PARKING\. Complétez-le dans les paramètres de la copropriété\.$/
    );
  });

  it('refuse un barème vide ou absent', () => {
    expect(() => allocateCharge({ method: 'BY_LOT_TYPE', lots, lotTypeRates: {} })).toThrow(/vide/);
    expect(() => allocateCharge({ method: 'BY_LOT_TYPE', lots, lotTypeRates: null })).toThrow(ChargeAllocationError);
  });

  it('exclut un lot dont le type est explicitement à 0 et le liste', () => {
    const result = allocateCharge({
      method: 'BY_LOT_TYPE',
      lots,
      lotTypeRates: { APARTMENT: 100, PARKING: 0 }
    });
    expect(result.lots.map(l => l.lotId)).toEqual(['a', 'b']);
    expect(result.excludedLotIds).toEqual(['p']);
    expect(result.totalAmount).toBe(200);
  });

  it('refuse quand tous les types sont à 0', () => {
    expect(() =>
      allocateCharge({ method: 'BY_LOT_TYPE', lots: [lot('a', '1')], lotTypeRates: { APARTMENT: 0 } })
    ).toThrow(/Aucun lot à appeler/);
  });
});

describe('allocateCharge - précision et tri', () => {
  const three = [lot('a', '1'), lot('b', '2'), lot('c', '3')];

  it('XOF : précision UNIT, parts entières', () => {
    expect(allocationPrecisionFor('XOF')).toBe('UNIT');
    expect(allocationPrecisionFor('xaf')).toBe('UNIT');
    expect(allocationPrecisionFor('EUR')).toBe('CENT');
    expect(allocationPrecisionFor(null)).toBe('CENT');
    const result = allocateCharge({ method: 'EQUAL', totalAmount: 100000, precision: 'UNIT', lots: three });
    expect(amounts(result)).toEqual([33333, 33333, 33334]);
    expect(result.totalAmount).toBe(100000);
    const shares = allocateCharge({ method: 'SHARES', totalAmount: 100000, precision: 'UNIT', lots: three });
    expect(amounts(shares)).toEqual([33333, 33333, 33334]);
  });

  it('CENT : parts au centime', () => {
    const result = allocateCharge({ method: 'EQUAL', totalAmount: 100000, precision: 'CENT', lots: three });
    expect(amounts(result)).toEqual([33333.33, 33333.33, 33333.34]);
    expect(sumCents(result)).toBe(10000000);
  });

  it('trie par numéro de lot numérique (2 avant 10) et le reste va au dernier', () => {
    const result = allocateCharge({
      method: 'EQUAL',
      totalAmount: 100,
      precision: 'UNIT',
      lots: [lot('l10', '10'), lot('l2', '2'), lot('l1', '1')]
    });
    expect(result.lots.map(l => l.lotNumber)).toEqual(['1', '2', '10']);
    expect(amounts(result)).toEqual([33, 33, 34]);
  });

  it('ne modifie pas ses arguments', () => {
    const input = [lot('l10', '10'), lot('l2', '2')];
    allocateCharge({ method: 'EQUAL', totalAmount: 100, lots: input });
    expect(input.map(l => l.id)).toEqual(['l10', 'l2']);
  });
});

describe('parseLotTypeRates / lotTypesMissingFromRates', () => {
  it('ignore les types inconnus, les valeurs négatives et non numériques', () => {
    expect(
      parseLotTypeRates({
        APARTMENT: 100,
        PARKING: -5,
        GARAGE: 10,
        CELLAR: '25.5',
        OFFICE: 'abc',
        OTHER: null,
        COMMERCIAL: 0
      })
    ).toEqual({ APARTMENT: 100, CELLAR: 25.5, COMMERCIAL: 0 });
  });

  it('rend un barème vide pour une valeur non objet', () => {
    expect(parseLotTypeRates(null)).toEqual({});
    expect(parseLotTypeRates([1, 2])).toEqual({});
    expect(parseLotTypeRates('x')).toEqual({});
  });

  it('liste les types présents sans montant (0 compte comme un montant)', () => {
    expect(
      lotTypesMissingFromRates([{ lotType: 'PARKING' }, { lotType: 'APARTMENT' }, { lotType: 'OFFICE' }], {
        APARTMENT: 0
      })
    ).toEqual(['PARKING', 'OFFICE']);
  });
});

describe('rétrocompatibilité SHARES / distributeFixedAmount', () => {
  const datasets: Array<{ total: number; shares: number[] }> = [
    { total: 100000, shares: [600, 400] },
    { total: 100, shares: [1, 1, 1] },
    { total: 12345.67, shares: [333, 333, 334] },
    { total: 99999.99, shares: [137, 211, 59, 593] },
    { total: 0.07, shares: [3, 5, 7] },
    { total: 1000000, shares: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
    { total: 20000.05, shares: [250, 750] }
  ];

  it.each(datasets)('mêmes montants pour %j', ({ total, shares }) => {
    const lots = shares.map((generalShares, index) =>
      lot(`lot-${index}`, String(index + 1), 'APARTMENT', generalShares)
    );
    const expected = distributeFixedAmount(total, lots as any);
    const actual = allocateCharge({ method: 'SHARES', totalAmount: total, precision: 'CENT', lots });
    expect(actual.lots.map(l => ({ lotId: l.lotId, amount: l.amount }))).toEqual(expected);
    expect(sumCents(actual)).toBe(cents(total));
  });
});
