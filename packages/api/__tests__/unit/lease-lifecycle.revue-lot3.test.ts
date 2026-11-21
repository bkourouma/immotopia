/**
 * Vie du bail — revue fonctionnelle (lot 3, territoire A) :
 *  1. renouvellement d'un bail qui finit un 1er du mois : le mois de l'ancienne fin
 *     n'a jamais été facturé (règle du générateur d'échéances), il ne doit pas
 *     rester un trou entre l'ancienne et la nouvelle période ;
 *  2. révision : « loyer précédent » = loyer effectif juste avant la date d'effet
 *     (et non le loyer courant du bail, qui peut déjà porter une autre révision) ;
 *  3. état du bail renvoyé avec l'historique : la devise ;
 *  4. requêtes de résiliation et de révision filtrées par agence.
 */

type Row = Record<string, any>;

const store = { created: [] as Row[], revisions: [] as Row[], seq: 0, leaseEvents: [] as Row[] };

let LEASE: Row;

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
    create: jest.fn(async ({ data }: Row) => {
      const row = { id: `ev-${++store.seq}`, createdAt: new Date(), ...data };
      store.leaseEvents.push(row);
      return row;
    }),
    update: jest.fn(async ({ where, data }: Row) => ({
      ...store.leaseEvents.find(e => e.id === where.id),
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
    findMany: jest.fn(async () => []),
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
jest.mock('../../src/lib/lease-lifecycle/period-overlap', () => ({ assertNoLeaseOverlapTx: jest.fn() }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));
jest.mock('../../src/services/lot-registry-service', () => ({ syncLotActivationsTx: jest.fn() }));
jest.mock('../../src/services/rental-installment-service', () => ({
  annulerPieceTx: jest.fn(),
  compteLocataireDuBailTx: jest.fn(async () => null),
  recalculateInstallmentStatuses: jest.fn(async () => undefined)
}));
jest.mock('../../src/lib/finance/ledger', () => ({ appendThirdPartyMovementTx: jest.fn() }));
jest.mock('../../src/services/property-status-service', () => ({
  updatePropertyStatus: jest.fn(async () => undefined)
}));

import { getLeaseEvents, renewLease, reviseRent, terminateLease } from '../../src/lib/lease-lifecycle/service';

const NOW = new Date(Date.UTC(2026, 10, 3, 12));

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW.getTime());
  store.created = [];
  store.revisions = [];
  store.leaseEvents = [];
  store.seq = 0;
  jest.clearAllMocks();
  LEASE = {
    id: 'lease-1',
    tenant_id: 'tenant-A',
    property_id: 'prop-1',
    status: 'ACTIVE',
    start_date: new Date(Date.UTC(2026, 6, 1, 12)),
    end_date: new Date(Date.UTC(2027, 6, 1, 12)),
    billing_frequency: 'MONTHLY',
    due_day_of_month: 5,
    currency: 'FCFA',
    rent_amount: 150000,
    service_charge_amount: 0,
    move_out_date: null
  };
});

afterEach(() => jest.restoreAllMocks());

describe('renewLease — bail qui finit un 1er du mois', () => {
  it('facture le mois de l’ancienne fin (jamais généré) : pas de trou entre les deux périodes', async () => {
    // 01/07/2026 → 01/07/2027 : 12 échéances (juillet 2026 à juin 2027), juillet 2027 non facturé.
    await renewLease('tenant-A', 'lease-1', { newEndDate: '2028-07-01' });

    const periods = store.created.map(d => `${d.period_year}-${String(d.period_month).padStart(2, '0')}`);
    expect(periods[0]).toBe('2027-07');
    expect(periods[periods.length - 1]).toBe('2028-06');
    expect(periods).toHaveLength(12);
  });

  it('un bail qui finit un autre jour garde le premier mois suivant', async () => {
    LEASE.end_date = new Date(Date.UTC(2027, 5, 30, 12));
    await renewLease('tenant-A', 'lease-1', { newEndDate: '2027-09-30' });
    const periods = store.created.map(d => `${d.period_year}-${d.period_month}`);
    expect(periods).toEqual(['2027-7', '2027-8', '2027-9']);
  });
  it('les événements RENEWAL et REVISION portent le loyer effectif à la date du renouvellement, pas le loyer courant du bail', async () => {
    // Le bail affiche 150 000, mais une révision planifiée à 170 000 est en vigueur dès juin 2027.
    store.revisions = [
      {
        effectiveDate: new Date(Date.UTC(2027, 5, 1, 12)),
        newRent: 170000,
        newCharges: 5000,
        previousRent: 150000,
        previousCharges: 0
      }
    ];
    await renewLease('tenant-A', 'lease-1', { newEndDate: '2028-07-01', newRent: 180000 });

    const renewal = store.leaseEvents.find(e => e.type === 'RENEWAL');
    const revision = store.leaseEvents.find(e => e.type === 'REVISION');
    expect(Number(renewal?.previousRent)).toBe(170000);
    expect(Number(renewal?.previousCharges)).toBe(5000);
    expect(Number(revision?.previousRent)).toBe(170000);
    expect(Number(revision?.previousCharges)).toBe(5000);
  });
});

describe('reviseRent — loyer précédent', () => {
  it('une révision antérieure à une révision déjà appliquée garde l’ancien loyer d’origine', async () => {
    // Le bail porte déjà 120 000 (révision de juin 2026, appliquée) ; on saisit une révision de mars 2026.
    LEASE.start_date = new Date(Date.UTC(2026, 0, 1, 12));
    LEASE.end_date = new Date(Date.UTC(2026, 11, 31, 12));
    LEASE.rent_amount = 120000;
    store.revisions = [
      {
        effectiveDate: new Date(Date.UTC(2026, 5, 1, 12)),
        newRent: 120000,
        newCharges: 0,
        previousRent: 100000,
        previousCharges: 0
      }
    ];
    await reviseRent('tenant-A', 'lease-1', { effectiveMonth: '2026-03', newRent: 110000 });

    const created = store.leaseEvents.find(e => e.type === 'REVISION');
    expect(Number(created!.previousRent)).toBe(100000);
  });

  it('une révision postérieure à une révision planifiée part du loyer planifié, pas du loyer courant', async () => {
    store.revisions = [
      {
        effectiveDate: new Date(Date.UTC(2027, 2, 1, 12)),
        newRent: 160000,
        newCharges: 5000,
        previousRent: 150000,
        previousCharges: 0
      }
    ];
    await reviseRent('tenant-A', 'lease-1', { effectiveMonth: '2027-05', newRent: 170000 });

    const created = store.leaseEvents.find(e => e.type === 'REVISION');
    expect(Number(created!.previousRent)).toBe(160000);
    // Charges non précisées : celles en vigueur à la date d'effet (5 000), pas celles du bail (0).
    expect(Number(created!.newCharges)).toBe(5000);
  });
});

describe('getLeaseEvents — état du bail', () => {
  it('renvoie la devise du bail', async () => {
    LEASE.currency = 'EUR';
    const data = await getLeaseEvents('tenant-A', 'lease-1');
    expect((data.lease as any).currency).toBe('EUR');
  });
});

describe('isolation par agence — requêtes de la vie du bail', () => {
  it('la résiliation filtre échéances et décompte par tenant_id', async () => {
    await terminateLease('tenant-A', 'lease-1', {
      noticeDate: '2026-08-01',
      effectiveDate: '2026-10-31',
      initiatedBy: 'TENANT'
    });
    const wheres = [
      ...mockPrisma.rentalInstallment.findMany.mock.calls,
      ...mockPrisma.rentalInstallment.count.mock.calls
    ].map((c: any[]) => c[0].where);
    expect(wheres.length).toBeGreaterThan(0);
    for (const where of wheres) expect(where.tenant_id).toBe('tenant-A');
    for (const call of mockPrisma.leaseEvent.count.mock.calls) expect((call as any)[0].where.tenantId).toBe('tenant-A');
  });

  it('la révision filtre le décompte des échéances réglées par tenant_id', async () => {
    await reviseRent('tenant-A', 'lease-1', { effectiveMonth: '2027-01', newRent: 160000 });
    const where = (mockPrisma.rentalInstallment.count.mock.calls[0] as any)[0].where;
    expect(where.tenant_id).toBe('tenant-A');
  });
});
