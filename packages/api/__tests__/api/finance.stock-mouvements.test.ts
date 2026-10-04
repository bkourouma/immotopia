import express from 'express';
import request from 'supertest';

/**
 * Tests des points d'entrée agence des mouvements de stock — lot 5, deuxième
 * sous-lot. Les tests du journal ont été déplacés dans
 * `finance.stock-journal.test.ts` (lot 040, fondations).
 *
 * Modèle : `__tests__/api/finance.contractors.test.ts` (lot 4, sous-lot 4).
 * Les middlewares d'authentification, de tenant et de droits sont remplacés
 * par des passe-plats ; le domaine (`lib/finance/stock-mouvements.ts`) est
 * simulé par des espions Jest, pour vérifier que le contrôleur transmet la
 * bonne forme de requête (tenantId de l'URL, aucun identifiant de chemin
 * répété dans le corps, utilisateur authentifié) sans reformuler la logique
 * métier, déjà couverte par les tests unitaires.
 *
 * **Le corps exact de chaque création est épinglé ici**, et c'est le but de ce
 * fichier : quatre créations des lots 2 et 3 échouaient en 400 contre le vrai
 * serveur parce que leur corps répétait un identifiant déjà porté par le
 * chemin, ou portait un champ dérivé. Les schémas sont `.strict()`, et ces
 * tests le prouvent de l'extérieur.
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

const recordStockReceiptTx = jest.fn();
const recordStockIssueTx = jest.fn();
const listStockBalances = jest.fn();

jest.mock('../../src/lib/finance/stock-mouvements', () => ({
  recordStockReceiptTx: (...args: any[]) => recordStockReceiptTx(...args),
  recordStockIssueTx: (...args: any[]) => recordStockIssueTx(...args),
  listStockBalances: (...args: any[]) => listStockBalances(...args)
}));

jest.mock('../../src/utils/database', () => ({
  prisma: {
    $transaction: (callback: any) => callback({})
  }
}));

import { errorHandler } from '../../src/middleware/error-middleware';
import { conflict, notFound } from '../../src/lib/errors';
import financeStockMouvementsRoutes from '../../src/routes/finance-stock-mouvements-routes';

const TENANT_A = 'tenant-A';
const LOCATION_A = '11111111-1111-4111-8111-111111111111';
const ITEM_A = '22222222-2222-4222-8222-222222222222';
const INVOICE_A = '33333333-3333-4333-8333-333333333333';
const SITE_A = '44444444-4444-4444-8444-444444444444';
const CATEGORY_A = '55555555-5555-4555-8555-555555555555';
const MOVEMENT_A = '66666666-6666-4666-8666-666666666666';

const app = express();
app.use(express.json());
app.use('/api', financeStockMouvementsRoutes);
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

function balanceRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    itemId: ITEM_A,
    itemReference: 'CIM-45',
    itemLabel: 'Ciment CPJ 45',
    itemUnit: 'sac',
    locationId: LOCATION_A,
    locationLabel: 'Magasin central',
    quantity: 100,
    value: 500_000,
    averageUnitCost: 5_000,
    currency: 'XOF',
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// A. POST /stock/receipts
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/stock/receipts', () => {
  const corpsValide = {
    locationId: LOCATION_A,
    supplierInvoiceId: INVOICE_A,
    receiptDate: '2026-03-01',
    lines: [{ itemId: ITEM_A, quantity: 100, unitCost: 5000 }]
  };

  it('enregistre une réception et renvoie UN MOUVEMENT PAR LIGNE', async () => {
    recordStockReceiptTx.mockResolvedValue([movementRecord(), movementRecord({ id: 'autre' })]);

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/receipts`).send(corpsValide);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(recordStockReceiptTx).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_A,
      expect.objectContaining({
        locationId: LOCATION_A,
        supplierInvoiceId: INVOICE_A,
        receiptDate: new Date('2026-03-01'),
        lines: [{ itemId: ITEM_A, quantity: 100, unitCost: 5000 }],
        createdByUserId: 'user-1'
      })
    );
  });

  it('accepte un prix unitaire nul', async () => {
    recordStockReceiptTx.mockResolvedValue([movementRecord({ unitCost: 0, totalValue: 0 })]);

    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/stock/receipts`)
      .send({ ...corpsValide, lines: [{ itemId: ITEM_A, quantity: 20, unitCost: 0 }] });

    expect(res.status).toBe(201);
  });

  it('accepte une quantité à quatre décimales — une quantité n’est pas un montant', async () => {
    recordStockReceiptTx.mockResolvedValue([movementRecord({ quantity: 12.5 })]);

    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/stock/receipts`)
      .send({ ...corpsValide, lines: [{ itemId: ITEM_A, quantity: 12.5025, unitCost: 8000 }] });

    expect(res.status).toBe(201);
    expect(recordStockReceiptTx.mock.calls[0][2].lines[0].quantity).toBe(12.5025);
  });

  it('refuse un corps qui répète le tenantId déjà porté par le chemin', async () => {
    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/stock/receipts`)
      .send({ ...corpsValide, tenantId: TENANT_A });

    expect(res.status).toBe(400);
    expect(recordStockReceiptTx).not.toHaveBeenCalled();
  });

  it('refuse une quantité nulle ou négative', async () => {
    for (const quantity of [0, -1]) {
      const res = await request(app)
        .post(`/api/tenants/${TENANT_A}/finance/stock/receipts`)
        .send({ ...corpsValide, lines: [{ itemId: ITEM_A, quantity, unitCost: 5000 }] });
      expect(res.status).toBe(400);
    }
    expect(recordStockReceiptTx).not.toHaveBeenCalled();
  });

  it('refuse un prix unitaire négatif', async () => {
    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/stock/receipts`)
      .send({ ...corpsValide, lines: [{ itemId: ITEM_A, quantity: 10, unitCost: -1 }] });

    expect(res.status).toBe(400);
  });

  it('refuse une réception sans ligne, et une réception sans facture', async () => {
    const sansLigne = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/stock/receipts`)
      .send({ ...corpsValide, lines: [] });
    expect(sansLigne.status).toBe(400);

    const sansFacture = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/stock/receipts`)
      .send({
        locationId: LOCATION_A,
        receiptDate: '2026-03-01',
        lines: [{ itemId: ITEM_A, quantity: 10, unitCost: 100 }]
      });
    expect(sansFacture.status).toBe(400);
  });

  it('laisse remonter le 409 du domaine sur une facture non validée', async () => {
    recordStockReceiptTx.mockRejectedValue(conflict("Cette facture n'est pas validée"));

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/receipts`).send(corpsValide);

    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// B. POST /stock/issues
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/stock/issues', () => {
  const corpsValide = {
    locationId: LOCATION_A,
    itemId: ITEM_A,
    quantity: 50,
    siteId: SITE_A,
    costCategoryId: CATEGORY_A,
    requestedBy: 'Chef de chantier Camara',
    issueDate: '2026-03-10'
  };

  it('enregistre une sortie avec le corps exact attendu', async () => {
    recordStockIssueTx.mockResolvedValue(
      movementRecord({ type: 'ISSUE', isDecrease: true, siteId: SITE_A, totalValue: 300_000 })
    );

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/issues`).send(corpsValide);

    expect(res.status).toBe(201);
    expect(res.body.data.totalValue).toBe(300_000);
    expect(recordStockIssueTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, {
      locationId: LOCATION_A,
      itemId: ITEM_A,
      quantity: 50,
      siteId: SITE_A,
      costCategoryId: CATEGORY_A,
      requestedBy: 'Chef de chantier Camara',
      issueDate: new Date('2026-03-10'),
      createdByUserId: 'user-1'
    });
  });

  it('REFUSE un corps qui porterait un prix : il est dérivé, jamais saisi (P-4)', async () => {
    for (const champDerive of [{ unitCost: 6000 }, { totalValue: 300_000 }, { averageUnitCost: 6000 }]) {
      const res = await request(app)
        .post(`/api/tenants/${TENANT_A}/finance/stock/issues`)
        .send({ ...corpsValide, ...champDerive });
      expect(res.status).toBe(400);
    }
    expect(recordStockIssueTx).not.toHaveBeenCalled();
  });

  it('exige le demandeur, et refuse une chaîne vide', async () => {
    const { requestedBy, ...sansDemandeur } = corpsValide;
    expect(requestedBy).toBeDefined();

    const absent = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/issues`).send(sansDemandeur);
    expect(absent.status).toBe(400);

    const vide = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/stock/issues`)
      .send({ ...corpsValide, requestedBy: '   ' });
    expect(vide.status).toBe(400);

    expect(recordStockIssueTx).not.toHaveBeenCalled();
  });

  it('exige le poste de dépense — jamais deviné depuis l’article', async () => {
    const { costCategoryId, ...sansPoste } = corpsValide;
    expect(costCategoryId).toBeDefined();

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/issues`).send(sansPoste);

    expect(res.status).toBe(400);
    expect(recordStockIssueTx).not.toHaveBeenCalled();
  });

  it('refuse une quantité nulle ou négative', async () => {
    for (const quantity of [0, -3]) {
      const res = await request(app)
        .post(`/api/tenants/${TENANT_A}/finance/stock/issues`)
        .send({ ...corpsValide, quantity });
      expect(res.status).toBe(400);
    }
  });

  it('laisse remonter le 409 du domaine sur un stock insuffisant', async () => {
    recordStockIssueTx.mockRejectedValue(conflict('Stock insuffisant'));

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/issues`).send(corpsValide);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('laisse remonter le 409 du domaine sur un chantier clos', async () => {
    recordStockIssueTx.mockRejectedValue(conflict('Le chantier « Kaloum » est clôturé'));

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/issues`).send(corpsValide);

    expect(res.status).toBe(409);
  });

  it('laisse remonter le 404 du domaine sur un chantier introuvable', async () => {
    recordStockIssueTx.mockRejectedValue(notFound('Chantier introuvable'));

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/issues`).send(corpsValide);

    expect(res.status).toBe(404);
  });

  it('ne renvoie AUCUN libellé comptable (principe P-1)', async () => {
    recordStockIssueTx.mockResolvedValue(movementRecord({ type: 'ISSUE', isDecrease: true, siteId: SITE_A }));

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/issues`).send(corpsValide);

    const charge = JSON.stringify(res.body).toLowerCase();
    expect(charge).not.toContain('débit');
    expect(charge).not.toContain('debit');
    expect(charge).not.toContain('crédit');
    expect(charge).not.toContain('credit');
    expect(charge).not.toContain('311');
  });
});

// ---------------------------------------------------------------------------
// C. GET /stock/balances
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/stock/balances', () => {
  it('liste les soldes du tenant de l’URL', async () => {
    listStockBalances.mockResolvedValue([balanceRecord()]);

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/stock/balances`);

    expect(res.status).toBe(200);
    expect(res.body.data[0].averageUnitCost).toBe(5_000);
    expect(listStockBalances).toHaveBeenCalledWith(TENANT_A, {
      locationId: undefined,
      itemId: undefined,
      onlyInStock: undefined
    });
  });

  it('transmet les filtres, et ne prend pas « false » pour « true »', async () => {
    listStockBalances.mockResolvedValue([]);

    await request(app).get(
      `/api/tenants/${TENANT_A}/finance/stock/balances?locationId=${LOCATION_A}&itemId=${ITEM_A}&onlyInStock=true`
    );
    expect(listStockBalances).toHaveBeenCalledWith(TENANT_A, {
      locationId: LOCATION_A,
      itemId: ITEM_A,
      onlyInStock: true
    });

    await request(app).get(`/api/tenants/${TENANT_A}/finance/stock/balances?onlyInStock=false`);
    expect(listStockBalances).toHaveBeenLastCalledWith(TENANT_A, {
      locationId: undefined,
      itemId: undefined,
      onlyInStock: false
    });
  });

  it('refuse un filtre inconnu plutôt que de l’ignorer en silence', async () => {
    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/stock/balances?depot=Kaloum`);

    expect(res.status).toBe(400);
    expect(listStockBalances).not.toHaveBeenCalled();
  });
});
