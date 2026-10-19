import { asyncHandler, BadRequestError, UnauthorizedError } from '../middleware/error-middleware';
import {
  getAdminNotification,
  getPlatformNotification,
  listAdminNotifications,
  listNotificationRecipients,
  listPlatformNotifications
} from '../lib/notifications/queries';
import { resendNotification } from '../lib/notifications/resend';
import {
  adminNotificationsQuerySchema,
  notificationIdParamSchema,
  platformNotificationsQuerySchema,
  recipientsQuerySchema,
  resendBodySchema
} from '../lib/notifications/schemas';
import type { AdminNotificationDetail } from '../lib/notifications/types';
import { logAuditEvent } from '../services/audit-service';
import { AuditActionKey } from '../types/audit-types';

/**
 * Journal des notifications : administrateur d'agence (TENANT_NOTIFICATIONS_ADMIN)
 * et super-administrateur de la plateforme.
 *
 * Côté agence, l'agence vient de `req.tenantContext` et jamais de la requête
 * (les schémas refusent `tenantId`). Côté plateforme, `tenantId` est un simple
 * filtre de lecture ; le renvoi s'applique à l'agence PORTÉE par la notification.
 */
function tenantScope(req: { tenantContext?: { tenantId?: string } }): string {
  const tenantId = req.tenantContext?.tenantId;
  if (!tenantId) throw new BadRequestError("Contexte d'agence requis.");
  return tenantId;
}

function traceResend(
  tenantId: string,
  actorUserId: string | undefined,
  notificationId: string,
  channels: string[] | undefined,
  level: 'TENANT' | 'PLATFORM',
  result: AdminNotificationDetail
): void {
  logAuditEvent({
    actorUserId: actorUserId ?? null,
    tenantId,
    actionKey: AuditActionKey.NOTIFICATION_RESENT,
    entityType: 'UserNotification',
    entityId: notificationId,
    payload: {
      level,
      channels: channels ?? null,
      key: result.key,
      status: result.status,
      deliveries: result.deliveries.map(d => ({ channel: d.channel, status: d.status }))
    }
  });
}

// --- Agence --------------------------------------------------------------

export const listAdminNotificationsHandler = asyncHandler(async (req, res) => {
  const tenantId = tenantScope(req);
  const filters = adminNotificationsQuerySchema.parse(req.query);
  res.status(200).json({ success: true, data: await listAdminNotifications(tenantId, filters) });
});

export const listRecipientsHandler = asyncHandler(async (req, res) => {
  const tenantId = tenantScope(req);
  const { q } = recipientsQuerySchema.parse(req.query);
  res.status(200).json({ success: true, data: await listNotificationRecipients(tenantId, q) });
});

export const getAdminNotificationHandler = asyncHandler(async (req, res) => {
  const tenantId = tenantScope(req);
  const { id } = notificationIdParamSchema.parse(req.params);
  res.status(200).json({ success: true, data: await getAdminNotification(tenantId, id) });
});

export const resendAdminNotificationHandler = asyncHandler(async (req, res) => {
  const tenantId = tenantScope(req);
  const { id } = notificationIdParamSchema.parse(req.params);
  const { channels } = resendBodySchema.parse(req.body ?? {});
  const data = await resendNotification({ tenantId, notificationId: id, channels });
  traceResend(tenantId, req.user?.userId, id, channels, 'TENANT', data);
  res.status(200).json({ success: true, data });
});

// --- Plateforme ----------------------------------------------------------

export const listPlatformNotificationsHandler = asyncHandler(async (req, res) => {
  const filters = platformNotificationsQuerySchema.parse(req.query);
  res.status(200).json({ success: true, data: await listPlatformNotifications(filters) });
});

export const getPlatformNotificationHandler = asyncHandler(async (req, res) => {
  const { id } = notificationIdParamSchema.parse(req.params);
  res.status(200).json({ success: true, data: await getPlatformNotification(id) });
});

export const resendPlatformNotificationHandler = asyncHandler(async (req, res) => {
  if (!req.user?.userId) throw new UnauthorizedError();
  const { id } = notificationIdParamSchema.parse(req.params);
  const { channels } = resendBodySchema.parse(req.body ?? {});
  const found = await getPlatformNotification(id);
  const data = await resendNotification({ tenantId: found.tenant.id, notificationId: id, channels });
  traceResend(found.tenant.id, req.user.userId, id, channels, 'PLATFORM', data);
  res.status(200).json({ success: true, data: { ...data, tenant: found.tenant } });
});
