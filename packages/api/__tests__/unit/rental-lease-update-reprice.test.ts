/**
 * Modification d'un bail (PATCH) — BUG-2026-11-03-018 et BUG-2026-11-03-022.
 *
 * 018 : changer le loyer ou les charges laissait toutes les échéances déjà
 * générées à l'ancien montant. Règle : les échéances NON commencées (période
 * postérieure au mois courant) et sans aucun paiement sont recalculées ; les
 * autres ne bougent pas.
 * 022 : une date de fin vidée (`null`) doit rendre le bail sans fin.
 */

type Row = Record<string, any>;

const store = { installments: [] as Row[] };

jest.mock('../../src/lib/finance/ledger', () => ({
  appendThirdPartyMovementTx: jest.fn(async () => ({ id: 'mv' })),
  getOrCreateTenantAccountTx: jest.fn(async () => ({ id: 'acc-1' }))
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));
jest.mock('../../src/services/lot-registry-service', () => ({ syncLotActivationsTx: jest.fn() }));
jest.mock('../../src/services/email-service', () => ({ emailService: {} }));
jest.mock('../../src/services/email-notification-config-service', () => ({ getEmailNotificationConfig: jest.fn() }));
jest.mock('../../src/services/tenant-service', () => ({ getTenantById: jest.fn() }));
jest.mock('../../src/services/own-assets-barrier-service', () => ({ assertThirdPartyAllowedForTenant: jest.fn() }));
jest.mock('../../src/services/property-status-service', () => ({
  updatePropertyStatus: jest.fn(),
  validateStatusTransition: jest.fn()
}));

const now = new Date();
const START = new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1));
const EXISTING = {
  id: 'lease-1',
  tenant_id: 'tenant-A',
  status: 'ACTIVE',
  start_date: START,
  end_date: new Date(Date.UTC(now.getUTCFullYear() + 1, 11, 31)),
  rent_amount: 75000,
  service_charge_amount: 0,
  primary_renter_client_id: 'client-1'
};

const mockPrisma: Row = {
  rentalLease: {
    findFirst: jest.fn(async () => ({ ...EXISTING })),
    update: jest.fn(async ({ data }: Row) => ({ ...EXISTING, ...data, id: 'lease-1', documents: [] }))
  },
  leaseEvent: { findMany: jest.fn(async () => []) },
  rentalInstallment: {
    findMany: jest.fn(async ({ where }: Row) =>
      store.installments.filter(
        i =>
          i.lease_id === where.lease_id &&
          where.status.in.includes(i.status) &&
          i.amount_paid === 0 &&
          where.OR.some((c: Row) =>
            c.period_year?.gt !== undefined
              ? i.period_year > c.period_year.gt
              : i.period_year === c.period_year && i.period_month >= c.period_month.gte
          )
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

import { updateLease } from '../../src/services/rental-lease-service';
import { updateLeaseSchema } from '../../src/lib/rental/schemas';

function period(offset: number) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

const installment = (id: string, offset: number, over: Row = {}): Row => {
  const p = period(offset);
  return {
    id,
    lease_id: 'lease-1',
    status: 'DUE',
    period_year: p.year,
    period_month: p.month,
    due_date: new Date(Date.UTC(p.year, p.month - 1, 5)),
    amount_rent: 75000,
    amount_service: 0,
    amount_other_fees: 0,
    penalty_amount: 0,
    amount_paid: 0,
    ...over
  };
};

beforeEach(() => {
  jest.clearAllMocks();
  store.installments = [
    installment('past-paid', -1, { status: 'PAID', amount_paid: 75000 }),
    installment('current', 0),
    installment('future-1', 1),
    installment('future-partial', 2, { status: 'PARTIAL', amount_paid: 5000 }),
    installment('future-3', 3, { status: 'DRAFT' })
  ];
});

describe('updateLease — loyer modifié (BUG-2026-11-03-018)', () => {
  it('recalcule les échéances futures impayées, laisse les autres, et dit combien', async () => {
    const result = await updateLease('tenant-A', 'lease-1', { rentAmount: 80000, serviceChargeAmount: 5000 }, 'user-1');

    const byId = Object.fromEntries(store.installments.map(i => [i.id, [i.amount_rent, i.amount_service]]));
    expect(byId).toEqual({
      'past-paid': [75000, 0],
      current: [75000, 0],
      'future-1': [80000, 5000],
      'future-partial': [75000, 0],
      'future-3': [80000, 5000]
    });
    expect((result as any).installmentsRepriced).toBe(2);
  });

  it('un loyer inchangé ne touche aucune échéance', async () => {
    const result = await updateLease('tenant-A', 'lease-1', { rentAmount: 75000, notes: 'x' }, 'user-1');

    expect(mockPrisma.rentalInstallment.findMany).not.toHaveBeenCalled();
    expect(store.installments.every(i => i.amount_rent === 75000)).toBe(true);
    expect((result as any).installmentsRepriced).toBe(0);
  });
});

describe('updateLease — date de fin retirée (BUG-2026-11-03-022)', () => {
  it('le schéma accepte endDate: null', () => {
    expect(updateLeaseSchema.parse({ endDate: null }).endDate).toBeNull();
  });

  it('endDate: null écrit end_date = null', async () => {
    await updateLease('tenant-A', 'lease-1', { endDate: null }, 'user-1');

    const data = mockPrisma.rentalLease.update.mock.calls[0][0].data;
    expect(data.end_date).toBeNull();
  });

  it('endDate absent laisse la date de fin inchangée', async () => {
    await updateLease('tenant-A', 'lease-1', { notes: 'x' }, 'user-1');

    const data = mockPrisma.rentalLease.update.mock.calls[0][0].data;
    expect(data.end_date).toBeUndefined();
  });
});
