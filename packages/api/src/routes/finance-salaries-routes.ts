import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import {
  requireAccountsRead,
  requireDocumentsCreate,
  requireDocumentsValidate,
  requireSettingsManage
} from '../middleware/finance-rbac-middleware';
import {
  createEmployeeHandler,
  createSalaryNoteHandler,
  createSalaryPaymentHandler,
  getEmployeeHandler,
  listEmployeesHandler,
  listSalaryNotesHandler,
  listSalaryPaymentsHandler,
  validateSalaryNoteHandler,
  validateSalaryPaymentHandler
} from '../controllers/finance-salaries-controller';

/**
 * Routes agence du module financier opérationnel — lot 4, troisième sous-lot :
 * les salaires (`lib/finance/types-lot4-salaries.ts`).
 *
 * **Ce fichier ne se monte pas lui-même** : c'est le rôle de `src/index.ts`,
 * hors du territoire de cet agent (fichier-registre monté à l'intégration).
 * Modèle : `routes/finance-land-leases-routes.ts` (lot 4, premier sous-lot).
 *
 * **Gardes posés avec leur chemin**, jamais en `router.use(authenticate)`
 * nu. Un garde posé sans chemin sur un routeur monté sur `/api` tout entier
 * traverserait toute requête `/api/*`, y compris une route publique montée
 * après lui — l'incident du lot 1, documenté dans `finance-routes.ts`. Ici
 * comme là-bas, le garde ne s'applique qu'au préfixe que ce routeur sert
 * réellement : `/tenants/:tenantId/finance`.
 *
 * **Aucune permission neuve** : les quatre droits déjà posés au lot 1/2
 * (`requireAccountsRead`, `requireSettingsManage`, `requireDocumentsCreate`,
 * `requireDocumentsValidate`) couvrent les neuf routes — exactement le
 * tableau de permissions donné à cet agent.
 */

const router = Router();

router.use('/tenants/:tenantId/finance', authenticate, requireTenantAccess);

// A. Liste des employés.
router.get('/tenants/:tenantId/finance/employees', requireAccountsRead, listEmployeesHandler);

// B. Enregistrement d'un employé. Portée par `settings.manage` (le tableau
// des routes donné à cet agent), comme le paramétrage du plan de comptes ou
// des postes de dépense : ouvrir un compte de tiers employé est un geste de
// paramétrage, pas une saisie courante.
router.post('/tenants/:tenantId/finance/employees', requireSettingsManage, createEmployeeHandler);

// C. Détail d'un employé.
router.get('/tenants/:tenantId/finance/employees/:employeeId', requireAccountsRead, getEmployeeHandler);

// D. Notes de salaire — liste TRANSVERSALE (tous employés), filtrée par
// `employeeId`/`siteId`/`periodYear`/`periodMonth` en query (contrat, tableau
// des routes). Montée avant `employees/:employeeId/salary-notes` : les deux
// préfixes ne se recouvrent pas (`salary-notes` vs `employees/...`), l'ordre
// n'a donc pas d'incidence ici, mais il suit la disposition du tableau.
router.get('/tenants/:tenantId/finance/salary-notes', requireAccountsRead, listSalaryNotesHandler);

// E. Saisie d'une note de salaire pour UN employé précis.
router.post(
  '/tenants/:tenantId/finance/employees/:employeeId/salary-notes',
  requireDocumentsCreate,
  createSalaryNoteHandler
);

// F. Validation d'une note : droit de VALIDATION, jamais de création —
// décision D7, plusieurs saisisseurs, un validateur (même règle qu'aux lots
// précédents).
router.post(
  '/tenants/:tenantId/finance/salary-notes/:salaryNoteId/validate',
  requireDocumentsValidate,
  validateSalaryNoteHandler
);

// G. Règlements d'UN employé précis — liste.
router.get(
  '/tenants/:tenantId/finance/employees/:employeeId/salary-payments',
  requireAccountsRead,
  listSalaryPaymentsHandler
);

// H. Saisie d'un règlement pour UN employé précis.
router.post(
  '/tenants/:tenantId/finance/employees/:employeeId/salary-payments',
  requireDocumentsCreate,
  createSalaryPaymentHandler
);

// I. Validation d'un règlement : droit de VALIDATION, même raison qu'en F.
router.post(
  '/tenants/:tenantId/finance/salary-payments/:salaryPaymentId/validate',
  requireDocumentsValidate,
  validateSalaryPaymentHandler
);

export default router;
