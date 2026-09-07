import apiClient from '../utils/api-client';

export interface EmailNotificationConfigItem {
  key: string;
  label: string;
  description: string;
  recipientLabel: string;
  enabled: boolean;
  subjectOverride: string | null;
  bodyHtmlOverride: string | null;
  configId: string | null;
  tenantId: string | null;
  /** Template par défaut (sujet + corps) défini dans le code */
  defaultSubject: string;
  defaultBodyHtml: string;
  /** Champs de la table email_notification_configs */
  createdAt: string | null;
  updatedAt: string | null;
}

export interface UpdateEmailNotificationPayload {
  enabled?: boolean;
  subjectOverride?: string | null;
  bodyHtmlOverride?: string | null;
}

export const emailNotificationConfigService = {
  async list(tenantId: string): Promise<EmailNotificationConfigItem[]> {
    const { data } = await apiClient.get<{ success: boolean; data: EmailNotificationConfigItem[] }>(
      `/tenants/${tenantId}/email-notifications`
    );
    if (!data.success || !data.data) throw new Error('Invalid response');
    return data.data;
  },

  async update(
    tenantId: string,
    key: string,
    payload: UpdateEmailNotificationPayload
  ): Promise<EmailNotificationConfigItem> {
    const { data } = await apiClient.patch<{ success: boolean; data: EmailNotificationConfigItem }>(
      `/tenants/${tenantId}/email-notifications/${encodeURIComponent(key)}`,
      payload
    );
    if (!data.success || !data.data) throw new Error('Invalid response');
    return data.data;
  },

  async reset(tenantId: string, key: string): Promise<void> {
    const { data } = await apiClient.post<{ success: boolean }>(
      `/tenants/${tenantId}/email-notifications/${encodeURIComponent(key)}/reset`
    );
    if (!data.success) throw new Error('Invalid response');
  }
};
