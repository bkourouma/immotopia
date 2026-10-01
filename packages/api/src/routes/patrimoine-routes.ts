import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { enforcePropertyTenantIsolation } from '../middleware/tenant-isolation-middleware';
import { requireAnyPropertyPermission, requirePropertyPermission } from '../middleware/property-rbac-middleware';
import { requireSitesManage } from '../middleware/finance-rbac-middleware';
import {
  deletePropertyExpenseHandler,
  deletePropertyLoanHandler,
  deletePropertyValuationHandler,
  deletePropertyWorkProgramHandler,
  createPropertyExpenseHandler,
  createPropertyLoanHandler,
  createPropertyValuationHandler,
  createPropertyWorkProgramHandler,
  getPropertyExpenseHandler,
  getPropertyLoanHandler,
  getPropertyValuationHandler,
  getPropertyWorkProgramHandler,
  getPatrimoineOverviewHandler,
  getPatrimoinePerformanceHandler,
  getPropertyYieldHandler,
  linkWorkProgramConstructionSiteHandler,
  listPropertyExpensesHandler,
  listPropertyLoansHandler,
  listPropertyValuationsHandler,
  listPropertyWorkProgramsHandler,
  listTenantWorkProgramsHandler,
  updatePropertyExpenseHandler,
  updatePropertyLoanHandler,
  updatePropertyValuationHandler,
  updatePropertyWorkProgramHandler
} from '../controllers/patrimoine-controller';
import { getCashPlanHandler, updateCashPlanSettingsHandler } from '../controllers/patrimoine-cash-plan-controller';
import {
  exportAgencyPatrimoineHandler,
  exportPropertyPatrimoineHandler
} from '../controllers/patrimoine-export-controller';
import {
  getYieldAssumptionsHandler,
  setYieldAssumptionsHandler
} from '../controllers/patrimoine-yield-assumptions-controller';

const router = Router();

router.use(authenticate);
router.use(requireTenantAccess);
router.use(enforcePropertyTenantIsolation);

router.get(
  '/tenants/:tenantId/patrimoine/overview',
  requireAnyPropertyPermission(['PROPERTIES_VIEW']),
  getPatrimoineOverviewHandler
);

// Ajout non rupturant : la route par bien reste en place et repond a
// l'identique. Celle-ci evite d'avoir a l'appeler en boucle (§8.4).
router.get(
  '/tenants/:tenantId/work-programs',
  requireAnyPropertyPermission(['PROPERTIES_VIEW']),
  listTenantWorkProgramsHandler
);

// Plan de tresorerie previsionnel (spec 030) : chemins fixes, declares avant
// toute route parametree sous /patrimoine. La garde d'edition ne depend pas de
// `:propertyId` (elle ne lit que `req.tenantContext`).
router.get(
  '/tenants/:tenantId/patrimoine/cash-plan',
  requireAnyPropertyPermission(['PROPERTIES_VIEW']),
  getCashPlanHandler
);
router.put(
  '/tenants/:tenantId/patrimoine/cash-plan/settings',
  requirePropertyPermission('PROPERTIES_EDIT'),
  updateCashPlanSettingsHandler
);

router.get(
  '/tenants/:tenantId/patrimoine/performance',
  requireAnyPropertyPermission(['PROPERTIES_VIEW']),
  getPatrimoinePerformanceHandler
);

// Export "toute l'agence" (lot P3) : declaree ici, AVANT toute route qui
// pourrait la capturer -- aucune ne le fait aujourd'hui (`:workProgramId`
// est plus loin sous /patrimoine/work-programs/), mais l'ordre reste le
// premier gardien si ca change.
router.get(
  '/tenants/:tenantId/patrimoine/export',
  requireAnyPropertyPermission(['PROPERTIES_VIEW']),
  exportAgencyPatrimoineHandler
);

router.get(
  '/tenants/:tenantId/properties/:propertyId/valuations',
  requireAnyPropertyPermission(['PROPERTIES_VIEW']),
  listPropertyValuationsHandler
);
router.post(
  '/tenants/:tenantId/properties/:propertyId/valuations',
  requirePropertyPermission('PROPERTIES_EDIT'),
  createPropertyValuationHandler
);
router.get(
  '/tenants/:tenantId/properties/:propertyId/valuations/:valuationId',
  requireAnyPropertyPermission(['PROPERTIES_VIEW']),
  getPropertyValuationHandler
);
router.patch(
  '/tenants/:tenantId/properties/:propertyId/valuations/:valuationId',
  requirePropertyPermission('PROPERTIES_EDIT'),
  updatePropertyValuationHandler
);
router.delete(
  '/tenants/:tenantId/properties/:propertyId/valuations/:valuationId',
  requirePropertyPermission('PROPERTIES_EDIT'),
  deletePropertyValuationHandler
);

router.get(
  '/tenants/:tenantId/properties/:propertyId/expenses',
  requireAnyPropertyPermission(['PROPERTIES_VIEW']),
  listPropertyExpensesHandler
);
router.post(
  '/tenants/:tenantId/properties/:propertyId/expenses',
  requirePropertyPermission('PROPERTIES_EDIT'),
  createPropertyExpenseHandler
);
router.get(
  '/tenants/:tenantId/properties/:propertyId/expenses/:expenseId',
  requireAnyPropertyPermission(['PROPERTIES_VIEW']),
  getPropertyExpenseHandler
);
router.patch(
  '/tenants/:tenantId/properties/:propertyId/expenses/:expenseId',
  requirePropertyPermission('PROPERTIES_EDIT'),
  updatePropertyExpenseHandler
);
router.delete(
  '/tenants/:tenantId/properties/:propertyId/expenses/:expenseId',
  requirePropertyPermission('PROPERTIES_EDIT'),
  deletePropertyExpenseHandler
);

router.get(
  '/tenants/:tenantId/properties/:propertyId/loans',
  requireAnyPropertyPermission(['PROPERTIES_VIEW']),
  listPropertyLoansHandler
);
router.post(
  '/tenants/:tenantId/properties/:propertyId/loans',
  requirePropertyPermission('PROPERTIES_EDIT'),
  createPropertyLoanHandler
);
router.get(
  '/tenants/:tenantId/properties/:propertyId/loans/:loanId',
  requireAnyPropertyPermission(['PROPERTIES_VIEW']),
  getPropertyLoanHandler
);
router.patch(
  '/tenants/:tenantId/properties/:propertyId/loans/:loanId',
  requirePropertyPermission('PROPERTIES_EDIT'),
  updatePropertyLoanHandler
);
router.delete(
  '/tenants/:tenantId/properties/:propertyId/loans/:loanId',
  requirePropertyPermission('PROPERTIES_EDIT'),
  deletePropertyLoanHandler
);

router.get(
  '/tenants/:tenantId/properties/:propertyId/work-programs',
  requireAnyPropertyPermission(['PROPERTIES_VIEW']),
  listPropertyWorkProgramsHandler
);
router.post(
  '/tenants/:tenantId/properties/:propertyId/work-programs',
  requirePropertyPermission('PROPERTIES_EDIT'),
  createPropertyWorkProgramHandler
);
router.get(
  '/tenants/:tenantId/properties/:propertyId/work-programs/:programId',
  requireAnyPropertyPermission(['PROPERTIES_VIEW']),
  getPropertyWorkProgramHandler
);
router.patch(
  '/tenants/:tenantId/properties/:propertyId/work-programs/:programId',
  requirePropertyPermission('PROPERTIES_EDIT'),
  updatePropertyWorkProgramHandler
);
router.delete(
  '/tenants/:tenantId/properties/:propertyId/work-programs/:programId',
  requirePropertyPermission('PROPERTIES_EDIT'),
  deletePropertyWorkProgramHandler
);

// US12 / FR-024 : rattache (ou detache) un WorkProgram existant a un
// ConstructionSite. Pas de :propertyId dans ce chemin (voir
// `contracts/openapi.yaml`) : on identifie le programme par tenant + id
// seuls, depuis l'ecran du Patrimoine. Garde financiere (`requireSitesManage`),
// pas `requirePropertyPermission` : poser ce lien est un geste de gestion de
// chantier, pas une edition de fiche bien.
router.patch(
  '/tenants/:tenantId/patrimoine/work-programs/:workProgramId/construction-site',
  requireSitesManage,
  linkWorkProgramConstructionSiteHandler
);

// Les documents d'un bien detenu passent par la mecanique `PropertyDocument`
// (`property-routes.ts`, fichier prive, telechargement authentifie) : ces
// routes-ci, montees APRES `property-routes.ts` (app.ts), ne repondaient
// jamais -- Express sert la premiere route qui matche un chemin, et
// `property-routes.ts` declare les memes chemins
// `/tenants/:tenantId/properties/:id/documents` en premier. Voir
// `PropertyDocumentType` (schema.prisma), enrichi des pieces du dossier
// patrimonial (lot P0).

router.get(
  '/tenants/:tenantId/properties/:propertyId/yield',
  requireAnyPropertyPermission(['PROPERTIES_VIEW']),
  getPropertyYieldHandler
);

// Hypotheses de projection enregistrees d'un bien (spec 029). Declarees apres
// `/yield` : chemin plus long, aucune capture possible.
router.get(
  '/tenants/:tenantId/properties/:propertyId/yield/assumptions',
  requireAnyPropertyPermission(['PROPERTIES_VIEW']),
  getYieldAssumptionsHandler
);
router.put(
  '/tenants/:tenantId/properties/:propertyId/yield/assumptions',
  requirePropertyPermission('PROPERTIES_EDIT'),
  setYieldAssumptionsHandler
);

// Export d'un seul bien (lot P3).
router.get(
  '/tenants/:tenantId/properties/:propertyId/patrimoine/export',
  requireAnyPropertyPermission(['PROPERTIES_VIEW']),
  exportPropertyPatrimoineHandler
);

export default router;
