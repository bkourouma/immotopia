/**
 * Recette gestion locative : la campagne de facturation ne crée pas la 13e
 * échéance d'un jour.
 *
 * Règle (identique à `generateInstallments`, voir `lib/rental/installment-periods.ts`) :
 * une échéance par période qui COMMENCE dans le bail ; une période finale réduite
 * au seul dernier jour du bail (début de période == date de fin) n'est PAS facturée.
 * Un bail du 01/07/2026 au 01/07/2027 a donc 12 échéances mensuelles, pas 13.
 *
 * Les dates sont construites en heure locale (`new Date(y, m, d)`), comme le fait
 * `listBillingPeriods` : le test ne dépend pas du fuseau de la machine.
 */

import { RentalBillingFrequency, RentalLeaseStatus } from '@prisma/client';

const appendThirdPartyMovementTx = jest.fn();
const getOrCreateTenantAccountTx = jest.fn();

jest.mock('../../src/lib/finance/ledger', () => ({
  appendThirdPartyMovementTx: (...args: any[]) => appendThirdPartyMovementTx(...args),
  getOrCreateTenantAccountTx: (...args: any[]) => getOrCreateTenantAccountTx(...args)
}));

type Row = Record<string, any>;

const store = {
  leases: [] as Row[],
  billingRuns: [] as Row[],
  installments: [] as Row[],
  seq: 0
};

function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}-${store.seq}`;
}

/** Les `Decimal` du code de production deviennent des nombres, comme au retour d'une lecture. */
function toPlainRow(data: Row): Row {
  const plain: Row = {};
  for (const [key, value] of Object.entries(data)) {
    plain[key] =
      value !== null && typeof value === 'object' && typeof value.toNumber === 'function' ? Number(value) : value;
  }
  return plain;
}

const mockPrisma: Row = {
  rentalLease: {
    findMany: jest.fn(async ({ where }: Row) => store.leases.filter(l => l.tenant_id === where.tenant_id))
  },
  rentBillingRun: {
    findUnique: jest.fn(async ({ where }: Row) => {
      const key = where.tenantId_periodYear_periodMonth;
      return (
        store.billingRuns.find(
          r => r.tenantId === key.tenantId && r.periodYear === key.periodYear && r.periodMonth === key.periodMonth
        ) ?? null
      );
    }),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('run'), finishedAt: null, summary: null, ...data };
      store.billingRuns.push(created);
      return created;
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const run = store.billingRuns.find(r => r.id === where.id);
      if (!run) return null;
      Object.assign(run, data);
      return { ...run };
    })
  },
  rentalInstallment: {
    findFirst: jest.fn(async ({ where }: Row) => {
      const found = store.installments.find(
        i =>
          i.tenant_id === where.tenant_id &&
          i.lease_id === where.lease_id &&
          i.period_year === where.period_year &&
          i.period_month === where.period_month
      );
      return found ? { ...found } : null;
    }),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId('inst'), amount_paid: 0, status: 'DRAFT', ...toPlainRow(data) };
      store.installments.push(created);
      return created;
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const installment = store.installments.find(i => i.id === where.id);
      if (!installment) return null;
      Object.assign(installment, toPlainRow(data));
      return { ...installment };
    })
  },
  rentalPayment: { findMany: jest.fn(async () => []) },
  rentalPaymentAllocation: { create: jest.fn() },
  $transaction: jest.fn(async (callback: (tx: Row) => Promise<any>) => callback(mockPrisma))
};

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy({}, { get: (_target, prop) => (mockPrisma as any)[prop] })
}));

import { runRentBilling } from '../../src/lib/finance/billing-run';
import { buildInstallmentForPeriod } from '../../src/lib/finance/installment-builder';
import { listBillingPeriods } from '../../src/lib/rental/installment-periods';

const TENANT_ID = 'tenant-1';
const ACTOR_ID = 'user-1';

function seedLease(overrides: Partial<Row> = {}): Row {
  const lease = {
    id: nextId('lease'),
    tenant_id: TENANT_ID,
    status: RentalLeaseStatus.ACTIVE,
    primary_renter_client_id: nextId('client'),
    start_date: new Date(2026, 6, 1),
    end_date: new Date(2027, 6, 1),
    billing_frequency: RentalBillingFrequency.MONTHLY,
    due_day_of_month: 5,
    currency: 'FCFA',
    rent_amount: 100000,
    service_charge_amount: 0,
    property: { title: 'Villa Kipé 12' },
    primaryRenter: { user: { fullName: 'Fatoumata Diallo', email: 'f.diallo@example.ci' } },
    ...overrides
  };
  store.leases.push(lease);
  return lease;
}

beforeEach(() => {
  jest.clearAllMocks();
  store.leases = [];
  store.billingRuns = [];
  store.installments = [];
  store.seq = 0;
  getOrCreateTenantAccountTx.mockImplementation(async (_tx: any, _tenantId: string, tenantClientId: string) => ({
    id: `acc-${tenantClientId}`,
    label: 'Compte locataire',
    balance: 0
  }));
  appendThirdPartyMovementTx.mockImplementation(async () => ({ id: nextId('mv') }));
});

describe('runRentBilling — dernier jour du bail', () => {
  it('bail 01/07/2026 -> 01/07/2027 : le mois de juillet 2027 (un seul jour) n’est pas facturé', async () => {
    const lease = seedLease();

    const result = await runRentBilling(TENANT_ID, { periodYear: 2027, periodMonth: 7 }, ACTOR_ID);

    expect(result.summary?.billed).toEqual([]);
    expect(result.summary?.excluded).toEqual([
      { leaseId: lease.id, leaseLabel: 'Fatoumata Diallo — Villa Kipé 12', reason: 'PERIOD_AFTER_LEASE_END' }
    ]);
    expect(store.installments).toHaveLength(0);
    expect(appendThirdPartyMovementTx).not.toHaveBeenCalled();
  });

  it('le dernier vrai mois (juin 2027) est toujours facturé', async () => {
    seedLease();

    const result = await runRentBilling(TENANT_ID, { periodYear: 2027, periodMonth: 6 }, ACTOR_ID);

    expect(result.summary?.billed).toHaveLength(1);
    expect(store.installments).toHaveLength(1);
  });

  it('une période finale de deux jours (fin le 02/07/2027) reste facturée', async () => {
    seedLease({ end_date: new Date(2027, 6, 2) });

    const result = await runRentBilling(TENANT_ID, { periodYear: 2027, periodMonth: 7 }, ACTOR_ID);

    expect(result.summary?.billed).toHaveLength(1);
    expect(store.installments).toHaveLength(1);
  });

  it('douze mois consécutifs de campagne donnent douze échéances, pas treize', async () => {
    seedLease();

    // Juillet 2026 à août 2027 : une marge d'un mois après la fin du bail.
    for (let index = 0; index < 14; index += 1) {
      const absolute = 2026 * 12 + 6 + index;
      await runRentBilling(
        TENANT_ID,
        { periodYear: Math.floor(absolute / 12), periodMonth: (absolute % 12) + 1 },
        ACTOR_ID
      );
    }

    expect(store.installments).toHaveLength(12);
    expect(store.installments.some(i => i.period_year === 2027 && i.period_month === 7)).toBe(false);
  });

  it('bail trimestriel 01/01/2026 -> 01/01/2027 : le trimestre d’un jour (janvier 2027) n’est pas facturé', async () => {
    const lease = seedLease({
      start_date: new Date(2026, 0, 1),
      end_date: new Date(2027, 0, 1),
      billing_frequency: RentalBillingFrequency.QUARTERLY
    });

    const result = await runRentBilling(TENANT_ID, { periodYear: 2027, periodMonth: 1 }, ACTOR_ID);

    expect(result.summary?.excluded).toEqual([
      { leaseId: lease.id, leaseLabel: 'Fatoumata Diallo — Villa Kipé 12', reason: 'PERIOD_AFTER_LEASE_END' }
    ]);
    expect(store.installments).toHaveLength(0);
  });

  it('un bail d’un seul jour garde son unique échéance (première période jamais retirée)', async () => {
    seedLease({ start_date: new Date(2026, 6, 1), end_date: new Date(2026, 6, 1) });

    const result = await runRentBilling(TENANT_ID, { periodYear: 2026, periodMonth: 7 }, ACTOR_ID);

    expect(result.summary?.billed).toHaveLength(1);
  });
});

describe('buildInstallmentForPeriod — même règle que listBillingPeriods', () => {
  const frequencies = [
    RentalBillingFrequency.MONTHLY,
    RentalBillingFrequency.QUARTERLY,
    RentalBillingFrequency.SEMIANNUAL,
    RentalBillingFrequency.ANNUAL
  ];

  const cases: Array<{ start: Date; end: Date }> = [
    { start: new Date(2026, 6, 1), end: new Date(2027, 6, 1) },
    { start: new Date(2026, 6, 1), end: new Date(2027, 5, 30) },
    { start: new Date(2026, 6, 1), end: new Date(2027, 6, 2) },
    { start: new Date(2026, 0, 1), end: new Date(2027, 0, 1) },
    { start: new Date(2026, 0, 15), end: new Date(2027, 0, 1) },
    { start: new Date(2026, 8, 28), end: new Date(2028, 8, 28) },
    { start: new Date(2026, 6, 1), end: new Date(2026, 6, 1) },
    { start: new Date(2026, 6, 15), end: new Date(2026, 7, 1) }
  ];

  it.each(frequencies)(
    '%s : les périodes facturées par le constructeur sont celles de listBillingPeriods',
    frequency => {
      for (const { start, end } of cases) {
        const expected = listBillingPeriods(start, end, frequency).map(
          p => `${p.start.getFullYear()}-${p.start.getMonth() + 1}`
        );

        const lease = {
          id: 'l1',
          tenant_id: 't1',
          start_date: start,
          end_date: end,
          billing_frequency: frequency,
          due_day_of_month: 5,
          currency: 'FCFA',
          rent_amount: 100000,
          service_charge_amount: 0
        } as any;

        const actual: string[] = [];
        for (let index = 0; index < 60; index += 1) {
          const absolute = start.getFullYear() * 12 + start.getMonth() + index;
          const year = Math.floor(absolute / 12);
          const month = (absolute % 12) + 1;
          if (buildInstallmentForPeriod(lease, year, month).included) actual.push(`${year}-${month}`);
        }

        expect({ start, end, periods: actual }).toEqual({ start, end, periods: expected });
      }
    }
  );
});
