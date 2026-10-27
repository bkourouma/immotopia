import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { requirePermission } from '../middleware/rbac-middleware';
import { notificationResendRateLimiter } from '../middleware/rate-limit-middleware';
import {
  getAdminNotificationHandler,
  listAdminNotificationsHandler,
  listRecipientsHandler,
  resendAdminNotificationHandler
} from '../controllers/notification-admin-controller';

/**
 * Journal des notifications de l'agence, réservé à `TENANT_NOTIFICATIONS_ADMIN`
 * (administrateur et gestionnaire ; super-admin via le contournement habituel
 * de `hasPermission`). `/recipients` AVANT `/:id`. Gardes posées avec leur chemin.
 */
const router = Router();
const admin = requirePermission('TENANT_NOTIFICATIONS_ADMIN');

router.get(
  '/tenants/:tenantId/admin/notifications',
  authenticate,
  requireTenantAccess,
  admin,
  listAdminNotificationsHandler
);
router.get(
  '/tenants/:tenantId/admin/notifications/recipients',
  authenticate,
  requireTenantAccess,
  admin,
  listRecipientsHandler
);
router.get(
  '/tenants/:tenantId/admin/notifications/:id',
  authenticate,
  requireTenantAccess,
  admin,
  getAdminNotificationHandler
);
router.post(
  '/tenants/:tenantId/admin/notifications/:id/resend',
  authenticate,
  requireTenantAccess,
  admin,
  notificationResendRateLimiter,
  resendAdminNotificationHandler
);

export default router;
