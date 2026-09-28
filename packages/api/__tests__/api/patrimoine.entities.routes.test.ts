import express from 'express';
import request from 'supertest';

/**
 * Tests bout en bout (via `supertest`) des routes d'entités détentrices
 * (lot P4, territoire A2). `authenticate`/`requireTenantAccess`/la garde
 * RBAC sont remplacés par des passe-plats ; seul le module de domaine
 * (`lib/patrimoine/entities/service.ts`) est simulé — modèle :
 * `__tests__/api/finance.suppliers.test.ts`.
 */

jest.mock('../../src/middleware/auth-middleware', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-1', globalRole: 'USER' };
    next();
  }
}));

jest.mock('../../src/middleware/tenant-middleware', () => ({
  requireTenantAccess: (req: any, _res: any, next: any) => {
    // Le contexte tenant vient toujours de l'URL/session, jamais du corps.
    req.tenantContext = { tenantId: req.params.tenantId, isCollaborator: true, isClient: false };
    next();
  }
}));

jest.mock('../../src/middleware/property-rbac-middleware', () => ({
  requirePropertyPermission: () => (_req: any, _res: any, next: any) => next()
}));

const createHoldingEntity = jest.fn();

jest.mock('../../src/lib/patrimoine/entities/service', () => ({
  listHoldingEntities: jest.fn(async () => []),
  getHoldingEntityById: jest.fn(async () => ({})),
  createHoldingEntity: (...args: any[]) => createHoldingEntity(...args),
  updateHoldingEntity: jest.fn(async () => ({})),
  deleteHoldingEntity: jest.fn(async () => undefined),
  createEntityHolding: jest.fn(async () => ({})),
  updateEntityHolding: jest.fn(async () => ({})),
  deleteEntityHolding: jest.fn(async () => undefined),
  getPropertyHoldings: jest.fn(async () => ({})),
  setPropertyHoldings: jest.fn(async () => ({}))
}));

jest.mock('../../src/lib/patrimoine/entities/consolidation-service', () => ({
  getEntityConsolidation: jest.fn(async () => ({}))
}));

const getEntityTaxEstimate = jest.fn(async (..._args: any[]) => ({}));

jest.mock('../../src/lib/patrimoine/tax/service', () => ({
  getPropertyTaxProfile: jest.fn(async () => ({})),
  setPropertyTaxProfile: jest.fn(async () => ({})),
  getPropertyTaxEstimate: jest.fn(async () => ({})),
  getEntityTaxEstimate: (...args: any[]) => getEntityTaxEstimate(...args),
  getTaxParameters: jest.fn(async () => ({}))
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const patrimoineEntitiesRoutes = require('../../src/routes/patrimoine-entities-routes').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { errorHandler } = require('../../src/middleware/error-middleware');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', patrimoineEntitiesRoutes);
  app.use(errorHandler);
  return app;
}

const TENANT_ID = 'tenant-1';

describe('POST /api/tenants/:tenantId/patrimoine/entities', () => {
  const app = buildApp();

  beforeEach(() => {
    createHoldingEntity.mockReset();
  });

  it('400 sur un champ non prévu (corps `.strict()`)', async () => {
    const res = await request(app)
      .post(`/api/tenants/${TENANT_ID}/patrimoine/entities`)
      .send({ name: 'Ma SCI', legalForm: 'SCI', country: 'CI', champInattendu: 'x' });
    expect(res.status).toBe(400);
  });

  it('201 sur une création valide', async () => {
    createHoldingEntity.mockResolvedValue({ id: 'entity-1', name: 'Ma SCI' });

    const res = await request(app)
      .post(`/api/tenants/${TENANT_ID}/patrimoine/entities`)
      .send({ name: 'Ma SCI', legalForm: 'SCI', country: 'CI' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ id: 'entity-1' });
  });

  it("l'agence du contexte (URL) est transmise au service ; un `tenantId` dans le corps est refusé (corps `.strict()`), jamais lu", async () => {
    createHoldingEntity.mockResolvedValue({ id: 'entity-1' });

    const injected = await request(app)
      .post(`/api/tenants/${TENANT_ID}/patrimoine/entities`)
      .send({ name: 'Ma SCI', legalForm: 'SCI', country: 'CI', tenantId: 'tenant-injectee' });
    expect(injected.status).toBe(400);
    expect(createHoldingEntity).not.toHaveBeenCalled();

    await request(app)
      .post(`/api/tenants/${TENANT_ID}/patrimoine/entities`)
      .send({ name: 'Ma SCI', legalForm: 'SCI', country: 'CI' });
    expect(createHoldingEntity).toHaveBeenCalledWith(TENANT_ID, expect.any(Object), expect.anything());
  });
});

describe('PUT /api/tenants/:tenantId/patrimoine/properties/:propertyId/holdings', () => {
  const app = buildApp();

  it('400 quand une quote-part dépasse 100 (part 150)', async () => {
    const res = await request(app)
      .put(`/api/tenants/${TENANT_ID}/patrimoine/properties/prop-1/holdings`)
      .send({ holdings: [{ entityId: '11111111-1111-1111-1111-111111111111', sharePercent: 150 }] });
    expect(res.status).toBe(400);
  });

  it('400 sur un champ non prévu dans un rattachement (corps `.strict()`)', async () => {
    const res = await request(app)
      .put(`/api/tenants/${TENANT_ID}/patrimoine/properties/prop-1/holdings`)
      .send({
        holdings: [{ entityId: '11111111-1111-1111-1111-111111111111', sharePercent: 50, champInattendu: 'x' }]
      });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/tenants/:tenantId/patrimoine/entities/:entityId/tax-estimate', () => {
  const app = buildApp();

  beforeEach(() => {
    getEntityTaxEstimate.mockReset();
    getEntityTaxEstimate.mockResolvedValue({});
  });

  it('`year` par défaut : le service reçoit `undefined`, pas une valeur inventée par la route', async () => {
    await request(app).get(`/api/tenants/${TENANT_ID}/patrimoine/entities/entity-1/tax-estimate`);

    expect(getEntityTaxEstimate).toHaveBeenCalledWith(TENANT_ID, 'entity-1', { year: undefined });
  });

  it('`year` transmis est un entier coercé', async () => {
    await request(app).get(`/api/tenants/${TENANT_ID}/patrimoine/entities/entity-1/tax-estimate?year=2027`);

    expect(getEntityTaxEstimate).toHaveBeenCalledWith(TENANT_ID, 'entity-1', { year: 2027 });
  });

  it('400 sur une année hors bornes', async () => {
    const res = await request(app).get(`/api/tenants/${TENANT_ID}/patrimoine/entities/entity-1/tax-estimate?year=1999`);
    expect(res.status).toBe(400);
  });
});
