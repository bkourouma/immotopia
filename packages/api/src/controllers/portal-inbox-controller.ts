import type { Request } from 'express';
import { prisma } from '../utils/database';
import { asyncHandler, ForbiddenError, UnauthorizedError } from '../middleware/error-middleware';
import {
  countUnread,
  listMyNotifications,
  markAllRead,
  markRead as markNotificationRead
} from '../lib/notifications/queries';
import { myNotificationsQuerySchema, notificationIdParamSchema } from '../lib/notifications/schemas';
import {
  addParticipants,
  addParticipantsSchema,
  createConversation,
  createConversationSchema,
  directory,
  directoryQuerySchema,
  getConversation,
  leaveConversation,
  listConversations,
  listConversationsQuerySchema,
  listMessages,
  listMessagesQuerySchema,
  markRead as markConversationRead,
  sendMessage,
  sendMessageSchema,
  unreadCount
} from '../lib/messaging';
import type { MessagingActor } from '../lib/messaging';

/** Lit l'agence résolue PAR LA GARDE du portail (jamais la requête). */
export type PortalTenantResolver = (req: Request) => string | undefined;

/**
 * Notifications et messagerie des portails (copropriétaire, locataire,
 * propriétaire). L'agence vient de la garde de portail, l'utilisateur de la
 * session ; l'audience est toujours 'CLIENT' : un client ne joint que le
 * personnel de son agence. Même forme JSON que les routes d'agence.
 */
export function createPortalInboxHandlers(tenantIdOf: PortalTenantResolver) {
  // Le jeton peut survivre a la desactivation du compte : on relit `isActive` a chaque appel
  // (un compte desactive est refuse comme par les gardes de portail).
  const scope = async (req: Request) => {
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedError();
    const tenantId = tenantIdOf(req);
    if (!tenantId) throw new ForbiddenError('Accès portail refusé.');
    const account = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true } });
    if (!account?.isActive) throw new ForbiddenError('Accès portail refusé.');
    return { tenantId, userId };
  };
  const actorOf = async (req: Request): Promise<MessagingActor> => ({ ...(await scope(req)), audience: 'CLIENT' });

  return {
    listNotifications: asyncHandler(async (req, res) => {
      const query = myNotificationsQuerySchema.parse(req.query);
      res.status(200).json({ success: true, data: await listMyNotifications({ ...(await scope(req)), ...query }) });
    }),
    notificationsUnreadCount: asyncHandler(async (req, res) => {
      const { tenantId, userId } = await scope(req);
      res.status(200).json({ success: true, data: { count: await countUnread(tenantId, userId) } });
    }),
    markNotificationRead: asyncHandler(async (req, res) => {
      const { tenantId, userId } = await scope(req);
      const { id } = notificationIdParamSchema.parse(req.params);
      res.status(200).json({ success: true, data: await markNotificationRead(tenantId, userId, id) });
    }),
    markAllNotificationsRead: asyncHandler(async (req, res) => {
      const { tenantId, userId } = await scope(req);
      res.status(200).json({ success: true, data: await markAllRead(tenantId, userId) });
    }),

    listConversations: asyncHandler(async (req, res) => {
      const query = listConversationsQuerySchema.parse(req.query);
      res.status(200).json({ success: true, data: await listConversations(await actorOf(req), query) });
    }),
    createConversation: asyncHandler(async (req, res) => {
      const input = createConversationSchema.parse(req.body ?? {});
      res.status(201).json({ success: true, data: await createConversation(await actorOf(req), input) });
    }),
    getConversation: asyncHandler(async (req, res) => {
      res.status(200).json({ success: true, data: await getConversation(await actorOf(req), String(req.params.id)) });
    }),
    listMessages: asyncHandler(async (req, res) => {
      const query = listMessagesQuerySchema.parse(req.query);
      res
        .status(200)
        .json({ success: true, data: await listMessages(await actorOf(req), String(req.params.id), query) });
    }),
    sendMessage: asyncHandler(async (req, res) => {
      const { body } = sendMessageSchema.parse(req.body ?? {});
      res.status(201).json({ success: true, data: await sendMessage(await actorOf(req), String(req.params.id), body) });
    }),
    markConversationRead: asyncHandler(async (req, res) => {
      res
        .status(200)
        .json({ success: true, data: await markConversationRead(await actorOf(req), String(req.params.id)) });
    }),
    addParticipants: asyncHandler(async (req, res) => {
      const { userIds } = addParticipantsSchema.parse(req.body ?? {});
      res
        .status(200)
        .json({ success: true, data: await addParticipants(await actorOf(req), String(req.params.id), userIds) });
    }),
    leaveConversation: asyncHandler(async (req, res) => {
      res.status(200).json({ success: true, data: await leaveConversation(await actorOf(req), String(req.params.id)) });
    }),
    messagesUnreadCount: asyncHandler(async (req, res) => {
      res.status(200).json({ success: true, data: await unreadCount(await actorOf(req)) });
    }),
    directory: asyncHandler(async (req, res) => {
      const { q } = directoryQuerySchema.parse(req.query);
      res.status(200).json({ success: true, data: await directory(await actorOf(req), q) });
    })
  };
}
