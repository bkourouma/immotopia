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

const router = Router();

/**
 * Gardes posés avec leur chemin, jamais en `router.use` nu : ce routeur est
 * monté sur `/api` tout entier. Posés sans chemin, ils traversaient toute
 * requête `/api/*` qui atteignait ce routeur, y compris celles destinées aux
 * routeurs montés après lui — `GET /api/portal/owner/account` répondait
 * « Tenant ID requis. » (23 septembre 2026).
 */
router.use('/tenants/:tenantId/owner-statements', authenticate, requireTenantAccess, enforcePropertyTenantIsolation);

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
  '/tenants/:tenantId/owner-statements/:statementId/recompute',
  requirePropertyPermission('PROPERTIES_EDIT'),
  recomputeOwnerStatementHandler
);
router.post(
  '/tenants/:tenantId/owner-statements/:statementId/send',
  requirePropertyPermission('PROPERTIES_EDIT'),
  sendOwnerStatementHandler
);

export default router;
