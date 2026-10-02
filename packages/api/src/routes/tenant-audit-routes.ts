import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { requirePermission } from '../middleware/rbac-middleware';
import { getTenantAuditLogsHandler } from '../controllers/tenant-audit-controller';

/**
 * Journal d'activité d'une agence (ADR-006, niveau « agence »).
 *
 * Lecture seule, réservée à `TENANT_AUDIT_VIEW` (administrateur d'agence et
 * super-admin par défaut). Le niveau « plateforme » reste `GET /api/admin/audit`.
 * Gardes posées avec leur chemin, jamais en `router.use` nu : ce routeur est
 * monté sur `/api` tout entier.
 */
const router = Router();

router.get(
  '/tenants/:tenantId/audit',
  authenticate,
  requireTenantAccess,
  requirePermission('TENANT_AUDIT_VIEW'),
  getTenantAuditLogsHandler
);

export default router;
