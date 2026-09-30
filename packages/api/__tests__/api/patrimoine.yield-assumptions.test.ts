import express from 'express';
import request from 'supertest';

/**
 * `GET /api/tenants/:tenantId/properties/:propertyId/yield` — hypothèses de projection
 * (BUG-2026-09-30-033).
 *
 * Décision : les hypothèses (années, croissances, vacance) sont un PARAMÈTRE DE
 * CALCUL passé en requête (spec 015, FR-009), non un état stocké côté serveur ;
 * l'écran les conserve par agence et par bien sur l'appareil. Ce test fige le
 * contrat serveur : hypothèses prises en compte, valeurs invalides refusées en
 * 400, aucun bien d'une autre agence.
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
jest.mock('../../src/middleware/property-rbac-middleware', () => ({
  requireAnyPropertyPermission: () => (_req: any, _res: any, next: any) => next(),
  requirePropertyPermission: () => (_req: any, _res: any, next: any) => next()
}));

const TENANT_ID = 'tenant-1';
const OTHER_TENANT_ID = 'tenant-2';

jest.mock('../../src/lib/patrimoine/queries', () => {
  const actual = jest.requireActual('../../src/lib/patrimoine/queries');
  const { NotFoundError } = jest.requireActual('../../src/middleware/error-middleware');
  return {
    ...actual,
    buildPropertyYieldInput: jest.fn(async (tenantId: string, propertyId: string) => {
      // Le bien appartient à l'agence 1 : toute autre agence reçoit la même 404 qu'un bien inexistant.
      if (tenantId !== 'tenant-1' || propertyId !== 'prop-1') throw new NotFoundError('Bien introuvable');
      return {
        annualRent: 7_200_000,
        currentValue: 120_000_000,
        costBasis: 90_000_000,
        annualExpenses: 600_000,
        annualLoanPayments: 0
      };
    })
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const patrimoineRoutes = require('../../src/routes/patrimoine-routes').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { errorHandler } = require('../../src/middleware/error-middleware');

const app = express();
app.use(express.json());
app.use('/api', patrimoineRoutes);
app.use(errorHandler);

const url = (tenant: string, query = '') => `/api/tenants/${tenant}/properties/prop-1/yield${query}`;

describe('GET .../properties/:propertyId/yield — hypothèses de projection', () => {
  it('applique les valeurs par défaut (10 ans) sans paramètre', async () => {
    const res = await request(app).get(url(TENANT_ID));
    expect(res.status).toBe(200);
    expect(res.body.data.projection).toHaveLength(10);
  });

  it('prend en compte les hypothèses saisies : 15 ans, taux et vacance', async () => {
    const res = await request(app).get(
      url(TENANT_ID, '?years=15&valueGrowthRate=0.03&rentGrowthRate=0.02&expenseGrowthRate=0.025&vacancyRate=0.05')
    );
    expect(res.status).toBe(200);
    expect(res.body.data.projection).toHaveLength(15);
    expect(res.body.data.projectedAtHorizon.year).toBe(15);
  });

  it('la vacance change le rendement projeté (même horizon, hypothèses différentes)', async () => {
    const a = await request(app).get(url(TENANT_ID, '?years=5&vacancyRate=0'));
    const b = await request(app).get(url(TENANT_ID, '?years=5&vacancyRate=0.5'));
    expect(a.body.data.projectedAtHorizon.grossYield).toBeGreaterThan(b.body.data.projectedAtHorizon.grossYield);
  });

  it("accepte une croissance négative jusqu'à -50 %", async () => {
    const res = await request(app).get(url(TENANT_ID, '?valueGrowthRate=-0.1&rentGrowthRate=-0.5'));
    expect(res.status).toBe(200);
  });

  it.each([
    ['années nulles', '?years=0'],
    ['années au-delà de 30', '?years=31'],
    ['années non entières', '?years=2.5'],
    ['années non numériques', '?years=abc'],
    ['croissance sous -50 %', '?valueGrowthRate=-0.6'],
    ['croissance au-delà de 100 %', '?rentGrowthRate=1.5'],
    ['vacance négative', '?vacancyRate=-0.1'],
    ['vacance au-delà de 100 %', '?vacancyRate=2']
  ])('refuse en 400 : %s', async (_label, query) => {
    const res = await request(app).get(url(TENANT_ID, query));
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("ne rend jamais le bien d'une autre agence (même 404 qu'un bien inexistant)", async () => {
    const autre = await request(app).get(url(OTHER_TENANT_ID, '?years=15'));
    const inexistant = await request(app).get(`/api/tenants/${TENANT_ID}/properties/nope/yield`);
    expect(autre.status).toBe(404);
    expect(inexistant.status).toBe(404);
    expect(autre.body).toEqual(inexistant.body);
  });
});
