/**
 * Types du service de messagerie interne (menu lot 3).
 *
 * Un participant est toujours un `User` de l'agence : membre ACTIF (STAFF) ou
 * client portail (CLIENT, `TenantClient.userId`).
 */

export type MessagingAudience = 'STAFF' | 'CLIENT';
export type ParticipantKind = 'STAFF' | 'CLIENT';

/** Identite de l'appelant : le tenantId vient TOUJOURS du contexte serveur. */
export interface MessagingActor {
  tenantId: string;
  userId: string;
  audience: MessagingAudience;
}

export interface ParticipantSummary {
  userId: string;
  label: string;
  kind: ParticipantKind;
}

export interface ConversationSummary {
  id: string;
  kind: 'DIRECT' | 'GROUP';
  title: string | null;
  participants: ParticipantSummary[];
  lastMessage: { id: string; body: string; authorUserId: string; createdAt: string } | null;
  unreadCount: number;
  lastMessageAt: string | null;
  updatedAt: string;
}

export interface MessageItem {
  id: string;
  authorUserId: string;
  authorLabel: string;
  body: string;
  createdAt: string;
  mine: boolean;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DirectoryEntry {
  userId: string;
  label: string;
  kind: ParticipantKind;
}
