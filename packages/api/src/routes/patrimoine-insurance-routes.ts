import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { requirePropertyPermission } from '../middleware/property-rbac-middleware';
import {
  listPoliciesHandler,
  createPolicyHandler,
  getPolicyHandler,
  updatePolicyHandler,
  deletePolicyHandler,
  listClaimsHandler,
  createClaimHandler,
  getClaimHandler,
  updateClaimHandler,
  deleteClaimHandler,
  transitionClaimHandler,
  attachClaimDocumentHandler,
  detachClaimDocumentHandler
} from '../controllers/patrimoine-insurance-controller';
import {
  listMaintenanceLogHandler,
  exportMaintenanceLogHandler,
  createMaintenanceLogHandler,
  updateMaintenanceLogHandler,
  deleteMaintenanceLogHandler
} from '../controllers/patrimoine-maintenance-log-controller';

/**
 * Assurances, sinistres et carnet d'entretien (lot B1, spec 032).
 *
 * Monté sur `/api` dans `app.ts`, juste après `patrimoineEntitiesRoutes`.
 * Chemins sous `/tenants/:tenantId/patrimoine`, couverts par la règle
 * `{ prefix: '/patrimoine', feature: 'PATRIMOINE' }` de
 * `lib/subscription/route-features.ts`. Lecture : PROPERTIES_VIEW ; écriture
 * et transitions : PROPERTIES_EDIT. Gardes posées route par route, jamais en
 * `router.use` nu. `/maintenance-log/export` est déclarée avant toute route
 * `/:entryId`.
 */
const router = Router();
const BASE = '/tenants/:tenantId/patrimoine';

router.get(
  `${BASE}/insurance/policies`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_VIEW'),
  listPoliciesHandler
);

router.post(
  `${BASE}/insurance/policies`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_EDIT'),
  createPolicyHandler
);

router.get(
  `${BASE}/insurance/policies/:policyId`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_VIEW'),
  getPolicyHandler
);

router.patch(
  `${BASE}/insurance/policies/:policyId`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_EDIT'),
  updatePolicyHandler
);

router.delete(
  `${BASE}/insurance/policies/:policyId`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_EDIT'),
  deletePolicyHandler
);

router.get(
  `${BASE}/insurance/claims`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_VIEW'),
  listClaimsHandler
);

router.post(
  `${BASE}/insurance/claims`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_EDIT'),
  createClaimHandler
);

router.get(
  `${BASE}/insurance/claims/:claimId`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_VIEW'),
  getClaimHandler
);

router.patch(
  `${BASE}/insurance/claims/:claimId`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_EDIT'),
  updateClaimHandler
);

router.delete(
  `${BASE}/insurance/claims/:claimId`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_EDIT'),
  deleteClaimHandler
);

router.post(
  `${BASE}/insurance/claims/:claimId/status`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_EDIT'),
  transitionClaimHandler
);

router.post(
  `${BASE}/insurance/claims/:claimId/documents`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_EDIT'),
  attachClaimDocumentHandler
);

router.delete(
  `${BASE}/insurance/claims/:claimId/documents/:linkId`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_EDIT'),
  detachClaimDocumentHandler
);

router.get(
  `${BASE}/maintenance-log`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_VIEW'),
  listMaintenanceLogHandler
);

router.get(
  `${BASE}/maintenance-log/export`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_VIEW'),
  exportMaintenanceLogHandler
);

router.post(
  `${BASE}/maintenance-log`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_EDIT'),
  createMaintenanceLogHandler
);

router.patch(
  `${BASE}/maintenance-log/:entryId`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_EDIT'),
  updateMaintenanceLogHandler
);

router.delete(
  `${BASE}/maintenance-log/:entryId`,
  authenticate,
  requireTenantAccess,
  requirePropertyPermission('PROPERTIES_EDIT'),
  deleteMaintenanceLogHandler
);

export default router;
