import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import {
  requireAccountsRead,
  requireDocumentsCreate,
  requireDocumentsValidate,
  requireSettingsManage,
  requireSitesManage
} from '../middleware/finance-rbac-middleware';
import {
  createCashVoucherHandler,
  createConstructionSiteHandler,
  createCostCategoryHandler,
  getConstructionSiteDetailHandler,
  getConstructionSiteHandler,
  getValidationQueueHandler,
  listConstructionSitesHandler,
  listCostCategoriesHandler,
  printCashVoucherHandler,
  voidCashVoucherHandler,
  validateCashVoucherHandler
} from '../controllers/finance-sites-controller';

/**
 * Routes agence « chantiers » du module financier — lot 2, dernière vague.
 *
 * **Ce fichier ne se monte pas lui-même** : c'est le rôle de `src/index.ts`,
 * hors du territoire de cet agent (fichier-registre monté à l'intégration).
 * Modèle : `routes/finance-routes.ts` (lot 1).
 *
 * Contrat : `specs/017-finance-fournisseurs-chantiers/contracts/openapi.yaml`.
 */

const router = Router();

/**
 * Gardes limités au préfixe que ce routeur sert réellement, posés avec leur
 * chemin plutôt qu'en `router.use(authenticate)` nu. Au lot 1, un routeur
 * financier monté sur `/api` tout entier avec des gardes sans chemin faisait
 * traverser ce garde à **toute** requête `/api/*`, y compris l'endpoint
 * géographique public — voir l'en-tête de `finance-routes.ts` pour le détail
 * de l'incident corrigé. Même précaution ici.
 */
router.use('/tenants/:tenantId/finance', authenticate, requireTenantAccess);

// ---------------------------------------------------------------------------
// Chantiers
// ---------------------------------------------------------------------------

router.get('/tenants/:tenantId/finance/sites', requireAccountsRead, listConstructionSitesHandler);

router.post('/tenants/:tenantId/finance/sites', requireSitesManage, createConstructionSiteHandler);

router.get('/tenants/:tenantId/finance/sites/:siteId', requireAccountsRead, getConstructionSiteHandler);

router.get('/tenants/:tenantId/finance/sites/:siteId/detail', requireAccountsRead, getConstructionSiteDetailHandler);

// ---------------------------------------------------------------------------
// Postes de dépense
// ---------------------------------------------------------------------------

router.get('/tenants/:tenantId/finance/cost-categories', requireAccountsRead, listCostCategoriesHandler);

router.post('/tenants/:tenantId/finance/cost-categories', requireSettingsManage, createCostCategoryHandler);

// ---------------------------------------------------------------------------
// Pièces de caisse
// ---------------------------------------------------------------------------

router.post('/tenants/:tenantId/finance/sites/:siteId/cash-vouchers', requireDocumentsCreate, createCashVoucherHandler);

router.post(
  '/tenants/:tenantId/finance/cash-vouchers/:voucherId/validate',
  requireDocumentsValidate,
  validateCashVoucherHandler
);

router.get('/tenants/:tenantId/finance/cash-vouchers/:voucherId.pdf', requireAccountsRead, printCashVoucherHandler);

// Annulation d'une piece de caisse validee. Droit de VALIDATION : annuler une
// piece est la meme responsabilite que la valider (decision D7). Ajoutee le
// 19 septembre 2026 — sans elle, une erreur sur une piece validee etait
// definitive, et le cout du chantier restait faux pour toujours.
router.post(
  '/tenants/:tenantId/finance/cash-vouchers/:voucherId/void',
  requireDocumentsValidate,
  voidCashVoucherHandler
);

// ---------------------------------------------------------------------------
// File de validation
//
// Porte le droit de validation, pas celui de lecture (`requireDocumentsValidate`,
// pas `requireAccountsRead`) : c'est l'écran du validateur, montrer à qui ne
// peut rien valider n'aurait pas de sens.
// ---------------------------------------------------------------------------

router.get('/tenants/:tenantId/finance/validation-queue', requireDocumentsValidate, getValidationQueueHandler);

export default router;
