import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import {
  requireAccountsRead,
  requireDocumentsValidate,
  requireReportsRead,
  requireSitesManage
} from '../middleware/finance-rbac-middleware';
import {
  acknowledgeBudgetAlertHandler,
  getSitesDashboardHandler,
  listOpenBudgetAlertsHandler,
  listSiteProgressHandler,
  recordSiteProgressHandler
} from '../controllers/finance-pilotage-controller';

/**
 * Routes « pilotage » du lot 3 : avancement physique, alerte de dépassement,
 * tableau de bord (`specs/018-finance-budget-pilotage/data-model.md` §5).
 *
 * **Ce fichier ne se monte pas lui-même** : c'est le rôle de `src/index.ts`,
 * hors du territoire de cet agent (fichier-registre monté à l'intégration).
 * Modèle : `routes/finance-sites-routes.ts` (lot 2).
 *
 * Aucune permission neuve : les cinq routes réutilisent les droits des lots 1
 * et 2 (`finance-rbac-middleware.ts`), comme le veut le contrat.
 *
 * **Attention à l'ordre de montage** (hors du territoire de cet agent, signalé
 * ici pour l'intégrateur) : `GET /sites/dashboard` a la même forme que
 * `GET /sites/:siteId` posée par `finance-sites-routes.ts` (lot 2). Si ce
 * dernier routeur est monté avant celui-ci, une requête sur
 * `/sites/dashboard` risque d'être happée par la route à paramètre du lot 2
 * (`siteId = "dashboard"`, rejetée en 400 par sa propre validation UUID)
 * avant d'atteindre la route de ce fichier. Voir le rapport de fin de tâche.
 */

const router = Router();

/**
 * Gardes limités au préfixe que ce routeur sert réellement, posés avec leur
 * chemin plutôt qu'en `router.use(authenticate)` nu — le défaut corrigé au
 * lot 2 (voir l'en-tête de `finance-sites-routes.ts`).
 */
router.use('/tenants/:tenantId/finance', authenticate, requireTenantAccess);

// ---------------------------------------------------------------------------
// Avancement physique
// ---------------------------------------------------------------------------

router.get('/tenants/:tenantId/finance/sites/:siteId/progress', requireAccountsRead, listSiteProgressHandler);

router.post('/tenants/:tenantId/finance/sites/:siteId/progress', requireSitesManage, recordSiteProgressHandler);

// ---------------------------------------------------------------------------
// Alertes de dépassement
//
// Droit de lecture des comptes rendus (`requireReportsRead`), pas
// `requireAccountsRead` : une alerte de dépassement est un indicateur de
// pilotage, au même titre qu'une balance ou un compte rendu de campagne
// (`requireReportsRead` sert déjà ces lectures-là au lot 1), pas un compte de
// tiers. Le tableau §5 du contrat le confirme explicitement.
// ---------------------------------------------------------------------------

router.get('/tenants/:tenantId/finance/budget-alerts', requireReportsRead, listOpenBudgetAlertsHandler);

router.post(
  '/tenants/:tenantId/finance/budget-alerts/:alertId/acknowledge',
  requireDocumentsValidate,
  acknowledgeBudgetAlertHandler
);

// ---------------------------------------------------------------------------
// Tableau de bord
// ---------------------------------------------------------------------------

router.get('/tenants/:tenantId/finance/sites/dashboard', requireReportsRead, getSitesDashboardHandler);

export default router;
