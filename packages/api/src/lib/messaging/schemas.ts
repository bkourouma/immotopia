import { z } from 'zod';

/** Aucun `tenantId` accepte : l'agence vient de `req.tenantContext`. */
export const MAX_MESSAGE_LENGTH = 5000;
export const MAX_PARTICIPANTS = 50;
/** Plafond total des groupes qui contiennent un client. */
export const MAX_CLIENT_GROUP_PARTICIPANTS = 5;

const messageBody = z.string().trim().min(1).max(MAX_MESSAGE_LENGTH);
const userIds = z.array(z.string().trim().min(1).max(64)).min(1).max(MAX_PARTICIPANTS);

export const listConversationsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20)
  })
  .strict();

export const createConversationSchema = z
  .object({
    participantUserIds: userIds,
    title: z.string().trim().min(1).max(120).optional(),
    firstMessage: messageBody.optional()
  })
  .strict();

export const listMessagesQuerySchema = z
  .object({
    before: z.string().trim().min(1).max(64).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30)
  })
  .strict();

export const sendMessageSchema = z.object({ body: messageBody }).strict();

export const addParticipantsSchema = z.object({ userIds }).strict();

export const directoryQuerySchema = z.object({ q: z.string().trim().max(100).optional() }).strict();

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
