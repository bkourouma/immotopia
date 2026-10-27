import apiClient from '../utils/api-client';
import { announceUnreadCountsChanged } from '../utils/unread-counts-event';

/**
 * Messagerie interne (lot 3). Mêmes formes JSON pour l'agence
 * (`/tenants/:tenantId/messages`) et les portails (`/portal/<portail>/messages`),
 * d'où le `scope` qui choisit la base de chemin.
 */

export type MessagingScope =
  { kind: 'agency'; tenantId: string } | { kind: 'portal'; portal: 'copropriete' | 'tenant' | 'owner' };

export type ParticipantKind = 'STAFF' | 'CLIENT';
export type ConversationKind = 'DIRECT' | 'GROUP';

export interface MessagingParticipant {
  userId: string;
  label: string;
  kind: ParticipantKind;
}

export interface ConversationLastMessage {
  id: string;
  body: string;
  authorUserId: string;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  kind: ConversationKind;
  title: string | null;
  participants: MessagingParticipant[];
  lastMessage: ConversationLastMessage | null;
  unreadCount: number;
  lastMessageAt: string | null;
  updatedAt: string;
}

export interface ConversationPage {
  items: ConversationSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ThreadMessage {
  id: string;
  authorUserId: string;
  authorLabel: string;
  body: string;
  createdAt: string;
  mine: boolean;
}

export interface MessagePage {
  items: ThreadMessage[];
  hasMore: boolean;
}

export interface CreateConversationInput {
  participantUserIds: string[];
  title?: string;
  firstMessage?: string;
}

export const MESSAGE_MAX_LENGTH = 5000;

function basePath(scope: MessagingScope): string {
  return scope.kind === 'agency' ? `/tenants/${scope.tenantId}/messages` : `/portal/${scope.portal}/messages`;
}

/** Réponses lues enveloppées (`{ success, data }`) ou nues. */
function unwrap<T>(body: unknown): T {
  const wrapped = body as { data?: T } | null | undefined;
  return (
    wrapped && typeof wrapped === 'object' && 'data' in wrapped && wrapped.data !== undefined ? wrapped.data : body
  ) as T;
}

export async function listConversations(
  scope: MessagingScope,
  params: { page?: number; pageSize?: number } = {}
): Promise<ConversationPage> {
  const response = await apiClient.get(`${basePath(scope)}/conversations`, { params });
  return unwrap<ConversationPage>(response.data);
}

export async function createConversation(
  scope: MessagingScope,
  input: CreateConversationInput
): Promise<ConversationSummary> {
  const response = await apiClient.post(`${basePath(scope)}/conversations`, input);
  return unwrap<ConversationSummary>(response.data);
}

export async function getConversation(scope: MessagingScope, conversationId: string): Promise<ConversationSummary> {
  const response = await apiClient.get(`${basePath(scope)}/conversations/${conversationId}`);
  return unwrap<ConversationSummary>(response.data);
}

export async function listMessages(
  scope: MessagingScope,
  conversationId: string,
  params: { before?: string; limit?: number } = {}
): Promise<MessagePage> {
  const response = await apiClient.get(`${basePath(scope)}/conversations/${conversationId}/messages`, { params });
  return unwrap<MessagePage>(response.data);
}

export async function sendMessage(scope: MessagingScope, conversationId: string, body: string): Promise<ThreadMessage> {
  const response = await apiClient.post(`${basePath(scope)}/conversations/${conversationId}/messages`, { body });
  return unwrap<ThreadMessage>(response.data);
}

export async function markConversationRead(
  scope: MessagingScope,
  conversationId: string
): Promise<{ lastReadAt: string }> {
  const response = await apiClient.post(`${basePath(scope)}/conversations/${conversationId}/read`);
  // Le serveur lit aussi la notification de message : la cloche doit se mettre a jour.
  announceUnreadCountsChanged();
  return unwrap<{ lastReadAt: string }>(response.data);
}

export async function addParticipants(
  scope: MessagingScope,
  conversationId: string,
  userIds: string[]
): Promise<ConversationSummary> {
  const response = await apiClient.post(`${basePath(scope)}/conversations/${conversationId}/participants`, {
    userIds
  });
  return unwrap<ConversationSummary>(response.data);
}

export async function leaveConversation(scope: MessagingScope, conversationId: string): Promise<void> {
  await apiClient.delete(`${basePath(scope)}/conversations/${conversationId}/participants/me`);
}

export async function getDirectory(scope: MessagingScope, q = ''): Promise<MessagingParticipant[]> {
  const response = await apiClient.get(`${basePath(scope)}/directory`, { params: q ? { q } : {} });
  return unwrap<MessagingParticipant[]>(response.data);
}

/** Nombre de conversations avec au moins un message non lu (pastille de l'en-tête). */
export async function getMessagingUnreadCount(scope: MessagingScope): Promise<number> {
  const response = await apiClient.get(`${basePath(scope)}/unread-count`);
  const data = unwrap<{ count?: number }>(response.data);
  return typeof data?.count === 'number' ? data.count : 0;
}
