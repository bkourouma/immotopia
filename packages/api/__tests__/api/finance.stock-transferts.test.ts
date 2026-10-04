import express from 'express';
import request from 'supertest';

/**
 * Tests du point d'entrée agence du transfert entre lieux — déplacés de
 * `finance.stock-inventaire.test.ts` par l'étape des fondations du lot 040,
 * sans changement de résultat. Le code testé est celui du lot 5, troisième
 * sous-lot, désormais dans `routes/finance-stock-transferts-routes.ts`.
 *
 * Les middlewares d'authentification, de tenant et de droits sont remplacés par
 * des passe-plats ; le domaine (`lib/finance/stock-transferts.ts`) est simulé
 * par un espion Jest, pour vérifier que le contrôleur transmet la bonne forme
 * de requête (tenantId de l'URL, aucun identifiant de chemin répété dans le
 * corps, utilisateur authentifié) sans reformuler la logique métier.
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

const recordStockTransferTx = jest.fn();

jest.mock('../../src/lib/finance/stock-transferts', () => ({
  recordStockTransferTx: (...args: any[]) => recordStockTransferTx(...args)
}));

jest.mock('../../src/utils/database', () => ({
  prisma: {
    $transaction: (callback: any) => callback({})
  }
}));

import { errorHandler } from '../../src/middleware/error-middleware';
import { conflict, notFound } from '../../src/lib/errors';
import financeStockTransfertsRoutes from '../../src/routes/finance-stock-transferts-routes';

const TENANT_A = 'tenant-A';
const LOCATION_A = '11111111-1111-4111-8111-111111111111';
const LOCATION_B = '99999999-9999-4999-8999-999999999999';
const ITEM_A = '22222222-2222-4222-8222-222222222222';
const MOVEMENT_A = '66666666-6666-4666-8666-666666666666';
const GROUP_A = '88888888-8888-4888-8888-888888888888';

const app = express();
app.use(express.json());
app.use('/api', financeStockTransfertsRoutes);
app.use(errorHandler);

function movementRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: MOVEMENT_A,
    type: 'TRANSFER',
    itemId: ITEM_A,
    itemReference: 'CIM-45',
    itemLabel: 'Ciment CPJ 45',
    itemUnit: 'sac',
    locationId: LOCATION_A,
    locationLabel: 'Magasin central',
    movementDate: new Date('2026-04-05'),
    quantity: 30,
    isDecrease: true,
    unitCost: 5_000,
    totalValue: 150_000,
    currency: 'XOF',
    quantityAfter: 70,
    valueAfter: 350_000,
    siteId: null,
    siteLabel: null,
    costCategoryLabel: null,
    requestedBy: null,
    supplierInvoiceReference: null,
    createdByLabel: 'Aïssatou Barry',
    createdAt: new Date('2026-04-05'),
    ...overrides
  };
}

function transferRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    transferGroupId: GROUP_A,
    movements: [
      movementRecord(),
      movementRecord({ id: 'autre', isDecrease: false, locationId: LOCATION_B, locationLabel: 'Dépôt de Kaloum' })
    ],
    fromLocationLabel: 'Magasin central',
    toLocationLabel: 'Dépôt de Kaloum',
    quantity: 30,
    value: 150_000,
    currency: 'XOF',
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// A. POST /stock/transfers
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/stock/transfers', () => {
  const corpsValide = {
    fromLocationId: LOCATION_A,
    toLocationId: LOCATION_B,
    itemId: ITEM_A,
    quantity: 30,
    transferDate: '2026-04-05'
  };

  it('enregistre un transfert avec le corps exact attendu, et renvoie les DEUX moitiés', async () => {
    recordStockTransferTx.mockResolvedValue(transferRecord());

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/transfers`).send(corpsValide);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.movements).toHaveLength(2);
    expect(res.body.data.transferGroupId).toBe(GROUP_A);
    expect(recordStockTransferTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, {
      fromLocationId: LOCATION_A,
      toLocationId: LOCATION_B,
      itemId: ITEM_A,
      quantity: 30,
      transferDate: new Date('2026-04-05'),
      createdByUserId: 'user-1'
    });
  });

  it('REFUSE un corps qui porterait un prix ou un chantier : un transfert ne valorise ni n’impute rien', async () => {
    for (const champInterdit of [
      { unitCost: 5_000 },
      { totalValue: 150_000 },
      { siteId: '44444444-4444-4444-8444-444444444444' },
      { costCategoryId: '55555555-5555-4555-8555-555555555555' }
    ]) {
      const res = await request(app)
        .post(`/api/tenants/${TENANT_A}/finance/stock/transfers`)
        .send({ ...corpsValide, ...champInterdit });
      expect(res.status).toBe(400);
    }
    expect(recordStockTransferTx).not.toHaveBeenCalled();
  });

  it('refuse un corps qui répète le tenantId déjà porté par le chemin', async () => {
    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/stock/transfers`)
      .send({ ...corpsValide, tenantId: TENANT_A });

    expect(res.status).toBe(400);
    expect(recordStockTransferTx).not.toHaveBeenCalled();
  });

  it('refuse une quantité nulle ou négative', async () => {
    for (const quantity of [0, -3]) {
      const res = await request(app)
        .post(`/api/tenants/${TENANT_A}/finance/stock/transfers`)
        .send({ ...corpsValide, quantity });
      expect(res.status).toBe(400);
    }
    expect(recordStockTransferTx).not.toHaveBeenCalled();
  });

  it('accepte une quantité à quatre décimales — une quantité n’est pas un montant', async () => {
    recordStockTransferTx.mockResolvedValue(transferRecord({ quantity: 0.25 }));

    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/stock/transfers`)
      .send({ ...corpsValide, quantity: 0.2525 });

    expect(res.status).toBe(201);
    expect(recordStockTransferTx.mock.calls[0][2].quantity).toBe(0.2525);
  });

  it('laisse remonter le 400 du domaine sur un transfert vers le même lieu', async () => {
    // La relation entre deux champs est une règle métier : Zod valide la forme,
    // le domaine reste la seule autorité.
    const { badRequest } = jest.requireActual('../../src/lib/errors');
    recordStockTransferTx.mockRejectedValue(badRequest('Un transfert relie deux lieux distincts'));

    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/stock/transfers`)
      .send({ ...corpsValide, toLocationId: LOCATION_A });

    expect(res.status).toBe(400);
  });

  it('laisse remonter le 409 du domaine sur un stock insuffisant, et le 404 sur un lieu introuvable', async () => {
    recordStockTransferTx.mockRejectedValue(conflict('Stock insuffisant'));
    const insuffisant = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/transfers`).send(corpsValide);
    expect(insuffisant.status).toBe(409);

    recordStockTransferTx.mockRejectedValue(notFound('Lieu de stockage introuvable'));
    const introuvable = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/transfers`).send(corpsValide);
    expect(introuvable.status).toBe(404);
  });

  it('ne renvoie AUCUN libellé comptable (principe P-1)', async () => {
    recordStockTransferTx.mockResolvedValue(transferRecord());

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/transfers`).send(corpsValide);

    const charge = JSON.stringify(res.body).toLowerCase();
    expect(charge).not.toContain('débit');
    expect(charge).not.toContain('debit');
    expect(charge).not.toContain('crédit');
    expect(charge).not.toContain('credit');
    expect(charge).not.toContain('311');
    expect(charge).not.toContain('603');
  });
});
