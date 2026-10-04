import express from 'express';
import request from 'supertest';

/**
 * Tests des dix points d'entrée agence des lots, du coût de revient et de la
 * clôture — lot 4, sixième et dernier sous-lot.
 *
 * Modèle de mock : `__tests__/api/finance.salaries.test.ts` (sous-lot
 * précédent). Les middlewares d'authentification, de tenant et de droits sont
 * remplacés par des passe-plats ; le domaine (`lib/finance/site-closing.ts`)
 * est simulé par des espions Jest, pour vérifier que le contrôleur transmet la
 * bonne forme de requête — `tenantId` de l'URL, `siteId` et `lotId` du CHEMIN
 * et jamais du corps, corps validé, utilisateur authentifié — sans reformuler
 * la logique métier, déjà couverte par les tests unitaires.
 *
 * ---------------------------------------------------------------------------
 * Le corps EXACT de chaque création est épinglé ici
 * ---------------------------------------------------------------------------
 *
 * Quatre créations du lot 3 échouaient en 400 contre le vrai serveur parce que
 * leur corps répétait un identifiant déjà porté par le chemin. Les deux
 * créations de ce sous-lot (`POST /sites/:siteId/lots` et
 * `POST /sites/:siteId/lots/:lotId/capitalize`) ont donc chacune un test qui
 * fige le corps accepté, champ pour champ, et un test qui prouve que le corps
 * fautif — celui qui répète `siteId` ou `lotId` — est refusé BRUYAMMENT en
 * 400, jamais amputé en silence.
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

const createSiteLotTx = jest.fn();
const updateSiteLotTx = jest.fn();
const deleteSiteLotTx = jest.fn();
const setLotAllocationMethodTx = jest.fn();
const listSiteLots = jest.fn();
const getSiteCostBreakdown = jest.fn();
const getSiteClosureBlockersForCaller = jest.fn();
const resolveStockCallerContext = jest.fn(async (userId: string) => ({ userId, canValidateCount: false }));
const closeSiteTx = jest.fn();
const reopenSiteTx = jest.fn();
const capitalizeSiteLotTx = jest.fn();

jest.mock('../../src/lib/finance/site-closing', () => ({
  createSiteLotTx: (...args: any[]) => createSiteLotTx(...args),
  updateSiteLotTx: (...args: any[]) => updateSiteLotTx(...args),
  deleteSiteLotTx: (...args: any[]) => deleteSiteLotTx(...args),
  setLotAllocationMethodTx: (...args: any[]) => setLotAllocationMethodTx(...args),
  listSiteLots: (...args: any[]) => listSiteLots(...args),
  getSiteCostBreakdown: (...args: any[]) => getSiteCostBreakdown(...args),
  getSiteClosureBlockersForCaller: (...args: any[]) => getSiteClosureBlockersForCaller(...args),
  closeSiteTx: (...args: any[]) => closeSiteTx(...args),
  reopenSiteTx: (...args: any[]) => reopenSiteTx(...args),
  capitalizeSiteLotTx: (...args: any[]) => capitalizeSiteLotTx(...args)
}));

// Lot 040 : le contexte de l'appelant décide du masquage des bloqueurs de stock (§8.2).
jest.mock('../../src/lib/finance/stock-controles', () => ({
  ...jest.requireActual('../../src/lib/finance/stock-controles'),
  resolveStockCallerContext: (...args: any[]) => (resolveStockCallerContext as any)(...args)
}));

jest.mock('../../src/utils/database', () => ({
  prisma: {
    $transaction: (callback: any) => callback({})
  }
}));

import { errorHandler } from '../../src/middleware/error-middleware';
import { badRequest, conflict, notFound } from '../../src/lib/errors';
import financeSiteClosingRoutes from '../../src/routes/finance-site-closing-routes';

const TENANT_A = 'tenant-A';
const SITE_A = '11111111-1111-4111-8111-111111111111';
const LOT_A = '22222222-2222-4222-8222-222222222222';
const PROPERTY_A = '33333333-3333-4333-8333-333333333333';

const app = express();
app.use(express.json());
app.use('/api', financeSiteClosingRoutes);
app.use(errorHandler);

const BASE = `/api/tenants/${TENANT_A}/finance/sites/${SITE_A}`;

function lotRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: LOT_A,
    siteId: SITE_A,
    name: 'Villa A',
    surfaceArea: 120,
    manualSharePercent: null,
    sharePercent: 33.33,
    costPrice: 333_334,
    currency: 'XOF',
    propertyId: null,
    propertyLabel: null,
    ...overrides
  };
}

function closureRecord(overrides: Record<string, unknown> = {}) {
  return {
    siteId: SITE_A,
    siteLabel: 'Résidence Kipé',
    closedAt: new Date('2026-07-01'),
    closedByLabel: 'Fatoumata Camara',
    finalCost: 1_000_000,
    currency: 'XOF',
    lots: [lotRecord()],
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ===========================================================================
// A. POST /sites/:siteId/lots
// ===========================================================================

describe('POST /tenants/:tenantId/finance/sites/:siteId/lots', () => {
  it('épingle le corps EXACT accepté à la création d’un lot', async () => {
    createSiteLotTx.mockResolvedValue(lotRecord());

    const res = await request(app).post(`${BASE}/lots`).send({
      name: 'Villa A',
      surfaceArea: 120,
      manualSharePercent: null
    });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe(LOT_A);
    // `siteId` vient du CHEMIN, jamais du corps.
    expect(createSiteLotTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, {
      siteId: SITE_A,
      name: 'Villa A',
      surfaceArea: 120,
      manualSharePercent: null
    });
  });

  it('accepte le corps minimal — le nom seul', async () => {
    createSiteLotTx.mockResolvedValue(lotRecord({ surfaceArea: null }));

    const res = await request(app).post(`${BASE}/lots`).send({ name: 'Villa A' });

    expect(res.status).toBe(201);
    expect(createSiteLotTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, {
      siteId: SITE_A,
      name: 'Villa A',
      surfaceArea: null,
      manualSharePercent: null
    });
  });

  it('REFUSE en 400 un corps qui répète `siteId`, déjà porté par le chemin', async () => {
    const res = await request(app).post(`${BASE}/lots`).send({ name: 'Villa A', siteId: SITE_A });

    expect(res.status).toBe(400);
    expect(createSiteLotTx).not.toHaveBeenCalled();
  });

  it('refuse un corps sans nom (400)', async () => {
    const res = await request(app).post(`${BASE}/lots`).send({ surfaceArea: 120 });

    expect(res.status).toBe(400);
    expect(createSiteLotTx).not.toHaveBeenCalled();
  });

  it('refuse une surface nulle ou négative (400)', async () => {
    const res = await request(app).post(`${BASE}/lots`).send({ name: 'Villa A', surfaceArea: 0 });

    expect(res.status).toBe(400);
  });

  it('refuse une quote-part supérieure à cent (400)', async () => {
    const res = await request(app).post(`${BASE}/lots`).send({ name: 'Villa A', manualSharePercent: 120 });

    expect(res.status).toBe(400);
  });

  it('rejette un siteId de chemin qui n’a pas la forme d’un UUID (400)', async () => {
    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/sites/pas-un-uuid/lots`)
      .send({ name: 'Villa A' });

    expect(res.status).toBe(400);
    expect(createSiteLotTx).not.toHaveBeenCalled();
  });

  it('relaie un 409 du domaine (nom déjà pris)', async () => {
    createSiteLotTx.mockRejectedValue(conflict('Un lot nommé « Villa A » existe déjà sur ce chantier'));

    const res = await request(app).post(`${BASE}/lots`).send({ name: 'Villa A' });

    expect(res.status).toBe(409);
  });
});

// ===========================================================================
// B. PATCH /sites/:siteId/lots/:lotId
// ===========================================================================

describe('PATCH /tenants/:tenantId/finance/sites/:siteId/lots/:lotId', () => {
  it('ne transmet QUE les champs présents dans le corps', async () => {
    updateSiteLotTx.mockResolvedValue(lotRecord({ name: 'Villa A1' }));

    const res = await request(app).patch(`${BASE}/lots/${LOT_A}`).send({ name: 'Villa A1' });

    expect(res.status).toBe(200);
    expect(updateSiteLotTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, LOT_A, { name: 'Villa A1' });
  });

  it('transmet `surfaceArea: null` quand l’appelant EFFACE explicitement la surface', async () => {
    updateSiteLotTx.mockResolvedValue(lotRecord({ surfaceArea: null }));

    await request(app).patch(`${BASE}/lots/${LOT_A}`).send({ surfaceArea: null });

    expect(updateSiteLotTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, LOT_A, { surfaceArea: null });
  });

  it('refuse un corps vide (400) : il ne veut rien dire', async () => {
    const res = await request(app).patch(`${BASE}/lots/${LOT_A}`).send({});

    expect(res.status).toBe(400);
    expect(updateSiteLotTx).not.toHaveBeenCalled();
  });

  it('REFUSE en 400 un corps qui répète `lotId`', async () => {
    const res = await request(app).patch(`${BASE}/lots/${LOT_A}`).send({ name: 'Villa A1', lotId: LOT_A });

    expect(res.status).toBe(400);
    expect(updateSiteLotTx).not.toHaveBeenCalled();
  });

  it('relaie un 409 quand le lot a basculé', async () => {
    updateSiteLotTx.mockRejectedValue(conflict('Ce lot a déjà basculé au patrimoine'));

    const res = await request(app).patch(`${BASE}/lots/${LOT_A}`).send({ name: 'Villa A1' });

    expect(res.status).toBe(409);
  });
});

// ===========================================================================
// C. DELETE /sites/:siteId/lots/:lotId
// ===========================================================================

describe('DELETE /tenants/:tenantId/finance/sites/:siteId/lots/:lotId', () => {
  it('supprime le lot du chemin', async () => {
    deleteSiteLotTx.mockResolvedValue(undefined);

    const res = await request(app).delete(`${BASE}/lots/${LOT_A}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: LOT_A });
    expect(deleteSiteLotTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, LOT_A);
  });

  it('relaie un 404 quand le lot est introuvable', async () => {
    deleteSiteLotTx.mockRejectedValue(notFound('Lot introuvable'));

    const res = await request(app).delete(`${BASE}/lots/${LOT_A}`);

    expect(res.status).toBe(404);
  });

  it('rejette un lotId qui n’a pas la forme d’un UUID (400)', async () => {
    const res = await request(app).delete(`${BASE}/lots/pas-un-uuid`);

    expect(res.status).toBe(400);
    expect(deleteSiteLotTx).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// D. PUT /sites/:siteId/lot-allocation-method
// ===========================================================================

describe('PUT /tenants/:tenantId/finance/sites/:siteId/lot-allocation-method', () => {
  it('épingle le corps EXACT : la clé, et rien d’autre', async () => {
    setLotAllocationMethodTx.mockResolvedValue([lotRecord()]);

    const res = await request(app).put(`${BASE}/lot-allocation-method`).send({ method: 'EQUAL' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(setLotAllocationMethodTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, SITE_A, 'EQUAL');
  });

  it('accepte les trois clés du contrat', async () => {
    setLotAllocationMethodTx.mockResolvedValue([]);

    for (const method of ['SURFACE', 'EQUAL', 'MANUAL']) {
      const res = await request(app).put(`${BASE}/lot-allocation-method`).send({ method });
      expect(res.status).toBe(200);
    }
    expect(setLotAllocationMethodTx).toHaveBeenCalledTimes(3);
  });

  it('refuse une clé inconnue (400), en listant les valeurs acceptées', async () => {
    const res = await request(app).put(`${BASE}/lot-allocation-method`).send({ method: 'AU_PIF' });

    expect(res.status).toBe(400);
    expect(setLotAllocationMethodTx).not.toHaveBeenCalled();
  });

  it('REFUSE en 400 un corps qui répète `siteId`', async () => {
    const res = await request(app).put(`${BASE}/lot-allocation-method`).send({ method: 'EQUAL', siteId: SITE_A });

    expect(res.status).toBe(400);
    expect(setLotAllocationMethodTx).not.toHaveBeenCalled();
  });

  it('relaie le 400 du domaine quand la clé ne s’applique pas aux lots existants', async () => {
    setLotAllocationMethodTx.mockRejectedValue(
      badRequest('Répartition par quotes-parts impossible : la somme des quotes-parts vaut 99.99 % au lieu de cent')
    );

    const res = await request(app).put(`${BASE}/lot-allocation-method`).send({ method: 'MANUAL' });

    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// E. GET /sites/:siteId/lots
// ===========================================================================

describe('GET /tenants/:tenantId/finance/sites/:siteId/lots', () => {
  it('liste les lots du chantier du chemin', async () => {
    listSiteLots.mockResolvedValue([lotRecord()]);

    const res = await request(app).get(`${BASE}/lots`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(listSiteLots).toHaveBeenCalledWith(TENANT_A, SITE_A);
  });

  it('relaie un 404 quand le chantier est introuvable', async () => {
    listSiteLots.mockRejectedValue(notFound('Chantier introuvable'));

    const res = await request(app).get(`${BASE}/lots`);

    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// F. GET /sites/:siteId/cost-breakdown
// ===========================================================================

describe('GET /tenants/:tenantId/finance/sites/:siteId/cost-breakdown', () => {
  it('rend la ventilation du coût de revient', async () => {
    getSiteCostBreakdown.mockResolvedValue({
      siteId: SITE_A,
      siteLabel: 'Résidence Kipé',
      isClosed: false,
      totalCost: 1_000_000,
      allocationMethod: 'EQUAL',
      lots: [lotRecord()],
      unallocatedCost: 0,
      currency: 'XOF'
    });

    const res = await request(app).get(`${BASE}/cost-breakdown`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ totalCost: 1_000_000, unallocatedCost: 0, allocationMethod: 'EQUAL' });
    expect(getSiteCostBreakdown).toHaveBeenCalledWith(TENANT_A, SITE_A);
  });

  it('n’est PAS capté par la route paramétrée des lots', async () => {
    getSiteCostBreakdown.mockResolvedValue({ siteId: SITE_A, lots: [] });

    await request(app).get(`${BASE}/cost-breakdown`);

    expect(getSiteCostBreakdown).toHaveBeenCalledTimes(1);
    expect(listSiteLots).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// G. GET /sites/:siteId/closure-blockers
// ===========================================================================

describe('GET /tenants/:tenantId/finance/sites/:siteId/closure-blockers', () => {
  it('rend 200 avec un tableau VIDE quand rien ne bloque — une absence n’est pas une erreur', async () => {
    getSiteClosureBlockersForCaller.mockResolvedValue([]);

    const res = await request(app).get(`${BASE}/closure-blockers`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    // Le contexte vient du jeton (user-1) et de l'agence de l'URL, jamais du corps.
    expect(resolveStockCallerContext).toHaveBeenCalledWith('user-1', TENANT_A);
    expect(getSiteClosureBlockersForCaller).toHaveBeenCalledWith(TENANT_A, SITE_A, {
      userId: 'user-1',
      canValidateCount: false
    });
  });

  it('rend les bloqueurs avec leur message et leur compte', async () => {
    getSiteClosureBlockersForCaller.mockResolvedValue([
      { message: '2 factures fournisseur en brouillon visent encore ce chantier…', count: 2 }
    ]);

    const res = await request(app).get(`${BASE}/closure-blockers`);

    expect(res.body.data[0]).toEqual({
      message: '2 factures fournisseur en brouillon visent encore ce chantier…',
      count: 2
    });
  });
});

// ===========================================================================
// H. POST /sites/:siteId/close
// ===========================================================================

describe('POST /tenants/:tenantId/finance/sites/:siteId/close', () => {
  it('clôture avec un corps VIDE : l’auteur vient du jeton, pas du corps', async () => {
    closeSiteTx.mockResolvedValue(closureRecord());

    const res = await request(app).post(`${BASE}/close`).send({});

    expect(res.status).toBe(200);
    expect(res.body.data.finalCost).toBe(1_000_000);
    expect(closeSiteTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, SITE_A, { closedByUserId: 'user-1' });
  });

  it('REFUSE en 400 un corps qui prétend désigner l’auteur de la clôture', async () => {
    const res = await request(app).post(`${BASE}/close`).send({ closedByUserId: 'user-usurpe' });

    expect(res.status).toBe(400);
    expect(closeSiteTx).not.toHaveBeenCalled();
  });

  it('relaie le 409 des bloqueurs, avec leur détail', async () => {
    const blockers = [{ message: 'Une facture fournisseur en brouillon vise encore ce chantier…', count: 1 }];
    closeSiteTx.mockRejectedValue(conflict(blockers[0].message, { blockers }));

    const res = await request(app).post(`${BASE}/close`).send({});

    expect(res.status).toBe(409);
  });

  it('n’emploie AUCUN libellé comptable dans la réponse (principe P-1)', async () => {
    closeSiteTx.mockResolvedValue(closureRecord());

    const res = await request(app).post(`${BASE}/close`).send({});

    expect(JSON.stringify(res.body).toLowerCase()).not.toMatch(/débit|crédit|"debit"|"credit"/);
  });
});

// ===========================================================================
// I. POST /sites/:siteId/reopen
// ===========================================================================

describe('POST /tenants/:tenantId/finance/sites/:siteId/reopen', () => {
  it('rouvre avec un corps vide', async () => {
    reopenSiteTx.mockResolvedValue(closureRecord());

    const res = await request(app).post(`${BASE}/reopen`).send({});

    expect(res.status).toBe(200);
    expect(reopenSiteTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, SITE_A);
  });

  it('relaie le 409 quand un lot a déjà basculé', async () => {
    reopenSiteTx.mockRejectedValue(conflict('Réouverture impossible : 1 lot(s) ont déjà basculé au patrimoine…'));

    const res = await request(app).post(`${BASE}/reopen`).send({});

    expect(res.status).toBe(409);
  });

  it('REFUSE en 400 un corps qui répète `siteId`', async () => {
    const res = await request(app).post(`${BASE}/reopen`).send({ siteId: SITE_A });

    expect(res.status).toBe(400);
    expect(reopenSiteTx).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// J. POST /sites/:siteId/lots/:lotId/capitalize
// ===========================================================================

const CORPS_BASCULE = {
  internalReference: 'REF-001',
  propertyType: 'MAISON_VILLA',
  ownershipType: 'TENANT',
  title: 'Villa A — Kipé',
  description: 'Villa de trois chambres issue du chantier de Kipé',
  address: 'Kipé, commune de Ratoma, Conakry',
  acquisitionDate: '2026-07-15'
};

describe('POST /tenants/:tenantId/finance/sites/:siteId/lots/:lotId/capitalize', () => {
  it('épingle le corps EXACT de la bascule — sept champs, aucun identifiant du chemin', async () => {
    capitalizeSiteLotTx.mockResolvedValue({
      lotId: LOT_A,
      lotName: 'Villa A',
      propertyId: PROPERTY_A,
      propertyInternalReference: 'REF-001',
      acquisitionCost: 333_334,
      acquisitionDate: new Date('2026-07-15'),
      currency: 'XOF'
    });

    const res = await request(app).post(`${BASE}/lots/${LOT_A}/capitalize`).send(CORPS_BASCULE);

    expect(res.status).toBe(201);
    expect(res.body.data.acquisitionCost).toBe(333_334);
    expect(capitalizeSiteLotTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, LOT_A, {
      internalReference: 'REF-001',
      propertyType: 'MAISON_VILLA',
      ownershipType: 'TENANT',
      title: 'Villa A — Kipé',
      description: 'Villa de trois chambres issue du chantier de Kipé',
      address: 'Kipé, commune de Ratoma, Conakry',
      acquisitionDate: new Date('2026-07-15')
    });
  });

  it('REFUSE en 400 un corps qui répète `lotId` ou `siteId`', async () => {
    const avecLot = await request(app)
      .post(`${BASE}/lots/${LOT_A}/capitalize`)
      .send({ ...CORPS_BASCULE, lotId: LOT_A });
    const avecSite = await request(app)
      .post(`${BASE}/lots/${LOT_A}/capitalize`)
      .send({ ...CORPS_BASCULE, siteId: SITE_A });

    expect(avecLot.status).toBe(400);
    expect(avecSite.status).toBe(400);
    expect(capitalizeSiteLotTx).not.toHaveBeenCalled();
  });

  it('REFUSE en 400 un corps qui prétend fixer lui-même la valeur d’acquisition', async () => {
    const res = await request(app)
      .post(`${BASE}/lots/${LOT_A}/capitalize`)
      .send({ ...CORPS_BASCULE, acquisitionCost: 1 });

    expect(res.status).toBe(400);
    expect(capitalizeSiteLotTx).not.toHaveBeenCalled();
  });

  it('refuse un type de bien hors de l’énumération Prisma (400)', async () => {
    const res = await request(app)
      .post(`${BASE}/lots/${LOT_A}/capitalize`)
      .send({ ...CORPS_BASCULE, propertyType: 'CHATEAU' });

    expect(res.status).toBe(400);
    expect(capitalizeSiteLotTx).not.toHaveBeenCalled();
  });

  it('refuse un mode de détention hors de l’énumération Prisma (400)', async () => {
    const res = await request(app)
      .post(`${BASE}/lots/${LOT_A}/capitalize`)
      .send({ ...CORPS_BASCULE, ownershipType: 'LOCATAIRE' });

    expect(res.status).toBe(400);
  });

  it('refuse un corps amputé d’un champ obligatoire (400)', async () => {
    const { address, ...sansAdresse } = CORPS_BASCULE;

    const res = await request(app).post(`${BASE}/lots/${LOT_A}/capitalize`).send(sansAdresse);

    expect(res.status).toBe(400);
    expect(capitalizeSiteLotTx).not.toHaveBeenCalled();
  });

  it('accepte une description vide — la colonne est non nulle, pas obligatoirement remplie', async () => {
    capitalizeSiteLotTx.mockResolvedValue({ lotId: LOT_A, propertyId: PROPERTY_A });

    const res = await request(app)
      .post(`${BASE}/lots/${LOT_A}/capitalize`)
      .send({ ...CORPS_BASCULE, description: '' });

    expect(res.status).toBe(201);
  });

  it('relaie le 409 d’un chantier encore ouvert', async () => {
    capitalizeSiteLotTx.mockRejectedValue(conflict("Ce chantier n'est pas clôturé"));

    const res = await request(app).post(`${BASE}/lots/${LOT_A}/capitalize`).send(CORPS_BASCULE);

    expect(res.status).toBe(409);
  });

  it('n’est PAS capté par la route PATCH paramétrée du lot', async () => {
    capitalizeSiteLotTx.mockResolvedValue({ lotId: LOT_A });

    await request(app).post(`${BASE}/lots/${LOT_A}/capitalize`).send(CORPS_BASCULE);

    expect(capitalizeSiteLotTx).toHaveBeenCalledTimes(1);
    expect(updateSiteLotTx).not.toHaveBeenCalled();
    expect(createSiteLotTx).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// K. Isolation multi-tenant — le tenant vient TOUJOURS de l'URL
// ===========================================================================

describe('isolation multi-tenant', () => {
  it('transmet le tenant de l’URL, pas celui d’un corps ou d’une query', async () => {
    listSiteLots.mockResolvedValue([]);

    await request(app).get(`/api/tenants/tenant-Z/finance/sites/${SITE_A}/lots?tenantId=tenant-pirate`);

    expect(listSiteLots).toHaveBeenCalledWith('tenant-Z', SITE_A);
  });

  it('refuse en 400 un corps de création qui porte un `tenantId`', async () => {
    const res = await request(app).post(`${BASE}/lots`).send({ name: 'Villa A', tenantId: 'tenant-pirate' });

    expect(res.status).toBe(400);
    expect(createSiteLotTx).not.toHaveBeenCalled();
  });
});
