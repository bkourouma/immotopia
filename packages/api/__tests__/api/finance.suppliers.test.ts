import express from 'express';
import request from 'supertest';

/**
 * Tests des dix points d'entrée agence du module financier opérationnel —
 * lot 2, dernière vague, volet fournisseurs.
 *
 * Modèle de mock : `__tests__/api/finance.test.ts` (lot 1). Les middlewares
 * d'authentification, de tenant et de droits sont remplacés par des
 * passe-plats ; le domaine (`lib/finance/suppliers.ts`,
 * `lib/finance/accounting.ts`) et les lectures directes (`utils/database`)
 * sont simulés en mémoire, filtrés par `tenantId`, pour vérifier que le
 * contrôleur transmet bien l'isolation plutôt que de la recréer.
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

const createSupplierTx = jest.fn();
const createSupplierInvoiceTx = jest.fn();
const createSupplierPaymentTx = jest.fn();
const validateSupplierInvoiceTx = jest.fn();
const getSuppliersBalance = jest.fn();

jest.mock('../../src/lib/finance/suppliers', () => ({
  createSupplierTx: (...args: any[]) => createSupplierTx(...args),
  createSupplierInvoiceTx: (...args: any[]) => createSupplierInvoiceTx(...args),
  createSupplierPaymentTx: (...args: any[]) => createSupplierPaymentTx(...args),
  validateSupplierInvoiceTx: (...args: any[]) => validateSupplierInvoiceTx(...args),
  getSuppliersBalance: (...args: any[]) => getSuppliersBalance(...args)
}));

const voidDocumentTx = jest.fn();

jest.mock('../../src/lib/finance/accounting', () => ({
  voidDocumentTx: (...args: any[]) => voidDocumentTx(...args)
}));

const supplierFindMany = jest.fn();
const supplierFindFirst = jest.fn();
const supplierInvoiceFindMany = jest.fn();
const supplierInvoiceFindFirst = jest.fn();
const thirdPartyAccountFindUniqueOrThrow = jest.fn();
const supplierPaymentFindUniqueOrThrow = jest.fn();
const voidDocumentFindUniqueOrThrow = jest.fn();

/**
 * Le contrôleur ouvre ses transactions via `prisma.$transaction(tx => ...)`
 * puis appelle des méthodes sur `tx` (ex. `tx.thirdPartyAccount.findUniqueOrThrow`).
 * Le faux client renvoyé au callback partage les mêmes espions que le client
 * de premier niveau, pour qu'un test puisse configurer une seule fois
 * `thirdPartyAccountFindUniqueOrThrow` quel que soit le chemin (`prisma.x` ou
 * `tx.x`) qui l'invoque réellement.
 */
function fakePrismaClient() {
  return {
    supplier: {
      findMany: (...args: any[]) => supplierFindMany(...args),
      findFirst: (...args: any[]) => supplierFindFirst(...args)
    },
    supplierInvoice: {
      findMany: (...args: any[]) => supplierInvoiceFindMany(...args),
      findFirst: (...args: any[]) => supplierInvoiceFindFirst(...args)
    },
    supplierPayment: {
      findUniqueOrThrow: (...args: any[]) => supplierPaymentFindUniqueOrThrow(...args)
    },
    thirdPartyAccount: {
      findUniqueOrThrow: (...args: any[]) => thirdPartyAccountFindUniqueOrThrow(...args)
    },
    voidDocument: {
      findUniqueOrThrow: (...args: any[]) => voidDocumentFindUniqueOrThrow(...args)
    }
  };
}

jest.mock('../../src/utils/database', () => ({
  prisma: {
    $transaction: (callback: any) => callback(fakePrismaClient()),
    ...fakePrismaClient()
  }
}));

import { badRequest, conflict, notFound } from '../../src/lib/errors';
import { errorHandler } from '../../src/middleware/error-middleware';
import financeSuppliersRoutes from '../../src/routes/finance-suppliers-routes';

const TENANT_A = 'tenant-A';
const TENANT_B = 'tenant-B';
const SUPPLIER_A = '11111111-1111-4111-8111-111111111111';
const INVOICE_A = '33333333-3333-4333-8333-333333333333';
const SITE_A = '44444444-4444-4444-8444-444444444444';
const CATEGORY_A = '55555555-5555-4555-8555-555555555555';
const ACCOUNT_A = '66666666-6666-4666-8666-666666666666';

const app = express();
app.use(express.json());
app.use('/api', financeSuppliersRoutes);
app.use(errorHandler);

function supplierRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: SUPPLIER_A,
    tenantId: TENANT_A,
    name: 'Ciments du Futa',
    kind: 'MATERIALS',
    contactName: null,
    phone: '622000000',
    email: 'contact@cimentsdufuta.gn',
    maintenanceVendorId: null,
    thirdPartyAccountId: ACCOUNT_A,
    isActive: true,
    ...overrides
  };
}

function supplierRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: SUPPLIER_A,
    tenantId: TENANT_A,
    name: 'Ciments du Futa',
    kind: 'MATERIALS',
    contactPhone: '622000000',
    contactEmail: 'contact@cimentsdufuta.gn',
    maintenanceVendorId: null,
    thirdPartyAccountId: ACCOUNT_A,
    isActive: true,
    thirdPartyAccount: { balance: 150_000, currency: 'XOF' },
    ...overrides
  };
}

function invoiceRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: INVOICE_A,
    supplierId: SUPPLIER_A,
    siteId: SITE_A,
    invoiceDate: new Date('2026-09-10'),
    reference: 'FAC-2026-001',
    amount: 500_000,
    currency: 'XOF',
    status: 'DRAFT',
    createdByUserId: 'user-1',
    validatedByUserId: null,
    validatedAt: null,
    ...overrides
  };
}

function invoiceRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: INVOICE_A,
    supplierId: SUPPLIER_A,
    tenantId: TENANT_A,
    siteId: SITE_A,
    invoiceDate: new Date('2026-09-10'),
    reference: 'FAC-2026-001',
    amount: 500_000,
    currency: 'XOF',
    status: 'DRAFT',
    createdByUserId: 'user-1',
    validatedByUserId: null,
    validatedAt: null,
    ...overrides
  };
}

function paymentRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'payment-1',
    supplierId: SUPPLIER_A,
    paymentDate: new Date('2026-09-12'),
    amount: 500_000,
    currency: 'XOF',
    status: 'VALIDATED',
    allocations: [{ invoiceId: INVOICE_A, amount: 500_000 }],
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// A. GET suppliers — liste
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/suppliers', () => {
  it('liste les fournisseurs du tenant demandé (cas nominal)', async () => {
    supplierFindMany.mockResolvedValue([supplierRow()]);

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/suppliers`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].balance).toBe(150_000);
    expect(supplierFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_A }) })
    );
  });
});

// ---------------------------------------------------------------------------
// B. POST suppliers — création
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/suppliers', () => {
  const body = { name: 'Ciments du Futa', kind: 'MATERIALS', contactPhone: '622000000', contactEmail: 'c@x.gn' };

  it('crée le fournisseur (cas nominal, 201)', async () => {
    createSupplierTx.mockResolvedValue(supplierRecord());
    thirdPartyAccountFindUniqueOrThrow.mockResolvedValue({ balance: 0, currency: 'XOF' });

    const response = await request(app).post(`/api/tenants/${TENANT_A}/finance/suppliers`).send(body);

    expect(response.status).toBe(201);
    expect(response.body.data.id).toBe(SUPPLIER_A);
    expect(response.body.data.balance).toBe(0);
    expect(createSupplierTx).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_A,
      expect.objectContaining({ name: 'Ciments du Futa', phone: '622000000', email: 'c@x.gn' })
    );
  });

  it('rejette en 400 un corps sans nom ni nature', async () => {
    const response = await request(app).post(`/api/tenants/${TENANT_A}/finance/suppliers`).send({});

    expect(response.status).toBe(400);
    expect(createSupplierTx).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// C. GET suppliers/balance — et l'ordre de déclaration des routes
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/suppliers/balance', () => {
  it('renvoie la balance fournisseurs (cas nominal)', async () => {
    getSuppliersBalance.mockResolvedValue({
      lines: [
        {
          accountId: ACCOUNT_A,
          supplierId: SUPPLIER_A,
          label: 'Ciments du Futa',
          totalBilled: 500_000,
          totalSettled: 0,
          balance: 500_000,
          currency: 'XOF'
        }
      ],
      totalBalance: 500_000,
      currency: 'XOF'
    });

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/suppliers/balance`);

    expect(response.status).toBe(200);
    expect(response.body.data.totalBalance).toBe(500_000);
    expect(getSuppliersBalance).toHaveBeenCalledWith(TENANT_A, expect.objectContaining({ range: undefined }));
  });

  it("n'est jamais capturée par la route paramétrée suppliers/:supplierId (l'ordre de déclaration compte)", async () => {
    getSuppliersBalance.mockResolvedValue({ lines: [], totalBalance: 0, currency: 'XOF' });
    // Si `balance` était pris pour un `supplierId`, ce mock répondrait 200
    // avec un faux fournisseur nommé "balance" plutôt que la balance.
    supplierFindFirst.mockResolvedValue(supplierRow({ id: 'balance', name: 'Faux fournisseur balance' }));

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/suppliers/balance`);

    expect(response.status).toBe(200);
    expect(response.body.data.totalBalance).toBe(0);
    expect(getSuppliersBalance).toHaveBeenCalledTimes(1);
    expect(supplierFindFirst).not.toHaveBeenCalled();
  });

  it('rejette en 400 un intervalle de dates invalide', async () => {
    const response = await request(app).get(
      `/api/tenants/${TENANT_A}/finance/suppliers/balance?periodStart=2026-09-30&periodEnd=2026-09-01`
    );

    expect(response.status).toBe(400);
    expect(getSuppliersBalance).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// D. GET suppliers/:supplierId — détail
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/suppliers/:supplierId', () => {
  it('renvoie le détail du fournisseur (cas nominal)', async () => {
    supplierFindFirst.mockResolvedValue(supplierRow());

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/suppliers/${SUPPLIER_A}`);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(SUPPLIER_A);
    expect(response.body.data.currency).toBe('XOF');
  });

  it('renvoie 404 pour un fournisseur inexistant', async () => {
    supplierFindFirst.mockResolvedValue(null);

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/suppliers/${SUPPLIER_A}`);

    expect(response.status).toBe(404);
  });

  it("isole les tenants : le tenant B n'accède pas à un fournisseur du tenant A", async () => {
    supplierFindFirst.mockImplementation(async ({ where }: any) =>
      where.tenantId === TENANT_A && where.id === SUPPLIER_A ? supplierRow() : null
    );

    const ownResponse = await request(app).get(`/api/tenants/${TENANT_A}/finance/suppliers/${SUPPLIER_A}`);
    const crossTenantResponse = await request(app).get(`/api/tenants/${TENANT_B}/finance/suppliers/${SUPPLIER_A}`);

    expect(ownResponse.status).toBe(200);
    expect(crossTenantResponse.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// E. GET suppliers/:supplierId/invoices — liste
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/suppliers/:supplierId/invoices', () => {
  it('liste les factures du fournisseur (cas nominal)', async () => {
    supplierFindFirst.mockResolvedValue({ id: SUPPLIER_A });
    supplierInvoiceFindMany.mockResolvedValue([invoiceRow()]);

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/suppliers/${SUPPLIER_A}/invoices`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].amount).toBe(500_000);
  });

  it('renvoie 404 quand le fournisseur est inexistant', async () => {
    supplierFindFirst.mockResolvedValue(null);

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/suppliers/${SUPPLIER_A}/invoices`);

    expect(response.status).toBe(404);
    expect(supplierInvoiceFindMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// F. POST suppliers/:supplierId/invoices — saisie en brouillon
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/suppliers/:supplierId/invoices', () => {
  it('saisit la facture en brouillon (cas nominal, 201), avec une ligne par défaut si aucune fournie', async () => {
    createSupplierInvoiceTx.mockResolvedValue(invoiceRecord());

    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/suppliers/${SUPPLIER_A}/invoices`)
      .send({ invoiceDate: '2026-09-10', reference: 'FAC-2026-001', amount: 500_000 });

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe('DRAFT');
    expect(createSupplierInvoiceTx).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_A,
      expect.objectContaining({
        supplierId: SUPPLIER_A,
        lines: [{ label: 'FAC-2026-001', amount: 500_000 }],
        allocations: []
      })
    );
  });

  it('combine le siteId de la requête à chaque imputation transmise au domaine', async () => {
    createSupplierInvoiceTx.mockResolvedValue(invoiceRecord());

    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/suppliers/${SUPPLIER_A}/invoices`)
      .send({
        invoiceDate: '2026-09-10',
        reference: 'FAC-2026-002',
        amount: 500_000,
        siteId: SITE_A,
        allocations: [{ costCategoryId: CATEGORY_A, amount: 500_000 }]
      });

    expect(response.status).toBe(201);
    expect(createSupplierInvoiceTx).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_A,
      expect.objectContaining({
        allocations: [{ siteId: SITE_A, costCategoryId: CATEGORY_A, amount: 500_000 }]
      })
    );
  });

  it('rejette en 400 un corps sans référence ni montant', async () => {
    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/suppliers/${SUPPLIER_A}/invoices`)
      .send({ invoiceDate: '2026-09-10' });

    expect(response.status).toBe(400);
    expect(createSupplierInvoiceTx).not.toHaveBeenCalled();
  });

  it('rejette en 400 une imputation fournie sans chantier (siteId)', async () => {
    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/suppliers/${SUPPLIER_A}/invoices`)
      .send({
        invoiceDate: '2026-09-10',
        reference: 'FAC-2026-003',
        amount: 500_000,
        allocations: [{ costCategoryId: CATEGORY_A, amount: 500_000 }]
      });

    expect(response.status).toBe(400);
    expect(createSupplierInvoiceTx).not.toHaveBeenCalled();
  });

  it('renvoie 404 quand le fournisseur est inexistant (relayé depuis le domaine)', async () => {
    createSupplierInvoiceTx.mockRejectedValue(notFound('Fournisseur introuvable'));

    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/suppliers/${SUPPLIER_A}/invoices`)
      .send({ invoiceDate: '2026-09-10', reference: 'FAC-2026-004', amount: 500_000 });

    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// G. GET supplier-invoices/:invoiceId — détail
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/supplier-invoices/:invoiceId', () => {
  it('renvoie le détail de la facture (cas nominal)', async () => {
    supplierInvoiceFindFirst.mockResolvedValue(invoiceRow());

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/supplier-invoices/${INVOICE_A}`);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(INVOICE_A);
  });

  it('renvoie 404 pour une facture inexistante', async () => {
    supplierInvoiceFindFirst.mockResolvedValue(null);

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/supplier-invoices/${INVOICE_A}`);

    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// H. POST supplier-invoices/:invoiceId/validate
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/supplier-invoices/:invoiceId/validate', () => {
  it('valide la facture brouillon (cas nominal, 200)', async () => {
    validateSupplierInvoiceTx.mockResolvedValue(invoiceRecord({ status: 'VALIDATED', validatedByUserId: 'user-1' }));

    const response = await request(app).post(
      `/api/tenants/${TENANT_A}/finance/supplier-invoices/${INVOICE_A}/validate`
    );

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('VALIDATED');
    expect(validateSupplierInvoiceTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, INVOICE_A, 'user-1');
  });

  it('renvoie 409 (conflit), pas 400, pour une seconde validation de la même facture', async () => {
    validateSupplierInvoiceTx.mockRejectedValue(
      conflict('Cette facture a deja ete validee — une piece validee ne se modifie plus')
    );

    const response = await request(app).post(
      `/api/tenants/${TENANT_A}/finance/supplier-invoices/${INVOICE_A}/validate`
    );

    expect(response.status).toBe(409);
  });

  it('renvoie 400 quand la somme des imputations ne correspond pas au montant de la facture', async () => {
    validateSupplierInvoiceTx.mockRejectedValue(badRequest('La somme des imputations ne correspond pas'));

    const response = await request(app).post(
      `/api/tenants/${TENANT_A}/finance/supplier-invoices/${INVOICE_A}/validate`
    );

    expect(response.status).toBe(400);
  });

  it('renvoie 404 pour une facture inexistante', async () => {
    validateSupplierInvoiceTx.mockRejectedValue(notFound('Facture fournisseur introuvable'));

    const response = await request(app).post(
      `/api/tenants/${TENANT_A}/finance/supplier-invoices/${INVOICE_A}/validate`
    );

    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// I. POST supplier-invoices/:invoiceId/void
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/supplier-invoices/:invoiceId/void', () => {
  it('annule la facture validée par une pièce liée (cas nominal, 201)', async () => {
    voidDocumentTx.mockResolvedValue({ voidDocumentId: 'void-1', reversingEntryId: 'entry-2' });
    voidDocumentFindUniqueOrThrow.mockResolvedValue({
      id: 'void-1',
      documentType: 'SUPPLIER_INVOICE',
      documentId: INVOICE_A,
      reason: 'Facture erronée',
      voidedByUserId: 'user-1',
      voidedAt: new Date('2026-09-18')
    });

    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/supplier-invoices/${INVOICE_A}/void`)
      .send({ reason: 'Facture erronée' });

    expect(response.status).toBe(201);
    expect(response.body.data.id).toBe('void-1');
    expect(response.body.data.reason).toBe('Facture erronée');
    expect(voidDocumentTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId: TENANT_A,
        documentType: 'SUPPLIER_INVOICE',
        documentId: INVOICE_A,
        reason: 'Facture erronée',
        voidedByUserId: 'user-1'
      })
    );
  });

  it('exige un motif : rejette en 400 un corps sans `reason`', async () => {
    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/supplier-invoices/${INVOICE_A}/void`)
      .send({});

    expect(response.status).toBe(400);
    expect(voidDocumentTx).not.toHaveBeenCalled();
  });

  it('renvoie 409 pour une facture déjà annulée', async () => {
    voidDocumentTx.mockRejectedValue(
      conflict("Cette piece a deja ete annulee : ce lot ne modelise pas l'annulation d'une annulation")
    );

    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/supplier-invoices/${INVOICE_A}/void`)
      .send({ reason: 'Nouvelle tentative' });

    expect(response.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// J. POST suppliers/:supplierId/payments — règlement
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/suppliers/:supplierId/payments', () => {
  it('enregistre le règlement (cas nominal, 201)', async () => {
    createSupplierPaymentTx.mockResolvedValue(paymentRecord());
    supplierPaymentFindUniqueOrThrow.mockResolvedValue({ method: 'Virement', validatedAt: new Date('2026-09-12') });

    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/suppliers/${SUPPLIER_A}/payments`)
      .send({
        paymentDate: '2026-09-12',
        amount: 500_000,
        method: 'Virement',
        allocations: [{ invoiceId: INVOICE_A, amount: 500_000 }]
      });

    expect(response.status).toBe(201);
    expect(response.body.data.method).toBe('Virement');
    expect(response.body.data.allocations).toEqual([{ invoiceId: INVOICE_A, amount: 500_000 }]);
    expect(createSupplierPaymentTx).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_A,
      expect.objectContaining({ supplierId: SUPPLIER_A, amount: 500_000, createdByUserId: 'user-1' })
    );
  });

  it('rejette en 400 un corps sans mode de règlement', async () => {
    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/suppliers/${SUPPLIER_A}/payments`)
      .send({ paymentDate: '2026-09-12', amount: 500_000 });

    expect(response.status).toBe(400);
    expect(createSupplierPaymentTx).not.toHaveBeenCalled();
  });

  it("renvoie 409 quand la facture ciblée n'est pas validée", async () => {
    createSupplierPaymentTx.mockRejectedValue(
      conflict("La facture FAC-2026-001 n'est pas validee — un reglement ne peut pas s'y affecter")
    );

    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/suppliers/${SUPPLIER_A}/payments`)
      .send({
        paymentDate: '2026-09-12',
        amount: 500_000,
        method: 'Virement',
        allocations: [{ invoiceId: INVOICE_A, amount: 500_000 }]
      });

    expect(response.status).toBe(409);
  });

  it('renvoie 404 quand le fournisseur est inexistant', async () => {
    createSupplierPaymentTx.mockRejectedValue(notFound('Fournisseur introuvable'));

    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/suppliers/${SUPPLIER_A}/payments`)
      .send({ paymentDate: '2026-09-12', amount: 500_000, method: 'Virement' });

    expect(response.status).toBe(404);
  });
});
