/**
 * Ecart recette (lot syndic-ecarts, T1) : `GET /tenants/:tenantId/syndics`
 * appelait `buildPagination()` sans argument -> troncature silencieuse a
 * `DEFAULT_LIMIT` (20). Ce test verifie le contrat query string (`page`,
 * `limit`), la validation (400 sur une valeur hors bornes) et l'enveloppe
 * `pagination` de la reponse.
 */
import express from 'express';
import request from 'supertest';

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

jest.mock('../../src/middleware/property-rbac-middleware', () => ({
  requireAnyPropertyPermission: () => (_req: any, _res: any, next: any) => next(),
  requirePropertyPermission: () => (_req: any, _res: any, next: any) => next()
}));

const TENANT_ID = 'tenant-1';

const ALL_SYNDICATES = Array.from({ length: 23 }, (_, index) => ({
  id: `syn-${index + 1}`,
  tenantId: TENANT_ID,
  name: `Residence ${index + 1}`,
  address: 'Dakar',
  mandatingAgency: null,
  _count: {
    lots: 0,
    chargeCalls: 0,
    budgets: 0,
    generalMeetings: 0,
    documents: 0,
    serviceContracts: 0,
    incidents: 0
  }
}));

const listSyndicatesByTenant = jest.fn(async (tenantId: string, pagination?: { page?: number; limit?: number }) => {
  const page = pagination?.page ?? 1;
  const limit = pagination?.limit ?? 20;
  const filtered = ALL_SYNDICATES.filter(s => s.tenantId === tenantId);
  const items = filtered.slice((page - 1) * limit, (page - 1) * limit + limit);
  return { items, total: filtered.length, page, limit, totalPages: Math.ceil(filtered.length / limit) };
});

jest.mock('../../src/lib/syndics/queries', () => ({
  listSyndicatesByTenant: (...args: unknown[]) => (listSyndicatesByTenant as any)(...args)
}));

jest.mock('../../src/lib/documents/syndicate-branding-view', () => ({
  toSyndicateResponse: (syndic: any) => syndic
}));

import syndicRoutes from '../../src/routes/syndic-routes';
import { errorHandler } from '../../src/middleware/error-middleware';

describe('GET /tenants/:tenantId/syndics — pagination reelle (ecart recette T1)', () => {
  const app = express();
  app.use(express.json());
  app.use('/api', syndicRoutes);
  app.use(errorHandler);

  beforeEach(() => {
    listSyndicatesByTenant.mockClear();
  });

  it('utilise page=1/limit=20 par defaut', async () => {
    const response = await request(app).get(`/api/tenants/${TENANT_ID}/syndics`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(20);
    expect(response.body.pagination).toEqual({ page: 1, limit: 20, total: 23, totalPages: 2 });
    expect(listSyndicatesByTenant).toHaveBeenCalledWith(TENANT_ID, { page: 1, limit: 20 });
  });

  it('transmet ?page=2&limit=5', async () => {
    const response = await request(app).get(`/api/tenants/${TENANT_ID}/syndics`).query({ page: 2, limit: 5 });

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(5);
    expect(response.body.data[0].id).toBe('syn-6');
    expect(response.body.pagination).toEqual({ page: 2, limit: 5, total: 23, totalPages: 5 });
    expect(listSyndicatesByTenant).toHaveBeenCalledWith(TENANT_ID, { page: 2, limit: 5 });
  });

  it('refuse un limit hors bornes (>100) avec 400, sans coercition silencieuse', async () => {
    const response = await request(app).get(`/api/tenants/${TENANT_ID}/syndics`).query({ limit: 500 });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(listSyndicatesByTenant).not.toHaveBeenCalled();
  });

  it('refuse une page non entiere avec 400', async () => {
    const response = await request(app).get(`/api/tenants/${TENANT_ID}/syndics`).query({ page: '1.5' });

    expect(response.status).toBe(400);
    expect(listSyndicatesByTenant).not.toHaveBeenCalled();
  });

  it('refuse page=0 avec 400', async () => {
    const response = await request(app).get(`/api/tenants/${TENANT_ID}/syndics`).query({ page: '0' });

    expect(response.status).toBe(400);
    expect(listSyndicatesByTenant).not.toHaveBeenCalled();
  });
});
