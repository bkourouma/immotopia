/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Garde de TYPE d'espace (lot 4) : un PARTICULIER n'atteint que la liste
 * blanche, dans les trois modes de SUBSCRIPTION_ENFORCEMENT ; les autres
 * types et le super-admin ne sont pas touches.
 */

import express from 'express';
import request from 'supertest';

let mode: 'off' | 'warn' | 'enforce' = 'warn';
const getEntitlements = jest.fn();
let currentUser: any = { userId: 'u1', globalRole: 'USER' };
let currentContext: any = { isClient: false, tenantType: 'PARTICULIER' };
const tenantAccessSpy = jest.fn();

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
    tenantAccessSpy();
    req.tenantContext = { tenantId: req.params.tenantId, ...currentContext };
    next();
  }
}));

import { subscriptionRouteGuard } from '../../src/middleware/subscription-feature-middleware';
import { errorHandler } from '../../src/middleware/error-middleware';

const TENANT = '11111111-1111-1111-1111-111111111111';

const DENIED = [
  '/newsletter/campaigns',
  '/crm/deals',
  '/users/invite',
  '/invitations',
  '/finance/accounting/journal',
  '/finance/sites',
  '/syndics',
  '/sales/contracts',
  '/whatsapp-notifications',
  '/email-notifications',
  '/settings/payment-gateway',
  '/settings/finance',
  '/ai/chat',
  '/users',
  '/mandates',
  '/properties/p1/mandates',
  '/properties/p1/publish',
  '/inconnue'
];
const ALLOWED = [
  '/',
  '/patrimoine/assets',
  '/patrimoine/usage',
  '/subscription',
  '/subscription/upgrade',
  '/entitlements',
  '/dashboard',
  '/properties',
  '/properties/p1/valuations',
  '/rental/leases',
  '/work-programs'
];

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/tenants/:tenantId', subscriptionRouteGuard);
  app.all('/api/tenants/:tenantId/*', (_req: any, res: any) => res.json({ ok: true }));
  app.all('/api/tenants/:tenantId', (_req: any, res: any) => res.json({ ok: true }));
  app.use(errorHandler);
  return app;
}
const app = buildApp();

beforeEach(() => {
  mode = 'warn';
  currentUser = { userId: 'u1', globalRole: 'USER' };
  currentContext = { isClient: false, tenantType: 'PARTICULIER' };
  getEntitlements.mockReset();
  getEntitlements.mockResolvedValue({
    tenantId: TENANT,
    moduleAccess: {},
    readOnly: false,
    enforcement: mode
  });
  tenantAccessSpy.mockClear();
});

describe('garde de type — espace PARTICULIER', () => {
  for (const enforcement of ['off', 'warn', 'enforce'] as const) {
    describe(`SUBSCRIPTION_ENFORCEMENT=${enforcement}`, () => {
      beforeEach(() => {
        mode = enforcement;
        // Le garde d'abonnement, lui, ne refuse rien ici : seul le type parle.
        getEntitlements.mockResolvedValue({
          tenantId: TENANT,
          moduleAccess: { MODULE_PATRIMOINE: 'FULL' },
          readOnly: false,
          enforcement: 'off'
        });
      });

      it.each(DENIED)('refuse %s (403, code stable)', async path => {
        const res = await request(app).get(`/api/tenants/${TENANT}${path}`);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('PERSONAL_SPACE_ROUTE_FORBIDDEN');
      });

      it.each(['POST', 'PUT', 'DELETE'] as const)('refuse une ecriture %s sur /users/invite', async method => {
        const res = await request(app)[method.toLowerCase() as 'post'](`/api/tenants/${TENANT}/users/invite`).send({});
        expect(res.status).toBe(403);
      });

      it.each(ALLOWED)('laisse passer %s', async path => {
        const res = await request(app).get(`/api/tenants/${TENANT}${path}`);
        expect(res.status).toBe(200);
      });
    });
  }

  it('le super-admin n est pas restreint', async () => {
    currentUser = { userId: 'admin', globalRole: 'SUPER_ADMIN' };
    const res = await request(app).get(`/api/tenants/${TENANT}/crm/deals`);
    expect(res.status).toBe(200);
  });
});

describe('garde de type — agences inchangees', () => {
  it.each(['AGENCY', 'OPERATOR', undefined])('type %s : aucune restriction de type', async tenantType => {
    currentContext = { isClient: false, tenantType };
    for (const path of DENIED.filter(p => p !== '/inconnue')) {
      const res = await request(app).get(`/api/tenants/${TENANT}${path}`);
      expect(res.status).toBe(200);
    }
  });

  it("une agence ne declenche aucune lecture d'abonnement de plus en mode off", async () => {
    mode = 'off';
    currentContext = { isClient: false, tenantType: 'AGENCY' };
    const res = await request(app).get(`/api/tenants/${TENANT}/crm/deals`);
    expect(res.status).toBe(200);
    expect(getEntitlements).not.toHaveBeenCalled();
    expect(tenantAccessSpy).toHaveBeenCalledTimes(1);
  });
});
