/**
 * Vague 3, lot B — paiement de l'abonnement des agences (factures PLATFORM)
 * et routes manquantes de la vague 2.
 *
 * Couvre :
 *   - le paiement en ligne sur le compte PaySecureHub d'ImmoTopia (simulateur) :
 *     201, 409 avec reprise, facture deja reglee, facture d'une autre agence ;
 *   - le rapprochement : succes (facture PAYEE, sortie de PAST_DUE), IPN
 *     rejouee idempotente, statut contraire ulterieur (facture jamais defaite,
 *     checkout en REVIEW), montant divergent, double encaissement ;
 *   - l'IPN du compte ImmoTopia : toujours 200, codes des loyers ignores ;
 *   - le constat manuel : reglement, audit, 409, 404 entre agences, date future ;
 *   - PATCH d'un element, demandes d'extension (e-mail au super-admin), resume
 *     des agences en une requete.
 *
 * Prisma est remplace par un magasin en memoire (meme esprit que
 * payment-gateway.test.ts) : aucune base n'est requise.
 */

import type { Request, Response } from 'express';

type Row = Record<string, any>;

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

const store = {
  tenants: [] as Row[],
  users: [] as Row[],
  invoices: [] as Row[],
  payments: [] as Row[],
  checkouts: [] as Row[],
  subscriptions: [] as Row[],
  items: [] as Row[],
  catalog: [] as Row[],
  requests: [] as Row[],
  overrides: [] as Row[],
  modules: [] as Row[],
  lots: [] as Row[],
  syndicates: [] as Row[],
  sites: [] as Row[],
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
    const value = row[key];
    if (condition !== null && typeof condition === 'object' && !(condition instanceof Date)) {
      if ('in' in condition) return condition.in.includes(value);
      if ('notIn' in condition) return !condition.notIn.includes(value);
      if ('not' in condition) return value !== condition.not;
      if ('gte' in condition) return value >= condition.gte;
      if ('lte' in condition) return value <= condition.lte;
      return false;
    }
    return value === condition;
  });
}

function apply(row: Row, data: Row): Row {
  for (const [key, value] of Object.entries(data)) {
    if (value !== null && typeof value === 'object' && 'increment' in value) row[key] = (row[key] ?? 0) + value.increment;
    else row[key] = value;
  }
  row.updatedAt = new Date();
  return row;
}

function withInclude(row: Row | null, include: Row | undefined): Row | null {
  if (!row || !include?.catalogItem) return row;
  return { ...row, catalogItem: store.catalog.find(c => c.id === row.catalogItemId) };
}

function delegate(collection: () => Row[], prefix: string, defaults: () => Row = () => ({})) {
  return {
    findFirst: jest.fn(async ({ where, include }: Row = {}) =>
      withInclude(collection().find(r => matches(r, where)) ?? null, include)
    ),
    findUnique: jest.fn(async ({ where, include }: Row = {}) =>
      withInclude(collection().find(r => matches(r, where)) ?? null, include)
    ),
    findFirstOrThrow: jest.fn(async ({ where }: Row = {}) => {
      const found = collection().find(r => matches(r, where));
      if (!found) throw new Error('not found');
      return found;
    }),
    findMany: jest.fn(async ({ where, include }: Row = {}) =>
      collection()
        .filter(r => matches(r, where))
        .map(r => withInclude(r, include))
    ),
    create: jest.fn(async ({ data }: Row) => {
      const created = { id: nextId(prefix), createdAt: new Date(), updatedAt: new Date(), ...defaults(), ...data };
      collection().push(created);
      return created;
    }),
    update: jest.fn(async ({ where, data, include }: Row) => {
      const found = collection().find(r => matches(r, where));
      if (!found) throw new Error(`${prefix}: record to update not found`);
      return withInclude(apply(found, data), include);
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const found = collection().filter(r => matches(r, where));
      found.forEach(r => apply(r, data));
      return { count: found.length };
    }),
    groupBy: jest.fn(async ({ where }: Row) => {
      const counts = new Map<string, number>();
      for (const r of collection().filter(row => matches(row, where))) counts.set(r.tenantId, (counts.get(r.tenantId) ?? 0) + 1);
      return [...counts.entries()].map(([tenantId, n]) => ({ tenantId, _count: { _all: n } }));
    })
  };
}

const checkoutDefaults = () => ({
  checkoutUrl: null,
  providerToken: null,
  providerTransactionId: null,
  providerServiceName: null,
  providerFees: null,
  status: 'PENDING',
  lastProviderState: null,
  lastProviderPayload: null,
  lastCheckedAt: null,
  checkAttempts: 0,
  failureMessage: null,
  reviewReason: null,
  simulatedOutcome: null,
  createdByUserId: null,
  completedAt: null
});

const mockPrisma: Row = {
  tenant: delegate(() => store.tenants, 'tenant'),
  user: delegate(() => store.users, 'user'),
  invoice: delegate(() => store.invoices, 'invoice'),
  platformInvoicePayment: delegate(() => store.payments, 'pay'),
  platformPaymentCheckout: delegate(() => store.checkouts, 'checkout', checkoutDefaults),
  subscription: delegate(() => store.subscriptions, 'sub'),
  subscriptionItem: delegate(() => store.items, 'item'),
  catalogItem: delegate(() => store.catalog, 'cat'),
  subscriptionExtensionRequest: delegate(() => store.requests, 'req', () => ({
    status: 'OPEN',
    handledAt: null,
    handledByUserId: null,
    handledNote: null
  })),
  capacityOverride: delegate(() => store.overrides, 'ovr'),
  tenantModule: delegate(() => store.modules, 'mod'),
  lotActivation: delegate(() => store.lots, 'lot'),
  syndicate: delegate(() => store.syndicates, 'synd'),
  constructionSite: delegate(() => store.sites, 'site'),
  $queryRaw: jest.fn(async () => []),
  $transaction: jest.fn(async (arg: unknown) => {
    if (typeof arg === 'function') return (arg as (tx: Row) => Promise<unknown>)(mockPrisma);
    return Promise.all(arg as Promise<unknown>[]);
  })
};

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy({}, { get: (_t, prop) => (mockPrisma as any)[prop] })
}));

jest.mock('../../src/services/subscription-v2-service', () => ({
  applyDueItemTransitionsTx: jest.fn(async () => ({ ended: 0, started: 0 })),
  invalidateEntitlements: jest.fn(),
  toCatalogEntry: (row: Row) => ({
    id: row.id,
    code: row.code,
    kind: row.kind,
    name: row.name,
    description: null,
    monthlyPrice: Number(row.monthlyPrice),
    setupPrice: 0,
    modules: row.modules ?? [],
    exclusiveGroup: row.exclusiveGroup ?? null,
    rules: null,
    isSellable: true,
    sortOrder: 0,
    capacities: Object.fromEntries((row.capacities ?? []).map((c: Row) => [c.capacityKey, c.amount]))
  })
}));

jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));

const sendEmail = jest.fn(async () => undefined);
jest.mock('../../src/services/email-service', () => ({ emailService: { sendEmail: (...args: unknown[]) => sendEmail(...(args as [])) } }));

import {
  startInvoiceCheckout,
  reconcilePlatformCheckout,
  reconcilePlatformCheckoutPublic,
  recordManualPayment,
  getInvoiceCheckoutForTenant,
  applyPlatformProviderStatus
} from '../../src/services/platform-payment-service';
import {
  updateSubscriptionItem,
  createExtensionRequest,
  listExtensionRequests,
  listSubscriptionSummaries
} from '../../src/services/subscription-admin-extras-service';
import { paysecurehubPlatformIpnHandler } from '../../src/controllers/payment-gateway-public-controller';
import { isPlatformCodePaiement } from '../../src/lib/payment-gateway/codes';
import { AppError, NotFoundError } from '../../src/middleware/error-middleware';
import * as v2 from '../../src/services/subscription-v2-service';
import * as audit from '../../src/services/audit-service';

const applyDue = v2.applyDueItemTransitionsTx as jest.Mock;
const logAuditEvent = audit.logAuditEvent as jest.Mock;

const PERIOD_END = new Date('2026-09-01T00:00:00.000Z');
const NEXT_END = new Date('2026-10-01T00:00:00.000Z');

function reset() {
  store.tenants = [
    { id: TENANT_A, name: 'Agence A', status: 'ACTIVE', contactEmail: 'a@a.ci', contactPhone: '0102' },
    { id: TENANT_B, name: 'Agence B', status: 'ACTIVE', contactEmail: 'b@b.ci', contactPhone: '0304' }
  ];
  store.users = [
    { id: 'user-a', fullName: 'Awa Koné', email: 'awa@a.ci', globalRole: 'USER', isActive: true },
    { id: 'admin-1', fullName: 'Super Admin', email: 'root@immotopia.app', globalRole: 'SUPER_ADMIN', isActive: true }
  ];
  store.subscriptions = [
    {
      id: 'sub-a',
      tenantId: TENANT_A,
      status: 'PAST_DUE',
      billingCycle: 'MONTHLY',
      currentPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
      currentPeriodEnd: PERIOD_END,
      trialEndsAt: null,
      pastDueAt: PERIOD_END,
      graceDays: 7,
      quotaPolicy: 'BILL_OVERAGE',
      cancelAt: null,
      canceledAt: null
    }
  ];
  store.invoices = [
    {
      id: 'inv-a',
      tenantId: TENANT_A,
      subscriptionId: 'sub-a',
      invoiceNumber: 'IMT-2026-00001',
      kind: 'PLATFORM',
      status: 'ISSUED',
      currency: 'FCFA',
      amountTotal: '35282.00',
      periodStart: PERIOD_END,
      periodEnd: NEXT_END,
      paidAt: null
    },
    {
      id: 'inv-b',
      tenantId: TENANT_B,
      subscriptionId: null,
      invoiceNumber: 'IMT-2026-00002',
      kind: 'PLATFORM',
      status: 'ISSUED',
      currency: 'FCFA',
      amountTotal: '10000.00',
      periodStart: null,
      periodEnd: null,
      paidAt: null
    }
  ];
  store.payments = [];
  store.checkouts = [];
  store.items = [];
  store.catalog = [];
  store.requests = [];
  store.overrides = [];
  store.modules = [];
  store.lots = [];
  store.syndicates = [];
  store.sites = [];
  store.seq = 0;
  applyDue.mockClear();
  logAuditEvent.mockClear();
  sendEmail.mockClear();
}

beforeEach(reset);

async function payThroughSimulator(outcome: 'SUCCESS' | 'FAILED' | 'CANCELED' = 'SUCCESS') {
  const checkout = await startInvoiceCheckout(TENANT_A, 'inv-a', 'user-a');
  store.checkouts.find(c => c.id === checkout.id)!.simulatedOutcome = outcome;
  const row = await reconcilePlatformCheckout(TENANT_A, checkout.id);
  return { checkout, row };
}

describe("Paiement en ligne d'une facture d'abonnement (compte ImmoTopia)", () => {
  it('201 : crée un checkout simulateur « IMP- » sur la page du simulateur', async () => {
    const checkout = await startInvoiceCheckout(TENANT_A, 'inv-a', 'user-a');
    expect(isPlatformCodePaiement(checkout.codePaiement)).toBe(true);
    expect(checkout.status).toBe('PENDING');
    expect(checkout.mode).toBe('SIMULATOR');
    expect(checkout.amount).toBe(35282);
    expect(checkout.checkoutUrl).toContain(`/api/payment-gateway/simulator/${checkout.codePaiement}`);
  });

  it('409 avec reprise quand un paiement est déjà en cours pour la facture', async () => {
    const first = await startInvoiceCheckout(TENANT_A, 'inv-a', 'user-a');
    await expect(startInvoiceCheckout(TENANT_A, 'inv-a', 'user-a')).rejects.toMatchObject({
      statusCode: 409,
      data: { codePaiement: first.codePaiement, checkoutUrl: first.checkoutUrl }
    });
  });

  it("refuse une facture d'une autre agence comme une facture inexistante (404)", async () => {
    await expect(startInvoiceCheckout(TENANT_A, 'inv-b', 'user-a')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('400 sur un avoir ou une facture sans montant à régler', async () => {
    store.invoices[0].billingNature = 'CREDIT_NOTE';
    await expect(startInvoiceCheckout(TENANT_A, 'inv-a', 'user-a')).rejects.toMatchObject({ statusCode: 400 });
    store.invoices[0].billingNature = 'PERIOD';
    store.invoices[0].amountTotal = '0.00';
    await expect(startInvoiceCheckout(TENANT_A, 'inv-a', 'user-a')).rejects.toMatchObject({ statusCode: 400 });
    expect(store.checkouts).toHaveLength(0);
  });

  it('409 sur une facture déjà réglée', async () => {
    store.invoices[0].status = 'PAID';
    await expect(startInvoiceCheckout(TENANT_A, 'inv-a', 'user-a')).rejects.toMatchObject({ statusCode: 409 });
  });

  it("succès : facture PAYÉE, règlement ONLINE, sortie de PAST_DUE et période avancée", async () => {
    const { row } = await payThroughSimulator('SUCCESS');
    expect(row.status).toBe('SUCCESS');
    expect(store.invoices[0].status).toBe('PAID');
    expect(store.invoices[0].paymentMethod).toBe('ONLINE');
    expect(store.payments).toHaveLength(1);
    expect(store.payments[0]).toMatchObject({ method: 'ONLINE', invoiceId: 'inv-a', checkoutId: row.id });
    const sub = store.subscriptions[0];
    expect(sub.status).toBe('ACTIVE');
    expect(sub.pastDueAt).toBeNull();
    expect(sub.currentPeriodStart).toEqual(PERIOD_END);
    expect(sub.currentPeriodEnd).toEqual(NEXT_END);
    expect(applyDue).toHaveBeenCalledTimes(1);
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ actionKey: 'INVOICE_MARKED_PAID', entityId: 'inv-a' }));
  });

  it("IPN rejouée : idempotente, aucun second règlement", async () => {
    const { checkout } = await payThroughSimulator('SUCCESS');
    await reconcilePlatformCheckoutPublic(checkout.codePaiement);
    await reconcilePlatformCheckoutPublic(checkout.codePaiement);
    expect(store.payments).toHaveLength(1);
    expect(applyDue).toHaveBeenCalledTimes(1);
  });

  it('facture payée jamais défaite : un état contraire ultérieur met le checkout en REVIEW', async () => {
    const { checkout } = await payThroughSimulator('SUCCESS');
    store.checkouts.find(c => c.id === checkout.id)!.simulatedOutcome = 'FAILED';
    const row = await reconcilePlatformCheckout(TENANT_A, checkout.id);
    expect(row.status).toBe('REVIEW');
    expect(store.invoices[0].status).toBe('PAID');
    expect(store.payments).toHaveLength(1);
    expect(store.subscriptions[0].status).toBe('ACTIVE');
  });

  it('échec : facture toujours due, abonnement toujours PAST_DUE', async () => {
    const { row } = await payThroughSimulator('FAILED');
    expect(row.status).toBe('FAILED');
    expect(store.invoices[0].status).toBe('ISSUED');
    expect(store.subscriptions[0].status).toBe('PAST_DUE');
  });

  it('montant divergent : REVIEW, facture non réglée', async () => {
    const checkout = await startInvoiceCheckout(TENANT_A, 'inv-a', 'user-a');
    const row = store.checkouts.find(c => c.id === checkout.id)!;
    const result = await applyPlatformProviderStatus(row as any, {
      rawState: 'SUCCESSFUL',
      mappedState: 'SUCCESS',
      transactionId: 'T1',
      amount: 100,
      fees: 0,
      serviceName: 'Wave',
      error: null,
      raw: {}
    });
    expect(result.status).toBe('REVIEW');
    expect(store.invoices[0].status).toBe('ISSUED');
  });

  it('double encaissement : facture déjà réglée à la main, le succès en ligne passe en REVIEW', async () => {
    const checkout = await startInvoiceCheckout(TENANT_A, 'inv-a', 'user-a');
    await recordManualPayment(TENANT_A, 'inv-a', { method: 'CASH', paidAt: new Date('2026-09-02') }, 'admin-1');
    store.checkouts.find(c => c.id === checkout.id)!.simulatedOutcome = 'SUCCESS';
    const row = await reconcilePlatformCheckout(TENANT_A, checkout.id);
    expect(row.status).toBe('REVIEW');
    expect(store.payments).toHaveLength(1);
    expect(store.payments[0].method).toBe('CASH');
  });

  it("isolation : l'agence B ne lit ni ne rapproche le checkout de l'agence A", async () => {
    const checkout = await startInvoiceCheckout(TENANT_A, 'inv-a', 'user-a');
    await expect(getInvoiceCheckoutForTenant(TENANT_B, checkout.codePaiement)).rejects.toBeInstanceOf(NotFoundError);
    await expect(reconcilePlatformCheckout(TENANT_B, checkout.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("IPN du compte ImmoTopia", () => {
  function fakeRes() {
    const res: Partial<Response> & { statusCode?: number; body?: unknown } = {};
    res.status = jest.fn((code: number) => {
      res.statusCode = code;
      return res as Response;
    }) as any;
    res.json = jest.fn((body: unknown) => {
      res.body = body;
      return res as Response;
    }) as any;
    return res;
  }

  async function call(body: unknown) {
    const res = fakeRes();
    await new Promise<void>((resolve, reject) => {
      paysecurehubPlatformIpnHandler({ body } as Request, res as Response, (err?: unknown) => (err ? reject(err) : resolve()));
      setTimeout(resolve, 50);
    });
    return res;
  }

  it('répond 200 pour un code inconnu ou un code de loyer, sans rien rapprocher', async () => {
    expect((await call({ codePaiement: 'IMP-inconnu' })).statusCode).toBe(200);
    expect((await call({ codePaiement: 'IMT-loyer' })).statusCode).toBe(200);
    expect((await call({})).statusCode).toBe(200);
    expect(store.payments).toHaveLength(0);
  });

  it("relance le rapprochement (jamais le corps cru) : l'état vient du simulateur", async () => {
    const checkout = await startInvoiceCheckout(TENANT_A, 'inv-a', 'user-a');
    // Le corps prétend un succès ; tant que le simulateur n'a rien, rien ne change.
    await call({ code_paiement: checkout.codePaiement, state: 'SUCCESSFUL' });
    expect(store.invoices[0].status).toBe('ISSUED');
    store.checkouts[0].simulatedOutcome = 'SUCCESS';
    await call({ codePaiement: checkout.codePaiement });
    expect(store.invoices[0].status).toBe('PAID');
  });
});

describe('Constat manuel du super-admin', () => {
  it('règle la facture, trace le mode et sort de PAST_DUE', async () => {
    const result = await recordManualPayment(
      TENANT_A,
      'inv-a',
      { method: 'BANK_TRANSFER', paidAt: new Date('2026-09-03T10:00:00Z'), reference: 'VIR-42', note: 'Reçu SGBCI' },
      'admin-1'
    );
    expect(result.subscription).toBe('RENEWED');
    expect(result.payment).toMatchObject({ method: 'BANK_TRANSFER', reference: 'VIR-42', amount: 35282, hasProof: false });
    expect(store.invoices[0]).toMatchObject({ status: 'PAID', paymentMethod: 'BANK_TRANSFER', paymentReference: 'VIR-42' });
    expect(store.subscriptions[0].status).toBe('ACTIVE');
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: 'admin-1', actionKey: 'INVOICE_MARKED_PAID', payload: expect.objectContaining({ source: 'MANUAL' }) })
    );
  });

  it('409 si la facture est déjà réglée', async () => {
    await recordManualPayment(TENANT_A, 'inv-a', { method: 'CASH', paidAt: new Date('2026-09-02') }, 'admin-1');
    await expect(
      recordManualPayment(TENANT_A, 'inv-a', { method: 'CHECK', paidAt: new Date('2026-09-02') }, 'admin-1')
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("404 pour la facture d'une autre agence", async () => {
    await expect(
      recordManualPayment(TENANT_A, 'inv-b', { method: 'CASH', paidAt: new Date('2026-09-02') }, 'admin-1')
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('400 pour une date future ou un mode ONLINE', async () => {
    await expect(
      recordManualPayment(TENANT_A, 'inv-a', { method: 'CASH', paidAt: new Date(Date.now() + 5 * 86400000) }, 'admin-1')
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      recordManualPayment(TENANT_A, 'inv-a', { method: 'ONLINE' as any, paidAt: new Date('2026-09-02') }, 'admin-1')
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("une facture hors échéance réglée ne touche pas à l'abonnement", async () => {
    store.invoices[0].periodStart = new Date('2026-12-01T00:00:00Z');
    const result = await recordManualPayment(TENANT_A, 'inv-a', { method: 'CASH', paidAt: new Date('2026-09-02') }, 'admin-1');
    expect(result.subscription).toBe('NONE');
    expect(store.subscriptions[0].status).toBe('PAST_DUE');
  });
});

describe('Routes manquantes de la vague 2', () => {
  beforeEach(() => {
    store.catalog = [
      {
        id: 'cat-agence',
        code: 'AGENCE',
        kind: 'PACK',
        name: 'Pack Agence',
        monthlyPrice: '29900',
        modules: ['MODULE_AGENCY'],
        isSellable: true,
        capacities: [{ capacityKey: 'LOTS', amount: 100 }]
      }
    ];
    store.items = [
      {
        id: 'item-a',
        tenantId: TENANT_A,
        subscriptionId: 'sub-a',
        catalogItemId: 'cat-agence',
        quantity: 1,
        unitMonthlyPrice: '29900',
        unitSetupPrice: '0',
        discountPercent: '0',
        status: 'ACTIVE',
        startsAt: new Date('2026-01-01'),
        endsAt: null,
        endReason: null,
        replacesItemId: null,
        parentItemId: null,
        billedThrough: null,
        note: null
      }
    ];
  });

  it("PATCH d'un élément : remise modifiée en une écriture auditée", async () => {
    const item = await updateSubscriptionItem(TENANT_A, 'item-a', { discountPercent: 15, reason: 'Geste commercial' }, 'admin-1');
    expect(item.discountPercent).toBe(15);
    expect(item.unitMonthlyPrice).toBe(29900);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actionKey: 'SUBSCRIPTION_ITEM_UPDATED',
        payload: expect.objectContaining({ before: expect.objectContaining({ discountPercent: 0 }), after: expect.objectContaining({ discountPercent: 15 }) })
      })
    );
  });

  it("PATCH : 404 pour l'élément d'une autre agence, 400 sur un élément terminé", async () => {
    await expect(updateSubscriptionItem(TENANT_B, 'item-a', { discountPercent: 5 }, 'admin-1')).rejects.toBeInstanceOf(NotFoundError);
    store.items[0].status = 'ENDED';
    await expect(updateSubscriptionItem(TENANT_A, 'item-a', { discountPercent: 5 }, 'admin-1')).rejects.toMatchObject({ statusCode: 400 });
  });

  it("demande d'extension : tracée, auditée, e-mail aux super-admins, visible de l'agence seule", async () => {
    const request = await createExtensionRequest(TENANT_A, { catalogCode: 'AGENCE', quantity: 1, message: 'Il nous faut 50 lots' }, 'user-a');
    expect(request).toMatchObject({ status: 'OPEN', catalogName: 'Pack Agence', requestedByName: 'Awa Koné' });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'root@immotopia.app' }));
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ actionKey: 'SUBSCRIPTION_EXTENSION_REQUESTED' }));
    expect(await listExtensionRequests(TENANT_A)).toHaveLength(1);
    expect(await listExtensionRequests(TENANT_B)).toHaveLength(0);
  });

  it('résumé des agences : packs, % de lots et échéance en une série de requêtes groupées', async () => {
    store.lots = Array.from({ length: 85 }, (_, i) => ({ id: `l${i}`, tenantId: TENANT_A, deactivatedAt: null }));
    const summaries = await listSubscriptionSummaries([TENANT_A, TENANT_B]);
    expect(summaries[TENANT_A]).toMatchObject({
      packs: ['AGENCE'],
      lotsUsagePercent: 85,
      nearLimit: true,
      capacities: { LOTS: { limit: 100, used: 85 } }
    });
    expect(summaries[TENANT_B]).toMatchObject({ packs: [], status: 'NONE', lotsUsagePercent: null });
    expect(mockPrisma.subscription.findMany).toHaveBeenCalledTimes(1);
  });
});

// AppError importé pour typer les rejets 409/502 en lecture.
void AppError;
