/**
 * Lot SMS-1 — fournisseur SMS (fondations).
 *
 * Couvre :
 *  - `normalizeCiPhone` : formats acceptés/rejetés (§ décision produit du lot).
 *  - `OrangeSmsProvider` : jeton en cache puis renouvelé après expiration,
 *    URL/corps d'envoi exacts, `senderName` omis s'il est vide,
 *    `providerMessageId` extrait, erreur HTTP -> `SmsProviderError`, solde.
 *  - `getTenantSmsOverview` / `updateTenantSmsSettings` / `sendTestSms` :
 *    valeurs par défaut, quota, FAILED non compté, mois courant seulement.
 *  - Gardes de route : 403 pour un non super-admin sur `/api/admin/sms/*`,
 *    et isolation agence A / agence B sur les réglages SMS.
 *
 * Prisma est remplacé par un magasin en mémoire (même esprit que
 * `payment-gateway.test.ts`) : aucune base n'est requise.
 */

type Row = Record<string, any>;

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

const store = {
  tenants: [] as Row[],
  smsSettings: [] as Row[],
  smsMessages: [] as Row[],
  memberships: [] as Row[],
  userRoles: [] as Row[],
  tenantClients: [] as Row[],
  seq: 0
};

function resetStore() {
  store.tenants = [
    { id: TENANT_A, status: 'ACTIVE' },
    { id: TENANT_B, status: 'ACTIVE' }
  ];
  store.smsSettings = [];
  store.smsMessages = [];
  store.memberships = [];
  store.userRoles = [];
  store.tenantClients = [];
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
    if (key === 'userId_tenantId') {
      return row.userId === condition.userId && row.tenantId === condition.tenantId;
    }
    const value = row[key];
    if (condition !== null && typeof condition === 'object' && !(condition instanceof Date)) {
      if ('not' in condition) return value !== condition.not;
      if ('gte' in condition) return value >= condition.gte;
      if ('lte' in condition) return value <= condition.lte;
      if ('in' in condition) return condition.in.includes(value);
      return false;
    }
    return value === condition;
  });
}

function delegate(collection: () => Row[], prefix: string, defaults: () => Row = () => ({})) {
  return {
    findUnique: jest.fn(async ({ where }: Row = {}) => collection().find(r => matches(r, where)) ?? null),
    findFirst: jest.fn(async ({ where }: Row = {}) => collection().find(r => matches(r, where)) ?? null),
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
      Object.assign(found, data, { updatedAt: new Date() });
      return found;
    }),
    upsert: jest.fn(async ({ where, create, update }: Row) => {
      const found = collection().find(r => matches(r, where));
      if (found) {
        Object.assign(found, update, { updatedAt: new Date() });
        return found;
      }
      const created = { id: nextId(prefix), createdAt: new Date(), updatedAt: new Date(), ...defaults(), ...create };
      collection().push(created);
      return created;
    })
  };
}

const mockPrisma: Row = {
  tenant: delegate(() => store.tenants, 'tenant'),
  tenantSmsSettings: delegate(() => store.smsSettings, 'sms-settings'),
  smsMessage: delegate(() => store.smsMessages, 'sms-message'),
  membership: delegate(() => store.memberships, 'membership'),
  userRole: delegate(() => store.userRoles, 'user-role'),
  tenantClient: delegate(() => store.tenantClients, 'tenant-client')
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

beforeEach(() => {
  resetStore();
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// normalizeCiPhone
// ---------------------------------------------------------------------------

import { normalizeCiPhone } from '../../src/lib/sms/phone';

describe('normalizeCiPhone', () => {
  it.each([
    ['0102030405', '+2250102030405'],
    ['01 02 03 04 05', '+2250102030405'],
    ['+2250102030405', '+2250102030405'],
    ['002250102030405', '+2250102030405'],
    ['2250102030405', '+2250102030405'],
    ['01-02-03-04-05', '+2250102030405']
  ])('%p -> %p', (input, expected) => {
    expect(normalizeCiPhone(input)).toBe(expected);
  });

  it.each([
    [null],
    [undefined],
    [''],
    ['01020304'], // ancien format à 8 chiffres : jamais deviné
    ['+33612345678'], // autre indicatif pays
    ['0102030405ABC'], // lettres
    ['abcdefghij'],
    ['+225010203040'] // 11 chiffres locaux : invalide
  ])('rejette %p', input => {
    expect(normalizeCiPhone(input as any)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// OrangeSmsProvider
// ---------------------------------------------------------------------------

describe('OrangeSmsProvider (sans réseau, fetch simulé)', () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  function setOrangeEnv() {
    process.env.SMS_PROVIDER = 'orange';
    process.env.ORANGE_SMS_CLIENT_ID = 'client-id';
    process.env.ORANGE_SMS_CLIENT_SECRET = 'client-secret';
    process.env.ORANGE_SMS_API_BASE_URL = 'https://api.orange.test';
    process.env.ORANGE_SMS_SENDER_ADDRESS = 'tel:+2250000';
    process.env.ORANGE_SMS_PLATFORM_SENDER_NAME = '';
  }

  /**
   * Charge un module `orange-sms.provider.ts` neuf, avec son propre `env` et
   * son propre cache de jeton. `types.ts` est requis dans le MÊME callback
   * `jest.isolateModules` : sinon `SmsProviderError` obtenu par un `require`
   * extérieur serait une classe différente (autre registre de modules) de
   * celle réellement levée par le provider isolé, et `toBeInstanceOf` échouerait
   * malgré des erreurs de même nom.
   */
  function loadProvider(): {
    OrangeSmsProvider: typeof import('../../src/services/providers/sms/orange-sms.provider').OrangeSmsProvider;
    SmsProviderError: typeof import('../../src/services/providers/sms/types').SmsProviderError;
  } {
    let providerMod: typeof import('../../src/services/providers/sms/orange-sms.provider') | undefined;
    let typesMod: typeof import('../../src/services/providers/sms/types') | undefined;
    jest.isolateModules(() => {
      providerMod = require('../../src/services/providers/sms/orange-sms.provider');
      typesMod = require('../../src/services/providers/sms/types');
    });
    return { OrangeSmsProvider: providerMod!.OrangeSmsProvider, SmsProviderError: typesMod!.SmsProviderError };
  }

  beforeEach(() => {
    process.env = { ...originalEnv };
    setOrangeEnv();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  function mockFetchSequence(responses: Array<{ status: number; body: unknown }>) {
    const fn = jest.fn();
    for (const { status, body } of responses) {
      fn.mockImplementationOnce(async () => ({
        ok: status >= 200 && status < 300,
        status,
        text: async () => JSON.stringify(body)
      }));
    }
    global.fetch = fn as unknown as typeof fetch;
    return fn;
  }

  it("obtient un jeton (Basic id:secret), l'utilise en Bearer, et le met en cache pour l'appel suivant", async () => {
    const { OrangeSmsProvider } = loadProvider();
    const provider = new OrangeSmsProvider();

    const fetchMock = mockFetchSequence([
      { status: 200, body: { access_token: 'tok-1', expires_in: 3600 } },
      { status: 200, body: { outboundSMSMessageRequest: { resourceURL: 'https://api.orange.test/.../requests/msg-1' } } },
      // Deuxième envoi : pas de nouvel appel de jeton attendu (mis en cache).
      { status: 200, body: { outboundSMSMessageRequest: { resourceURL: 'https://api.orange.test/.../requests/msg-2' } } }
    ]);

    const first = await provider.sendText({ to: '+2250102030405', body: 'Bonjour' });
    expect(first.providerMessageId).toBe('msg-1');

    const second = await provider.sendText({ to: '+2250102030405', body: 'Re-bonjour' });
    expect(second.providerMessageId).toBe('msg-2');

    // 1 appel de jeton (Basic) + 2 envois (Bearer) = 3 appels fetch, pas 4.
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(tokenUrl).toBe('https://api.orange.test/oauth/v3/token');
    const basic = Buffer.from('client-id:client-secret').toString('base64');
    expect((tokenInit.headers as Record<string, string>).Authorization).toBe(`Basic ${basic}`);
    expect(tokenInit.body).toBe('grant_type=client_credentials');

    const [, sendInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect((sendInit.headers as Record<string, string>).Authorization).toBe('Bearer tok-1');
  });

  it('renouvelle le jeton une fois expiré (marge de 60 s)', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const { OrangeSmsProvider } = loadProvider();
    const provider = new OrangeSmsProvider();

    const fetchMock = mockFetchSequence([
      { status: 200, body: { access_token: 'tok-1', expires_in: 3600 } },
      { status: 200, body: { outboundSMSMessageRequest: { resourceURL: '.../requests/msg-1' } } },
      { status: 200, body: { access_token: 'tok-2', expires_in: 3600 } },
      { status: 200, body: { outboundSMSMessageRequest: { resourceURL: '.../requests/msg-2' } } }
    ]);

    await provider.sendText({ to: '+2250102030405', body: 'a' });

    // 3600s - 60s de marge : juste après ce seuil, le jeton doit être renouvelé.
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z').getTime() + (3600 - 59) * 1000);
    await provider.sendText({ to: '+2250102030405', body: 'b' });

    expect(fetchMock).toHaveBeenCalledTimes(4); // 2 jetons + 2 envois
    const [, secondSendInit] = fetchMock.mock.calls[3] as [string, RequestInit];
    expect((secondSendInit.headers as Record<string, string>).Authorization).toBe('Bearer tok-2');

    jest.useRealTimers();
  });

  it("construit l'URL et le corps d'envoi exacts, avec senderName", async () => {
    const { OrangeSmsProvider } = loadProvider();
    const provider = new OrangeSmsProvider();
    const fetchMock = mockFetchSequence([
      { status: 200, body: { access_token: 'tok-1', expires_in: 3600 } },
      { status: 200, body: { outboundSMSMessageRequest: { resourceURL: '.../requests/msg-1' } } }
    ]);

    await provider.sendText({ to: '+2250102030405', body: 'Loyer echu', senderName: 'IMMOTOPIA' });

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe(
      `https://api.orange.test/smsmessaging/v1/outbound/${encodeURIComponent('tel:+2250000')}/requests`
    );
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      outboundSMSMessageRequest: {
        address: 'tel:+2250102030405',
        senderAddress: 'tel:+2250000',
        outboundSMSTextMessage: { message: 'Loyer echu' },
        senderName: 'IMMOTOPIA'
      }
    });
  });

  it('omet senderName quand il est vide', async () => {
    const { OrangeSmsProvider } = loadProvider();
    const provider = new OrangeSmsProvider();
    const fetchMock = mockFetchSequence([
      { status: 200, body: { access_token: 'tok-1', expires_in: 3600 } },
      { status: 200, body: { outboundSMSMessageRequest: { resourceURL: '.../requests/msg-1' } } }
    ]);

    await provider.sendText({ to: '+2250102030405', body: 'Loyer echu' });

    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.outboundSMSMessageRequest).not.toHaveProperty('senderName');
  });

  it('extrait le providerMessageId du dernier segment de resourceURL', async () => {
    const { OrangeSmsProvider } = loadProvider();
    const provider = new OrangeSmsProvider();
    mockFetchSequence([
      { status: 200, body: { access_token: 'tok-1', expires_in: 3600 } },
      {
        status: 200,
        body: {
          outboundSMSMessageRequest: {
            resourceURL: 'https://api.orange.test/smsmessaging/v1/outbound/tel%3A%2B2250000/requests/AbC-123'
          }
        }
      }
    ]);

    const result = await provider.sendText({ to: '+2250102030405', body: 'x' });
    expect(result.providerMessageId).toBe('AbC-123');
  });

  it('une erreur HTTP lors du token lève SmsProviderError', async () => {
    const { OrangeSmsProvider, SmsProviderError } = loadProvider();
    const provider = new OrangeSmsProvider();
    mockFetchSequence([{ status: 401, body: { error: 'invalid_client' } }]);

    await expect(provider.sendText({ to: '+2250102030405', body: 'x' })).rejects.toBeInstanceOf(SmsProviderError);
  });

  it("une erreur HTTP lors de l'envoi lève SmsProviderError", async () => {
    const { OrangeSmsProvider, SmsProviderError } = loadProvider();
    const provider = new OrangeSmsProvider();
    mockFetchSequence([
      { status: 200, body: { access_token: 'tok-1', expires_in: 3600 } },
      { status: 500, body: { error: 'boom' } }
    ]);

    await expect(provider.sendText({ to: '+2250102030405', body: 'x' })).rejects.toBeInstanceOf(SmsProviderError);
  });

  it('lit le solde (contracts), mapping défensif', async () => {
    const { OrangeSmsProvider } = loadProvider();
    const provider = new OrangeSmsProvider();
    mockFetchSequence([
      { status: 200, body: { access_token: 'tok-1', expires_in: 3600 } },
      {
        status: 200,
        body: {
          contracts: [
            { country: 'CI', availableUnits: 4200, expiresAt: '2026-12-31', status: 'ACTIVE' },
            { unexpectedField: 'ignored' }
          ]
        }
      }
    ]);

    const balance = await provider.getBalance();
    expect(balance).toEqual({
      contracts: [
        { country: 'CI', availableUnits: 4200, expiresAt: '2026-12-31', status: 'ACTIVE' },
        { country: undefined, availableUnits: 0, expiresAt: null, status: undefined }
      ]
    });
  });

  it('testConnection : jeton + contracts, sans envoyer de SMS', async () => {
    const { OrangeSmsProvider } = loadProvider();
    const provider = new OrangeSmsProvider();
    const fetchMock = mockFetchSequence([
      { status: 200, body: { access_token: 'tok-1', expires_in: 3600 } },
      { status: 200, body: { contracts: [] } }
    ]);

    const result = await provider.testConnection();
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).not.toContain('smsmessaging');
    }
  });
});

// ---------------------------------------------------------------------------
// getTenantSmsOverview / updateTenantSmsSettings / sendTestSms
// ---------------------------------------------------------------------------

describe('Réglages SMS de l’agence', () => {
  let settings: typeof import('../../src/lib/sms/settings');
  // Chargé dans le MÊME registre isolé que `settings` (même `jest.isolateModules`
  // callback) : `settings.ts` importe `services/providers/sms` en interne, et un
  // `require(...)` fait hors de ce callback obtiendrait une AUTRE instance de
  // module (donc un autre singleton `getSmsProvider()`) — un `jest.spyOn` posé
  // dessus n'affecterait jamais l'appel réel fait par `sendTestSms`.
  let smsProviderModule: typeof import('../../src/services/providers/sms');
  // Même raison : les classes d'erreur doivent venir du MÊME registre isolé
  // que celui qui les lève réellement dans `settings.ts`, sinon
  // `toBeInstanceOf` échoue malgré des erreurs de même nom.
  let errorMiddleware: typeof import('../../src/middleware/error-middleware');

  beforeEach(() => {
    process.env.SMS_PROVIDER = 'log';
    process.env.SMS_DEFAULT_MONTHLY_QUOTA = '100';
    process.env.ORANGE_SMS_PLATFORM_SENDER_NAME = '';
    jest.isolateModules(() => {
      settings = require('../../src/lib/sms/settings');
      smsProviderModule = require('../../src/services/providers/sms');
      errorMiddleware = require('../../src/middleware/error-middleware');
    });
  });

  it('sans ligne de réglages : désactivé, valeurs par défaut, sans rien écrire', async () => {
    const overview = await settings.getTenantSmsOverview(TENANT_A);
    expect(overview).toMatchObject({
      enabled: false,
      senderName: '',
      senderNameIsDefault: true,
      monthlyQuota: 100,
      monthlyQuotaIsDefault: true,
      usedThisMonth: 0,
      remainingThisMonth: 100,
      provider: 'log'
    });
    expect(store.smsSettings).toHaveLength(0);
  });

  it('agence introuvable : NotFoundError', async () => {
    await expect(settings.getTenantSmsOverview('tenant-inconnu')).rejects.toBeInstanceOf(errorMiddleware.NotFoundError);
  });

  it('updateTenantSmsSettings : upsert enabled/senderName/monthlyQuota', async () => {
    const overview = await settings.updateTenantSmsSettings(TENANT_A, {
      enabled: true,
      senderName: 'AGENCEKIPE',
      monthlyQuota: 500
    });
    expect(overview.enabled).toBe(true);
    expect(overview.senderName).toBe('AGENCEKIPE');
    expect(overview.senderNameIsDefault).toBe(false);
    expect(overview.monthlyQuota).toBe(500);
    expect(overview.monthlyQuotaIsDefault).toBe(false);
    expect(store.smsSettings).toHaveLength(1);
  });

  it('updateTenantSmsSettings : senderName invalide -> BadRequestError (schema Zod)', () => {
    expect(() => settings.updateTenantSmsSettingsSchema.parse({ senderName: 'nom avec espace' })).toThrow();
    expect(() => settings.updateTenantSmsSettingsSchema.parse({ senderName: 'DOUZE-CARACTER' })).toThrow();
    expect(() => settings.updateTenantSmsSettingsSchema.parse({ monthlyQuota: -1 })).toThrow();
    expect(() => settings.updateTenantSmsSettingsSchema.parse({ monthlyQuota: 2_000_000 })).toThrow();
  });

  it('senderName/monthlyQuota null réinitialisent au défaut de la plateforme', async () => {
    await settings.updateTenantSmsSettings(TENANT_A, { senderName: 'AGENCEKIPE', monthlyQuota: 500 });
    const overview = await settings.updateTenantSmsSettings(TENANT_A, { senderName: null, monthlyQuota: null });
    expect(overview.senderNameIsDefault).toBe(true);
    expect(overview.monthlyQuotaIsDefault).toBe(true);
  });

  describe('usedThisMonth / remainingThisMonth', () => {
    it('FAILED non compté, SENT/QUEUED/DELIVERED comptés, envois de test compris', async () => {
      store.smsMessages.push(
        { id: 'm1', tenantId: TENANT_A, status: 'SENT', createdAt: new Date(), notificationKey: null },
        { id: 'm2', tenantId: TENANT_A, status: 'QUEUED', createdAt: new Date(), notificationKey: null },
        { id: 'm3', tenantId: TENANT_A, status: 'DELIVERED', createdAt: new Date(), notificationKey: 'INSTALLMENT_DUE_REMINDER' },
        { id: 'm4', tenantId: TENANT_A, status: 'FAILED', createdAt: new Date(), notificationKey: null }
      );
      const overview = await settings.getTenantSmsOverview(TENANT_A);
      expect(overview.usedThisMonth).toBe(3);
    });

    it('ne compte que le mois en cours', async () => {
      const lastMonth = new Date();
      lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
      store.smsMessages.push(
        { id: 'm1', tenantId: TENANT_A, status: 'SENT', createdAt: lastMonth, notificationKey: null },
        { id: 'm2', tenantId: TENANT_A, status: 'SENT', createdAt: new Date(), notificationKey: null }
      );
      const overview = await settings.getTenantSmsOverview(TENANT_A);
      expect(overview.usedThisMonth).toBe(1);
    });

    it("n'inclut pas les messages d'une autre agence", async () => {
      store.smsMessages.push({ id: 'm1', tenantId: TENANT_B, status: 'SENT', createdAt: new Date(), notificationKey: null });
      const overview = await settings.getTenantSmsOverview(TENANT_A);
      expect(overview.usedThisMonth).toBe(0);
    });
  });

  describe('sendTestSms', () => {
    it('numéro invalide -> BadRequestError, aucun message créé', async () => {
      await expect(settings.sendTestSms(TENANT_A, { to: '0102' }, 'user-1')).rejects.toBeInstanceOf(
        errorMiddleware.BadRequestError
      );
      expect(store.smsMessages).toHaveLength(0);
    });

    it('QUEUED -> SENT (fournisseur log)', async () => {
      const message = await settings.sendTestSms(TENANT_A, { to: '0102030405' }, 'user-1');
      expect(message.status).toBe('SENT');
      expect(message.to).toBe('+2250102030405');
      expect(message.providerMessageId).toMatch(/^log-/);
      expect(message.notificationKey).toBeNull();
      expect(message.createdByUserId).toBe('user-1');
    });

    it('corps par défaut quand body est omis', async () => {
      const message = await settings.sendTestSms(TENANT_A, { to: '0102030405' }, 'user-1');
      expect(message.body).toBe('Message de test ImmoTopia.');
    });

    it('QUEUED -> FAILED quand le fournisseur échoue', async () => {
      const provider = smsProviderModule.getSmsProvider();
      const spy = jest.spyOn(provider, 'sendText').mockRejectedValueOnce(new Error('panne réseau'));

      const message = await settings.sendTestSms(TENANT_A, { to: '0102030405' }, 'user-1');
      expect(message.status).toBe('FAILED');
      expect(message.errorMessage).toBeTruthy();
      spy.mockRestore();
    });

    it('quota épuisé -> ConflictError, aucun envoi tenté', async () => {
      await settings.updateTenantSmsSettings(TENANT_A, { monthlyQuota: 1 });
      store.smsMessages.push({ id: 'm1', tenantId: TENANT_A, status: 'SENT', createdAt: new Date(), notificationKey: null });

      await expect(settings.sendTestSms(TENANT_A, { to: '0102030405' }, 'user-1')).rejects.toBeInstanceOf(
        errorMiddleware.ConflictError
      );
      // Le message QUEUED du dépassement n'a pas été créé : seul le SENT du seed existe.
      expect(store.smsMessages).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Gardes de route : 403 super-admin, isolation agence A / agence B
// ---------------------------------------------------------------------------

jest.mock('../../src/services/permission-service', () => ({
  hasPermission: jest.fn(),
  hasAnyPermission: jest.fn(),
  hasAllPermissions: jest.fn()
}));

describe('Gardes de route SMS', () => {
  function buildReqRes(overrides: Row = {}) {
    const req: any = { params: {}, body: {}, query: {}, ...overrides };
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const res: any = { status, json };
    const next = jest.fn();
    return { req, res, status, json, next };
  }

  it("/api/admin/sms/* : 403 pour un utilisateur sans permission PLATFORM_*", async () => {
    const { requirePermission } = require('../../src/middleware/rbac-middleware');
    const { hasPermission: mockHasPermission } = require('../../src/services/permission-service');
    mockHasPermission.mockResolvedValueOnce(false);

    const { req, res, status, next } = buildReqRes({ user: { userId: 'agent-1' }, params: { tenantId: TENANT_A } });
    await requirePermission('PLATFORM_TENANTS_VIEW')(req, res, next);

    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('/api/admin/sms/* : passe pour un super-admin (PLATFORM_TENANTS_VIEW accordé)', async () => {
    const { requirePermission } = require('../../src/middleware/rbac-middleware');
    const { hasPermission: mockHasPermission } = require('../../src/services/permission-service');
    mockHasPermission.mockResolvedValueOnce(true);

    const { req, res, next } = buildReqRes({ user: { userId: 'super-1' }, params: { tenantId: TENANT_A } });
    await requirePermission('PLATFORM_TENANTS_VIEW')(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("isolation : un utilisateur de l'agence A n'a pas accès aux réglages SMS de l'agence B (403)", async () => {
    store.memberships.push({ userId: 'user-a', tenantId: TENANT_A, status: 'ACTIVE' });

    const { requireTenantAccess } = require('../../src/middleware/tenant-middleware');
    const { req, res, status, next } = buildReqRes({
      user: { userId: 'user-a', globalRole: 'USER' },
      params: { tenantId: TENANT_B },
      originalUrl: `/api/tenants/${TENANT_B}/settings/sms`
    });

    await requireTenantAccess(req, res, next);

    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('un tenant inexistant renvoie 404 (jamais confirmé comme « accès refusé »)', async () => {
    const { requireTenantAccess } = require('../../src/middleware/tenant-middleware');
    const { req, res, status, next } = buildReqRes({
      user: { userId: 'user-a', globalRole: 'USER' },
      params: { tenantId: 'tenant-inconnu' },
      originalUrl: '/api/tenants/tenant-inconnu/settings/sms'
    });

    await requireTenantAccess(req, res, next);

    expect(status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it("l'utilisateur de l'agence A garde l'accès à ses propres réglages SMS", async () => {
    store.memberships.push({ userId: 'user-a', tenantId: TENANT_A, status: 'ACTIVE' });

    const { requireTenantAccess } = require('../../src/middleware/tenant-middleware');
    const { req, res, next } = buildReqRes({
      user: { userId: 'user-a', globalRole: 'USER' },
      params: { tenantId: TENANT_A },
      originalUrl: `/api/tenants/${TENANT_A}/settings/sms`
    });

    await requireTenantAccess(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.tenantContext?.tenantId).toBe(TENANT_A);
  });
});
