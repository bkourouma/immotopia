import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requirePermission } from '../middleware/rbac-middleware';
import { requireSuperAdmin } from '../middleware/super-admin-middleware';
import { notificationResendRateLimiter } from '../middleware/rate-limit-middleware';
import {
  getPlatformNotificationHandler,
  listPlatformNotificationsHandler,
  resendPlatformNotificationHandler
} from '../controllers/notification-admin-controller';

/**
 * Journal des notifications de TOUTES les agences, réservé au super-admin.
 * Double garde comme les autres routes plateforme : `requirePermission
 * ('PLATFORM_TENANTS_*')` (inventaire des routes) puis `requireSuperAdmin`.
 * Gardes posées avec leur chemin (routeur monté sur `/api`).
 */
const router = Router();
const view = requirePermission('PLATFORM_TENANTS_VIEW');
// Le renvoi ECRIT (il rejoue des envois vers des tiers) : edition plateforme, pas simple lecture.
const edit = requirePermission('PLATFORM_TENANTS_EDIT');

router.get('/admin/notifications', authenticate, view, requireSuperAdmin, listPlatformNotificationsHandler);
router.get('/admin/notifications/:id', authenticate, view, requireSuperAdmin, getPlatformNotificationHandler);
router.post(
  '/admin/notifications/:id/resend',
  authenticate,
  edit,
  requireSuperAdmin,
  notificationResendRateLimiter,
  resendPlatformNotificationHandler
);

export default router;
