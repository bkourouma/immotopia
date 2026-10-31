/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Routes d'agence — un client de portail (TenantClient) n'est pas un
 * collaborateur (audit 2026-10-19, lot 1).
 *
 *   - GET /api/tenants/:id et /entitlements : collaborateurs seulement ;
 *   - GET /api/tenants/:id/maintenance/vendors/active : collaborateurs seulement ;
 *   - GET /api/tenants/:id/public-profile : ouvert au client, fiche réduite ;
 *   - POST /api/tenants/:id/register : fermée (auto-inscription).
 *
 * Pile réelle des routeurs ; seuls la session, le calcul du contexte d'agence
 * (en-tête x-test-role) et la base sont remplacés.
 */
import express from 'express';
import request from 'supertest';

const mockPrisma: any = { tenant: { findUnique: jest.fn() } };

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { userId: 'u1', globalRole: 'USER' };
    next();
  }
}));

// requireTenantAccess pose le contexte selon l'en-tête ; requireTenantCollaborator reste le vrai.
jest.mock('../../src/middleware/tenant-middleware', () => ({
  ...jest.requireActual('../../src/middleware/tenant-middleware'),
  requireTenantAccess: (req: any, _res: any, next: any) => {
    const role = req.headers['x-test-role'];
    req.tenantContext = {
      tenantId: req.params.tenantId,
      role: role === 'collab' ? 'TENANT_ADMIN' : null,
      isCollaborator: role === 'collab',
      isClient: role === 'client',
      isSuperAdmin: false
    };
    next();
  }
}));

// Gestion des membres : hors sujet ici, et en cours de refonte dans un autre lot.
jest.mock('../../src/controllers/membership-controller', () => {
  const noop = (_req: any, res: any) => res.json({ success: true });
  return {
    listMembersHandler: noop,
    listAssignableMembersHandler: noop,
    getMemberHandler: noop,
    updateMemberHandler: noop,
    disableMemberHandler: noop,
    enableMemberHandler: noop,
    resetPasswordHandler: noop,
    revokeSessionsHandler: noop
  };
});

jest.mock('../../src/middleware/tenant-isolation-middleware', () => ({
  enforceTenantIsolation: (_req: any, _res: any, next: any) => next()
}));

jest.mock('../../src/controllers/subscription-v2-controller', () => ({
  ...jest.requireActual('../../src/controllers/subscription-v2-controller'),
  getEntitlementsHandler: (_req: any, res: any) => res.json({ success: true, data: { entitlements: true } })
}));

jest.mock('../../src/controllers/maintenance-vendor-controller', () => ({
  ...jest.requireActual('../../src/controllers/maintenance-vendor-controller'),
  getActiveVendorsHandler: (_req: any, res: any) => res.json({ success: true, data: [] })
}));

import tenantRoutes from '../../src/routes/tenant-routes';
import maintenanceRoutes from '../../src/routes/maintenance-routes';
import { errorHandler } from '../../src/middleware/error-middleware';

const app = express();
app.use(express.json());
app.use('/api/tenants/:tenantId/maintenance', maintenanceRoutes);
app.use('/api/tenants', tenantRoutes);
app.use(errorHandler);

const FICHE_COMPLETE = {
  id: 'ag1',
  name: 'Agence',
  clients: [{ id: 'c1' }],
  memberships: [{ id: 'm1' }],
  subscription: { id: 's1' }
};

describe('accès client de portail aux routes d’agence', () => {
  beforeEach(() => {
    mockPrisma.tenant.findUnique.mockReset();
    mockPrisma.tenant.findUnique.mockResolvedValue(FICHE_COMPLETE);
  });

  it.each(['/api/tenants/ag1', '/api/tenants/ag1/entitlements', '/api/tenants/ag1/maintenance/vendors/active'])(
    'GET %s : 403 pour un client, jamais de lecture en base',
    async url => {
      const res = await request(app).get(url).set('x-test-role', 'client');
      expect(res.status).toBe(403);
      expect(mockPrisma.tenant.findUnique).not.toHaveBeenCalled();
    }
  );

  it.each(['/api/tenants/ag1', '/api/tenants/ag1/entitlements', '/api/tenants/ag1/maintenance/vendors/active'])(
    'GET %s : 200 pour un collaborateur',
    async url => {
      const res = await request(app).get(url).set('x-test-role', 'collab');
      expect(res.status).toBe(200);
    }
  );

  it('GET /:tenantId/public-profile : 200 pour un client, fiche réduite sans clients ni abonnement', async () => {
    mockPrisma.tenant.findUnique.mockImplementation(async ({ select }: any) =>
      Object.fromEntries(
        Object.keys(select)
          .filter(cle => select[cle])
          .map(cle => [cle, `v-${cle}`])
      )
    );
    const res = await request(app).get('/api/tenants/ag1/public-profile').set('x-test-role', 'client');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data).sort()).toEqual(
      [
        'brandingPrimaryColor',
        'city',
        'contactEmail',
        'contactPhone',
        'country',
        'id',
        'logoUrl',
        'name',
        'slug',
        'type',
        'website'
      ].sort()
    );
    expect(res.body.data).not.toHaveProperty('clients');
    expect(res.body.data).not.toHaveProperty('memberships');
    expect(res.body.data).not.toHaveProperty('subscription');
    expect(mockPrisma.tenant.findUnique.mock.calls[0][0].include).toBeUndefined();
  });

  it('GET /:tenantId/public-profile : 404 si l’agence n’existe pas', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/tenants/ag1/public-profile').set('x-test-role', 'client');
    expect(res.status).toBe(404);
  });

  it('POST /:tenantId/register : route supprimée (404)', async () => {
    const res = await request(app)
      .post('/api/tenants/ag1/register')
      .set('x-test-role', 'client')
      .send({ clientType: 'RENTER' });
    expect(res.status).toBe(404);
  });
});
