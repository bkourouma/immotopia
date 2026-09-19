import { Router } from 'express';

import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { requireAccountsRead, requireSettingsManage } from '../middleware/finance-rbac-middleware';
import {
  enableSiteStockHandler,
  getSiteStockReconciliationHandler,
  getSiteStockStatusHandler
} from '../controllers/finance-stock-rapprochement-controller';

/**
 * Routes agence du module financier opérationnel — lot 5, quatrième et dernier
 * sous-lot : bascule d'un chantier au stock et rapprochement acheté /
 * consommé / restant (`lib/finance/types-lot5-rapprochement.ts`, PRD E9,
 * besoin S7).
 *
 * **Ce fichier ne se monte pas lui-même** : c'est le rôle de `src/index.ts`,
 * fichier-registre hors du territoire de cet agent, monté à l'intégration par
 * le superviseur. Modèle : `routes/finance-stock-mouvements-routes.ts`
 * (deuxième sous-lot).
 *
 * **Gardes posés AVEC leur chemin**, jamais en `router.use(authenticate)` nu.
 * Un garde posé sans chemin sur un routeur monté sur `/api` tout entier
 * traverserait toute requête `/api/*`, y compris une route publique montée
 * après lui — l'incident du lot 1, documenté dans `finance-routes.ts`. Ici
 * comme là-bas, le garde ne s'applique qu'au préfixe que ce routeur sert
 * réellement : `/tenants/:tenantId/finance`.
 *
 * ---------------------------------------------------------------------------
 * Deux permissions, et pourquoi celles-là
 * ---------------------------------------------------------------------------
 *
 * - `requireSettingsManage` pour la bascule : faire passer un chantier au
 *   stock change la façon dont TOUTES ses factures suivantes s'imputeront.
 *   C'est du paramétrage, au même titre que la clé de répartition des lots ou
 *   la méthode de valorisation — et c'est irréversible.
 * - `requireAccountsRead` pour les deux lectures.
 *
 * Aucune permission neuve n'est introduite.
 *
 * ---------------------------------------------------------------------------
 * AUCUNE route de retour en arrière, et ce n'est pas un oubli
 * ---------------------------------------------------------------------------
 *
 * Il n'y a ici ni `DELETE .../stock/enable`, ni `.../stock/disable`. Revenir
 * en arrière obligerait à rejouer l'imputation de toutes les factures
 * postérieures à la bascule et à défaire celle de toutes les sorties : le coût
 * du chantier changerait sous les pieds de celui qui le regarde. Le contrat
 * n'en offre aucune, et ce routeur non plus.
 *
 * ---------------------------------------------------------------------------
 * Ordre de montage
 * ---------------------------------------------------------------------------
 *
 * Les trois chemins se terminent par un segment LITTÉRAL (`enable`, `status`,
 * `reconciliation`) sous `/sites/:siteId/stock` : aucun ne peut en capter un
 * autre. Si une route `/sites/:siteId/stock/:something` s'ajoute un jour, elle
 * devra être déclarée APRÈS ces trois-là — c'est le piège d'ordre d'Express
 * qui s'est produit aux sous-lots 3 et 5 du lot 4.
 */

const router = Router();

router.use('/tenants/:tenantId/finance', authenticate, requireTenantAccess);

// A. La bascule au stock. Irréversible : à partir de cet instant, une facture
// de matériaux du chantier n'est plus une charge mais une entrée de stock, et
// c'est la SORTIE qui impute (principe P-7).
router.post('/tenants/:tenantId/finance/sites/:siteId/stock/enable', requireSettingsManage, enableSiteStockHandler);

// B. Où en est le chantier : basculé ou non, et où atterrissent ses réceptions.
router.get('/tenants/:tenantId/finance/sites/:siteId/stock/status', requireAccountsRead, getSiteStockStatusHandler);

// C. Le rapprochement acheté / consommé / restant, et l'écart entre ce qui a
// été facturé et ce qui est entré (besoin S7). Montré, jamais interprété.
router.get(
  '/tenants/:tenantId/finance/sites/:siteId/stock/reconciliation',
  requireAccountsRead,
  getSiteStockReconciliationHandler
);

export default router;
