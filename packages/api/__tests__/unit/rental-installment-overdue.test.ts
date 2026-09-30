/**
 * BUG-2026-09-30-028 : une échéance générée (Brouillon) dont la date est passée
 * et qui n'est pas soldée doit devenir « En retard », compter dans les impayés,
 * porter sa pénalité (5 % du solde après 5 jours de grâce) et ne jamais être
 * traitée deux fois.
 */

type Row = Record<string, any>;

const store = {
  installments: [] as Row[],
  penalties: [] as Row[],
  seq: 0
};

const appendThirdPartyMovementTx = jest.fn(async () => ({ id: 'mv' }));
const getOrCreateTenantAccountTx = jest.fn(async () => ({ id: 'acc-1', label: 'Compte', balance: 0 }));

jest.mock('../../src/lib/finance/ledger', () => ({
  appendThirdPartyMovementTx: (...args: any[]) => (appendThirdPartyMovementTx as any)(...args),
  getOrCreateTenantAccountTx: (...args: any[]) => (getOrCreateTenantAccountTx as any)(...args)
}));

const logAuditEvent = jest.fn();
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (...args: any[]) => logAuditEvent(...args)
}));

const LEASE = {
  id: 'lease-1',
  tenant_id: 'tenant-A',
  primary_renter_client_id: 'client-1',
  penalty_grace_days: 5,
  penalty_mode: 'PERCENT_OF_BALANCE',
  penalty_rate: 5,
  penalty_fixed_amount: null,
  penalty_cap_amount: null
};

function matches(row: Row, where: Row): boolean {
  if (where.id && row.id !== where.id) return false;
  if (where.tenant_id && row.tenant_id !== where.tenant_id) return false;
  if (where.status) {
    if (where.status.not) {
      if (row.status === where.status.not) return false;
    } else {
      const statuses = where.status.in ?? [where.status];
      if (!statuses.includes(row.status)) return false;
    }
  }
  if (where.due_date?.lt && !(row.due_date < where.due_date.lt)) return false;
  return true;
}

const mockPrisma: Row = {
  rentalInstallment: {
    findMany: jest.fn(async ({ where }: Row) =>
      store.installments.filter(i => matches(i, where)).map(i => ({ ...i, lease: LEASE }))
    ),
    findFirst: jest.fn(async ({ where }: Row) => {
      const found = store.installments.find(i => matches(i, where));
      return found ? { ...found, lease: LEASE } : null;
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const rows = store.installments.filter(i => matches(i, where));
      rows.forEach(r => Object.assign(r, data));
      return { count: rows.length };
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = store.installments.find(i => i.id === where.id && i.tenant_id === where.tenant_id);
      Object.assign(row!, data);
      return { ...row };
    })
  },
  rentalPenalty: {
    findFirst: jest.fn(async ({ where }: Row) => {
      const rows = store.penalties.filter(
        p =>
          p.installment_id === where.installment_id &&
          (where.is_manual_override === undefined || p.is_manual_override === where.is_manual_override)
      );
      return rows[rows.length - 1] ?? null;
    }),
    create: jest.fn(async ({ data }: Row) => {
      const row = { id: `pen-${++store.seq}`, ...data };
      store.penalties.push(row);
      return row;
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = store.penalties.find(p => p.id === where.id)!;
      Object.assign(row, data);
      return row;
    })
  },
  rentalPenaltyRule: {
    findFirst: jest.fn(async () => ({
      id: 'rule',
      grace_days: 0,
      mode: 'PERCENT_OF_BALANCE',
      fixed_amount: 0,
      rate: 5,
      cap_amount: null,
      min_balance_to_apply: null
    })),
    create: jest.fn()
  },
  rentalLease: {
    findFirst: jest.fn(async () => ({ primary_renter_client_id: 'client-1' }))
  },
  thirdPartyMovement: { findMany: jest.fn(async () => []) },
  $transaction: jest.fn(async (cb: (tx: Row) => Promise<any>) => cb(mockPrisma))
};

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy({}, { get: (_t, prop) => (mockPrisma as any)[prop] })
}));

import { RentalInstallmentStatus } from '@prisma/client';
import { computeInstallmentStatus } from '../../src/lib/finance/installment-status';
import {
  markOverdueInstallments,
  listInstallments,
  recalculateInstallmentStatuses,
  updateInstallmentStatus
} from '../../src/services/rental-installment-service';
import { calculatePenaltiesForOverdueInstallments } from '../../src/services/rental-penalty-service';
import { reclasserEcheancesEchues } from '../../src/services/dashboard-service';

const NOW = new Date(2026, 8, 30, 10, 0, 0);

function seed(overrides: Row = {}): Row {
  const row = {
    id: `inst-${++store.seq}`,
    tenant_id: 'tenant-A',
    lease_id: 'lease-1',
    status: 'DRAFT',
    due_date: new Date(2026, 8, 5),
    period_year: 2026,
    period_month: 9,
    amount_rent: 480000,
    amount_service: 0,
    amount_other_fees: 0,
    penalty_amount: 0,
    amount_paid: 0,
    currency: 'FCFA',
    ...overrides
  };
  store.installments.push(row);
  return row;
}

beforeEach(() => {
  jest.useFakeTimers({
    doNotFake: ['nextTick', 'setImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout']
  });
  jest.setSystemTime(NOW);
  jest.clearAllMocks();
  store.installments = [];
  store.penalties = [];
  store.seq = 0;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('computeInstallmentStatus — règle unique', () => {
  const base = {
    status: RentalInstallmentStatus.DRAFT,
    due_date: new Date(2026, 8, 5),
    amount_rent: 480000,
    amount_service: 0,
    amount_other_fees: 0,
    penalty_amount: 0,
    amount_paid: 0
  };

  it('Brouillon échu et non soldé : En retard', () => {
    expect(computeInstallmentStatus(base, NOW)).toBe('OVERDUE');
  });

  it('partiellement payée : reste PARTIAL, même échue', () => {
    expect(computeInstallmentStatus({ ...base, amount_paid: 300000 }, NOW)).toBe('PARTIAL');
  });

  it('soldée : PAID ; annulée : CANCELED', () => {
    expect(computeInstallmentStatus({ ...base, amount_paid: 480000 }, NOW)).toBe('PAID');
    expect(computeInstallmentStatus({ ...base, status: RentalInstallmentStatus.CANCELED }, NOW)).toBe('CANCELED');
  });

  it('Brouillon à venir : reste Brouillon, sauf émission demandée', () => {
    const futur = { ...base, due_date: new Date(2026, 9, 5) };
    expect(computeInstallmentStatus(futur, NOW)).toBe('DRAFT');
    expect(computeInstallmentStatus(futur, NOW, { emitDraft: true })).toBe('DUE');
  });

  it('échéance du jour même : pas encore en retard', () => {
    expect(computeInstallmentStatus({ ...base, due_date: new Date(2026, 8, 30) }, NOW)).toBe('DRAFT');
  });
});

describe('markOverdueInstallments — job quotidien', () => {
  it('bascule les Brouillon et À payer échus en OVERDUE, laisse les autres', async () => {
    const draft = seed();
    const due = seed({ status: 'DUE', due_date: new Date(2026, 7, 5), period_month: 8 });
    const futur = seed({ due_date: new Date(2026, 9, 5), period_month: 10 });
    const partiel = seed({ status: 'PARTIAL', amount_paid: 300000, due_date: new Date(2026, 6, 5) });

    const res = await markOverdueInstallments();

    expect(res.updated).toBe(2);
    expect(draft.status).toBe('OVERDUE');
    expect(due.status).toBe('OVERDUE');
    expect(futur.status).toBe('DRAFT');
    expect(partiel.status).toBe('PARTIAL');
    expect(logAuditEvent).toHaveBeenCalledTimes(2);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: 'RENTAL_INSTALLMENT_MARKED_OVERDUE', entityId: draft.id })
    );
  });

  it('est idempotent : un second passage ne change rien et ne journalise pas', async () => {
    seed();
    await markOverdueInstallments();
    appendThirdPartyMovementTx.mockClear();
    logAuditEvent.mockClear();

    const second = await markOverdueInstallments();

    expect(second.updated).toBe(0);
    expect(logAuditEvent).not.toHaveBeenCalled();
    expect(appendThirdPartyMovementTx).not.toHaveBeenCalled();
  });

  it("respecte l'isolation : limité à une agence, il ne touche pas les échéances d'une autre", async () => {
    const a = seed();
    const b = seed({ tenant_id: 'tenant-B' });

    await markOverdueInstallments('tenant-A');

    expect(a.status).toBe('OVERDUE');
    expect(b.status).toBe('DRAFT');
  });
});

describe('pénalités sur échéance Brouillon échue', () => {
  it('Septembre : 480 000 dus, 25 jours de retard, 5 % -> 24 000, une seule ligne, sans doublon', async () => {
    const inst = seed();

    const first = await calculatePenaltiesForOverdueInstallments('tenant-A');
    expect(first.errors).toEqual([]);
    expect(first.processed).toBe(1);
    expect(store.penalties).toHaveLength(1);
    expect(store.penalties[0].amount).toBe(24000);
    expect(store.penalties[0].days_late).toBe(25);
    expect(inst.penalty_amount).toBe(24000);
    expect(inst.status).toBe('OVERDUE');

    await calculatePenaltiesForOverdueInstallments('tenant-A');
    expect(store.penalties).toHaveLength(1);
    expect(store.penalties[0].amount).toBe(24000);
  });

  it('partiellement payée (180 000 restants) : 9 000 ; délai de grâce en cours : rien', async () => {
    const partiel = seed({ status: 'PARTIAL', amount_paid: 300000, due_date: new Date(2026, 7, 5), period_month: 8 });
    seed({ due_date: new Date(2026, 8, 27), period_month: 9 });

    const res = await calculatePenaltiesForOverdueInstallments('tenant-A');

    expect(res.processed).toBe(1);
    expect(store.penalties).toHaveLength(1);
    expect(store.penalties[0].installment_id).toBe(partiel.id);
    expect(store.penalties[0].amount).toBe(9000);
  });
});

describe('tableau de bord et listes — statut effectif', () => {
  const somme = (rent: number) => ({
    amount_rent: rent,
    amount_service: 0,
    amount_other_fees: 0,
    penalty_amount: 0,
    amount_paid: 0
  });

  it('« Impayés » compte les Brouillon échus sans attendre le job', () => {
    const groupes = [
      { status: 'DRAFT', _count: { _all: 64 }, _sum: somme(36960000) },
      { status: 'PARTIAL', _count: { _all: 1 }, _sum: somme(480000) }
    ];
    const echus = [{ status: 'DRAFT', _count: { _all: 4 }, _sum: somme(1920000) }];

    const res = reclasserEcheancesEchues(groupes, echus);

    const overdue = res.find(g => g.status === 'OVERDUE')!;
    expect(overdue._count._all).toBe(4);
    expect(overdue._sum.amount_rent).toBe(1920000);
    expect(res.find(g => g.status === 'DRAFT')!._count._all).toBe(60);
    expect(res.find(g => g.status === 'PARTIAL')!._count._all).toBe(1);
  });

  it('supprime la tranche Brouillon vidée et ne change rien sans échéance échue', () => {
    const groupes = [{ status: 'DRAFT', _count: { _all: 2 }, _sum: somme(100) }];
    expect(reclasserEcheancesEchues(groupes, [])).toBe(groupes);
    const res = reclasserEcheancesEchues(groupes, groupes);
    expect(res.map(g => g.status)).toEqual(['OVERDUE']);
  });

  it('listInstallments : filtre En retard = statut OVERDUE ou échues non basculées, et affiche le statut effectif', async () => {
    seed();
    seed({ due_date: new Date(2026, 9, 5), period_month: 10 });
    (mockPrisma.rentalInstallment as any).count = jest.fn(async () => 1);

    await listInstallments('tenant-A', { status: RentalInstallmentStatus.OVERDUE });
    const where = (mockPrisma.rentalInstallment.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.tenant_id).toBe('tenant-A');
    expect(where.OR).toHaveLength(2);
    // Partiellement payée : affichée « Partiel », donc exclue du filtre « En retard » (B5).
    expect(where.amount_paid).toEqual({ lte: 0 });

    (mockPrisma.rentalInstallment.findMany as jest.Mock).mockClear();
    await listInstallments('tenant-A', { status: RentalInstallmentStatus.PARTIAL });
    const partialWhere = (mockPrisma.rentalInstallment.findMany as jest.Mock).mock.calls[0][0].where;
    expect(partialWhere.OR).toEqual([
      { status: 'PARTIAL' },
      { status: { in: ['DRAFT', 'DUE', 'OVERDUE'] }, amount_paid: { gt: 0 } }
    ]);

    const res = await listInstallments('tenant-A', {});
    expect(res.data.find((d: Row) => d.period_month === 9)!.status).toBe('OVERDUE');
    expect(res.data.find((d: Row) => d.period_month === 10)!.status).toBe('DRAFT');
  });
});

describe('recalcul des statuts : jamais de débit daté du futur', () => {
  /** Bail de 24 échéances mensuelles : 6 échues (avril à septembre 2026), 18 à venir. */
  function seedBail24(): Row[] {
    return Array.from({ length: 24 }, (_, index) => {
      const date = new Date(2026, 3 + index, 5);
      return seed({ due_date: date, period_year: date.getFullYear(), period_month: date.getMonth() + 1 });
    });
  }

  it('24 échéances dont 18 futures : 6 débits, 0 débit futur, les 18 restent Brouillon', async () => {
    const rows = seedBail24();

    const updated = await recalculateInstallmentStatuses('tenant-A', 'lease-1');

    expect(updated).toBe(6);
    const movements = (appendThirdPartyMovementTx.mock.calls as any[][]).map(call => call[1]);
    expect(movements).toHaveLength(6);
    expect(movements.every(m => m.type === 'INSTALLMENT' && m.movementDate <= NOW)).toBe(true);
    expect(rows.filter(r => r.due_date > NOW).every(r => r.status === 'DRAFT')).toBe(true);
    expect(rows.filter(r => r.due_date <= NOW).every(r => r.status === 'OVERDUE')).toBe(true);
  });

  it('updateInstallmentStatus : une échéance à venir reste Brouillon, sans débit', async () => {
    const futur = seed({ due_date: new Date(2026, 10, 5), period_month: 11 });

    const result = await updateInstallmentStatus('tenant-A', futur.id);

    expect(result.status).toBe('DRAFT');
    expect(appendThirdPartyMovementTx).not.toHaveBeenCalled();
  });
});
