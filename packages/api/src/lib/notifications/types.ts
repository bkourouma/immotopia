/**
 * Types du service central de notifications (menu lot 3).
 *
 * Contrat : `notify` ecrit la notification D'ABORD (persist-first), puis tente
 * chaque canal ; l'echec d'un canal n'annule jamais la notification.
 */

export type NotificationChannelKey = 'IN_APP' | 'EMAIL' | 'WHATSAPP' | 'SMS';
export type NotificationStatusKey = 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'SKIPPED';

export const NOTIFICATION_CHANNELS: readonly NotificationChannelKey[] = ['IN_APP', 'EMAIL', 'WHATSAPP', 'SMS'];

export interface NotifyRecipient {
  /** Destinataire ayant un compte. */
  userId?: string;
  /** Destinataire sans compte : contact CRM. */
  contactId?: string;
  /** Libelle fige ; a defaut, deduit du compte. */
  label?: string;
  email?: string;
  phone?: string;
}

export interface NotifyInput {
  tenantId: string;
  recipients: NotifyRecipient[];
  /** Cle metier (ex. MAINTENANCE_TICKET_CREATED_TENANT). */
  key: string;
  title: string;
  body: string;
  link?: string;
  /** Defaut : ['IN_APP']. */
  channels?: NotificationChannelKey[];
  senderUserId?: string;
  metadata?: Record<string, unknown>;
  relatedEntity?: { type: string; id: string };
  /** Pour le canal WHATSAPP. */
  whatsapp?: { notificationKey: string; variables: Record<string, string> };
}

/** Resultat d'un envoi. `void` vaut SENT. */
export type DeliveryOutcome = {
  status: 'SENT' | 'SKIPPED' | 'FAILED';
  providerMessageId?: string;
  failureReason?: string;
} | void;

export interface LogNotificationDeliveryInput {
  tenantId: string;
  recipient: NotifyRecipient;
  key: string;
  title: string;
  body: string;
  link?: string;
  channel: NotificationChannelKey;
  target?: string;
  senderUserId?: string;
  relatedEntity?: { type: string; id: string };
  resendPayload?: Record<string, unknown>;
  /** `false` : le message ne doit jamais etre rejoue (lien, code, corps generique...). */
  replayable?: boolean;
  /** Adresse masquee dans le journal (prelevements) : la livraison n'est alors pas rejouable. */
  redactTarget?: boolean;
  /** Envoi existant : son erreur est relancee telle quelle a l'appelant. */
  run: () => Promise<DeliveryOutcome>;
}

/** Ce qu'on garde dans `NotificationDelivery.resendPayload` pour rejouer un envoi. */
export interface ResendPayload {
  /** `false` : jamais rejoue (voir `LogNotificationDeliveryInput.replayable`). */
  replayable?: boolean;
  whatsapp?: { notificationKey: string; variables: Record<string, string> };
  contactId?: string;
  [extra: string]: unknown;
}

// ---------------------------------------------------------------------------
// Formes de lecture (contrat REST)
// ---------------------------------------------------------------------------

export interface NotificationItem {
  id: string;
  key: string;
  title: string;
  body: string;
  link: string | null;
  status: NotificationStatusKey;
  failureReason: string | null;
  readAt: string | null;
  sentAt: string | null;
  createdAt: string;
  deliveries: Array<{ channel: NotificationChannelKey; status: NotificationStatusKey; failureReason: string | null }>;
}

export interface AdminNotificationItem extends Omit<NotificationItem, 'deliveries'> {
  recipient: { userId: string | null; label: string };
  sender: { userId: string; label: string } | null;
  relatedEntity: { type: string; id: string } | null;
  deliveries: Array<{
    channel: NotificationChannelKey;
    status: NotificationStatusKey;
    target: string | null;
    failureReason: string | null;
    attempts: number;
    lastAttemptAt: string | null;
    sentAt: string | null;
  }>;
}

export type AdminNotificationDetail = AdminNotificationItem;

export interface PlatformNotificationItem extends AdminNotificationItem {
  tenant: { id: string; name: string };
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminNotificationFilters {
  recipientUserId?: string;
  senderUserId?: string;
  channel?: NotificationChannelKey;
  status?: NotificationStatusKey;
  q?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

export interface PlatformNotificationFilters extends AdminNotificationFilters {
  tenantId?: string;
}
