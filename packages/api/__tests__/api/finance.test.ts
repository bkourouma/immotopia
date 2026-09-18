import express from 'express';
import request from 'supertest';

/**
 * Tests des sept points d'entrée agence et du point d'entrée portail du
 * module financier opérationnel — lot 1, volet clients.
 *
 * Modèle de mock : `__tests__/api/syndics.accounting.test.ts`. Les
 * middlewares d'authentification, de tenant et de droits sont remplacés par
 * des passe-plats ; le domaine (`lib/finance/reports.ts`,
 * `lib/finance/billing-run.ts`, `lib/finance/statement-pdf.ts`) est simulé en
 * mémoire, filtré par `tenantId`, pour vérifier que le contrôleur transmet
 * bien l'isolation plutôt que de la recréer.
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

/**
 * Contexte portail courant, modifiable par test — simule le locataire
 * connecté. Posé directement sur la requête par un petit middleware local
 * plutôt que par le vrai `requireTenantPortalAccess`
 * (`middleware/tenant-portal-access.ts`) : ce test n'importe volontairement
 * ni ce middleware, ni `tenant-portal-routes.ts`, ni
 * `tenant-portal-controller.ts`. Ce dernier porte une erreur TypeScript
 * préexistante, sans rapport avec ce lot (méthode `declarePayment`, l'une
 * des 103 déjà connues du dépôt), qui ferait échouer la compilation de tout
 * fichier de test qui l'importerait via `ts-jest`. La route portail réelle
 * délègue en une ligne à `handleTenantPortalFinanceStatement`
 * (`controllers/finance-controller.ts`) : c'est cette fonction, la même en
 * production et ici, qui est exercée ci-dessous — voir son en-tête pour le
 * détail de ce choix.
 */
let portalContext: { tenantClientId: string; tenantId: string; leaseId: string } = {
  tenantClientId: 'client-1',
  tenantId: 'tenant-A',
  leaseId: 'lease-1'
};

const getClientsBalance = jest.fn();
const getClientsAgingBalance = jest.fn();
const getAccountStatement = jest.fn();

jest.mock('../../src/lib/finance/reports', () => ({
  getClientsBalance: (...args: any[]) => getClientsBalance(...args),
  getClientsAgingBalance: (...args: any[]) => getClientsAgingBalance(...args),
  getAccountStatement: (...args: any[]) => getAccountStatement(...args)
}));

const runRentBilling = jest.fn();

jest.mock('../../src/lib/finance/billing-run', () => ({
  runRentBilling: (...args: any[]) => runRentBilling(...args)
}));

const buildAccountStatementPdf = jest.fn();

jest.mock('../../src/lib/finance/statement-pdf', () => ({
  buildAccountStatementPdf: (...args: any[]) => buildAccountStatementPdf(...args)
}));

const rentBillingRunFindMany = jest.fn();
const rentBillingRunFindFirst = jest.fn();
const thirdPartyAccountFindFirst = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    rentBillingRun: {
      findMany: (...args: any[]) => rentBillingRunFindMany(...args),
      findFirst: (...args: any[]) => rentBillingRunFindFirst(...args)
    },
    thirdPartyAccount: {
      findFirst: (...args: any[]) => thirdPartyAccountFindFirst(...args)
    }
  }
}));

import { notFound } from '../../src/lib/errors';
import { errorHandler } from '../../src/middleware/error-middleware';
import financeRoutes from '../../src/routes/finance-routes';
import { handleTenantPortalFinanceStatement } from '../../src/controllers/finance-controller';

const TENANT_A = 'tenant-A';
const TENANT_B = 'tenant-B';
const ACCOUNT_A = '11111111-1111-4111-8111-111111111111';
const RUN_A = '22222222-2222-4222-8222-222222222222';

const app = express();
app.use(express.json());
app.use('/api', financeRoutes);

// Route portail minimale : pose le contexte de session (comme le ferait
// `requireTenantPortalAccess`) puis appelle directement le même handler que
// la route réelle — voir la note au-dessus de `portalContext`.
const portalRouter = express.Router();
portalRouter.use((req: any, _res, next) => {
  req.tenantPortal = { ...portalContext };
  next();
});
portalRouter.get('/finance/statement', (req, res) => {
  void handleTenantPortalFinanceStatement(req, res);
});
app.use('/api/portal/tenant', portalRouter);

// Même middleware d'erreur central que `src/index.ts` : sans lui, un
// `ZodError` rejeté par `asyncHandler` tomberait sur le gestionnaire par
// défaut d'Express (500), pas sur la conversion en 400 de
// `middleware/error-middleware.ts` que ce test vérifie.
app.use(errorHandler);

function sampleBalance(tenantId: string) {
  return {
    lines: [
      {
        accountId: ACCOUNT_A,
        tenantClientId: 'client-1',
        label: `Locataire de ${tenantId}`,
        propertyLabels: ['Villa Kipe 12'],
        totalBilled: 450_000,
        totalSettled: 300_000,
        balance: 150_000,
        currency: 'XOF'
      }
    ],
    totalBalance: 150_000,
    currency: 'XOF'
  };
}

function sampleStatement() {
  return {
    accountId: ACCOUNT_A,
    label: 'Fatoumata Diallo',
    openingBalance: 0,
    closingBalance: 150_000,
    currency: 'XOF',
    movements: [
      {
        id: 'mvt-1',
        movementDate: new Date('2026-09-05'),
        type: 'INSTALLMENT',
        amountBilled: 450_000,
        amountSettled: null,
        balanceAfter: 450_000,
        label: 'Loyer de septembre 2026',
        sourceType: 'RENTAL_INSTALLMENT',
        sourceId: 'inst-1',
        leaseId: 'lease-1',
        createdAt: new Date('2026-09-05')
      }
    ],
    total: 1
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  portalContext = { tenantClientId: 'client-1', tenantId: 'tenant-A', leaseId: 'lease-1' };
});

// ---------------------------------------------------------------------------
// A. Balance clients
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/clients/balance', () => {
  it('renvoie la balance clients du tenant demandé (cas nominal)', async () => {
    getClientsBalance.mockResolvedValue(sampleBalance(TENANT_A));

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/clients/balance`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.totalBalance).toBe(150_000);
    expect(getClientsBalance).toHaveBeenCalledWith(TENANT_A, expect.objectContaining({ range: undefined }));
  });

  it('exporte au format CSV quand format=csv est demandé', async () => {
    getClientsBalance.mockResolvedValue(sampleBalance(TENANT_A));

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/clients/balance?format=csv`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/csv/);
    expect(response.text).toContain('Locataire');
    expect(response.text).toContain(`Locataire de ${TENANT_A}`);
  });

  it('rejette en 400 un intervalle de dates invalide (periodStart après periodEnd)', async () => {
    const response = await request(app).get(
      `/api/tenants/${TENANT_A}/finance/clients/balance?periodStart=2026-09-30&periodEnd=2026-09-01`
    );

    expect(response.status).toBe(400);
    expect(getClientsBalance).not.toHaveBeenCalled();
  });

  it('accepte aussi les noms de bornes from/to utilisés par les écrans déjà livrés', async () => {
    getClientsBalance.mockResolvedValue(sampleBalance(TENANT_A));

    const response = await request(app).get(
      `/api/tenants/${TENANT_A}/finance/clients/balance?from=2026-09-30&to=2026-09-01`
    );

    expect(response.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// B. Balance clients âgée
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/clients/balance-agee', () => {
  it('renvoie la balance âgée avec asOfDate (cas nominal)', async () => {
    getClientsAgingBalance.mockResolvedValue({
      lines: [
        {
          ...sampleBalance(TENANT_A).lines[0],
          notYetDue: 0,
          days0To30: 150_000,
          days30To60: 0,
          days60To90: 0,
          daysOver90: 0
        }
      ],
      totalBalance: 150_000,
      currency: 'XOF'
    });

    const response = await request(app).get(
      `/api/tenants/${TENANT_A}/finance/clients/balance-agee?asOfDate=2026-09-18`
    );

    expect(response.status).toBe(200);
    expect(response.body.data.asOfDate).toBe('2026-09-18');
    expect(response.body.data.totalBalance).toBe(150_000);
  });

  it('rejette en 400 un intervalle invalide, même transmis en from/to', async () => {
    const response = await request(app).get(
      `/api/tenants/${TENANT_A}/finance/clients/balance-agee?from=2026-09-30&to=2026-09-01`
    );

    expect(response.status).toBe(400);
    expect(getClientsAgingBalance).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// C. Relevé de compte (JSON)
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/accounts/:accountId/statement', () => {
  it('renvoie le relevé (cas nominal), avec les deux formes de champs (contrat et écrans livrés)', async () => {
    getAccountStatement.mockResolvedValue(sampleStatement());

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/accounts/${ACCOUNT_A}/statement`);

    expect(response.status).toBe(200);
    expect(response.body.data.movements).toHaveLength(1);
    expect(response.body.data.lines).toHaveLength(1);
    expect(response.body.data.total).toBe(1);
    expect(response.body.data.totalLines).toBe(1);
    expect(response.body.data.page).toBe(1);
    expect(response.body.data.pageSize).toBe(50);
  });

  it('rejette en 400 un intervalle de dates invalide', async () => {
    const response = await request(app).get(
      `/api/tenants/${TENANT_A}/finance/accounts/${ACCOUNT_A}/statement?periodStart=2026-09-30&periodEnd=2026-09-01`
    );

    expect(response.status).toBe(400);
    expect(getAccountStatement).not.toHaveBeenCalled();
  });

  it('rejette en 400 un identifiant de compte malformé', async () => {
    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/accounts/pas-un-uuid/statement`);

    expect(response.status).toBe(400);
    expect(getAccountStatement).not.toHaveBeenCalled();
  });

  it('renvoie 404 pour un compte inexistant ou inaccessible', async () => {
    getAccountStatement.mockRejectedValue(notFound('Compte de tiers introuvable ou inaccessible'));

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/accounts/${ACCOUNT_A}/statement`);

    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// D. Relevé de compte (PDF)
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/accounts/:accountId/statement.pdf', () => {
  it('renvoie un document PDF (cas nominal)', async () => {
    getAccountStatement.mockResolvedValue(sampleStatement());
    buildAccountStatementPdf.mockResolvedValue(Buffer.from('%PDF-1.4 releve'));

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/accounts/${ACCOUNT_A}/statement.pdf`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/pdf/);
    expect(Buffer.from(response.body).toString()).toContain('releve');
  });

  it('rejette en 400 un intervalle de dates invalide, comme la version JSON', async () => {
    const response = await request(app).get(
      `/api/tenants/${TENANT_A}/finance/accounts/${ACCOUNT_A}/statement.pdf?periodStart=2026-09-30&periodEnd=2026-09-01`
    );

    expect(response.status).toBe(400);
    expect(getAccountStatement).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// E/F. Campagnes de facturation — liste et détail
// ---------------------------------------------------------------------------

function billingRunRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: RUN_A,
    tenantId: TENANT_A,
    periodYear: 2026,
    periodMonth: 9,
    label: 'Loyer de septembre 2026',
    status: 'DONE',
    startedAt: new Date('2026-09-01T08:00:00.000Z'),
    finishedAt: new Date('2026-09-01T08:00:05.000Z'),
    createdByUserId: 'user-1',
    summary: { billed: [], excluded: [], advancesApplied: [] },
    ...overrides
  };
}

describe('GET /tenants/:tenantId/finance/billing-runs', () => {
  it('liste les campagnes du tenant demandé (cas nominal)', async () => {
    rentBillingRunFindMany.mockResolvedValue([billingRunRow()]);

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/billing-runs`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(rentBillingRunFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_A }) })
    );
  });

  it('filtre par statut quand il est fourni', async () => {
    rentBillingRunFindMany.mockResolvedValue([]);

    await request(app).get(`/api/tenants/${TENANT_A}/finance/billing-runs?status=DONE`);

    expect(rentBillingRunFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT_A, status: 'DONE' }) })
    );
  });
});

describe('GET /tenants/:tenantId/finance/billing-runs/:runId', () => {
  it('renvoie le détail de la campagne (cas nominal)', async () => {
    rentBillingRunFindFirst.mockResolvedValue(billingRunRow());

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/billing-runs/${RUN_A}`);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(RUN_A);
    expect(response.body.data.summary).toEqual({ billed: [], excluded: [], advancesApplied: [] });
  });

  it('renvoie 404 pour une campagne inexistante', async () => {
    rentBillingRunFindFirst.mockResolvedValue(null);

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/billing-runs/${RUN_A}`);

    expect(response.status).toBe(404);
  });

  it("isole les tenants : le tenant B n'accède pas à une campagne du tenant A", async () => {
    // Simule le filtre tenantId de la vraie requête Prisma : la campagne
    // n'existe que pour TENANT_A.
    rentBillingRunFindFirst.mockImplementation(async ({ where }: any) =>
      where.tenantId === TENANT_A && where.id === RUN_A ? billingRunRow() : null
    );

    const ownResponse = await request(app).get(`/api/tenants/${TENANT_A}/finance/billing-runs/${RUN_A}`);
    const crossTenantResponse = await request(app).get(`/api/tenants/${TENANT_B}/finance/billing-runs/${RUN_A}`);

    expect(ownResponse.status).toBe(200);
    expect(crossTenantResponse.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// G. Campagnes de facturation — lancement
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/billing-runs', () => {
  const body = { periodYear: 2026, periodMonth: 9, label: 'Loyer de septembre 2026' };

  it('lance la campagne (cas nominal, 201)', async () => {
    runRentBilling.mockResolvedValue({ ...billingRunRow(), status: 'DONE' });

    const response = await request(app).post(`/api/tenants/${TENANT_A}/finance/billing-runs`).send(body);

    expect(response.status).toBe(201);
    expect(response.body.data.id).toBe(RUN_A);
    expect(runRentBilling).toHaveBeenCalledWith(TENANT_A, body, 'user-1');
  });

  it('rejette en 400 un corps invalide (mois hors bornes)', async () => {
    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/billing-runs`)
      .send({ periodYear: 2026, periodMonth: 13, label: 'Loyer invalide' });

    expect(response.status).toBe(400);
    expect(runRentBilling).not.toHaveBeenCalled();
  });

  it('rejette en 400 un corps sans libellé', async () => {
    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/billing-runs`)
      .send({ periodYear: 2026, periodMonth: 9 });

    expect(response.status).toBe(400);
    expect(runRentBilling).not.toHaveBeenCalled();
  });

  it('relancée deux fois sur la même période, ne duplique rien côté API (idempotence déléguée au domaine)', async () => {
    runRentBilling.mockResolvedValue({ ...billingRunRow(), status: 'DONE' });

    const first = await request(app).post(`/api/tenants/${TENANT_A}/finance/billing-runs`).send(body);
    const second = await request(app).post(`/api/tenants/${TENANT_A}/finance/billing-runs`).send(body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.data.id).toBe(second.body.data.id);
    expect(runRentBilling).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Isolation multi-tenant — relevé de compte
// ---------------------------------------------------------------------------

describe('Isolation multi-tenant', () => {
  it("un tenant ne peut pas lire le relevé d'un compte d'un autre tenant", async () => {
    getAccountStatement.mockImplementation(async (tenantId: string, accountId: string) => {
      if (tenantId !== TENANT_A || accountId !== ACCOUNT_A) {
        throw notFound('Compte de tiers introuvable ou inaccessible');
      }
      return sampleStatement();
    });

    const ownResponse = await request(app).get(`/api/tenants/${TENANT_A}/finance/accounts/${ACCOUNT_A}/statement`);
    const crossTenantResponse = await request(app).get(
      `/api/tenants/${TENANT_B}/finance/accounts/${ACCOUNT_A}/statement`
    );

    expect(ownResponse.status).toBe(200);
    expect(crossTenantResponse.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Portail locataire
// ---------------------------------------------------------------------------

describe('GET /portal/tenant/finance/statement', () => {
  it('renvoie le relevé du locataire connecté, résolu depuis sa session', async () => {
    thirdPartyAccountFindFirst.mockImplementation(async ({ where }: any) =>
      where.tenantId === 'tenant-A' && where.tenantClientId === 'client-1' ? { id: ACCOUNT_A } : null
    );
    getAccountStatement.mockResolvedValue(sampleStatement());

    const response = await request(app).get('/api/portal/tenant/finance/statement');

    expect(response.status).toBe(200);
    expect(response.body.data.accountId).toBe(ACCOUNT_A);
    expect(thirdPartyAccountFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-A', tenantClientId: 'client-1', kind: 'TENANT' } })
    );
    expect(getAccountStatement).toHaveBeenCalledWith('tenant-A', ACCOUNT_A, expect.anything());
  });

  it("ne renvoie jamais le compte d'un autre locataire, même si un identifiant est glissé en requête", async () => {
    thirdPartyAccountFindFirst.mockImplementation(async ({ where }: any) =>
      where.tenantId === 'tenant-A' && where.tenantClientId === 'client-1' ? { id: ACCOUNT_A } : null
    );
    getAccountStatement.mockResolvedValue(sampleStatement());

    // La route ne prend aucun paramètre de compte : un identifiant ajouté en
    // requête n'est lu par aucun code du contrôleur, il est simplement ignoré.
    const response = await request(app).get('/api/portal/tenant/finance/statement?accountId=compte-dun-autre');

    expect(response.status).toBe(200);
    expect(getAccountStatement).toHaveBeenCalledWith('tenant-A', ACCOUNT_A, expect.anything());
  });

  it('isole les locataires : un second locataire connecté voit son propre compte, jamais celui du premier', async () => {
    thirdPartyAccountFindFirst.mockImplementation(async ({ where }: any) => {
      if (where.tenantId === 'tenant-A' && where.tenantClientId === 'client-1') return { id: ACCOUNT_A };
      if (where.tenantId === 'tenant-A' && where.tenantClientId === 'client-2') return { id: 'compte-locataire-2' };
      return null;
    });
    getAccountStatement.mockImplementation(async (_tenantId: string, accountId: string) => ({
      ...sampleStatement(),
      accountId
    }));

    const firstLocataire = await request(app).get('/api/portal/tenant/finance/statement');

    portalContext = { tenantClientId: 'client-2', tenantId: 'tenant-A', leaseId: 'lease-2' };
    const secondLocataire = await request(app).get('/api/portal/tenant/finance/statement');

    expect(firstLocataire.body.data.accountId).toBe(ACCOUNT_A);
    expect(secondLocataire.body.data.accountId).toBe('compte-locataire-2');
  });

  it('renvoie 404 quand le locataire connecté ne porte encore aucun compte de tiers', async () => {
    thirdPartyAccountFindFirst.mockResolvedValue(null);

    const response = await request(app).get('/api/portal/tenant/finance/statement');

    expect(response.status).toBe(404);
    expect(getAccountStatement).not.toHaveBeenCalled();
  });

  it('rejette en 400 un intervalle de dates invalide', async () => {
    const response = await request(app).get(
      '/api/portal/tenant/finance/statement?periodStart=2026-09-30&periodEnd=2026-09-01'
    );

    expect(response.status).toBe(400);
    expect(thirdPartyAccountFindFirst).not.toHaveBeenCalled();
  });
});
