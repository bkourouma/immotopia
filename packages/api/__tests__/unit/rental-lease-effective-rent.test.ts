/**
 * BUG-2026-09-30-068 : une révision de loyer a une date d'effet. Avant elle, le
 * loyer du bail (et donc rendement, loyers annuels…) reste l'ancien.
 */

type Row = Record<string, any>;

const store = {
  lease: {
    id: 'lease-1',
    tenant_id: 'tenant-A',
    status: 'ACTIVE',
    start_date: new Date('2026-08-01T12:00:00Z'),
    end_date: new Date('2027-07-31T12:00:00Z'),
    rent_amount: 250000,
    service_charge_amount: 0
  } as Row,
  events: [] as Row[],
  seq: 0
};

const mockPrisma: Row = {
  rentalLease: {
    findFirst: jest.fn(async () => ({ ...store.lease })),
    update: jest.fn(async ({ data }: Row) => {
      for (const [k, v] of Object.entries(data)) if (v !== undefined) store.lease[k] = Number(v);
      return { ...store.lease };
    })
  },
  leaseEvent: {
    count: jest.fn(async () => 0),
    create: jest.fn(async ({ data }: Row) => {
      const row = { id: `ev-${++store.seq}`, createdAt: new Date(), ...data };
      store.events.push(row);
      return row;
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const row = store.events.find(e => e.id === where.id)!;
      Object.assign(row, data);
      return row;
    }),
    findMany: jest.fn(async ({ where }: Row) =>
      store.events.filter(
        e =>
          e.type === where.type &&
          e.effectiveDate.getTime() <= where.effectiveDate.lte.getTime() &&
          e.details?.planned === where.details.equals &&
          (!where.tenantId || e.tenantId === where.tenantId)
      )
    )
  },
  rentalInstallment: { count: jest.fn(async () => 0), findMany: jest.fn(async () => []) },
  user: { findMany: jest.fn(async () => []) },
  $transaction: jest.fn(async (cb: (tx: Row) => Promise<any>) => cb(mockPrisma))
};

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy({}, { get: (_t, prop) => (mockPrisma as any)[prop] })
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));
jest.mock('../../src/lib/finance/ledger', () => ({ appendThirdPartyMovementTx: jest.fn() }));
jest.mock('../../src/services/rental-installment-service', () => ({
  annulerPieceTx: jest.fn(),
  compteLocataireDuBailTx: jest.fn(async () => null),
  recalculateInstallmentStatuses: jest.fn()
}));
jest.mock('../../src/services/lot-registry-service', () => ({ syncLotActivationsTx: jest.fn() }));

import { effectiveRentAt } from '../../src/lib/lease-lifecycle/effective-rent';
import { applyDueRevisions, reviseRent } from '../../src/lib/lease-lifecycle/service';

const NOW = new Date('2026-09-30T10:00:00Z');

beforeEach(() => {
  jest.useFakeTimers({
    doNotFake: ['nextTick', 'setImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout']
  });
  jest.setSystemTime(NOW);
  store.lease.rent_amount = 250000;
  store.lease.service_charge_amount = 0;
  store.events = [];
  store.seq = 0;
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

describe('effectiveRentAt — fonction unique', () => {
  const bail = { rent_amount: 250000, service_charge_amount: 0 };
  const revision = (mois: string, previous: number, next: number) => ({
    effectiveDate: new Date(`${mois}-01T12:00:00Z`),
    previousRent: previous,
    newRent: next
  });

  it('révision future : avant la date d’effet, l’ancien loyer ; à la date, le nouveau', () => {
    const revisions = [revision('2027-01', 250000, 260000)];
    expect(effectiveRentAt(bail, revisions, new Date('2026-09-30T10:00:00Z')).rent).toBe(250000);
    expect(effectiveRentAt(bail, revisions, new Date('2026-12-31T23:00:00Z')).rent).toBe(250000);
    expect(effectiveRentAt(bail, revisions, new Date('2027-01-01T12:00:00Z')).rent).toBe(260000);
    expect(effectiveRentAt(bail, revisions, new Date('2027-05-01T12:00:00Z')).rent).toBe(260000);
  });

  it('révision passée : le loyer en vigueur est le nouveau, et l’ancien avant elle', () => {
    const revisions = [revision('2026-06', 240000, 250000)];
    expect(effectiveRentAt(bail, revisions, new Date('2026-09-30T00:00:00Z')).rent).toBe(250000);
    expect(effectiveRentAt(bail, revisions, new Date('2026-03-01T00:00:00Z')).rent).toBe(240000);
  });

  it('deux révisions : la plus récente applicable l’emporte', () => {
    const revisions = [revision('2027-01', 250000, 260000), revision('2027-07', 260000, 275000)];
    expect(effectiveRentAt(bail, revisions, new Date('2026-12-01T00:00:00Z')).rent).toBe(250000);
    expect(effectiveRentAt(bail, revisions, new Date('2027-03-01T00:00:00Z')).rent).toBe(260000);
    expect(effectiveRentAt(bail, revisions, new Date('2027-08-01T00:00:00Z')).rent).toBe(275000);
  });

  it('renouvellement avec nouveau loyer et charges : suit la même règle', () => {
    const revisions = [
      {
        effectiveDate: new Date('2027-08-01T12:00:00Z'),
        previousRent: 250000,
        newRent: 270000,
        previousCharges: 0,
        newCharges: 15000
      }
    ];
    expect(effectiveRentAt(bail, revisions, new Date('2027-07-15T00:00:00Z'))).toEqual({ rent: 250000, charges: 0 });
    expect(effectiveRentAt(bail, revisions, new Date('2027-08-15T00:00:00Z'))).toEqual({
      rent: 270000,
      charges: 15000
    });
  });

  it('sans révision : le loyer du bail', () => {
    expect(effectiveRentAt(bail, [], NOW)).toEqual({ rent: 250000, charges: 0 });
  });
});

describe('reviseRent — date d’effet', () => {
  it('révision au 01/01/2027 (aujourd’hui 30/09/2026) : le loyer du bail reste 250 000, révision planifiée', async () => {
    const event = await reviseRent('tenant-A', 'lease-1', {
      effectiveMonth: '2027-01',
      newRent: 260000,
      revisionRate: 4
    });

    expect(store.lease.rent_amount).toBe(250000);
    expect(mockPrisma.rentalLease.update).not.toHaveBeenCalled();
    expect(store.events[0].details.planned).toBe(true);
    expect(event.newRent).toBe(260000);
  });

  it('révision déjà effective : le loyer du bail change tout de suite', async () => {
    await reviseRent('tenant-A', 'lease-1', { effectiveMonth: '2026-09', newRent: 255000 });

    expect(store.lease.rent_amount).toBe(255000);
    expect(store.events[0].details.planned).toBe(false);
  });

  it('applyDueRevisions : appliquée à la date d’effet, une seule fois, jamais avant', async () => {
    await reviseRent('tenant-A', 'lease-1', { effectiveMonth: '2027-01', newRent: 260000 });

    expect((await applyDueRevisions('tenant-A', new Date('2026-12-31T12:00:00Z'))).applied).toBe(0);
    expect(store.lease.rent_amount).toBe(250000);

    expect((await applyDueRevisions('tenant-A', new Date('2027-01-01T12:00:00Z'))).applied).toBe(1);
    expect(store.lease.rent_amount).toBe(260000);
    expect(store.events[0].details.planned).toBe(false);

    expect((await applyDueRevisions('tenant-A', new Date('2027-02-01T12:00:00Z'))).applied).toBe(0);
  });

  it('isolation : ne touche pas les révisions d’une autre agence', async () => {
    await reviseRent('tenant-A', 'lease-1', { effectiveMonth: '2027-01', newRent: 260000 });

    expect((await applyDueRevisions('tenant-B', new Date('2027-06-01T00:00:00Z'))).applied).toBe(0);
    expect(store.lease.rent_amount).toBe(250000);
  });
});
