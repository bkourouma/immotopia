/**
 * API publique du service central de notifications (menu lot 3).
 * Les appelants importent d'ici : `notify`, `logNotificationDelivery`,
 * `resendNotification`, plus les lectures pour les routes.
 */
export { notify } from './notify';
export type { NotifyResult } from './notify';
export { logNotificationDelivery } from './log-delivery';
export { resendNotification } from './resend';
export {
  countUnread,
  getAdminNotification,
  getPlatformNotification,
  listAdminNotifications,
  listMyNotifications,
  listNotificationRecipients,
  listPlatformNotifications,
  markAllRead,
  markRead
} from './queries';
export { aggregateStatus } from './deliver';
export { MESSAGE_NOTIFICATION_KEY } from './keys';
export * from './types';
