/**
 * Lot C5 (spec 039) — `startCheckoutForInstallments` et `checkoutReturnUrl`.
 *
 * Prisma est remplacé par un magasin en mémoire (même esprit que
 * `payment-gateway.test.ts`). Le client d'agrégateur est mocké : l'URL de
 * paiement ne peut venir que de lui. Le service des paiements est simulé.
 */

type Row = Record<string, any>;

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

const store = {
  configs: [] as Row[],
  checkouts: [] as Row[],
  payments: [] as Row[],
  installments: [] as Row[],
  treasuryAccounts: [] as Row[],
  tenantClients: [] as Row[],
  crmContacts: [] as Row[],
  seq: 0
};

function resetStore() {
  store.configs = [];
  store.checkouts = [];
  store.payments = [];
  store.installments = [];
  store.treasuryAccounts = [];
  store.tenantClients = [];
  store.crmContacts = [];
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
      if ('equals' in condition) return String(value).toLowerCase() === String(condition.equals).toLowerCase();
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

const executeRaw = jest.fn(async () => 1);
let inTransaction = false;
const configReadsInTx: boolean[] = [];
const readOrder: string[] = [];

const mockPrisma: Row = {
  paymentGatewayConfig: {
    findUnique: jest.fn(async ({ where }: Row) => {
      configReadsInTx.push(inTransaction);
      return store.configs.find(c => c.tenantId === where.tenantId) ?? null;
    })
  },
  onlinePaymentCheckout: delegate(
    () => store.checkouts,
    'checkout',
    () => ({ checkoutUrl: null, providerToken: null, status: 'PENDING', failureMessage: null, completedAt: null })
  ),
  rentalPayment: delegate(() => store.payments, 'payment'),
  rentalInstallment: delegate(() => store.installments, 'installment'),
  treasuryAccount: delegate(() => store.treasuryAccounts, 'treasury'),
  tenantClient: delegate(() => store.tenantClients, 'client'),
  crmContact: delegate(() => store.crmContacts, 'contact'),
  $executeRaw: (...args: unknown[]) => (executeRaw as any)(...args),
  $transaction: jest.fn(async (arg: unknown) => {
    if (typeof arg === 'function') {
      inTransaction = true;
      try {
        return await (arg as (tx: Row) => Promise<unknown>)(mockPrisma);
      } finally {
        inTransaction = false;
      }
    }
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

// Le client d'agrégateur : seule source de `checkoutUrl`, appelée selon le mode de la config.
const buildAway = jest.fn();
const gatewayClientForMode = jest.fn();
jest.mock('../../src/lib/payment-gateway/paysecurehub', () => ({
  gatewayClientForMode: (...args: unknown[]) => gatewayClientForMode(...args)
}));

import { AppError } from '../../src/middleware/error-middleware';
import { env } from '../../src/config/env';
import {
  checkoutReturnUrl,
  normalizeProviderCheckoutUrl,
  resteDuEcheance,
  startCheckout,
  startCheckoutForInstallments
} from '../../src/lib/payment-gateway/checkout';

const PROVIDER_URL = 'https://pay.provider.example/hosted/abc123';

function seedAgency(tenantId: string, overrides: Row = {}) {
  store.configs.push({
    id: nextId('config'),
    tenantId,
    provider: 'PAYSECUREHUB',
    mode: 'SIMULATOR',
    isActive: true,
    merchantId: null,
    apiKeyEncrypted: null,
    treasuryAccountId: null,
    ...overrides
  });
}

function seedInstallment(tenantId: string, leaseId: string, overrides: Row = {}): Row {
  const installment = {
    id: nextId('installment'),
    tenant_id: tenantId,
    lease_id: leaseId,
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

function params(installmentId: string, overrides: Row = {}) {
  return {
    tenantId: TENANT_A,
    leaseId: 'lease-a',
    renterClientId: 'client-a',
    installmentIds: [installmentId],
    actorUserId: 'user-a',
    secureLinkId: 'link-1',
    ...overrides
  } as Parameters<typeof startCheckoutForInstallments>[0];
}

beforeEach(() => {
  resetStore();
  jest.clearAllMocks();
  configReadsInTx.length = 0;
  readOrder.length = 0;
  inTransaction = false;
  buildAway.mockResolvedValue({ url: PROVIDER_URL, tokens: 'tok', code: '00', message: 'ok' });
  gatewayClientForMode.mockReturnValue({ buildAway, getStatus: jest.fn() });
});

describe('startCheckoutForInstallments (lien de paiement)', () => {
  it('crée paiement + checkout rattaché au lien ; montant recalculé côté serveur, URL du fournisseur', async () => {
    seedAgency(TENANT_A);
    const inst = seedInstallment(TENANT_A, 'lease-a', { penalty_amount: 5000, amount_paid: 60000 });

    const { checkout, reused } = await startCheckoutForInstallments(params(inst.id));

    expect(reused).toBe(false);
    // 150000 + 10000 + 5000 - 60000 : jamais un montant fourni par l'appelant.
    expect(checkout.amount).toBe(105000);
    expect(buildAway.mock.calls[0][1]).toMatchObject({ montant: 105000, libelleArticle: 'Loyer' });
    expect(checkout.checkoutUrl).toBe(PROVIDER_URL);
    expect(store.checkouts[0]).toMatchObject({
      secureLinkId: 'link-1',
      createdByUserId: 'user-a',
      installmentIds: [inst.id],
      renterClientId: 'client-a'
    });
    expect(store.payments).toHaveLength(1);
    expect(store.payments[0]).toMatchObject({ status: 'PENDING', created_by_user_id: 'user-a' });
  });

  it('prend le verrou consultatif en paramétré (jamais en SQL brut concaténé)', async () => {
    seedAgency(TENANT_A);
    const inst = seedInstallment(TENANT_A, 'lease-a');
    await startCheckoutForInstallments(params(inst.id));

    expect(executeRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = executeRaw.mock.calls[0] as unknown as [string[], ...unknown[]];
    expect(strings.join('?')).toContain('pg_advisory_xact_lock');
    expect(values[0]).toContain(TENANT_A);
    expect(values[0]).toContain(inst.id);
  });

  it("l'URL de retour du lien est la page publique de statut, jamais le jeton", async () => {
    seedAgency(TENANT_A);
    const inst = seedInstallment(TENANT_A, 'lease-a');
    const { checkout } = await startCheckoutForInstallments(params(inst.id));

    const urlRetour: string = buildAway.mock.calls[0][1].urlRetour;
    expect(urlRetour).toBe(`${env.FRONTEND_URL.replace(/\/$/, '')}/payer/statut?paiement=${checkout.codePaiement}`);
    expect(urlRetour).not.toContain('#');
  });

  it('double ouverture : un seul checkout, le second appel reprend le même checkoutUrl (reused)', async () => {
    seedAgency(TENANT_A);
    const inst = seedInstallment(TENANT_A, 'lease-a');

    const first = await startCheckoutForInstallments(params(inst.id));
    const second = await startCheckoutForInstallments(params(inst.id));

    expect(second.reused).toBe(true);
    expect(second.checkout.id).toBe(first.checkout.id);
    expect(second.checkout.checkoutUrl).toBe(first.checkout.checkoutUrl);
    expect(store.checkouts).toHaveLength(1);
    expect(store.payments).toHaveLength(1);
    expect(buildAway).toHaveBeenCalledTimes(1);
  });

  it('checkout PENDING du même ensemble mais avec un autre montant : 409', async () => {
    seedAgency(TENANT_A);
    const inst = seedInstallment(TENANT_A, 'lease-a');
    await startCheckoutForInstallments(params(inst.id));
    // Une pénalité tombe entre-temps : le reste dû change.
    inst.penalty_amount = 8000;

    const attempt = startCheckoutForInstallments(params(inst.id));
    await expect(attempt).rejects.toBeInstanceOf(AppError);
    await expect(attempt).rejects.toMatchObject({
      statusCode: 409,
      message: 'Un paiement en ligne est déjà en cours pour cette échéance.'
    });
    expect(store.checkouts).toHaveLength(1);
  });

  it('checkout PENDING chevauchant d’autres échéances (portail) : 409', async () => {
    seedAgency(TENANT_A);
    const inst = seedInstallment(TENANT_A, 'lease-a');
    const other = seedInstallment(TENANT_A, 'lease-a');
    store.checkouts.push({
      id: nextId('checkout'),
      tenantId: TENANT_A,
      leaseId: 'lease-a',
      status: 'PENDING',
      createdAt: new Date(),
      installmentIds: [inst.id, other.id],
      amount: 320000,
      checkoutUrl: 'https://x.example/p',
      codePaiement: 'IMT-existing'
    });

    await expect(startCheckoutForInstallments(params(inst.id))).rejects.toMatchObject({ statusCode: 409 });
    expect(store.payments).toHaveLength(0);
  });

  it('un checkout PENDING de plus de 15 minutes ne bloque ni ne se reprend plus', async () => {
    seedAgency(TENANT_A);
    const inst = seedInstallment(TENANT_A, 'lease-a');
    await startCheckoutForInstallments(params(inst.id));
    store.checkouts[0].createdAt = new Date(Date.now() - 16 * 60 * 1000);

    const again = await startCheckoutForInstallments(params(inst.id));
    expect(again.reused).toBe(false);
    expect(store.checkouts).toHaveLength(2);
  });

  it('échéance d’un autre tenant ou d’un autre bail : 400, rien créé', async () => {
    seedAgency(TENANT_A);
    const foreignTenant = seedInstallment(TENANT_B, 'lease-b');
    const foreignLease = seedInstallment(TENANT_A, 'lease-other');

    await expect(startCheckoutForInstallments(params(foreignTenant.id))).rejects.toMatchObject({ statusCode: 400 });
    await expect(startCheckoutForInstallments(params(foreignLease.id))).rejects.toMatchObject({ statusCode: 400 });
    expect(store.payments).toHaveLength(0);
    expect(buildAway).not.toHaveBeenCalled();
  });

  it('refuse (400) une échéance annulée ou soldée, et une config inutilisable', async () => {
    seedAgency(TENANT_A);
    const canceled = seedInstallment(TENANT_A, 'lease-a', { status: 'CANCELED' });
    const paid = seedInstallment(TENANT_A, 'lease-a', { amount_paid: 160000 });
    await expect(startCheckoutForInstallments(params(canceled.id))).rejects.toMatchObject({ statusCode: 400 });
    await expect(startCheckoutForInstallments(params(paid.id))).rejects.toMatchObject({ statusCode: 400 });

    store.configs[0].isActive = false;
    const ok = seedInstallment(TENANT_A, 'lease-a');
    await expect(startCheckoutForInstallments(params(ok.id))).rejects.toMatchObject({ statusCode: 400 });
    expect(store.payments).toHaveLength(0);
  });

  it('mode : seul gatewayClientForMode(config.mode) fournit le client', async () => {
    seedAgency(TENANT_A, { mode: 'LIVE', merchantId: 'm-1', apiKeyEncrypted: 'enc' });
    const inst = seedInstallment(TENANT_A, 'lease-a');
    // Le mode LIVE exige un déchiffrement : on laisse credentialsFrom échouer proprement (502), sans appel réel.
    await expect(startCheckoutForInstallments(params(inst.id))).rejects.toBeInstanceOf(AppError);
    expect(gatewayClientForMode).toHaveBeenCalledWith('LIVE');
    expect(gatewayClientForMode).not.toHaveBeenCalledWith('SIMULATOR');
    expect(buildAway).not.toHaveBeenCalled();

    resetStore();
    seedAgency(TENANT_A, { mode: 'SIMULATOR' });
    const sim = seedInstallment(TENANT_A, 'lease-a');
    await startCheckoutForInstallments(params(sim.id));
    expect(gatewayClientForMode).toHaveBeenLastCalledWith('SIMULATOR');
  });

  it('agrégateur en erreur : 502, paiement et checkout FAILED, un nouvel essai crée un nouveau checkout', async () => {
    seedAgency(TENANT_A);
    const inst = seedInstallment(TENANT_A, 'lease-a');
    buildAway.mockRejectedValueOnce(new Error('réseau'));

    await expect(startCheckoutForInstallments(params(inst.id))).rejects.toMatchObject({ statusCode: 502 });
    expect(store.payments[0].status).toBe('FAILED');
    expect(store.checkouts[0].status).toBe('FAILED');

    const retry = await startCheckoutForInstallments(params(inst.id));
    expect(retry.reused).toBe(false);
    expect(retry.checkout.checkoutUrl).toBe(PROVIDER_URL);
  });
});

describe('startCheckoutForInstallments — REVIEW et relecture sous verrou', () => {
  it('un checkout REVIEW (même ancien) bloque un nouveau démarrage : 409, jamais une reprise', async () => {
    seedAgency(TENANT_A);
    const inst = seedInstallment(TENANT_A, 'lease-a');
    store.checkouts.push({
      id: nextId('checkout'),
      tenantId: TENANT_A,
      leaseId: 'lease-a',
      status: 'REVIEW',
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      installmentIds: [inst.id],
      amount: 160000,
      checkoutUrl: 'https://pay.provider.example/review',
      codePaiement: 'IMT-review'
    });

    await expect(startCheckoutForInstallments(params(inst.id))).rejects.toMatchObject({
      statusCode: 409,
      message: "Votre paiement est en cours de vérification par l'agence. Contactez votre agence."
    });
    expect(store.payments).toHaveLength(0);
    expect(buildAway).not.toHaveBeenCalled();
  });

  it('le reste dû est relu SOUS le verrou : un paiement confirmé entre-temps => 400, rien créé', async () => {
    seedAgency(TENANT_A);
    const inst = seedInstallment(TENANT_A, 'lease-a');
    // Pendant l'attente du verrou, un autre paiement solde l'échéance.
    executeRaw.mockImplementationOnce(async () => {
      inst.amount_paid = 160000;
      return 1;
    });

    await expect(startCheckoutForInstallments(params(inst.id))).rejects.toMatchObject({ statusCode: 400 });
    expect(store.payments).toHaveLength(0);
    expect(store.checkouts).toHaveLength(0);
    expect(buildAway).not.toHaveBeenCalled();
  });

  it('le montant du checkout est celui relu sous le verrou', async () => {
    seedAgency(TENANT_A);
    const inst = seedInstallment(TENANT_A, 'lease-a');
    executeRaw.mockImplementationOnce(async () => {
      inst.penalty_amount = 7000;
      return 1;
    });

    const { checkout, mode } = await startCheckoutForInstallments(params(inst.id));

    expect(checkout.amount).toBe(167000);
    expect(mode).toBe('SIMULATOR');
  });
});

describe('startCheckoutForInstallments — transaction, ordre, reprise, URL', () => {
  it('la configuration est chargée AVANT la transaction (aucune requête hors tx dans la transaction)', async () => {
    seedAgency(TENANT_A);
    const inst = seedInstallment(TENANT_A, 'lease-a');

    await startCheckoutForInstallments(params(inst.id));

    expect(configReadsInTx.length).toBeGreaterThan(0);
    expect(configReadsInTx.every(inside => inside === false)).toBe(true);
  });

  it('sous verrou : les checkouts chevauchants sont lus AVANT les échéances', async () => {
    seedAgency(TENANT_A);
    const inst = seedInstallment(TENANT_A, 'lease-a');
    const checkoutsRead = mockPrisma.onlinePaymentCheckout.findMany as jest.Mock;
    const installmentsRead = mockPrisma.rentalInstallment.findMany as jest.Mock;
    checkoutsRead.mockImplementationOnce(async () => {
      readOrder.push('checkouts');
      return [];
    });
    installmentsRead.mockImplementationOnce(async () => {
      readOrder.push('installments');
      return [inst];
    });

    await startCheckoutForInstallments(params(inst.id));

    expect(readOrder).toEqual(['checkouts', 'installments']);
  });

  it('un PENDING exact mais du portail (sans lien) ou d’un autre mode n’est pas repris : 409', async () => {
    seedAgency(TENANT_A);
    const inst = seedInstallment(TENANT_A, 'lease-a');
    const exact = {
      tenantId: TENANT_A,
      leaseId: 'lease-a',
      status: 'PENDING',
      createdAt: new Date(),
      installmentIds: [inst.id],
      amount: 160000,
      checkoutUrl: 'https://pay.provider.example/existing',
      codePaiement: 'IMT-existing'
    };

    store.checkouts.push({ id: nextId('checkout'), ...exact, mode: 'SIMULATOR', secureLinkId: null });
    await expect(startCheckoutForInstallments(params(inst.id))).rejects.toMatchObject({ statusCode: 409 });

    store.checkouts.length = 0;
    store.checkouts.push({ id: nextId('checkout'), ...exact, mode: 'LIVE', secureLinkId: 'link-1' });
    await expect(startCheckoutForInstallments(params(inst.id))).rejects.toMatchObject({ statusCode: 409 });
    expect(store.payments).toHaveLength(0);
  });

  it('URL refusée (http distant, identifiants, espaces) : jamais stockée, FAILED + 502, sans l’URL dans le journal', async () => {
    for (const badUrl of [
      'http://pay.provider.example/insecure-path',
      'https://user:secret@pay.provider.example/p',
      ' https://pay.provider.example/p'
    ]) {
      resetStore();
      jest.clearAllMocks();
      buildAway.mockResolvedValue({ url: badUrl, tokens: 'tok', code: '00', message: 'ok' });
      gatewayClientForMode.mockReturnValue({ buildAway, getStatus: jest.fn() });
      seedAgency(TENANT_A);
      const inst = seedInstallment(TENANT_A, 'lease-a');

      await expect(startCheckoutForInstallments(params(inst.id))).rejects.toMatchObject({ statusCode: 502 });

      expect(store.checkouts[0].checkoutUrl).toBeNull();
      expect(store.checkouts[0].status).toBe('FAILED');
      expect(store.payments[0].status).toBe('FAILED');
      expect(store.checkouts[0].failureMessage).not.toContain('pay.provider');
    }
  });

  it('URL valide : stockée sous forme normalisée ; le portail n’est soumis à aucune validation', async () => {
    seedAgency(TENANT_A);
    const inst = seedInstallment(TENANT_A, 'lease-a');
    buildAway.mockResolvedValueOnce({ url: 'HTTPS://Pay.Provider.Example', tokens: 'tok', code: '00', message: 'ok' });
    const { checkout } = await startCheckoutForInstallments(params(inst.id));
    expect(checkout.checkoutUrl).toBe('https://pay.provider.example/');

    resetStore();
    seedAgency(TENANT_A);
    const portalInst = seedInstallment(TENANT_A, 'lease-a');
    buildAway.mockResolvedValueOnce({ url: 'http://remote.example/p', tokens: 'tok', code: '00', message: 'ok' });
    const portal = await startCheckout(TENANT_A, 'client-a', 'lease-a', [portalInst.id], 'user-a');
    expect(portal.checkoutUrl).toBe('http://remote.example/p');
  });
});

describe('normalizeProviderCheckoutUrl', () => {
  it('https toujours ; http seulement en simulateur sur l’hôte local ; rien d’autre', () => {
    expect(normalizeProviderCheckoutUrl('https://a.example/p?x=1', 'LIVE')).toBe('https://a.example/p?x=1');
    expect(normalizeProviderCheckoutUrl('http://localhost:8001/p', 'SIMULATOR')).toBe('http://localhost:8001/p');
    expect(normalizeProviderCheckoutUrl('http://127.0.0.1:8001/p', 'SIMULATOR')).toBe('http://127.0.0.1:8001/p');
    expect(normalizeProviderCheckoutUrl('http://[::1]:8001/p', 'SIMULATOR')).toBe('http://[::1]:8001/p');
    expect(normalizeProviderCheckoutUrl('http://localhost:8001/p', 'LIVE')).toBeNull();
    expect(normalizeProviderCheckoutUrl('http://a.example/p', 'SIMULATOR')).toBeNull();
    expect(normalizeProviderCheckoutUrl('https://u:p@a.example/', 'LIVE')).toBeNull();
    expect(normalizeProviderCheckoutUrl('https://u@a.example/', 'LIVE')).toBeNull();
    expect(normalizeProviderCheckoutUrl(' https://a.example/', 'LIVE')).toBeNull();
    expect(normalizeProviderCheckoutUrl('https://a.example/ ', 'LIVE')).toBeNull();
    expect(normalizeProviderCheckoutUrl('javascript:alert(1)', 'LIVE')).toBeNull();
    expect(normalizeProviderCheckoutUrl('', 'LIVE')).toBeNull();
    expect(normalizeProviderCheckoutUrl(null, 'LIVE')).toBeNull();
  });
});

describe('checkoutReturnUrl / resteDuEcheance', () => {
  const base = env.FRONTEND_URL.replace(/\/$/, '');

  it('lien de paiement => /payer/statut ; portail => /tenant/payments', () => {
    expect(checkoutReturnUrl({ secureLinkId: 'link-1', codePaiement: 'IMT-abc' })).toBe(
      `${base}/payer/statut?paiement=IMT-abc`
    );
    expect(checkoutReturnUrl({ secureLinkId: null, codePaiement: 'IMT-abc' })).toBe(
      `${base}/tenant/payments?paiement=IMT-abc`
    );
    expect(checkoutReturnUrl({ codePaiement: 'IMT-abc' })).toBe(`${base}/tenant/payments?paiement=IMT-abc`);
  });

  it('reste dû = total + pénalités - max(affectations réussies, montant payé)', () => {
    const installment = {
      amount_rent: 100000,
      amount_service: 0,
      amount_other_fees: 0,
      penalty_amount: 2000,
      amount_paid: 0,
      payments: [
        { amount: 30000, payment: { status: 'SUCCESS' } },
        { amount: 50000, payment: { status: 'PENDING' } }
      ]
    };
    expect(resteDuEcheance(installment)).toBe(72000);
  });
});
