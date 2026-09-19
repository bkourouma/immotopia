import { Router } from 'express';

import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import {
  requireAccountsRead,
  requireDocumentsValidate,
  requireSettingsManage
} from '../middleware/finance-rbac-middleware';
import {
  capitalizeSiteLotHandler,
  closeSiteHandler,
  createSiteLotHandler,
  deleteSiteLotHandler,
  getSiteClosureBlockersHandler,
  getSiteCostBreakdownHandler,
  listSiteLotsHandler,
  reopenSiteHandler,
  setLotAllocationMethodHandler,
  updateSiteLotHandler
} from '../controllers/finance-site-closing-controller';

/**
 * Routes agence du module financier opérationnel — lot 4, sixième et dernier
 * sous-lot : lots, coût de revient par lot et clôture de chantier
 * (`lib/finance/types-lot4-closing.ts`, PRD E6, besoins P16 et P17).
 *
 * **Ce fichier ne se monte pas lui-même** : c'est le rôle de `src/index.ts`,
 * fichier-registre hors du territoire de cet agent, monté à l'intégration par
 * le superviseur. Modèle : `routes/finance-salaries-routes.ts` (sous-lot
 * précédent).
 *
 * **Gardes posés AVEC leur chemin**, jamais en `router.use(authenticate)` nu.
 * Un garde posé sans chemin sur un routeur monté sur `/api` tout entier
 * traverserait toute requête `/api/*`, y compris une route publique montée
 * après lui — l'incident du lot 1, documenté dans `finance-routes.ts`. Ici
 * comme là-bas, le garde ne s'applique qu'au préfixe que ce routeur sert
 * réellement : `/tenants/:tenantId/finance`.
 *
 * ---------------------------------------------------------------------------
 * Ordre de montage : les chemins littéraux avant les paramétrés
 * ---------------------------------------------------------------------------
 *
 * `/sites/:siteId/lot-allocation-method`, `/cost-breakdown`,
 * `/closure-blockers`, `/close` et `/reopen` sont posés AVANT
 * `/sites/:siteId/lots/...`. Aucun des cinq ne se confondrait avec `lots` —
 * Express compare le chemin entier, pas un préfixe — mais l'ordre reste écrit
 * dans ce sens pour qu'un segment paramétré ajouté plus tard sous `/sites/...`
 * ne vienne pas capter un littéral existant sans que personne ne le voie.
 *
 * ---------------------------------------------------------------------------
 * Trois permissions, et pourquoi celles-là
 * ---------------------------------------------------------------------------
 *
 * - `requireSettingsManage` pour tout ce qui DÉFINIT la répartition (créer,
 *   corriger, supprimer un lot, fixer la clé) : c'est du paramétrage, au même
 *   titre que le plan de comptes ou les postes de dépense.
 * - `requireAccountsRead` pour les trois lectures.
 * - `requireDocumentsValidate` pour la clôture, la réouverture et la bascule :
 *   ce sont des gestes irréversibles ou presque, qui figent un chiffre ou
 *   créent un bien. Droit de VALIDATION, jamais de création — même décision
 *   D7 qu'aux lots précédents : plusieurs saisisseurs, un validateur.
 *
 * Aucune permission neuve n'est introduite.
 */

const router = Router();

router.use('/tenants/:tenantId/finance', authenticate, requireTenantAccess);

// ---------------------------------------------------------------------------
// Chemins littéraux sous /sites/:siteId — posés en premier
// ---------------------------------------------------------------------------

// D. La clé de répartition du chantier.
router.put(
  '/tenants/:tenantId/finance/sites/:siteId/lot-allocation-method',
  requireSettingsManage,
  setLotAllocationMethodHandler
);

// F. Le coût de revient, vu du chantier.
router.get('/tenants/:tenantId/finance/sites/:siteId/cost-breakdown', requireAccountsRead, getSiteCostBreakdownHandler);

// G. Ce qui empêche de clôturer, listé AVANT d'essayer.
router.get(
  '/tenants/:tenantId/finance/sites/:siteId/closure-blockers',
  requireAccountsRead,
  getSiteClosureBlockersHandler
);

// H. La clôture : fige `finalCost`, et le chantier n'accepte plus rien.
router.post('/tenants/:tenantId/finance/sites/:siteId/close', requireDocumentsValidate, closeSiteHandler);

// I. La réouverture, refusée dès qu'un lot a basculé au patrimoine.
router.post('/tenants/:tenantId/finance/sites/:siteId/reopen', requireDocumentsValidate, reopenSiteHandler);

// ---------------------------------------------------------------------------
// Les lots
// ---------------------------------------------------------------------------

// J. La bascule au patrimoine — littéral `capitalize`, posé avant les deux
// routes qui s'arrêtent à `:lotId`.
router.post(
  '/tenants/:tenantId/finance/sites/:siteId/lots/:lotId/capitalize',
  requireDocumentsValidate,
  capitalizeSiteLotHandler
);

// E. Liste des lots d'un chantier.
router.get('/tenants/:tenantId/finance/sites/:siteId/lots', requireAccountsRead, listSiteLotsHandler);

// A. Ajout d'un lot.
router.post('/tenants/:tenantId/finance/sites/:siteId/lots', requireSettingsManage, createSiteLotHandler);

// B. Correction d'un lot.
router.patch('/tenants/:tenantId/finance/sites/:siteId/lots/:lotId', requireSettingsManage, updateSiteLotHandler);

// C. Suppression d'un lot.
router.delete('/tenants/:tenantId/finance/sites/:siteId/lots/:lotId', requireSettingsManage, deleteSiteLotHandler);

export default router;
