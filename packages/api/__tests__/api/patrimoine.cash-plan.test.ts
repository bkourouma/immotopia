import express from 'express';
import request from 'supertest';

/**
 * `GET /api/tenants/:tenantId/patrimoine/cash-plan` et
 * `PUT .../patrimoine/cash-plan/settings` (spec 030, lot A2).
 * Les gardes d'accès sont des passe-plats ; le service est simulé : on fige ici
 * la validation des paramètres, les codes de réponse et l'isolation par agence.
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
const OWN_PROPERTY = '11111111-1111-4111-8111-111111111111';
const FOREIGN_PROPERTY = '22222222-2222-4222-8222-222222222222';

jest.mock('../../src/lib/patrimoine/cash-plan-service', () => {
  const { NotFoundError } = jest.requireActual('../../src/middleware/error-middleware');
  return {
    getCashPlan: jest.fn(
      async (tenantId: string, query: { months: number; openingBalance?: number; propertyId?: string }) => {
        // Un bien d'une autre agence reçoit la même 404 qu'un bien inexistant.
        if (
          query.propertyId &&
          !(tenantId === 'tenant-1' && query.propertyId === '11111111-1111-4111-8111-111111111111')
        ) {
          throw new NotFoundError('Bien introuvable.');
        }
        return {
          currency: 'XOF',
          months: query.months,
          openingBalance: query.openingBalance ?? 0,
          openingBalanceProvided: query.openingBalance !== undefined,
          propertyId: query.propertyId ?? null,
          periods: Array.from({ length: query.months }, (_, index) => ({ month: `m${index}` })),
          shortfall: null,
          sources: [],
          warnings: []
        };
      }
    ),
    updateCashPlanSettings: jest.fn(async (_tenantId: string, _userId: string | undefined, input: any) => ({
      ...input,
      updatedAt: new Date('2026-10-15T10:00:00Z')
    }))
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const patrimoineRoutes = require('../../src/routes/patrimoine-routes').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { errorHandler } = require('../../src/middleware/error-middleware');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const service = require('../../src/lib/patrimoine/cash-plan-service');

const app = express();
app.use(express.json());
app.use('/api', patrimoineRoutes);
app.use(errorHandler);

const planUrl = (tenant: string, query = '') => `/api/tenants/${tenant}/patrimoine/cash-plan${query}`;
const settingsUrl = (tenant: string) => `/api/tenants/${tenant}/patrimoine/cash-plan/settings`;

beforeEach(() => jest.clearAllMocks());

describe('GET .../patrimoine/cash-plan', () => {
  it('répond 200 avec 12 mois par défaut, sans solde de départ', async () => {
    const res = await request(app).get(planUrl(TENANT_ID));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.months).toBe(12);
    expect(res.body.data.periods).toHaveLength(12);
    expect(res.body.data.openingBalanceProvided).toBe(false);
    expect(service.getCashPlan).toHaveBeenCalledWith(TENANT_ID, { months: 12 });
  });

  it('accepte 24 mois, un solde de départ (négatif ou décimal) et un bien de l’agence', async () => {
    const res = await request(app).get(
      planUrl(TENANT_ID, `?months=24&openingBalance=-1500000.5&propertyId=${OWN_PROPERTY}`)
    );
    expect(res.status).toBe(200);
    expect(res.body.data.periods).toHaveLength(24);
    expect(service.getCashPlan).toHaveBeenCalledWith(TENANT_ID, {
      months: 24,
      openingBalance: -1_500_000.5,
      propertyId: OWN_PROPERTY
    });
  });

  it.each([
    ['months=18', '?months=18'],
    ['months non numérique', '?months=abc'],
    ['paramètre inconnu', '?horizon=12'],
    ['openingBalance=abc', '?openingBalance=abc'],
    ['openingBalance vide', '?openingBalance='],
    ['openingBalance infini', '?openingBalance=Infinity'],
    ['propertyId non uuid', '?propertyId=prop-1']
  ])('refuse en 400 : %s', async (_label, query) => {
    const res = await request(app).get(planUrl(TENANT_ID, query));
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(service.getCashPlan).not.toHaveBeenCalled();
  });

  it("un bien d'une autre agence donne la même 404 qu'un bien inexistant", async () => {
    const autre = await request(app).get(planUrl(TENANT_ID, `?propertyId=${FOREIGN_PROPERTY}`));
    const autreAgence = await request(app).get(planUrl(OTHER_TENANT_ID, `?propertyId=${OWN_PROPERTY}`));
    expect(autre.status).toBe(404);
    expect(autreAgence.status).toBe(404);
    expect(autre.body).toEqual(autreAgence.body);
  });
});

describe('PUT .../patrimoine/cash-plan/settings', () => {
  it('enregistre une date valide', async () => {
    const res = await request(app).put(settingsUrl(TENANT_ID)).send({ propertyTaxDueMonth: 3, propertyTaxDueDay: 31 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: { propertyTaxDueMonth: 3, propertyTaxDueDay: 31 }
    });
    expect(service.updateCashPlanSettings).toHaveBeenCalledWith(TENANT_ID, 'user-1', {
      propertyTaxDueMonth: 3,
      propertyTaxDueDay: 31
    });
  });

  it('accepte le 29 février et efface avec deux null', async () => {
    const feb = await request(app).put(settingsUrl(TENANT_ID)).send({ propertyTaxDueMonth: 2, propertyTaxDueDay: 29 });
    expect(feb.status).toBe(200);
    const clear = await request(app)
      .put(settingsUrl(TENANT_ID))
      .send({ propertyTaxDueMonth: null, propertyTaxDueDay: null });
    expect(clear.status).toBe(200);
    expect(clear.body.data.propertyTaxDueMonth).toBeNull();
  });

  it.each([
    ['31 février', { propertyTaxDueMonth: 2, propertyTaxDueDay: 31 }],
    ['30 février', { propertyTaxDueMonth: 2, propertyTaxDueDay: 30 }],
    ['31 avril', { propertyTaxDueMonth: 4, propertyTaxDueDay: 31 }],
    ['mois seul', { propertyTaxDueMonth: 3, propertyTaxDueDay: null }],
    ['jour seul', { propertyTaxDueMonth: null, propertyTaxDueDay: 15 }],
    ['jour absent', { propertyTaxDueMonth: 3 }],
    ['corps vide', {}],
    ['mois 13', { propertyTaxDueMonth: 13, propertyTaxDueDay: 1 }],
    ['jour 0', { propertyTaxDueMonth: 1, propertyTaxDueDay: 0 }],
    ['jour décimal', { propertyTaxDueMonth: 1, propertyTaxDueDay: 1.5 }],
    ['champ inconnu', { propertyTaxDueMonth: 3, propertyTaxDueDay: 1, tenantId: 'tenant-2' }]
  ])('refuse en 400 : %s', async (_label, body) => {
    const res = await request(app).put(settingsUrl(TENANT_ID)).send(body);
    expect(res.status).toBe(400);
    expect(service.updateCashPlanSettings).not.toHaveBeenCalled();
  });
});
