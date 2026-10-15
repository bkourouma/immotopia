/* eslint-disable @typescript-eslint/no-explicit-any */
import express from 'express';
import request from 'supertest';

/**
 * Spec 042, lot M2b : routes gestionnaire du paiement mobile
 * (`routes/syndic-online-payment-routes.ts`, contrat §1) — bout en bout via
 * `supertest`. `authenticate`, `requireTenantAccess` et les gardes de
 * permission sont des passe-plats qui lisent les droits dans l'en-tête
 * `x-perms` ; le domaine (`lib/syndics/online-payment`) est simulé, le routeur,
 * le contrôleur, leurs schémas Zod et `errorHandler` sont réels.
 */

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-1', globalRole: 'USER' };
    next();
  }
}));

jest.mock('../../src/middleware/tenant-middleware', () => ({
  requireTenantAccess: (req: any, _res: any, next: any) => {
    req.tenantContext = { tenantId: req.params.tenantId, isCollaborator: true, isClient: false };
    next();
  }
}));

jest.mock('../../src/middleware/tenant-isolation-middleware', () => ({
  enforcePropertyTenantIsolation: (_req: any, _res: any, next: any) => next()
}));

const granted = (req: any): string[] =>
  String(req.headers['x-perms'] || '')
    .split(',')
    .filter(Boolean);
const guard = (keys: string[]) => (req: any, res: any, next: any) =>
  keys.some(key => granted(req).includes(key))
    ? next()
    : res.status(403).json({ success: false, message: `Permission denied: ${keys.join(',')}` });

jest.mock('../../src/middleware/property-rbac-middleware', () => ({
  requirePropertyPermission: (key: string) => guard([key]),
  requireAnyPropertyPermission: (keys: string[]) => guard(keys)
}));
jest.mock('../../src/middleware/rbac-middleware', () => ({
  requirePermission: (key: string) => guard([key])
}));

jest.mock('../../src/middleware/rate-limit-middleware', () => {
  const pass = (_req: any, _res: any, next: any) => next();
  return {
    syndicGatewayTestRateLimiter: pass,
    syndicGatewayBalanceRateLimiter: pass,
    syndicGatewayWriteRateLimiter: pass
  };
});

const settings = {
  getSyndicGatewaySettings: jest.fn(),
  updateSyndicGatewaySettings: jest.fn(),
  testSyndicGatewayConnection: jest.fn(),
  getSyndicProviderBalance: jest.fn()
};
jest.mock('../../src/lib/syndics/online-payment/gateway-settings', () => ({
  ...jest.requireActual('../../src/lib/syndics/online-payment/gateway-settings'),
  getSyndicGatewaySettings: (...a: any[]) => settings.getSyndicGatewaySettings(...a),
  updateSyndicGatewaySettings: (...a: any[]) => settings.updateSyndicGatewaySettings(...a),
  testSyndicGatewayConnection: (...a: any[]) => settings.testSyndicGatewayConnection(...a),
  getSyndicProviderBalance: (...a: any[]) => settings.getSyndicProviderBalance(...a)
}));

const checkouts = {
  listSyndicCheckouts: jest.fn(),
  verifySyndicCheckout: jest.fn(),
  decideSyndicCheckout: jest.fn()
};
jest.mock('../../src/lib/syndics/online-payment/checkout-queries', () => ({
  listSyndicCheckouts: (...a: any[]) => checkouts.listSyndicCheckouts(...a)
}));
jest.mock('../../src/lib/syndics/online-payment/checkout-reconcile', () => ({
  verifySyndicCheckout: (...a: any[]) => checkouts.verifySyndicCheckout(...a)
}));
jest.mock('../../src/lib/syndics/online-payment/checkout-review', () => ({
  decideSyndicCheckout: (...a: any[]) => checkouts.decideSyndicCheckout(...a)
}));

const payouts = { listGatewayPayouts: jest.fn(), recordGatewayPayout: jest.fn() };
jest.mock('../../src/lib/syndics/online-payment/payout', () => ({
  GATEWAY_PAYOUT_MAX_AMOUNT: 9_999_999_999.99,
  listGatewayPayouts: (...a: any[]) => payouts.listGatewayPayouts(...a),
  recordGatewayPayout: (...a: any[]) => payouts.recordGatewayPayout(...a)
}));

jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const routes = require('../../src/routes/syndic-online-payment-routes').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { errorHandler, AppError, ErrorCode, NotFoundError } = require('../../src/middleware/error-middleware');

const app = express();
app.use(express.json());
app.use('/api', routes);
app.use(errorHandler);

const TENANT = 'tenant-1';
const SYNDIC = '11111111-1111-4111-8111-111111111111';
const CHECKOUT = '33333333-3333-4333-8333-333333333333';
const BASE = `/api/tenants/${TENANT}/syndics/${SYNDIC}`;
const GW = `${BASE}/paiement-en-ligne`;
const VIEW = 'SYNDIC_VIEW';
const EDIT = 'SYNDIC_EDIT';
const SECRETS = 'TENANT_SETTINGS_EDIT';

beforeEach(() => {
  for (const group of [settings, checkouts, payouts]) {
    for (const fn of Object.values(group)) (fn as jest.Mock).mockReset();
  }
});

describe('permissions', () => {
  const reads: Array<[string, string, jest.Mock]> = [
    ['GET', `${GW}/configuration`, settings.getSyndicGatewaySettings],
    ['GET', `${GW}/solde`, settings.getSyndicProviderBalance],
    ['GET', `${BASE}/paiements-en-ligne`, checkouts.listSyndicCheckouts],
    ['GET', `${GW}/reversements`, payouts.listGatewayPayouts]
  ];

  it.each(reads)('%s %s : 403 sans SYNDIC_VIEW, 200 avec', async (method, path, fn) => {
    fn.mockResolvedValue({ items: [] });
    const denied = await (request(app) as any)[method.toLowerCase()](path).set('x-perms', EDIT);
    expect(denied.status).toBe(403);
    expect(fn).not.toHaveBeenCalled();
    const ok = await (request(app) as any)[method.toLowerCase()](path).set('x-perms', VIEW);
    expect(ok.status).toBe(200);
    expect(ok.body.success).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  const writes: Array<[string, string, object, jest.Mock, number]> = [
    ['PUT', `${GW}/configuration`, { isActive: false }, settings.updateSyndicGatewaySettings, 200],
    ['POST', `${GW}/configuration/test`, {}, settings.testSyndicGatewayConnection, 200],
    ['POST', `${BASE}/paiements-en-ligne/${CHECKOUT}/verifier`, {}, checkouts.verifySyndicCheckout, 200],
    [
      'POST',
      `${BASE}/paiements-en-ligne/${CHECKOUT}/trancher`,
      { decision: 'REJECT', note: 'Doublon' },
      checkouts.decideSyndicCheckout,
      200
    ],
    [
      'POST',
      `${GW}/reversements`,
      { amount: 1000, date: '2026-01-02', reference: 'VIR-1' },
      payouts.recordGatewayPayout,
      201
    ]
  ];

  it.each(writes)(
    '%s %s : 403 avec la seule lecture, accepté avec SYNDIC_EDIT',
    async (method, path, body, fn, status) => {
      fn.mockResolvedValue({ entryId: 'e1', reference: 'VIR-1', amount: 1000, date: '2026-01-02' });
      const denied = await (request(app) as any)
        [method.toLowerCase()](path)
        .set('x-perms', `${VIEW},${SECRETS}`)
        .send(body);
      expect(denied.status).toBe(403);
      expect(fn).not.toHaveBeenCalled();
      const ok = await (request(app) as any)
        [method.toLowerCase()](path)
        .set('x-perms', `${EDIT},${SECRETS}`)
        .send(body);
      expect(ok.status).toBe(status);
      expect(fn).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    ['PUT', `${GW}/configuration`, { isActive: true }],
    ['POST', `${GW}/configuration/test`, {}]
  ])('%s %s : SYNDIC_EDIT ne suffit pas, il faut TENANT_SETTINGS_EDIT (clé API)', async (method, path, body) => {
    const res = await (request(app) as any)[method.toLowerCase()](path).set('x-perms', EDIT).send(body);
    expect(res.status).toBe(403);
    expect(settings.updateSyndicGatewaySettings).not.toHaveBeenCalled();
    expect(settings.testSyndicGatewayConnection).not.toHaveBeenCalled();
  });
});

describe('isolation', () => {
  it('l’agence vient de l’URL, jamais du corps', async () => {
    settings.updateSyndicGatewaySettings.mockResolvedValue({});
    const res = await request(app)
      .put(`${GW}/configuration`)
      .set('x-perms', `${EDIT},${SECRETS}`)
      .send({ tenantId: 'tenant-2', isActive: true });
    expect(res.status).toBe(400);
    expect(settings.updateSyndicGatewaySettings).not.toHaveBeenCalled();

    await request(app).put(`${GW}/configuration`).set('x-perms', `${EDIT},${SECRETS}`).send({ isActive: true });
    expect(settings.updateSyndicGatewaySettings).toHaveBeenCalledWith(TENANT, SYNDIC, { isActive: true }, 'user-1');
  });

  it('une copropriété d’une autre agence (404 du service) répond 404', async () => {
    settings.getSyndicGatewaySettings.mockRejectedValue(new NotFoundError('Copropriété introuvable ou inaccessible.'));
    const res = await request(app).get(`${GW}/configuration`).set('x-perms', VIEW);
    expect(res.status).toBe(404);
  });

  it('un identifiant de copropriété qui n’est pas un UUID répond 404, sans appel au service', async () => {
    const res = await request(app)
      .get(`/api/tenants/${TENANT}/syndics/pas-un-uuid/paiement-en-ligne/configuration`)
      .set('x-perms', VIEW);
    expect(res.status).toBe(404);
    expect(settings.getSyndicGatewaySettings).not.toHaveBeenCalled();
  });

  it('un identifiant de paiement qui n’est pas un UUID répond 404', async () => {
    const res = await request(app).post(`${BASE}/paiements-en-ligne/xyz/verifier`).set('x-perms', EDIT).send({});
    expect(res.status).toBe(404);
    expect(checkouts.verifySyndicCheckout).not.toHaveBeenCalled();
  });
});

describe('erreurs typées et validation', () => {
  it('409 GATEWAY_CHECKOUTS_PENDING est renvoyé avec son code', async () => {
    settings.updateSyndicGatewaySettings.mockRejectedValue(
      new AppError('En attente', 409, ErrorCode.GATEWAY_CHECKOUTS_PENDING)
    );
    const res = await request(app)
      .put(`${GW}/configuration`)
      .set('x-perms', `${EDIT},${SECRETS}`)
      .send({ merchantId: 'M-2' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('GATEWAY_CHECKOUTS_PENDING');
  });

  it('refuse un mode inconnu et une clé trop longue (400)', async () => {
    const perms = `${EDIT},${SECRETS}`;
    expect((await request(app).put(`${GW}/configuration`).set('x-perms', perms).send({ mode: 'TEST' })).status).toBe(
      400
    );
    expect(
      (
        await request(app)
          .put(`${GW}/configuration`)
          .set('x-perms', perms)
          .send({ apiKey: 'x'.repeat(501) })
      ).status
    ).toBe(400);
  });

  it('la liste transmet les filtres validés et refuse un statut inconnu', async () => {
    checkouts.listSyndicCheckouts.mockResolvedValue({ items: [] });
    const ok = await request(app)
      .get(`${BASE}/paiements-en-ligne`)
      .query({ status: 'PENDING,REVIEW', origin: 'PORTAL', from: '2026-01-01', page: '2', limit: '50' })
      .set('x-perms', VIEW);
    expect(ok.status).toBe(200);
    expect(checkouts.listSyndicCheckouts).toHaveBeenCalledWith(TENANT, SYNDIC, {
      status: ['PENDING', 'REVIEW'],
      origin: 'PORTAL',
      from: '2026-01-01',
      page: 2,
      limit: 50
    });
    const bad = await request(app).get(`${BASE}/paiements-en-ligne`).query({ status: 'BOGUS' }).set('x-perms', VIEW);
    expect(bad.status).toBe(400);
    const tooMany = await request(app).get(`${BASE}/paiements-en-ligne`).query({ limit: '500' }).set('x-perms', VIEW);
    expect(tooMany.status).toBe(400);
  });

  it('trancher exige une note et une décision valides', async () => {
    const path = `${BASE}/paiements-en-ligne/${CHECKOUT}/trancher`;
    for (const body of [{ decision: 'ACCEPT' }, { decision: 'ACCEPT', note: '  ' }, { decision: 'X', note: 'a' }]) {
      expect((await request(app).post(path).set('x-perms', EDIT).send(body)).status).toBe(400);
    }
    expect(checkouts.decideSyndicCheckout).not.toHaveBeenCalled();
    checkouts.decideSyndicCheckout.mockResolvedValue({ checkout: {}, payment: null });
    const ok = await request(app)
      .post(path)
      .set('x-perms', EDIT)
      .send({ decision: 'ACCEPT', note: ' Vérifié ', paidAt: '2026-03-04' });
    expect(ok.status).toBe(200);
    const call = checkouts.decideSyndicCheckout.mock.calls[0][0];
    expect(call).toMatchObject({
      tenantId: TENANT,
      syndicateId: SYNDIC,
      checkoutId: CHECKOUT,
      decision: 'ACCEPT',
      note: 'Vérifié',
      actorUserId: 'user-1'
    });
    expect(call.paidAt.toISOString()).toBe('2026-03-04T00:00:00.000Z');
  });

  it('reversement : refuse un montant nul, une date future et une référence vide', async () => {
    const send = (body: object) => request(app).post(`${GW}/reversements`).set('x-perms', EDIT).send(body);
    expect((await send({ amount: 0, date: '2026-01-02', reference: 'R' })).status).toBe(400);
    expect((await send({ amount: 10, date: '2999-01-01', reference: 'R' })).status).toBe(400);
    expect((await send({ amount: 10, date: '2026-01-02', reference: '  ' })).status).toBe(400);
    expect((await send({ amount: 10, date: '2026-13-45', reference: 'R' })).status).toBe(400);
    expect(payouts.recordGatewayPayout).not.toHaveBeenCalled();
  });

  it('reversement : 201 et appel du service avec l’agence de l’URL', async () => {
    payouts.recordGatewayPayout.mockResolvedValue({
      entryId: 'e1',
      reference: 'VIR-1',
      amount: 1000,
      date: '2026-01-02',
      collectionBalanceAfter: 0
    });
    const res = await request(app)
      .post(`${GW}/reversements`)
      .set('x-perms', EDIT)
      .send({ amount: 1000, date: '2026-01-02', reference: 'VIR-1', note: null });
    expect(res.status).toBe(201);
    expect(payouts.recordGatewayPayout.mock.calls[0][0]).toMatchObject({
      tenantId: TENANT,
      syndicateId: SYNDIC,
      amount: 1000,
      reference: 'VIR-1',
      actorUserId: 'user-1'
    });
  });
});
