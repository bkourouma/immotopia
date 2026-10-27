import { activeLocale } from '../../i18n/format';
import { t } from '../../i18n/t';
import type { ConversationSummary, MessagingParticipant } from '../../services/messaging-service';

/** Titre affiché : titre du groupe, sinon les autres participants. */
export function conversationTitle(conversation: ConversationSummary, currentUserId?: string | null): string {
  if (conversation.title) return conversation.title;
  const others = conversation.participants.filter(p => p.userId !== currentUserId);
  const names = (others.length > 0 ? others : conversation.participants).map(p => p.label);
  return names.length > 0 ? names.join(', ') : t('Conversation');
}

export function participantKindLabel(kind: MessagingParticipant['kind']): string {
  return kind === 'STAFF' ? t('Équipe') : t('Client');
}

/** Tri par activité décroissante (dernier message, à défaut dernière mise à jour). */
export function sortByActivity(items: ConversationSummary[]): ConversationSummary[] {
  const stamp = (c: ConversationSummary) => new Date(c.lastMessageAt ?? c.updatedAt).getTime() || 0;
  return [...items].sort((a, b) => stamp(b) - stamp(a));
}

export function formatMessageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString(activeLocale(), { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString(activeLocale(), { day: '2-digit', month: '2-digit' });
}
