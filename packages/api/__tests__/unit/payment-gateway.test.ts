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
    if (key === 'OR') return (condition as Row[]).some(branch => matches(row, branch));
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
      if ('startsWith' in condition) return typeof value === 'string' && value.startsWith(condition.startsWith);
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
    count: jest.fn(async ({ where }: Row = {}) => collection().filter(r => matches(r, where)).length),
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
      resolution: null,
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

jest.mock('../../src/lib/rental/online-review/pending-declaration', () => ({
  assertNoPendingDeclaration: jest.fn(async () => undefined)
}));
jest.mock('../../src/lib/payment-gateway/availability', () =>
  require('../helpers/rental-availability-mock').makeAvailabilityMock(() =>
    jest.requireActual('../../src/lib/payment-gateway/config')
  )
);

jest.mock('../../src/lib/treasury/accounts', () => ({
  ensureChartAccountTx: jest.fn(async () => 'chart-5525')
}));

import { mapProviderState, operatorFromServiceName } from '../../src/lib/payment-gateway/status-mapping';
import {
  startCheckout,
  reconcileCheckout,
  reconcileCheckoutForVerify,
  reconcileCheckoutPublic,
  reconcilePendingCheckouts,
  getCheckoutForPortal,
  getCheckoutForPayment,
  generateCodePaiement,
  findSimulatorCheckout
} from '../../src/lib/payment-gateway/checkout';
import {
  AMOUNT_NOT_PROVIDED_REVIEW_REASON,
  CURRENCY_MISMATCH_REVIEW_PREFIX,
  REVIEW_RECHECK_ABANDONED_SUFFIX
} from '../../src/lib/payment-gateway/checkout-core';
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
import * as auditService from '../../src/services/audit-service';
import * as envModule from '../../src/config/env';

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

  it('refuse une balise tronquée à 4 octets', () => {
    const crypto = loadCrypto(randomBytes(32).toString('base64'));
    const [prefix, iv, tag, ciphertext] = crypto.encryptSecret('sk_live_ABCDEF123456').split(':');
    const truncated = Buffer.from(tag, 'base64').subarray(0, 4).toString('base64');
    expect(() => crypto.decryptSecret([prefix, iv, truncated, ciphertext].join(':'))).toThrow(
      'Impossible de déchiffrer la clé API'
    );
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

  describe('changement d’identifiants avec des paiements en attente (contrat 049 §2.8)', () => {
    function seedPending(tenantId = TENANT_A) {
      store.checkouts.push({ id: nextId('checkout'), tenantId, status: 'PENDING' });
    }
    const live = { mode: 'LIVE', merchantId: 'M-1', apiKeyEncrypted: 'pg1:iv:tag:cipher', apiKeyLast4: '1234' };

    it('409 GATEWAY_CHECKOUTS_PENDING quand le mode change', async () => {
      seedAgency(TENANT_A);
      seedPending();
      await expect(
        updatePaymentGatewaySettings(TENANT_A, { mode: 'LIVE', isActive: false } as any)
      ).rejects.toMatchObject({ statusCode: 409, code: 'GATEWAY_CHECKOUTS_PENDING' });
      expect(store.configs[0].mode).toBe('SIMULATOR');
    });

    it('409 GATEWAY_CHECKOUTS_PENDING quand l’identifiant marchand change', async () => {
      seedAgency(TENANT_A, live);
      seedPending();
      await expect(updatePaymentGatewaySettings(TENANT_A, { merchantId: 'M-2' } as any)).rejects.toMatchObject({
        statusCode: 409,
        code: 'GATEWAY_CHECKOUTS_PENDING'
      });
      expect(store.configs[0].merchantId).toBe('M-1');
    });

    it('409 GATEWAY_CHECKOUTS_PENDING quand la clé est effacée', async () => {
      seedAgency(TENANT_A, live);
      seedPending();
      await expect(
        updatePaymentGatewaySettings(TENANT_A, { apiKey: '', isActive: false } as any)
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'GATEWAY_CHECKOUTS_PENDING'
      });
      expect(store.configs[0].apiKeyEncrypted).toBe(live.apiKeyEncrypted);
    });

    it('un paiement en attente d’une AUTRE agence ne bloque pas', async () => {
      seedAgency(TENANT_A, live);
      seedPending(TENANT_B);
      await expect(updatePaymentGatewaySettings(TENANT_A, { merchantId: 'M-2' } as any)).resolves.toMatchObject({
        merchantId: 'M-2'
      });
    });

    it('sans paiement en attente, le changement passe', async () => {
      seedAgency(TENANT_A, live);
      await expect(updatePaymentGatewaySettings(TENANT_A, { merchantId: 'M-2' } as any)).resolves.toMatchObject({
        merchantId: 'M-2'
      });
    });

    it('désactiver ou changer les frais reste permis avec un paiement en attente', async () => {
      seedAgency(TENANT_A, live);
      seedPending();
      await expect(
        updatePaymentGatewaySettings(TENANT_A, { isActive: false, feesPaidBy: 'AGENCY' } as any)
      ).resolves.toMatchObject({ isActive: false });
    });
  });

  it('400 GATEWAY_SIMULATOR_UNAVAILABLE : le simulateur est refusé quand le serveur ne l’autorise pas', async () => {
    const previous = envModule.paymentGatewaySimulatorAvailable;
    (envModule as any).paymentGatewaySimulatorAvailable = false;
    try {
      await expect(updatePaymentGatewaySettings(TENANT_A, { mode: 'SIMULATOR' } as any)).rejects.toMatchObject({
        statusCode: 400,
        code: 'GATEWAY_SIMULATOR_UNAVAILABLE'
      });
      expect(store.configs).toHaveLength(0);
    } finally {
      (envModule as any).paymentGatewaySimulatorAvailable = previous;
    }
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

  it('montant divergent : reviewKind AMOUNT_MISMATCH et montant reçu conservés (contrat 049 §2.6)', async () => {
    const { dto, row } = await started();
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

    await reconcileCheckout(TENANT_A, dto.id);

    expect(row.reviewKind).toBe('AMOUNT_MISMATCH');
    expect(Number(row.receivedAmount)).toBe(1000);
    spy.mockRestore();
  });

  it('une tentative en REVIEW n’est JAMAIS encaissée par la vérification automatique (contrat 049 §2.4)', async () => {
    const { dto, row, payment } = await started();
    row.status = 'REVIEW';
    row.reviewKind = 'AMOUNT_MISMATCH';
    const spy = jest.spyOn(simulatorClient, 'getStatus').mockResolvedValueOnce({
      rawState: 'SUCCESSFUL',
      mappedState: 'SUCCESS',
      transactionId: 'TX-2',
      amount: Number(row.amount),
      fees: 0,
      serviceName: 'Wave',
      error: null,
      raw: {}
    });

    const result = await reconcileCheckout(TENANT_A, dto.id);

    expect(result.status).toBe('REVIEW');
    expect(payment.status).toBe('PENDING');
    expect(updatePaymentStatusTx).not.toHaveBeenCalled();
    expect(Number(row.receivedAmount)).toBe(Number(row.amount));
    spy.mockRestore();
  });

  it('une tentative en REVIEW n’est ni échouée ni annulée automatiquement', async () => {
    const { dto, row, payment } = await started();
    row.status = 'REVIEW';
    row.reviewKind = 'CONTRARY_STATE';
    const spy = jest.spyOn(simulatorClient, 'getStatus').mockResolvedValueOnce({
      rawState: 'FAILED',
      mappedState: 'FAILED',
      transactionId: null,
      amount: null,
      fees: null,
      serviceName: null,
      error: 'refusé',
      raw: {}
    });

    const result = await reconcileCheckout(TENANT_A, dto.id);

    expect(result.status).toBe('REVIEW');
    expect(payment.status).toBe('PENDING');
    expect(updatePaymentStatusTx).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  describe('mises en REVIEW automatiques et verrou de statut (contrat 049 §2.6)', () => {
    afterEach(() => {
      // Seulement les espions de ce bloc : les jest.fn() du magasin en mémoire restent intacts.
      (simulatorClient.getStatus as jest.Mock).mockRestore?.();
      (auditService.logAuditEvent as jest.Mock).mockRestore?.();
    });

    function providerSays(state: 'SUCCESS' | 'FAILED', row: Row, transactionId: string | null = 'TX-OK') {
      return jest.spyOn(simulatorClient, 'getStatus').mockResolvedValueOnce({
        rawState: state === 'SUCCESS' ? 'SUCCESSFUL' : 'FAILED',
        mappedState: state,
        transactionId,
        amount: state === 'SUCCESS' ? Number(row.amount) : null,
        fees: 0,
        serviceName: 'Wave',
        error: state === 'FAILED' ? 'refusé' : null,
        raw: {}
      });
    }

    it('transaction déjà enregistrée sur une autre tentative : REVIEW / DUPLICATE_TRANSACTION, rien encaissé', async () => {
      const { dto, row, payment } = await started();
      store.checkouts.push({
        id: nextId('checkout'),
        tenantId: TENANT_A,
        codePaiement: 'CODE-ORIGINE',
        providerTransactionId: 'TX-DUP',
        status: 'SUCCESS'
      });
      providerSays('SUCCESS', row, 'TX-DUP');

      const result = await reconcileCheckout(TENANT_A, dto.id);

      expect(result.status).toBe('REVIEW');
      expect(row.reviewKind).toBe('DUPLICATE_TRANSACTION');
      expect(row.reviewReason).toContain('CODE-ORIGINE');
      expect(payment.status).toBe('PENDING');
      expect(updatePaymentStatusTx).not.toHaveBeenCalled();
      expect(allocatePaymentTx).not.toHaveBeenCalled();
    });

    it('la même transaction sur une tentative d’une AUTRE agence n’est pas un doublon', async () => {
      const { dto, row, payment } = await started();
      store.checkouts.push({
        id: nextId('checkout'),
        tenantId: TENANT_B,
        codePaiement: 'CODE-B',
        providerTransactionId: 'TX-DUP',
        status: 'SUCCESS'
      });
      providerSays('SUCCESS', row, 'TX-DUP');

      const result = await reconcileCheckout(TENANT_A, dto.id);

      expect(result.status).toBe('SUCCESS');
      expect(payment.status).toBe('SUCCESS');
    });

    it.each([
      ['annulée', { status: 'CANCELED' }],
      ['déjà soldée', { amount_paid: 160000 }]
    ])('échéance %s avant l’encaissement : REVIEW / INSTALLMENT_UNAVAILABLE, rien encaissé', async (_label, patch) => {
      const { dto, row, payment, installment } = await started();
      Object.assign(installment, patch);
      providerSays('SUCCESS', row);

      const result = await reconcileCheckout(TENANT_A, dto.id);

      expect(result.status).toBe('REVIEW');
      expect(row.reviewKind).toBe('INSTALLMENT_UNAVAILABLE');
      expect(payment.status).toBe('PENDING');
      expect(updatePaymentStatusTx).not.toHaveBeenCalled();
      expect(allocatePaymentTx).not.toHaveBeenCalled();
    });

    it('échéance d’un autre bail : REVIEW / INSTALLMENT_UNAVAILABLE', async () => {
      const { dto, row, payment, installment } = await started();
      installment.lease_id = 'autre-bail';
      providerSays('SUCCESS', row);

      const result = await reconcileCheckout(TENANT_A, dto.id);

      expect(result.status).toBe('REVIEW');
      expect(row.reviewKind).toBe('INSTALLMENT_UNAVAILABLE');
      expect(payment.status).toBe('PENDING');
    });

    it('succès tardif d’une tentative EXPIRED relu par « Vérifier » : REVIEW / CONTRARY_STATE, rien encaissé', async () => {
      const { dto, row, payment } = await started();
      row.status = 'EXPIRED';
      providerSays('SUCCESS', row);

      const result = await reconcileCheckoutForVerify(TENANT_A, dto.id);

      expect(result.status).toBe('REVIEW');
      expect(row.reviewKind).toBe('CONTRARY_STATE');
      expect(row.reviewReason).toContain('expiré');
      expect(payment.status).toBe('PENDING');
      expect(updatePaymentStatusTx).not.toHaveBeenCalled();
      expect(allocatePaymentTx).not.toHaveBeenCalled();
    });

    it('« Vérifier » sur une EXPIRED dont l’agrégateur ne dit pas succès : rien ne change', async () => {
      const { dto, row } = await started();
      row.status = 'EXPIRED';
      providerSays('FAILED', row, null);

      const result = await reconcileCheckoutForVerify(TENANT_A, dto.id);

      expect(result.status).toBe('EXPIRED');
      expect(row.reviewKind ?? null).toBeNull();
      expect(updatePaymentStatusTx).not.toHaveBeenCalled();
    });

    it('EXPIRED reste close pour les autres appelants (IPN, retour portail, tâche) : l’agrégateur n’est pas interrogé', async () => {
      const { dto, row, payment } = await started();
      row.status = 'EXPIRED';
      const spy = providerSays('SUCCESS', row);

      expect((await reconcileCheckout(TENANT_A, dto.id)).status).toBe('EXPIRED');
      expect((await reconcileCheckoutPublic(dto.codePaiement))?.status).toBe('EXPIRED');

      expect(spy).not.toHaveBeenCalled();
      expect(row.status).toBe('EXPIRED');
      expect(payment.status).toBe('PENDING');
      expect(updatePaymentStatusTx).not.toHaveBeenCalled();
    });

    describe('ligne périmée : un REVIEW posé entre la lecture et l’écriture n’est ni écrasé ni encaissé (count = 0)', () => {
      /** L'agrégateur répond pendant qu'un gestionnaire (ou une autre vérification) passe la tentative en REVIEW. */
      function concurrentReview(row: Row, response: Row) {
        // Le magasin rend des références vives : la lecture du rapprochement doit être un instantané périmé.
        mockPrisma.onlinePaymentCheckout.findFirst.mockImplementationOnce(async () => ({ ...row }));
        return jest.spyOn(simulatorClient, 'getStatus').mockImplementationOnce(async () => {
          row.status = 'REVIEW';
          row.reviewKind = 'AMOUNT_MISMATCH';
          row.reviewReason = 'posé par la décision concurrente';
          return response as any;
        });
      }

      it('succès : pas d’encaissement, le REVIEW reste intact', async () => {
        const { dto, row, payment } = await started();
        concurrentReview(row, {
          rawState: 'SUCCESSFUL',
          mappedState: 'SUCCESS',
          transactionId: 'TX-RACE',
          amount: Number(row.amount),
          fees: 0,
          serviceName: 'Wave',
          error: null,
          raw: {}
        });

        const result = await reconcileCheckout(TENANT_A, dto.id);

        expect(result.status).toBe('REVIEW');
        expect(row.status).toBe('REVIEW');
        expect(row.completedAt ?? null).toBeNull();
        expect(payment.status).toBe('PENDING');
        expect(updatePaymentStatusTx).not.toHaveBeenCalled();
        expect(allocatePaymentTx).not.toHaveBeenCalled();
      });

      it('échec : le REVIEW n’est pas ré-écrasé en FAILED, le paiement n’est pas touché', async () => {
        const { dto, row, payment } = await started();
        concurrentReview(row, {
          rawState: 'FAILED',
          mappedState: 'FAILED',
          transactionId: null,
          amount: null,
          fees: null,
          serviceName: null,
          error: 'refusé',
          raw: {}
        });

        const result = await reconcileCheckout(TENANT_A, dto.id);

        expect(result.status).toBe('REVIEW');
        expect(row.status).toBe('REVIEW');
        expect(payment.status).toBe('PENDING');
        expect(updatePaymentStatusTx).not.toHaveBeenCalled();
      });

      it('mise en REVIEW (montant divergent) : ni écriture ni audit, la ligne relue est rendue telle quelle', async () => {
        const { dto, row } = await started();
        const audit = jest.spyOn(auditService, 'logAuditEvent').mockImplementation(() => undefined as any);
        concurrentReview(row, {
          rawState: 'SUCCESSFUL',
          mappedState: 'SUCCESS',
          transactionId: 'TX-RACE',
          amount: 1000,
          fees: 0,
          serviceName: 'Wave',
          error: null,
          raw: {}
        });

        const result = await reconcileCheckout(TENANT_A, dto.id);

        expect(result.status).toBe('REVIEW');
        expect(result.reviewReason).toBe('posé par la décision concurrente');
        expect(row.receivedAmount ?? null).toBeNull();
        expect(audit).not.toHaveBeenCalled();
      });
    });

    describe('tentative déjà tranchée par le gestionnaire (resolution non nulle) : jamais réévaluée', () => {
      const routes: Array<[string, (dto: Row) => Promise<unknown>]> = [
        ['rapprochement', dto => reconcileCheckout(TENANT_A, dto.id)],
        ['IPN publique', dto => reconcileCheckoutPublic(dto.codePaiement)],
        ['bouton « Vérifier »', dto => reconcileCheckoutForVerify(TENANT_A, dto.id)]
      ];

      it.each(routes)(
        'REJECT puis succès du fournisseur (%s) : FAILED inchangé, rien encaissé',
        async (_label, run) => {
          const { dto, row, payment } = await started();
          row.status = 'FAILED';
          row.resolution = 'REJECT';
          row.reviewKind = 'AMOUNT_MISMATCH';
          payment.status = 'FAILED';
          providerSays('SUCCESS', row, 'TX-LATE');

          await run(dto);

          expect(row.status).toBe('FAILED');
          expect(row.resolution).toBe('REJECT');
          expect(payment.status).toBe('FAILED');
          expect(updatePaymentStatusTx).not.toHaveBeenCalled();
          expect(allocatePaymentTx).not.toHaveBeenCalled();
        }
      );

      it.each(routes)('REJECT d’un écart de montant puis IPN (%s) : pas de retour en REVIEW', async (_label, run) => {
        const { dto, row } = await started();
        row.status = 'FAILED';
        row.resolution = 'REJECT';
        row.reviewKind = 'AMOUNT_MISMATCH';
        jest.spyOn(simulatorClient, 'getStatus').mockResolvedValueOnce({
          rawState: 'SUCCESSFUL',
          mappedState: 'SUCCESS',
          transactionId: 'TX-1',
          amount: 1000,
          fees: 0,
          serviceName: 'Wave',
          error: null,
          raw: {}
        });

        await run(dto);

        expect(row.status).toBe('FAILED');
        expect(row.reviewReason ?? null).toBeNull();
      });

      it.each(routes)(
        'ACCEPT d’un CONTRARY_STATE puis échec du fournisseur (%s) : pas de nouveau REVIEW',
        async (_label, run) => {
          const { dto, row, payment } = await started();
          row.status = 'SUCCESS';
          row.resolution = 'ACCEPT';
          row.reviewKind = 'CONTRARY_STATE';
          payment.status = 'SUCCESS';
          providerSays('FAILED', row, null);

          await run(dto);

          expect(row.status).toBe('SUCCESS');
          expect(row.reviewReason ?? null).toBeNull();
          expect(payment.status).toBe('SUCCESS');
          expect(updatePaymentStatusTx).not.toHaveBeenCalled();
        }
      );

      it('le suivi (état fournisseur, montant reçu) est quand même mis à jour', async () => {
        const { dto, row } = await started();
        row.status = 'FAILED';
        row.resolution = 'REJECT';
        providerSays('SUCCESS', row, 'TX-LATE');

        await reconcileCheckout(TENANT_A, dto.id);

        expect(row.lastProviderState).toBe('SUCCESSFUL');
        expect(Number(row.receivedAmount)).toBe(Number(row.amount));
        expect(row.checkAttempts).toBe(1);
      });
    });

    it('mise en REVIEW réussie : un audit RENTAL_ONLINE_PAYMENT_REVIEW est écrit', async () => {
      const { dto, row } = await started();
      const audit = jest.spyOn(auditService, 'logAuditEvent').mockImplementation(() => undefined as any);
      row.status = 'EXPIRED';
      providerSays('SUCCESS', row);

      await reconcileCheckoutForVerify(TENANT_A, dto.id);

      expect(audit).toHaveBeenCalledTimes(1);
      expect(audit.mock.calls[0][0]).toMatchObject({
        tenantId: TENANT_A,
        actionKey: 'RENTAL_ONLINE_PAYMENT_REVIEW',
        payload: expect.objectContaining({ reviewKind: 'CONTRARY_STATE' })
      });
    });
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

    // L'agrégateur revient au succès : contrat 049 §2.4, seule la décision du gestionnaire sort
    // une tentative de REVIEW (`resolveOnlinePayment`) ; la vérification automatique ne fait que du suivi.
    row.simulatedOutcome = 'SUCCESS';
    expect((await reconcileCheckout(TENANT_A, dto.id)).status).toBe('REVIEW');
    expect(row.reviewKind).toBe('CONTRARY_STATE');
    expect(updatePaymentStatusTx).toHaveBeenCalledTimes(1);
    expect(allocatePaymentTx).toHaveBeenCalledTimes(1);
  });

  it('tâche planifiée : expire (48 h) un checkout toujours en attente, paiement CANCELED', async () => {
    const { row, payment } = await started();
    row.createdAt = new Date(Date.now() - 49 * 60 * 60 * 1000);

    const result = await reconcilePendingCheckouts();

    expect(result).toEqual({
      reconciled: 1,
      expired: 1,
      errors: 0,
      reviewRechecked: 0,
      reviewSucceeded: 0,
      reviewAbandoned: 0
    });
    expect(row.status).toBe('EXPIRED');
    expect(payment.status).toBe('CANCELED');
  });

  it('tâche planifiée : ignore un checkout de moins de 2 minutes', async () => {
    await started();
    expect(await reconcilePendingCheckouts()).toEqual({
      reconciled: 0,
      expired: 0,
      errors: 0,
      reviewRechecked: 0,
      reviewSucceeded: 0,
      reviewAbandoned: 0
    });
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
// Contre-audit PAY M2 — revérification des REVIEW « montant non communiqué »
// ---------------------------------------------------------------------------

describe('Tâche planifiée : revérification des REVIEW sans montant ou autre devise (contre-audit PAY M2)', () => {
  const MINUTES = 60 * 1000;

  async function inReview(reason: string = AMOUNT_NOT_PROVIDED_REVIEW_REASON, ageMs = 10 * MINUTES) {
    seedAgency(TENANT_A);
    const installment = seedInstallment(TENANT_A, 'lease-a');
    const dto = await startCheckout(TENANT_A, 'client-a', 'lease-a', [installment.id], 'user');
    const row = store.checkouts.find(c => c.id === dto.id)!;
    const payment = store.payments.find(p => p.id === dto.paymentId)!;
    row.status = 'REVIEW';
    row.reviewReason = reason;
    row.createdAt = new Date(Date.now() - ageMs);
    jest.clearAllMocks();
    return { dto, row, payment };
  }

  function providerSays(overrides: Row) {
    return jest.spyOn(simulatorClient, 'getStatus').mockResolvedValue({
      rawState: 'SUCCESSFUL',
      mappedState: 'SUCCESS',
      transactionId: 'TX-R',
      amount: null,
      fees: 0,
      serviceName: 'Wave',
      error: null,
      raw: {},
      ...overrides
    } as unknown as Awaited<ReturnType<typeof simulatorClient.getStatus>>);
  }

  afterEach(() => jest.restoreAllMocks());

  it('montant et devise désormais communiqués et conformes : SUCCESS, encaissement unique', async () => {
    const { row, payment } = await inReview();
    providerSays({ amount: Number(row.amount), currency: 'XOF' });

    const result = await reconcilePendingCheckouts();

    expect(result).toMatchObject({ reviewRechecked: 1, reviewSucceeded: 1, reviewAbandoned: 0, errors: 0 });
    expect(row.status).toBe('SUCCESS');
    expect(payment.status).toBe('SUCCESS');
    expect(updatePaymentStatusTx).toHaveBeenCalledTimes(1);
    expect(allocatePaymentTx).toHaveBeenCalledTimes(1);

    // Idempotent : un nouveau passage ne revérifie ni ne réencaisse rien.
    const again = await reconcilePendingCheckouts();
    expect(again).toMatchObject({ reviewRechecked: 0, reviewSucceeded: 0 });
    expect(updatePaymentStatusTx).toHaveBeenCalledTimes(1);
    expect(allocatePaymentTx).toHaveBeenCalledTimes(1);
  });

  it('toujours sans montant : reste REVIEW, motif inchangé, suivi mis à jour, aucun encaissement', async () => {
    const { row, payment } = await inReview();
    providerSays({ amount: null });

    const result = await reconcilePendingCheckouts();

    expect(result).toMatchObject({ reviewRechecked: 1, reviewSucceeded: 0, reviewAbandoned: 0 });
    expect(row.status).toBe('REVIEW');
    expect(row.reviewReason).toBe(AMOUNT_NOT_PROVIDED_REVIEW_REASON);
    expect(row.checkAttempts).toBe(1);
    expect(payment.status).toBe('PENDING');
    expect(updatePaymentStatusTx).not.toHaveBeenCalled();
  });

  it.each([
    ['FAILED', 'FAILED'],
    ['CANCELED', 'CANCEL'],
    ['PENDING', 'INITIATED']
  ])('l’agrégateur dit maintenant %s : la revue demeure (décision humaine), paiement intact', async (mapped, raw) => {
    const { row, payment } = await inReview();
    providerSays({ mappedState: mapped, rawState: raw, amount: null });

    await reconcilePendingCheckouts();

    expect(row.status).toBe('REVIEW');
    expect(row.reviewReason).toBe(AMOUNT_NOT_PROVIDED_REVIEW_REASON);
    expect(row.lastProviderState).toBe(raw);
    expect(payment.status).toBe('PENDING');
    expect(updatePaymentStatusTx).not.toHaveBeenCalled();
  });

  it('montant désormais communiqué mais divergent : reste REVIEW, motif précisé, plus revérifiée', async () => {
    const { row } = await inReview();
    const spy = providerSays({ amount: 1000 });

    await reconcilePendingCheckouts();
    expect(row.status).toBe('REVIEW');
    expect(row.reviewReason).toContain('1000');
    expect(updatePaymentStatusTx).not.toHaveBeenCalled();

    spy.mockClear();
    const again = await reconcilePendingCheckouts();
    expect(again.reviewRechecked).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it('revue « autre devise » : une réponse corrigée en XOF passe en SUCCESS', async () => {
    const { row } = await inReview(`${CURRENCY_MISMATCH_REVIEW_PREFIX}EUR) différente de la devise attendue (XOF).`);
    providerSays({ amount: Number(row.amount), currency: 'FCFA' });

    await reconcilePendingCheckouts();
    expect(row.status).toBe('SUCCESS');
  });

  it.each([
    ['montant divergent', 'Montant reçu (1000) différent du montant attendu (160000).'],
    ['état contraire', 'PaySecureHub rapporte maintenant « FAILED » pour un paiement déjà réussi.']
  ])('revue d’un autre motif (%s) : jamais revérifiée', async (_label, reason) => {
    const { row } = await inReview(reason);
    const spy = providerSays({ amount: 160000, currency: 'XOF' });

    const result = await reconcilePendingCheckouts();

    expect(result.reviewRechecked).toBe(0);
    expect(spy).not.toHaveBeenCalled();
    expect(row.status).toBe('REVIEW');
    expect(row.reviewReason).toBe(reason);
  });

  it('borne de 48 h : dernière vérification, puis arrêt marqué une seule fois, plus d’interrogation', async () => {
    const { row, payment } = await inReview(AMOUNT_NOT_PROVIDED_REVIEW_REASON, 49 * 60 * MINUTES);
    const spy = providerSays({ amount: null });

    const first = await reconcilePendingCheckouts();
    expect(first).toMatchObject({ reviewRechecked: 1, reviewAbandoned: 1, reviewSucceeded: 0 });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(row.status).toBe('REVIEW');
    expect(row.reviewReason).toBe(`${AMOUNT_NOT_PROVIDED_REVIEW_REASON}${REVIEW_RECHECK_ABANDONED_SUFFIX}`);
    expect(payment.status).toBe('PENDING');

    spy.mockClear();
    const second = await reconcilePendingCheckouts();
    expect(second).toMatchObject({ reviewRechecked: 0, reviewAbandoned: 0 });
    expect(spy).not.toHaveBeenCalled();
    expect(row.reviewReason).toBe(`${AMOUNT_NOT_PROVIDED_REVIEW_REASON}${REVIEW_RECHECK_ABANDONED_SUFFIX}`);
  });

  it('borne de 48 h « autre devise » : l’arrêt la sort aussi de la sélection', async () => {
    const reason = `${CURRENCY_MISMATCH_REVIEW_PREFIX}EUR) différente de la devise attendue (XOF).`;
    const { row } = await inReview(reason, 49 * 60 * MINUTES);
    const spy = providerSays({ amount: 160000, currency: 'EUR' });

    expect((await reconcilePendingCheckouts()).reviewAbandoned).toBe(1);
    spy.mockClear();
    expect((await reconcilePendingCheckouts()).reviewRechecked).toBe(0);
    expect(spy).not.toHaveBeenCalled();
    expect(row.reviewReason).toBe(`${reason}${REVIEW_RECHECK_ABANDONED_SUFFIX}`);
  });

  it('fusion 049 : revue déjà tranchée par le gestionnaire (resolution non nulle) : jamais revérifiée', async () => {
    const { row, payment } = await inReview();
    row.resolution = 'REJECT';
    const spy = providerSays({ amount: Number(row.amount), currency: 'XOF' });

    const result = await reconcilePendingCheckouts();

    expect(result.reviewSucceeded).toBe(0);
    expect(spy).not.toHaveBeenCalled();
    expect(row.status).toBe('REVIEW');
    expect(payment.status).toBe('PENDING');
    expect(updatePaymentStatusTx).not.toHaveBeenCalled();
  });

  it('fusion 049 : le bouton « Vérifier » n’encaisse jamais une revue, même « montant non communiqué »', async () => {
    const { row, payment } = await inReview();
    providerSays({ amount: Number(row.amount), currency: 'XOF' });

    await reconcileCheckoutForVerify(TENANT_A, row.id);
    await reconcileCheckout(TENANT_A, row.id);

    expect(row.status).toBe('REVIEW');
    expect(row.reviewReason).toBe(AMOUNT_NOT_PROVIDED_REVIEW_REASON);
    expect(payment.status).toBe('PENDING');
    expect(updatePaymentStatusTx).not.toHaveBeenCalled();
  });

  it('fusion 049 : revérification conforme mais transaction déjà enregistrée ailleurs : reste REVIEW', async () => {
    const { row, payment } = await inReview();
    store.checkouts.push({ ...row, id: 'other-checkout', codePaiement: 'IMT-OTHER', providerTransactionId: 'TX-R' });
    providerSays({ amount: Number(row.amount), currency: 'XOF' });

    const result = await reconcilePendingCheckouts();

    expect(result.reviewSucceeded).toBe(0);
    expect(row.status).toBe('REVIEW');
    expect(payment.status).toBe('PENDING');
    expect(updatePaymentStatusTx).not.toHaveBeenCalled();
  });

  it('agrégateur injoignable : erreur comptée, revue intacte', async () => {
    const { row } = await inReview();
    jest
      .spyOn(simulatorClient, 'getStatus')
      .mockRejectedValue(
        new (jest.requireActual('../../src/lib/payment-gateway/types').GatewayError)('PaySecureHub ne répond pas.')
      );

    const result = await reconcilePendingCheckouts();

    expect(result).toMatchObject({ errors: 1, reviewRechecked: 0, reviewAbandoned: 0 });
    expect(row.status).toBe('REVIEW');
    expect(row.reviewReason).toBe(AMOUNT_NOT_PROVIDED_REVIEW_REASON);
  });

  it('interroge le client du mode de la TENTATIVE, pas le mode courant de l’agence', async () => {
    // Tentative démarrée en réel ; l'agence est repassée depuis en simulateur.
    const { row } = await inReview();
    row.mode = 'LIVE';
    const simulated = providerSays({ amount: Number(row.amount), currency: 'XOF' });
    const live = jest.spyOn(paySecureHubClient, 'getStatus').mockResolvedValue({
      rawState: 'SUCCESSFUL',
      mappedState: 'SUCCESS',
      transactionId: 'TX-LIVE',
      amount: null,
      fees: 0,
      serviceName: 'Wave',
      error: null,
      raw: {}
    } as unknown as Awaited<ReturnType<typeof simulatorClient.getStatus>>);

    await reconcilePendingCheckouts();

    expect(live).toHaveBeenCalledTimes(1);
    expect(simulated).not.toHaveBeenCalled();
    expect(row.status).toBe('REVIEW');
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

  it('status/transact : conserve la devise numérique 952 en chaîne', async () => {
    mockFetch(200, { payments: { state: 'Successful', amount: 100, currency: 952 } });
    const status = await paySecureHubClient.getStatus(credentials, 'IMT-ABC');
    expect(status.currency).toBe('952');
  });

  it('réponse en erreur : GatewayError dont le message ne porte jamais la clé', async () => {
    mockFetch(500, { error: 'boom' });
    await expect(paySecureHubClient.getStatus(credentials, 'IMT-ABC')).rejects.toMatchObject({
      name: 'GatewayError',
      message: expect.not.stringContaining('cle-de-test')
    });
  });
});
