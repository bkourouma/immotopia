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
const validateSupplierPaymentTx = jest.fn();
const validateSupplierInvoiceTx = jest.fn();
const getSuppliersBalance = jest.fn();

jest.mock('../../src/lib/finance/suppliers', () => ({
  createSupplierTx: (...args: any[]) => createSupplierTx(...args),
  createSupplierInvoiceTx: (...args: any[]) => createSupplierInvoiceTx(...args),
  createSupplierPaymentTx: (...args: any[]) => createSupplierPaymentTx(...args),
  validateSupplierInvoiceTx: (...args: any[]) => validateSupplierInvoiceTx(...args),
  validateSupplierPaymentTx: (...args: any[]) => validateSupplierPaymentTx(...args),
  getSuppliersBalance: (...args: any[]) => getSuppliersBalance(...args)
}));

const voidDocumentTx = jest.fn();

// Droits d'abonnement : par défaut indisponibles (comportement inchangé).
const getEntitlements = jest.fn();
jest.mock('../../src/services/subscription-v2-service', () => ({
  getEntitlements: (...args: any[]) => getEntitlements(...args)
}));

jest.mock('../../src/lib/finance/accounting', () => ({
  voidDocumentTx: (...args: any[]) => voidDocumentTx(...args)
}));

const supplierFindMany = jest.fn();
const supplierFindFirst = jest.fn();
const supplierInvoiceFindMany = jest.fn();
// La liste des factures resout le NOM des chantiers vises, en une requete pour
// toute la liste : sans cette doublure, l'appel partait dans le vide et le
// gestionnaire repondait 500.
const constructionSiteFindMany = jest.fn();
const supplierInvoiceFindFirst = jest.fn();
// Le detail d'une facture rend aussi ses LIGNES et ses IMPUTATIONS depuis le
// 20 septembre 2026 : deux lectures de plus, qu'il faut doubler ici.
const supplierInvoiceLineFindMany = jest.fn();
const costAllocationFindMany = jest.fn();
const thirdPartyAccountFindUniqueOrThrow = jest.fn();
const supplierPaymentFindUniqueOrThrow = jest.fn();
const voidDocumentFindUniqueOrThrow = jest.fn();
// Le reste dû d'une facture VALIDÉE (`resolveRemainingPayableByInvoice`,
// ajout du 20 septembre 2026) lit les règlements qui l'affectent, les
// annulations de ces règlements, et les retenues de garantie encore
// détenues. Trois doublures de plus, sans quoi la liste des factures d'un
// fournisseur qui en compte une VALIDÉE répondrait 500.
const supplierPaymentAllocationFindMany = jest.fn();
const retentionGuaranteeFindMany = jest.fn();
const voidDocumentFindMany = jest.fn();

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
    supplierInvoiceLine: {
      findMany: (...args: any[]) => supplierInvoiceLineFindMany(...args)
    },
    costAllocation: {
      findMany: (...args: any[]) => costAllocationFindMany(...args)
    },
    constructionSite: {
      findMany: (...args: any[]) => constructionSiteFindMany(...args)
    },
    supplierPayment: {
      findUniqueOrThrow: (...args: any[]) => supplierPaymentFindUniqueOrThrow(...args)
    },
    supplierPaymentAllocation: {
      findMany: (...args: any[]) => supplierPaymentAllocationFindMany(...args)
    },
    retentionGuarantee: {
      findMany: (...args: any[]) => retentionGuaranteeFindMany(...args)
    },
    thirdPartyAccount: {
      findUniqueOrThrow: (...args: any[]) => thirdPartyAccountFindUniqueOrThrow(...args)
    },
    voidDocument: {
      findUniqueOrThrow: (...args: any[]) => voidDocumentFindUniqueOrThrow(...args),
      findMany: (...args: any[]) => voidDocumentFindMany(...args)
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
const PAYMENT_A = '44444444-4444-4444-8444-444444444444';
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
    // Un reglement nait BROUILLON depuis le 19 septembre 2026 : il se valide
    // par un appel distinct, comme la facture et la piece de caisse.
    status: 'DRAFT',
    allocations: [{ invoiceId: INVOICE_A, amount: 500_000 }],
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Par defaut, aucun chantier a nommer : chaque cas qui en attend un le dit
  // lui-meme. `clearAllMocks` remet la doublure a `undefined`, ce qui ferait
  // echouer le `.map` du gestionnaire.
  constructionSiteFindMany.mockResolvedValue([]);
  // Par defaut, aucun reglement ni retenue a soustraire du reste du : chaque
  // cas qui en attend un le dit lui-meme (`resolveRemainingPayableByInvoice`).
  supplierPaymentAllocationFindMany.mockResolvedValue([]);
  retentionGuaranteeFindMany.mockResolvedValue([]);
  voidDocumentFindMany.mockResolvedValue([]);
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

  /**
   * Le nom du contact, transmis et rendu. Le schéma de validation ne le
   * déclarait pas jusqu'au 20 septembre 2026 : Zod l'écartait en silence, et
   * la saisie de l'écran — qui l'a toujours proposée — se perdait sans le
   * moindre avertissement. La colonne, elle, existait déjà en base.
   */
  it('transmet le nom du contact, et le rend dans la réponse', async () => {
    createSupplierTx.mockResolvedValue(supplierRecord({ contactName: 'Konan Yao' }));
    thirdPartyAccountFindUniqueOrThrow.mockResolvedValue({ balance: 0, currency: 'XOF' });

    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/suppliers`)
      .send({ ...body, contactName: 'Konan Yao' });

    expect(response.status).toBe(201);
    expect(createSupplierTx).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_A,
      expect.objectContaining({ contactName: 'Konan Yao' })
    );
    expect(response.body.data.contactName).toBe('Konan Yao');
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
    // Une facture DRAFT n'a constaté aucune dette : son reste dû n'a pas de
    // sens (`resolveRemainingPayableByInvoice`), et aucune requête de plus
    // n'a été faite pour le deviner.
    expect(response.body.data[0].remainingPayable).toBeNull();
    expect(supplierPaymentAllocationFindMany).not.toHaveBeenCalled();
  });

  it('renvoie 404 quand le fournisseur est inexistant', async () => {
    supplierFindFirst.mockResolvedValue(null);

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/suppliers/${SUPPLIER_A}/invoices`);

    expect(response.status).toBe(404);
    expect(supplierInvoiceFindMany).not.toHaveBeenCalled();
  });

  // Recette du 20 septembre 2026 : `FRS-QA-001`, réglée depuis mars, restait
  // proposée au règlement — un second règlement de 28 000 000 avait été
  // saisi dessus en doublon. `remainingPayable` doit dire 0 pour que l'écran
  // cesse de la proposer.
  it('rend un reste dû nul pour une facture VALIDÉE entièrement réglée par un règlement validé', async () => {
    supplierFindFirst.mockResolvedValue({ id: SUPPLIER_A });
    supplierInvoiceFindMany.mockResolvedValue([invoiceRow({ status: 'VALIDATED', amount: 500_000 })]);
    supplierPaymentAllocationFindMany.mockResolvedValue([
      { invoiceId: INVOICE_A, amount: 500_000, paymentId: 'payment-1' }
    ]);

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/suppliers/${SUPPLIER_A}/invoices`);

    expect(response.status).toBe(200);
    expect(response.body.data[0].remainingPayable).toBe(0);
  });

  // Nuance explicitement demandée en recette : une facture PARTIELLEMENT
  // réglée doit rester proposée, puisqu'il reste à payer.
  it('rend le reste dû exact pour une facture VALIDÉE partiellement réglée', async () => {
    supplierFindFirst.mockResolvedValue({ id: SUPPLIER_A });
    supplierInvoiceFindMany.mockResolvedValue([invoiceRow({ status: 'VALIDATED', amount: 500_000 })]);
    supplierPaymentAllocationFindMany.mockResolvedValue([
      { invoiceId: INVOICE_A, amount: 200_000, paymentId: 'payment-1' }
    ]);

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/suppliers/${SUPPLIER_A}/invoices`);

    expect(response.status).toBe(200);
    expect(response.body.data[0].remainingPayable).toBe(300_000);
  });

  it('ignore les affectations dont le règlement a été annulé : la facture reste due en entier', async () => {
    supplierFindFirst.mockResolvedValue({ id: SUPPLIER_A });
    supplierInvoiceFindMany.mockResolvedValue([invoiceRow({ status: 'VALIDATED', amount: 500_000 })]);
    supplierPaymentAllocationFindMany.mockResolvedValue([
      { invoiceId: INVOICE_A, amount: 500_000, paymentId: 'payment-annule' }
    ]);
    voidDocumentFindMany.mockResolvedValue([{ documentId: 'payment-annule' }]);

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/suppliers/${SUPPLIER_A}/invoices`);

    expect(response.status).toBe(200);
    expect(response.body.data[0].remainingPayable).toBe(500_000);
  });

  // Nuance retenue de garantie, explicitement signalée en recette : elle
  // peut solder le reste dû sans aucun versement.
  it('une retenue de garantie DÉTENUE solde le reste dû sans aucun règlement', async () => {
    supplierFindFirst.mockResolvedValue({ id: SUPPLIER_A });
    supplierInvoiceFindMany.mockResolvedValue([invoiceRow({ status: 'VALIDATED', amount: 500_000 })]);
    retentionGuaranteeFindMany.mockResolvedValue([{ sourceId: INVOICE_A, amount: 500_000 }]);

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/suppliers/${SUPPLIER_A}/invoices`);

    expect(response.status).toBe(200);
    expect(response.body.data[0].remainingPayable).toBe(0);
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

  describe('exigence de chantier selon le pack (BUG-079)', () => {
    const post = () =>
      request(app)
        .post(`/api/tenants/${TENANT_A}/finance/suppliers/${SUPPLIER_A}/invoices`)
        .send({ invoiceDate: '2026-09-30', reference: 'FQ-1', amount: 236_000 });
    const acces = (promoteur: boolean, enforcement = 'enforce') => ({
      enforcement,
      readOnly: false,
      moduleAccess: {
        MODULE_PROMOTER: promoteur ? 'FULL' : 'NONE',
        MODULE_AGENCY: 'FULL',
        MODULE_SYNDIC: 'FULL',
        MODULE_PATRIMOINE: 'FULL'
      }
    });

    it.each(['AGENCE', 'SYNDIC', 'PATRIMOINE'])('pack %s (sans CONSTRUCTION) : chantier non exigé', async () => {
      createSupplierInvoiceTx.mockResolvedValue(invoiceRecord());
      getEntitlements.mockResolvedValue(acces(false));
      expect((await post()).status).toBe(201);
      expect(createSupplierInvoiceTx).toHaveBeenLastCalledWith(
        expect.anything(),
        TENANT_A,
        expect.objectContaining({ siteRequired: false })
      );
    });

    it('pack PROMOTEUR : chantier exigé', async () => {
      createSupplierInvoiceTx.mockResolvedValue(invoiceRecord());
      getEntitlements.mockResolvedValue(acces(true));
      await post();
      expect(createSupplierInvoiceTx).toHaveBeenLastCalledWith(
        expect.anything(),
        TENANT_A,
        expect.objectContaining({ siteRequired: true })
      );
    });

    it('mode warn ou droits indisponibles : comportement inchangé (chantier exigé)', async () => {
      createSupplierInvoiceTx.mockResolvedValue(invoiceRecord());
      getEntitlements.mockResolvedValue(acces(false, 'warn'));
      await post();
      expect(createSupplierInvoiceTx).toHaveBeenLastCalledWith(
        expect.anything(),
        TENANT_A,
        expect.objectContaining({ siteRequired: true })
      );
      getEntitlements.mockRejectedValue(new Error('indisponible'));
      await post();
      expect(createSupplierInvoiceTx).toHaveBeenLastCalledWith(
        expect.anything(),
        TENANT_A,
        expect.objectContaining({ siteRequired: true })
      );
    });
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

  // -------------------------------------------------------------------------
  // Quantite et prix unitaire sur une ligne — additifs et facultatifs
  // -------------------------------------------------------------------------

  it('transmet au domaine la quantite et le prix unitaire d\u2019une ligne, a cote de son montant', async () => {
    createSupplierInvoiceTx.mockResolvedValue(invoiceRecord());

    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/suppliers/${SUPPLIER_A}/invoices`)
      .send({
        invoiceDate: '2026-09-10',
        reference: 'FAC-2026-010',
        lines: [{ label: 'Ciment CPJ 45', amount: 237_500, quantity: 2.5, unitPrice: 95_000 }]
      });

    expect(response.status).toBe(201);
    expect(createSupplierInvoiceTx).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_A,
      expect.objectContaining({
        lines: [{ label: 'Ciment CPJ 45', amount: 237_500, quantity: 2.5, unitPrice: 95_000 }]
      })
    );
  });

  it('accepte une ligne sans quantite ni prix unitaire (prestation, forfait)', async () => {
    createSupplierInvoiceTx.mockResolvedValue(invoiceRecord());

    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/suppliers/${SUPPLIER_A}/invoices`)
      .send({
        invoiceDate: '2026-09-10',
        reference: 'FAC-2026-011',
        lines: [{ label: 'Forfait de depannage', amount: 850_000 }]
      });

    expect(response.status).toBe(201);
    const [, , params] = createSupplierInvoiceTx.mock.calls[0];
    expect(params.lines[0].quantity).toBeUndefined();
    expect(params.lines[0].unitPrice).toBeUndefined();
  });

  it('accepte un null explicite sur quantite et prix unitaire (champ laisse vide par l\u2019ecran)', async () => {
    createSupplierInvoiceTx.mockResolvedValue(invoiceRecord());

    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/suppliers/${SUPPLIER_A}/invoices`)
      .send({
        invoiceDate: '2026-09-10',
        reference: 'FAC-2026-012',
        lines: [{ label: 'Forfait de depannage', amount: 850_000, quantity: null, unitPrice: null }]
      });

    expect(response.status).toBe(201);
  });

  it('rejette en 400 une quantite negative', async () => {
    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/suppliers/${SUPPLIER_A}/invoices`)
      .send({
        invoiceDate: '2026-09-10',
        reference: 'FAC-2026-013',
        lines: [{ label: 'Ciment CPJ 45', amount: 237_500, quantity: -2, unitPrice: 95_000 }]
      });

    expect(response.status).toBe(400);
    expect(createSupplierInvoiceTx).not.toHaveBeenCalled();
  });

  it('ne recalcule PAS le montant a partir de quantite x prix unitaire', async () => {
    createSupplierInvoiceTx.mockResolvedValue(invoiceRecord());

    // Le montant envoye ne vaut pas le produit : le serveur le conserve tel
    // quel, parce que le montant est la donnee de reference comptable.
    await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/suppliers/${SUPPLIER_A}/invoices`)
      .send({
        invoiceDate: '2026-09-10',
        reference: 'FAC-2026-014',
        lines: [{ label: 'Ciment CPJ 45', amount: 240_000, quantity: 2.5, unitPrice: 95_000 }]
      });

    const [, , params] = createSupplierInvoiceTx.mock.calls[0];
    expect(params.lines[0].amount).toBe(240_000);
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

  /**
   * Les lignes et les imputations, ajoutees au detail le 20 septembre 2026.
   *
   * Sans elles, aucun ecran ne pouvait relire ce qui COMPOSE une facture :
   * dupliquer une piece n'en aurait recopie que l'en-tete. Ce test verifie les
   * trois choses qui comptent : elles sont bien rendues, la quantite absente
   * reste nulle (jamais un « 0 » inventé, qui se lirait comme une saisie), et
   * les imputations sont lues filtrees par tenant ET par piece source.
   */
  it('rend les lignes et les imputations de la facture, filtrées par agence', async () => {
    supplierInvoiceFindFirst.mockResolvedValue(invoiceRow());
    supplierInvoiceLineFindMany.mockResolvedValue([
      { id: 'line-1', invoiceId: INVOICE_A, label: 'Ciment CPJ 45', amount: 300_000, quantity: 4, unitPrice: 75_000 },
      { id: 'line-2', invoiceId: INVOICE_A, label: 'Forfait de pose', amount: 200_000, quantity: null, unitPrice: null }
    ]);
    costAllocationFindMany.mockResolvedValue([
      {
        id: 'alloc-1',
        tenantId: TENANT_A,
        siteId: SITE_A,
        costCategoryId: CATEGORY_A,
        sourceType: 'SUPPLIER_INVOICE',
        sourceId: INVOICE_A,
        amount: 500_000
      }
    ]);

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/supplier-invoices/${INVOICE_A}`);

    expect(response.status).toBe(200);
    expect(response.body.data.lines).toEqual([
      { id: 'line-1', label: 'Ciment CPJ 45', amount: 300_000, quantity: 4, unitPrice: 75_000 },
      { id: 'line-2', label: 'Forfait de pose', amount: 200_000, quantity: null, unitPrice: null }
    ]);
    expect(response.body.data.allocations).toEqual([
      { id: 'alloc-1', siteId: SITE_A, costCategoryId: CATEGORY_A, amount: 500_000 }
    ]);

    // Les lignes tiennent leur isolation de la facture, dont l'appartenance a
    // l'agence vient d'etre verifiee ; les imputations, elles, portent un
    // `tenantId` et sont filtrees dessus explicitement.
    expect(supplierInvoiceLineFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { invoiceId: INVOICE_A } })
    );
    expect(costAllocationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_A, sourceType: 'SUPPLIER_INVOICE', sourceId: INVOICE_A }
      })
    );
  });

  /**
   * Une facture ANNULEE garde ses lignes et ses imputations : on annule
   * justement pour ressaisir, et la duplication doit rester possible.
   */
  it('rend aussi les lignes et imputations d’une facture annulée', async () => {
    supplierInvoiceFindFirst.mockResolvedValue(invoiceRow({ status: 'VOIDED' }));
    supplierInvoiceLineFindMany.mockResolvedValue([
      { id: 'line-1', invoiceId: INVOICE_A, label: 'Ciment CPJ 45', amount: 500_000, quantity: null, unitPrice: null }
    ]);
    costAllocationFindMany.mockResolvedValue([
      {
        id: 'alloc-1',
        tenantId: TENANT_A,
        siteId: SITE_A,
        costCategoryId: CATEGORY_A,
        sourceType: 'SUPPLIER_INVOICE',
        sourceId: INVOICE_A,
        amount: 500_000,
        voidedAt: new Date('2026-09-15')
      }
    ]);

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/supplier-invoices/${INVOICE_A}`);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('VOIDED');
    expect(response.body.data.lines).toHaveLength(1);
    expect(response.body.data.allocations).toHaveLength(1);
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
// J bis. POST supplier-payments/:paymentId/validate et /void
//
// Deux routes ajoutees le 19 septembre 2026. La validation figurait au contrat
// depuis le gel du lot sans avoir jamais ete ecrite : l'ecran l'appelait et
// recevait un 404, et la file de validation — qui filtre sur l'absence de
// validation — ne montrait donc jamais aucun reglement. L'annulation, elle,
// n'existait que pour la facture : une erreur sur un reglement valide etait
// definitive.
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/supplier-payments/:paymentId/validate', () => {
  it('valide le règlement et le rend validé (200)', async () => {
    validateSupplierPaymentTx.mockResolvedValue(paymentRecord({ status: 'VALIDATED' }));
    supplierFindFirst.mockResolvedValue({ name: 'Ciments du Fouta' });
    supplierInvoiceFindMany.mockResolvedValue([{ id: INVOICE_A, reference: 'FC-2026-0141' }]);

    const response = await request(app).post(
      `/api/tenants/${TENANT_A}/finance/supplier-payments/${PAYMENT_A}/validate`
    );

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('VALIDATED');
    expect(validateSupplierPaymentTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, PAYMENT_A, 'user-1');
  });

  it('renvoie 409 pour un règlement déjà validé (immutabilité, P-6)', async () => {
    validateSupplierPaymentTx.mockRejectedValue(conflict('Ce reglement est deja valide'));

    const response = await request(app).post(
      `/api/tenants/${TENANT_A}/finance/supplier-payments/${PAYMENT_A}/validate`
    );

    expect(response.status).toBe(409);
  });
});

describe('POST /tenants/:tenantId/finance/supplier-payments/:paymentId/void', () => {
  it("crée la pièce d'annulation (201)", async () => {
    voidDocumentTx.mockResolvedValue({ voidDocumentId: 'void-2', reversingEntryId: 'entry-2' });
    voidDocumentFindUniqueOrThrow.mockResolvedValue({
      id: 'void-2',
      documentType: 'SUPPLIER_PAYMENT',
      documentId: PAYMENT_A,
      reason: 'Virement rejeté par la banque',
      voidedByUserId: 'user-1',
      voidedAt: new Date('2026-09-19')
    });

    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/supplier-payments/${PAYMENT_A}/void`)
      .send({ reason: 'Virement rejeté par la banque' });

    expect(response.status).toBe(201);
    expect(response.body.data.documentType).toBe('SUPPLIER_PAYMENT');
    expect(voidDocumentTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ documentType: 'SUPPLIER_PAYMENT', documentId: PAYMENT_A })
    );
  });

  it('exige un motif : rejette en 400 un corps sans `reason`', async () => {
    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/supplier-payments/${PAYMENT_A}/void`)
      .send({});

    expect(response.status).toBe(400);
    expect(voidDocumentTx).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// J. POST suppliers/:supplierId/payments — règlement
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/suppliers/:supplierId/payments', () => {
  it('enregistre le règlement en brouillon (cas nominal, 201)', async () => {
    createSupplierPaymentTx.mockResolvedValue(paymentRecord());
    supplierFindFirst.mockResolvedValue({ name: 'Ciments du Fouta' });
    supplierInvoiceFindMany.mockResolvedValue([{ id: INVOICE_A, reference: 'FC-2026-0141' }]);

    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/suppliers/${SUPPLIER_A}/payments`)
      .send({
        paymentDate: '2026-09-12',
        amount: 500_000,
        method: 'Virement',
        allocations: [{ invoiceId: INVOICE_A, amount: 500_000 }]
      });

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe('DRAFT');
    // Le fournisseur et la facture sont NOMMES, jamais reduits a leur
    // identifiant : c'est la lecon du compte rendu de campagne du lot 1, et
    // ces deux champs manquaient a la reponse jusqu'au 19 septembre 2026.
    expect(response.body.data.supplierLabel).toBe('Ciments du Fouta');
    expect(response.body.data.allocations).toEqual([
      { invoiceId: INVOICE_A, invoiceReference: 'FC-2026-0141', amount: 500_000 }
    ]);
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
