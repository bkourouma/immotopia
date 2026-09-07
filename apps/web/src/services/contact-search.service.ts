import apiClient from '../utils/api-client';

export interface ContactSearchFilters {
  searchQuery?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  whatsappNumber?: string;
  city?: string;
  district?: string;
  communeIds?: string[];
  locationZones?: string[];
  country?: string;
  contactTypes?: ('PERSON' | 'COMPANY')[];
  statuses?: ('LEAD' | 'ACTIVE_CLIENT' | 'ARCHIVED')[];
  maturityLevels?: ('COLD' | 'WARM' | 'HOT')[];
  scoreMin?: number;
  scoreMax?: number;
  assignedToUserIds?: string[];
  unassigned?: boolean;
  priorityLevels?: ('LOW' | 'NORMAL' | 'HIGH')[];
  preferredContactChannels?: ('CALL' | 'WHATSAPP' | 'EMAIL' | 'SMS')[];
  professions?: string[];
  sectorsOfActivity?: string[];
  jobStabilities?: string[];
  incomeMin?: number;
  incomeMax?: number;
  borrowingCapacities?: ('YES' | 'NO' | 'UNKNOWN')[];
  balanceMin?: number;
  balanceMax?: number;
  hasPaymentIncidents?: boolean;
  dealTypes?: ('ACHAT' | 'LOCATION' | 'VENTE' | 'GESTION' | 'MANDAT')[];
  dealStages?: ('NEW' | 'QUALIFIED' | 'VISIT' | 'NEGOTIATION' | 'WON' | 'LOST')[];
  budgetMin?: number;
  budgetMax?: number;
  propertyTypes?: string[];
  roomsMin?: number;
  roomsMax?: number;
  surfaceMin?: number;
  surfaceMax?: number;
  hasGarden?: boolean;
  hasParking?: boolean;
  hasPool?: boolean;
  targetCommuneIds?: string[];
  tagIds?: string[];
  hasAnyTag?: boolean;
  hasAllTags?: boolean;
  roles?: ('PROPRIETAIRE' | 'LOCATAIRE' | 'COPROPRIETAIRE' | 'ACQUEREUR')[];
  hasActiveRole?: boolean;
  consentMarketing?: boolean;
  consentWhatsapp?: boolean;
  consentEmail?: boolean;
  createdAfter?: string;
  createdBefore?: string;
  lastInteractionAfter?: string;
  lastInteractionBefore?: string;
  nextActionAfter?: string;
  nextActionBefore?: string;
  hasNextAction?: boolean;
  hasActivityInLastDays?: number;
  activityTypes?: string[];
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'score' | 'lastInteraction' | 'createdAt' | 'nextAction';
  sortOrder?: 'asc' | 'desc';
}

export interface ContactSearchResultItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phonePrimary?: string;
  whatsappNumber?: string;
  contactType: string;
  status: string;
  maturityLevel?: string;
  score?: number;
  assignedTo?: { id: string; fullName: string | null; avatarUrl: string | null };
  commune?: { id: string; name: string };
  tags: Array<{ id: string; name: string; color: string | null }>;
  activeDeals: Array<{ id: string; type: string; stage: string; budgetMin?: unknown; budgetMax?: unknown }>;
  roles: Array<{ role: string; active: boolean }>;
  lastInteractionAt?: string;
  nextActionAt?: string;
}

export interface ContactSearchResponse {
  contacts: ContactSearchResultItem[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
  appliedFilters: ContactSearchFilters;
}

export interface SavedSearchItem {
  id: string;
  name: string;
  description: string | null;
  filters: ContactSearchFilters;
  scope: string;
  useCount: number;
  lastUsedAt: string | null;
  createdBy?: { id: string; fullName: string | null; avatarUrl: string | null };
}

const contactSearchService = {
  async search(tenantId: string, filters: ContactSearchFilters): Promise<ContactSearchResponse> {
    const { data } = await apiClient.post<ContactSearchResponse>(
      `/tenants/${tenantId}/crm/contacts-search/search`,
      { filters }
    );
    return data;
  },

  async getSuggestions(tenantId: string, field: string, query?: string): Promise<string[]> {
    const params = query ? { query } : {};
    const { data } = await apiClient.get<string[]>(
      `/tenants/${tenantId}/crm/contacts-search/suggestions/${field}`,
      { params }
    );
    return Array.isArray(data) ? data : [];
  },

  async getSavedSearches(tenantId: string): Promise<SavedSearchItem[]> {
    const { data } = await apiClient.get<SavedSearchItem[]>(
      `/tenants/${tenantId}/crm/contacts-search/saved`
    );
    return Array.isArray(data) ? data : [];
  },

  async saveSearch(
    tenantId: string,
    payload: { name: string; description?: string; filters: ContactSearchFilters; scope?: 'PERSONAL' | 'TEAM' | 'TENANT' }
  ): Promise<SavedSearchItem> {
    const { data } = await apiClient.post<SavedSearchItem>(
      `/tenants/${tenantId}/crm/contacts-search/saved`,
      payload
    );
    return data;
  },

  async useSavedSearch(tenantId: string, searchId: string): Promise<ContactSearchResponse> {
    const { data } = await apiClient.post<ContactSearchResponse>(
      `/tenants/${tenantId}/crm/contacts-search/saved/${searchId}/use`
    );
    return data;
  },

  async deleteSavedSearch(tenantId: string, searchId: string): Promise<void> {
    await apiClient.delete(`/tenants/${tenantId}/crm/contacts-search/saved/${searchId}`);
  },

  async exportSearch(tenantId: string, filters: ContactSearchFilters): Promise<Blob> {
    const { data } = await apiClient.post<Blob>(
      `/tenants/${tenantId}/crm/contacts-search/export`,
      { filters },
      { responseType: 'blob' }
    );
    return data;
  }
};

export default contactSearchService;
