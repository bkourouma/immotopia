import express from 'express';
import request from 'supertest';

/**
 * Tests des neuf points d'entrée agence du référentiel du stock — lot 5,
 * premier sous-lot.
 *
 * Modèle de mock : `__tests__/api/finance.salaries.test.ts` (lot 4). Les
 * middlewares d'authentification, de tenant et de droits sont remplacés par
 * des passe-plats ; le domaine (`lib/finance/stock-referentiel.ts`) est
 * simulé par des espions Jest, pour vérifier que le contrôleur transmet la
 * bonne forme de requête (tenantId de l'URL, itemId/locationId du CHEMIN et
 * non du corps, corps validé) sans reformuler la logique métier, déjà
 * couverte par les tests unitaires.
 *
 * Trois choses que ce fichier épingle et qu'aucun test unitaire ne peut
 * prouver :
 *   - LE CORPS EXACT DE CHAQUE CRÉATION : cinq occurrences d'un corps qui
 *     répétait un identifiant du chemin ont été trouvées dans ce projet ;
 *   - l'ordre de montage LITTÉRAL avant PARAMÉTRÉ (`/stock/items` et
 *     `/stock/settings` restent joignables malgré `/stock/items/:itemId`) ;
 *   - l'absence de toute route de suppression.
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

/**
 * Gardes doublées : refus (403) quand l'en-tête `x-deny` nomme leur
 * permission. Lot 040 (B1-R2, B1-R3) : la lecture passe sur STOCK_VIEW,
 * l'écriture reste sur FINANCE_SETTINGS_MANAGE.
 */
function guard(permission: string) {
  return (req: any, res: any, next: any) => {
    const denied = String(req.headers['x-deny'] ?? '').split(',');
    if (denied.includes(permission)) {
      res.status(403).json({ success: false, message: 'Permission refusée', code: 'FORBIDDEN' });
      return;
    }
    next();
  };
}

jest.mock('../../src/middleware/finance-rbac-middleware', () => ({
  requireAccountsRead: guard('FINANCE_ACCOUNTS_READ'),
  requireReportsRead: guard('FINANCE_REPORTS_READ'),
  requireDocumentsCreate: guard('FINANCE_DOCUMENTS_CREATE'),
  requireDocumentsValidate: guard('FINANCE_DOCUMENTS_VALIDATE'),
  requireSitesManage: guard('FINANCE_SITES_MANAGE'),
  requireSettingsManage: guard('FINANCE_SETTINGS_MANAGE')
}));

jest.mock('../../src/middleware/stock-rbac-middleware', () => ({
  requireStockView: guard('STOCK_VIEW')
}));

const logAuditEvent = jest.fn();
jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: (...args: any[]) => logAuditEvent(...args)
}));

/** Les changements que rend la doublure des écritures avec changements (lot 040). */
let itemChanges: Record<string, unknown> = {};
let locationChanges: Record<string, unknown> = {};

const createStockItemTx = jest.fn();
const updateStockItemTx = jest.fn();
const listStockItems = jest.fn();
const getStockItem = jest.fn();
const createStockLocationTx = jest.fn();
const updateStockLocationTx = jest.fn();
const listStockLocations = jest.fn();
const getStockSettings = jest.fn();
const setStockValuationMethodTx = jest.fn();

jest.mock('../../src/lib/finance/stock-referentiel', () => ({
  createStockItemTx: (...args: any[]) => createStockItemTx(...args),
  updateStockItemWithChangesTx: async (...args: any[]) => ({
    item: await updateStockItemTx(...args),
    changes: itemChanges
  }),
  listStockItems: (...args: any[]) => listStockItems(...args),
  getStockItem: (...args: any[]) => getStockItem(...args),
  createStockLocationTx: (...args: any[]) => createStockLocationTx(...args),
  updateStockLocationWithChangesTx: async (...args: any[]) => ({
    location: await updateStockLocationTx(...args),
    changes: locationChanges
  }),
  listStockLocationViews: (...args: any[]) => listStockLocations(...args),
  getStockSettings: (...args: any[]) => getStockSettings(...args),
  setStockValuationMethodTx: (...args: any[]) => setStockValuationMethodTx(...args)
}));

jest.mock('../../src/utils/database', () => ({
  prisma: {
    $transaction: (callback: any) => callback({})
  }
}));

import { errorHandler } from '../../src/middleware/error-middleware';
import { conflict, notFound } from '../../src/lib/errors';
import financeStockReferentielRoutes from '../../src/routes/finance-stock-referentiel-routes';

const TENANT_A = 'tenant-A';
const ITEM_A = '11111111-1111-4111-8111-111111111111';
const LOCATION_A = '22222222-2222-4222-8222-222222222222';
const SITE_A = '33333333-3333-4333-8333-333333333333';
const CATEGORY_A = '44444444-4444-4444-8444-444444444444';

const app = express();
app.use(express.json());
app.use('/api', financeStockReferentielRoutes);
app.use(errorHandler);

function itemRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ITEM_A,
    tenantId: TENANT_A,
    reference: 'CIM-42',
    label: 'Ciment CPJ 42.5',
    unit: 'sac',
    category: null,
    defaultCostCategoryId: null,
    defaultCostCategoryLabel: null,
    isActive: true,
    ...overrides
  };
}

function locationRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: LOCATION_A,
    tenantId: TENANT_A,
    kind: 'WAREHOUSE',
    label: 'Magasin central',
    siteId: null,
    siteLabel: null,
    isActive: true,
    ...overrides
  };
}

function settingsRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    tenantId: TENANT_A,
    valuationMethod: 'WEIGHTED_AVERAGE',
    decidedAt: new Date('2026-03-01T00:00:00.000Z'),
    decisionNote: null,
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  itemChanges = {};
  locationChanges = {};
});

// ---------------------------------------------------------------------------
// A. POST stock/items
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/stock/items', () => {
  it(
    'LE CORPS EXACT D’UNE CRÉATION D’ARTICLE : reference, label, unit, category, ' +
      'defaultCostCategoryId — et RIEN d’autre',
    async () => {
      createStockItemTx.mockResolvedValue(itemRecord());

      const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/stock/items`).send({
        reference: 'CIM-42',
        label: 'Ciment CPJ 42.5',
        unit: 'sac',
        category: 'Ciment',
        defaultCostCategoryId: CATEGORY_A
      });

      expect(res.status).toBe(201);
      expect(createStockItemTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, {
        reference: 'CIM-42',
        label: 'Ciment CPJ 42.5',
        unit: 'sac',
        category: 'Ciment',
        defaultCostCategoryId: CATEGORY_A
      });
    }
  );

  it('accepte le corps minimal : reference, label, unit', async () => {
    createStockItemTx.mockResolvedValue(itemRecord());

    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/stock/items`)
      .send({ reference: 'CIM-42', label: 'Ciment CPJ 42.5', unit: 'sac' });

    expect(res.status).toBe(201);
    expect(createStockItemTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, {
      reference: 'CIM-42',
      label: 'Ciment CPJ 42.5',
      unit: 'sac',
      category: null,
      defaultCostCategoryId: null
    });
  });

  it(
    'LE CORPS NE RÉPÈTE JAMAIS UN IDENTIFIANT QUE LE CHEMIN PORTE : un corps qui enverrait ' +
      'tenantId échoue en 400 (schéma strict)',
    async () => {
      const res = await request(app)
        .post(`/api/tenants/${TENANT_A}/finance/stock/items`)
        .send({ tenantId: TENANT_A, reference: 'CIM-42', label: 'Ciment', unit: 'sac' });

      expect(res.status).toBe(400);
      expect(createStockItemTx).not.toHaveBeenCalled();
    }
  );

  it('accepte n’importe quelle unité — texte libre, jamais une énumération', async () => {
    createStockItemTx.mockResolvedValue(itemRecord({ unit: 'fût' }));

    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/stock/items`)
      .send({ reference: 'GAZ-1', label: 'Gasoil', unit: 'fût' });

    expect(res.status).toBe(201);
    expect(createStockItemTx).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_A,
      expect.objectContaining({ unit: 'fût' })
    );
  });

  it('refuse un corps sans unité (400), sans toucher au domaine', async () => {
    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/stock/items`)
      .send({ reference: 'CIM-42', label: 'Ciment' });

    expect(res.status).toBe(400);
    expect(createStockItemTx).not.toHaveBeenCalled();
  });

  it('traduit un conflit du domaine en 409', async () => {
    createStockItemTx.mockRejectedValue(conflict('Un article porte déjà cette référence'));

    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/stock/items`)
      .send({ reference: 'CIM-42', label: 'Ciment', unit: 'sac' });

    expect(res.status).toBe(409);
    // Aucun libellé comptable à l'écran (principe P-1).
    expect(JSON.stringify(res.body)).not.toMatch(/d[ée]bit|cr[ée]dit/i);
  });
});

// ---------------------------------------------------------------------------
// B. PATCH stock/items/:itemId
// ---------------------------------------------------------------------------

describe('PATCH /tenants/:tenantId/finance/stock/items/:itemId', () => {
  it('corrige un article, itemId venant du CHEMIN', async () => {
    updateStockItemTx.mockResolvedValue(itemRecord({ label: 'Ciment CPJ 45' }));

    const res = await request(app)
      .patch(`/api/tenants/${TENANT_A}/finance/stock/items/${ITEM_A}`)
      .send({ label: 'Ciment CPJ 45' });

    expect(res.status).toBe(200);
    expect(updateStockItemTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, ITEM_A, { label: 'Ciment CPJ 45' });
  });

  it('ne transmet QUE les clés présentes : une correction du libellé n’efface pas la famille', async () => {
    updateStockItemTx.mockResolvedValue(itemRecord());

    await request(app).patch(`/api/tenants/${TENANT_A}/finance/stock/items/${ITEM_A}`).send({ label: 'Ciment' });

    const params = updateStockItemTx.mock.calls[0][3];
    expect(Object.keys(params)).toEqual(['label']);
    expect(params).not.toHaveProperty('category');
    expect(params).not.toHaveProperty('defaultCostCategoryId');
  });

  it('laisse passer la correction de l’unité — dangereuse, et pourtant permise', async () => {
    updateStockItemTx.mockResolvedValue(itemRecord({ unit: 'tonne' }));

    const res = await request(app)
      .patch(`/api/tenants/${TENANT_A}/finance/stock/items/${ITEM_A}`)
      .send({ unit: 'tonne' });

    expect(res.status).toBe(200);
    expect(updateStockItemTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, ITEM_A, { unit: 'tonne' });
  });

  it('refuse un corps qui corrigerait la référence (400, schéma strict)', async () => {
    const res = await request(app)
      .patch(`/api/tenants/${TENANT_A}/finance/stock/items/${ITEM_A}`)
      .send({ reference: 'CIM-45' });

    expect(res.status).toBe(400);
    expect(updateStockItemTx).not.toHaveBeenCalled();
  });

  it('refuse un corps qui répéterait itemId (400, schéma strict)', async () => {
    const res = await request(app)
      .patch(`/api/tenants/${TENANT_A}/finance/stock/items/${ITEM_A}`)
      .send({ itemId: ITEM_A, label: 'Ciment' });

    expect(res.status).toBe(400);
    expect(updateStockItemTx).not.toHaveBeenCalled();
  });

  it('refuse un corps vide (400) et un itemId qui n’a pas la forme d’un UUID (400)', async () => {
    const vide = await request(app).patch(`/api/tenants/${TENANT_A}/finance/stock/items/${ITEM_A}`).send({});
    expect(vide.status).toBe(400);

    const mauvaisId = await request(app)
      .patch(`/api/tenants/${TENANT_A}/finance/stock/items/pas-un-uuid`)
      .send({ label: 'Ciment' });
    expect(mauvaisId.status).toBe(400);

    expect(updateStockItemTx).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// C & D. GET stock/items, GET stock/items/:itemId
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/stock/items', () => {
  it(
    'LE CHEMIN LITTÉRAL RESTE JOIGNABLE malgré `items/:itemId` : la liste répond, ' +
      'et c’est `listStockItems` qui est appelé, pas `getStockItem`',
    async () => {
      listStockItems.mockResolvedValue([itemRecord()]);

      const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/stock/items`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(listStockItems).toHaveBeenCalledWith(TENANT_A, { onlyActive: undefined, search: undefined });
      expect(getStockItem).not.toHaveBeenCalled();
    }
  );

  it('transmet onlyActive et search depuis la query', async () => {
    listStockItems.mockResolvedValue([]);

    await request(app).get(`/api/tenants/${TENANT_A}/finance/stock/items?onlyActive=true&search=cim`);

    expect(listStockItems).toHaveBeenCalledWith(TENANT_A, { onlyActive: true, search: 'cim' });
  });

  it('ne transforme pas onlyActive=false en true', async () => {
    listStockItems.mockResolvedValue([]);

    await request(app).get(`/api/tenants/${TENANT_A}/finance/stock/items?onlyActive=false`);

    expect(listStockItems).toHaveBeenCalledWith(TENANT_A, { onlyActive: false, search: undefined });
  });
});

describe('GET /tenants/:tenantId/finance/stock/items/:itemId', () => {
  it('renvoie le détail d’un article', async () => {
    getStockItem.mockResolvedValue(itemRecord());

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/stock/items/${ITEM_A}`);

    expect(res.status).toBe(200);
    expect(getStockItem).toHaveBeenCalledWith(TENANT_A, ITEM_A);
  });

  it('traduit un article introuvable en 404', async () => {
    getStockItem.mockRejectedValue(notFound('Article introuvable'));

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/stock/items/${ITEM_A}`);

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// E. POST stock/locations
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/stock/locations', () => {
  it('LE CORPS EXACT D’UNE CRÉATION DE LIEU : kind, label, siteId — et rien d’autre', async () => {
    createStockLocationTx.mockResolvedValue(locationRecord());

    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/stock/locations`)
      .send({ kind: 'WAREHOUSE', label: 'Magasin central' });

    expect(res.status).toBe(201);
    expect(createStockLocationTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, {
      kind: 'WAREHOUSE',
      label: 'Magasin central',
      siteId: null
    });
  });

  it('transmet siteId pour un lieu de chantier', async () => {
    createStockLocationTx.mockResolvedValue(locationRecord({ kind: 'SITE', siteId: SITE_A, siteLabel: 'Villa Kipé' }));

    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/stock/locations`)
      .send({ kind: 'SITE', label: 'Dépôt Villa Kipé', siteId: SITE_A });

    expect(res.status).toBe(201);
    expect(createStockLocationTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, {
      kind: 'SITE',
      label: 'Dépôt Villa Kipé',
      siteId: SITE_A
    });
  });

  it('refuse kind=SITE sans siteId (400, sans toucher au domaine)', async () => {
    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/stock/locations`)
      .send({ kind: 'SITE', label: 'Dépôt sans chantier' });

    expect(res.status).toBe(400);
    expect(createStockLocationTx).not.toHaveBeenCalled();
  });

  it('REFUSE siteId quand kind ne vaut pas SITE — refusé, pas ignoré (400)', async () => {
    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/stock/locations`)
      .send({ kind: 'WAREHOUSE', label: 'Magasin central', siteId: SITE_A });

    expect(res.status).toBe(400);
    expect(createStockLocationTx).not.toHaveBeenCalled();
  });

  it('refuse une nature inconnue (400)', async () => {
    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/stock/locations`)
      .send({ kind: 'CAMION', label: 'Camion 1' });

    expect(res.status).toBe(400);
    expect(createStockLocationTx).not.toHaveBeenCalled();
  });

  it('traduit un second lieu pour le même chantier en 409', async () => {
    createStockLocationTx.mockRejectedValue(conflict('Ce chantier dispose déjà d’un lieu de stockage'));

    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/stock/locations`)
      .send({ kind: 'SITE', label: 'Dépôt B', siteId: SITE_A });

    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// F. PATCH stock/locations/:locationId
// ---------------------------------------------------------------------------

describe('PATCH /tenants/:tenantId/finance/stock/locations/:locationId', () => {
  it('corrige le libellé et l’activité, locationId venant du CHEMIN', async () => {
    updateStockLocationTx.mockResolvedValue(locationRecord({ label: 'Magasin Matoto', isActive: false }));

    const res = await request(app)
      .patch(`/api/tenants/${TENANT_A}/finance/stock/locations/${LOCATION_A}`)
      .send({ label: 'Magasin Matoto', isActive: false });

    expect(res.status).toBe(200);
    expect(updateStockLocationTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, LOCATION_A, {
      label: 'Magasin Matoto',
      isActive: false
    });
  });

  it('REFUSE un corps qui corrigerait la nature ou le chantier (400, schéma strict)', async () => {
    // « Un magasin qui deviendrait le lieu d'un chantier emporterait avec lui
    // un stock qui n'y a jamais été » — refusé bruyamment, jamais ignoré en
    // silence.
    const nature = await request(app)
      .patch(`/api/tenants/${TENANT_A}/finance/stock/locations/${LOCATION_A}`)
      .send({ kind: 'SITE' });
    expect(nature.status).toBe(400);

    const chantier = await request(app)
      .patch(`/api/tenants/${TENANT_A}/finance/stock/locations/${LOCATION_A}`)
      .send({ siteId: SITE_A });
    expect(chantier.status).toBe(400);

    expect(updateStockLocationTx).not.toHaveBeenCalled();
  });

  it('refuse un corps qui répéterait locationId, et un corps vide (400)', async () => {
    const repete = await request(app)
      .patch(`/api/tenants/${TENANT_A}/finance/stock/locations/${LOCATION_A}`)
      .send({ locationId: LOCATION_A, label: 'Magasin' });
    expect(repete.status).toBe(400);

    const vide = await request(app).patch(`/api/tenants/${TENANT_A}/finance/stock/locations/${LOCATION_A}`).send({});
    expect(vide.status).toBe(400);

    expect(updateStockLocationTx).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// G. GET stock/locations
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/stock/locations', () => {
  it('liste les lieux et transmet les filtres', async () => {
    listStockLocations.mockResolvedValue([locationRecord()]);

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/stock/locations?onlyActive=true&kind=SITE`);

    expect(res.status).toBe(200);
    expect(listStockLocations).toHaveBeenCalledWith(TENANT_A, { onlyActive: true, kind: 'SITE' });
  });

  it('refuse une nature de filtre inconnue (400)', async () => {
    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/stock/locations?kind=CAMION`);

    expect(res.status).toBe(400);
    expect(listStockLocations).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// H & I. GET/PUT stock/settings
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/stock/settings', () => {
  it('répond la méthode de valorisation, chemin littéral joignable', async () => {
    getStockSettings.mockResolvedValue(settingsRecord());

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/stock/settings`);

    expect(res.status).toBe(200);
    expect(res.body.data.valuationMethod).toBe('WEIGHTED_AVERAGE');
    expect(res.body.data.decisionNote).toBeNull();
    expect(getStockSettings).toHaveBeenCalledWith(TENANT_A);
  });
});

describe('PUT /tenants/:tenantId/finance/stock/settings', () => {
  it('LE CORPS EXACT DE LA DÉCISION : valuationMethod et decisionNote, rien d’autre', async () => {
    setStockValuationMethodTx.mockResolvedValue(settingsRecord({ decisionNote: 'Décision du conseil du 12 mars' }));

    const res = await request(app)
      .put(`/api/tenants/${TENANT_A}/finance/stock/settings`)
      .send({ valuationMethod: 'WEIGHTED_AVERAGE', decisionNote: 'Décision du conseil du 12 mars' });

    expect(res.status).toBe(200);
    expect(setStockValuationMethodTx).toHaveBeenCalledWith(expect.anything(), TENANT_A, {
      valuationMethod: 'WEIGHTED_AVERAGE',
      decisionNote: 'Décision du conseil du 12 mars'
    });
  });

  it('EXIGE le motif : absent ou blanc, la décision est refusée en 400', async () => {
    const absent = await request(app)
      .put(`/api/tenants/${TENANT_A}/finance/stock/settings`)
      .send({ valuationMethod: 'WEIGHTED_AVERAGE' });
    expect(absent.status).toBe(400);

    const blanc = await request(app)
      .put(`/api/tenants/${TENANT_A}/finance/stock/settings`)
      .send({ valuationMethod: 'WEIGHTED_AVERAGE', decisionNote: '   ' });
    expect(blanc.status).toBe(400);

    expect(setStockValuationMethodTx).not.toHaveBeenCalled();
  });

  it('refuse une méthode que le produit n’offre pas (400) — l’énumération n’a qu’une valeur', async () => {
    const res = await request(app)
      .put(`/api/tenants/${TENANT_A}/finance/stock/settings`)
      .send({ valuationMethod: 'FIFO', decisionNote: 'On passe au PEPS' });

    expect(res.status).toBe(400);
    expect(setStockValuationMethodTx).not.toHaveBeenCalled();
  });

  it('refuse un corps qui enverrait decidedAt : la date est posée par le serveur (400)', async () => {
    const res = await request(app).put(`/api/tenants/${TENANT_A}/finance/stock/settings`).send({
      valuationMethod: 'WEIGHTED_AVERAGE',
      decisionNote: 'Choix initial',
      decidedAt: '2020-01-01'
    });

    expect(res.status).toBe(400);
    expect(setStockValuationMethodTx).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// J. Désactiver n'est pas supprimer
// ---------------------------------------------------------------------------

describe('Aucune route ne supprime un article ni un lieu', () => {
  it('DELETE sur un article et sur un lieu n’est monté nulle part (404 du routeur)', async () => {
    // Leurs mouvements racontent où la matière est passée : on désactive avec
    // `isActive: false`, on n'efface jamais.
    const article = await request(app).delete(`/api/tenants/${TENANT_A}/finance/stock/items/${ITEM_A}`);
    const lieu = await request(app).delete(`/api/tenants/${TENANT_A}/finance/stock/locations/${LOCATION_A}`);

    expect(article.status).toBe(404);
    expect(lieu.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Lot 040 — gardes STOCK_VIEW en lecture, audit du référentiel, inventaire en cours
// ---------------------------------------------------------------------------

describe('Lot 040 — gardes du référentiel (B1-R2, B1-R3)', () => {
  it('les quatre lectures passent sur STOCK_VIEW, plus sur FINANCE_ACCOUNTS_READ', async () => {
    listStockItems.mockResolvedValue([]);
    getStockItem.mockResolvedValue(itemRecord());
    listStockLocations.mockResolvedValue([]);
    getStockSettings.mockResolvedValue(settingsRecord());
    const paths = [
      `/api/tenants/${TENANT_A}/finance/stock/items`,
      `/api/tenants/${TENANT_A}/finance/stock/items/${ITEM_A}`,
      `/api/tenants/${TENANT_A}/finance/stock/locations`,
      `/api/tenants/${TENANT_A}/finance/stock/settings`
    ];
    for (const path of paths) {
      expect((await request(app).get(path).set('x-deny', 'FINANCE_ACCOUNTS_READ')).status).toBe(200);
      expect((await request(app).get(path).set('x-deny', 'STOCK_VIEW')).status).toBe(403);
    }
  });

  it('les écritures restent sur FINANCE_SETTINGS_MANAGE', async () => {
    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/stock/items`)
      .set('x-deny', 'FINANCE_SETTINGS_MANAGE')
      .send({ reference: 'CIM-42', label: 'Ciment', unit: 'sac' });
    expect(res.status).toBe(403);
    expect(createStockItemTx).not.toHaveBeenCalled();
  });
});

describe('Lot 040 — audit du référentiel (B6-R1)', () => {
  it('STOCK_ITEM_CREATED après la création d’un article', async () => {
    createStockItemTx.mockResolvedValue(itemRecord());
    await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/stock/items`)
      .send({ reference: 'CIM-42', label: 'Ciment CPJ 42.5', unit: 'sac' });
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_A,
        actorUserId: 'user-1',
        actionKey: 'STOCK_ITEM_CREATED',
        entityType: 'StockItem',
        entityId: ITEM_A,
        payload: expect.objectContaining({ reference: 'CIM-42', unit: 'sac' })
      })
    );
  });

  it('STOCK_ITEM_UPDATED avec changes, dont l’unité ; rien si rien n’a changé', async () => {
    updateStockItemTx.mockResolvedValue(itemRecord({ unit: 'tonne' }));
    itemChanges = { unit: { before: 'sac', after: 'tonne' } };
    await request(app).patch(`/api/tenants/${TENANT_A}/finance/stock/items/${ITEM_A}`).send({ unit: 'tonne' });
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: 'STOCK_ITEM_UPDATED', changes: { unit: { before: 'sac', after: 'tonne' } } })
    );

    logAuditEvent.mockClear();
    itemChanges = {};
    await request(app).patch(`/api/tenants/${TENANT_A}/finance/stock/items/${ITEM_A}`).send({ unit: 'tonne' });
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('STOCK_LOCATION_CREATED et STOCK_LOCATION_UPDATED', async () => {
    createStockLocationTx.mockResolvedValue(locationRecord());
    await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/stock/locations`)
      .send({ kind: 'WAREHOUSE', label: 'Magasin central' });
    expect(logAuditEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        actionKey: 'STOCK_LOCATION_CREATED',
        entityType: 'StockLocation',
        entityId: LOCATION_A
      })
    );

    updateStockLocationTx.mockResolvedValue(locationRecord({ isActive: false }));
    locationChanges = { isActive: { before: true, after: false } };
    await request(app)
      .patch(`/api/tenants/${TENANT_A}/finance/stock/locations/${LOCATION_A}`)
      .send({ isActive: false });
    expect(logAuditEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ actionKey: 'STOCK_LOCATION_UPDATED', changes: locationChanges })
    );
  });

  it('relaie 409 STOCK_COUNT_IN_PROGRESS à la désactivation d’un lieu en inventaire, sans audit', async () => {
    const { AppError } = jest.requireActual('../../src/middleware/error-middleware');
    updateStockLocationTx.mockRejectedValue(
      new AppError('Inventaire en cours.', 409, 'STOCK_COUNT_IN_PROGRESS', undefined, { countId: 'inv-1' })
    );
    const res = await request(app)
      .patch(`/api/tenants/${TENANT_A}/finance/stock/locations/${LOCATION_A}`)
      .send({ isActive: false });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STOCK_COUNT_IN_PROGRESS');
    expect(logAuditEvent).not.toHaveBeenCalled();
  });
});
