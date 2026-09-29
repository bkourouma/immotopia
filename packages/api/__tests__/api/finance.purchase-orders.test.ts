import express from 'express';
import request from 'supertest';

/**
 * Tests des sept points d'entrée agence « bons de commande et engagé » —
 * lot 3, volet achats.
 *
 * Modèle de mock : `__tests__/api/finance.sites.test.ts` (lot 2). Les
 * middlewares d'authentification, de tenant et de droits sont remplacés par
 * des passe-plats ; le domaine (`lib/finance/purchase-orders.ts`) est simulé
 * pour vérifier que le contrôleur transmet bien l'isolation, la validation
 * Zod et les erreurs typées, plutôt que de les recréer.
 *
 * `requireAccountsRead`, `requireDocumentsCreate` et `requireDocumentsValidate`
 * enregistrent leur appel dans `guardCalls` : simples passe-plats qui laissent
 * toujours passer la requête, ils ne peuvent donc pas, par leur seul
 * comportement, prouver que la bonne garde est posée sur la bonne route.
 * `guardCalls` sert cette preuve — notamment pour l'émission et l'annulation
 * d'un bon, qui doivent porter `requireDocumentsValidate` et jamais
 * `requireDocumentsCreate` (décision D7).
 */

let guardCalls: string[] = [];

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
  requireAccountsRead: (_req: any, _res: any, next: any) => {
    guardCalls.push('accountsRead');
    next();
  },
  requireReportsRead: (_req: any, _res: any, next: any) => next(),
  requireDocumentsCreate: (_req: any, _res: any, next: any) => {
    guardCalls.push('documentsCreate');
    next();
  },
  requireDocumentsValidate: (_req: any, _res: any, next: any) => {
    guardCalls.push('documentsValidate');
    next();
  },
  requireSitesManage: (_req: any, _res: any, next: any) => next(),
  requireSettingsManage: (_req: any, _res: any, next: any) => next()
}));

const listPurchaseOrders = jest.fn();
const getPurchaseOrder = jest.fn();
const getSiteEngagement = jest.fn();
const createPurchaseOrderTx = jest.fn();
const issuePurchaseOrderTx = jest.fn();
const cancelPurchaseOrderTx = jest.fn();
const linkInvoiceToPurchaseOrderTx = jest.fn();

jest.mock('../../src/lib/finance/purchase-orders', () => ({
  listPurchaseOrders: (...args: any[]) => listPurchaseOrders(...args),
  getPurchaseOrder: (...args: any[]) => getPurchaseOrder(...args),
  getSiteEngagement: (...args: any[]) => getSiteEngagement(...args),
  createPurchaseOrderTx: (...args: any[]) => createPurchaseOrderTx(...args),
  issuePurchaseOrderTx: (...args: any[]) => issuePurchaseOrderTx(...args),
  cancelPurchaseOrderTx: (...args: any[]) => cancelPurchaseOrderTx(...args),
  linkInvoiceToPurchaseOrderTx: (...args: any[]) => linkInvoiceToPurchaseOrderTx(...args)
}));

// Le contrôleur ouvre sa propre transaction (`prisma.$transaction`) pour
// chaque écriture ; le mock se contente d'invoquer le callback avec un jeton
// neutre, comme au lot 2 (`__tests__/api/finance.suppliers.test.ts`).
const transactionMock = jest.fn(async (callback: any) => callback('tx-token'));

const supplierInvoiceFindMany = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    $transaction: (callback: any) => transactionMock(callback),
    supplierInvoice: { findMany: (...args: any[]) => supplierInvoiceFindMany(...args) }
  }
}));

import { errorHandler, ConflictError, NotFoundError, BadRequestError } from '../../src/middleware/error-middleware';
import financePurchaseOrdersRoutes from '../../src/routes/finance-purchase-orders-routes';

const TENANT_A = 'tenant-A';
const TENANT_B = 'tenant-B';
const SITE_A = '11111111-1111-4111-8111-111111111111';
const SUPPLIER_A = '22222222-2222-4222-8222-222222222222';
const CATEGORY_A = '33333333-3333-4333-8333-333333333333';
const ORDER_A = '44444444-4444-4444-8444-444444444444';
const INVOICE_A = '55555555-5555-4555-8555-555555555555';

const app = express();
app.use(express.json());
app.use('/api', financePurchaseOrdersRoutes);
app.use(errorHandler);

function samplePurchaseOrder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ORDER_A,
    tenantId: TENANT_A,
    siteId: SITE_A,
    siteLabel: 'Villa Kipé — extension',
    supplierId: SUPPLIER_A,
    supplierLabel: 'SARL Ciment Guinée',
    reference: 'BC-2026-001',
    orderDate: new Date('2026-09-01'),
    status: 'DRAFT',
    currency: 'XOF',
    lines: [
      { id: 'line-1', costCategoryId: CATEGORY_A, costCategoryLabel: 'Matériaux', label: 'Ciment', amount: 1_000_000 }
    ],
    totalAmount: 1_000_000,
    invoicedAmount: 0,
    remainingAmount: 1_000_000,
    invoicingState: 'NOT_INVOICED',
    ...overrides
  };
}

function sampleSiteEngagement(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    siteId: SITE_A,
    actualCost: 400_000,
    openCommitments: 600_000,
    engagedAmount: 1_000_000,
    currency: 'XOF',
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  guardCalls = [];
});

// ---------------------------------------------------------------------------
// A. GET purchase-orders
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/purchase-orders', () => {
  it('liste les bons du tenant (cas nominal)', async () => {
    listPurchaseOrders.mockResolvedValue([samplePurchaseOrder()]);

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/purchase-orders`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(ORDER_A);
    expect(response.body.data[0].siteLabel).toBe('Villa Kipé — extension');
    expect(listPurchaseOrders).toHaveBeenCalledWith(TENANT_A, {
      siteId: undefined,
      supplierId: undefined,
      status: undefined
    });
    expect(guardCalls).toContain('accountsRead');
  });

  it('filtre par chantier, fournisseur et statut', async () => {
    listPurchaseOrders.mockResolvedValue([]);

    await request(app).get(
      `/api/tenants/${TENANT_A}/finance/purchase-orders?siteId=${SITE_A}&supplierId=${SUPPLIER_A}&status=ISSUED`
    );

    expect(listPurchaseOrders).toHaveBeenCalledWith(TENANT_A, {
      siteId: SITE_A,
      supplierId: SUPPLIER_A,
      status: 'ISSUED'
    });
  });

  it('rejette en 400 un statut hors énumération', async () => {
    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/purchase-orders?status=NOT_A_STATUS`);

    expect(response.status).toBe(400);
    expect(listPurchaseOrders).not.toHaveBeenCalled();
  });

  it("n'expose aucune chaîne « débit » ni « crédit »", async () => {
    listPurchaseOrders.mockResolvedValue([samplePurchaseOrder()]);

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/purchase-orders`);

    expect(JSON.stringify(response.body)).not.toMatch(/débit|crédit/i);
  });
});

// ---------------------------------------------------------------------------
// B. POST purchase-orders
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/purchase-orders', () => {
  const body = {
    siteId: SITE_A,
    supplierId: SUPPLIER_A,
    reference: 'BC-2026-001',
    orderDate: '2026-09-01',
    lines: [{ costCategoryId: CATEGORY_A, label: 'Ciment', amount: 1_000_000 }]
  };

  it('crée un bon en brouillon (cas nominal, 201)', async () => {
    createPurchaseOrderTx.mockResolvedValue(samplePurchaseOrder());

    const response = await request(app).post(`/api/tenants/${TENANT_A}/finance/purchase-orders`).send(body);

    expect(response.status).toBe(201);
    expect(response.body.data.id).toBe(ORDER_A);
    expect(createPurchaseOrderTx).toHaveBeenCalledWith(
      'tx-token',
      TENANT_A,
      expect.objectContaining({
        siteId: SITE_A,
        supplierId: SUPPLIER_A,
        reference: 'BC-2026-001',
        createdByUserId: 'user-1'
      })
    );
    expect(guardCalls).toContain('documentsCreate');
    expect(guardCalls).not.toContain('documentsValidate');
  });

  // -------------------------------------------------------------------------
  // Quantite et prix unitaire sur une ligne — additifs et facultatifs
  // -------------------------------------------------------------------------

  it('transmet la quantite et le prix unitaire au domaine, et les rend dans la reponse', async () => {
    createPurchaseOrderTx.mockResolvedValue(
      samplePurchaseOrder({
        lines: [
          {
            id: 'line-1',
            costCategoryId: CATEGORY_A,
            costCategoryLabel: 'Matériaux',
            label: 'Ciment',
            amount: 1_000_000,
            quantity: 40,
            unitPrice: 25_000
          }
        ]
      })
    );

    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/purchase-orders`)
      .send({
        ...body,
        lines: [{ costCategoryId: CATEGORY_A, label: 'Ciment', amount: 1_000_000, quantity: 40, unitPrice: 25_000 }]
      });

    expect(response.status).toBe(201);
    // L'aller-retour conserve les deux champs.
    expect(response.body.data.lines[0].quantity).toBe(40);
    expect(response.body.data.lines[0].unitPrice).toBe(25_000);
    const [, , params] = createPurchaseOrderTx.mock.calls[0];
    expect(params.lines[0]).toEqual({
      costCategoryId: CATEGORY_A,
      label: 'Ciment',
      amount: 1_000_000,
      quantity: 40,
      unitPrice: 25_000
    });
  });

  it('accepte une ligne sans quantite ni prix unitaire, et rend `null` pour les deux', async () => {
    createPurchaseOrderTx.mockResolvedValue(
      samplePurchaseOrder({
        lines: [
          {
            id: 'line-1',
            costCategoryId: CATEGORY_A,
            costCategoryLabel: 'Matériaux',
            label: 'Forfait de pose',
            amount: 1_000_000,
            quantity: null,
            unitPrice: null
          }
        ]
      })
    );

    const response = await request(app).post(`/api/tenants/${TENANT_A}/finance/purchase-orders`).send(body);

    expect(response.status).toBe(201);
    expect(response.body.data.lines[0].quantity).toBeNull();
    expect(response.body.data.lines[0].unitPrice).toBeNull();
  });

  it('rejette en 400 une quantite negative', async () => {
    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/purchase-orders`)
      .send({
        ...body,
        lines: [{ costCategoryId: CATEGORY_A, label: 'Ciment', amount: 1_000_000, quantity: -1, unitPrice: 25_000 }]
      });

    expect(response.status).toBe(400);
    expect(createPurchaseOrderTx).not.toHaveBeenCalled();
  });

  it('rejette en 400 un corps sans ligne', async () => {
    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/purchase-orders`)
      .send({ ...body, lines: [] });

    expect(response.status).toBe(400);
    expect(createPurchaseOrderTx).not.toHaveBeenCalled();
  });

  it('rejette en 400 un corps sans référence', async () => {
    const { reference, ...rest } = body;
    void reference;

    const response = await request(app).post(`/api/tenants/${TENANT_A}/finance/purchase-orders`).send(rest);

    expect(response.status).toBe(400);
    expect(createPurchaseOrderTx).not.toHaveBeenCalled();
  });

  it('refuse un montant total envoyé en entrée (principe P-4) : ignoré, jamais transmis tel quel', async () => {
    createPurchaseOrderTx.mockResolvedValue(samplePurchaseOrder());

    await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/purchase-orders`)
      .send({ ...body, totalAmount: 999_999_999 });

    // Le schéma Zod ne connaît pas `totalAmount` : il n'atteint jamais le domaine.
    const [, , params] = createPurchaseOrderTx.mock.calls[0];
    expect(params.totalAmount).toBeUndefined();
  });

  it('renvoie 409 sur une référence déjà utilisée', async () => {
    createPurchaseOrderTx.mockRejectedValue(new ConflictError('Un bon de commande porte déjà cette référence.'));

    const response = await request(app).post(`/api/tenants/${TENANT_A}/finance/purchase-orders`).send(body);

    expect(response.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// C. GET purchase-orders/:orderId
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/purchase-orders/:orderId', () => {
  beforeEach(() => {
    supplierInvoiceFindMany.mockReset();
    supplierInvoiceFindMany.mockResolvedValue([]);
  });

  // BUG-2026-09-29-033 : la fiche du bon montre les factures qui lui sont rapprochées.
  it('joint au détail les factures rapprochées du bon, lues dans l’agence de l’URL', async () => {
    getPurchaseOrder.mockResolvedValue(samplePurchaseOrder({ status: 'ISSUED' }));
    supplierInvoiceFindMany.mockResolvedValue([
      { id: INVOICE_A, reference: 'FAC-001', invoiceDate: new Date('2026-09-10'), amount: '400000', status: 'DRAFT' }
    ]);

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/purchase-orders/${ORDER_A}`);

    expect(response.status).toBe(200);
    expect(response.body.data.invoices).toEqual([
      { id: INVOICE_A, reference: 'FAC-001', invoiceDate: '2026-09-10T00:00:00.000Z', amount: 400_000, status: 'DRAFT' }
    ]);
    expect(supplierInvoiceFindMany.mock.calls[0][0].where).toEqual({ tenantId: TENANT_A, purchaseOrderId: ORDER_A });
  });

  it('renvoie une liste de factures vide pour un bon sans rapprochement', async () => {
    getPurchaseOrder.mockResolvedValue(samplePurchaseOrder());

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/purchase-orders/${ORDER_A}`);

    expect(response.body.data.invoices).toEqual([]);
  });

  it('renvoie le détail du bon (cas nominal)', async () => {
    getPurchaseOrder.mockResolvedValue(samplePurchaseOrder());

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/purchase-orders/${ORDER_A}`);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(ORDER_A);
    expect(response.body.data.remainingAmount).toBe(1_000_000);
    expect(guardCalls).toContain('accountsRead');
  });

  it('rejette en 400 un identifiant malformé', async () => {
    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/purchase-orders/pas-un-uuid`);

    expect(response.status).toBe(400);
    expect(getPurchaseOrder).not.toHaveBeenCalled();
  });

  it('renvoie 404 pour un bon inexistant', async () => {
    getPurchaseOrder.mockRejectedValue(new NotFoundError('Bon de commande introuvable.'));

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/purchase-orders/${ORDER_A}`);

    expect(response.status).toBe(404);
  });

  it("isole les tenants : le tenant B n'accède pas à un bon du tenant A", async () => {
    getPurchaseOrder.mockImplementation(async (tenantId: string, orderId: string) => {
      if (tenantId !== TENANT_A || orderId !== ORDER_A) {
        throw new NotFoundError('Bon de commande introuvable.');
      }
      return samplePurchaseOrder();
    });

    const ownResponse = await request(app).get(`/api/tenants/${TENANT_A}/finance/purchase-orders/${ORDER_A}`);
    const crossTenantResponse = await request(app).get(`/api/tenants/${TENANT_B}/finance/purchase-orders/${ORDER_A}`);

    expect(ownResponse.status).toBe(200);
    expect(crossTenantResponse.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// D. POST purchase-orders/:orderId/issue
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/purchase-orders/:orderId/issue', () => {
  it('émet un bon brouillon (cas nominal, 200)', async () => {
    issuePurchaseOrderTx.mockResolvedValue(samplePurchaseOrder({ status: 'ISSUED' }));

    const response = await request(app).post(`/api/tenants/${TENANT_A}/finance/purchase-orders/${ORDER_A}/issue`);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('ISSUED');
    expect(issuePurchaseOrderTx).toHaveBeenCalledWith('tx-token', TENANT_A, ORDER_A, 'user-1');
    expect(guardCalls).toEqual(['documentsValidate']);
    expect(guardCalls).not.toContain('documentsCreate');
  });

  it('renvoie 409, pas 400, sur un bon déjà émis', async () => {
    issuePurchaseOrderTx.mockRejectedValue(new ConflictError('Ce bon de commande est déjà émis.'));

    const response = await request(app).post(`/api/tenants/${TENANT_A}/finance/purchase-orders/${ORDER_A}/issue`);

    expect(response.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// E. POST purchase-orders/:orderId/cancel
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/purchase-orders/:orderId/cancel', () => {
  it('annule un bon (cas nominal, 200)', async () => {
    cancelPurchaseOrderTx.mockResolvedValue(samplePurchaseOrder({ status: 'CANCELLED' }));

    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/purchase-orders/${ORDER_A}/cancel`)
      .send({ reason: 'Doublon de saisie' });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('CANCELLED');
    expect(cancelPurchaseOrderTx).toHaveBeenCalledWith('tx-token', TENANT_A, ORDER_A, 'Doublon de saisie');
    expect(guardCalls).toEqual(['documentsValidate']);
  });

  it('exige un motif : rejette en 400 un corps sans `reason`', async () => {
    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/purchase-orders/${ORDER_A}/cancel`)
      .send({});

    expect(response.status).toBe(400);
    expect(cancelPurchaseOrderTx).not.toHaveBeenCalled();
  });

  it('renvoie 409 quand une facture est rapprochée du bon', async () => {
    cancelPurchaseOrderTx.mockRejectedValue(new ConflictError('Une facture est rapprochée de ce bon de commande.'));

    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/purchase-orders/${ORDER_A}/cancel`)
      .send({ reason: 'Chantier suspendu' });

    expect(response.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// F. POST supplier-invoices/:invoiceId/purchase-order
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/supplier-invoices/:invoiceId/purchase-order', () => {
  it('rapproche une facture à un bon (cas nominal, 200)', async () => {
    linkInvoiceToPurchaseOrderTx.mockResolvedValue(samplePurchaseOrder({ status: 'ISSUED' }));

    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/supplier-invoices/${INVOICE_A}/purchase-order`)
      .send({ purchaseOrderId: ORDER_A });

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(ORDER_A);
    expect(linkInvoiceToPurchaseOrderTx).toHaveBeenCalledWith('tx-token', TENANT_A, INVOICE_A, ORDER_A);
    // Rapprocher une facture est un geste de saisie, pas de validation.
    expect(guardCalls).toEqual(['documentsCreate']);
  });

  it('défait un rapprochement avec `purchaseOrderId: null`, et répond `data: null`', async () => {
    linkInvoiceToPurchaseOrderTx.mockResolvedValue(null);

    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/supplier-invoices/${INVOICE_A}/purchase-order`)
      .send({ purchaseOrderId: null });

    expect(response.status).toBe(200);
    expect(response.body.data).toBeNull();
    expect(linkInvoiceToPurchaseOrderTx).toHaveBeenCalledWith('tx-token', TENANT_A, INVOICE_A, null);
  });

  it('rejette en 400 un corps sans `purchaseOrderId` (ambigu entre rapprocher et défaire)', async () => {
    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/supplier-invoices/${INVOICE_A}/purchase-order`)
      .send({});

    expect(response.status).toBe(400);
    expect(linkInvoiceToPurchaseOrderTx).not.toHaveBeenCalled();
  });

  it('renvoie 409 pour une facture déjà validée', async () => {
    linkInvoiceToPurchaseOrderTx.mockRejectedValue(new ConflictError('Cette facture est déjà validée.'));

    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/supplier-invoices/${INVOICE_A}/purchase-order`)
      .send({ purchaseOrderId: ORDER_A });

    expect(response.status).toBe(409);
  });

  it('renvoie 400 pour un fournisseur ou un chantier différent', async () => {
    linkInvoiceToPurchaseOrderTx.mockRejectedValue(
      new BadRequestError('La facture et le bon ne portent pas le même fournisseur.')
    );

    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/supplier-invoices/${INVOICE_A}/purchase-order`)
      .send({ purchaseOrderId: ORDER_A });

    expect(response.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// G. GET sites/:siteId/engagement
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/sites/:siteId/engagement', () => {
  it("renvoie l'engagé du chantier (cas nominal)", async () => {
    getSiteEngagement.mockResolvedValue(sampleSiteEngagement());

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/engagement`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(sampleSiteEngagement());
    expect(guardCalls).toContain('accountsRead');
  });

  it('renvoie 404 pour un chantier inexistant', async () => {
    getSiteEngagement.mockRejectedValue(new NotFoundError('Chantier introuvable.'));

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/engagement`);

    expect(response.status).toBe(404);
  });

  it('rejette en 400 un identifiant de chantier malformé', async () => {
    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/sites/pas-un-uuid/engagement`);

    expect(response.status).toBe(400);
    expect(getSiteEngagement).not.toHaveBeenCalled();
  });
});
