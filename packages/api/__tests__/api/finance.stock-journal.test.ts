import express from 'express';
import request from 'supertest';

/**
 * Tests du point d'entrée agence du journal des mouvements — déplacés de
 * `finance.stock-mouvements.test.ts` par l'étape des fondations du lot 040,
 * sans changement de résultat. Le code testé est celui du lot 5, deuxième
 * sous-lot, désormais dans `routes/finance-stock-journal-routes.ts`.
 *
 * Les middlewares d'authentification, de tenant et de droits sont remplacés par
 * des passe-plats ; le domaine (`lib/finance/stock-journal.ts`) est simulé par
 * un espion Jest, pour vérifier que le contrôleur transmet la bonne forme de
 * requête sans reformuler la logique métier.
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

jest.mock('../../src/middleware/finance-rbac-middleware', () => ({
  requireAccountsRead: (_req: any, _res: any, next: any) => next(),
  requireReportsRead: (_req: any, _res: any, next: any) => next(),
  requireDocumentsCreate: (_req: any, _res: any, next: any) => next(),
  requireDocumentsValidate: (_req: any, _res: any, next: any) => next(),
  requireSitesManage: (_req: any, _res: any, next: any) => next(),
  requireSettingsManage: (_req: any, _res: any, next: any) => next()
}));

const listStockMovements = jest.fn();

jest.mock('../../src/lib/finance/stock-journal', () => ({
  listStockMovements: (...args: any[]) => listStockMovements(...args)
}));

import { errorHandler } from '../../src/middleware/error-middleware';
import financeStockJournalRoutes from '../../src/routes/finance-stock-journal-routes';

const TENANT_A = 'tenant-A';
const LOCATION_A = '11111111-1111-4111-8111-111111111111';
const ITEM_A = '22222222-2222-4222-8222-222222222222';
const SITE_A = '44444444-4444-4444-8444-444444444444';
const MOVEMENT_A = '66666666-6666-4666-8666-666666666666';

const app = express();
app.use(express.json());
app.use('/api', financeStockJournalRoutes);
app.use(errorHandler);

function movementRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: MOVEMENT_A,
    type: 'RECEIPT',
    itemId: ITEM_A,
    itemReference: 'CIM-45',
    itemLabel: 'Ciment CPJ 45',
    itemUnit: 'sac',
    locationId: LOCATION_A,
    locationLabel: 'Magasin central',
    movementDate: new Date('2026-03-01'),
    quantity: 100,
    isDecrease: false,
    unitCost: 5_000,
    totalValue: 500_000,
    currency: 'XOF',
    quantityAfter: 100,
    valueAfter: 500_000,
    siteId: null,
    siteLabel: null,
    costCategoryLabel: null,
    requestedBy: null,
    supplierInvoiceReference: 'FAC-2026-014',
    createdByLabel: 'Aïssatou Barry',
    createdAt: new Date('2026-03-01'),
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// D. GET /stock/movements
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/stock/movements', () => {
  it('liste les mouvements du tenant de l’URL', async () => {
    listStockMovements.mockResolvedValue([movementRecord()]);

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/stock/movements`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(listStockMovements).toHaveBeenCalledWith(TENANT_A, {
      itemId: undefined,
      locationId: undefined,
      siteId: undefined,
      type: undefined,
      from: undefined,
      to: undefined
    });
  });

  it('transmet la nature, le chantier et la période', async () => {
    listStockMovements.mockResolvedValue([]);

    await request(app).get(
      `/api/tenants/${TENANT_A}/finance/stock/movements?type=ISSUE&siteId=${SITE_A}&from=2026-03-01&to=2026-03-31`
    );

    expect(listStockMovements).toHaveBeenCalledWith(TENANT_A, {
      itemId: undefined,
      locationId: undefined,
      siteId: SITE_A,
      type: 'ISSUE',
      from: new Date('2026-03-01'),
      to: new Date('2026-03-31')
    });
  });

  it('refuse une nature de mouvement inconnue', async () => {
    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/stock/movements?type=SORTIE`);

    expect(res.status).toBe(400);
    expect(listStockMovements).not.toHaveBeenCalled();
  });
});
