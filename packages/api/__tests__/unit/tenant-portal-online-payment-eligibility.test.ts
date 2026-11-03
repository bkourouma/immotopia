/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Paiement en ligne du portail locataire : seule une échéance exigible peut
 * être réglée.
 *
 * Le portail refuse déjà de DÉCLARER un paiement sur une échéance `DRAFT` ou
 * `CANCELED` (« Cette échéance n'est pas exigible… »). Le paiement en ligne
 * (`POST /api/portal/tenant/online-payments`) doit obéir à la même règle :
 * le locataire ne choisit que `installmentIds`, et rien d'autre que l'état
 * de l'échéance ne l'empêchait d'y glisser un brouillon.
 *
 * Prisma est remplacé par un magasin en mémoire (même esprit que
 * `checkout-installments.test.ts`) ; le client d'agrégateur est mocké.
 * Les tests passent par le handler HTTP réel, comme le routeur l'appelle.
 */

type Row = Record<string, any>;

const TENANT_ID = 'tenant-a';
const LEASE_ID = 'lease-a';
const CLIENT_ID = 'client-a';

const store = {
  configs: [] as Row[],
  checkouts: [] as Row[],
  payments: [] as Row[],
  installments: [] as Row[],
  seq: 0
};

function resetStore() {
  store.configs = [];
  store.checkouts = [];
  store.payments = [];
  store.installments = [];
  store.seq = 0;
}

function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}-${store.seq}`;
}

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (condition === undefined) return true;
    if (key === 'OR') return (condition as Row[]).some(sub => matches(row, sub));
    const value = row[key];
    if (condition !== null && typeof condition === 'object' && !(condition instanceof Date)) {
      if ('in' in condition) return condition.in.includes(value);
      if ('not' in condition) return value !== condition.not;
      if ('gte' in condition) return value >= condition.gte;
      if ('hasSome' in condition) return (value ?? []).some((v: unknown) => condition.hasSome.includes(v));
      return false;
    }
    return value === condition;
  });
}

function delegate(collection: () => Row[], prefix: string, defaults: () => Row = () => ({})) {
  return {
    findFirst: jest.fn(async ({ where }: Row = {}) => collection().find(r => matches(r, where)) ?? null),
    findFirstOrThrow: jest.fn(async ({ where }: Row = {}) => {
      const found = collection().find(r => matches(r, where));
      if (!found) throw new Error('not found');
      return found;
    }),
    findMany: jest.fn(async ({ where }: Row = {}) => collection().filter(r => matches(r, where))),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId(prefix), createdAt: new Date(), updatedAt: new Date(), ...defaults(), ...data };
      collection().push(created);
      return created;
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const found = collection().find(r => matches(r, where));
      if (!found) throw new Error(`${prefix}: record to update not found`);
      Object.assign(found, data, { updatedAt: new Date() });
      return found;
    })
  };
}

const mockPrisma: Row = {
  paymentGatewayConfig: {
    findUnique: jest.fn(async ({ where }: Row) => store.configs.find(c => c.tenantId === where.tenantId) ?? null)
  },
  onlinePaymentCheckout: delegate(
    () => store.checkouts,
    'checkout',
    () => ({ checkoutUrl: null, providerToken: null, status: 'PENDING', failureMessage: null, completedAt: null })
  ),
  rentalPayment: delegate(() => store.payments, 'payment'),
  rentalInstallment: delegate(() => store.installments, 'installment'),
  tenantClient: delegate(() => [], 'client'),
  crmContact: delegate(() => [], 'contact'),
  $executeRaw: jest.fn(async () => 1),
  $transaction: jest.fn(async (arg: unknown) => {
    if (typeof arg === 'function') return (arg as (tx: Row) => Promise<unknown>)(mockPrisma);
    return Promise.all(arg as Promise<unknown>[]);
  })
};

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy(
    {},
    {
      get(_target, prop) {
        return (mockPrisma as any)[prop];
      }
    }
  )
}));

jest.mock('../../src/services/rental-payment-service', () => ({
  updatePaymentStatusTx: jest.fn(),
  allocatePaymentTx: jest.fn()
}));

jest.mock('../../src/lib/treasury/accounts', () => ({
  ensureChartAccountTx: jest.fn(async () => 'chart-5525')
}));

// Le client d'agrégateur : seule source de `checkoutUrl`.
const buildAway = jest.fn();
jest.mock('../../src/lib/payment-gateway/paysecurehub', () => ({
  gatewayClientForMode: () => ({ buildAway, getStatus: jest.fn() })
}));

import { BadRequestError } from '../../src/middleware/error-middleware';
import { startOnlinePaymentHandler } from '../../src/controllers/tenant-portal-online-payment-controller';
import { startCheckoutForInstallments } from '../../src/lib/payment-gateway/checkout';

const NOT_EXIGIBLE = "Cette échéance n'est pas exigible : aucun paiement ne peut être déclaré dessus.";

const ID_DRAFT = '11111111-1111-4111-8111-111111111111';
const ID_CANCELED = '22222222-2222-4222-8222-222222222222';
const ID_PAID = '33333333-3333-4333-8333-333333333333';
const ID_DUE = '44444444-4444-4444-8444-444444444444';
const ID_PARTIAL = '55555555-5555-4555-8555-555555555555';

function seedAgency() {
  store.configs.push({
    id: nextId('config'),
    tenantId: TENANT_ID,
    provider: 'PAYSECUREHUB',
    mode: 'SIMULATOR',
    isActive: true,
    merchantId: null,
    apiKeyEncrypted: null,
    treasuryAccountId: 'treasury-1'
  });
}

function seedInstallment(id: string, overrides: Row = {}): Row {
  const installment = {
    id,
    tenant_id: TENANT_ID,
    lease_id: LEASE_ID,
    status: 'DUE',
    amount_rent: 150000,
    amount_service: 10000,
    amount_other_fees: 0,
    penalty_amount: 0,
    amount_paid: 0,
    payments: [],
    ...overrides
  };
  store.installments.push(installment);
  return installment;
}

/** Appelle le handler comme Express : `next` reçoit l'erreur, sinon la réponse part avec `res`. */
async function postOnlinePayment(installmentIds: string[]) {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (code: number) => ((res.statusCode = code), res);
  res.json = (body: unknown) => ((res.body = body), res);
  const next = jest.fn();
  const req: any = {
    tenantPortal: { tenantId: TENANT_ID, tenantClientId: CLIENT_ID, leaseId: LEASE_ID },
    user: { userId: 'user-a' },
    body: { installmentIds },
    params: {},
    query: {}
  };
  await startOnlinePaymentHandler(req, res, next);
  return { res, error: next.mock.calls[0]?.[0] as (BadRequestError & { statusCode: number }) | undefined };
}

beforeEach(() => {
  resetStore();
  jest.clearAllMocks();
  buildAway.mockResolvedValue({
    url: 'https://pay.provider.example/hosted/abc',
    tokens: 'tok',
    code: '00',
    message: 'ok'
  });
});

describe('POST /api/portal/tenant/online-payments : échéance non exigible', () => {
  it('refuse (400) un brouillon (DRAFT), avec le texte du refus de déclaration', async () => {
    seedAgency();
    seedInstallment(ID_DRAFT, { status: 'DRAFT', due_date: new Date('2099-01-05') });

    const { res, error } = await postOnlinePayment([ID_DRAFT]);

    expect(error).toBeInstanceOf(BadRequestError);
    expect(error?.statusCode).toBe(400);
    expect(error?.message).toBe(NOT_EXIGIBLE);
    expect(res.statusCode).not.toBe(201);
    // Rien n'est créé ni envoyé à l'agrégateur.
    expect(store.payments).toHaveLength(0);
    expect(store.checkouts).toHaveLength(0);
    expect(buildAway).not.toHaveBeenCalled();
  });

  it('refuse toute la sélection si un brouillon se glisse parmi des échéances dues', async () => {
    seedAgency();
    seedInstallment(ID_DUE);
    seedInstallment(ID_DRAFT, { status: 'DRAFT', due_date: new Date('2099-01-05') });

    const { error } = await postOnlinePayment([ID_DUE, ID_DRAFT]);

    expect(error).toBeInstanceOf(BadRequestError);
    expect(error?.message).toBe(NOT_EXIGIBLE);
    expect(store.payments).toHaveLength(0);
    expect(store.checkouts).toHaveLength(0);
  });

  it('refuse (400) une échéance annulée (déjà refusée avant ce correctif)', async () => {
    seedAgency();
    seedInstallment(ID_CANCELED, { status: 'CANCELED' });

    const { error } = await postOnlinePayment([ID_CANCELED]);

    expect(error).toBeInstanceOf(BadRequestError);
    expect(error?.statusCode).toBe(400);
    expect(store.payments).toHaveLength(0);
  });

  it('refuse (400) une échéance déjà soldée (déjà refusée avant ce correctif)', async () => {
    seedAgency();
    seedInstallment(ID_PAID, { status: 'PAID', amount_paid: 160000 });

    const { error } = await postOnlinePayment([ID_PAID]);

    expect(error).toBeInstanceOf(BadRequestError);
    expect(error?.statusCode).toBe(400);
    expect(store.payments).toHaveLength(0);
  });

  it('accepte (201) une échéance due et une échéance partiellement payée : le reste dû est recalculé', async () => {
    seedAgency();
    seedInstallment(ID_DUE);
    seedInstallment(ID_PARTIAL, { status: 'PARTIAL', amount_paid: 60000 });

    const { res, error } = await postOnlinePayment([ID_DUE, ID_PARTIAL]);

    expect(error).toBeUndefined();
    expect(res.statusCode).toBe(201);
    expect(res.body.data.amount).toBe(160000 + 100000);
    expect(store.payments).toHaveLength(1);
    expect(store.checkouts).toHaveLength(1);
  });
});

describe('lien de paiement : la règle du portail ne déborde pas', () => {
  it('startCheckoutForInstallments garde sa propre règle d’exigibilité (BUG-2026-10-02-015)', async () => {
    // Un brouillon dont la date est passée est « En retard » : le service du lien
    // le juge lui-même (computeInstallmentStatus) avant d'appeler le checkout. Le
    // contrôle « brouillon refusé » est propre au portail et ne vit pas dans la
    // préparation commune.
    seedAgency();
    seedInstallment(ID_DRAFT, { status: 'DRAFT', due_date: new Date('2020-01-05') });

    const { checkout } = await startCheckoutForInstallments({
      tenantId: TENANT_ID,
      leaseId: LEASE_ID,
      renterClientId: CLIENT_ID,
      installmentIds: [ID_DRAFT],
      actorUserId: null,
      secureLinkId: 'link-1'
    });

    expect(checkout.amount).toBe(160000);
    expect(store.checkouts).toHaveLength(1);
  });
});
