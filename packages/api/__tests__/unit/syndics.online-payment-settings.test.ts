/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Spec 042, lot M2b : configuration du paiement mobile PAR COPROPRIETE
 * (`lib/syndics/online-payment/gateway-settings.ts`, contrat §1.1 a 1.4).
 *
 * Prisma est remplace par un magasin en memoire : aucune base requise. Le
 * fournisseur est un faux client ; le chiffrement AES est reel (cle de test).
 */

import { randomBytes } from 'crypto';

type Row = Record<string, any>;

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const SYNDIC_A = '11111111-1111-4111-8111-111111111111';
const SYNDIC_B = '22222222-2222-4222-8222-222222222222';

const store = {
  syndicates: [] as Row[],
  configs: [] as Row[],
  agencyConfigs: [] as Row[],
  checkouts: [] as Row[],
  seq: 0
};

function resetStore() {
  store.syndicates = [
    { id: SYNDIC_A, tenantId: TENANT_A },
    { id: SYNDIC_B, tenantId: TENANT_B }
  ];
  store.configs = [];
  store.agencyConfigs = [];
  store.checkouts = [];
  store.seq = 0;
}

const matches = (row: Row, where: Row = {}) =>
  Object.entries(where).every(([key, value]) => value === undefined || row[key] === value);

const mockPrisma: Row = {
  syndicate: { findFirst: jest.fn(async ({ where }: Row) => store.syndicates.find(r => matches(r, where)) ?? null) },
  chartOfAccount: { findFirst: jest.fn(async () => null) },
  paymentGatewayConfig: {
    findFirst: jest.fn(async ({ where }: Row) => store.agencyConfigs.find(r => matches(r, where)) ?? null)
  },
  syndicOnlineCheckout: {
    count: jest.fn(async ({ where }: Row) => store.checkouts.filter(r => matches(r, where)).length)
  },
  syndicPaymentGatewayConfig: {
    findFirst: jest.fn(async ({ where }: Row) => store.configs.find(r => matches(r, where)) ?? null),
    upsert: jest.fn(async ({ where, create, update }: Row) => {
      const found = store.configs.find(r => matches(r, where));
      if (found) {
        Object.assign(found, update, { updatedAt: new Date() });
        return found;
      }
      store.seq += 1;
      const created = {
        id: `cfg-${store.seq}`,
        provider: 'PAYSECUREHUB',
        mode: 'SIMULATOR',
        isActive: false,
        merchantId: null,
        apiKeyEncrypted: null,
        apiKeyLast4: null,
        lastTestAt: null,
        lastTestOk: null,
        lastTestMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...create
      };
      store.configs.push(created);
      return created;
    })
  },
  $transaction: jest.fn(async (arg: any) => arg(mockPrisma))
};

jest.mock('../../src/utils/database', () => ({
  prisma: new Proxy({}, { get: (_target, prop) => (mockPrisma as any)[prop] })
}));

jest.mock('../../src/config/env', () => {
  const actual = jest.requireActual('../../src/config/env');
  return {
    ...actual,
    env: {
      ...actual.env,
      PAYMENT_SECRETS_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      BACKEND_URL: 'http://api.test'
    }
  };
});

const flags = { simulatorAvailable: true };
jest.mock('../../src/lib/payment-gateway/config', () => ({
  get paymentGatewaySimulatorAvailable() {
    return flags.simulatorAvailable;
  }
}));

const providerClient = { getBalance: jest.fn() };
jest.mock('../../src/lib/payment-gateway/paysecurehub', () => ({
  gatewayClientForMode: () => providerClient
}));

jest.mock('../../src/lib/syndics/charge-allocation', () => {
  const { NotFoundError } = jest.requireActual('../../src/middleware/error-middleware');
  return {
    assertSyndicateOfTenant: jest.fn(async (_client: unknown, tenantId: string, syndicateId: string) => {
      if (!store.syndicates.some(s => s.id === syndicateId && s.tenantId === tenantId)) {
        throw new NotFoundError('Copropriété introuvable ou inaccessible.');
      }
    })
  };
});

jest.mock('../../src/lib/syndics/online-payment/payout', () => ({
  getCollectionBalance: jest.fn(async () => 0)
}));

jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));

import { env } from '../../src/config/env';
import { AppError, ErrorCode } from '../../src/middleware/error-middleware';
import { GatewayError } from '../../src/lib/payment-gateway/types';
import { logAuditEvent } from '../../src/services/audit-service';
import {
  getSyndicGatewaySettings,
  getSyndicProviderBalance,
  testSyndicGatewayConnection,
  updateSyndicGatewaySettings,
  updateSyndicGatewaySettingsSchema
} from '../../src/lib/syndics/online-payment/gateway-settings';

const API_KEY = 'sk_live_super_secret_key_1234';
const ACTOR = 'user-1';

const update = (input: Record<string, unknown>, tenantId = TENANT_A, syndicateId = SYNDIC_A) =>
  updateSyndicGatewaySettings(tenantId, syndicateId, updateSyndicGatewaySettingsSchema.parse(input), ACTOR);

async function expectAppError(promise: Promise<unknown>, status: number, code: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).statusCode).toBe(status);
  expect((error as AppError).code).toBe(code);
}

beforeEach(() => {
  resetStore();
  jest.clearAllMocks();
  flags.simulatorAvailable = true;
  (env as any).PAYMENT_SECRETS_KEY = randomBytes(32).toString('base64');
});

describe('lecture de la configuration (1.1)', () => {
  it('sans ligne : valeurs par défaut, rien n’est créé', async () => {
    const settings = await getSyndicGatewaySettings(TENANT_A, SYNDIC_A);
    expect(settings).toMatchObject({
      syndicateId: SYNDIC_A,
      mode: 'SIMULATOR',
      isActive: false,
      merchantId: null,
      apiKeyConfigured: false,
      apiKeyLast4: null,
      usable: false,
      agencyFeesPaidBy: 'CLIENT',
      collectionAccount: { accountNumber: '5525', exists: false, balance: 0 },
      updatedAt: null,
      lastTest: null
    });
    expect(settings.callbackUrl).toBe('http://api.test/api/payment-gateway/paysecurehub/ipn');
    expect(store.configs).toHaveLength(0);
  });

  it('une copropriété d’une autre agence répond 404', async () => {
    await expectAppError(getSyndicGatewaySettings(TENANT_A, SYNDIC_B), 404, ErrorCode.NOT_FOUND);
  });

  it('les frais suivent la configuration de l’agence', async () => {
    store.agencyConfigs.push({ tenantId: TENANT_A, feesPaidBy: 'AGENCY' });
    expect((await getSyndicGatewaySettings(TENANT_A, SYNDIC_A)).agencyFeesPaidBy).toBe('AGENCY');
  });
});

describe('écriture de la configuration (1.2)', () => {
  it('la clé est chiffrée en base et jamais renvoyée', async () => {
    const settings = await update({ mode: 'LIVE', isActive: true, merchantId: ' M-1 ', apiKey: API_KEY });

    const row = store.configs[0];
    expect(row.tenantId).toBe(TENANT_A);
    expect(row.merchantId).toBe('M-1');
    expect(row.apiKeyEncrypted).toMatch(/^pg1:/);
    expect(row.apiKeyEncrypted).not.toContain(API_KEY);
    expect(row.updatedByUserId).toBe(ACTOR);

    expect(settings).toMatchObject({ apiKeyConfigured: true, apiKeyLast4: '1234', usable: true, mode: 'LIVE' });
    const serialized = JSON.stringify(settings);
    expect(serialized).not.toContain(API_KEY);
    expect(serialized).not.toContain(row.apiKeyEncrypted);
    expect(serialized).not.toContain('apiKeyEncrypted');
  });

  it('absent = inchangé, chaîne vide = efface', async () => {
    await update({ mode: 'LIVE', merchantId: 'M-1', apiKey: API_KEY });
    await update({ isActive: false });
    expect(store.configs[0]).toMatchObject({ merchantId: 'M-1', apiKeyLast4: '1234' });
    expect(store.configs[0].apiKeyEncrypted).toMatch(/^pg1:/);

    await update({ apiKey: '', merchantId: '' });
    expect(store.configs[0]).toMatchObject({ merchantId: null, apiKeyEncrypted: null, apiKeyLast4: null });
  });

  it('le schéma refuse un champ inconnu (tenantId, syndicateId…)', () => {
    expect(updateSyndicGatewaySettingsSchema.safeParse({ tenantId: TENANT_B }).success).toBe(false);
    expect(updateSyndicGatewaySettingsSchema.safeParse({ mode: 'TEST' }).success).toBe(false);
    expect(updateSyndicGatewaySettingsSchema.safeParse({ apiKey: 'x'.repeat(501) }).success).toBe(false);
  });

  it('refuse le simulateur quand il est indisponible sur ce serveur', async () => {
    flags.simulatorAvailable = false;
    await expectAppError(update({ mode: 'SIMULATOR' }), 400, ErrorCode.GATEWAY_SIMULATOR_UNAVAILABLE);
    await expectAppError(update({ isActive: true }), 400, ErrorCode.GATEWAY_SIMULATOR_UNAVAILABLE);
    expect(store.configs).toHaveLength(0);
  });

  it('refuse une clé sans PAYMENT_SECRETS_KEY', async () => {
    (env as any).PAYMENT_SECRETS_KEY = undefined;
    await expectAppError(update({ mode: 'LIVE', apiKey: API_KEY }), 400, ErrorCode.GATEWAY_ENCRYPTION_UNAVAILABLE);
    expect(store.configs).toHaveLength(0);
  });

  it('refuse l’activation en LIVE sans identifiant marchand ou sans clé', async () => {
    await expectAppError(
      update({ mode: 'LIVE', isActive: true, apiKey: API_KEY }),
      400,
      ErrorCode.GATEWAY_CREDENTIALS_REQUIRED
    );
    await expectAppError(
      update({ mode: 'LIVE', isActive: true, merchantId: 'M-1' }),
      400,
      ErrorCode.GATEWAY_CREDENTIALS_REQUIRED
    );
    expect(store.configs).toHaveLength(0);
  });

  describe('paiement PENDING', () => {
    beforeEach(async () => {
      await update({ mode: 'LIVE', isActive: true, merchantId: 'M-1', apiKey: API_KEY });
      store.checkouts.push({ tenantId: TENANT_A, syndicateId: SYNDIC_A, status: 'PENDING' });
    });

    it('409 si le mode, l’identifiant marchand ou la clé change', async () => {
      await expectAppError(update({ mode: 'SIMULATOR' }), 409, ErrorCode.GATEWAY_CHECKOUTS_PENDING);
      await expectAppError(update({ merchantId: 'M-2' }), 409, ErrorCode.GATEWAY_CHECKOUTS_PENDING);
      await expectAppError(update({ apiKey: 'autre-cle-9999' }), 409, ErrorCode.GATEWAY_CHECKOUTS_PENDING);
      await expectAppError(update({ apiKey: '', isActive: false }), 409, ErrorCode.GATEWAY_CHECKOUTS_PENDING);
      expect(store.configs[0].merchantId).toBe('M-1');
    });

    it('réécrire les mêmes valeurs ou activer/désactiver reste permis', async () => {
      await update({ mode: 'LIVE', merchantId: 'M-1', apiKey: API_KEY });
      const settings = await update({ isActive: false });
      expect(settings.isActive).toBe(false);
    });

    it('un paiement PENDING d’une autre copropriété ne bloque pas', async () => {
      store.checkouts.length = 0;
      store.checkouts.push({ tenantId: TENANT_B, syndicateId: SYNDIC_B, status: 'PENDING' });
      await expect(update({ merchantId: 'M-2' })).resolves.toMatchObject({ merchantId: 'M-2' });
    });
  });

  it('copropriété d’une autre agence : 404 et rien d’écrit', async () => {
    await expectAppError(update({ merchantId: 'M-1' }, TENANT_A, SYNDIC_B), 404, ErrorCode.NOT_FOUND);
    expect(store.configs).toHaveLength(0);
  });

  it('audit sans secret', async () => {
    await update({ mode: 'LIVE', isActive: true, merchantId: 'M-1', apiKey: API_KEY });
    expect(logAuditEvent).toHaveBeenCalledTimes(1);
    const entry = (logAuditEvent as jest.Mock).mock.calls[0][0];
    expect(entry.actionKey).toBe('SYNDIC_GATEWAY_CONFIG_UPDATED');
    expect(entry.payload).toEqual({
      syndicateId: SYNDIC_A,
      mode: 'LIVE',
      isActive: true,
      merchantIdChanged: true,
      apiKeyChanged: true
    });
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain(API_KEY);
    expect(serialized).not.toContain('1234');
    expect(serialized).not.toContain('pg1:');
  });
});

describe('test de connexion (1.3)', () => {
  it('simulateur : ok, solde nul ; la ligne est créée inactive', async () => {
    const result = await testSyndicGatewayConnection(TENANT_A, SYNDIC_A);
    expect(result).toMatchObject({ ok: true, balance: null });
    expect(store.configs[0]).toMatchObject({ tenantId: TENANT_A, isActive: false, lastTestOk: true });
  });

  it('LIVE sans identifiants : ok false, jamais d’appel fournisseur', async () => {
    await update({ mode: 'LIVE' });
    const result = await testSyndicGatewayConnection(TENANT_A, SYNDIC_A);
    expect(result.ok).toBe(false);
    expect(providerClient.getBalance).not.toHaveBeenCalled();
  });

  it('LIVE : utilise la clé de la copropriété et enregistre le solde', async () => {
    await update({ mode: 'LIVE', isActive: true, merchantId: 'M-1', apiKey: API_KEY });
    providerClient.getBalance.mockResolvedValue({ amount: 5000, currency: 'XOF' });
    const result = await testSyndicGatewayConnection(TENANT_A, SYNDIC_A);
    expect(result).toMatchObject({ ok: true, balance: { amount: 5000, currency: 'XOF' } });
    const credentials = providerClient.getBalance.mock.calls[0][0];
    expect(credentials).toMatchObject({ merchantId: 'M-1', apiKey: API_KEY, tenantId: TENANT_A });
    expect(store.configs[0].lastTestOk).toBe(true);
  });

  it('panne fournisseur : ok false (jamais une exception)', async () => {
    await update({ mode: 'LIVE', isActive: true, merchantId: 'M-1', apiKey: API_KEY });
    providerClient.getBalance.mockRejectedValue(new GatewayError('Délai dépassé'));
    const result = await testSyndicGatewayConnection(TENANT_A, SYNDIC_A);
    expect(result).toMatchObject({ ok: false, balance: null });
    expect(store.configs[0].lastTestOk).toBe(false);
  });

  it('copropriété d’une autre agence : 404', async () => {
    await expectAppError(testSyndicGatewayConnection(TENANT_A, SYNDIC_B), 404, ErrorCode.NOT_FOUND);
  });
});

describe('solde fournisseur (1.4)', () => {
  it('simulateur : indisponible, avec le motif', async () => {
    const result = await getSyndicProviderBalance(TENANT_A, SYNDIC_A);
    expect(result).toMatchObject({ available: false, balance: null, message: 'Mode simulateur' });
  });

  it('LIVE : renvoie le solde du compte de la copropriété', async () => {
    await update({ mode: 'LIVE', isActive: true, merchantId: 'M-1', apiKey: API_KEY });
    providerClient.getBalance.mockResolvedValue({ amount: 120000, currency: 'XOF' });
    const result = await getSyndicProviderBalance(TENANT_A, SYNDIC_A);
    expect(result).toMatchObject({ available: true, message: null, balance: { amount: 120000, currency: 'XOF' } });
  });

  it('fournisseur injoignable : available false, jamais une exception', async () => {
    await update({ mode: 'LIVE', isActive: true, merchantId: 'M-1', apiKey: API_KEY });
    providerClient.getBalance.mockRejectedValue(new GatewayError('Injoignable'));
    await expect(getSyndicProviderBalance(TENANT_A, SYNDIC_A)).resolves.toMatchObject({
      available: false,
      balance: null
    });
  });
});
