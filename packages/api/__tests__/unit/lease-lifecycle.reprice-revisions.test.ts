/**
 * Révisions de loyer qui se chevauchent : chaque période prend le loyer
 * EFFECTIF à sa date, pas le montant de la seule révision en cours.
 *
 * A (1/12 à 120 000) puis B (1/11 à 115 000) : novembre passe à 115 000, mais
 * décembre reste à 120 000 (la révision A est toujours la dernière applicable).
 */

type Row = Record<string, any>;

const store = {
  events: [] as Row[],
  installments: [] as Row[],
  seq: 0
};

jest.mock('../../src/lib/finance/ledger', () => ({
  appendThirdPartyMovementTx: jest.fn(async () => ({ id: 'mv' })),
  getOrCreateTenantAccountTx: jest.fn(async () => ({ id: 'acc-1' }))
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));
jest.mock('../../src/services/lot-registry-service', () => ({ syncLotActivationsTx: jest.fn() }));

const LEASE = {
  id: 'lease-1',
  tenant_id: 'tenant-A',
  status: 'ACTIVE',
  start_date: new Date(Date.UTC(2026, 0, 1)),
  rent_amount: 100000,
  service_charge_amount: 0,
  primary_renter_client_id: 'client-1'
};

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

import { reviseRent } from '../../src/lib/lease-lifecycle/service';

const installment = (month: number): Row => ({
  id: `inst-${month}`,
  lease_id: 'lease-1',
  status: 'DRAFT',
  period_year: 2026,
  period_month: month,
  due_date: new Date(2026, month - 1, 5),
  amount_rent: 100000,
  amount_service: 0,
  amount_other_fees: 0,
  penalty_amount: 0,
  amount_paid: 0
});

beforeEach(() => {
  store.events = [];
  store.seq = 0;
  store.installments = [installment(10), installment(11), installment(12)];
});

describe('reviseRent — révisions planifiées qui se chevauchent', () => {
  it('B (1/11 à 115 000) après A (1/12 à 120 000) : novembre 115 000, décembre reste 120 000', async () => {
    await reviseRent('tenant-A', 'lease-1', { effectiveMonth: '2026-12', newRent: 120000 });
    await reviseRent('tenant-A', 'lease-1', { effectiveMonth: '2026-11', newRent: 115000 });

    const byMonth = Object.fromEntries(store.installments.map(i => [i.period_month, i.amount_rent]));
    expect(byMonth).toEqual({ 10: 100000, 11: 115000, 12: 120000 });
  });

  it('une seule révision : toutes les périodes à partir du mois d’effet prennent le nouveau loyer', async () => {
    await reviseRent('tenant-A', 'lease-1', { effectiveMonth: '2026-11', newRent: 115000 });

    const byMonth = Object.fromEntries(store.installments.map(i => [i.period_month, i.amount_rent]));
    expect(byMonth).toEqual({ 10: 100000, 11: 115000, 12: 115000 });
  });
});
