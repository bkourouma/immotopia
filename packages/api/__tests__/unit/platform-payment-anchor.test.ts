/**
 * Renouvellement par paiement et jour d'ancrage (fin de mois) :
 * `settlePlatformInvoiceTx` -> `applyPaymentToSubscriptionTx` (non exporte).
 * Un abonnement ancre le 31 reste un 31 (28/02 -> 31/03) ; l'ancre > 28 est
 * memorisee dans `metadata.billingAnchorDay`. Faux magasin en memoire
 * (modele : platform-payment.test.ts), aucune base.
 */

type Row = Record<string, any>;

const TENANT = 'tenant-a';

const store = {
  invoices: [] as Row[],
  payments: [] as Row[],
  subscriptions: [] as Row[],
  seq: 0
};

function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}-${store.seq}`;
}

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (condition === undefined) return true;
    return row[key] === condition;
  });
}

function delegate(collection: () => Row[], prefix: string) {
  return {
    findFirst: jest.fn(async ({ where }: Row = {}) => collection().find(r => matches(r, where)) ?? null),
    findUnique: jest.fn(async ({ where }: Row = {}) => collection().find(r => matches(r, where)) ?? null),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId(prefix), createdAt: new Date(), updatedAt: new Date(), ...data };
      collection().push(created);
      return created;
    }),
    update: jest.fn(async ({ where, data }: Row) => {
      const found = collection().find(r => matches(r, where));
      if (!found) throw new Error(`${prefix}: record to update not found`);
      Object.assign(found, data);
      return found;
    })
  };
}

const mockPrisma: Row = {
  invoice: delegate(() => store.invoices, 'invoice'),
  platformInvoicePayment: delegate(() => store.payments, 'pay'),
  subscription: delegate(() => store.subscriptions, 'sub'),
  $queryRaw: jest.fn(async () => []),
  $transaction: jest.fn(async (arg: unknown) => (arg as (tx: Row) => Promise<unknown>)(mockPrisma))
};

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy({}, { get: (_t, prop) => (mockPrisma as any)[prop] })
}));

jest.mock('../../src/services/subscription-v2-service', () => ({
  getEntitlements: jest.fn(async () => ({ packs: ['AGENCE'], capacities: {} })),
  applyDueItemTransitionsTx: jest.fn(async () => ({ ended: 0, started: 0 })),
  invalidateEntitlements: jest.fn()
}));

jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));

jest.mock('../../src/services/subscription-upgrade/apply-upgrade', () => ({
  applyUpgradeForInvoiceTx: jest.fn(async () => ({ applied: false, target: null }))
}));

jest.mock('../../src/services/email-service', () => ({
  emailService: { sendEmail: jest.fn(async () => undefined) }
}));

import { settlePlatformInvoiceTx } from '../../src/services/platform-payment-service';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function seedSubscription(sub: Row) {
  store.subscriptions = [
    {
      id: 'sub-a',
      tenantId: TENANT,
      status: 'ACTIVE',
      billingCycle: 'MONTHLY',
      trialEndsAt: null,
      pastDueAt: null,
      nextBillingAt: null,
      metadata: null,
      ...sub
    }
  ];
}

function addInvoice(invoiceId: string, periodStart: string) {
  store.invoices.push({
    id: invoiceId,
    tenantId: TENANT,
    subscriptionId: 'sub-a',
    invoiceNumber: `IMT-2027-${invoiceId}`,
    kind: 'PLATFORM',
    status: 'ISSUED',
    currency: 'FCFA',
    amountTotal: '35282.00',
    periodStart: d(periodStart),
    periodEnd: null,
    paidAt: null
  });
}

function settle(invoiceId: string, now: Date) {
  return settlePlatformInvoiceTx(mockPrisma as any, {
    tenantId: TENANT,
    invoiceId,
    method: 'BANK_TRANSFER',
    paidAt: now,
    now
  });
}

beforeEach(() => {
  store.invoices = [];
  store.payments = [];
  store.subscriptions = [];
  store.seq = 0;
});

describe('renouvellement par paiement : jour d’ancrage', () => {
  it('ancre 31 memorisee : 28/02 -> 31/03, nextBillingAt identique, ancre conservee', async () => {
    seedSubscription({
      currentPeriodStart: d('2027-01-31'),
      currentPeriodEnd: d('2027-02-28'),
      metadata: { billingAnchorDay: 31 }
    });
    addInvoice('inv-1', '2027-02-28');

    const result = await settle('inv-1', new Date('2027-02-28T10:00:00Z'));

    expect(result.subscription).toBe('RENEWED');
    const sub = store.subscriptions[0];
    expect(sub.status).toBe('ACTIVE');
    expect(sub.currentPeriodStart.toISOString()).toBe('2027-02-28T00:00:00.000Z');
    expect(sub.currentPeriodEnd.toISOString()).toBe('2027-03-31T00:00:00.000Z');
    expect(sub.nextBillingAt.toISOString()).toBe('2027-03-31T00:00:00.000Z');
    expect(sub.metadata).toEqual({ billingAnchorDay: 31 });
  });

  it('sans metadata, fin au 31/01 : fin 28/02, ancre 31 ecrite, puis 2e reglement -> 31/03 (pas 28/03)', async () => {
    seedSubscription({
      currentPeriodStart: d('2026-12-31'),
      currentPeriodEnd: d('2027-01-31'),
      metadata: null
    });
    addInvoice('inv-1', '2027-01-31');

    const first = await settle('inv-1', new Date('2027-01-31T10:00:00Z'));
    expect(first.subscription).toBe('RENEWED');
    expect(store.subscriptions[0].currentPeriodStart.toISOString()).toBe('2027-01-31T00:00:00.000Z');
    expect(store.subscriptions[0].currentPeriodEnd.toISOString()).toBe('2027-02-28T00:00:00.000Z');
    expect(store.subscriptions[0].metadata).toEqual({ billingAnchorDay: 31 });

    addInvoice('inv-2', '2027-02-28');
    const second = await settle('inv-2', new Date('2027-02-28T10:00:00Z'));
    expect(second.subscription).toBe('RENEWED');
    const sub = store.subscriptions[0];
    expect(sub.currentPeriodStart.toISOString()).toBe('2027-02-28T00:00:00.000Z');
    expect(sub.currentPeriodEnd.toISOString()).toBe('2027-03-31T00:00:00.000Z');
    expect(sub.metadata).toEqual({ billingAnchorDay: 31 });
  });

  it('ancre 15 : fin le 15 du mois suivant, aucune metadata ecrite', async () => {
    seedSubscription({
      currentPeriodStart: d('2027-01-15'),
      currentPeriodEnd: d('2027-02-15'),
      metadata: null
    });
    addInvoice('inv-1', '2027-02-15');

    const result = await settle('inv-1', new Date('2027-02-15T10:00:00Z'));

    expect(result.subscription).toBe('RENEWED');
    const sub = store.subscriptions[0];
    expect(sub.currentPeriodStart.toISOString()).toBe('2027-02-15T00:00:00.000Z');
    expect(sub.currentPeriodEnd.toISOString()).toBe('2027-03-15T00:00:00.000Z');
    expect(sub.metadata).toBeNull();
  });

  it('PAST_DUE, ancre 31 : renouvele jusqu’au 31/03, ACTIVE, pastDueAt efface', async () => {
    seedSubscription({
      status: 'PAST_DUE',
      currentPeriodStart: d('2027-01-31'),
      currentPeriodEnd: d('2027-02-28'),
      pastDueAt: d('2027-02-28'),
      metadata: { billingAnchorDay: 31 }
    });
    addInvoice('inv-1', '2027-02-28');

    const result = await settle('inv-1', new Date('2027-03-03T10:00:00Z'));

    expect(result.subscription).toBe('RENEWED');
    const sub = store.subscriptions[0];
    expect(sub.status).toBe('ACTIVE');
    expect(sub.pastDueAt).toBeNull();
    expect(sub.currentPeriodStart.toISOString()).toBe('2027-02-28T00:00:00.000Z');
    expect(sub.currentPeriodEnd.toISOString()).toBe('2027-03-31T00:00:00.000Z');
    expect(sub.metadata).toEqual({ billingAnchorDay: 31 });
  });
});
