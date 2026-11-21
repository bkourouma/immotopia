/**
 * Vie du bail — prorata au jour (décision H5) :
 *  - renouvellement : la période de l'ancienne fin, facturée au prorata, est
 *    complétée si elle n'est ni réglée ni réglée en partie (sinon signalée) ;
 *  - résiliation : la période de fin est ramenée au prorata des jours jusqu'à la
 *    date de fin, sous la même condition (sinon signalée).
 */

type Row = Record<string, any>;

const store = { created: [] as Row[], leaseEvents: [] as Row[], seq: 0, installment: null as Row | null };

let LEASE: Row;

const mockAppend = jest.fn();

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
    update: jest.fn(async () => ({})),
    findMany: jest.fn(async () => [])
  },
  rentalInstallment: {
    findUnique: jest.fn(async () => null),
    findFirst: jest.fn(async ({ where }: Row) => {
      const inst = store.installment;
      return inst && inst.period_year === where.period_year && inst.period_month === where.period_month
        ? { ...inst }
        : null;
    }),
    create: jest.fn(async ({ data }: Row) => {
      store.created.push(data);
      return data;
    }),
    findMany: jest.fn(async () => []),
    update: jest.fn(async () => ({})),
    updateMany: jest.fn(async () => ({ count: 0 })),
    count: jest.fn(async () => 0)
  },
  rentalInstallmentItem: { updateMany: jest.fn(async () => ({ count: 1 })) },
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
  compteLocataireDuBailTx: jest.fn(async () => ({ accountId: 'acc-1', tenantClientId: 'client-1' })),
  recalculateInstallmentStatuses: jest.fn(async () => undefined)
}));
jest.mock('../../src/lib/finance/ledger', () => ({
  appendThirdPartyMovementTx: (...args: any[]) => mockAppend(...args)
}));
jest.mock('../../src/services/property-status-service', () => ({
  updatePropertyStatus: jest.fn(async () => undefined)
}));

import { renewLease, terminateLease } from '../../src/lib/lease-lifecycle/service';

const NOW = new Date(Date.UTC(2026, 10, 3, 12));
const noon = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 12));

function installment(over: Row): Row {
  return {
    id: 'inst-1',
    status: 'DUE',
    due_date: noon(2027, 7, 5),
    amount_other_fees: 0,
    penalty_amount: 0,
    amount_paid: 0,
    amount_service: 0,
    ...over
  };
}

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW.getTime());
  store.created = [];
  store.leaseEvents = [];
  store.seq = 0;
  store.installment = null;
  jest.clearAllMocks();
  LEASE = {
    id: 'lease-1',
    tenant_id: 'tenant-A',
    property_id: 'prop-1',
    status: 'ACTIVE',
    start_date: noon(2026, 7, 15),
    end_date: noon(2027, 7, 14),
    billing_frequency: 'MONTHLY',
    due_day_of_month: 5,
    currency: 'FCFA',
    rent_amount: 155000,
    service_charge_amount: 0,
    move_out_date: null
  };
});

afterEach(() => jest.restoreAllMocks());

const detailsOf = (type: string) => store.leaseEvents.find(e => e.type === type)?.details;

describe('renewLease — période de l’ancienne fin facturée au prorata', () => {
  it('non réglée : complétée (14/31 -> mois plein), écart inscrit au compte', async () => {
    store.installment = installment({ period_year: 2027, period_month: 7, amount_rent: 70000 });
    await renewLease('tenant-A', 'lease-1', { newEndDate: '2028-07-31' });

    expect(mockPrisma.rentalInstallment.update).toHaveBeenCalledTimes(1);
    const call = (mockPrisma.rentalInstallment.update.mock.calls[0] as any[])[0];
    expect(call.where).toEqual({ id: 'inst-1', tenant_id: 'tenant-A' });
    expect(Number(call.data.amount_rent)).toBe(155000);
    expect(mockAppend).toHaveBeenCalledTimes(1);
    const movement = (mockAppend.mock.calls[0] as any[])[1];
    expect(movement).toMatchObject({
      type: 'ADJUSTMENT',
      billed: 85000,
      sourceType: 'LEASE_REVISION',
      sourceId: 'inst-1:RENEWAL-2028-07-31'
    });
    expect(detailsOf('RENEWAL')).toMatchObject({ proratedMonthCompleted: true });
    expect(detailsOf('RENEWAL').proratedMonthNotCompleted).toBeUndefined();
    // Nouvelles périodes : août 2027 à juillet 2028, dernière (31/07) pleine.
    expect(store.created).toHaveLength(12);
    expect(Number(store.created[11].amount_rent)).toBe(155000);
  });

  it('brouillon : montants complétés, rien inscrit au compte', async () => {
    store.installment = installment({ period_year: 2027, period_month: 7, amount_rent: 70000, status: 'DRAFT' });
    await renewLease('tenant-A', 'lease-1', { newEndDate: '2028-07-31' });
    expect(mockPrisma.rentalInstallment.update).toHaveBeenCalledTimes(1);
    expect(mockAppend).not.toHaveBeenCalled();
  });

  it('nouvelle fin en cours de mois : la dernière période est elle-même au prorata', async () => {
    store.installment = installment({ period_year: 2027, period_month: 7, amount_rent: 70000 });
    await renewLease('tenant-A', 'lease-1', { newEndDate: '2028-07-14' });
    expect(Number(store.created[store.created.length - 1].amount_rent)).toBe(70000);
    // L'ancienne période de fin est complétée au mois plein.
    expect(Number((mockPrisma.rentalInstallment.update.mock.calls[0] as any[])[0].data.amount_rent)).toBe(155000);
  });

  it('réglée en partie : intacte, signalée dans l’événement', async () => {
    store.installment = installment({
      period_year: 2027,
      period_month: 7,
      amount_rent: 70000,
      status: 'PARTIAL',
      amount_paid: 20000
    });
    await renewLease('tenant-A', 'lease-1', { newEndDate: '2028-07-31' });
    expect(mockPrisma.rentalInstallment.update).not.toHaveBeenCalled();
    expect(mockAppend).not.toHaveBeenCalled();
    expect(detailsOf('RENEWAL')).toMatchObject({ proratedMonthNotCompleted: true });
  });

  it('échéance générée avant H5 (mois plein, non prorata) : non recalculée', async () => {
    store.installment = installment({ period_year: 2027, period_month: 7, amount_rent: 155000 });
    await renewLease('tenant-A', 'lease-1', { newEndDate: '2028-07-31' });
    expect(mockPrisma.rentalInstallment.update).not.toHaveBeenCalled();
    expect(detailsOf('RENEWAL').proratedMonthNotCompleted).toBeUndefined();
  });

  it('ancienne fin au dernier jour du mois : rien à compléter', async () => {
    LEASE.end_date = noon(2027, 7, 31);
    store.installment = installment({ period_year: 2027, period_month: 7, amount_rent: 155000 });
    await renewLease('tenant-A', 'lease-1', { newEndDate: '2028-07-31' });
    expect(mockPrisma.rentalInstallment.update).not.toHaveBeenCalled();
  });
});

describe('terminateLease — période de fin au prorata', () => {
  const terminate = (effectiveDate: string) =>
    terminateLease('tenant-A', 'lease-1', { noticeDate: '2027-01-01', effectiveDate, initiatedBy: 'TENANT' });

  it('non réglée : ramenée à 10/31 du loyer, écart au crédit du compte', async () => {
    store.installment = installment({ period_year: 2027, period_month: 3, amount_rent: 155000 });
    await terminate('2027-03-10');
    const call = (mockPrisma.rentalInstallment.update.mock.calls[0] as any[])[0];
    expect(Number(call.data.amount_rent)).toBe(50000);
    expect((mockAppend.mock.calls[0] as any[])[1]).toMatchObject({
      type: 'ADJUSTMENT',
      settled: 105000,
      sourceId: 'inst-1:TERMINATION-2027-03-10'
    });
    expect(detailsOf('TERMINATION')).toMatchObject({ endMonthProrated: true });
  });

  it('réglée, même en partie : intacte, signalée (avoir à faire à la main)', async () => {
    store.installment = installment({
      period_year: 2027,
      period_month: 3,
      amount_rent: 155000,
      status: 'PAID',
      amount_paid: 155000
    });
    await terminate('2027-03-10');
    expect(mockPrisma.rentalInstallment.update).not.toHaveBeenCalled();
    expect(mockAppend).not.toHaveBeenCalled();
    expect(detailsOf('TERMINATION')).toMatchObject({ endMonthNotAdjusted: true });
    expect(detailsOf('TERMINATION').endMonthProrated).toBeUndefined();
  });

  it('fin au dernier jour du mois : mois dû en entier, aucun ajustement', async () => {
    store.installment = installment({ period_year: 2027, period_month: 3, amount_rent: 155000 });
    await terminate('2027-03-31');
    expect(mockPrisma.rentalInstallment.update).not.toHaveBeenCalled();
    expect(detailsOf('TERMINATION').endMonthProrated).toBeUndefined();
    expect(detailsOf('TERMINATION').endMonthNotAdjusted).toBeUndefined();
  });
});
