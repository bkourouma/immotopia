import express from 'express';
import request from 'supertest';

/**
 * Tests des points d'entrée agence des mouvements de stock — lot 5, deuxième
 * sous-lot, étendus par le lot 040 (réceptions, sorties multi-lignes, retours
 * fournisseur, rebuts, soldes masqués). Le journal est testé dans
 * `finance.stock-journal.test.ts`.
 *
 * Modèle : `__tests__/api/finance.suppliers.test.ts`. Authentification et
 * agence sont des passe-plats ; les gardes `STOCK_*` sont des espions qui
 * notent la permission exigée (et peuvent refuser) ; le domaine
 * (`lib/finance/stock-mouvements.ts`) et le contexte de l'appelant sont
 * simulés. Ce fichier épingle la FORME : corps exacts transmis, `.strict()`,
 * statuts 201/200, `meta`, gardes de chaque route — la logique métier est
 * couverte par les tests unitaires.
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

const guardsHit: string[] = [];
const deniedPermissions = new Set<string>();

jest.mock('../../src/middleware/stock-rbac-middleware', () => {
  const guard = (permission: string) => (_req: any, res: any, next: any) => {
    guardsHit.push(permission);
    if (deniedPermissions.has(permission)) {
      res.status(403).json({ success: false, message: 'Permission refusée.', code: 'FORBIDDEN' });
      return;
    }
    next();
  };
  return {
    requireStockView: guard('STOCK_VIEW'),
    requireStockValuesView: guard('STOCK_VALUES_VIEW'),
    requireStockReceive: guard('STOCK_RECEIVE'),
    requireStockIssue: guard('STOCK_ISSUE'),
    requireStockTransfer: guard('STOCK_TRANSFER'),
    requireStockCount: guard('STOCK_COUNT'),
    requireStockTakersManage: guard('STOCK_TAKERS_MANAGE'),
    requireStockCountValidate: guard('STOCK_COUNT_VALIDATE'),
    requireStockDispose: guard('STOCK_DISPOSE'),
    requireStockAlertsView: guard('STOCK_ALERTS_VIEW'),
    requireStockCountOrValidate: guard('STOCK_COUNT|STOCK_COUNT_VALIDATE'),
    requireStockAttachmentDeposit: guard('STOCK_ATTACHMENT_DEPOSIT')
  };
});

const CALLER = {
  userId: 'user-1',
  valuesVisible: false,
  canValidateCount: false,
  canReceive: true,
  canIssue: true,
  canTransfer: true,
  canCount: true,
  canDispose: false,
  canManageTakers: true,
  canViewAlerts: false,
  canManageSettings: false
};
const resolveStockCallerContext = jest.fn();

jest.mock('../../src/lib/finance/stock-controles', () => ({
  resolveStockCallerContext: (...args: any[]) => resolveStockCallerContext(...args)
}));

const recordStockReceipt = jest.fn();
const recordStockIssue = jest.fn();
const recordStockSupplierReturn = jest.fn();
const recordStockScrap = jest.fn();
const listStockBalancesForCaller = jest.fn();

jest.mock('../../src/lib/finance/stock-mouvements', () => ({
  recordStockReceipt: (...args: any[]) => recordStockReceipt(...args),
  recordStockIssue: (...args: any[]) => recordStockIssue(...args),
  recordStockSupplierReturn: (...args: any[]) => recordStockSupplierReturn(...args),
  recordStockScrap: (...args: any[]) => recordStockScrap(...args),
  listStockBalancesForCaller: (...args: any[]) => listStockBalancesForCaller(...args)
}));

import { AppError, errorHandler, NotFoundError } from '../../src/middleware/error-middleware';
import financeStockMouvementsRoutes from '../../src/routes/finance-stock-mouvements-routes';

const TENANT_A = 'tenant-A';
const LOCATION_A = '11111111-1111-4111-8111-111111111111';
const ITEM_A = '22222222-2222-4222-8222-222222222222';
const INVOICE_A = '33333333-3333-4333-8333-333333333333';
const SITE_A = '44444444-4444-4444-8444-444444444444';
const CATEGORY_A = '55555555-5555-4555-8555-555555555555';
const TAKER_A = '66666666-6666-4666-8666-666666666666';
const LINE_A = '77777777-7777-4777-8777-777777777777';
const REQUEST_A = '88888888-8888-4888-8888-888888888888';

const META = { valuesVisible: false, blindLocationIds: [] };

const app = express();
app.use(express.json());
app.use('/api', financeStockMouvementsRoutes);
app.use(errorHandler);

function writeResponse(data: unknown, status: 200 | 201 = 201) {
  return { status, data, meta: META };
}

beforeEach(() => {
  jest.clearAllMocks();
  guardsHit.length = 0;
  deniedPermissions.clear();
  resolveStockCallerContext.mockResolvedValue(CALLER);
});

// ---------------------------------------------------------------------------
// A. POST /stock/receipts
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/stock/receipts', () => {
  const corpsValide = {
    locationId: LOCATION_A,
    supplierInvoiceId: INVOICE_A,
    receiptDate: '2026-10-01',
    lines: [{ itemId: ITEM_A, quantity: 100, supplierInvoiceLineId: LINE_A }],
    clientRequestId: REQUEST_A
  };

  it('garde STOCK_RECEIVE ; transmet le corps exact et le contexte de l’appelant ; 201 + meta', async () => {
    recordStockReceipt.mockResolvedValue(writeResponse({ slip: { id: 's' }, movements: [], controls: [] }));

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/receipts`).send(corpsValide);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ success: true, data: { slip: { id: 's' }, movements: [], controls: [] }, meta: META });
    expect(guardsHit).toEqual(['STOCK_RECEIVE']);
    expect(resolveStockCallerContext).toHaveBeenCalledWith('user-1', TENANT_A);
    const [tenantId, ctx, input] = recordStockReceipt.mock.calls[0];
    expect(tenantId).toBe(TENANT_A);
    expect(ctx).toBe(CALLER);
    expect(input).toEqual({ ...corpsValide, receiptDate: new Date('2026-10-01') });
  });

  it('répond 200 pour un rejeu idempotent', async () => {
    recordStockReceipt.mockResolvedValue(writeResponse({ slip: { id: 's' }, movements: [], controls: [] }, 200));
    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/receipts`).send(corpsValide);
    expect(res.status).toBe(200);
  });

  it('accepte une ligne SANS prix (chaîne A8-R3) et une quantité à quatre décimales', async () => {
    recordStockReceipt.mockResolvedValue(writeResponse({ slip: {}, movements: [], controls: [] }));
    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/stock/receipts`)
      .send({ ...corpsValide, lines: [{ itemId: ITEM_A, quantity: 12.5025 }] });
    expect(res.status).toBe(201);
    expect(recordStockReceipt.mock.calls[0][2].lines[0]).toEqual({ itemId: ITEM_A, quantity: 12.5025 });
  });

  it('refuse le tenantId dans le corps, une quantité nulle, un prix négatif, aucune ligne, plus de 50 lignes', async () => {
    const corps = [
      { ...corpsValide, tenantId: TENANT_A },
      { ...corpsValide, lines: [{ itemId: ITEM_A, quantity: 0 }] },
      { ...corpsValide, lines: [{ itemId: ITEM_A, quantity: 1, unitCost: -1 }] },
      { ...corpsValide, lines: [] },
      { ...corpsValide, lines: Array.from({ length: 51 }, () => ({ itemId: ITEM_A, quantity: 1 })) },
      { ...corpsValide, clientRequestId: 'pas-un-uuid' }
    ];
    for (const body of corps) {
      const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/receipts`).send(body);
      expect(res.status).toBe(400);
    }
    expect(recordStockReceipt).not.toHaveBeenCalled();
  });

  it('laisse remonter les codes du domaine (403 STOCK_VALUE_FIELD_FORBIDDEN, 409 STOCK_SITE_CLOSED) avec leur code', async () => {
    recordStockReceipt.mockRejectedValueOnce(
      new AppError('Vous ne pouvez pas saisir de prix.', 403, 'STOCK_VALUE_FIELD_FORBIDDEN')
    );
    const forbidden = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/stock/receipts`)
      .send({ ...corpsValide, lines: [{ itemId: ITEM_A, quantity: 1, unitCost: 10 }] });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.code).toBe('STOCK_VALUE_FIELD_FORBIDDEN');

    recordStockReceipt.mockRejectedValueOnce(new AppError('Chantier clôturé.', 409, 'STOCK_SITE_CLOSED'));
    const closed = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/receipts`).send(corpsValide);
    expect(closed.status).toBe(409);
    expect(closed.body.code).toBe('STOCK_SITE_CLOSED');
  });

  it('sans STOCK_RECEIVE : 403, le domaine n’est pas appelé', async () => {
    deniedPermissions.add('STOCK_RECEIVE');
    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/receipts`).send(corpsValide);
    expect(res.status).toBe(403);
    expect(recordStockReceipt).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// B. POST /stock/issues
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/stock/issues', () => {
  const corpsMultiLignes = {
    locationId: LOCATION_A,
    siteId: SITE_A,
    issueDate: '2026-10-02',
    takerId: TAKER_A,
    lines: [
      { itemId: ITEM_A, quantity: 10, costCategoryId: CATEGORY_A },
      { itemId: ITEM_A, quantity: 5, costCategoryId: CATEGORY_A }
    ]
  };

  it('garde STOCK_ISSUE ; corps multi-lignes transmis tel quel ; 201 + meta', async () => {
    recordStockIssue.mockResolvedValue(writeResponse({ slip: { number: 'BS-2026-00001' }, movements: [] }));
    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/issues`).send(corpsMultiLignes);
    expect(res.status).toBe(201);
    expect(res.body.data.slip.number).toBe('BS-2026-00001');
    expect(res.body.meta).toEqual(META);
    expect(guardsHit).toEqual(['STOCK_ISSUE']);
    expect(recordStockIssue.mock.calls[0][2]).toEqual({ ...corpsMultiLignes, issueDate: new Date('2026-10-02') });
  });

  it('convertit la forme à un article (lot 5) en une ligne', async () => {
    recordStockIssue.mockResolvedValue(writeResponse({ slip: {}, movements: [] }));
    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/issues`).send({
      locationId: LOCATION_A,
      itemId: ITEM_A,
      quantity: 50,
      siteId: SITE_A,
      costCategoryId: CATEGORY_A,
      requestedBy: 'Chef de chantier Camara',
      issueDate: '2026-10-02'
    });
    expect(res.status).toBe(201);
    expect(recordStockIssue.mock.calls[0][2]).toEqual({
      locationId: LOCATION_A,
      siteId: SITE_A,
      requestedBy: 'Chef de chantier Camara',
      issueDate: new Date('2026-10-02'),
      lines: [{ itemId: ITEM_A, quantity: 50, costCategoryId: CATEGORY_A }]
    });
  });

  it('REFUSE un prix (dérivé, jamais saisi, P-4), un poste absent, une quantité nulle, un demandeur vide', async () => {
    const corps = [
      { ...corpsMultiLignes, lines: [{ itemId: ITEM_A, quantity: 1, costCategoryId: CATEGORY_A, unitCost: 10 }] },
      { ...corpsMultiLignes, lines: [{ itemId: ITEM_A, quantity: 1 }] },
      { ...corpsMultiLignes, lines: [{ itemId: ITEM_A, quantity: 0, costCategoryId: CATEGORY_A }] },
      { ...corpsMultiLignes, requestedBy: '   ' },
      {
        ...corpsMultiLignes,
        lines: Array.from({ length: 51 }, () => ({ itemId: ITEM_A, quantity: 1, costCategoryId: CATEGORY_A }))
      }
    ];
    for (const body of corps) {
      const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/issues`).send(body);
      expect(res.status).toBe(400);
    }
    expect(recordStockIssue).not.toHaveBeenCalled();
  });

  it('laisse remonter 409 STOCK_INSUFFICIENT avec data, 400 STOCK_REQUESTER_REQUIRED, 404', async () => {
    recordStockIssue.mockRejectedValueOnce(
      new AppError('Stock insuffisant sur ce lieu pour la quantité demandée.', 409, 'STOCK_INSUFFICIENT', undefined, {
        items: [{ itemId: ITEM_A, itemLabel: 'Ciment', requestedQuantity: 150 }]
      })
    );
    const insufficient = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/stock/issues`)
      .send(corpsMultiLignes);
    expect(insufficient.status).toBe(409);
    expect(insufficient.body).toMatchObject({ code: 'STOCK_INSUFFICIENT', data: { items: [{ itemId: ITEM_A }] } });

    recordStockIssue.mockRejectedValueOnce(
      new AppError('Indiquez le preneur ou le demandeur.', 400, 'STOCK_REQUESTER_REQUIRED')
    );
    const requester = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/stock/issues`)
      .send({ ...corpsMultiLignes, takerId: undefined });
    expect(requester.body.code).toBe('STOCK_REQUESTER_REQUIRED');

    recordStockIssue.mockRejectedValueOnce(new NotFoundError('Preneur introuvable.'));
    const notFound = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/issues`).send(corpsMultiLignes);
    expect(notFound.status).toBe(404);
  });

  it('ne renvoie AUCUN libellé comptable (principe P-1)', async () => {
    recordStockIssue.mockResolvedValue(
      writeResponse({ slip: { number: 'BS-2026-00001' }, movements: [{ type: 'ISSUE' }] })
    );
    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/issues`).send(corpsMultiLignes);
    expect(JSON.stringify(res.body)).not.toMatch(/débit|crédit|debit|credit/i);
  });
});

// ---------------------------------------------------------------------------
// C. POST /stock/supplier-returns et /stock/scraps
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/stock/supplier-returns', () => {
  const corps = {
    locationId: LOCATION_A,
    supplierInvoiceId: INVOICE_A,
    supplierInvoiceLineId: LINE_A,
    itemId: ITEM_A,
    quantity: 10,
    returnDate: '2026-10-02',
    reasonCode: 'NON_CONFORMING'
  };

  it('garde STOCK_DISPOSE ; corps exact ; 201', async () => {
    recordStockSupplierReturn.mockResolvedValue(writeResponse({ id: 'm', type: 'SUPPLIER_RETURN' }));
    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/supplier-returns`).send(corps);
    expect(res.status).toBe(201);
    expect(guardsHit).toEqual(['STOCK_DISPOSE']);
    expect(recordStockSupplierReturn.mock.calls[0][2]).toEqual({ ...corps, returnDate: new Date('2026-10-02') });
  });

  it('le magasinier (sans STOCK_DISPOSE) reçoit 403 (critère A6-4)', async () => {
    deniedPermissions.add('STOCK_DISPOSE');
    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/supplier-returns`).send(corps);
    expect(res.status).toBe(403);
    expect(recordStockSupplierReturn).not.toHaveBeenCalled();
  });

  it('refuse un prix, un motif hors liste fermée ; laisse remonter 409 STOCK_RETURN_UNVALUED', async () => {
    for (const body of [
      { ...corps, unitCost: 10 },
      { ...corps, reasonCode: 'PERDU' }
    ]) {
      expect(
        (await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/supplier-returns`).send(body)).status
      ).toBe(400);
    }
    recordStockSupplierReturn.mockRejectedValueOnce(
      new AppError('Indiquez la ligne de la facture.', 409, 'STOCK_RETURN_UNVALUED')
    );
    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/supplier-returns`).send(corps);
    expect(res.body.code).toBe('STOCK_RETURN_UNVALUED');
  });
});

describe('POST /tenants/:tenantId/finance/stock/scraps', () => {
  const corps = {
    locationId: LOCATION_A,
    itemId: ITEM_A,
    quantity: 5,
    scrapDate: '2026-10-02',
    reasonCode: 'BREAKAGE'
  };

  it('garde STOCK_DISPOSE ; corps exact ; 201', async () => {
    recordStockScrap.mockResolvedValue(writeResponse({ id: 'm', type: 'SCRAP' }));
    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/scraps`).send(corps);
    expect(res.status).toBe(201);
    expect(guardsHit).toEqual(['STOCK_DISPOSE']);
    expect(recordStockScrap.mock.calls[0][2]).toEqual({ ...corps, scrapDate: new Date('2026-10-02') });
  });

  it('refuse un chantier ou un prix dans le corps : un rebut n’impute aucun chantier', async () => {
    for (const body of [
      { ...corps, siteId: SITE_A },
      { ...corps, unitCost: 1 }
    ]) {
      expect((await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/scraps`).send(body)).status).toBe(400);
    }
    expect(recordStockScrap).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// D. GET /stock/balances
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/stock/balances', () => {
  it('garde STOCK_VIEW ; data reste un tableau, meta s’ajoute', async () => {
    listStockBalancesForCaller.mockResolvedValue({
      data: [{ itemId: ITEM_A, quantity: null }],
      meta: { ...META, blindLocationIds: [LOCATION_A] }
    });
    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/stock/balances`);
    expect(res.status).toBe(200);
    expect(guardsHit).toEqual(['STOCK_VIEW']);
    expect(res.body).toEqual({
      success: true,
      data: [{ itemId: ITEM_A, quantity: null }],
      meta: { valuesVisible: false, blindLocationIds: [LOCATION_A] }
    });
    expect(listStockBalancesForCaller).toHaveBeenCalledWith(TENANT_A, CALLER, {
      locationId: undefined,
      itemId: undefined,
      onlyInStock: undefined
    });
  });

  it('transmet les filtres, et ne prend pas « false » pour « true »', async () => {
    listStockBalancesForCaller.mockResolvedValue({ data: [], meta: META });
    await request(app).get(
      `/api/tenants/${TENANT_A}/finance/stock/balances?locationId=${LOCATION_A}&itemId=${ITEM_A}&onlyInStock=false`
    );
    expect(listStockBalancesForCaller.mock.calls[0][2]).toEqual({
      locationId: LOCATION_A,
      itemId: ITEM_A,
      onlyInStock: false
    });
  });

  it('refuse un filtre inconnu', async () => {
    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/stock/balances?siteId=${SITE_A}`);
    expect(res.status).toBe(400);
  });
});
