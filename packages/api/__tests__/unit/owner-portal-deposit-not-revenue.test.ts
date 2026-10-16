/**
 * BUG-2026-09-28-030 — portail propriétaire : le dépôt de garantie est une
 * somme détenue, pas un revenu.
 *
 * Un paiement rattaché à la collecte du dépôt (mouvement COLLECT) ne compte ni
 * dans les revenus, ni dans les paiements reçus. Le solde du bail compte les
 * échéances payées (donc PAID) dans « total dû », et le montant détenu du
 * dépôt est son solde actuel (collecté - remboursé - confisqué).
 * Prisma est remplacé par un magasin en mémoire.
 */

type Row = Record<string, any>;

const T = 'tenant-1';
const PROPERTY = 'prop-1';

const store = {
  payments: [] as Row[],
  installments: [] as Row[],
  allocations: [] as Row[],
  deposits: [] as Row[]
};

/** Évalue la partie du `where` Prisma dont ces requêtes se servent. */
function matchesPayment(p: Row, where: Row): boolean {
  if (where.tenant_id !== undefined && p.tenant_id !== where.tenant_id) return false;
  if (where.status !== undefined && p.status !== where.status) return false;
  if (where.lease_id !== undefined && typeof where.lease_id === 'string' && p.lease_id !== where.lease_id) return false;
  if (where.lease?.property_id?.in && !where.lease.property_id.in.includes(p.propertyId)) return false;
  if (where.depositMovements?.none) {
    const none = where.depositMovements.none;
    if (p.depositMovements.some((m: Row) => !none.type || m.type === none.type)) return false;
  }
  return true;
}

const mockPrisma: Row = {
  rentalPayment: {
    aggregate: jest.fn(async ({ where }: Row) => {
      const rows = store.payments.filter(p => matchesPayment(p, where));
      return { _sum: { amount: rows.length ? rows.reduce((s, p) => s + p.amount, 0) : null } };
    }),
    findFirst: jest.fn(async ({ where }: Row) => store.payments.find(p => matchesPayment(p, where)) ?? null),
    findMany: jest.fn(async ({ where }: Row) =>
      store.payments
        .filter(p => matchesPayment(p, where))
        .map(p => ({
          ...p,
          lease: {
            property_id: p.propertyId,
            property: { id: p.propertyId, address: 'Rue 1', title: 'Villa', internalReference: null },
            primaryRenter: { user: { fullName: 'Locataire' } }
          }
        }))
    )
  },
  rentalLease: {
    findFirst: jest.fn(async () => ({ id: 'lease-1', tenant_id: T, property_id: PROPERTY, property: {} }))
  },
  rentalLeaseCoRenter: { findMany: jest.fn(async () => []) },
  rentalInstallment: {
    findMany: jest.fn(async ({ where }: Row) =>
      store.installments.filter(i => !where.status || where.status.in.includes(i.status))
    )
  },
  rentalPaymentAllocation: {
    aggregate: jest.fn(async () => ({
      _sum: { amount: store.allocations.reduce((s, a) => s + a.amount, 0) }
    }))
  },
  rentalSecurityDeposit: {
    findUnique: jest.fn(async () => store.deposits[0] ?? null)
  }
};

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy({}, { get: (_t, prop) => (mockPrisma as any)[prop] })
}));
jest.mock('../../src/utils/report-generator', () => ({}));
jest.mock('../../src/services/document-generation-service', () => ({ getDocumentFile: jest.fn() }));

import { OwnerPortalService } from '../../src/services/owner-portal-service';

const service = new OwnerPortalService();

function payment(id: string, amount: number, depositMovements: Row[] = []): Row {
  return {
    id,
    tenant_id: T,
    lease_id: 'lease-1',
    propertyId: PROPERTY,
    amount,
    status: 'SUCCESS',
    method: 'BANK_TRANSFER',
    succeeded_at: new Date(),
    initiated_at: new Date(),
    depositMovements
  };
}

beforeEach(() => {
  store.payments = [
    payment('loyer', 400_000),
    payment('depot', 800_000, [{ id: 'm1', type: 'COLLECT', amount: 800_000 }])
  ];
  store.installments = [];
  store.allocations = [];
  store.deposits = [];
  jest.clearAllMocks();
});

describe('le dépôt de garantie collecté ne compte pas comme revenu', () => {
  it('résumé des revenus : 400 000 et non 1 200 000', async () => {
    const summary = await service.getRevenueSummary([PROPERTY], T);

    expect(summary.allTime).toBe(400_000);
    expect(summary.currentMonth).toBe(400_000);
    expect(summary.currentYear).toBe(400_000);
  });

  it('liste des revenus : le paiement du dépôt en est absent', async () => {
    const revenues = await service.getRevenues([PROPERTY], T);

    expect(revenues.map((p: Row) => p.id)).toEqual(['loyer']);
  });

  it('revenus par bien : 1 paiement, 400 000', async () => {
    const byProperty = await service.getRevenuesByProperty([PROPERTY], T);

    expect(byProperty).toHaveLength(1);
    expect(byProperty[0].revenue).toBe(400_000);
    expect(byProperty[0].paymentCount).toBe(1);
  });

  it('paiements reçus : montant total 400 000', async () => {
    const payments = await service.getPayments([PROPERTY], T);

    expect(payments.summary.totalAmount).toBe(400_000);
    expect(payments.payments.map(p => p.id)).toEqual(['loyer']);
  });
});

describe('solde du bail et dépôt détenu', () => {
  const echeance = (status: string, paid = 0) => ({
    id: `inst-${status}-${Math.random()}`,
    status,
    amount_rent: 400_000,
    amount_service: 0,
    amount_other_fees: 0,
    penalty_amount: 0,
    amount_paid: paid
  });

  it('une échéance PAID entre dans le total dû : reste à payer 0, jamais négatif', async () => {
    store.installments = [echeance('PAID', 400_000), echeance('DRAFT')];
    store.allocations = [{ amount: 400_000 }];

    const details = await service.getLeaseDetails('lease-1', [PROPERTY], T);

    expect(details.balance.totalDue).toBe(400_000);
    expect(details.balance.totalPaid).toBe(400_000);
    expect(details.balance.remaining).toBe(0);
  });

  it('une échéance à venir non payée reste due', async () => {
    store.installments = [echeance('PAID', 400_000), echeance('DUE')];
    store.allocations = [{ amount: 400_000 }];

    const details = await service.getLeaseDetails('lease-1', [PROPERTY], T);

    expect(details.balance.totalDue).toBe(800_000);
    expect(details.balance.remaining).toBe(400_000);
  });

  it('le montant détenu du dépôt est son solde actuel : 800 000', async () => {
    store.deposits = [
      {
        id: 'dep',
        target_amount: 800_000,
        collected_amount: 800_000,
        held_amount: 0,
        refunded_amount: 0,
        forfeited_amount: 0,
        movements: [{ id: 'm1', type: 'COLLECT', amount: 800_000 }]
      }
    ];

    const details = await service.getLeaseDetails('lease-1', [PROPERTY], T);

    expect((details.deposit as any).current_balance).toBe(800_000);
  });
});

describe('revenus par mois', () => {
  it('les mois sont nommés dans la langue de la requête (français par défaut), pas en anglais', async () => {
    const months = await service.getRevenuesByMonth([PROPERTY], T, 2026);

    expect(months).toHaveLength(12);
    expect(months[0].monthName).toBe('janvier 2026');
    expect(months[11].monthName).toBe('décembre 2026');
  });

  it("le dépôt n'entre dans aucun mois", async () => {
    const months = await service.getRevenuesByMonth([PROPERTY], T, new Date().getFullYear());

    expect(months.reduce((sum, m) => sum + m.revenue, 0)).toBe(400_000);
  });
});
