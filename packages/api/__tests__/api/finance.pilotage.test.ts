import express from 'express';
import request from 'supertest';

/**
 * Tests des cinq points d'entrée « pilotage » du lot 3 : avancement
 * physique, alerte de dépassement, tableau de bord.
 *
 * Modèle de mock : `__tests__/api/finance.sites.test.ts` (lot 2). Les
 * middlewares d'authentification, de tenant et de droits sont remplacés par
 * des passe-plats ; le domaine (`lib/finance/site-progress.ts`,
 * `budget-alerts.ts`, `site-dashboard.ts`) est simulé pour vérifier que le
 * contrôleur transmet bien l'isolation, la validation et les erreurs typées,
 * plutôt que de les recréer.
 *
 * `guardCalls` prouve quelle garde est posée sur quelle route : les
 * passe-plats laissent toujours passer la requête, donc leur seul
 * comportement ne peut pas, à lui seul, démontrer que la bonne garde couvre
 * la bonne route (même remarque qu'au lot 2).
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
  requireReportsRead: (_req: any, _res: any, next: any) => {
    guardCalls.push('reportsRead');
    next();
  },
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

const recordSiteProgressTx = jest.fn();
const listSiteProgress = jest.fn();

jest.mock('../../src/lib/finance/site-progress', () => ({
  recordSiteProgressTx: (...args: any[]) => recordSiteProgressTx(...args),
  listSiteProgress: (...args: any[]) => listSiteProgress(...args)
}));

const acknowledgeBudgetAlertTx = jest.fn();
const listOpenBudgetAlerts = jest.fn();

jest.mock('../../src/lib/finance/budget-alerts', () => ({
  acknowledgeBudgetAlertTx: (...args: any[]) => acknowledgeBudgetAlertTx(...args),
  listOpenBudgetAlerts: (...args: any[]) => listOpenBudgetAlerts(...args)
}));

const getSitesDashboard = jest.fn();

jest.mock('../../src/lib/finance/site-dashboard', () => ({
  getSitesDashboard: (...args: any[]) => getSitesDashboard(...args)
}));

const transactionMock = jest.fn(async (callback: any) => callback({}));

jest.mock('../../src/utils/database', () => ({
  prisma: {
    $transaction: (callback: any) => transactionMock(callback)
  }
}));

import { errorHandler, ConflictError, NotFoundError } from '../../src/middleware/error-middleware';
import financePilotageRoutes from '../../src/routes/finance-pilotage-routes';

const TENANT_A = 'tenant-A';
const TENANT_B = 'tenant-B';
const SITE_A = '11111111-1111-4111-8111-111111111111';
const ALERT_A = '22222222-2222-4222-8222-222222222222';

const app = express();
app.use(express.json());
app.use('/api', financePilotageRoutes);
app.use(errorHandler);

function sampleProgressEntry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'progress-1',
    siteId: SITE_A,
    entryDate: new Date('2026-09-01'),
    percent: 45,
    note: 'Coulage de la dalle terminé',
    createdByUserId: 'user-1',
    createdByLabel: 'Fatoumata Diallo',
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    ...overrides
  };
}

function sampleAlert(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ALERT_A,
    siteId: SITE_A,
    siteLabel: 'Villa Kipé — extension',
    budgetId: 'budget-1',
    thresholdPercent: 80,
    engagedAmount: 95000,
    budgetAmount: 100000,
    consumedPercent: 95,
    raisedAt: new Date('2026-09-10'),
    acknowledgedAt: null,
    currency: 'XOF',
    ...overrides
  };
}

function sampleDashboardRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    siteId: SITE_A,
    siteLabel: 'Villa Kipé — extension',
    zone: 'Dixinn',
    status: 'IN_PROGRESS',
    initialBudget: 100000,
    revisedBudget: 120000,
    engagedAmount: 90000,
    actualCost: 70000,
    progressPercent: 55,
    variance: 30000,
    variancePercent: 25,
    openAlert: null,
    currency: 'XOF',
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  guardCalls = [];
});

// ---------------------------------------------------------------------------
// A. GET sites/:siteId/progress
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/sites/:siteId/progress', () => {
  it("renvoie l'historique d'avancement (cas nominal)", async () => {
    listSiteProgress.mockResolvedValue([sampleProgressEntry()]);

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/progress`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].percent).toBe(45);
    expect(response.body.data[0].createdByLabel).toBe('Fatoumata Diallo');
    expect(listSiteProgress).toHaveBeenCalledWith(TENANT_A, SITE_A);
    expect(guardCalls).toEqual(['accountsRead']);
  });

  it('rejette en 400 un identifiant de chantier malformé', async () => {
    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/sites/pas-un-uuid/progress`);

    expect(response.status).toBe(400);
    expect(listSiteProgress).not.toHaveBeenCalled();
  });

  it('renvoie 404 pour un chantier inexistant', async () => {
    listSiteProgress.mockRejectedValue(new NotFoundError('Chantier introuvable.'));

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/progress`);

    expect(response.status).toBe(404);
  });

  it("isole les tenants : le tenant B ne lit pas l'avancement d'un chantier du tenant A", async () => {
    listSiteProgress.mockImplementation(async (tenantId: string, siteId: string) => {
      if (tenantId !== TENANT_A || siteId !== SITE_A) {
        throw new NotFoundError('Chantier introuvable.');
      }
      return [sampleProgressEntry()];
    });

    const ownResponse = await request(app).get(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/progress`);
    const crossTenantResponse = await request(app).get(`/api/tenants/${TENANT_B}/finance/sites/${SITE_A}/progress`);

    expect(ownResponse.status).toBe(200);
    expect(crossTenantResponse.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// B. POST sites/:siteId/progress
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/sites/:siteId/progress', () => {
  const body = { entryDate: '2026-09-01', percent: 45, note: 'Coulage de la dalle terminé' };

  it("saisit un point d'avancement (cas nominal, 201)", async () => {
    recordSiteProgressTx.mockResolvedValue(sampleProgressEntry());

    const response = await request(app).post(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/progress`).send(body);

    expect(response.status).toBe(201);
    expect(response.body.data.percent).toBe(45);
    expect(recordSiteProgressTx).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_A,
      expect.objectContaining({
        siteId: SITE_A,
        percent: 45,
        note: 'Coulage de la dalle terminé',
        createdByUserId: 'user-1'
      })
    );
    expect(guardCalls).toEqual(['sitesManage']);
    expect(guardCalls).not.toContain('accountsRead');
  });

  it('rejette en 400 un corps sans percent', async () => {
    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/progress`)
      .send({ entryDate: '2026-09-01' });

    expect(response.status).toBe(400);
    expect(recordSiteProgressTx).not.toHaveBeenCalled();
  });

  it('rejette en 400 un pourcentage hors bornes (101)', async () => {
    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/progress`)
      .send({ ...body, percent: 101 });

    expect(response.status).toBe(400);
    expect(recordSiteProgressTx).not.toHaveBeenCalled();
  });

  it('rejette en 400 un pourcentage négatif', async () => {
    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/progress`)
      .send({ ...body, percent: -5 });

    expect(response.status).toBe(400);
    expect(recordSiteProgressTx).not.toHaveBeenCalled();
  });

  it('accepte un avancement qui recule : aucune borne ne compare à la saisie précédente', async () => {
    recordSiteProgressTx.mockResolvedValue(sampleProgressEntry({ percent: 10 }));

    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/progress`)
      .send({ ...body, percent: 10 });

    expect(response.status).toBe(201);
  });

  it('rejette en 400 un champ étranger au contrat (corps strict)', async () => {
    const response = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/progress`)
      .send({ ...body, progressPercent: 999 });

    expect(response.status).toBe(400);
    expect(recordSiteProgressTx).not.toHaveBeenCalled();
  });

  it('rejette en 400 un identifiant de chantier malformé', async () => {
    const response = await request(app).post(`/api/tenants/${TENANT_A}/finance/sites/pas-un-uuid/progress`).send(body);

    expect(response.status).toBe(400);
    expect(recordSiteProgressTx).not.toHaveBeenCalled();
  });

  it('renvoie 404 quand le chantier est inexistant', async () => {
    recordSiteProgressTx.mockRejectedValue(new NotFoundError('Chantier introuvable.'));

    const response = await request(app).post(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/progress`).send(body);

    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// C. GET budget-alerts
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/budget-alerts', () => {
  it('renvoie les alertes ouvertes (cas nominal)', async () => {
    listOpenBudgetAlerts.mockResolvedValue([sampleAlert()]);

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/budget-alerts`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].consumedPercent).toBe(95);
    expect(listOpenBudgetAlerts).toHaveBeenCalledWith(TENANT_A);
    expect(guardCalls).toEqual(['reportsRead']);
    expect(guardCalls).not.toContain('accountsRead');
  });

  it('aucune chaîne renvoyée ne contient « débit » ni « crédit »', async () => {
    listOpenBudgetAlerts.mockResolvedValue([sampleAlert()]);

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/budget-alerts`);

    const serialized = JSON.stringify(response.body).toLowerCase();
    expect(serialized).not.toMatch(/débit|debit|crédit|credit/);
  });
});

// ---------------------------------------------------------------------------
// D. POST budget-alerts/:alertId/acknowledge
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/budget-alerts/:alertId/acknowledge', () => {
  it('acquitte une alerte ouverte (cas nominal, 200)', async () => {
    acknowledgeBudgetAlertTx.mockResolvedValue(sampleAlert({ acknowledgedAt: new Date('2026-09-19') }));

    const response = await request(app).post(`/api/tenants/${TENANT_A}/finance/budget-alerts/${ALERT_A}/acknowledge`);

    expect(response.status).toBe(200);
    expect(response.body.data.acknowledgedAt).not.toBeNull();
    expect(acknowledgeBudgetAlertTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, ALERT_A, 'user-1');
    expect(guardCalls).toEqual(['documentsValidate']);
  });

  it('renvoie 409, pas 400, sur une seconde tentative (alerte déjà acquittée)', async () => {
    acknowledgeBudgetAlertTx.mockRejectedValue(new ConflictError('Cette alerte est déjà acquittée.'));

    const response = await request(app).post(`/api/tenants/${TENANT_A}/finance/budget-alerts/${ALERT_A}/acknowledge`);

    expect(response.status).toBe(409);
  });

  it('renvoie 404 pour une alerte introuvable', async () => {
    acknowledgeBudgetAlertTx.mockRejectedValue(new NotFoundError('Alerte de dépassement introuvable.'));

    const response = await request(app).post(`/api/tenants/${TENANT_A}/finance/budget-alerts/${ALERT_A}/acknowledge`);

    expect(response.status).toBe(404);
  });

  it('rejette en 400 un identifiant d’alerte malformé', async () => {
    const response = await request(app).post(`/api/tenants/${TENANT_A}/finance/budget-alerts/pas-un-uuid/acknowledge`);

    expect(response.status).toBe(400);
    expect(acknowledgeBudgetAlertTx).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// E. GET sites/dashboard
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/sites/dashboard', () => {
  it('renvoie le tableau de bord (cas nominal)', async () => {
    getSitesDashboard.mockResolvedValue({ rows: [sampleDashboardRow()], currency: 'XOF' });

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/sites/dashboard`);

    expect(response.status).toBe(200);
    // Le contrat (specs/018 openapi.yaml, SitesDashboardResponseWrapper) place
    // `rows` ET `currency` DANS `data`, jamais `currency` en frere de `data`.
    expect(response.body.data.rows).toHaveLength(1);
    expect(response.body.data.rows[0].revisedBudget).toBe(120000);
    expect(response.body.data.currency).toBe('XOF');
    expect(getSitesDashboard).toHaveBeenCalledWith(TENANT_A, { status: undefined, onlyOverBudget: undefined });
    expect(guardCalls).toEqual(['reportsRead']);
  });

  it('transmet les filtres status et onlyOverBudget', async () => {
    getSitesDashboard.mockResolvedValue({ rows: [], currency: 'XOF' });

    await request(app).get(`/api/tenants/${TENANT_A}/finance/sites/dashboard?status=CLOSED&onlyOverBudget=true`);

    expect(getSitesDashboard).toHaveBeenCalledWith(TENANT_A, { status: 'CLOSED', onlyOverBudget: true });
  });

  it('rejette en 400 un statut hors énumération', async () => {
    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/sites/dashboard?status=DEMOLISHED`);

    expect(response.status).toBe(400);
    expect(getSitesDashboard).not.toHaveBeenCalled();
  });

  it("inclut l'alerte ouverte d'un chantier dans sa ligne, quand il y en a une", async () => {
    getSitesDashboard.mockResolvedValue({ rows: [sampleDashboardRow({ openAlert: sampleAlert() })], currency: 'XOF' });

    const response = await request(app).get(`/api/tenants/${TENANT_A}/finance/sites/dashboard`);

    expect(response.body.data.rows[0].openAlert.id).toBe(ALERT_A);
  });
});
