/**
 * API publique de la messagerie interne (menu lot 3). Partagee par les routes
 * d'agence (audience 'STAFF') et, plus tard, par celles des portails ('CLIENT').
 */
export {
  addParticipants,
  createConversation,
  getConversation,
  leaveConversation,
  listConversations
} from './conversations';
export { listMessages, markRead, sendMessage, unreadCount, MESSAGE_NOTIFICATION_KEY } from './messages';
export { directory } from './identity';
export * from './schemas';
export * from './types';
