/**
 * Lot S2 — calculs purs de l'affectation des paiements et de l'imputation des
 * avances (`lib/syndics/charge-allocation-plan.ts`) et du suivi mensuel
 * (`lib/syndics/charge-monthly-tracking.ts`).
 */

import {
  planAdvanceImputation,
  planAllocation,
  planAllocationCents,
  statusFromCents,
  toCents,
  type AllocatableCall
} from '../../src/lib/syndics/charge-allocation-plan';
import {
  buildLotMonthGrid,
  monthPartsOfCall,
  monthsOfCall,
  splitEvenly,
  type TrackedCall
} from '../../src/lib/syndics/charge-monthly-tracking';

const d = (value: string) => new Date(`${value}T00:00:00.000Z`);

function call(id: string, due: string, outstanding: number, created = '2026-01-01'): AllocatableCall {
  return { id, dueDate: d(due), createdAt: d(created), outstandingCents: toCents(outstanding) };
}

describe('planAllocation — paiement sans selection', () => {
  const open = [call('mars', '2026-03-05', 10000), call('janvier', '2026-01-05', 10000), call('fevrier', '2026-02-05', 10000)];

  it('solde les appels les plus anciens d abord (echeance croissante)', () => {
    const plan = planAllocationCents(open, toCents(25000));
    expect(plan.allocations).toEqual([
      { chargeCallId: 'janvier', amountCents: 1000000 },
      { chargeCallId: 'fevrier', amountCents: 1000000 },
      { chargeCallId: 'mars', amountCents: 500000 }
    ]);
    expect(plan.advanceCents).toBe(0);
  });

  it('a echeance egale, departage par date de creation puis identifiant', () => {
    const plan = planAllocationCents(
      [call('b', '2026-01-05', 100, '2026-01-02'), call('a', '2026-01-05', 100, '2026-01-02'), call('c', '2026-01-05', 100, '2026-01-01')],
      toCents(150)
    );
    expect(plan.allocations.map(item => item.chargeCallId)).toEqual(['c', 'a']);
  });

  it('montant exact : aucun reliquat', () => {
    expect(planAllocation(
      open.map(item => ({ ...item, outstanding: item.outstandingCents / 100 })),
      30000
    )).toEqual({
      allocations: [
        { chargeCallId: 'janvier', amount: 10000 },
        { chargeCallId: 'fevrier', amount: 10000 },
        { chargeCallId: 'mars', amount: 10000 }
      ],
      advance: 0
    });
  });

  it('l excedent devient une avance', () => {
    const plan = planAllocationCents(open, toCents(35000));
    expect(plan.allocations).toHaveLength(3);
    expect(plan.advanceCents).toBe(toCents(5000));
  });

  it('aucun appel ouvert : tout le paiement part en avance', () => {
    expect(planAllocationCents([], toCents(12345.67))).toEqual({ allocations: [], advanceCents: 1234567 });
    expect(planAllocationCents([call('solde', '2026-01-05', 0)], 500)).toEqual({ allocations: [], advanceCents: 500 });
  });

  it('ignore un appel deja solde', () => {
    const plan = planAllocationCents([call('solde', '2026-01-01', 0), call('ouvert', '2026-02-01', 50)], toCents(50));
    expect(plan.allocations).toEqual([{ chargeCallId: 'ouvert', amountCents: 5000 }]);
  });
});

describe('planAllocation — selection manuelle des mois', () => {
  const open = [call('janvier', '2026-01-05', 10000), call('fevrier', '2026-02-05', 10000), call('mars', '2026-03-05', 10000)];

  it('n affecte qu aux appels choisis, tries par echeance, meme si un plus ancien reste du', () => {
    const plan = planAllocationCents(open, toCents(15000), ['mars', 'fevrier']);
    expect(plan.allocations).toEqual([
      { chargeCallId: 'fevrier', amountCents: 1000000 },
      { chargeCallId: 'mars', amountCents: 500000 }
    ]);
    expect(plan.advanceCents).toBe(0);
  });

  it('au-dela des appels choisis, le reliquat devient une avance (imputee ensuite)', () => {
    const plan = planAllocationCents(open, toCents(12000), ['fevrier']);
    expect(plan.allocations).toEqual([{ chargeCallId: 'fevrier', amountCents: 1000000 }]);
    expect(plan.advanceCents).toBe(toCents(2000));
  });

  it('une selection vide equivaut a aucune selection', () => {
    expect(planAllocationCents(open, 100, [])).toEqual(planAllocationCents(open, 100));
  });
});

describe('arrondis : aucun centime cree ni perdu', () => {
  it('additionne des centimes exacts (0,1 + 0,2 ne fait pas 0,30000000000000004)', () => {
    const plan = planAllocation(
      [
        { id: 'a', dueDate: d('2026-01-01'), createdAt: d('2026-01-01'), outstanding: 0.1 },
        { id: 'b', dueDate: d('2026-02-01'), createdAt: d('2026-01-01'), outstanding: 0.2 }
      ],
      0.35
    );
    expect(plan.allocations).toEqual([
      { chargeCallId: 'a', amount: 0.1 },
      { chargeCallId: 'b', amount: 0.2 }
    ]);
    expect(plan.advance).toBe(0.05);
  });

  it('conserve la somme exacte sur de nombreux appels a montants decimaux', () => {
    const calls = Array.from({ length: 37 }, (_, index) => call(`c${index}`, `2026-01-${String((index % 28) + 1).padStart(2, '0')}`, 333.33, `2025-12-${String((index % 28) + 1).padStart(2, '0')}`));
    const amount = toCents(10000.01);
    const plan = planAllocationCents(calls, amount);
    const allocated = plan.allocations.reduce((sum, item) => sum + item.amountCents, 0);
    expect(allocated + plan.advanceCents).toBe(amount);
    expect(plan.allocations.every(item => Number.isInteger(item.amountCents))).toBe(true);
  });

  it('toCents lit un Decimal Prisma, une chaine ou un nombre', () => {
    expect(toCents('1234.56')).toBe(123456);
    expect(toCents({ toString: () => '99.99', valueOf: () => 99.99 })).toBe(9999);
    expect(toCents(1.005)).toBe(101);
    expect(toCents(null)).toBe(0);
    expect(toCents('abc')).toBe(0);
  });
});

describe('planAdvanceImputation — imputation des avances', () => {
  const advance = (paymentId: string, paidAt: string, amount: number) => ({
    paymentId,
    paidAt: d(paidAt),
    createdAt: d(paidAt),
    availableCents: toCents(amount)
  });

  it('une avance couvre un appel entier', () => {
    expect(planAdvanceImputation([advance('p1', '2026-01-01', 10000)], [call('fev', '2026-02-05', 10000)])).toEqual([
      { paymentId: 'p1', chargeCallId: 'fev', amountCents: 1000000 }
    ]);
  });

  it('une avance couvre partiellement un appel', () => {
    expect(planAdvanceImputation([advance('p1', '2026-01-01', 4000)], [call('fev', '2026-02-05', 10000)])).toEqual([
      { paymentId: 'p1', chargeCallId: 'fev', amountCents: 400000 }
    ]);
  });

  it('plusieurs paiements consommes dans l ordre de leur date (FIFO), plusieurs appels par echeance', () => {
    const imputations = planAdvanceImputation(
      [advance('recent', '2026-01-20', 5000), advance('ancien', '2026-01-02', 3000)],
      [call('mars', '2026-03-05', 4000), call('fev', '2026-02-05', 2000)]
    );
    expect(imputations).toEqual([
      { paymentId: 'ancien', chargeCallId: 'fev', amountCents: 200000 },
      { paymentId: 'ancien', chargeCallId: 'mars', amountCents: 100000 },
      { paymentId: 'recent', chargeCallId: 'mars', amountCents: 300000 }
    ]);
  });

  it('sans appel ouvert, ou sans avance, rien n est impute', () => {
    expect(planAdvanceImputation([advance('p1', '2026-01-01', 100)], [])).toEqual([]);
    expect(planAdvanceImputation([], [call('fev', '2026-02-05', 100)])).toEqual([]);
  });

  it('ne modifie pas ses arguments', () => {
    const advances = [advance('p1', '2026-01-01', 100)];
    planAdvanceImputation(advances, [call('fev', '2026-02-05', 60)]);
    expect(advances[0].availableCents).toBe(10000);
  });
});

describe('statusFromCents', () => {
  it('PENDING, PARTIAL puis PAID', () => {
    expect(statusFromCents(0, 100)).toBe('PENDING');
    expect(statusFromCents(1, 100)).toBe('PARTIAL');
    expect(statusFromCents(100, 100)).toBe('PAID');
  });
});

describe('suivi mensuel — decoupage des appels', () => {
  const tracked = (over: Partial<TrackedCall>): TrackedCall => ({
    id: 'c',
    lotId: 'l',
    amountCents: 0,
    paidCents: 0,
    dueDate: d('2026-01-10'),
    periodStart: null,
    periodEnd: null,
    ...over
  });

  it('un appel sans bornes est range au mois de son echeance', () => {
    expect(monthsOfCall(tracked({ dueDate: d('2026-05-31') }))).toEqual([{ year: 2026, month: 5 }]);
  });

  it('un trimestre couvre trois mois, une periode a cheval sur deux annees aussi', () => {
    expect(monthsOfCall(tracked({ periodStart: d('2026-01-01'), periodEnd: d('2026-03-31') }))).toHaveLength(3);
    expect(monthsOfCall(tracked({ periodStart: d('2026-11-15'), periodEnd: d('2027-01-14') }))).toEqual([
      { year: 2026, month: 11 },
      { year: 2026, month: 12 },
      { year: 2027, month: 1 }
    ]);
  });

  it('parts egales, le dernier mois absorbe l arrondi (a l unite pour un montant rond)', () => {
    expect(splitEvenly(10000000, 3)).toEqual([3333300, 3333300, 3333400]);
    expect(splitEvenly(100, 3)).toEqual([0, 0, 100]); // 1 franc sur 3 mois : a l unite
    expect(splitEvenly(101, 3)).toEqual([33, 33, 35]); // montant non rond : au centime
    expect(splitEvenly(12345, 1)).toEqual([12345]);
    const shares = splitEvenly(toCents(1000.01), 12);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(toCents(1000.01));
  });

  it('le regle remplit les mois dans l ordre chronologique', () => {
    const parts = monthPartsOfCall(
      tracked({ amountCents: toCents(90000), paidCents: toCents(40000), periodStart: d('2026-01-01'), periodEnd: d('2026-03-31') })
    );
    expect(parts.map(part => [part.month, part.dueCents / 100, part.paidCents / 100])).toEqual([
      [1, 30000, 30000],
      [2, 30000, 10000],
      [3, 30000, 0]
    ]);
  });
});

describe('suivi mensuel — grille d un lot', () => {
  const now = d('2026-02-15');
  const quarter: TrackedCall = {
    id: 'q1',
    lotId: 'l',
    amountCents: toCents(100000),
    paidCents: toCents(40000),
    dueDate: d('2026-01-10'),
    periodStart: d('2026-01-01'),
    periodEnd: d('2026-03-31')
  };

  it('trimestre reparti, arrondi sur mars, OVERDUE pour un mois echu non solde', () => {
    const grid = buildLotMonthGrid([quarter], 2026, now);
    expect(grid).toHaveLength(12);
    expect(grid[0]).toEqual({ month: 1, due: 33333, paid: 33333, status: 'PAID' });
    expect(grid[1]).toEqual({ month: 2, due: 33333, paid: 6667, status: 'OVERDUE' });
    expect(grid[2]).toEqual({ month: 3, due: 33334, paid: 0, status: 'OVERDUE' });
    expect(grid[3]).toEqual({ month: 4, due: 0, paid: 0, status: 'NONE' });
  });

  it('DUE puis PARTIAL avant l echeance, PAID quand tout est regle', () => {
    const future: TrackedCall = { ...quarter, dueDate: d('2026-04-10'), paidCents: 0, periodStart: d('2026-04-01'), periodEnd: d('2026-06-30') };
    expect(buildLotMonthGrid([future], 2026, now)[3].status).toBe('DUE');
    expect(buildLotMonthGrid([{ ...future, paidCents: toCents(10000) }], 2026, now)[3].status).toBe('PARTIAL');
    expect(buildLotMonthGrid([{ ...future, paidCents: future.amountCents }], 2026, now).slice(3, 6).map(c => c.status)).toEqual([
      'PAID',
      'PAID',
      'PAID'
    ]);
  });

  it('additionne plusieurs appels du meme mois ; ignore les mois hors de l annee demandee', () => {
    const monthly: TrackedCall = { ...quarter, id: 'm', amountCents: toCents(5000), paidCents: toCents(5000), periodStart: d('2026-01-01'), periodEnd: d('2026-01-31') };
    const grid = buildLotMonthGrid([quarter, monthly], 2026, now);
    expect(grid[0]).toEqual({ month: 1, due: 38333, paid: 38333, status: 'PAID' });

    const straddling: TrackedCall = { ...quarter, id: 's', periodStart: d('2025-12-01'), periodEnd: d('2026-01-31'), amountCents: toCents(2000), paidCents: 0, dueDate: d('2025-12-05') };
    const grid2026 = buildLotMonthGrid([straddling], 2026, now);
    expect(grid2026[0]).toEqual({ month: 1, due: 1000, paid: 0, status: 'OVERDUE' });
    expect(grid2026.filter(cell => cell.status !== 'NONE')).toHaveLength(1);
  });
});
