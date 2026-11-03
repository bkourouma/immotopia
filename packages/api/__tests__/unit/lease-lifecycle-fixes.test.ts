/**
 * Vie du bail — correctifs de recette :
 *  1. renouvellement : les échéances portent le loyer EFFECTIF (révisions planifiées comprises) ;
 *  2. résiliation effective : le bien redevient « Disponible » ;
 *  3. solde de tout compte : toute échéance échue non soldée compte, quel que soit son statut stocké.
 */

type Row = Record<string, any>;

const store = { created: [] as Row[], installments: [] as Row[], revisions: [] as Row[], seq: 0 };

const LEASE: Row = {
  id: 'lease-1',
  tenant_id: 'tenant-A',
  property_id: 'prop-1',
  status: 'ACTIVE',
  start_date: new Date(Date.UTC(2026, 0, 1, 12)),
  end_date: new Date(Date.UTC(2026, 11, 31, 12)),
  billing_frequency: 'MONTHLY',
  due_day_of_month: 5,
  currency: 'FCFA',
  rent_amount: 150000,
  service_charge_amount: 0,
  primary_renter_client_id: 'client-1'
};

const mockPrisma: Row = {
  rentalLease: {
    findFirst: jest.fn(async () => ({ ...LEASE })),
    update: jest.fn(async ({ data }: Row) => ({
      ...LEASE,
      ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
    })),
    count: jest.fn(async () => 0)
  },
  leaseEvent: {
    count: jest.fn(async () => 0),
    create: jest.fn(async ({ data }: Row) => ({
      id: `ev-${++store.seq}`,
      createdAt: new Date(),
      effectiveDate: new Date(),
      ...data
    })),
    findMany: jest.fn(async () => store.revisions)
  },
  rentalInstallment: {
    findUnique: jest.fn(async () => null),
    create: jest.fn(async ({ data }: Row) => {
      store.created.push(data);
      return data;
    }),
    findMany: jest.fn(async ({ where }: Row) => {
      if (where.due_date) {
        // Simule le filtre du solde : statut et échéance échue.
        return store.installments.filter(
          i =>
            (!where.status?.in || where.status.in.includes(i.status)) &&
            (!where.status?.notIn || !where.status.notIn.includes(i.status)) &&
            i.due_date.getTime() <= where.due_date.lte.getTime()
        );
      }
      return [];
    }),
    updateMany: jest.fn(async () => ({ count: 0 })),
    count: jest.fn(async () => 0)
  },
  rentalSecurityDeposit: { findFirst: jest.fn(async () => null) },
  leaseInspection: { findFirst: jest.fn(async () => null) },
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
  compteLocataireDuBailTx: jest.fn(async () => null),
  recalculateInstallmentStatuses: jest.fn(async () => undefined)
}));
jest.mock('../../src/lib/finance/ledger', () => ({ appendThirdPartyMovementTx: jest.fn() }));
const updatePropertyStatus = jest.fn(async () => undefined);
jest.mock('../../src/services/property-status-service', () => ({
  updatePropertyStatus: (...args: any[]) => (updatePropertyStatus as any)(...args)
}));

import { getFinalSettlement, renewLease, terminateLease } from '../../src/lib/lease-lifecycle/service';

const NOW = new Date(Date.UTC(2026, 10, 3, 12));

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW.getTime());
  store.created = [];
  store.installments = [];
  store.revisions = [];
  store.seq = 0;
  updatePropertyStatus.mockClear();
  mockPrisma.rentalLease.count.mockResolvedValue(0);
});

afterEach(() => jest.restoreAllMocks());

describe('renewLease — loyer effectif des échéances', () => {
  it('une révision planifiée dans la période renouvelée est appliquée aux échéances', async () => {
    store.revisions = [
      {
        effectiveDate: new Date(Date.UTC(2027, 2, 1, 12)),
        newRent: 172750,
        newCharges: 0,
        previousRent: 150000,
        previousCharges: 0
      }
    ];
    await renewLease('tenant-A', 'lease-1', { newEndDate: '2027-06-30' });

    const byMonth = Object.fromEntries(store.created.map(d => [d.period_month, Number(d.amount_rent)]));
    expect(byMonth).toEqual({ 1: 150000, 2: 150000, 3: 172750, 4: 172750, 5: 172750, 6: 172750 });
  });

  it('un nouveau loyer au renouvellement s’applique dès son jour d’effet', async () => {
    await renewLease('tenant-A', 'lease-1', { newEndDate: '2027-03-31', newRent: 165000 });
    const byMonth = Object.fromEntries(store.created.map(d => [d.period_month, Number(d.amount_rent)]));
    expect(byMonth).toEqual({ 1: 165000, 2: 165000, 3: 165000 });
  });

  it('sans révision ni nouveau prix : le loyer du bail', async () => {
    await renewLease('tenant-A', 'lease-1', { newEndDate: '2027-02-28' });
    expect(store.created.map(d => Number(d.amount_rent))).toEqual([150000, 150000]);
  });
});

describe('terminateLease — libération du bien', () => {
  it('résiliation à une date passée : le bien redevient Disponible', async () => {
    await terminateLease('tenant-A', 'lease-1', {
      noticeDate: '2026-08-01',
      effectiveDate: '2026-10-31',
      initiatedBy: 'TENANT'
    });
    expect(updatePropertyStatus).toHaveBeenCalledTimes(1);
    expect((updatePropertyStatus.mock.calls[0] as any)[0]).toBe('prop-1');
    expect((updatePropertyStatus.mock.calls[0] as any)[1]).toBe('AVAILABLE');
  });

  it('résiliation future : le bien n’est pas libéré tout de suite', async () => {
    await terminateLease('tenant-A', 'lease-1', {
      noticeDate: '2026-11-01',
      effectiveDate: '2026-12-31',
      initiatedBy: 'TENANT'
    });
    expect(updatePropertyStatus).not.toHaveBeenCalled();
  });

  it('un autre bail actif sur le bien : le bien reste occupé', async () => {
    mockPrisma.rentalLease.count.mockResolvedValue(1);
    await terminateLease('tenant-A', 'lease-1', {
      noticeDate: '2026-08-01',
      effectiveDate: '2026-10-31',
      initiatedBy: 'TENANT'
    });
    expect(updatePropertyStatus).not.toHaveBeenCalled();
  });
});

describe('getFinalSettlement — impayés', () => {
  const row = (status: string, due: Date, rent = 100000, paid = 0): Row => ({
    status,
    due_date: due,
    amount_rent: rent,
    amount_service: 0,
    amount_other_fees: 0,
    penalty_amount: 0,
    amount_paid: paid
  });

  it('une échéance échue restée DRAFT compte ; annulée, soldée ou à venir ne comptent pas', async () => {
    const past = new Date(Date.UTC(2026, 8, 5));
    store.installments = [
      row('DRAFT', past),
      row('OVERDUE', past, 100000, 40000),
      row('PAID', past, 100000, 100000),
      row('CANCELED', past),
      row('DRAFT', new Date(Date.UTC(2026, 11, 5)))
    ];
    const settlement = await getFinalSettlement('tenant-A', 'lease-1');
    expect(settlement.arrears).toBe(160000);
  });
});
