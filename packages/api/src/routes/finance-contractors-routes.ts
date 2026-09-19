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
  createContractorContractHandler,
  createContractorHandler,
  createContractorPaymentHandler,
  createProgressStatementHandler,
  getContractorContractHandler,
  listContractorContractsHandler,
  listContractorPaymentsHandler,
  listContractorsHandler,
  listProgressStatementsHandler,
  validateContractorPaymentHandler,
  validateProgressStatementHandler
} from '../controllers/finance-contractors-controller';

/**
 * Routes agence du module financier opérationnel — lot 4, quatrième sous-lot :
 * les tâcherons (`lib/finance/types-lot4-contractors.ts`, contrat gelé).
 *
 * **Ce fichier ne se monte pas lui-même** : c'est le rôle de `src/index.ts`,
 * hors du territoire de cet agent (fichier-registre monté à l'intégration).
 * Modèle : `routes/finance-salaries-routes.ts` (lot 4, troisième sous-lot).
 *
 * **Gardes posés avec leur chemin**, jamais en `router.use(authenticate)`
 * nu. Un garde posé sans chemin sur un routeur monté sur `/api` tout entier
 * traverserait toute requête `/api/*`, y compris une route publique montée
 * après lui — l'incident du lot 1, documenté dans `finance-routes.ts`. Ici
 * comme aux sous-lots précédents, le garde ne s'applique qu'au préfixe que ce
 * routeur sert réellement : `/tenants/:tenantId/finance`.
 *
 * **Aucune permission neuve** : les cinq droits déjà posés aux lots 1/2
 * (`requireAccountsRead`, `requireSettingsManage`, `requireSitesManage`,
 * `requireDocumentsCreate`, `requireDocumentsValidate`) couvrent les onze
 * routes — exactement le tableau de permissions donné à cet agent.
 */

const router = Router();

router.use('/tenants/:tenantId/finance', authenticate, requireTenantAccess);

// A. Liste des tâcherons.
router.get('/tenants/:tenantId/finance/contractors', requireAccountsRead, listContractorsHandler);

// B. Enregistrement d'un tâcheron. Portée par `settings.manage` (le tableau
// des routes donné à cet agent), comme l'employé du sous-lot précédent :
// ouvrir un compte de tiers tâcheron est un geste de paramétrage, pas une
// saisie courante.
router.post('/tenants/:tenantId/finance/contractors', requireSettingsManage, createContractorHandler);

// C. Marchés — liste TRANSVERSALE (tous tâcherons), filtrée par
// `contractorId`/`siteId` en query (contrat, tableau des routes). Montée
// avant `contractors/:contractorId/contracts` : les deux préfixes ne se
// recouvrent pas (`contractor-contracts` vs `contractors/...`), l'ordre n'a
// donc pas d'incidence ici, mais il suit la disposition du tableau.
router.get('/tenants/:tenantId/finance/contractor-contracts', requireAccountsRead, listContractorContractsHandler);

// D. Convention d'un marché pour UN tâcheron précis. Portée par
// `sites.manage` (le tableau des routes) : gérer les marchés d'un chantier
// est la même responsabilité que gérer ses chantiers.
router.post(
  '/tenants/:tenantId/finance/contractors/:contractorId/contracts',
  requireSitesManage,
  createContractorContractHandler
);

// E. Détail d'un marché.
router.get(
  '/tenants/:tenantId/finance/contractor-contracts/:contractId',
  requireAccountsRead,
  getContractorContractHandler
);

// F. Situations d'UN marché précis — liste.
router.get(
  '/tenants/:tenantId/finance/contractor-contracts/:contractId/statements',
  requireAccountsRead,
  listProgressStatementsHandler
);

// G. Saisie d'une situation pour UN marché précis.
router.post(
  '/tenants/:tenantId/finance/contractor-contracts/:contractId/statements',
  requireDocumentsCreate,
  createProgressStatementHandler
);

// H. Validation d'une situation : droit de VALIDATION, jamais de création —
// décision D7, plusieurs saisisseurs, un validateur (même règle qu'aux
// sous-lots précédents).
router.post(
  '/tenants/:tenantId/finance/progress-statements/:statementId/validate',
  requireDocumentsValidate,
  validateProgressStatementHandler
);

// I. Règlements d'UN tâcheron précis — liste.
router.get(
  '/tenants/:tenantId/finance/contractors/:contractorId/payments',
  requireAccountsRead,
  listContractorPaymentsHandler
);

// J. Saisie d'un règlement pour UN tâcheron précis.
router.post(
  '/tenants/:tenantId/finance/contractors/:contractorId/payments',
  requireDocumentsCreate,
  createContractorPaymentHandler
);

// K. Validation d'un règlement : droit de VALIDATION, même raison qu'en H.
router.post(
  '/tenants/:tenantId/finance/contractor-payments/:paymentId/validate',
  requireDocumentsValidate,
  validateContractorPaymentHandler
);

export default router;
