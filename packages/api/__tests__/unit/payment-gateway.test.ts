/**
 * Lot 7 — paiement en ligne des loyers (PaySecureHub).
 *
 * Contrat : docs/finance/LOT-7-CONTRAT-PAIEMENT-EN-LIGNE.md. Couvre :
 *   - la correspondance des états `payments.state` (§2.2) et du moyen réel ;
 *   - le chiffrement AES-256-GCM des clés API (PAYMENT_SECRETS_KEY) ;
 *   - les paramètres de l'agence (§3.1) : refus, clé jamais renvoyée,
 *     compte de trésorerie d'une autre agence ;
 *   - le démarrage d'un paiement (§3.3) : 201, 400, 409 avec
 *     `data { codePaiement, checkoutUrl }`, 502 ;
 *   - le rapprochement (§2) : succès, montant divergent, échec puis succès,
 *     succès jamais redescendu, idempotence (IPN rejouée), expiration ;
 *   - l'IPN publique : toujours 200, jamais le corps cru sur parole ;
 *   - l'isolation entre agences : aucun checkout d'une agence n'est lisible ni
 *     rapprochable depuis une autre, et le rapprochement public tourne dans le
 *     contexte de l'agence du checkout.
 *
 * Prisma est remplacé par un magasin en mémoire (même esprit que
 * `rental-cross-tenant-references.test.ts`) : aucune base n'est requise. Le
 * service des paiements est simulé : c'est la machine à états du checkout qui
 * est testée ici, pas l'affectation aux échéances (testée ailleurs).
 */

import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';

type Row = Record<string, any>;

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

const store = {
  tenants: [] as Row[],
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
  store.tenants = [
    { id: TENANT_A, status: 'ACTIVE' },
    { id: TENANT_B, status: 'ACTIVE' }
  ];
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

/** Évalue un `where` Prisma simplifié : égalité, in, not, notIn, gte, lte, hasSome, relation tenant. */
function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (condition === undefined) return true;
    if (key === 'tenant') {
      const tenant = store.tenants.find(t => t.id === (row.tenantId ?? row.tenant_id));
      return tenant ? matches(tenant, condition) : false;
    }
    const value = row[key];
    if (condition !== null && typeof condition === 'object' && !(condition instanceof Date)) {
      if ('in' in condition) return condition.in.includes(value);
      if ('notIn' in condition) return !condition.notIn.includes(value);
      if ('not' in condition) return value !== condition.not;
      if ('gte' in condition) return value >= condition.gte;
      if ('lte' in condition) return value <= condition.lte;
      if ('hasSome' in condition) return (value ?? []).some((v: unknown) => condition.hasSome.includes(v));
      if ('equals' in condition) return String(value).toLowerCase() === String(condition.equals).toLowerCase();
      return false;
    }
    return value === condition;
  });
}

/** Applique un `data` Prisma simplifié : `{ increment }` et affectation directe. */
function apply(row: Row, data: Row): Row {
  for (const [key, value] of Object.entries(data)) {
    if (value !== null && typeof value === 'object' && 'increment' in value) {
      row[key] = (row[key] ?? 0) + value.increment;
    } else {
      row[key] = value;
    }
  }
  row.updatedAt = new Date();
  return row;
}

function delegate(collection: () => Row[], prefix: string, defaults: () => Row = () => ({})) {
  return {
    findFirst: jest.fn(async ({ where }: Row = {}) => collection().find(r => matches(r, where)) ?? null),
    findUnique: jest.fn(async ({ where }: Row = {}) => collection().find(r => matches(r, where)) ?? null),
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
      return apply(found, data);
    }),
    updateMany: jest.fn(async ({ where, data }: Row) => {
      const found = collection().filter(r => matches(r, where));
      found.forEach(r => apply(r, data));
      return { count: found.length };
    }),
    upsert: jest.fn(async ({ where, create, update }: Row) => {
      const found = collection().find(r => matches(r, where));
      if (found) return apply(found, update);
      const created = { id: nextId(prefix), createdAt: new Date(), updatedAt: new Date(), ...defaults(), ...create };
      collection().push(created);
      return created;
    })
  };
}

const mockPrisma: Row = {
  paymentGatewayConfig: delegate(
    () => store.configs,
    'config',
    () => ({
      provider: 'PAYSECUREHUB',
      mode: 'SIMULATOR',
      isActive: false,
      merchantId: null,
      apiKeyEncrypted: null,
      apiKeyLast4: null,
      treasuryAccountId: null,
      feesPaidBy: 'CLIENT',
      lastTestAt: null,
      lastTestOk: null,
      lastTestMessage: null
    })
  ),
  onlinePaymentCheckout: delegate(
    () => store.checkouts,
    'checkout',
    () => ({
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
    })
  ),
  rentalPayment: delegate(() => store.payments, 'payment'),
  rentalInstallment: delegate(() => store.installments, 'installment'),
  treasuryAccount: delegate(() => store.treasuryAccounts, 'treasury'),
  tenantClient: delegate(() => store.tenantClients, 'client'),
  crmContact: delegate(() => store.crmContacts, 'contact'),
  $executeRaw: jest.fn(async () => 0),
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

// Le service des paiements (affectation, compte du locataire, grand livre) a
// ses propres tests : ici seule compte la machine à états du checkout, donc
// ce qu'elle demande au service et combien de fois.
jest.mock('../../src/services/rental-payment-service', () => ({
  updatePaymentStatusTx: jest.fn(async (_tx: unknown, tenantId: string, paymentId: string, status: string) => {
    const payment = store.payments.find(p => p.id === paymentId && p.tenant_id === tenantId);
    if (!payment) throw new Error('Paiement introuvable');
    payment.status = status;
    return payment;
  }),
  allocatePaymentTx: jest.fn(async () => ({ allocations: [], totalAllocated: 0 }))
}));

jest.mock('../../src/lib/treasury/accounts', () => ({
  ensureChartAccountTx: jest.fn(async () => 'chart-5525')
}));

import { mapProviderState, operatorFromServiceName } from '../../src/lib/payment-gateway/status-mapping';
import {
  startCheckout,
  reconcileCheckout,
  reconcileCheckoutPublic,
  reconcilePendingCheckouts,
  getCheckoutForPortal,
  getCheckoutForPayment,
  generateCodePaiement,
  findSimulatorCheckout
} from '../../src/lib/payment-gateway/checkout';
import {
  getPaymentGatewaySettings,
  updatePaymentGatewaySettings,
  testPaymentGatewayConnection
} from '../../src/lib/payment-gateway/settings';
import { simulatorClient } from '../../src/lib/payment-gateway/paysecurehub/simulator-client';
import { paySecureHubClient } from '../../src/lib/payment-gateway/paysecurehub/client';
import { paysecurehubIpnHandler } from '../../src/controllers/payment-gateway-public-controller';
import { AppError, NotFoundError } from '../../src/middleware/error-middleware';
import * as tenantContext from '../../src/utils/tenant-context';
import * as rentalPaymentService from '../../src/services/rental-payment-service';

const updatePaymentStatusTx = rentalPaymentService.updatePaymentStatusTx as jest.Mock;
const allocatePaymentTx = rentalPaymentService.allocatePaymentTx as jest.Mock;

// ---------------------------------------------------------------------------
// Jeu de données
// ---------------------------------------------------------------------------

function seedAgency(tenantId: string, overrides: Row = {}) {
  store.configs.push({
    id: nextId('config'),
    tenantId,
    provider: 'PAYSECUREHUB',
    mode: 'SIMULATOR',
    isActive: true,
    merchantId: null,
    apiKeyEncrypted: null,
    apiKeyLast4: null,
    treasuryAccountId: null,
    feesPaidBy: 'CLIENT',
    lastTestAt: null,
    lastTestOk: null,
    lastTestMessage: null,
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

beforeEach(() => {
  resetStore();
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// §2.2 — correspondance des états
// ---------------------------------------------------------------------------

describe('Correspondance payments.state -> statut interne (contrat §2.2)', () => {
  it.each([
    ['SUCCESSFUL', 'SUCCESS'],
    ['success', 'SUCCESS'],
    ['Succes', 'SUCCESS'],
    ['PAID', 'SUCCESS'],
    ['validated', 'SUCCESS'],
    ['FAILED', 'FAILED'],
    ['echec', 'FAILED'],
    ['REJECTED', 'FAILED'],
    ['CANCEL', 'CANCELED'],
    ['canceled', 'CANCELED'],
    ['CANCELLED', 'CANCELED'],
    ['ABANDONED', 'CANCELED'],
    ['PENDING', 'PENDING'],
    ['PENDDING', 'PENDING'],
    ['INITIATED', 'PENDING'],
    ['', 'PENDING'],
    [null, 'PENDING'],
    ['  paid  ', 'SUCCESS']
  ])('%p -> %p', (state, expected) => {
    expect(mapProviderState(state as string | null)).toBe(expected);
  });

  it('toute valeur inconnue reste en attente (et ne lève pas)', () => {
    expect(mapProviderState('QUELQUE_CHOSE_DE_NOUVEAU')).toBe('PENDING');
  });

  it.each([
    ['Wave CI', 'WAVE'],
    ['ORANGE MONEY', 'ORANGE'],
    ['MTN MoMo', 'MTN'],
    ['Moov Money', 'MOOV'],
    ['Visa', 'OTHER'],
    [null, 'OTHER']
  ])('moyen réel %p -> mm_operator %p', (serviceName, expected) => {
    expect(operatorFromServiceName(serviceName as string | null)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// Chiffrement AES-256-GCM
// ---------------------------------------------------------------------------

describe('Chiffrement des clés API (AES-256-GCM, PAYMENT_SECRETS_KEY)', () => {
  const originalKey = process.env.PAYMENT_SECRETS_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.PAYMENT_SECRETS_KEY;
    else process.env.PAYMENT_SECRETS_KEY = originalKey;
  });

  /** Charge un module `crypto.ts` neuf, avec son propre `env`, pour une clé donnée. */
  function loadCrypto(key: string | undefined): typeof import('../../src/lib/payment-gateway/crypto') {
    if (key === undefined) delete process.env.PAYMENT_SECRETS_KEY;
    else process.env.PAYMENT_SECRETS_KEY = key;
    let mod: typeof import('../../src/lib/payment-gateway/crypto') | undefined;
    jest.isolateModules(() => {
      mod = require('../../src/lib/payment-gateway/crypto');
    });
    return mod!;
  }

  it('chiffre puis déchiffre à l’identique, avec un IV neuf à chaque appel', () => {
    const crypto = loadCrypto(randomBytes(32).toString('base64'));
    expect(crypto.isEncryptionAvailable()).toBe(true);

    const first = crypto.encryptSecret('sk_live_ABCDEF123456');
    const second = crypto.encryptSecret('sk_live_ABCDEF123456');

    expect(first).toMatch(/^pg1:[^:]+:[^:]+:[^:]+$/);
    expect(first).not.toContain('sk_live');
    expect(first).not.toBe(second);
    expect(crypto.decryptSecret(first)).toBe('sk_live_ABCDEF123456');
    expect(crypto.decryptSecret(second)).toBe('sk_live_ABCDEF123456');
    expect(crypto.last4('sk_live_ABCDEF123456')).toBe('3456');
  });

  it('refuse une valeur altérée (balise d’authentification) plutôt que de rendre un texte corrompu', () => {
    const crypto = loadCrypto(randomBytes(32).toString('base64'));
    const [prefix, iv, tag, ciphertext] = crypto.encryptSecret('sk_live_ABCDEF123456').split(':');
    const bytes = Buffer.from(ciphertext, 'base64');
    bytes[0] ^= 0xff;
    const tampered = [prefix, iv, tag, bytes.toString('base64')].join(':');

    expect(() => crypto.decryptSecret(tampered)).toThrow('Impossible de déchiffrer la clé API');
    expect(() => crypto.decryptSecret('format-inconnu')).toThrow('format inconnu');
  });

  it('refuse de déchiffrer avec une autre clé serveur', () => {
    const encrypted = loadCrypto(randomBytes(32).toString('base64')).encryptSecret('secret-agence');
    const other = loadCrypto(randomBytes(32).toString('base64'));
    expect(() => other.decryptSecret(encrypted)).toThrow('Impossible de déchiffrer la clé API');
  });

  it('sans PAYMENT_SECRETS_KEY : chiffrement indisponible, aucune clé enregistrable', () => {
    const crypto = loadCrypto(undefined);
    expect(crypto.isEncryptionAvailable()).toBe(false);
    expect(() => crypto.encryptSecret('x')).toThrow('PAYMENT_SECRETS_KEY');
  });
});

// ---------------------------------------------------------------------------
// §3.1 — paramètres de l'agence
// ---------------------------------------------------------------------------

describe('Paramètres « Paiement en ligne » de l’agence (contrat §3.1)', () => {
  it('sans config en base : valeurs par défaut, sans rien écrire', async () => {
    const settings = await getPaymentGatewaySettings(TENANT_A);
    expect(settings).toMatchObject({
      provider: 'PAYSECUREHUB',
      mode: 'SIMULATOR',
      isActive: false,
      apiKeyConfigured: false,
      apiKeyLast4: null,
      simulatorAvailable: true,
      lastTest: null
    });
    expect(settings.callbackUrl).toMatch(/\/api\/payment-gateway\/paysecurehub\/ipn$/);
    expect(store.configs).toHaveLength(0);
  });

  it('refuse une clé API quand le chiffrement n’est pas configuré (400)', async () => {
    await expect(updatePaymentGatewaySettings(TENANT_A, { apiKey: 'sk_live_123' } as any)).rejects.toMatchObject({
      statusCode: 400
    });
    expect(store.configs).toHaveLength(0);
  });

  it('refuse d’activer le mode réel sans identifiant marchand ni clé (400)', async () => {
    await expect(
      updatePaymentGatewaySettings(TENANT_A, { mode: 'LIVE', isActive: true, merchantId: null } as any)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('un compte de trésorerie d’une autre agence est traité comme inexistant (NotFoundError)', async () => {
    store.treasuryAccounts.push({
      id: '11111111-1111-4111-8111-111111111111',
      tenantId: TENANT_B,
      kind: 'MOBILE_MONEY',
      isActive: true,
      label: 'Compte B',
      accountNumber: '5521'
    });

    await expect(
      updatePaymentGatewaySettings(TENANT_A, { treasuryAccountId: '11111111-1111-4111-8111-111111111111' } as any)
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(store.configs).toHaveLength(0);
  });

  it('refuse un compte de caisse (ni Mobile Money ni banque)', async () => {
    store.treasuryAccounts.push({
      id: '22222222-2222-4222-8222-222222222222',
      tenantId: TENANT_A,
      kind: 'CASH',
      isActive: true,
      label: 'Caisse',
      accountNumber: '5711'
    });
    await expect(
      updatePaymentGatewaySettings(TENANT_A, { treasuryAccountId: '22222222-2222-4222-8222-222222222222' } as any)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('activation sans compte désigné : ouvre le compte de collecte 5525, renvoie son libellé', async () => {
    const settings = await updatePaymentGatewaySettings(TENANT_A, { isActive: true } as any);

    expect(settings.isActive).toBe(true);
    expect(store.treasuryAccounts).toEqual([
      expect.objectContaining({ tenantId: TENANT_A, accountNumber: '5525', kind: 'MOBILE_MONEY', mmOperator: 'OTHER' })
    ]);
    expect(settings.treasuryAccountLabel).toBe('5525 — PaySecureHub — compte de collecte');
  });

  it('ne renvoie jamais la clé ni sa forme chiffrée', async () => {
    seedAgency(TENANT_A, { apiKeyEncrypted: 'pg1:iv:tag:ciphertext', apiKeyLast4: '1234', merchantId: 'M-1' });
    const settings = await getPaymentGatewaySettings(TENANT_A);
    const serialized = JSON.stringify(settings);

    expect(settings.apiKeyConfigured).toBe(true);
    expect(settings.apiKeyLast4).toBe('1234');
    expect(serialized).not.toContain('pg1:');
    expect(serialized).not.toContain('apiKeyEncrypted');
  });

  it('tester la connexion en simulateur : ok, mémorisé dans lastTest', async () => {
    seedAgency(TENANT_A);
    const result = await testPaymentGatewayConnection(TENANT_A);
    expect(result.ok).toBe(true);
    expect(store.configs[0].lastTestOk).toBe(true);
    expect(store.configs[0].lastTestAt).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// §3.3 — démarrage d'un paiement par le locataire
// ---------------------------------------------------------------------------

describe('Démarrage d’un paiement en ligne (contrat §3.3)', () => {
  it('crée un paiement PENDING et un checkout adossé, redirige vers le simulateur', async () => {
    seedAgency(TENANT_A);
    const i1 = seedInstallment(TENANT_A, 'lease-a');
    const i2 = seedInstallment(TENANT_A, 'lease-a', { amount_paid: 60000 });

    const checkout = await startCheckout(TENANT_A, 'client-a', 'lease-a', [i1.id, i2.id, i1.id], 'user-a');

    expect(checkout.codePaiement).toMatch(/^IMT-[A-Za-z0-9]{20}$/);
    expect(checkout.status).toBe('PENDING');
    expect(checkout.amount).toBe(160000 + 100000);
    expect(checkout.installmentIds).toEqual([i1.id, i2.id]);
    expect(checkout.checkoutUrl).toMatch(new RegExp(`/api/payment-gateway/simulator/${checkout.codePaiement}$`));

    const payment = store.payments.find(p => p.id === checkout.paymentId)!;
    expect(payment).toMatchObject({
      tenant_id: TENANT_A,
      status: 'PENDING',
      method: 'MOBILE_MONEY',
      psp_name: 'PAYSECUREHUB',
      psp_reference: checkout.codePaiement,
      idempotency_key: checkout.codePaiement
    });
    // Aucun compte désigné : le compte de collecte 5525 est ouvert.
    expect(payment.treasury_account_id).toBe(store.treasuryAccounts[0].id);
    expect(store.treasuryAccounts[0].accountNumber).toBe('5525');
  });

  it('des codes de paiement imprévisibles et distincts', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateCodePaiement()));
    expect(codes.size).toBe(200);
  });

  it('refuse (400) quand le paiement en ligne n’est pas activé', async () => {
    seedAgency(TENANT_A, { isActive: false });
    const i1 = seedInstallment(TENANT_A, 'lease-a');
    await expect(startCheckout(TENANT_A, 'client-a', 'lease-a', [i1.id], undefined)).rejects.toMatchObject({
      statusCode: 400
    });
  });

  it('refuse (400) une échéance d’un autre bail ou d’une autre agence', async () => {
    seedAgency(TENANT_A);
    const mine = seedInstallment(TENANT_A, 'lease-a');
    const otherLease = seedInstallment(TENANT_A, 'lease-a2');
    const otherAgency = seedInstallment(TENANT_B, 'lease-b');

    await expect(
      startCheckout(TENANT_A, 'client-a', 'lease-a', [mine.id, otherLease.id], undefined)
    ).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      startCheckout(TENANT_A, 'client-a', 'lease-a', [mine.id, otherAgency.id], undefined)
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(store.payments).toHaveLength(0);
  });

  it('refuse (400) une échéance soldée ou annulée', async () => {
    seedAgency(TENANT_A);
    const paid = seedInstallment(TENANT_A, 'lease-a', { amount_paid: 160000 });
    const canceled = seedInstallment(TENANT_A, 'lease-a', { status: 'CANCELED' });
    await expect(startCheckout(TENANT_A, 'client-a', 'lease-a', [paid.id], undefined)).rejects.toMatchObject({
      statusCode: 400
    });
    await expect(startCheckout(TENANT_A, 'client-a', 'lease-a', [canceled.id], undefined)).rejects.toMatchObject({
      statusCode: 400
    });
  });

  it('409 « paiement déjà en cours » avec data { codePaiement, checkoutUrl } pour reprendre', async () => {
    seedAgency(TENANT_A);
    const i1 = seedInstallment(TENANT_A, 'lease-a');
    const i2 = seedInstallment(TENANT_A, 'lease-a');
    const first = await startCheckout(TENANT_A, 'client-a', 'lease-a', [i1.id], undefined);

    let caught: unknown;
    try {
      await startCheckout(TENANT_A, 'client-a', 'lease-a', [i2.id, i1.id], undefined);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AppError);
    expect(caught).toMatchObject({
      statusCode: 409,
      data: { codePaiement: first.codePaiement, checkoutUrl: first.checkoutUrl }
    });
    expect(store.payments).toHaveLength(1);
  });

  it('un checkout en attente depuis plus de 15 minutes ne bloque plus', async () => {
    seedAgency(TENANT_A);
    const i1 = seedInstallment(TENANT_A, 'lease-a');
    await startCheckout(TENANT_A, 'client-a', 'lease-a', [i1.id], undefined);
    store.checkouts[0].createdAt = new Date(Date.now() - 16 * 60 * 1000);

    await expect(startCheckout(TENANT_A, 'client-a', 'lease-a', [i1.id], undefined)).resolves.toMatchObject({
      status: 'PENDING'
    });
  });

  it('erreur de l’agrégateur à la création : 502, paiement et checkout marqués FAILED', async () => {
    seedAgency(TENANT_A);
    const i1 = seedInstallment(TENANT_A, 'lease-a');
    const spy = jest.spyOn(simulatorClient, 'buildAway').mockRejectedValueOnce(new Error('réseau'));

    await expect(startCheckout(TENANT_A, 'client-a', 'lease-a', [i1.id], undefined)).rejects.toMatchObject({
      statusCode: 502
    });
    expect(store.payments[0].status).toBe('FAILED');
    expect(store.checkouts[0].status).toBe('FAILED');
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// §2 — rapprochement
// ---------------------------------------------------------------------------

describe('Rapprochement (contrat §2)', () => {
  async function started(tenantId = TENANT_A) {
    seedAgency(tenantId);
    const installment = seedInstallment(tenantId, `lease-${tenantId}`);
    const dto = await startCheckout(tenantId, `client-${tenantId}`, `lease-${tenantId}`, [installment.id], 'user');
    const row = store.checkouts.find(c => c.id === dto.id)!;
    const payment = store.payments.find(p => p.id === dto.paymentId)!;
    return { dto, row, payment, installment };
  }

  it('en attente tant que le locataire n’a rien choisi', async () => {
    const { dto, row } = await started();
    const result = await reconcileCheckout(TENANT_A, dto.id);
    expect(result.status).toBe('PENDING');
    expect(row.checkAttempts).toBe(1);
    expect(updatePaymentStatusTx).not.toHaveBeenCalled();
  });

  it('succès : paiement SUCCESS, affectation aux échéances du checkout, moyen et référence reportés', async () => {
    const { dto, row, payment, installment } = await started();
    row.simulatedOutcome = 'SUCCESS';

    const result = await reconcileCheckout(TENANT_A, dto.id);

    expect(result.status).toBe('SUCCESS');
    expect(result.completedAt).toBeInstanceOf(Date);
    expect(payment.status).toBe('SUCCESS');
    expect(payment.psp_transaction_id).toBe(`SIM-${dto.codePaiement}`);
    expect(payment.mm_operator).toBe('OTHER');
    expect(allocatePaymentTx).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_A,
      dto.paymentId,
      { installmentIds: [installment.id] },
      'user'
    );
  });

  it('idempotent : une IPN rejouée ne réécrit rien', async () => {
    const { dto, row } = await started();
    row.simulatedOutcome = 'SUCCESS';

    await reconcileCheckoutPublic(dto.codePaiement);
    await reconcileCheckoutPublic(dto.codePaiement);
    await reconcileCheckout(TENANT_A, dto.id);

    expect(updatePaymentStatusTx).toHaveBeenCalledTimes(1);
    expect(allocatePaymentTx).toHaveBeenCalledTimes(1);
    expect(row.status).toBe('SUCCESS');
  });

  it('montant divergent : REVIEW, le paiement reste PENDING', async () => {
    const { dto, payment } = await started();
    const spy = jest.spyOn(simulatorClient, 'getStatus').mockResolvedValueOnce({
      rawState: 'SUCCESSFUL',
      mappedState: 'SUCCESS',
      transactionId: 'TX-1',
      amount: 1000,
      fees: 0,
      serviceName: 'Wave',
      error: null,
      raw: {}
    });

    const result = await reconcileCheckout(TENANT_A, dto.id);

    expect(result.status).toBe('REVIEW');
    expect(result.reviewReason).toContain('1000');
    expect(payment.status).toBe('PENDING');
    expect(updatePaymentStatusTx).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('échec puis succès : un échec corrigé par l’agrégateur repasse en SUCCESS', async () => {
    const { dto, row, payment } = await started();
    row.simulatedOutcome = 'FAILED';
    expect((await reconcileCheckout(TENANT_A, dto.id)).status).toBe('FAILED');
    expect(payment.status).toBe('FAILED');

    row.simulatedOutcome = 'SUCCESS';
    expect((await reconcileCheckout(TENANT_A, dto.id)).status).toBe('SUCCESS');
    expect(payment.status).toBe('SUCCESS');
  });

  it('annulation : paiement et checkout CANCELED, message de l’agrégateur conservé', async () => {
    const { dto, payment } = await started();
    const spy = jest.spyOn(simulatorClient, 'getStatus').mockResolvedValueOnce({
      rawState: 'CANCEL',
      mappedState: 'CANCELED',
      transactionId: null,
      amount: null,
      fees: null,
      serviceName: null,
      error: 'Annulé par le client',
      raw: {}
    });

    const result = await reconcileCheckout(TENANT_A, dto.id);
    expect(result.status).toBe('CANCELED');
    expect(result.failureMessage).toBe('Annulé par le client');
    expect(payment.status).toBe('CANCELED');
    spy.mockRestore();
  });

  it('un succès ne redescend jamais : un état contraire met en REVIEW, sans défaire l’encaissement', async () => {
    const { dto, row, payment } = await started();
    row.simulatedOutcome = 'SUCCESS';
    await reconcileCheckout(TENANT_A, dto.id);

    row.simulatedOutcome = 'FAILED';
    const review = await reconcileCheckout(TENANT_A, dto.id);
    expect(review.status).toBe('REVIEW');
    expect(payment.status).toBe('SUCCESS');

    // Toujours contraire : reste en REVIEW, le paiement n'est jamais défait.
    const again = await reconcileCheckout(TENANT_A, dto.id);
    expect(again.status).toBe('REVIEW');
    expect(payment.status).toBe('SUCCESS');

    // L'agrégateur revient au succès : SUCCESS, sans réencaisser.
    row.simulatedOutcome = 'SUCCESS';
    expect((await reconcileCheckout(TENANT_A, dto.id)).status).toBe('SUCCESS');
    expect(updatePaymentStatusTx).toHaveBeenCalledTimes(1);
    expect(allocatePaymentTx).toHaveBeenCalledTimes(1);
  });

  it('tâche planifiée : expire (48 h) un checkout toujours en attente, paiement CANCELED', async () => {
    const { row, payment } = await started();
    row.createdAt = new Date(Date.now() - 49 * 60 * 60 * 1000);

    const result = await reconcilePendingCheckouts();

    expect(result).toEqual({ reconciled: 1, expired: 1, errors: 0 });
    expect(row.status).toBe('EXPIRED');
    expect(payment.status).toBe('CANCELED');
  });

  it('tâche planifiée : ignore un checkout de moins de 2 minutes', async () => {
    await started();
    expect(await reconcilePendingCheckouts()).toEqual({ reconciled: 0, expired: 0, errors: 0 });
  });

  it('agrégateur injoignable : 502, tentative comptée, statut inchangé', async () => {
    const { dto, row } = await started();
    const spy = jest
      .spyOn(simulatorClient, 'getStatus')
      .mockRejectedValueOnce(
        new (jest.requireActual('../../src/lib/payment-gateway/types').GatewayError)('PaySecureHub ne répond pas.')
      );
    await expect(reconcileCheckout(TENANT_A, dto.id)).rejects.toMatchObject({ statusCode: 502 });
    expect(row.status).toBe('PENDING');
    expect(row.checkAttempts).toBe(1);
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// IPN publique
// ---------------------------------------------------------------------------

describe('IPN PaySecureHub (contrat §3.4)', () => {
  function fakeRes() {
    const res: Partial<Response> & { statusCode?: number; body?: unknown } = {};
    res.status = jest.fn((code: number) => {
      res.statusCode = code;
      return res as Response;
    });
    res.json = jest.fn((body: unknown) => {
      res.body = body;
      return res as Response;
    });
    return res;
  }

  /** `asyncHandler` ne renvoie pas la promesse : on attend la réponse (ou `next`) elle-même. */
  async function callIpn(body: unknown) {
    const res = fakeRes();
    let next: jest.Mock = jest.fn();
    await new Promise<void>(resolve => {
      const json = res.json as jest.Mock;
      res.json = jest.fn((payload: unknown) => {
        json(payload);
        resolve();
        return res as Response;
      });
      next = jest.fn(() => resolve());
      paysecurehubIpnHandler({ body } as Request, res as Response, next);
    });
    return { res, next };
  }

  it('code inconnu : 200 { received: true }, rien révélé', async () => {
    const { res, next } = await callIpn({ codePaiement: 'IMT-INCONNU' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(next).not.toHaveBeenCalled();
  });

  it('sans code : 200 aussi', async () => {
    const { res } = await callIpn({});
    expect(res.statusCode).toBe(200);
  });

  it('ne croit jamais le corps : un « SUCCESS » annoncé ne change rien tant que l’agrégateur dit « en attente »', async () => {
    seedAgency(TENANT_A);
    const installment = seedInstallment(TENANT_A, 'lease-a');
    const dto = await startCheckout(TENANT_A, 'client-a', 'lease-a', [installment.id], undefined);

    const { res } = await callIpn({ code_paiement: dto.codePaiement, state: 'SUCCESSFUL', amount: dto.amount });

    expect(res.statusCode).toBe(200);
    expect(store.checkouts[0].status).toBe('PENDING');
    expect(store.payments[0].status).toBe('PENDING');
    expect(store.checkouts[0].checkAttempts).toBe(1);
  });

  it('agrégateur injoignable pendant l’IPN : 200 quand même (la tâche planifiée reprendra)', async () => {
    seedAgency(TENANT_A);
    const installment = seedInstallment(TENANT_A, 'lease-a');
    const dto = await startCheckout(TENANT_A, 'client-a', 'lease-a', [installment.id], undefined);
    const spy = jest.spyOn(simulatorClient, 'getStatus').mockRejectedValueOnce(new Error('timeout'));

    const { res, next } = await callIpn({ codePaiement: dto.codePaiement });
    expect(res.statusCode).toBe(200);
    expect(next).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Isolation entre agences
// ---------------------------------------------------------------------------

describe('Isolation entre agences', () => {
  async function checkoutOf(tenantId: string) {
    seedAgency(tenantId);
    const installment = seedInstallment(tenantId, `lease-${tenantId}`);
    return startCheckout(tenantId, `client-${tenantId}`, `lease-${tenantId}`, [installment.id], undefined);
  }

  it('l’agence B ne rapproche pas un checkout de l’agence A (NotFoundError, comme inexistant)', async () => {
    const dtoA = await checkoutOf(TENANT_A);
    await expect(reconcileCheckout(TENANT_B, dtoA.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getCheckoutForPayment(TENANT_B, dtoA.paymentId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('un locataire ne lit que ses propres codes, dans sa propre agence', async () => {
    const dtoA = await checkoutOf(TENANT_A);
    await expect(getCheckoutForPortal(TENANT_B, `client-${TENANT_A}`, dtoA.codePaiement)).rejects.toBeInstanceOf(
      NotFoundError
    );
    await expect(getCheckoutForPortal(TENANT_A, 'autre-client', dtoA.codePaiement)).rejects.toBeInstanceOf(
      NotFoundError
    );
    await expect(getCheckoutForPortal(TENANT_A, `client-${TENANT_A}`, dtoA.codePaiement)).resolves.toMatchObject({
      codePaiement: dtoA.codePaiement
    });
  });

  it('les échéances d’une autre agence ne peuvent pas entrer dans un paiement', async () => {
    seedAgency(TENANT_A);
    const foreign = seedInstallment(TENANT_B, `lease-${TENANT_A}`);
    await expect(
      startCheckout(TENANT_A, `client-${TENANT_A}`, `lease-${TENANT_A}`, [foreign.id], undefined)
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('le 409 ne révèle jamais le paiement en cours d’une autre agence', async () => {
    const dtoA = await checkoutOf(TENANT_A);
    seedAgency(TENANT_B);
    // Même identifiant d'échéance côté B (collision artificielle) : le
    // checkout de A ne doit pas être vu comme « en cours » pour B.
    store.installments.push({ ...store.installments[0], tenant_id: TENANT_B, lease_id: `lease-${TENANT_B}` });

    const dtoB = await startCheckout(
      TENANT_B,
      `client-${TENANT_B}`,
      `lease-${TENANT_B}`,
      [store.installments[0].id],
      undefined
    );
    expect(dtoB.codePaiement).not.toBe(dtoA.codePaiement);
  });

  it('le rapprochement public (IPN) tourne dans le contexte de l’agence du checkout', async () => {
    const dtoA = await checkoutOf(TENANT_A);
    const seen: Array<string | undefined> = [];
    const spy = jest.spyOn(simulatorClient, 'getStatus').mockImplementationOnce(async credentials => {
      seen.push(tenantContext.getCurrentTenantId(), credentials.tenantId);
      return {
        rawState: null,
        mappedState: 'PENDING',
        transactionId: null,
        amount: null,
        fees: null,
        serviceName: null,
        error: null,
        raw: null
      };
    });

    expect(tenantContext.getCurrentTenantId()).toBeUndefined();
    await reconcileCheckoutPublic(dtoA.codePaiement);
    expect(seen).toEqual([TENANT_A, TENANT_A]);
    spy.mockRestore();
  });

  it('le simulateur ne lit l’issue simulée que dans l’agence des identifiants', async () => {
    const dtoA = await checkoutOf(TENANT_A);
    store.checkouts[0].simulatedOutcome = 'SUCCESS';

    const fromB = await simulatorClient.getStatus(
      { tenantId: TENANT_B, merchantId: '', apiKey: '', baseUrl: '', timeoutMs: 1000 },
      dtoA.codePaiement
    );
    expect(fromB.mappedState).toBe('PENDING');
    expect(fromB.transactionId).toBeNull();
  });

  it('agence suspendue : le simulateur ne sert plus ses paiements', async () => {
    const dtoA = await checkoutOf(TENANT_A);
    expect(await findSimulatorCheckout(dtoA.codePaiement)).not.toBeNull();
    store.tenants[0].status = 'SUSPENDED';
    expect(await findSimulatorCheckout(dtoA.codePaiement)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Client réel : forme des appels, sans réseau
// ---------------------------------------------------------------------------

describe('Client PaySecureHub réel (sans réseau)', () => {
  const credentials = {
    tenantId: TENANT_A,
    merchantId: 'M-42',
    apiKey: 'cle-de-test',
    baseUrl: 'https://paysecurehub.test/api/',
    timeoutMs: 1000
  };
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockFetch(status: number, body: unknown) {
    const fn = jest.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body)
    }));
    global.fetch = fn as unknown as typeof fetch;
    return fn;
  }

  it('build-away : corps attendu par PaySecureHub, en-têtes ApiKey/MerchantId', async () => {
    const fetchMock = mockFetch(200, { url: 'https://pay.test/x', tokens: 'tok', code: '00', message: 'ok' });
    const result = await paySecureHubClient.buildAway(credentials, {
      codePaiement: 'IMT-ABC',
      nomUsager: 'Kouassi',
      prenomUsager: 'Awa',
      telephone: '0700000000',
      email: 'awa@example.test',
      libelleArticle: 'Loyer',
      quantite: 1,
      montant: 150000,
      libOrder: 'Paiement loyer IMT-ABC',
      urlRetour: 'http://front/tenant/payments?paiement=IMT-ABC',
      urlCallback: 'http://api/api/payment-gateway/paysecurehub/ipn'
    });

    expect(result.url).toBe('https://pay.test/x');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://paysecurehub.test/api/payhub-ws/build-away');
    expect(init.headers).toMatchObject({ ApiKey: 'cle-de-test', MerchantId: 'M-42' });
    expect(JSON.parse(String(init.body))).toMatchObject({
      code_paiement: 'IMT-ABC',
      montant: 150000,
      Url_Retour: 'http://front/tenant/payments?paiement=IMT-ABC',
      Url_Callback: 'http://api/api/payment-gateway/paysecurehub/ipn'
    });
  });

  it('status/transact : lit payments.*, normalise l’état', async () => {
    mockFetch(200, {
      payments: { state: 'Successful', transactionId: 'TX-9', amount: '150000', fees: 1500, serviceName: 'Wave' }
    });
    const status = await paySecureHubClient.getStatus(credentials, 'IMT-ABC');
    expect(status).toMatchObject({
      rawState: 'Successful',
      mappedState: 'SUCCESS',
      transactionId: 'TX-9',
      amount: 150000,
      fees: 1500,
      serviceName: 'Wave'
    });
  });

  it('réponse en erreur : GatewayError dont le message ne porte jamais la clé', async () => {
    mockFetch(500, { error: 'boom' });
    await expect(paySecureHubClient.getStatus(credentials, 'IMT-ABC')).rejects.toMatchObject({
      name: 'GatewayError',
      message: expect.not.stringContaining('cle-de-test')
    });
  });
});
