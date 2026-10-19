import { asyncHandler, BadRequestError, UnauthorizedError } from '../middleware/error-middleware';
import { countUnread, listMyNotifications, markAllRead, markRead } from '../lib/notifications/queries';
import { myNotificationsQuerySchema, notificationIdParamSchema } from '../lib/notifications/schemas';

/**
 * Boite de reception de l'utilisateur connecte (agence).
 * L'agence vient de `req.tenantContext`, l'utilisateur de `req.user` : jamais
 * de la requete. Un utilisateur ne voit et ne marque que SES notifications.
 */
function scope(req: { tenantContext?: { tenantId?: string }; user?: { userId?: string } }) {
  const tenantId = req.tenantContext?.tenantId;
  if (!tenantId) throw new BadRequestError("Contexte d'agence requis.");
  const userId = req.user?.userId;
  if (!userId) throw new UnauthorizedError();
  return { tenantId, userId };
}

export const listMyNotificationsHandler = asyncHandler(async (req, res) => {
  const { tenantId, userId } = scope(req);
  const query = myNotificationsQuerySchema.parse(req.query);
  const data = await listMyNotifications({ tenantId, userId, ...query });
  res.status(200).json({ success: true, data });
});

export const countUnreadHandler = asyncHandler(async (req, res) => {
  const { tenantId, userId } = scope(req);
  const count = await countUnread(tenantId, userId);
  res.status(200).json({ success: true, data: { count } });
});

export const markReadHandler = asyncHandler(async (req, res) => {
  const { tenantId, userId } = scope(req);
  const { id } = notificationIdParamSchema.parse(req.params);
  const data = await markRead(tenantId, userId, id);
  res.status(200).json({ success: true, data });
});

export const markAllReadHandler = asyncHandler(async (req, res) => {
  const { tenantId, userId } = scope(req);
  const data = await markAllRead(tenantId, userId);
  res.status(200).json({ success: true, data });
});
