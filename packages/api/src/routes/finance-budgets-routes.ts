import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import {
  requireAccountsRead,
  requireDocumentsValidate,
  requireSitesManage
} from '../middleware/finance-rbac-middleware';
import {
  createBudgetAmendmentHandler,
  createSiteBudgetHandler,
  getValidatedSiteBudgetHandler,
  listBudgetAmendmentsHandler,
  listSiteBudgetsHandler,
  validateBudgetAmendmentHandler,
  validateSiteBudgetHandler
} from '../controllers/finance-budgets-controller';

/**
 * Routes agence « budget et avenants » du module financier — lot 3, premier
 * volet (`specs/018-finance-budget-pilotage/data-model.md` §5).
 *
 * **Ce fichier ne se monte pas lui-même** : c'est le rôle de `src/index.ts`,
 * hors du territoire de cet agent (fichier-registre monté à l'intégration).
 * Modèle : `routes/finance-suppliers-routes.ts` (lot 2).
 *
 * **Gardes posés avec leur chemin**, jamais en `router.use(authenticate)`
 * nu. Au lot 1, un garde posé sans chemin sur un routeur monté sur `/api`
 * tout entier traversait toute requête `/api/*`, y compris une route
 * publique montée après lui — voir l'en-tête de `finance-routes.ts` pour le
 * détail de l'incident corrigé. Même précaution ici : le garde ne s'applique
 * qu'au préfixe que ce routeur sert réellement.
 *
 * **Aucune permission neuve** : les trois droits utilisés
 * (`FINANCE_ACCOUNTS_READ`, `FINANCE_SITES_MANAGE`, `FINANCE_DOCUMENTS_VALIDATE`)
 * existent déjà depuis les lots 1 et 2 (`middleware/finance-rbac-middleware.ts`).
 * La création d'un budget ou d'un avenant porte `requireSitesManage`, pas
 * `requireDocumentsCreate` : ce n'est ni une facture ni un règlement, c'est
 * une prévision, du ressort de qui gère le chantier — décision actée au
 * §5 de `data-model.md`.
 *
 * Contrat : `packages/api/src/lib/finance/types-lot3.ts`,
 * `specs/018-finance-budget-pilotage/data-model.md` §5.
 */

const router = Router();

router.use('/tenants/:tenantId/finance', authenticate, requireTenantAccess);

// ---------------------------------------------------------------------------
// Budget de chantier
// ---------------------------------------------------------------------------

router.get('/tenants/:tenantId/finance/sites/:siteId/budgets', requireAccountsRead, listSiteBudgetsHandler);

router.post('/tenants/:tenantId/finance/sites/:siteId/budgets', requireSitesManage, createSiteBudgetHandler);

// `.../budget` (singulier) est un chemin littéral distinct de `.../budgets`
// (pluriel) ci-dessus : aucune ambiguïté d'ordre de déclaration, à la
// différence du cas `suppliers/balance` vs `suppliers/:supplierId` du lot 2,
// où une route paramétrée aurait pu capturer un segment littéral.
router.get('/tenants/:tenantId/finance/sites/:siteId/budget', requireAccountsRead, getValidatedSiteBudgetHandler);

router.post(
  '/tenants/:tenantId/finance/site-budgets/:budgetId/validate',
  requireDocumentsValidate,
  validateSiteBudgetHandler
);

// ---------------------------------------------------------------------------
// Avenants
// ---------------------------------------------------------------------------

router.get(
  '/tenants/:tenantId/finance/site-budgets/:budgetId/amendments',
  requireAccountsRead,
  listBudgetAmendmentsHandler
);

router.post(
  '/tenants/:tenantId/finance/site-budgets/:budgetId/amendments',
  requireSitesManage,
  createBudgetAmendmentHandler
);

router.post(
  '/tenants/:tenantId/finance/budget-amendments/:id/validate',
  requireDocumentsValidate,
  validateBudgetAmendmentHandler
);

export default router;
