/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Abonnements, vague 2 (lot A) : garde de fonctionnalites, dans les trois
 * modes de SUBSCRIPTION_ENFORCEMENT (off / warn / enforce).
 *
 * Petite app Express : le garde monte comme dans app.ts, des routes factices
 * derriere, le vrai errorHandler. Les droits et l'identite sont simules.
 */

import express from 'express';
import request from 'supertest';

let mode: 'off' | 'warn' | 'enforce' = 'warn';
const getEntitlements = jest.fn();
let currentUser: any = { userId: 'u1', globalRole: 'USER' };
let currentContext: any = { isClient: false };

jest.mock('../../src/lib/subscription/enforcement', () => ({
  getSubscriptionEnforcement: () => mode
}));

jest.mock('../../src/services/subscription-v2-service', () => ({
  getEntitlements: (...args: any[]) => getEntitlements(...args)
}));

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = currentUser;
    next();
  }
}));

jest.mock('../../src/middleware/tenant-middleware', () => ({
  requireTenantAccess: async (req: any, _res: any, next: any) => {
    req.tenantContext = { tenantId: req.params.tenantId, ...currentContext };
    next();
  }
}));

import {
  getSubscriptionGuardCounters,
  requireFeature,
  resetSubscriptionGuardCounters,
  subscriptionRouteGuard
} from '../../src/middleware/subscription-feature-middleware';
import { errorHandler } from '../../src/middleware/error-middleware';
import { evaluateFeatureAccess } from '../../src/lib/subscription/feature-access';
import { classifyTenantRoute } from '../../src/lib/subscription/route-features';

const TENANT = '11111111-1111-1111-1111-111111111111';

type Access = 'FULL' | 'READ_ONLY' | 'NONE';

function entitlements(
  access: Partial<Record<'MODULE_AGENCY' | 'MODULE_SYNDIC' | 'MODULE_PROMOTER', Access>>,
  readOnly = false
): any {
  return {
    tenantId: TENANT,
    moduleAccess: { MODULE_AGENCY: 'NONE', MODULE_SYNDIC: 'NONE', MODULE_PROMOTER: 'NONE', ...access },
    readOnly,
    readOnlyReason: readOnly ? 'TRIAL_EXPIRED' : null,
    enforcement: mode
  };
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/tenants/:tenantId', subscriptionRouteGuard);
  const ok = (_req: any, res: any) => res.json({ ok: true });
  app.all('/api/tenants/:tenantId/syndics', ok);
  app.all('/api/tenants/:tenantId/syndics/:id', ok);
  app.all('/api/tenants/:tenantId/properties', ok);
  app.post('/api/tenants/:tenantId/properties/search', ok);
  app.all('/api/tenants/:tenantId/finance/sites', ok);
  app.all('/api/tenants/:tenantId/cash-sessions', ok);
  app.all('/api/tenants/:tenantId/entitlements', ok);
  app.all('/api/tenants/:tenantId/maintenance/tenant/tickets', ok);
  app.get('/api/tenants/my-memberships', ok);
  app.all('/api/tenants/:tenantId/explicit', requireFeature('SYNDIC'), ok);
  app.use(errorHandler);
  return app;
}

const app = buildApp();

beforeEach(() => {
  mode = 'warn';
  currentUser = { userId: 'u1', globalRole: 'USER' };
  currentContext = { isClient: false };
  getEntitlements.mockReset();
  resetSubscriptionGuardCounters();
});

describe('evaluateFeatureAccess (pur)', () => {
  it('ouvre une fonctionnalite si UN des modules qui la portent est FULL', () => {
    expect(evaluateFeatureAccess(entitlements({ MODULE_PROMOTER: 'FULL' }), 'CRM', true)).toEqual({ allowed: true });
    expect(evaluateFeatureAccess(entitlements({ MODULE_SYNDIC: 'FULL' }), 'CORE', true)).toEqual({ allowed: true });
  });

  it('module absent : refuse, lecture comprise', () => {
    expect(evaluateFeatureAccess(entitlements({ MODULE_AGENCY: 'FULL' }), 'SYNDIC', false)).toEqual({
      allowed: false,
      code: 'MODULE_NOT_INCLUDED',
      moduleKey: 'MODULE_SYNDIC'
    });
  });

  it('module retire (D11) : lecture permise, ecriture MODULE_READ_ONLY', () => {
    const ent = entitlements({ MODULE_AGENCY: 'FULL', MODULE_SYNDIC: 'READ_ONLY' });
    expect(evaluateFeatureAccess(ent, 'SYNDIC', false)).toEqual({ allowed: true });
    expect(evaluateFeatureAccess(ent, 'SYNDIC', true)).toEqual({
      allowed: false,
      code: 'MODULE_READ_ONLY',
      moduleKey: 'MODULE_SYNDIC'
    });
  });

  it('abonnement en lecture seule (D8) : lecture permise, ecriture SUBSCRIPTION_READ_ONLY', () => {
    const ent = entitlements({ MODULE_AGENCY: 'FULL' }, true);
    expect(evaluateFeatureAccess(ent, 'CORE', false)).toEqual({ allowed: true });
    expect(evaluateFeatureAccess(ent, 'CORE', true)).toEqual({
      allowed: false,
      code: 'SUBSCRIPTION_READ_ONLY',
      moduleKey: null
    });
  });

  it('une route inconnue reste non classee', () => {
    expect(classifyTenantRoute('/inconnue/xyz')).toBeUndefined();
  });
});

describe('mode off', () => {
  it('ne lit meme pas les droits', async () => {
    mode = 'off';
    const res = await request(app).post(`/api/tenants/${TENANT}/syndics`);
    expect(res.status).toBe(200);
    expect(getEntitlements).not.toHaveBeenCalled();
  });
});

describe('mode warn', () => {
  it('laisse passer, journalise et compte', async () => {
    getEntitlements.mockResolvedValue(entitlements({ MODULE_AGENCY: 'FULL' }));
    const res = await request(app).post(`/api/tenants/${TENANT}/syndics`);
    expect(res.status).toBe(200);
    expect(getEntitlements).toHaveBeenCalledWith(TENANT);
    expect(getSubscriptionGuardCounters()).toEqual({ 'MODULE_NOT_INCLUDED:SYNDIC': 1 });
  });

  it('ne compte rien quand tout est permis', async () => {
    getEntitlements.mockResolvedValue(entitlements({ MODULE_AGENCY: 'FULL' }));
    await request(app).post(`/api/tenants/${TENANT}/properties`);
    expect(getSubscriptionGuardCounters()).toEqual({});
  });
});

describe('mode enforce', () => {
  beforeEach(() => {
    mode = 'enforce';
  });

  it('403 MODULE_NOT_INCLUDED sur le syndic sans le module, en lecture comme en ecriture', async () => {
    getEntitlements.mockResolvedValue(entitlements({ MODULE_AGENCY: 'FULL' }));
    const get = await request(app).get(`/api/tenants/${TENANT}/syndics/abc`);
    expect(get.status).toBe(403);
    expect(get.body.code).toBe('MODULE_NOT_INCLUDED');
    expect(get.body.data).toEqual({ moduleKey: 'MODULE_SYNDIC' });
    const post = await request(app).post(`/api/tenants/${TENANT}/finance/sites`);
    expect(post.status).toBe(403);
    expect(post.body.code).toBe('MODULE_NOT_INCLUDED');
    expect(post.body.data).toEqual({ moduleKey: 'MODULE_PROMOTER' });
  });

  it('le socle reste ouvert a une agence Syndic seule', async () => {
    getEntitlements.mockResolvedValue(entitlements({ MODULE_SYNDIC: 'FULL' }));
    expect((await request(app).post(`/api/tenants/${TENANT}/cash-sessions`)).status).toBe(200);
    expect((await request(app).post(`/api/tenants/${TENANT}/syndics`)).status).toBe(200);
  });

  it('module retire : GET permis, ecriture 403 MODULE_READ_ONLY', async () => {
    getEntitlements.mockResolvedValue(entitlements({ MODULE_AGENCY: 'FULL', MODULE_SYNDIC: 'READ_ONLY' }));
    expect((await request(app).get(`/api/tenants/${TENANT}/syndics/abc`)).status).toBe(200);
    const res = await request(app).patch(`/api/tenants/${TENANT}/syndics/abc`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MODULE_READ_ONLY');
  });

  it('abonnement en lecture seule : GET et recherche permis, ecriture 403 SUBSCRIPTION_READ_ONLY', async () => {
    getEntitlements.mockResolvedValue(entitlements({ MODULE_AGENCY: 'FULL' }, true));
    expect((await request(app).get(`/api/tenants/${TENANT}/properties`)).status).toBe(200);
    expect((await request(app).post(`/api/tenants/${TENANT}/properties/search`)).status).toBe(200);
    const res = await request(app).post(`/api/tenants/${TENANT}/properties`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SUBSCRIPTION_READ_ONLY');
    expect(res.body.data).toEqual({ reason: 'TRIAL_EXPIRED' });
  });

  it('exceptions permanentes : droits, demandes des locataires, super-admin, clients, routes hors agence', async () => {
    getEntitlements.mockResolvedValue(entitlements({}, true));
    expect((await request(app).get(`/api/tenants/${TENANT}/entitlements`)).status).toBe(200);
    expect((await request(app).post(`/api/tenants/${TENANT}/maintenance/tenant/tickets`)).status).toBe(200);
    expect((await request(app).get('/api/tenants/my-memberships')).status).toBe(200);

    currentUser = { userId: 'admin', globalRole: 'SUPER_ADMIN' };
    expect((await request(app).post(`/api/tenants/${TENANT}/syndics`)).status).toBe(200);

    currentUser = { userId: 'loc', globalRole: 'USER' };
    currentContext = { isClient: true };
    expect((await request(app).post(`/api/tenants/${TENANT}/syndics`)).status).toBe(200);
    expect(getEntitlements).not.toHaveBeenCalled();
  });

  it("une panne du calcul des droits laisse passer", async () => {
    getEntitlements.mockRejectedValue(new Error('base indisponible'));
    expect((await request(app).post(`/api/tenants/${TENANT}/syndics`)).status).toBe(200);
  });

  it('requireFeature(feature) pose la meme verification sur une route explicite', async () => {
    getEntitlements.mockResolvedValue(entitlements({ MODULE_AGENCY: 'FULL' }));
    const res = await request(app).get(`/api/tenants/${TENANT}/explicit`);
    // Route non classee par la table : seul requireFeature('SYNDIC') la garde.
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MODULE_NOT_INCLUDED');
  });
});
