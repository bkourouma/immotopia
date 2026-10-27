import type { Request } from 'express';
import { asyncHandler, BadRequestError, UnauthorizedError } from '../middleware/error-middleware';
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
  markRead,
  sendMessage,
  sendMessageSchema,
  unreadCount
} from '../lib/messaging';
import type { MessagingActor } from '../lib/messaging';

/**
 * Messagerie interne, cote agence (audience STAFF).
 *
 * L'agence est celle de `req.tenantContext` (posee par `requireTenantAccess`),
 * jamais un champ du corps ou de la requete. Un administrateur ou un
 * super-admin n'a aucun acces special au contenu : le service n'ouvre une
 * conversation qu'a ses participants.
 */
function actorOf(req: Request): MessagingActor {
  const tenantId = req.tenantContext?.tenantId;
  if (!tenantId) throw new BadRequestError("Contexte d'agence requis.");
  const userId = req.user?.userId;
  if (!userId) throw new UnauthorizedError();
  return { tenantId, userId, audience: 'STAFF' };
}

export const listConversationsHandler = asyncHandler(async (req, res) => {
  const query = listConversationsQuerySchema.parse(req.query);
  res.status(200).json({ success: true, data: await listConversations(actorOf(req), query) });
});

export const createConversationHandler = asyncHandler(async (req, res) => {
  const input = createConversationSchema.parse(req.body ?? {});
  res.status(201).json({ success: true, data: await createConversation(actorOf(req), input) });
});

export const getConversationHandler = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, data: await getConversation(actorOf(req), String(req.params.id)) });
});

export const listMessagesHandler = asyncHandler(async (req, res) => {
  const query = listMessagesQuerySchema.parse(req.query);
  res.status(200).json({ success: true, data: await listMessages(actorOf(req), String(req.params.id), query) });
});

export const sendMessageHandler = asyncHandler(async (req, res) => {
  const { body } = sendMessageSchema.parse(req.body ?? {});
  res.status(201).json({ success: true, data: await sendMessage(actorOf(req), String(req.params.id), body) });
});

export const markReadHandler = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, data: await markRead(actorOf(req), String(req.params.id)) });
});

export const addParticipantsHandler = asyncHandler(async (req, res) => {
  const { userIds } = addParticipantsSchema.parse(req.body ?? {});
  res.status(200).json({ success: true, data: await addParticipants(actorOf(req), String(req.params.id), userIds) });
});

export const leaveConversationHandler = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, data: await leaveConversation(actorOf(req), String(req.params.id)) });
});

export const unreadCountHandler = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, data: await unreadCount(actorOf(req)) });
});

export const directoryHandler = asyncHandler(async (req, res) => {
  const { q } = directoryQuerySchema.parse(req.query);
  res.status(200).json({ success: true, data: await directory(actorOf(req), q) });
});
