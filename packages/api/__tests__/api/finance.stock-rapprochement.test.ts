import express from 'express';
import request from 'supertest';

/**
 * Tests des trois points d'entrée agence de la bascule au stock et du
 * rapprochement — lot 5, quatrième et dernier sous-lot.
 *
 * Modèle : `__tests__/api/finance.stock-mouvements.test.ts` (deuxième
 * sous-lot). Les middlewares d'authentification, de tenant et de droits sont
 * remplacés par des passe-plats ; le domaine
 * (`lib/finance/stock-rapprochement.ts`) est simulé par des espions Jest, pour
 * vérifier que le contrôleur transmet la bonne forme de requête (tenantId et
 * siteId du chemin, aucun identifiant répété dans le corps) sans reformuler la
 * logique métier, déjà couverte par les tests unitaires.
 *
 * **Le corps exact de la bascule est épinglé ici**, et c'est le but de ce
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

const enableStockOnSiteTx = jest.fn();
const getSiteStockStatus = jest.fn();
const getSiteStockReconciliation = jest.fn();

jest.mock('../../src/lib/finance/stock-rapprochement', () => ({
  enableStockOnSiteTx: (...args: any[]) => enableStockOnSiteTx(...args),
  getSiteStockStatus: (...args: any[]) => getSiteStockStatus(...args),
  getSiteStockReconciliation: (...args: any[]) => getSiteStockReconciliation(...args)
}));

jest.mock('../../src/utils/database', () => ({
  prisma: {
    $transaction: (callback: any) => callback({})
  }
}));

import { errorHandler } from '../../src/middleware/error-middleware';
import { conflict, notFound } from '../../src/lib/errors';
import financeStockRapprochementRoutes from '../../src/routes/finance-stock-rapprochement-routes';

const TENANT_A = 'tenant-A';
const SITE_A = '44444444-4444-4444-8444-444444444444';
const LOCATION_A = '11111111-1111-4111-8111-111111111111';
const ITEM_A = '22222222-2222-4222-8222-222222222222';

const app = express();
app.use(express.json());
app.use('/api', financeStockRapprochementRoutes);
app.use(errorHandler);

function statusRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    siteId: SITE_A,
    siteLabel: 'Résidence Kipé',
    stockEnabledAt: new Date('2026-03-15'),
    stockLocationId: LOCATION_A,
    stockLocationLabel: 'Chantier Résidence Kipé',
    ...overrides
  };
}

function reconciliationRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    siteId: SITE_A,
    siteLabel: 'Résidence Kipé',
    stockEnabledAt: new Date('2026-03-15'),
    invoicedAmount: 1_000_000,
    receivedValue: 900_000,
    unreconciledAmount: 100_000,
    issuedValue: 400_000,
    remainingValue: 500_000,
    currency: 'XOF',
    lines: [
      {
        itemId: ITEM_A,
        itemReference: 'CIM-45',
        itemLabel: 'Ciment CPJ 45',
        itemUnit: 'sac',
        receivedQuantity: 90,
        issuedQuantity: 40,
        remainingQuantity: 50,
        issuedValue: 400_000,
        remainingValue: 500_000,
        currency: 'XOF'
      }
    ],
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// A. POST /sites/:siteId/stock/enable
// ---------------------------------------------------------------------------

describe('POST /tenants/:tenantId/finance/sites/:siteId/stock/enable', () => {
  it('bascule le chantier avec le CORPS EXACT attendu : un corps vide', async () => {
    enableStockOnSiteTx.mockResolvedValue(statusRecord());

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/stock/enable`).send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.stockLocationId).toBe(LOCATION_A);

    expect(enableStockOnSiteTx).toHaveBeenCalledTimes(1);
    const [, tenantId, siteId, params] = enableStockOnSiteTx.mock.calls[0];
    expect(tenantId).toBe(TENANT_A);
    expect(siteId).toBe(SITE_A);
    // La date vient du contrôleur — l'instant de la décision —, jamais du corps.
    expect(Object.keys(params)).toEqual(['enabledAt']);
    expect(params.enabledAt).toBeInstanceOf(Date);
  });

  it('accepte une requête sans corps du tout', async () => {
    enableStockOnSiteTx.mockResolvedValue(statusRecord());

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/stock/enable`);

    expect(res.status).toBe(200);
    expect(enableStockOnSiteTx).toHaveBeenCalledTimes(1);
  });

  it('REFUSE un corps qui porterait une date de bascule — on n’antidate pas', async () => {
    const res = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/stock/enable`)
      .send({ enabledAt: '2026-01-01' });

    // Antidater reclasserait après coup des factures déjà imputées.
    expect(res.status).toBe(400);
    expect(enableStockOnSiteTx).not.toHaveBeenCalled();
  });

  it('refuse un corps qui répète un identifiant déjà porté par le chemin', async () => {
    for (const corps of [{ tenantId: TENANT_A }, { siteId: SITE_A }, { tenantId: TENANT_A, siteId: SITE_A }]) {
      const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/stock/enable`).send(corps);
      expect(res.status).toBe(400);
    }
    expect(enableStockOnSiteTx).not.toHaveBeenCalled();
  });

  it('refuse un identifiant de chantier qui n’a pas la forme d’un UUID', async () => {
    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/sites/pas-un-uuid/stock/enable`).send({});

    expect(res.status).toBe(400);
    expect(enableStockOnSiteTx).not.toHaveBeenCalled();
  });

  it('laisse remonter le 409 du domaine sur un chantier déjà basculé', async () => {
    enableStockOnSiteTx.mockRejectedValue(conflict('Le chantier « Kipé » est déjà passé au stock'));

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/stock/enable`).send({});

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('laisse remonter le 409 du domaine sur un chantier clos', async () => {
    enableStockOnSiteTx.mockRejectedValue(conflict('Le chantier « Kaloum » est clôturé'));

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/stock/enable`).send({});

    expect(res.status).toBe(409);
  });

  it('laisse remonter le 404 du domaine sur un chantier introuvable', async () => {
    enableStockOnSiteTx.mockRejectedValue(notFound('Chantier introuvable'));

    const res = await request(app).post(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/stock/enable`).send({});

    expect(res.status).toBe(404);
  });

  it('n’offre AUCUNE route de retour en arrière', async () => {
    // Le contrat n'en propose aucune : revenir en arrière ferait changer le
    // coût du chantier sous les pieds de celui qui le regarde.
    const suppression = await request(app).delete(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/stock/enable`);
    expect(suppression.status).toBe(404);

    const desactivation = await request(app)
      .post(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/stock/disable`)
      .send({});
    expect(desactivation.status).toBe(404);

    expect(enableStockOnSiteTx).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// B. GET /sites/:siteId/stock/status
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/sites/:siteId/stock/status', () => {
  it('rend l’état de bascule du chantier du chemin', async () => {
    getSiteStockStatus.mockResolvedValue(statusRecord());

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/stock/status`);

    expect(res.status).toBe(200);
    expect(res.body.data.siteId).toBe(SITE_A);
    expect(getSiteStockStatus).toHaveBeenCalledWith(TENANT_A, SITE_A);
  });

  it('rend une date nulle sur un chantier qui n’a pas basculé', async () => {
    getSiteStockStatus.mockResolvedValue(
      statusRecord({ stockEnabledAt: null, stockLocationId: null, stockLocationLabel: null })
    );

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/stock/status`);

    expect(res.status).toBe(200);
    expect(res.body.data.stockEnabledAt).toBeNull();
  });

  it('refuse un filtre inconnu plutôt que de l’ignorer en silence', async () => {
    const res = await request(app).get(
      `/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/stock/status?depuis=2026-01-01`
    );

    expect(res.status).toBe(400);
    expect(getSiteStockStatus).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// C. GET /sites/:siteId/stock/reconciliation
// ---------------------------------------------------------------------------

describe('GET /tenants/:tenantId/finance/sites/:siteId/stock/reconciliation', () => {
  it('rend le rapprochement, écart compris', async () => {
    getSiteStockReconciliation.mockResolvedValue(reconciliationRecord());

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/stock/reconciliation`);

    expect(res.status).toBe(200);
    expect(res.body.data.invoicedAmount).toBe(1_000_000);
    expect(res.body.data.receivedValue).toBe(900_000);
    expect(res.body.data.unreconciledAmount).toBe(100_000);
    expect(res.body.data.lines).toHaveLength(1);
    expect(getSiteStockReconciliation).toHaveBeenCalledWith(TENANT_A, SITE_A);
  });

  it('répond 200 sur un chantier non basculé, et laisse passer le consommé sans le raboter', async () => {
    // Seuls `invoicedAmount` et `unreconciledAmount` dépendent de la bascule.
    // Le consommé existe et le contrôleur ne doit rien en retrancher : il
    // transmet ce que le domaine a calculé, sans le relire ni le corriger.
    getSiteStockReconciliation.mockResolvedValue(
      reconciliationRecord({
        stockEnabledAt: null,
        invoicedAmount: 0,
        unreconciledAmount: 0
      })
    );

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/stock/reconciliation`);

    expect(res.status).toBe(200);
    expect(res.body.data.stockEnabledAt).toBeNull();
    expect(res.body.data.invoicedAmount).toBe(0);
    expect(res.body.data.unreconciledAmount).toBe(0);
    expect(res.body.data.issuedValue).toBe(400_000);
    expect(res.body.data.lines[0].issuedQuantity).toBe(40);
  });

  it('ne renvoie AUCUN libellé comptable, et NE QUALIFIE JAMAIS l’écart', async () => {
    getSiteStockReconciliation.mockResolvedValue(reconciliationRecord());

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/stock/reconciliation`);

    const charge = JSON.stringify(res.body).toLowerCase();
    // Principe P-1 : aucun mot de comptable ne sort du module.
    for (const mot of ['débit', 'debit', 'crédit', 'credit', '311']) {
      expect(charge).not.toContain(mot);
    }
    // Et aucune interprétation : un vol et des frais de transport se
    // ressemblent dans une soustraction.
    for (const mot of ['perte', 'anomalie', 'manquant', 'fraude']) {
      expect(charge).not.toContain(mot);
    }
  });

  it('laisse remonter le 404 du domaine sur un chantier introuvable', async () => {
    getSiteStockReconciliation.mockRejectedValue(notFound('Chantier introuvable'));

    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/sites/${SITE_A}/stock/reconciliation`);

    expect(res.status).toBe(404);
  });

  it('refuse un identifiant de chantier qui n’a pas la forme d’un UUID', async () => {
    const res = await request(app).get(`/api/tenants/${TENANT_A}/finance/sites/pas-un-uuid/stock/reconciliation`);

    expect(res.status).toBe(400);
    expect(getSiteStockReconciliation).not.toHaveBeenCalled();
  });
});
