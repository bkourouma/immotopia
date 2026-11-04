/**
 * Cycle de vie du bail — recette BUG-2026-11-03-030, -031 et BUG-2026-11-04-016.
 *
 * 030 : un loyer de 99 999 999 999 faisait déborder la colonne Decimal(12,2) (500).
 * 031 : des charges négatives étaient ramenées à 0 en silence.
 * 016 : une révision datée AVANT une révision déjà enregistrée laissait les
 *       échéances suivantes à l'ancien montant et le loyer en vigueur du bail
 *       divergeait des échéances.
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
  end_date: new Date(Date.UTC(2027, 11, 31)),
  rent_amount: 155000,
  service_charge_amount: 10000,
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

const leaseUpdate = jest.fn(async (_args: Row) => ({}));

const mockPrisma: Row = {
  rentalLease: {
    findFirst: jest.fn(async () => ({ ...LEASE })),
    update: leaseUpdate
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

import { renewLease, reviseRent } from '../../src/lib/lease-lifecycle/service';

const installment = (month: number): Row => ({
  id: `inst-${month}`,
  lease_id: 'lease-1',
  status: 'DRAFT',
  period_year: 2026,
  period_month: month,
  due_date: new Date(2026, month - 1, 5),
  amount_rent: 155000,
  amount_service: 10000,
  amount_other_fees: 0,
  amount_paid: 0,
  penalty_amount: 0
});

const rejects400 = async (promise: Promise<unknown>, message: RegExp) => {
  await expect(promise).rejects.toMatchObject({ status: 400, message: expect.stringMatching(message) });
};

beforeEach(() => {
  store.events = [];
  store.seq = 0;
  store.installments = [installment(10), installment(11), installment(12)];
  leaseUpdate.mockClear();
  jest.spyOn(Date, 'now').mockReturnValue(new Date(Date.UTC(2026, 10, 15)).getTime());
});

afterEach(() => jest.restoreAllMocks());

describe('montants des événements du bail (030, 031)', () => {
  it('révision : un loyer de 99 999 999 999 est refusé en 400 « montant trop élevé »', async () => {
    await rejects400(
      reviseRent('tenant-A', 'lease-1', { effectiveMonth: '2027-12', newRent: 99999999999 }),
      /maximum autorisé/
    );
    expect(store.events).toHaveLength(0);
  });

  it('révision : plus de deux décimales refusé', async () => {
    await rejects400(
      reviseRent('tenant-A', 'lease-1', { effectiveMonth: '2027-12', newRent: 100000.123 }),
      /deux décimales/
    );
  });

  it('révision : des charges trop élevées sont refusées', async () => {
    await rejects400(
      reviseRent('tenant-A', 'lease-1', { effectiveMonth: '2027-12', newRent: 100000, newCharges: 99999999999 }),
      /maximum autorisé/
    );
  });

  it('révision : des charges négatives sont refusées, pas ramenées à 0', async () => {
    await rejects400(
      reviseRent('tenant-A', 'lease-1', { effectiveMonth: '2026-11', newRent: 155000, newCharges: -5 }),
      /Les charges ne peuvent pas être négatives/
    );
    expect(store.events).toHaveLength(0);
    expect(store.installments.every(i => i.amount_service === 10000)).toBe(true);
  });

  it('renouvellement : loyer et charges hors bornes refusés', async () => {
    await rejects400(
      renewLease('tenant-A', 'lease-1', { newEndDate: '2028-12-31', newRent: 99999999999 }),
      /maximum autorisé/
    );
    await rejects400(
      renewLease('tenant-A', 'lease-1', { newEndDate: '2028-12-31', newCharges: -1 }),
      /Les charges ne peuvent pas être négatives/
    );
  });

  it('un montant valide à la limite passe', async () => {
    await reviseRent('tenant-A', 'lease-1', { effectiveMonth: '2026-12', newRent: 9999999999.99, newCharges: 0 });
    expect(store.events).toHaveLength(1);
  });
});

describe('révision datée avant une révision déjà enregistrée (016)', () => {
  const rents = () => Object.fromEntries(store.installments.map(i => [i.period_month, i.amount_rent]));
  const charges = () => Object.fromEntries(store.installments.map(i => [i.period_month, i.amount_service]));

  it('chaque période prend la révision à la date d’effet la plus récente, et le bail suit', async () => {
    await reviseRent('tenant-A', 'lease-1', { effectiveMonth: '2026-11', newRent: 155000, newCharges: 0 });
    await reviseRent('tenant-A', 'lease-1', { effectiveMonth: '2026-10', newRent: 165000, newCharges: 10000 });

    expect(rents()).toEqual({ 10: 165000, 11: 155000, 12: 155000 });
    expect(charges()).toEqual({ 10: 10000, 11: 0, 12: 0 });

    // Loyer en vigueur du bail (novembre 2026 atteint) = révision de novembre,
    // et non la dernière révision saisie.
    const last = leaseUpdate.mock.calls[leaseUpdate.mock.calls.length - 1][0] as Row;
    expect(Number(last.data.rent_amount)).toBe(155000);
    expect(Number(last.data.service_charge_amount)).toBe(0);
  });

  it('même date d’effet : la révision saisie en dernier l’emporte', async () => {
    await reviseRent('tenant-A', 'lease-1', { effectiveMonth: '2026-11', newRent: 160000, newCharges: 10000 });
    await reviseRent('tenant-A', 'lease-1', { effectiveMonth: '2026-11', newRent: 170000, newCharges: 10000 });

    expect(rents()).toEqual({ 10: 155000, 11: 170000, 12: 170000 });
    const last = leaseUpdate.mock.calls[leaseUpdate.mock.calls.length - 1][0] as Row;
    expect(Number(last.data.rent_amount)).toBe(170000);
  });

  it('une révision future ne touche pas le loyer en vigueur du bail', async () => {
    await reviseRent('tenant-A', 'lease-1', { effectiveMonth: '2027-03', newRent: 180000 });
    expect(leaseUpdate).not.toHaveBeenCalled();
  });
});
