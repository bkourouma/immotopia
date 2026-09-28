import express from 'express';
import request from 'supertest';

/**
 * `GET /api/tenants/:tenantId/patrimoine/export` et
 * `GET /api/tenants/:tenantId/properties/:propertyId/patrimoine/export`
 * (lot P3).
 *
 * Même modèle de mock que `patrimoine.work-programs.test.ts` : `authenticate`,
 * `requireTenantAccess`, `enforcePropertyTenantIsolation` et les gardes
 * `property-rbac-middleware` sont remplacés par des passe-plats, seul
 * `utils/database` est simulé.
 */

let requireAnyPropertyPermissionAllowed = true;

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
  enforcePropertyTenantIsolation: (req: any, _res: any, next: any) => {
    req.propertyTenantId = req.params.tenantId;
    next();
  }
}));

jest.mock('../../src/middleware/property-rbac-middleware', () => ({
  requireAnyPropertyPermission: () => (_req: any, res: any, next: any) => {
    if (!requireAnyPropertyPermissionAllowed) {
      res.status(403).json({ success: false, message: 'Permission denied' });
      return;
    }
    next();
  },
  requirePropertyPermission: () => (_req: any, _res: any, next: any) => next()
}));

const TENANT_ID = 'tenant-1';
const OTHER_TENANT_ID = 'tenant-2';
const PROPERTY_ID = 'prop-1';

const PROPERTIES: Record<string, any> = {
  [PROPERTY_ID]: {
    id: PROPERTY_ID,
    tenantId: TENANT_ID,
    internalReference: 'REF/001 spécial',
    title: 'Résidence Les Rôniers',
    propertyType: 'APPARTEMENT',
    status: 'AVAILABLE',
    address: 'Cocody, Abidjan'
  }
};

const mockPrisma = {
  property: {
    findFirst: jest.fn(async ({ where }: any) => {
      const property = PROPERTIES[where.id];
      if (!property || property.tenantId !== where.tenantId) return null;
      return property;
    }),
    findMany: jest.fn(async ({ where }: any) =>
      Object.values(PROPERTIES).filter((p: any) => p.tenantId === where.tenantId)
    )
  },
  assetValuation: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null) },
  propertyLoan: { findMany: jest.fn(async () => []) },
  propertyExpense: { findMany: jest.fn(async () => []) },
  workProgram: { findMany: jest.fn(async () => []) },
  propertyDocument: { findMany: jest.fn(async () => []) },
  patrimonyDocument: { findMany: jest.fn(async () => []) },
  rentalLease: { findMany: jest.fn(async () => []) },
  tenant: { findUnique: jest.fn(async () => null) },
  syndicate: { findFirst: jest.fn(async () => null) }
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const patrimoineRoutes = require('../../src/routes/patrimoine-routes').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { errorHandler } = require('../../src/middleware/error-middleware');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', patrimoineRoutes);
  app.use(errorHandler);
  return app;
}

describe('GET /api/tenants/:tenantId/patrimoine/export', () => {
  const app = buildApp();

  beforeEach(() => {
    requireAnyPropertyPermissionAllowed = true;
  });

  it('renvoie un PDF avec les bons en-têtes', async () => {
    const res = await request(app).get(`/api/tenants/${TENANT_ID}/patrimoine/export?format=pdf`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="patrimoine-agence-\d{4}-\d{2}-\d{2}\.pdf"/
    );
    expect(res.headers['content-disposition']).toContain("filename*=UTF-8''");
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('renvoie un classeur Excel avec les bons en-têtes', async () => {
    const res = await request(app).get(`/api/tenants/${TENANT_ID}/patrimoine/export?format=xlsx`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="patrimoine-agence-\d{4}-\d{2}-\d{2}\.xlsx"/
    );
  });

  it('refuse un format invalide (400)', async () => {
    const res = await request(app).get(`/api/tenants/${TENANT_ID}/patrimoine/export?format=csv`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('refuse une requête sans format (400)', async () => {
    const res = await request(app).get(`/api/tenants/${TENANT_ID}/patrimoine/export`);
    expect(res.status).toBe(400);
  });

  it('refuse sans la permission PROPERTIES_VIEW (403)', async () => {
    requireAnyPropertyPermissionAllowed = false;
    const res = await request(app).get(`/api/tenants/${TENANT_ID}/patrimoine/export?format=pdf`);
    expect(res.status).toBe(403);
  });

  it('scope chaque lecture Prisma par tenantId', async () => {
    await request(app).get(`/api/tenants/${TENANT_ID}/patrimoine/export?format=xlsx`);
    expect(mockPrisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_ID }) })
    );
  });
});

describe('GET /api/tenants/:tenantId/properties/:propertyId/patrimoine/export', () => {
  const app = buildApp();

  beforeEach(() => {
    requireAnyPropertyPermissionAllowed = true;
  });

  it('renvoie un PDF pour un seul bien, nommé par sa référence nettoyée', async () => {
    const res = await request(app).get(
      `/api/tenants/${TENANT_ID}/properties/${PROPERTY_ID}/patrimoine/export?format=pdf`
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    // "REF/001 spécial" -> seuls [A-Za-z0-9-] sont conserves (l'accent disparait, il n'est pas translittéré).
    expect(res.headers['content-disposition']).toContain('filename="patrimoine-REF001spcial-');
  });

  it('renvoie un classeur Excel pour un seul bien', async () => {
    const res = await request(app).get(
      `/api/tenants/${TENANT_ID}/properties/${PROPERTY_ID}/patrimoine/export?format=xlsx`
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });

  it("répond 404 pour un bien d'une autre agence (même erreur qu'un bien inexistant)", async () => {
    const res = await request(app).get(
      `/api/tenants/${OTHER_TENANT_ID}/properties/${PROPERTY_ID}/patrimoine/export?format=pdf`
    );
    expect(res.status).toBe(404);
  });

  it('répond 404 pour un bien inexistant', async () => {
    const res = await request(app).get(
      `/api/tenants/${TENANT_ID}/properties/does-not-exist/patrimoine/export?format=pdf`
    );
    expect(res.status).toBe(404);
  });

  it('refuse un format invalide (400)', async () => {
    const res = await request(app).get(
      `/api/tenants/${TENANT_ID}/properties/${PROPERTY_ID}/patrimoine/export?format=doc`
    );
    expect(res.status).toBe(400);
  });

  it('refuse sans la permission PROPERTIES_VIEW (403)', async () => {
    requireAnyPropertyPermissionAllowed = false;
    const res = await request(app).get(
      `/api/tenants/${TENANT_ID}/properties/${PROPERTY_ID}/patrimoine/export?format=pdf`
    );
    expect(res.status).toBe(403);
  });

  it('scope la lecture du bien par tenantId', async () => {
    await request(app).get(`/api/tenants/${TENANT_ID}/properties/${PROPERTY_ID}/patrimoine/export?format=pdf`);
    expect(mockPrisma.property.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: PROPERTY_ID, tenantId: TENANT_ID }) })
    );
  });
});
