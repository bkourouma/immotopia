import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { enforcePropertyTenantIsolation } from '../middleware/tenant-isolation-middleware';
import { requireAnyPropertyPermission, requirePropertyPermission } from '../middleware/property-rbac-middleware';
import {
  deletePropertyDocumentHandler,
  deletePropertyExpenseHandler,
  deletePropertyLoanHandler,
  deletePropertyValuationHandler,
  deletePropertyWorkProgramHandler,
  createPropertyDocumentHandler,
  createPropertyExpenseHandler,
  createPropertyLoanHandler,
  createPropertyValuationHandler,
  createPropertyWorkProgramHandler,
  getPropertyDocumentHandler,
  getPropertyExpenseHandler,
  getPropertyLoanHandler,
  getPropertyValuationHandler,
  getPropertyWorkProgramHandler,
  getPatrimoineOverviewHandler,
  getPatrimoinePerformanceHandler,
  getPropertyYieldHandler,
  listPropertyDocumentsHandler,
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

router.get(
  '/tenants/:tenantId/patrimoine/performance',
  requireAnyPropertyPermission(['PROPERTIES_VIEW']),
  getPatrimoinePerformanceHandler
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

router.get(
  '/tenants/:tenantId/properties/:propertyId/documents',
  requireAnyPropertyPermission(['PROPERTIES_VIEW']),
  listPropertyDocumentsHandler
);
router.post(
  '/tenants/:tenantId/properties/:propertyId/documents',
  requirePropertyPermission('PROPERTIES_EDIT'),
  createPropertyDocumentHandler
);
router.get(
  '/tenants/:tenantId/properties/:propertyId/documents/:documentId',
  requireAnyPropertyPermission(['PROPERTIES_VIEW']),
  getPropertyDocumentHandler
);
router.delete(
  '/tenants/:tenantId/properties/:propertyId/documents/:documentId',
  requirePropertyPermission('PROPERTIES_EDIT'),
  deletePropertyDocumentHandler
);

router.get(
  '/tenants/:tenantId/properties/:propertyId/yield',
  requireAnyPropertyPermission(['PROPERTIES_VIEW']),
  getPropertyYieldHandler
);

export default router;
