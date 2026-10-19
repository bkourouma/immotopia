import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess, requireTenantCollaborator } from '../middleware/tenant-middleware';
import {
  countUnreadHandler,
  listMyNotificationsHandler,
  markAllReadHandler,
  markReadHandler
} from '../controllers/notification-controller';

/**
 * Notifications persistantes de l'utilisateur connecté (menu lot 3).
 * Gardes posées avec leur chemin, jamais en `router.use` nu : ce routeur est
 * monté sur `/api` tout entier. `/unread-count` et `/read-all` AVANT `/:id`.
 */
const router = Router();

router.get(
  '/tenants/:tenantId/notifications',
  authenticate,
  requireTenantAccess,
  requireTenantCollaborator,
  listMyNotificationsHandler
);
router.get(
  '/tenants/:tenantId/notifications/unread-count',
  authenticate,
  requireTenantAccess,
  requireTenantCollaborator,
  countUnreadHandler
);
router.post(
  '/tenants/:tenantId/notifications/read-all',
  authenticate,
  requireTenantAccess,
  requireTenantCollaborator,
  markAllReadHandler
);
router.post(
  '/tenants/:tenantId/notifications/:id/read',
  authenticate,
  requireTenantAccess,
  requireTenantCollaborator,
  markReadHandler
);

export default router;
