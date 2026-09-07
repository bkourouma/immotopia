import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { enforcePropertyTenantIsolation } from '../middleware/tenant-isolation-middleware';
import { requireAnyPropertyPermission, requirePropertyPermission } from '../middleware/property-rbac-middleware';
import {
  createOwnerStatementHandler,
  getOwnerStatementHandler,
  listOwnerStatementsHandler,
  sendOwnerStatementHandler,
  updateOwnerStatementHandler
} from '../controllers/owner-statements-controller';

const router = Router();

router.use(authenticate);
router.use(requireTenantAccess);
router.use(enforcePropertyTenantIsolation);

router.get(
  '/tenants/:tenantId/owner-statements',
  requireAnyPropertyPermission(['PROPERTIES_VIEW']),
  listOwnerStatementsHandler
);
router.post(
  '/tenants/:tenantId/owner-statements',
  requirePropertyPermission('PROPERTIES_EDIT'),
  createOwnerStatementHandler
);
router.get(
  '/tenants/:tenantId/owner-statements/:statementId',
  requireAnyPropertyPermission(['PROPERTIES_VIEW']),
  getOwnerStatementHandler
);
router.patch(
  '/tenants/:tenantId/owner-statements/:statementId',
  requirePropertyPermission('PROPERTIES_EDIT'),
  updateOwnerStatementHandler
);
router.post(
  '/tenants/:tenantId/owner-statements/:statementId/send',
  requirePropertyPermission('PROPERTIES_EDIT'),
  sendOwnerStatementHandler
);

export default router;

