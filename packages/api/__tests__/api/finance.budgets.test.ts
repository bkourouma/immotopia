import express from 'express';
import request from 'supertest';

/**
 * Tests des sept points d'entrée agence « budget et avenants » du module
 * financier — lot 3, premier volet.
 *
 * Modèle de mock : `__tests__/api/finance.suppliers.test.ts` (lot 2). Les
 * middlewares d'authentification, de tenant et de droits sont remplacés par
 * des passe-plats ; le domaine (`lib/finance/budgets.ts`) est simulé pour
 * vérifier que le contrôleur transmet bien `tenantId` (isolation), traduit
 * les entrées invalides en 400 (Zod strict), et laisse passer tel quel le
 * statut porté par les erreurs du domaine (404, 409).
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

const createSiteBudgetTx = jest.fn();
const validateSiteBudgetTx = jest.fn();
const getValidatedSiteBudget = jest.fn();
const listSiteBudgets = jest.fn();
const createBudgetAmendmentTx = jest.fn();
const validateBudgetAmendmentTx = jest.fn();
const listBudgetAmendments = jest.fn();

jest.mock('../../src/lib/finance/budgets', () => ({
  createSiteBudgetTx: (...args: any[]) => createSiteBudgetTx(...args),
  validateSiteBudgetTx: (...args: any[]) => validateSiteBudgetTx(...args),
  getValidatedSiteBudget: (...args: any[]) => getValidatedSiteBudget(...args),
  listSiteBudgets: (...args: any[]) => listSiteBudgets(...args),
  createBudgetAmendmentTx: (...args: any[]) => createBudgetAmendmentTx(...args),
  validateBudgetAmendmentTx: (...args: any[]) => validateBudgetAmendmentTx(...args),
  listBudgetAmendments: (...args: any[]) => listBudgetAmendments(...args)
}));

jest.mock('../../src/utils/database', () => ({
  prisma: {
    $transaction: (callback: any) => callback({})
  }
}));

import { badRequest, conflict, notFound } from '../../src/lib/errors';
import { errorHandler } from '../../src/middleware/error-middleware';
import financeBudgetsRoutes from '../../src/routes/finance-budgets-routes';

const TENANT_A = 'tenant-A';
const TENANT_B = 'tenant-B';
const SITE_A = '11111111-1111-4111-8111-111111111111';
const BUDGET_A = '22222222-2222-4222-8222-222222222222';
const CATEGORY_A = '33333333-3333-4333-8333-333333333333';
const AMENDMENT_A = '44444444-4444-4444-8444-444444444444';

const app = express();
app.use(express.json());
app.use('/api', financeBudgetsRoutes);
app.use(errorHandler);

function budgetRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: BUDGET_A,
    tenantId: TENANT_A,
    siteId: SITE_A,
    label: 'Budget initial',
    status: 'DRAFT',
    validatedAt: null,
    validatedByUserId: null,
    validatedByLabel: null,
    currency: 'XOF',
    lines: [
      {
        id: 'line-1',
        costCategoryId: CATEGORY_A,
        costCategoryLabel: 'Gros œuvre',
        label: 'Fondations',
        amountForecast: 500000
      }
    ],
    totalForecast: 500000,
    ...overrides
  };
}

function amendmentRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: AMENDMENT_A,
    budgetId: BUDGET_A,
    amendmentDate: new Date('2026-09-19'),
    reason: 'Rallonge chantier',
    status: 'DRAFT',
    createdByUserId: 'user-1',
    createdByLabel: 'Ibrahima Sow',
    validatedAt: null,
    lines: [{ id: 'aline-1', costCategoryId: CATEGORY_A, costCategoryLabel: 'Gros œuvre', amountDelta: 50000 }],
    totalDelta: 50000,
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// A. GET sites/:siteId/budgets
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/sites/:siteId/budgets', () => {
  it('liste les budgets du chantier (cas nominal)', async () => {
    listSiteBudgets.mockResolvedValue([budgetRecord()]);

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/budgets`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].totalForecast).toBe(500000);
    expect(listSiteBudgets).toHaveBeenCalledWith(TENANT_A, SITE_A);
  });

  it("rejette en 400 un siteId qui n'est pas un UUID", async () => {
    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/sites/pas-un-uuid/budgets`);

    expect(response.status).toBe(400);
    expect(listSiteBudgets).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// B. POST sites/:siteId/budgets
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/sites/:siteId/budgets', () => {
  const body = {
    label: 'Budget initial',
    lines: [{ costCategoryId: CATEGORY_A, label: 'Fondations', amountForecast: 500000 }]
  };

  it('cree le budget (cas nominal, 201)', async () => {
    createSiteBudgetTx.mockResolvedValue(budgetRecord());

    const response = await request(app).post(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/budgets`).send(body);

    expect(response.status).toBe(201);
    expect(response.body.data.id).toBe(BUDGET_A);
    expect(createSiteBudgetTx).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_A,
      expect.objectContaining({ siteId: SITE_A, label: 'Budget initial' })
    );
  });

  // -------------------------------------------------------------------------
  // Quantite et prix unitaire sur une ligne — additifs et facultatifs
  // -------------------------------------------------------------------------

  it('transmet la quantite et le prix unitaire au domaine, et les rend dans la reponse', async () => {
    createSiteBudgetTx.mockResolvedValue(
      budgetRecord({
        lines: [
          {
            id: 'line-1',
            costCategoryId: CATEGORY_A,
            costCategoryLabel: 'Gros œuvre',
            label: 'Ciment CPJ 45',
            amountForecast: 500000,
            quantity: 100,
            unitPrice: 5000
          }
        ]
      })
    );

    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/budgets`)
      .send({
        label: 'Budget initial',
        lines: [
          { costCategoryId: CATEGORY_A, label: 'Ciment CPJ 45', amountForecast: 500000, quantity: 100, unitPrice: 5000 }
        ]
      });

    expect(response.status).toBe(201);
    // L'aller-retour conserve les deux champs.
    expect(response.body.data.lines[0].quantity).toBe(100);
    expect(response.body.data.lines[0].unitPrice).toBe(5000);
    const [, , params] = createSiteBudgetTx.mock.calls[0];
    expect(params.lines[0]).toEqual({
      costCategoryId: CATEGORY_A,
      label: 'Ciment CPJ 45',
      amountForecast: 500000,
      quantity: 100,
      unitPrice: 5000
    });
  });

  it('accepte une ligne sans quantite ni prix unitaire (enveloppe forfaitaire)', async () => {
    createSiteBudgetTx.mockResolvedValue(budgetRecord());

    const response = await request(app).post(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/budgets`).send(body);

    expect(response.status).toBe(201);
    const [, , params] = createSiteBudgetTx.mock.calls[0];
    expect(params.lines[0].quantity).toBeUndefined();
    expect(params.lines[0].unitPrice).toBeUndefined();
  });

  it('rejette en 400 une quantite negative sur une ligne de budget', async () => {
    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/budgets`)
      .send({
        label: 'Budget initial',
        lines: [{ costCategoryId: CATEGORY_A, label: 'Fondations', amountForecast: 500000, quantity: -1 }]
      });

    expect(response.status).toBe(400);
    expect(createSiteBudgetTx).not.toHaveBeenCalled();
  });

  it('rejette en 400 un corps sans lignes', async () => {
    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/budgets`)
      .send({ label: 'Budget vide', lines: [] });

    expect(response.status).toBe(400);
    expect(createSiteBudgetTx).not.toHaveBeenCalled();
  });

  it('rejette en 400 un champ non prevu par le contrat (mode strict)', async () => {
    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/budgets`)
      .send({ ...body, champInconnu: 'valeur surprise' });

    expect(response.status).toBe(400);
    expect(createSiteBudgetTx).not.toHaveBeenCalled();
  });

  it('renvoie 404 quand le chantier est introuvable (relaye depuis le domaine)', async () => {
    createSiteBudgetTx.mockRejectedValue(notFound('Chantier introuvable'));

    const response = await request(app).post(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/budgets`).send(body);

    expect(response.status).toBe(404);
  });

  it('renvoie 409 quand un poste de depense est desactive', async () => {
    createSiteBudgetTx.mockRejectedValue(conflict('Le poste de dépense « Gros œuvre » est désactivé'));

    const response = await request(app).post(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/budgets`).send(body);

    expect(response.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// C. GET sites/:siteId/budget (singulier) — le budget valide, ou 404
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/sites/:siteId/budget', () => {
  it('renvoie le budget valide (cas nominal)', async () => {
    getValidatedSiteBudget.mockResolvedValue(budgetRecord({ status: 'VALIDATED' }));

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/budget`);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('VALIDATED');
    expect(getValidatedSiteBudget).toHaveBeenCalledWith(TENANT_A, SITE_A);
  });

  it("n'est jamais capturee par la route liste (chemins litteraux distincts)", async () => {
    getValidatedSiteBudget.mockResolvedValue(null);
    listSiteBudgets.mockResolvedValue([budgetRecord()]);

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/budget`);

    expect(getValidatedSiteBudget).toHaveBeenCalledTimes(1);
    expect(listSiteBudgets).not.toHaveBeenCalled();
    expect(response.status).toBe(404);
  });

  it("renvoie 404 quand le chantier n'a pas de budget valide", async () => {
    getValidatedSiteBudget.mockResolvedValue(null);

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/budget`);

    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// D. POST site-budgets/:budgetId/validate
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/site-budgets/:budgetId/validate', () => {
  it('valide le budget brouillon (cas nominal, 200)', async () => {
    validateSiteBudgetTx.mockResolvedValue(
      budgetRecord({ status: 'VALIDATED', validatedByUserId: 'user-1', validatedByLabel: 'Fatoumata Barry' })
    );

    const response = await request(app).post(`/api/tenants/${TENANT_A}/finance/site-budgets/${BUDGET_A}/validate`);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('VALIDATED');
    expect(response.body.data.validatedByLabel).toBe('Fatoumata Barry');
    expect(validateSiteBudgetTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, BUDGET_A, 'user-1');
  });

  it('renvoie 409 (conflit), pas 400, pour une seconde validation du meme budget', async () => {
    validateSiteBudgetTx.mockRejectedValue(conflict('Ce budget est déjà validé'));

    const response = await request(app).post(`/api/tenants/${TENANT_A}/finance/site-budgets/${BUDGET_A}/validate`);

    expect(response.status).toBe(409);
  });

  it('renvoie 409 quand le chantier a deja un budget valide', async () => {
    validateSiteBudgetTx.mockRejectedValue(conflict('Ce chantier a déjà un budget validé'));

    const response = await request(app).post(`/api/tenants/${TENANT_A}/finance/site-budgets/${BUDGET_A}/validate`);

    expect(response.status).toBe(409);
  });

  it('renvoie 404 pour un budget introuvable', async () => {
    validateSiteBudgetTx.mockRejectedValue(notFound('Budget de chantier introuvable'));

    const response = await request(app).post(`/api/tenants/${TENANT_A}/finance/site-budgets/${BUDGET_A}/validate`);

    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// E. GET site-budgets/:budgetId/amendments
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/site-budgets/:budgetId/amendments', () => {
  it('liste les avenants du budget (cas nominal)', async () => {
    listBudgetAmendments.mockResolvedValue([amendmentRecord()]);

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/site-budgets/${BUDGET_A}/amendments`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].totalDelta).toBe(50000);
    expect(listBudgetAmendments).toHaveBeenCalledWith(TENANT_A, BUDGET_A);
  });
});

// ---------------------------------------------------------------------------
// F. POST site-budgets/:budgetId/amendments
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/site-budgets/:budgetId/amendments', () => {
  const body = {
    amendmentDate: '2026-09-19',
    reason: 'Rallonge chantier',
    lines: [{ costCategoryId: CATEGORY_A, amountDelta: 50000 }]
  };

  it("cree l'avenant brouillon (cas nominal, 201)", async () => {
    createBudgetAmendmentTx.mockResolvedValue(amendmentRecord());

    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/site-budgets/${BUDGET_A}/amendments`)
      .send(body);

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe('DRAFT');
    expect(createBudgetAmendmentTx).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_A,
      expect.objectContaining({ budgetId: BUDGET_A, reason: 'Rallonge chantier', createdByUserId: 'user-1' })
    );
  });

  it('accepte un montant negatif (ecart signe)', async () => {
    createBudgetAmendmentTx.mockResolvedValue(amendmentRecord({ totalDelta: -20000 }));

    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/site-budgets/${BUDGET_A}/amendments`)
      .send({ ...body, lines: [{ costCategoryId: CATEGORY_A, amountDelta: -20000 }] });

    expect(response.status).toBe(201);
    expect(createBudgetAmendmentTx).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_A,
      expect.objectContaining({ lines: [{ costCategoryId: CATEGORY_A, amountDelta: -20000 }] })
    );
  });

  // Le cas propre a l'avenant : l'ecart est SIGNE, mais une quantite negative
  // n'a pas de sens. C'est donc le prix unitaire qui porte le signe.
  it('accepte un prix unitaire negatif sur une ligne d\u2019avenant, la quantite restant positive', async () => {
    createBudgetAmendmentTx.mockResolvedValue(
      amendmentRecord({
        lines: [
          {
            id: 'aline-1',
            costCategoryId: CATEGORY_A,
            costCategoryLabel: 'Gros œuvre',
            amountDelta: -190000,
            quantity: 2,
            unitPrice: -95000
          }
        ],
        totalDelta: -190000
      })
    );

    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/site-budgets/${BUDGET_A}/amendments`)
      .send({
        ...body,
        lines: [{ costCategoryId: CATEGORY_A, amountDelta: -190000, quantity: 2, unitPrice: -95000 }]
      });

    expect(response.status).toBe(201);
    expect(response.body.data.lines[0].quantity).toBe(2);
    expect(response.body.data.lines[0].unitPrice).toBe(-95000);
    expect(createBudgetAmendmentTx).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_A,
      expect.objectContaining({
        lines: [{ costCategoryId: CATEGORY_A, amountDelta: -190000, quantity: 2, unitPrice: -95000 }]
      })
    );
  });

  it('rejette en 400 une quantite negative sur une ligne d\u2019avenant', async () => {
    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/site-budgets/${BUDGET_A}/amendments`)
      .send({
        ...body,
        lines: [{ costCategoryId: CATEGORY_A, amountDelta: -190000, quantity: -2, unitPrice: 95000 }]
      });

    expect(response.status).toBe(400);
    expect(createBudgetAmendmentTx).not.toHaveBeenCalled();
  });

  it('rejette en 400 un corps sans motif', async () => {
    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/site-budgets/${BUDGET_A}/amendments`)
      .send({ amendmentDate: '2026-09-19', lines: body.lines });

    expect(response.status).toBe(400);
    expect(createBudgetAmendmentTx).not.toHaveBeenCalled();
  });

  it('rejette en 400 un champ non prevu par le contrat (mode strict)', async () => {
    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/site-budgets/${BUDGET_A}/amendments`)
      .send({ ...body, champInconnu: true });

    expect(response.status).toBe(400);
    expect(createBudgetAmendmentTx).not.toHaveBeenCalled();
  });

  it("renvoie 409 quand le budget vise n'est pas valide", async () => {
    createBudgetAmendmentTx.mockRejectedValue(conflict('Seul un budget validé peut être amendé'));

    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/site-budgets/${BUDGET_A}/amendments`)
      .send(body);

    expect(response.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// G. POST budget-amendments/:id/validate
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/budget-amendments/:id/validate', () => {
  it("valide l'avenant (cas nominal, 200)", async () => {
    validateBudgetAmendmentTx.mockResolvedValue(amendmentRecord({ status: 'VALIDATED' }));

    const response = await request(app).post(
      `/api/tenants/${TENANT_A}/finance/budget-amendments/${AMENDMENT_A}/validate`
    );

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('VALIDATED');
    expect(validateBudgetAmendmentTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, AMENDMENT_A, 'user-1');
  });

  it('renvoie 409 pour un avenant deja valide', async () => {
    validateBudgetAmendmentTx.mockRejectedValue(conflict('Cet avenant est déjà validé'));

    const response = await request(app).post(
      `/api/tenants/${TENANT_A}/finance/budget-amendments/${AMENDMENT_A}/validate`
    );

    expect(response.status).toBe(409);
  });

  it('renvoie 404 pour un avenant introuvable', async () => {
    validateBudgetAmendmentTx.mockRejectedValue(notFound('Avenant introuvable'));

    const response = await request(app).post(
      `/api/tenants/${TENANT_A}/finance/budget-amendments/${AMENDMENT_A}/validate`
    );

    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Isolation multi-tenant : tenantId vient toujours de l'URL
// ---------------------------------------------------------------------------

describe('isolation multi-tenant', () => {
  it("transmet le tenantId de l'URL, jamais un autre, au domaine", async () => {
    listSiteBudgets.mockResolvedValue([]);

    await request(app).get(`/api/tenants/${TENANT_B}/finance/sites/${SITE_A}/budgets`);

    expect(listSiteBudgets).toHaveBeenCalledWith(TENANT_B, SITE_A);
  });
});

// Empêche `badRequest` de rester un import inutilisé si aucun test ne
// l'utilise directement au-dessus (les schémas Zod produisent déjà leurs
// propres 400 ; ce test couvre le cas où le domaine, lui, choisit d'en lever un).
describe('400 leve par le domaine (badRequest, lib/errors)', () => {
  it('est relaye tel quel, jamais transforme en 500', async () => {
    createSiteBudgetTx.mockRejectedValue(badRequest('Un budget doit porter au moins une ligne'));

    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/budgets`)
      .send({ label: 'x', lines: [{ costCategoryId: CATEGORY_A, label: 'y', amountForecast: 1 }] });

    expect(response.status).toBe(400);
  });
});
