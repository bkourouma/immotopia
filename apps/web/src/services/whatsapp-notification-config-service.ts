import apiClient from '../utils/api-client';

export interface WhatsappNotificationConfigItem {
  key: string;
  label: string;
  description: string;
  recipientLabel: string;
  enabled: boolean;
  bodyOverride: string | null;
  contentSid: string | null;
  contentVariablesJson: string | null;
  configId: string | null;
  tenantId: string | null;
  defaultBody: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface UpdateWhatsappNotificationPayload {
  enabled?: boolean;
  bodyOverride?: string | null;
  contentSid?: string | null;
  contentVariablesJson?: string | null;
}

export interface SendWhatsappTestPayload {
  to: string;
  message: string;
}

export interface SendWhatsappGroupInviteBulkResult {
  totalEligible: number;
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
}

export interface SendWhatsappGroupBroadcastPayload {
  message?: string;
  image?: File | null;
}

export interface SendWhatsappGroupBroadcastResult {
  provider?: string | null;
  target?: string;
  messageId?: string | null;
  mediaUrl?: string | null;
  usedFallbackTextOnly?: boolean;
}

export const whatsappNotificationConfigService = {
  async list(tenantId: string): Promise<WhatsappNotificationConfigItem[]> {
    const { data } = await apiClient.get<{ success: boolean; data: WhatsappNotificationConfigItem[] }>(
      `/tenants/${tenantId}/whatsapp-notifications`
    );
    if (!data.success || !data.data) throw new Error('Invalid response');
    return data.data;
  },

  async update(
    tenantId: string,
    key: string,
    payload: UpdateWhatsappNotificationPayload
  ): Promise<WhatsappNotificationConfigItem> {
    const { data } = await apiClient.patch<{ success: boolean; data: WhatsappNotificationConfigItem }>(
      `/tenants/${tenantId}/whatsapp-notifications/${encodeURIComponent(key)}`,
      payload
    );
    if (!data.success || !data.data) throw new Error('Invalid response');
    return data.data;
  },

  async reset(tenantId: string, key: string): Promise<void> {
    const { data } = await apiClient.post<{ success: boolean }>(
      `/tenants/${tenantId}/whatsapp-notifications/${encodeURIComponent(key)}/reset`
    );
    if (!data.success) throw new Error('Invalid response');
  },

  async sendTest(tenantId: string, payload: SendWhatsappTestPayload): Promise<{ messageId?: string | null }> {
    const { data } = await apiClient.post<{
      success: boolean;
      data?: { messageId?: string | null };
      message?: string;
    }>(`/tenants/${tenantId}/whatsapp-notifications/test-send`, payload);
    if (!data.success) throw new Error(data.message || 'Invalid response');
    return data.data || {};
  },

  async sendGroupInviteToAll(
    tenantId: string,
    options?: { limit?: number; force?: boolean }
  ): Promise<SendWhatsappGroupInviteBulkResult> {
    const { data } = await apiClient.post<{
      success: boolean;
      data?: SendWhatsappGroupInviteBulkResult;
      message?: string;
    }>(`/tenants/${tenantId}/whatsapp-notifications/group-invite/send-all`, {
      limit: options?.limit,
      force: options?.force
    });
    if (!data.success || !data.data) throw new Error(data.message || 'Invalid response');
    return data.data;
  },

  async sendGroupBroadcast(
    tenantId: string,
    payload: SendWhatsappGroupBroadcastPayload
  ): Promise<SendWhatsappGroupBroadcastResult> {
    const formData = new FormData();
    if (typeof payload.message === 'string') {
      formData.append('message', payload.message);
    }
    if (payload.image) {
      formData.append('image', payload.image);
    }

    const { data } = await apiClient.post<{
      success: boolean;
      data?: SendWhatsappGroupBroadcastResult;
      message?: string;
    }>(`/tenants/${tenantId}/whatsapp-notifications/group-broadcast/send`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });

    if (!data.success || !data.data) throw new Error(data.message || 'Invalid response');
    return data.data;
  }
};
