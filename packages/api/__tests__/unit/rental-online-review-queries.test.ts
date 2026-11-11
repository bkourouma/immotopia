/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Contrat 049 §2.1 à §2.4 : suivi des paiements en ligne du locatif (liste, résumé, vérification).
 */

const store = {
  checkouts: [] as any[],
  leases: [] as any[],
  clients: [] as any[],
  installments: [] as any[],
  payments: [] as any[]
};
let lastWhere: any = null;
let reconcileImpl: (tenantId: string, id: string) => Promise<any> = async (_t, id) =>
  store.checkouts.find(c => c.id === id);

const prismaMock: any = {
  onlinePaymentCheckout: {
    findFirst: jest.fn(
      async ({ where }: any) => store.checkouts.find(c => c.id === where.id && c.tenantId === where.tenantId) ?? null
    ),
    count: jest.fn(async ({ where }: any) => {
      lastWhere = where;
      return store.checkouts.filter(c => c.tenantId === where.tenantId).length;
    }),
    findMany: jest.fn(async ({ where }: any) => store.checkouts.filter(c => c.tenantId === where.tenantId)),
    groupBy: jest.fn(async ({ by, where }: any) => {
      const rows = store.checkouts.filter(
        c => c.tenantId === where.tenantId && (!where.status || c.status === where.status)
      );
      const key = by[0];
      const counts = new Map<string, number>();
      for (const row of rows) counts.set(row[key], (counts.get(row[key]) ?? 0) + 1);
      return [...counts.entries()].map(([value, n]) => ({ [key]: value, _count: { _all: n } }));
    }),
    aggregate: jest.fn(async ({ where }: any) => {
      const rows = store.checkouts.filter(c => c.tenantId === where.tenantId && c.status === where.status);
      return { _min: { createdAt: rows.length ? rows[0].createdAt : null } };
    })
  },
  rentalLease: {
    findFirst: jest.fn(
      async ({ where }: any) => store.leases.find(l => l.id === where.id && l.tenant_id === where.tenant_id) ?? null
    ),
    findMany: jest.fn(async () => store.leases)
  },
  tenantClient: { findMany: jest.fn(async () => store.clients) },
  rentalInstallment: { findMany: jest.fn(async () => store.installments) },
  rentalPayment: { findMany: jest.fn(async () => store.payments) },
  user: { findMany: jest.fn(async () => []) },
  auditLog: { findMany: jest.fn(async () => []) }
};

jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));
jest.mock('../../src/services/rental-payment-service', () => ({ montantDisponibleTx: jest.fn(async () => 0) }));
jest.mock('../../src/lib/payment-gateway/checkout', () => ({
  reconcileCheckoutForVerify: (tenantId: string, id: string) => reconcileImpl(tenantId, id)
}));

import {
  getOnlinePaymentRow,
  getOnlinePaymentsSummary,
  listOnlinePayments,
  verifyOnlinePayment
} from '../../src/lib/rental/online-review/queries';
import { AppError } from '../../src/middleware/error-middleware';

const T1 = 'T1';
const checkout = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  tenantId: T1,
  codePaiement: `IMT-${id}`,
  status: 'PENDING',
  mode: 'SIMULATOR',
  amount: 50000,
  receivedAmount: null,
  currency: 'FCFA',
  leaseId: 'L1',
  renterClientId: 'C1',
  installmentIds: ['I1'],
  paymentId: `P-${id}`,
  secureLinkId: null,
  providerServiceName: null,
  providerTransactionId: null,
  providerFees: null,
  failureMessage: null,
  reviewKind: null,
  reviewReason: null,
  resolution: null,
  resolutionNote: null,
  resolvedAt: null,
  resolvedByUserId: null,
  checkAttempts: 0,
  lastProviderState: null,
  lastProviderPayload: { secret: 'x' },
  checkoutUrl: 'https://pay.example/secret',
  providerToken: 'tok-secret',
  lastCheckedAt: null,
  createdAt: new Date('2026-11-01T10:00:00Z'),
  completedAt: null,
  ...over
});

beforeEach(() => {
  store.checkouts = [checkout('CK1'), checkout('CK2', { status: 'REVIEW', reviewKind: 'AMOUNT_MISMATCH' })];
  store.leases = [{ id: 'L1', tenant_id: T1, lease_number: 'BAIL-001', property: { title: 'Villa A' } }];
  store.clients = [{ id: 'C1', user: { fullName: 'Awa Koné' } }];
  store.installments = [
    {
      id: 'I1',
      period_year: 2026,
      period_month: 11,
      due_date: new Date('2026-11-05'),
      amount_rent: 45000,
      amount_service: 5000,
      amount_other_fees: 0,
      penalty_amount: 0
    }
  ];
  store.payments = [
    { id: 'P-CK1', status: 'PENDING' },
    { id: 'P-CK2', status: 'PENDING' }
  ];
  reconcileImpl = async (_t, id) => store.checkouts.find(c => c.id === id);
});

describe('lignes du suivi', () => {
  it('ligne complète sans checkoutUrl, providerToken ni lastProviderPayload', async () => {
    const row = await getOnlinePaymentRow(T1, 'CK1');
    expect(row).toMatchObject({
      codePaiement: 'IMT-CK1',
      leaseReference: 'BAIL-001',
      propertyLabel: 'Villa A',
      renter: { clientId: 'C1', name: 'Awa Koné' },
      origin: 'PORTAL',
      collected: false
    });
    expect(row.installments[0]).toMatchObject({ id: 'I1', amountDue: 50000 });
    const json = JSON.stringify(row);
    expect(json).not.toMatch(/checkoutUrl|providerToken|lastProviderPayload|secret/);
  });

  it('autre agence : 404', async () => {
    await expect(getOnlinePaymentRow('T2', 'CK1')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('liste', () => {
  it('filtre par agence et pagine côté serveur', async () => {
    const page = await listOnlinePayments(T1, { pageSize: '1', page: '1' });
    expect(page).toMatchObject({ total: 2, page: 1, pageSize: 1 });
    expect(lastWhere.tenantId).toBe(T1);
  });

  it('statut inconnu, dates inversées, pageSize > 100 : 400', async () => {
    await expect(listOnlinePayments(T1, { status: 'PENDING,NOPE' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(listOnlinePayments(T1, { from: '2026-11-10', to: '2026-11-01' })).rejects.toMatchObject({
      statusCode: 400
    });
    await expect(listOnlinePayments(T1, { pageSize: '101' })).rejects.toBeTruthy();
  });

  it('bail d’une autre agence : 404', async () => {
    await expect(listOnlinePayments(T1, { leaseId: '00000000-0000-4000-8000-000000000000' })).rejects.toMatchObject({
      statusCode: 404
    });
  });
});

describe('résumé', () => {
  it('compteurs des 6 statuts à 0 par défaut, motifs et plus ancienne revue', async () => {
    const summary = await getOnlinePaymentsSummary(T1);
    expect(summary.counts).toEqual({ PENDING: 1, SUCCESS: 0, FAILED: 0, CANCELED: 0, EXPIRED: 0, REVIEW: 1 });
    expect(summary.reviewPending).toBe(1);
    expect(summary.reviewByKind).toEqual({
      AMOUNT_MISMATCH: 1,
      CONTRARY_STATE: 0,
      DUPLICATE_TRANSACTION: 0,
      INSTALLMENT_UNAVAILABLE: 0
    });
    expect(summary.oldestReviewAt).toBe('2026-11-01T10:00:00.000Z');
  });
});

describe('vérification', () => {
  it('409 CHECKOUT_NOT_VERIFIABLE sur une tentative déjà SUCCESS', async () => {
    store.checkouts.push(checkout('CK3', { status: 'SUCCESS' }));
    await expect(verifyOnlinePayment(T1, 'CK3')).rejects.toMatchObject({
      statusCode: 409,
      code: 'CHECKOUT_NOT_VERIFIABLE'
    });
  });

  it('404 hors agence', async () => {
    await expect(verifyOnlinePayment('T2', 'CK1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('changed = true quand le statut change', async () => {
    reconcileImpl = async (_t, id) => ({ ...store.checkouts.find(c => c.id === id), status: 'SUCCESS' });
    const result = await verifyOnlinePayment(T1, 'CK1');
    expect(result.changed).toBe(true);
    expect(result.checkout.status).toBe('SUCCESS');
  });

  it('changed = false si rien ne bouge ; passerelle injoignable : 502 ONLINE_PAYMENT_PROVIDER_UNREACHABLE', async () => {
    expect((await verifyOnlinePayment(T1, 'CK1')).changed).toBe(false);
    reconcileImpl = async () => {
      throw new AppError('injoignable', 502);
    };
    await expect(verifyOnlinePayment(T1, 'CK1')).rejects.toMatchObject({
      statusCode: 502,
      code: 'ONLINE_PAYMENT_PROVIDER_UNREACHABLE'
    });
  });
});
