import apiClient from '../utils/api-client';

/**
 * Notifications persistantes (lot 3) : centre de notifications du collaborateur
 * (ou d'un portail), journal d'envoi de l'agence et journal de la plateforme.
 *
 * Toutes les réponses sont enveloppées dans `{ success, data }`. Le même
 * service sert l'agence et les portails : seul le préfixe d'URL change.
 */

export type NotificationScope =
  { kind: 'agency'; tenantId: string } | { kind: 'portal'; portal: 'copropriete' | 'tenant' | 'owner' };

export type NotificationChannelKey = 'IN_APP' | 'EMAIL' | 'WHATSAPP' | 'SMS';
export type NotificationStatusKey = 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'SKIPPED';

export const NOTIFICATION_CHANNELS: NotificationChannelKey[] = ['IN_APP', 'EMAIL', 'WHATSAPP', 'SMS'];
export const NOTIFICATION_STATUSES: NotificationStatusKey[] = ['PENDING', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED'];

export interface NotificationDeliverySummary {
  channel: NotificationChannelKey;
  status: NotificationStatusKey;
  failureReason: string | null;
}

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
  deliveries: NotificationDeliverySummary[];
}

export interface NotificationPage<T = NotificationItem> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminNotificationDelivery extends NotificationDeliverySummary {
  target: string | null;
  attempts: number;
  lastAttemptAt: string | null;
  sentAt: string | null;
}

export interface AdminNotificationItem extends Omit<NotificationItem, 'deliveries'> {
  recipient: { userId: string | null; label: string };
  sender: { userId: string; label: string } | null;
  relatedEntity: { type: string; id: string } | null;
  deliveries: AdminNotificationDelivery[];
}

export interface PlatformNotificationItem extends AdminNotificationItem {
  tenant: { id: string; name: string };
}

export interface NotificationRecipientOption {
  userId: string;
  label: string;
}

export interface NotificationListParams {
  unreadOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface AdminNotificationFilters {
  recipientUserId?: string;
  senderUserId?: string;
  channel?: NotificationChannelKey;
  status?: NotificationStatusKey;
  q?: string;
  /** Date ISO ou `YYYY-MM-DD`. */
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface PlatformNotificationFilters extends AdminNotificationFilters {
  tenantId?: string;
}

interface Envelope<T> {
  success: boolean;
  data: T;
}

/** Préfixe d'URL du scope : l'agence passe par son identifiant, un portail par sa session. */
export function notificationBasePath(scope: NotificationScope): string {
  return scope.kind === 'agency' ? `/tenants/${scope.tenantId}` : `/portal/${scope.portal}`;
}

/** Ne garde que les paramètres définis et non vides. */
function definedParams(source: object): Record<string, string | number | boolean> {
  const params: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === null || value === '') continue;
    params[key] = value as string | number | boolean;
  }
  return params;
}

export async function listMyNotifications(
  scope: NotificationScope,
  params: NotificationListParams = {}
): Promise<NotificationPage> {
  const response = await apiClient.get<Envelope<NotificationPage>>(`${notificationBasePath(scope)}/notifications`, {
    params: definedParams(params)
  });
  return response.data.data;
}

export async function getUnreadCount(scope: NotificationScope): Promise<number> {
  const response = await apiClient.get<Envelope<{ count: number }>>(
    `${notificationBasePath(scope)}/notifications/unread-count`
  );
  return response.data.data.count;
}

export async function markRead(scope: NotificationScope, id: string): Promise<{ id: string; readAt: string }> {
  const response = await apiClient.post<Envelope<{ id: string; readAt: string }>>(
    `${notificationBasePath(scope)}/notifications/${id}/read`
  );
  return response.data.data;
}

export async function markAllRead(scope: NotificationScope): Promise<{ updated: number }> {
  const response = await apiClient.post<Envelope<{ updated: number }>>(
    `${notificationBasePath(scope)}/notifications/read-all`
  );
  return response.data.data;
}

// --- Journal d'envoi de l'agence (permission TENANT_NOTIFICATIONS_ADMIN) ---

export async function listAdminNotifications(
  tenantId: string,
  filters: AdminNotificationFilters = {}
): Promise<NotificationPage<AdminNotificationItem>> {
  const response = await apiClient.get<Envelope<NotificationPage<AdminNotificationItem>>>(
    `/tenants/${tenantId}/admin/notifications`,
    { params: definedParams(filters) }
  );
  return response.data.data;
}

export async function getAdminNotification(tenantId: string, id: string): Promise<AdminNotificationItem> {
  const response = await apiClient.get<Envelope<AdminNotificationItem>>(
    `/tenants/${tenantId}/admin/notifications/${id}`
  );
  return response.data.data;
}

export async function resendNotification(
  tenantId: string,
  id: string,
  channels?: NotificationChannelKey[]
): Promise<AdminNotificationItem> {
  const response = await apiClient.post<Envelope<AdminNotificationItem>>(
    `/tenants/${tenantId}/admin/notifications/${id}/resend`,
    channels && channels.length > 0 ? { channels } : {}
  );
  return response.data.data;
}

export async function listNotificationRecipients(tenantId: string, q?: string): Promise<NotificationRecipientOption[]> {
  const response = await apiClient.get<Envelope<NotificationRecipientOption[]>>(
    `/tenants/${tenantId}/admin/notifications/recipients`,
    { params: definedParams({ q }) }
  );
  return response.data.data;
}

// --- Journal de la plateforme (super-admin) ---

export async function listPlatformNotifications(
  filters: PlatformNotificationFilters = {}
): Promise<NotificationPage<PlatformNotificationItem>> {
  const response = await apiClient.get<Envelope<NotificationPage<PlatformNotificationItem>>>('/admin/notifications', {
    params: definedParams(filters)
  });
  return response.data.data;
}

export async function getPlatformNotification(id: string): Promise<PlatformNotificationItem> {
  const response = await apiClient.get<Envelope<PlatformNotificationItem>>(`/admin/notifications/${id}`);
  return response.data.data;
}

export async function resendPlatformNotification(
  id: string,
  channels?: NotificationChannelKey[]
): Promise<PlatformNotificationItem> {
  const response = await apiClient.post<Envelope<PlatformNotificationItem>>(
    `/admin/notifications/${id}/resend`,
    channels && channels.length > 0 ? { channels } : {}
  );
  return response.data.data;
}
