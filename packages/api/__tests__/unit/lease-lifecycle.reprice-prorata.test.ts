/**
 * Révision / modification du loyer et prorata au jour (décision H5) : une
 * échéance non réglée de première ou de dernière période garde sa fraction de
 * période quand elle est recalculée. Aucune écriture si le montant ne change pas.
 */

type Row = Record<string, any>;

const store = { events: [] as Row[], installments: [] as Row[], seq: 0 };
let LEASE: Row;
const mockAppend = jest.fn();

function inPeriod(row: Row, where: Row): boolean {
  if (!where.OR) return true;
  return where.OR.some((c: Row) =>
    c.period_year?.gt !== undefined
      ? row.period_year > c.period_year.gt
      : row.period_year === c.period_year && row.period_month >= c.period_month.gte
  );
}

const mockPrisma: Row = {
  rentalLease: {
    findFirst: jest.fn(async () => ({ ...LEASE })),
    update: jest.fn(async () => ({}))
  },
  leaseEvent: {
    count: jest.fn(async () => 0),
    create: jest.fn(async ({ data }: Row) => {
      const row = { id: `ev-${++store.seq}`, createdAt: new Date(2026, 8, store.seq), ...data };
      store.events.push(row);
      return row;
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = store.events.find(e => e.id === where.id)!;
      Object.assign(row, data);
      return row;
    }),
    findMany: jest.fn(async ({ where }: Row) =>
      store.events.filter(e => e.leaseId === where.leaseId && e.type === where.type)
    )
  },
  rentalInstallment: {
    count: jest.fn(async () => 0),
    findMany: jest.fn(async ({ where }: Row) =>
      store.installments.filter(
        i =>
          i.lease_id === where.lease_id &&
          where.status.in.includes(i.status) &&
          i.amount_paid === 0 &&
          inPeriod(i, where)
      )
    ),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = store.installments.find(i => i.id === where.id)!;
      row.amount_rent = Number(data.amount_rent);
      row.amount_service = Number(data.amount_service);
      return row;
    })
  },
  rentalInstallmentItem: { updateMany: jest.fn(async () => ({ count: 1 })) },
  user: { findMany: jest.fn(async () => []) },
  $transaction: jest.fn(async (cb: (tx: Row) => Promise<any>) => cb(mockPrisma))
};

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy({}, { get: (_t, prop) => (mockPrisma as any)[prop] })
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));
jest.mock('../../src/services/lot-registry-service', () => ({ syncLotActivationsTx: jest.fn() }));
jest.mock('../../src/services/rental-installment-service', () => ({
  annulerPieceTx: jest.fn(),
  compteLocataireDuBailTx: jest.fn(async () => ({ accountId: 'acc-1', tenantClientId: 'client-1' })),
  recalculateInstallmentStatuses: jest.fn(async () => undefined)
}));
jest.mock('../../src/lib/finance/ledger', () => ({
  appendThirdPartyMovementTx: (...args: any[]) => mockAppend(...args)
}));

import { repriceUnstartedInstallmentsTx, reviseRent } from '../../src/lib/lease-lifecycle/service';

const noon = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 12));

const installment = (year: number, month: number, amountRent: number): Row => ({
  id: `inst-${year}-${month}`,
  lease_id: 'lease-1',
  status: 'DUE',
  period_year: year,
  period_month: month,
  due_date: new Date(year, month - 1, 5),
  amount_rent: amountRent,
  amount_service: 0,
  amount_other_fees: 0,
  penalty_amount: 0,
  amount_paid: 0
});

const amountOf = (year: number, month: number) =>
  store.installments.find(i => i.period_year === year && i.period_month === month)!.amount_rent;

function leaseOf(start: Date, end: Date): Row {
  return {
    id: 'lease-1',
    tenant_id: 'tenant-A',
    status: 'ACTIVE',
    start_date: start,
    end_date: end,
    billing_frequency: 'MONTHLY',
    due_day_of_month: 5,
    currency: 'FCFA',
    rent_amount: 155000,
    service_charge_amount: 0,
    primary_renter_client_id: 'client-1'
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  store.events = [];
  store.seq = 0;
});

describe('reprice — dernière échéance au prorata (bail 15/07/2026 -> 14/07/2027)', () => {
  beforeEach(() => {
    LEASE = leaseOf(noon(2026, 7, 15), noon(2027, 7, 14));
    store.installments = [installment(2027, 6, 155000), installment(2027, 7, 70000)];
  });

  it('révision sans changement de loyer : aucune écriture, dernière échéance inchangée', async () => {
    await reviseRent('tenant-A', 'lease-1', { effectiveMonth: '2027-01', newRent: 155000 });

    expect(mockPrisma.rentalInstallment.update).not.toHaveBeenCalled();
    expect(mockAppend).not.toHaveBeenCalled();
    expect(amountOf(2027, 7)).toBe(70000);
    expect(store.events.find(e => e.type === 'REVISION')!.details).toMatchObject({ installmentsUpdated: 0 });
  });

  it('révision à 160 000 : mois pleins à 160 000, dernière échéance au prorata 14/31 arrondi au franc', async () => {
    await reviseRent('tenant-A', 'lease-1', { effectiveMonth: '2027-01', newRent: 160000 });

    expect(amountOf(2027, 6)).toBe(160000);
    expect(amountOf(2027, 7)).toBe(72258);
    const movement = (mockAppend.mock.calls.find((c: any[]) => c[1].sourceId.startsWith('inst-2027-7')) as any[])[1];
    expect(movement).toMatchObject({ type: 'ADJUSTMENT', billed: 2258 });
    expect(store.events.find(e => e.type === 'REVISION')!.details).toMatchObject({ installmentsUpdated: 2 });
  });

  it('modification du loyer par la fiche : même prorata, pas de retour au mois plein', async () => {
    const now = new Date(Date.UTC(2027, 4, 10));
    const count = await repriceUnstartedInstallmentsTx(mockPrisma as any, {
      tenantId: 'tenant-A',
      leaseId: 'lease-1',
      rent: 160000,
      charges: 0,
      now
    });

    expect(count).toBe(2);
    expect(amountOf(2027, 7)).toBe(72258);
  });

  it('modification de la fiche sans changement effectif : rien n’est écrit ni compté', async () => {
    const count = await repriceUnstartedInstallmentsTx(mockPrisma as any, {
      tenantId: 'tenant-A',
      leaseId: 'lease-1',
      rent: 155000,
      charges: 0,
      now: new Date(Date.UTC(2027, 4, 10))
    });

    expect(count).toBe(0);
    expect(mockPrisma.rentalInstallment.update).not.toHaveBeenCalled();
  });
});

describe('reprice — première échéance au prorata d’un bail futur (15/12/2026 -> 14/12/2027)', () => {
  beforeEach(() => {
    LEASE = leaseOf(noon(2026, 12, 15), noon(2027, 12, 14));
    // 155 000 x 17/31 = 85 000 (arrondi).
    store.installments = [installment(2026, 12, 85000), installment(2027, 1, 155000)];
  });

  it('révision sans changement de loyer : première échéance inchangée', async () => {
    await reviseRent('tenant-A', 'lease-1', { effectiveMonth: '2026-12', newRent: 155000 });

    expect(mockPrisma.rentalInstallment.update).not.toHaveBeenCalled();
    expect(amountOf(2026, 12)).toBe(85000);
  });

  it('révision à 160 000 dès décembre : première échéance 17/31, janvier plein', async () => {
    await reviseRent('tenant-A', 'lease-1', { effectiveMonth: '2026-12', newRent: 160000 });

    expect(amountOf(2026, 12)).toBe(87742);
    expect(amountOf(2027, 1)).toBe(160000);
  });

  it('modification du loyer par la fiche : la première échéance reste au prorata', async () => {
    await repriceUnstartedInstallmentsTx(mockPrisma as any, {
      tenantId: 'tenant-A',
      leaseId: 'lease-1',
      rent: 160000,
      charges: 0,
      now: new Date(Date.UTC(2026, 10, 3))
    });

    expect(amountOf(2026, 12)).toBe(87742);
    expect(amountOf(2027, 1)).toBe(160000);
  });
});
