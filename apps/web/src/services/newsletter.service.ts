import apiClient from '../utils/api-client';

/** Liste de diffusion */
export interface NewsletterList {
  id: string;
  tenantId: string;
  name: string;
  type: 'MANUAL' | 'FROM_OWNERS' | 'FROM_RENTERS' | 'FROM_CRM_CONTACTS';
  doubleOptIn: boolean;
  publicSubscribeToken: string | null;
  totalCount?: number;
  activeCount?: number;
  unsubscribedCount?: number;
  createdAt: string;
  updatedAt: string;
}

/** Abonné */
export interface NewsletterSubscriber {
  id: string;
  email: string;
  name: string | null;
  status: 'PENDING_CONFIRMATION' | 'ACTIVE' | 'UNSUBSCRIBED';
  subscribedAt: string;
  confirmedAt: string | null;
  unsubscribedAt: string | null;
}

/** Template */
export interface NewsletterTemplate {
  id: string;
  name: string;
  html: string;
  createdAt: string;
  updatedAt: string;
}

/** Campagne */
export interface NewsletterCampaign {
  id: string;
  listId: string;
  listName?: string;
  templateId: string | null;
  subject: string;
  bodyHtml?: string;
  status: 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'CANCELLED' | 'FAILED';
  scheduledAt: string | null;
  sentAt: string | null;
  sentCount?: number;
  openCount?: number;
  failedCount?: number;
  unsubscribeCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  subscribers?: T[];
  campaigns?: T[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

export interface ImportResult {
  accepted: number;
  rejected: number;
  duplicateCount: number;
  errors: string[];
}

export const newsletterService = {
  // Lists
  async listLists(tenantId: string): Promise<NewsletterList[]> {
    const { data } = await apiClient.get<NewsletterList[]>(`/tenants/${tenantId}/newsletter/lists`);
    return Array.isArray(data) ? data : [];
  },

  async createList(tenantId: string, payload: { name: string; type: string; doubleOptIn?: boolean }): Promise<NewsletterList> {
    const { data } = await apiClient.post<NewsletterList>(`/tenants/${tenantId}/newsletter/lists`, payload);
    return data;
  },

  async getList(tenantId: string, listId: string): Promise<NewsletterList | null> {
    const { data } = await apiClient.get<NewsletterList>(`/tenants/${tenantId}/newsletter/lists/${listId}`);
    return data;
  },

  async updateList(tenantId: string, listId: string, payload: { name?: string; doubleOptIn?: boolean }): Promise<NewsletterList> {
    const { data } = await apiClient.patch<NewsletterList>(`/tenants/${tenantId}/newsletter/lists/${listId}`, payload);
    return data;
  },

  async deleteList(tenantId: string, listId: string): Promise<void> {
    await apiClient.delete(`/tenants/${tenantId}/newsletter/lists/${listId}`);
  },

  // Subscribers
  async listSubscribers(
    tenantId: string,
    listId: string,
    opts?: { status?: string; page?: number; limit?: number }
  ): Promise<{ subscribers: NewsletterSubscriber[]; pagination: { total: number; page: number; limit: number; totalPages: number } }> {
    const params = new URLSearchParams();
    if (opts?.status) params.set('status', opts.status);
    if (opts?.page) params.set('page', String(opts.page));
    if (opts?.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    const { data } = await apiClient.get<{ subscribers: NewsletterSubscriber[]; pagination: object }>(
      `/tenants/${tenantId}/newsletter/lists/${listId}/subscribers${qs ? `?${qs}` : ''}`
    );
    return data as { subscribers: NewsletterSubscriber[]; pagination: { total: number; page: number; limit: number; totalPages: number } };
  },

  async addSubscriber(tenantId: string, listId: string, payload: { email: string; name?: string }): Promise<NewsletterSubscriber> {
    const { data } = await apiClient.post<NewsletterSubscriber>(
      `/tenants/${tenantId}/newsletter/lists/${listId}/subscribers`,
      payload
    );
    return data;
  },

  async importCsv(tenantId: string, listId: string, file: File): Promise<ImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await apiClient.post<ImportResult>(
      `/tenants/${tenantId}/newsletter/lists/${listId}/import`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return data;
  },

  async exportCsv(tenantId: string, listId: string): Promise<Blob> {
    const { data } = await apiClient.get<Blob>(`/tenants/${tenantId}/newsletter/lists/${listId}/export`, {
      responseType: 'blob'
    });
    return data;
  },

  async removeSubscriber(tenantId: string, subscriberId: string): Promise<void> {
    await apiClient.delete(`/tenants/${tenantId}/newsletter/subscribers/${subscriberId}`);
  },

  /** Add subscribers to a manual list from CRM contact IDs */
  async addSubscribersFromContacts(
    tenantId: string,
    listId: string,
    contactIds: string[]
  ): Promise<{ added: number; skipped: number; errors: string[] }> {
    const { data } = await apiClient.post<{ added: number; skipped: number; errors: string[] }>(
      `/tenants/${tenantId}/newsletter/lists/${listId}/subscribers/from-contacts`,
      { contactIds }
    );
    return data;
  },

  // Templates
  async listTemplates(tenantId: string): Promise<NewsletterTemplate[]> {
    const { data } = await apiClient.get<NewsletterTemplate[]>(`/tenants/${tenantId}/newsletter/templates`);
    return Array.isArray(data) ? data : [];
  },

  async createTemplate(tenantId: string, payload: { name: string; html: string }): Promise<NewsletterTemplate> {
    const { data } = await apiClient.post<NewsletterTemplate>(`/tenants/${tenantId}/newsletter/templates`, payload);
    return data;
  },

  async getTemplate(tenantId: string, templateId: string): Promise<NewsletterTemplate | null> {
    const { data } = await apiClient.get<NewsletterTemplate>(`/tenants/${tenantId}/newsletter/templates/${templateId}`);
    return data;
  },

  async updateTemplate(tenantId: string, templateId: string, payload: { name?: string; html?: string }): Promise<NewsletterTemplate> {
    const { data } = await apiClient.patch<NewsletterTemplate>(
      `/tenants/${tenantId}/newsletter/templates/${templateId}`,
      payload
    );
    return data;
  },

  async deleteTemplate(tenantId: string, templateId: string): Promise<void> {
    await apiClient.delete(`/tenants/${tenantId}/newsletter/templates/${templateId}`);
  },

  // Campaigns
  async listCampaigns(
    tenantId: string,
    opts?: { status?: string; page?: number; limit?: number }
  ): Promise<{ campaigns: NewsletterCampaign[]; pagination: { total: number; page: number; limit: number; totalPages: number } }> {
    const params = new URLSearchParams();
    if (opts?.status) params.set('status', opts.status);
    if (opts?.page) params.set('page', String(opts.page));
    if (opts?.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    const { data } = await apiClient.get<{ campaigns: NewsletterCampaign[]; pagination: object }>(
      `/tenants/${tenantId}/newsletter/campaigns${qs ? `?${qs}` : ''}`
    );
    return data as { campaigns: NewsletterCampaign[]; pagination: { total: number; page: number; limit: number; totalPages: number } };
  },

  async createCampaign(
    tenantId: string,
    payload: { listId: string; templateId?: string; subject: string; bodyHtml: string }
  ): Promise<NewsletterCampaign> {
    const { data } = await apiClient.post<NewsletterCampaign>(`/tenants/${tenantId}/newsletter/campaigns`, payload);
    return data;
  },

  async getCampaign(tenantId: string, campaignId: string): Promise<NewsletterCampaign | null> {
    const { data } = await apiClient.get<NewsletterCampaign>(`/tenants/${tenantId}/newsletter/campaigns/${campaignId}`);
    return data;
  },

  async updateCampaign(
    tenantId: string,
    campaignId: string,
    payload: { subject?: string; bodyHtml?: string; templateId?: string }
  ): Promise<NewsletterCampaign> {
    const { data } = await apiClient.patch<NewsletterCampaign>(
      `/tenants/${tenantId}/newsletter/campaigns/${campaignId}`,
      payload
    );
    return data;
  },

  async sendCampaign(tenantId: string, campaignId: string): Promise<NewsletterCampaign> {
    const { data } = await apiClient.post<NewsletterCampaign>(
      `/tenants/${tenantId}/newsletter/campaigns/${campaignId}/send`
    );
    return data;
  },

  async scheduleCampaign(tenantId: string, campaignId: string, scheduledAt: string): Promise<NewsletterCampaign> {
    const { data } = await apiClient.post<NewsletterCampaign>(
      `/tenants/${tenantId}/newsletter/campaigns/${campaignId}/schedule`,
      { scheduledAt }
    );
    return data;
  },

  async cancelCampaign(tenantId: string, campaignId: string): Promise<NewsletterCampaign> {
    const { data } = await apiClient.post<NewsletterCampaign>(
      `/tenants/${tenantId}/newsletter/campaigns/${campaignId}/cancel`
    );
    return data;
  },

  async getPreview(tenantId: string, campaignId: string): Promise<{ subject: string; html: string }> {
    const { data } = await apiClient.get<{ subject: string; html: string }>(
      `/tenants/${tenantId}/newsletter/campaigns/${campaignId}/preview`
    );
    return data;
  },

  async getCampaignRecipients(
    tenantId: string,
    campaignId: string,
    opts?: { page?: number; limit?: number }
  ): Promise<{ recipients: Array<{ email: string; status: string }>; pagination: object }> {
    const params = new URLSearchParams();
    if (opts?.page) params.set('page', String(opts.page));
    if (opts?.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    const { data } = await apiClient.get(`/tenants/${tenantId}/newsletter/campaigns/${campaignId}/recipients${qs ? `?${qs}` : ''}`);
    return data as { recipients: Array<{ email: string; status: string }>; pagination: object };
  }
};
