import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { enforcePropertyTenantIsolation } from '../middleware/tenant-isolation-middleware';
import { requireAnyPropertyPermission, requirePropertyPermission } from '../middleware/property-rbac-middleware';
import {
  createOwnerStatementHandler,
  getOwnerStatementHandler,
  listOwnerStatementsHandler,
  recomputeOwnerStatementHandler,
  sendOwnerStatementHandler,
  updateOwnerStatementHandler
} from '../controllers/owner-statements-controller';

import { requireThirdPartyAllowed } from '../services/own-assets-barrier-service';

const router = Router();

router.use(authenticate);
router.use(requireTenantAccess);
router.use(enforcePropertyTenantIsolation);
// Barriere « detenu en propre » : releves de gerance = gestion pour un tiers.
router.use('/tenants/:tenantId/owner-statements', requireThirdPartyAllowed('OWNER_STATEMENT'));

router.get(
  '/tenants/:tenantId/owner-statements',
  requireAnyPropertyPermission(['OWNER_STATEMENTS_VIEW']),
  listOwnerStatementsHandler
);
router.post(
  '/tenants/:tenantId/owner-statements',
  requirePropertyPermission('OWNER_STATEMENTS_EDIT'),
  createOwnerStatementHandler
);
router.get(
  '/tenants/:tenantId/owner-statements/:statementId',
  requireAnyPropertyPermission(['OWNER_STATEMENTS_VIEW']),
  getOwnerStatementHandler
);
router.patch(
  '/tenants/:tenantId/owner-statements/:statementId',
  requirePropertyPermission('OWNER_STATEMENTS_EDIT'),
  updateOwnerStatementHandler
);
router.post(
  '/tenants/:tenantId/owner-statements/:statementId/recompute',
  requirePropertyPermission('OWNER_STATEMENTS_EDIT'),
  recomputeOwnerStatementHandler
);
router.post(
  '/tenants/:tenantId/owner-statements/:statementId/send',
  requirePropertyPermission('OWNER_STATEMENTS_EDIT'),
  sendOwnerStatementHandler
);

export default router;
