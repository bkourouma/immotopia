import express from 'express';
import request from 'supertest';

/**
 * Tests des points d'entrée agence de l'inventaire physique — lot 5, troisième
 * sous-lot. Les tests du transfert ont été déplacés dans
 * `finance.stock-transferts.test.ts` (lot 040, fondations).
 *
 * Modèle : `__tests__/api/finance.stock-mouvements.test.ts` (sous-lot 2). Les
 * middlewares d'authentification, de tenant et de droits sont remplacés par des
 * passe-plats ; le domaine (`lib/finance/stock-inventaire.ts`) est simulé par
 * des espions Jest, pour vérifier que le contrôleur transmet la bonne forme de
 * requête (tenantId de l'URL, aucun identifiant de chemin répété dans le corps,
 * utilisateur authentifié) sans reformuler la logique métier, déjà couverte par
 * les tests unitaires.
 *
 * **Le corps exact de chaque création est épinglé ici**, et c'est le but de ce
 * fichier : quatre créations des lots 2 et 3 échouaient en 400 contre le vrai
 * serveur parce que leur corps répétait un identifiant déjà porté par le
 * chemin, ou portait un champ dérivé. Les schémas sont `.strict()`, et ces
 * tests le prouvent de l'extérieur.
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

const createStockCountTx = jest.fn();
const setStockCountLineTx = jest.fn();
const removeStockCountLineTx = jest.fn();
const validateStockCountTx = jest.fn();
const listStockCounts = jest.fn();
const getStockCount = jest.fn();

jest.mock('../../src/lib/finance/stock-inventaire', () => ({
  createStockCountTx: (...args: any[]) => createStockCountTx(...args),
  setStockCountLineTx: (...args: any[]) => setStockCountLineTx(...args),
  removeStockCountLineTx: (...args: any[]) => removeStockCountLineTx(...args),
  validateStockCountTx: (...args: any[]) => validateStockCountTx(...args),
  listStockCounts: (...args: any[]) => listStockCounts(...args),
  getStockCount: (...args: any[]) => getStockCount(...args)
}));

jest.mock('../../src/utils/database', () => ({
  prisma: {
    $transaction: (callback: any) => callback({})
  }
}));

import { errorHandler } from '../../src/middleware/error-middleware';
import { conflict, notFound } from '../../src/lib/errors';
import financeStockInventaireRoutes from '../../src/routes/finance-stock-inventaire-routes';

const TENANT_A = 'tenant-A';
const LOCATION_A = '11111111-1111-4111-8111-111111111111';
const ITEM_A = '22222222-2222-4222-8222-222222222222';
const COUNT_A = '77777777-7777-4777-8777-777777777777';

const app = express();
app.use(express.json());
app.use('/api', financeStockInventaireRoutes);
app.use(errorHandler);

function countRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: COUNT_A,
    tenantId: TENANT_A,
    locationId: LOCATION_A,
    locationLabel: 'Magasin central',
    countedAt: new Date('2026-04-10'),
    status: 'DRAFT',
    lines: [
      {
        id: 'ligne-1',
        itemId: ITEM_A,
        itemReference: 'CIM-45',
        itemLabel: 'Ciment CPJ 45',
        itemUnit: 'sac',
        expectedQuantity: 100,
        countedQuantity: 92,
        variance: -8,
        reason: 'Casse au déchargement'
      }
    ],
    varianceCount: 1,
    varianceValue: -40_000,
    currency: 'XOF',
    createdByLabel: 'Aïssatou Barry',
    validatedAt: null,
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// B. POST /stock/counts
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/stock/counts', () => {
  const corpsValide = { locationId: LOCATION_A, countedAt: '2026-04-10' };

  it('ouvre un inventaire avec le corps exact attendu', async () => {
    createStockCountTx.mockResolvedValue(countRecord({ lines: [], varianceCount: 0, varianceValue: 0 }));

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/counts`).send(corpsValide);

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('DRAFT');
    expect(createStockCountTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, {
      locationId: LOCATION_A,
      countedAt: new Date('2026-04-10'),
      createdByUserId: 'user-1'
    });
  });

  it('refuse un corps qui porterait des lignes, un statut ou un tenantId', async () => {
    for (const champInterdit of [{ lines: [] }, { status: 'DRAFT' }, { tenantId: TENANT_A }]) {
      const res = await request(app)
        .post(`/api/tenants/${TENANT_A}/finance/stock/counts`)
        .send({ ...corpsValide, ...champInterdit });
      expect(res.status).toBe(400);
    }
    expect(createStockCountTx).not.toHaveBeenCalled();
  });

  it('laisse remonter le 409 du domaine sur un second inventaire en brouillon', async () => {
    createStockCountTx.mockRejectedValue(conflict('Un inventaire est déjà en cours sur ce lieu de stockage'));

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/counts`).send(corpsValide);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// C. PUT /stock/counts/:countId/lines
// ---------------------------------------------------------------------------

describe('PUT /tenants/:tenantId/finance/stock/counts/:countId/lines', () => {
  const corpsValide = { itemId: ITEM_A, countedQuantity: 92, reason: 'Casse au déchargement' };

  it('saisit une ligne avec le corps exact attendu, `countId` venant du CHEMIN', async () => {
    setStockCountLineTx.mockResolvedValue(countRecord());

    const res = await request(app)
      .put(`/api/tenants/${TENANT_A}/finance/stock/counts/${COUNT_A}/lines`)
      .send(corpsValide);

    expect(res.status).toBe(200);
    expect(res.body.data.lines[0].variance).toBe(-8);
    expect(setStockCountLineTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, COUNT_A, {
      itemId: ITEM_A,
      countedQuantity: 92,
      reason: 'Casse au déchargement'
    });
  });

  it('REFUSE un corps qui porterait `expectedQuantity` : elle est figée par le service, jamais saisie (P-4)', async () => {
    // La laisser saisir permettrait de fabriquer un écart nul — exactement ce
    // que le besoin S6 cherche à empêcher.
    for (const champDerive of [{ expectedQuantity: 92 }, { variance: 0 }, { varianceValue: 0 }]) {
      const res = await request(app)
        .put(`/api/tenants/${TENANT_A}/finance/stock/counts/${COUNT_A}/lines`)
        .send({ ...corpsValide, ...champDerive });
      expect(res.status).toBe(400);
    }
    expect(setStockCountLineTx).not.toHaveBeenCalled();
  });

  it('refuse un corps qui répète le `countId` déjà porté par le chemin', async () => {
    const res = await request(app)
      .put(`/api/tenants/${TENANT_A}/finance/stock/counts/${COUNT_A}/lines`)
      .send({ ...corpsValide, countId: COUNT_A });

    expect(res.status).toBe(400);
    expect(setStockCountLineTx).not.toHaveBeenCalled();
  });

  it('accepte une quantité comptée NULLE, et refuse une négative', async () => {
    setStockCountLineTx.mockResolvedValue(countRecord());

    const zero = await request(app)
      .put(`/api/tenants/${TENANT_A}/finance/stock/counts/${COUNT_A}/lines`)
      .send({ ...corpsValide, countedQuantity: 0 });
    expect(zero.status).toBe(200);

    const negative = await request(app)
      .put(`/api/tenants/${TENANT_A}/finance/stock/counts/${COUNT_A}/lines`)
      .send({ ...corpsValide, countedQuantity: -1 });
    expect(negative.status).toBe(400);
  });

  it('accepte une ligne sans motif — on compte d’abord, on explique ensuite', async () => {
    setStockCountLineTx.mockResolvedValue(countRecord());
    const { reason, ...sansMotif } = corpsValide;
    expect(reason).toBeDefined();

    const res = await request(app)
      .put(`/api/tenants/${TENANT_A}/finance/stock/counts/${COUNT_A}/lines`)
      .send(sansMotif);

    expect(res.status).toBe(200);
    expect(setStockCountLineTx.mock.calls[0][3].reason).toBeNull();
  });

  it('refuse un `countId` qui n’a pas la forme d’un identifiant', async () => {
    const res = await request(app)
      .put(`/api/tenants/${TENANT_A}/finance/stock/counts/pas-un-uuid/lines`)
      .send(corpsValide);

    expect(res.status).toBe(400);
    expect(setStockCountLineTx).not.toHaveBeenCalled();
  });

  it('laisse remonter le 409 du domaine sur un inventaire déjà validé', async () => {
    setStockCountLineTx.mockRejectedValue(conflict('Cet inventaire est déjà validé'));

    const res = await request(app)
      .put(`/api/tenants/${TENANT_A}/finance/stock/counts/${COUNT_A}/lines`)
      .send(corpsValide);

    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// D. DELETE /stock/counts/:countId/lines/:itemId
// ---------------------------------------------------------------------------

describe('DELETE /tenants/:tenantId/finance/stock/counts/:countId/lines/:itemId', () => {
  it('retire une ligne, les deux identifiants venant du CHEMIN', async () => {
    removeStockCountLineTx.mockResolvedValue(countRecord({ lines: [], varianceCount: 0, varianceValue: 0 }));

    const res = await request(app).delete(`/api/tenants/${TENANT_A}/finance/stock/counts/${COUNT_A}/lines/${ITEM_A}`);

    expect(res.status).toBe(200);
    expect(res.body.data.lines).toHaveLength(0);
    expect(removeStockCountLineTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, COUNT_A, ITEM_A);
  });

  it('refuse un identifiant de chemin mal formé', async () => {
    const res = await request(app).delete(`/api/tenants/${TENANT_A}/finance/stock/counts/${COUNT_A}/lines/pas-un-uuid`);

    expect(res.status).toBe(400);
    expect(removeStockCountLineTx).not.toHaveBeenCalled();
  });

  it('laisse remonter le 404 du domaine sur un article absent du comptage', async () => {
    removeStockCountLineTx.mockRejectedValue(notFound('Cet article ne figure pas dans cet inventaire'));

    const res = await request(app).delete(`/api/tenants/${TENANT_A}/finance/stock/counts/${COUNT_A}/lines/${ITEM_A}`);

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// E. POST /stock/counts/:countId/validate
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/stock/counts/:countId/validate', () => {
  it('valide l’inventaire, avec un corps VIDE', async () => {
    validateStockCountTx.mockResolvedValue(countRecord({ status: 'VALIDATED', validatedAt: new Date('2026-04-11') }));

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/counts/${COUNT_A}/validate`).send({});

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('VALIDATED');
    expect(validateStockCountTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, COUNT_A, 'user-1');
  });

  it('REFUSE tout corps : rien ne se décide au moment de valider', async () => {
    for (const corps of [{ countId: COUNT_A }, { reason: 'Casse' }, { status: 'VALIDATED' }]) {
      const res = await request(app)
        .post(`/api/tenants/${TENANT_A}/finance/stock/counts/${COUNT_A}/validate`)
        .send(corps);
      expect(res.status).toBe(400);
    }
    expect(validateStockCountTx).not.toHaveBeenCalled();
  });

  it('laisse remonter le 409 du domaine sur un écart sans motif (besoin S6)', async () => {
    validateStockCountTx.mockRejectedValue(conflict("L'écart constaté sur « Ciment CPJ 45 » n'a pas de motif"));

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/counts/${COUNT_A}/validate`).send({});

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('laisse remonter le 409 du domaine sur un comptage vide et sur un inventaire déjà validé', async () => {
    validateStockCountTx.mockRejectedValue(conflict('Cet inventaire ne porte aucune ligne'));
    const vide = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/counts/${COUNT_A}/validate`).send({});
    expect(vide.status).toBe(409);

    validateStockCountTx.mockRejectedValue(conflict('Cet inventaire est déjà validé'));
    const dejaValide = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/stock/counts/${COUNT_A}/validate`)
      .send({});
    expect(dejaValide.status).toBe(409);
  });

  it('ne renvoie AUCUN libellé comptable (principe P-1)', async () => {
    validateStockCountTx.mockResolvedValue(countRecord({ status: 'VALIDATED', validatedAt: new Date('2026-04-11') }));

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/counts/${COUNT_A}/validate`).send({});

    const charge = JSON.stringify(res.body).toLowerCase();
    expect(charge).not.toContain('débit');
    expect(charge).not.toContain('debit');
    expect(charge).not.toContain('crédit');
    expect(charge).not.toContain('credit');
    expect(charge).not.toContain('311');
    expect(charge).not.toContain('603');
  });
});

// ---------------------------------------------------------------------------
// F. GET /stock/counts
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/stock/counts', () => {
  it('liste les inventaires du tenant de l’URL', async () => {
    listStockCounts.mockResolvedValue([countRecord()]);

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/stock/counts`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(listStockCounts).toHaveBeenCalledWith(TENANT_A, { locationId: undefined, status: undefined });
  });

  it('transmet le lieu et le statut', async () => {
    listStockCounts.mockResolvedValue([]);

    await request(app).get(`/api/tenants/${TENANT_A}/finance/stock/counts?locationId=${LOCATION_A}&status=VALIDATED`);

    expect(listStockCounts).toHaveBeenCalledWith(TENANT_A, { locationId: LOCATION_A, status: 'VALIDATED' });
  });

  it('refuse un statut inconnu et un filtre inconnu, plutôt que de les ignorer en silence', async () => {
    const statut = await request(app).get(`/api/tenants/${TENANT_A}/finance/stock/counts?status=BROUILLON`);
    expect(statut.status).toBe(400);

    const filtre = await request(app).get(`/api/tenants/${TENANT_A}/finance/stock/counts?depot=Kaloum`);
    expect(filtre.status).toBe(400);

    expect(listStockCounts).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// G. GET /stock/counts/:countId
//
// Déclarée APRÈS `/stock/counts` dans le routeur : les chemins littéraux se
// montent avant les paramétrés. Ces deux tests prouvent que les deux routes
// sont bien joignables toutes les deux, ce qu'un mauvais ordre casserait.
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/stock/counts/:countId', () => {
  it('rend le détail d’un inventaire', async () => {
    getStockCount.mockResolvedValue(countRecord());

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/stock/counts/${COUNT_A}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(COUNT_A);
    expect(res.body.data.varianceValue).toBe(-40_000);
    expect(getStockCount).toHaveBeenCalledWith(TENANT_A, COUNT_A);
    // La liste n'a pas été capturée par le paramètre, et réciproquement.
    expect(listStockCounts).not.toHaveBeenCalled();
  });

  it('refuse un `countId` mal formé, et laisse remonter le 404 du domaine', async () => {
    const malForme = await request(app).get(`/api/tenants/${TENANT_A}/finance/stock/counts/pas-un-uuid`);
    expect(malForme.status).toBe(400);
    expect(getStockCount).not.toHaveBeenCalled();

    getStockCount.mockRejectedValue(notFound('Inventaire introuvable'));
    const introuvable = await request(app).get(`/api/tenants/${TENANT_A}/finance/stock/counts/${COUNT_A}`);
    expect(introuvable.status).toBe(404);
  });
});
