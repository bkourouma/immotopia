import express from 'express';
import request from 'supertest';

/**
 * Tests des cinq points d'entrée agence de la retenue de garantie — lot 4,
 * cinquième sous-lot.
 *
 * Modèle de mock : `__tests__/api/finance.salaries.test.ts` (sous-lot 3). Les
 * middlewares d'authentification, de tenant et de droits sont remplacés par des
 * passe-plats ; le domaine (`lib/finance/retentions.ts`) est simulé par des
 * espions Jest, pour vérifier que le contrôleur transmet la bonne forme de
 * requête (tenantId de l'URL, retentionId du CHEMIN et non du corps, corps
 * validé, utilisateur authentifié) sans reformuler la logique métier, déjà
 * couverte par les tests unitaires.
 *
 * ---------------------------------------------------------------------------
 * Deux choses que ce fichier épingle et qui ont déjà cassé ailleurs
 * ---------------------------------------------------------------------------
 *
 * 1. **Le corps exact de chaque création.** Quatre créations des lots 2 et 3
 *    échouaient en 400 contre le vrai serveur parce que leur corps répétait un
 *    identifiant que le chemin portait déjà. Les schémas sont `.strict()` : un
 *    champ en trop est un refus, pas un champ ignoré. Les tests ci-dessous
 *    envoient le corps EXACT attendu, puis prouvent qu'un champ de trop échoue.
 *
 * 2. **`/retentions/summary` n'est pas avalé par `/retentions/:retentionId`.**
 *    Le piège s'est produit au sous-lot 3 : Express prend la première route qui
 *    correspond, et `:retentionId` capturerait la chaîne `summary` s'il était
 *    déclaré au-dessus. Un test appelle `/summary` et exige que ce soit le
 *    résumé qui réponde, pas le détail.
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

const createRetentionTx = jest.fn();
const releaseRetentionTx = jest.fn();
const listRetentions = jest.fn();
const getRetention = jest.fn();
const getRetentionSummary = jest.fn();

jest.mock('../../src/lib/finance/retentions', () => ({
  createRetentionTx: (...args: any[]) => createRetentionTx(...args),
  releaseRetentionTx: (...args: any[]) => releaseRetentionTx(...args),
  listRetentions: (...args: any[]) => listRetentions(...args),
  getRetention: (...args: any[]) => getRetention(...args),
  getRetentionSummary: (...args: any[]) => getRetentionSummary(...args)
}));

jest.mock('../../src/utils/database', () => ({
  prisma: {
    $transaction: (callback: any) => callback({})
  }
}));

import { errorHandler } from '../../src/middleware/error-middleware';
import { conflict, notFound } from '../../src/lib/errors';
import financeRetentionsRoutes from '../../src/routes/finance-retentions-routes';

const TENANT_A = 'tenant-A';
const RETENTION_A = '11111111-1111-4111-8111-111111111111';
const INVOICE_A = '22222222-2222-4222-8222-222222222222';
const STATEMENT_A = '33333333-3333-4333-8333-333333333333';
const SITE_A = '44444444-4444-4444-8444-444444444444';
const ACCOUNT_A = '55555555-5555-4555-8555-555555555555';

const app = express();
app.use(express.json());
app.use('/api', financeRetentionsRoutes);
app.use(errorHandler);

function retentionRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: RETENTION_A,
    tenantId: TENANT_A,
    sourceType: 'SUPPLIER_INVOICE',
    sourceId: INVOICE_A,
    sourceLabel: 'Facture F-2026-014',
    thirdPartyLabel: 'Ciments de Guinée',
    thirdPartyAccountId: ACCOUNT_A,
    siteId: SITE_A,
    siteLabel: 'Résidence Kipé',
    baseAmount: 1_000_000,
    ratePercent: 5,
    amount: 50_000,
    currency: 'XOF',
    plannedReleaseDate: new Date('2027-03-10'),
    status: 'HELD',
    releasedAt: null,
    createdAt: new Date('2026-03-10'),
    ...overrides
  };
}

function summaryRecord(overrides: Record<string, unknown> = {}) {
  return {
    totalHeld: 150_000,
    totalReleased: 50_000,
    overdueHeld: 50_000,
    overdueCount: 1,
    currency: 'XOF',
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// A. POST /retentions
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/retentions', () => {
  /**
   * LE CORPS EXACT, épinglé. Quatre champs, pas un de plus : la nature de la
   * pièce, son identifiant, le taux, l'échéance prévue. Ni `tenantId` (il est
   * dans le chemin), ni `amount` (il est dérivé).
   */
  const CORPS_EXACT = {
    sourceType: 'SUPPLIER_INVOICE',
    sourceId: INVOICE_A,
    ratePercent: 5,
    plannedReleaseDate: '2027-03-10'
  };

  it('pose une retenue avec le corps exact attendu', async () => {
    createRetentionTx.mockResolvedValue(retentionRecord());

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/retentions`).send(CORPS_EXACT);

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(RETENTION_A);
    expect(createRetentionTx).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_A,
      expect.objectContaining({
        sourceType: 'SUPPLIER_INVOICE',
        sourceId: INVOICE_A,
        ratePercent: 5,
        createdByUserId: 'user-1'
      })
    );
    // La date est passée au domaine comme une VRAIE date, pas comme la chaîne
    // reçue : `z.coerce.date()` fait la conversion, le domaine n'a pas à la
    // refaire.
    expect(createRetentionTx.mock.calls[0][2].plannedReleaseDate).toBeInstanceOf(Date);
  });

  it('accepte aussi une situation d’avancement comme pièce source', async () => {
    createRetentionTx.mockResolvedValue(retentionRecord({ sourceType: 'PROGRESS_STATEMENT', sourceId: STATEMENT_A }));

    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/retentions`)
      .send({ ...CORPS_EXACT, sourceType: 'PROGRESS_STATEMENT', sourceId: STATEMENT_A });

    expect(res.status).toBe(201);
    expect(createRetentionTx.mock.calls[0][2].sourceType).toBe('PROGRESS_STATEMENT');
  });

  it('REFUSE un corps qui porte un montant (400) — le montant est dérivé, jamais saisi', async () => {
    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/retentions`)
      .send({ ...CORPS_EXACT, amount: 50_000 });

    expect(res.status).toBe(400);
    expect(createRetentionTx).not.toHaveBeenCalled();
  });

  it('REFUSE un corps qui répète le tenantId déjà porté par le chemin (400)', async () => {
    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/retentions`)
      .send({ ...CORPS_EXACT, tenantId: TENANT_A });

    expect(res.status).toBe(400);
    expect(createRetentionTx).not.toHaveBeenCalled();
  });

  it.each([
    ['sans date de libération prévue', { sourceType: 'SUPPLIER_INVOICE', sourceId: INVOICE_A, ratePercent: 5 }],
    ['avec un taux nul', { ...CORPS_EXACT, ratePercent: 0 }],
    ['avec un taux de cent pour cent', { ...CORPS_EXACT, ratePercent: 100 }],
    ['avec une nature de pièce inconnue', { ...CORPS_EXACT, sourceType: 'CASH_VOUCHER' }],
    ['avec un identifiant de pièce qui n’est pas un UUID', { ...CORPS_EXACT, sourceId: 'pas-un-uuid' }]
  ])('refuse un corps %s (400)', async (_libelle, corps) => {
    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/retentions`).send(corps);

    expect(res.status).toBe(400);
    expect(createRetentionTx).not.toHaveBeenCalled();
  });

  it('relaie le refus métier du domaine avec son statut, sans le deviner', async () => {
    createRetentionTx.mockRejectedValue(conflict('Une retenue de garantie a déjà été posée sur cette pièce'));

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/retentions`).send(CORPS_EXACT);

    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// B. POST /retentions/:retentionId/release
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/retentions/:retentionId/release', () => {
  it('libère avec un corps VIDE — le corps exact attendu', async () => {
    releaseRetentionTx.mockResolvedValue(retentionRecord({ status: 'RELEASED', releasedAt: new Date('2027-03-11') }));

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/retentions/${RETENTION_A}/release`).send({});

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('RELEASED');
    expect(releaseRetentionTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, RETENTION_A, 'user-1');
  });

  it('REFUSE un corps qui répète le retentionId déjà porté par le chemin (400)', async () => {
    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/retentions/${RETENTION_A}/release`)
      .send({ retentionId: RETENTION_A });

    expect(res.status).toBe(400);
    expect(releaseRetentionTx).not.toHaveBeenCalled();
  });

  it('REFUSE un corps qui porte un montant (400) — il n’y a pas de libération partielle', async () => {
    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/retentions/${RETENTION_A}/release`)
      .send({ amount: 20_000 });

    expect(res.status).toBe(400);
    expect(releaseRetentionTx).not.toHaveBeenCalled();
  });

  it('refuse un identifiant de chemin qui n’est pas un UUID (400)', async () => {
    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/retentions/pas-un-uuid/release`).send({});

    expect(res.status).toBe(400);
    expect(releaseRetentionTx).not.toHaveBeenCalled();
  });

  it('relaie un 409 quand la retenue est déjà libérée', async () => {
    releaseRetentionTx.mockRejectedValue(conflict('Cette retenue de garantie a déjà été libérée'));

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/retentions/${RETENTION_A}/release`).send({});

    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// C. GET /retentions
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/retentions', () => {
  it('liste les retenues du tenant de l’URL', async () => {
    listRetentions.mockResolvedValue([retentionRecord()]);

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/retentions`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(listRetentions).toHaveBeenCalledWith(TENANT_A, {
      status: undefined,
      siteId: undefined,
      thirdPartyAccountId: undefined,
      dueBefore: undefined
    });
  });

  it('transmet les quatre filtres de la query', async () => {
    listRetentions.mockResolvedValue([]);

    await request(app).get(
      `/api/tenants/${TENANT_A}/finance/retentions` +
        `?status=HELD&siteId=${SITE_A}&thirdPartyAccountId=${ACCOUNT_A}&dueBefore=2026-09-19`
    );

    const filtres = listRetentions.mock.calls[0][1];
    expect(filtres.status).toBe('HELD');
    expect(filtres.siteId).toBe(SITE_A);
    expect(filtres.thirdPartyAccountId).toBe(ACCOUNT_A);
    expect(filtres.dueBefore).toBeInstanceOf(Date);
  });

  it('refuse un filtre de statut inconnu (400)', async () => {
    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/retentions?status=PENDING`);

    expect(res.status).toBe(400);
    expect(listRetentions).not.toHaveBeenCalled();
  });

  it('refuse une query porteuse d’un filtre inconnu (400)', async () => {
    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/retentions?supplierId=${ACCOUNT_A}`);

    expect(res.status).toBe(400);
    expect(listRetentions).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// D. GET /retentions/summary — LE PIÈGE D'ORDRE DE MONTAGE
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/retentions/summary', () => {
  it('répond le RÉSUMÉ, et non le détail : `:retentionId` n’avale pas `summary`', async () => {
    getRetentionSummary.mockResolvedValue(summaryRecord());

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/retentions/summary`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(summaryRecord());
    expect(getRetentionSummary).toHaveBeenCalledWith(TENANT_A, { siteId: undefined });
    // La preuve que la route de détail n'a pas capturé la chaîne « summary ».
    expect(getRetention).not.toHaveBeenCalled();
  });

  it('se restreint à un chantier', async () => {
    getRetentionSummary.mockResolvedValue(summaryRecord({ totalHeld: 50_000 }));

    await request(app).get(`/api/tenants/${TENANT_A}/finance/retentions/summary?siteId=${SITE_A}`);

    expect(getRetentionSummary).toHaveBeenCalledWith(TENANT_A, { siteId: SITE_A });
  });

  it('refuse un filtre inconnu (400)', async () => {
    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/retentions/summary?status=HELD`);

    expect(res.status).toBe(400);
    expect(getRetentionSummary).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// E. GET /retentions/:retentionId
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/retentions/:retentionId', () => {
  it('renvoie le détail d’une retenue', async () => {
    getRetention.mockResolvedValue(retentionRecord());

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/retentions/${RETENTION_A}`);

    expect(res.status).toBe(200);
    expect(res.body.data.sourceLabel).toBe('Facture F-2026-014');
    expect(getRetention).toHaveBeenCalledWith(TENANT_A, RETENTION_A);
  });

  it('refuse un identifiant qui n’est pas un UUID (400)', async () => {
    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/retentions/pas-un-uuid`);

    expect(res.status).toBe(400);
    expect(getRetention).not.toHaveBeenCalled();
  });

  it('relaie un 404 du domaine', async () => {
    getRetention.mockRejectedValue(notFound('Retenue de garantie introuvable'));

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/retentions/${RETENTION_A}`);

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// F. Principe P-1 — rien de comptable ne sort par l'API
// ---------------------------------------------------------------------------

describe('principe P-1 — aucun libellé comptable dans les réponses', () => {
  it('ne renvoie ni « débit », ni « crédit », ni numéro de compte', async () => {
    getRetention.mockResolvedValue(retentionRecord());
    getRetentionSummary.mockResolvedValue(summaryRecord());

    const detail = await request(app).get(`/api/tenants/${TENANT_A}/finance/retentions/${RETENTION_A}`);
    const resume = await request(app).get(`/api/tenants/${TENANT_A}/finance/retentions/summary`);

    for (const corps of [JSON.stringify(detail.body), JSON.stringify(resume.body)]) {
      expect(corps.toLowerCase()).not.toContain('débit');
      expect(corps.toLowerCase()).not.toContain('crédit');
      expect(corps).not.toContain('4047');
    }
  });
});
