import { Router } from 'express';
import type { RequestHandler } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { messagingSendRateLimiter } from '../middleware/rate-limit-middleware';
import { requireCoOwnerPortalAccess } from '../middleware/coowner-portal-access';
import { requireOwnerPortalAccess } from '../middleware/owner-portal-access';
import { requireTenantPortalAccess } from '../middleware/tenant-portal-access';
import { getCurrentTenantId } from '../utils/tenant-context';
import { createPortalInboxHandlers } from '../controllers/portal-inbox-controller';
import type { PortalTenantResolver } from '../controllers/portal-inbox-controller';

/**
 * Notifications persistantes et messagerie des portails. `authenticate` et la
 * garde du portail sont posés sur CHAQUE chemin (jamais en `router.use` nu).
 * Chemins fixes avant les chemins paramétrés. Pas de journal admin ici.
 *
 * Lien des notifications de message : `/messages/<id>`, tel quel, car les
 * portails réutilisent les routes web `/notifications` et `/messages`.
 */
export function createPortalInboxRouter(guard: RequestHandler, tenantIdOf: PortalTenantResolver): Router {
  const router = Router();
  const h = createPortalInboxHandlers(tenantIdOf);
  const g = [authenticate, guard];

  router.get('/notifications', ...g, h.listNotifications);
  router.get('/notifications/unread-count', ...g, h.notificationsUnreadCount);
  router.post('/notifications/read-all', ...g, h.markAllNotificationsRead);
  router.post('/notifications/:id/read', ...g, h.markNotificationRead);

  router.get('/messages/unread-count', ...g, h.messagesUnreadCount);
  router.get('/messages/directory', ...g, h.directory);
  router.get('/messages/conversations', ...g, h.listConversations);
  router.post('/messages/conversations', ...g, messagingSendRateLimiter, h.createConversation);
  router.get('/messages/conversations/:id', ...g, h.getConversation);
  router.get('/messages/conversations/:id/messages', ...g, h.listMessages);
  router.post('/messages/conversations/:id/messages', ...g, messagingSendRateLimiter, h.sendMessage);
  router.post('/messages/conversations/:id/read', ...g, h.markConversationRead);
  router.post('/messages/conversations/:id/participants', ...g, messagingSendRateLimiter, h.addParticipants);
  router.delete('/messages/conversations/:id/participants/me', ...g, h.leaveConversation);

  return router;
}

/** L'agence est celle que la garde a résolue (jamais l'en-tête brut). */
export const coOwnerPortalInboxRouter = createPortalInboxRouter(
  requireCoOwnerPortalAccess,
  req => req.coOwnerPortal?.scope.tenantId ?? getCurrentTenantId()
);
export const tenantPortalInboxRouter = createPortalInboxRouter(
  requireTenantPortalAccess,
  req => req.tenantPortal?.tenantId
);
export const ownerPortalInboxRouter = createPortalInboxRouter(
  requireOwnerPortalAccess,
  req => req.ownerPortal?.tenantId
);
