import express from 'express';
import request from 'supertest';

/**
 * `GET|PUT /api/tenants/:tenantId/settings/finance` — paramètres financiers de
 * l'agence (lot 1 de la gestion locative).
 *
 * Ce test fige quatre propriétés : une agence sans réglage reçoit les valeurs
 * par défaut sans que rien soit écrit ; un taux d'honoraires absent reste
 * « non paramétré » et non zéro ; les saisies invalides sont refusées ; et
 * chaque route porte la permission de la page « Paramètres de l'agence ».
 */

const mockPermissionsAsked: string[] = [];

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

jest.mock('../../src/middleware/rbac-middleware', () => ({
  requirePermission: (key: string) => {
    mockPermissionsAsked.push(key);
    return (_req: any, _res: any, next: any) => next();
  }
}));

const mockStored = new Map<string, any>();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    agencyFinanceSettings: {
      findUnique: jest.fn(async ({ where }: any) => mockStored.get(where.tenantId) ?? null),
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const previous = mockStored.get(where.tenantId);
        const row = {
          ...(previous ?? create),
          ...(previous ? update : {}),
          updatedAt: new Date('2026-09-22T10:00:00Z')
        };
        mockStored.set(where.tenantId, row);
        return row;
      })
    }
  }
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const routes = require('../../src/routes/agency-settings-routes').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { errorHandler } = require('../../src/middleware/error-middleware');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require('../../src/utils/database');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', routes);
  app.use(errorHandler);
  return app;
}

const VALID = {
  vatRegistered: true,
  vatRate: 18,
  taxpayerNumber: '  CI-1234567 ',
  managementFeeRate: 10,
  managementFeeBase: 'RENT_ONLY',
  ownerFundsAccountNumber: '',
  managementFeeAccountNumber: '706',
  vatCollectedAccountNumber: '4432'
};

describe('Paramètres financiers de l’agence', () => {
  const app = buildApp();

  beforeEach(() => {
    mockStored.clear();
    jest.clearAllMocks();
  });

  it('protège la lecture et l’écriture par les permissions des paramètres de l’agence', () => {
    expect(mockPermissionsAsked).toEqual(['TENANT_SETTINGS_VIEW', 'TENANT_SETTINGS_EDIT']);
  });

  it('renvoie les valeurs par défaut sans rien écrire pour une agence jamais paramétrée', async () => {
    const res = await request(app).get('/api/tenants/tenant-1/settings/finance');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      isDefault: true,
      vatRegistered: false,
      vatRate: 18,
      managementFeeRate: null,
      managementFeeAccountNumber: '706',
      vatCollectedAccountNumber: '4432',
      ownerFundsAccountNumber: null
    });
    expect(prisma.agencyFinanceSettings.upsert).not.toHaveBeenCalled();
  });

  it('enregistre, nettoie les saisies vides et relit les montants en nombres', async () => {
    const put = await request(app).put('/api/tenants/tenant-1/settings/finance').send(VALID);

    expect(put.status).toBe(200);
    expect(put.body.data).toMatchObject({
      isDefault: false,
      managementFeeRate: 10,
      vatRate: 18,
      taxpayerNumber: 'CI-1234567',
      ownerFundsAccountNumber: null
    });

    const get = await request(app).get('/api/tenants/tenant-1/settings/finance');
    expect(get.body.data.managementFeeRate).toBe(10);
    // Une autre agence ne voit pas ces réglages.
    const other = await request(app).get('/api/tenants/tenant-2/settings/finance');
    expect(other.body.data.isDefault).toBe(true);
  });

  it('garde un taux d’honoraires absent comme « non paramétré »', async () => {
    const res = await request(app)
      .put('/api/tenants/tenant-1/settings/finance')
      .send({ ...VALID, managementFeeRate: null });

    expect(res.status).toBe(200);
    expect(res.body.data.managementFeeRate).toBeNull();
  });

  it.each([
    ['un taux au-delà de 100 %', { managementFeeRate: 150 }],
    ['un taux négatif', { vatRate: -1 }],
    ['un compte qui n’est pas numérique', { managementFeeAccountNumber: '70A' }],
    ['une assiette inconnue', { managementFeeBase: 'LOYER' }]
  ])('refuse %s', async (_label, override) => {
    const res = await request(app)
      .put('/api/tenants/tenant-1/settings/finance')
      .send({ ...VALID, ...override });

    expect(res.status).toBe(400);
    expect(prisma.agencyFinanceSettings.upsert).not.toHaveBeenCalled();
  });
});
