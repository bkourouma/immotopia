import express from 'express';
import request from 'supertest';

/**
 * Tests des huit points d'entrée agence « chantiers » du module financier —
 * lot 2, dernière vague.
 *
 * Modèle de mock : `__tests__/api/finance.test.ts` (lot 1). Les middlewares
 * d'authentification, de tenant et de droits sont remplacés par des
 * passe-plats ; le domaine (`lib/finance/sites.ts`, `cash.ts`,
 * `validation-queue.ts`) est simulé pour vérifier que le contrôleur transmet
 * bien l'isolation et les erreurs typées plutôt que de les recréer.
 *
 * `requireAccountsRead` et `requireDocumentsValidate` enregistrent leur appel
 * dans `guardCalls` : simples passe-plats qui laissent toujours passer la
 * requête (comme au lot 1), ils ne peuvent donc pas, par leur seul
 * comportement, prouver que la bonne garde est posée sur la bonne route.
 * `guardCalls` sert cette preuve — notamment pour la file de validation, qui
 * doit poser `requireDocumentsValidate` et jamais `requireAccountsRead`.
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
  requireSitesManage: (_req: any, _res: any, next: any) => {
    guardCalls.push('sitesManage');
    next();
  },
  requireSettingsManage: (_req: any, _res: any, next: any) => {
    guardCalls.push('settingsManage');
    next();
  }
}));

const createConstructionSite = jest.fn();
const listConstructionSites = jest.fn();
const getSiteDetail = jest.fn();
const listCostCategories = jest.fn();
const createCostCategory = jest.fn();

jest.mock('../../src/lib/finance/sites', () => ({
  createConstructionSite: (...args: any[]) => createConstructionSite(...args),
  listConstructionSites: (...args: any[]) => listConstructionSites(...args),
  getSiteDetail: (...args: any[]) => getSiteDetail(...args),
  listCostCategories: (...args: any[]) => listCostCategories(...args),
  createCostCategory: (...args: any[]) => createCostCategory(...args)
}));

const createCashVoucherTx = jest.fn();
const validateCashVoucherTx = jest.fn();

function formatCashVoucherNumber(voucherYear: number, voucherNumber: number): string {
  return `${voucherYear}-${String(voucherNumber).padStart(4, '0')}`;
}

jest.mock('../../src/lib/finance/cash', () => ({
  createCashVoucherTx: (...args: any[]) => createCashVoucherTx(...args),
  validateCashVoucherTx: (...args: any[]) => validateCashVoucherTx(...args),
  formatCashVoucherNumber: (voucherYear: number, voucherNumber: number) =>
    formatCashVoucherNumber(voucherYear, voucherNumber)
}));

const getValidationQueue = jest.fn();

jest.mock('../../src/lib/finance/validation-queue', () => ({
  getValidationQueue: (...args: any[]) => getValidationQueue(...args)
}));

const cashVoucherFindFirst = jest.fn();
const transactionMock = jest.fn(async (callback: any) => callback({}));

jest.mock('../../src/utils/database', () => ({
  prisma: {
    $transaction: (callback: any) => transactionMock(callback),
    cashVoucher: {
      findFirst: (...args: any[]) => cashVoucherFindFirst(...args)
    }
  }
}));

import { errorHandler, ConflictError, NotFoundError } from '../../src/middleware/error-middleware';
import financeSitesRoutes from '../../src/routes/finance-sites-routes';

const TENANT_A = 'tenant-A';
const TENANT_B = 'tenant-B';
const SITE_A = '11111111-1111-4111-8111-111111111111';
const VOUCHER_A = '22222222-2222-4222-8222-222222222222';
const CATEGORY_A = '33333333-3333-4333-8333-333333333333';

const app = express();
app.use(express.json());
app.use('/api', financeSitesRoutes);
app.use(errorHandler);

function sampleSite(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: SITE_A,
    tenantId: TENANT_A,
    name: 'Villa Kipe — extension',
    zone: 'Ratoma',
    propertyId: null,
    managerId: null,
    status: 'IN_PROGRESS',
    startDate: new Date('2026-08-01'),
    plannedEndDate: null,
    progressPercent: 20,
    closedAt: null,
    finalCost: null,
    actualCost: 350_000,
    currency: 'XOF',
    ...overrides
  };
}

function sampleSiteDetail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    site: sampleSite(),
    allocations: [
      {
        id: 'alloc-1',
        allocationDate: new Date('2026-08-05'),
        costCategoryId: CATEGORY_A,
        costCategoryLabel: 'Gros œuvre',
        sourceType: 'CASH_VOUCHER',
        sourceId: VOUCHER_A,
        sourceLabel: 'Bon de caisse 2026-0001 — Amara Camara',
        amount: 350_000
      }
    ],
    byCostCategory: [{ costCategoryId: CATEGORY_A, label: 'Gros œuvre', amount: 350_000 }],
    ...overrides
  };
}

function sampleCostCategory(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: CATEGORY_A, tenantId: TENANT_A, label: 'Gros œuvre', position: 1, isActive: true, ...overrides };
}

function sampleVoucher(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: VOUCHER_A,
    number: '2026-0001',
    tenantId: TENANT_A,
    siteId: SITE_A,
    costCategoryId: CATEGORY_A,
    beneficiary: 'Amara Camara',
    amount: 50_000,
    currency: 'XOF',
    voucherDate: new Date('2026-09-10'),
    reason: 'Achat de ciment',
    status: 'DRAFT',
    createdByUserId: 'user-1',
    validatedByUserId: null,
    validatedAt: null,
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  guardCalls = [];
});

// ---------------------------------------------------------------------------
// A. GET sites
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/sites', () => {
  it('liste les chantiers du tenant (cas nominal)', async () => {
    listConstructionSites.mockResolvedValue({ sites: [sampleSite()], total: 1 });

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/sites`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(SITE_A);
    expect(response.body.data[0].actualCost).toBe(350_000);
    expect(listConstructionSites).toHaveBeenCalledWith(TENANT_A, { status: undefined });
    expect(guardCalls).toContain('accountsRead');
  });

  it('filtre par statut quand il est fourni', async () => {
    listConstructionSites.mockResolvedValue({ sites: [], total: 0 });

    await request(app).get(`/api/tenants/${TENANT_A}/finance/sites?status=CLOSED`);

    expect(listConstructionSites).toHaveBeenCalledWith(TENANT_A, { status: 'CLOSED' });
  });

  it('rejette en 400 un statut hors énumération', async () => {
    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/sites?status=DEMOLISHED`);

    expect(response.status).toBe(400);
    expect(listConstructionSites).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// B. POST sites
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/sites', () => {
  const body = { name: 'Villa Kipe — extension', zone: 'Ratoma', startDate: '2026-08-01' };

  it('crée un chantier (cas nominal, 201)', async () => {
    createConstructionSite.mockResolvedValue(sampleSite());

    const response = await request(app).post(`/api/tenants/${TENANT_A}/finance/sites`).send(body);

    expect(response.status).toBe(201);
    expect(response.body.data.id).toBe(SITE_A);
    expect(createConstructionSite).toHaveBeenCalledWith(
      TENANT_A,
      expect.objectContaining({ name: 'Villa Kipe — extension', zone: 'Ratoma' })
    );
    expect(guardCalls).toContain('sitesManage');
    expect(guardCalls).not.toContain('accountsRead');
  });

  it('rejette en 400 un corps sans nom', async () => {
    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/sites`)
      .send({ zone: 'Ratoma', startDate: '2026-08-01' });

    expect(response.status).toBe(400);
    expect(createConstructionSite).not.toHaveBeenCalled();
  });

  it('refuse un coût réel envoyé en entrée (principe P-4) : 400, jamais transmis au domaine', async () => {
    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/sites`)
      .send({ ...body, actualCost: 999_999 });

    expect(response.status).toBe(400);
    expect(createConstructionSite).not.toHaveBeenCalled();
  });

  it('refuse également finalCost, par le même mécanisme', async () => {
    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/sites`)
      .send({ ...body, finalCost: 12_000_000 });

    expect(response.status).toBe(400);
    expect(createConstructionSite).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// C. GET sites/:siteId
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/sites/:siteId', () => {
  it("renvoie l'en-tête du chantier (cas nominal)", async () => {
    getSiteDetail.mockResolvedValue(sampleSiteDetail());

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}`);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(SITE_A);
    expect(response.body.data.actualCost).toBe(350_000);
  });

  it('rejette en 400 un identifiant de chantier malformé', async () => {
    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/sites/pas-un-uuid`);

    expect(response.status).toBe(400);
    expect(getSiteDetail).not.toHaveBeenCalled();
  });

  it('renvoie 404 pour un chantier inexistant', async () => {
    getSiteDetail.mockRejectedValue(new NotFoundError('Chantier introuvable.'));

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}`);

    expect(response.status).toBe(404);
  });

  it("isole les tenants : le tenant B n'accède pas à un chantier du tenant A", async () => {
    getSiteDetail.mockImplementation(async (tenantId: string, siteId: string) => {
      if (tenantId !== TENANT_A || siteId !== SITE_A) {
        throw new NotFoundError('Chantier introuvable.');
      }
      return sampleSiteDetail();
    });

    const ownResponse = await request(app).get(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}`);
    const crossTenantResponse = await request(app).get(`/api/tenants/${TENANT_B}/finance/sites/${SITE_A}`);

    expect(ownResponse.status).toBe(200);
    expect(crossTenantResponse.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// D. GET sites/:siteId/detail
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/sites/:siteId/detail', () => {
  it('renvoie le détail des imputations (cas nominal)', async () => {
    getSiteDetail.mockResolvedValue(sampleSiteDetail());

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/detail`);

    expect(response.status).toBe(200);
    expect(response.body.data.siteId).toBe(SITE_A);
    expect(response.body.data.allocations).toHaveLength(1);
    expect(response.body.data.subtotalsByCategory[0]).toEqual({
      costCategoryId: CATEGORY_A,
      label: 'Gros œuvre',
      total: 350_000
    });
  });

  it('renvoie 404 pour un chantier inexistant', async () => {
    getSiteDetail.mockRejectedValue(new NotFoundError('Chantier introuvable.'));

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/detail`);

    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// E. GET cost-categories
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/cost-categories', () => {
  it('liste les postes de dépense (cas nominal)', async () => {
    listCostCategories.mockResolvedValue([sampleCostCategory()]);

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/cost-categories`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].label).toBe('Gros œuvre');
    expect(guardCalls).toContain('accountsRead');
  });
});

// ---------------------------------------------------------------------------
// F. POST cost-categories
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/cost-categories', () => {
  it('crée un poste de dépense (cas nominal, 201)', async () => {
    createCostCategory.mockResolvedValue(sampleCostCategory({ label: 'Menuiserie' }));

    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/cost-categories`)
      .send({ label: 'Menuiserie' });

    expect(response.status).toBe(201);
    expect(response.body.data.label).toBe('Menuiserie');
    expect(guardCalls).toContain('settingsManage');
    expect(guardCalls).not.toContain('accountsRead');
  });

  it('rejette en 400 un corps sans libellé', async () => {
    const response = await request(app).post(`/api/tenants/${TENANT_A}/finance/cost-categories`).send({});

    expect(response.status).toBe(400);
    expect(createCostCategory).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// G. POST sites/:siteId/cash-vouchers
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/sites/:siteId/cash-vouchers', () => {
  const body = {
    beneficiaryName: 'Amara Camara',
    amount: 50_000,
    voucherDate: '2026-09-10',
    costCategoryId: CATEGORY_A,
    reason: 'Achat de ciment'
  };

  it('émet une pièce de caisse en brouillon (cas nominal, 201)', async () => {
    createCashVoucherTx.mockResolvedValue(sampleVoucher());

    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/cash-vouchers`)
      .send(body);

    expect(response.status).toBe(201);
    expect(response.body.data.number).toBe('2026-0001');
    expect(response.body.data.status).toBe('DRAFT');
    expect(createCashVoucherTx).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_A,
      expect.objectContaining({ siteId: SITE_A, beneficiary: 'Amara Camara', amount: 50_000 })
    );
    expect(guardCalls).toContain('documentsCreate');
  });

  it('rejette en 400 un montant négatif', async () => {
    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/cash-vouchers`)
      .send({ ...body, amount: -10 });

    expect(response.status).toBe(400);
    expect(createCashVoucherTx).not.toHaveBeenCalled();
  });

  it('renvoie 404 quand le chantier est inexistant', async () => {
    createCashVoucherTx.mockRejectedValue(new NotFoundError('Chantier introuvable.'));

    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/cash-vouchers`)
      .send(body);

    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// H. POST cash-vouchers/:voucherId/validate
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/cash-vouchers/:voucherId/validate', () => {
  it('valide une pièce de caisse brouillon (cas nominal, 200)', async () => {
    validateCashVoucherTx.mockResolvedValue(
      sampleVoucher({ status: 'VALIDATED', validatedAt: new Date('2026-09-18') })
    );

    const response = await request(app).post(`/api/tenants/${TENANT_A}/finance/cash-vouchers/${VOUCHER_A}/validate`);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('VALIDATED');
    expect(guardCalls).toContain('documentsValidate');
  });

  it('renvoie 409, pas 400, sur une seconde validation (pièce déjà validée)', async () => {
    validateCashVoucherTx.mockRejectedValue(new ConflictError('Cette pièce de caisse est déjà validée.'));

    const response = await request(app).post(`/api/tenants/${TENANT_A}/finance/cash-vouchers/${VOUCHER_A}/validate`);

    expect(response.status).toBe(409);
  });

  it('renvoie 404 pour une pièce de caisse inexistante', async () => {
    validateCashVoucherTx.mockRejectedValue(new NotFoundError('Pièce de caisse introuvable.'));

    const response = await request(app).post(`/api/tenants/${TENANT_A}/finance/cash-vouchers/${VOUCHER_A}/validate`);

    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// I. GET cash-vouchers/:voucherId.pdf
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/cash-vouchers/:voucherId.pdf', () => {
  it('renvoie un document PDF portant le numéro de la pièce (cas nominal)', async () => {
    cashVoucherFindFirst.mockResolvedValue({
      id: VOUCHER_A,
      tenantId: TENANT_A,
      voucherNumber: 1,
      voucherYear: 2026,
      siteId: SITE_A,
      costCategoryId: CATEGORY_A,
      beneficiaryName: 'Amara Camara',
      amount: 50_000,
      currency: 'XOF',
      reason: 'Achat de ciment',
      voucherDate: new Date('2026-09-10'),
      validatedAt: null,
      site: { name: 'Villa Kipe — extension' },
      costCategory: { label: 'Gros œuvre' }
    });

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/cash-vouchers/${VOUCHER_A}.pdf`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/pdf/);
    expect(response.headers['content-disposition']).toContain('2026-0001');
    expect(Buffer.from(response.body).slice(0, 5).toString()).toBe('%PDF-');
  });

  it('renvoie 404 pour une pièce de caisse inexistante', async () => {
    cashVoucherFindFirst.mockResolvedValue(null);

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/cash-vouchers/${VOUCHER_A}.pdf`);

    expect(response.status).toBe(404);
  });

  it("isole les tenants : le tenant B n'imprime pas une pièce du tenant A", async () => {
    cashVoucherFindFirst.mockImplementation(async ({ where }: any) =>
      where.tenantId === TENANT_A && where.id === VOUCHER_A
        ? {
            id: VOUCHER_A,
            tenantId: TENANT_A,
            voucherNumber: 1,
            voucherYear: 2026,
            siteId: SITE_A,
            costCategoryId: CATEGORY_A,
            beneficiaryName: 'Amara Camara',
            amount: 50_000,
            currency: 'XOF',
            reason: 'Achat de ciment',
            voucherDate: new Date('2026-09-10'),
            validatedAt: null,
            site: { name: 'Villa Kipe — extension' },
            costCategory: { label: 'Gros œuvre' }
          }
        : null
    );

    const ownResponse = await request(app).get(`/api/tenants/${TENANT_A}/finance/cash-vouchers/${VOUCHER_A}.pdf`);
    const crossTenantResponse = await request(app).get(
      `/api/tenants/${TENANT_B}/finance/cash-vouchers/${VOUCHER_A}.pdf`
    );

    expect(ownResponse.status).toBe(200);
    expect(crossTenantResponse.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// J. GET validation-queue
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/validation-queue', () => {
  function samplePendingDocument(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      documentType: 'CASH_VOUCHER',
      documentId: VOUCHER_A,
      label: 'Bon de caisse 2026-0001 — Amara Camara',
      amount: 50_000,
      currency: 'XOF',
      createdAt: new Date('2026-09-10'),
      createdByUserId: 'user-2',
      createdByLabel: 'Fatoumata Diallo',
      ...overrides
    };
  }

  it('renvoie la file de validation (cas nominal)', async () => {
    getValidationQueue.mockResolvedValue([samplePendingDocument()]);

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/validation-queue`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].createdByLabel).toBe('Fatoumata Diallo');
  });

  it('filtre par nature de pièce quand documentType est fourni', async () => {
    getValidationQueue.mockResolvedValue([
      samplePendingDocument({ documentType: 'CASH_VOUCHER' }),
      samplePendingDocument({ documentType: 'SUPPLIER_INVOICE', documentId: 'inv-1' })
    ]);

    const response = await request(app).get(
      `/api/tenants/${TENANT_A}/finance/validation-queue?documentType=SUPPLIER_INVOICE`
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].documentType).toBe('SUPPLIER_INVOICE');
  });

  it('rejette en 400 une nature de pièce hors énumération', async () => {
    const response = await request(app).get(
      `/api/tenants/${TENANT_A}/finance/validation-queue?documentType=NOT_A_TYPE`
    );

    expect(response.status).toBe(400);
    expect(getValidationQueue).not.toHaveBeenCalled();
  });

  it('est réservée au droit de validation, jamais au seul droit de lecture', async () => {
    getValidationQueue.mockResolvedValue([]);

    await request(app).get(`/api/tenants/${TENANT_A}/finance/validation-queue`);

    expect(guardCalls).toEqual(['documentsValidate']);
    expect(guardCalls).not.toContain('accountsRead');
  });
});
