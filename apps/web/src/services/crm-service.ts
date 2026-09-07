import apiClient from '../utils/api-client';
import {
  Contact,
  ContactDetail,
  CreateContactRequest,
  UpdateContactRequest,
  ContactFilters,
  Deal,
  CreateDealRequest,
  UpdateDealRequest,
  DealFilters,
  Activity,
  CreateActivityRequest,
  ActivityFilters,
  Tag,
  PropertyMatch,
  UpdatePropertyMatchStatusRequest,
  Dashboard,
  // Type aliases
  CrmContact,
  CrmContactDetail,
  CreateCrmContactRequest,
  UpdateCrmContactRequest,
  CrmDeal,
  CreateCrmDealRequest,
  UpdateCrmDealRequest,
  CrmActivity,
  CreateCrmActivityRequest,
  CrmTag,
} from '../types/crm-types';

// Note: All functions require tenantId as a parameter
// In components, get tenantId from AuthContext: const { tenantMembership } = useAuth(); const tenantId = tenantMembership?.tenantId;

// Re-export types for convenience
export type {
  CrmContact,
  CrmContactDetail,
  CreateCrmContactRequest,
  UpdateCrmContactRequest,
  ContactFilters,
  CrmDeal,
  CrmDealDetail,
  CreateCrmDealRequest,
  UpdateCrmDealRequest,
  DealFilters,
  CrmActivity,
  CreateCrmActivityRequest,
  ActivityFilters,
  CrmTag,
  PropertyMatch,
  UpdatePropertyMatchStatusRequest,
  Dashboard,
  NextBestAction,
  CrmDealPropertyStatus,
} from '../types/crm-types';

// ==================== CONTACTS ====================

export interface ContactListResponse {
  success: boolean;
  contacts: CrmContact[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ContactResponse {
  success: boolean;
  data: CrmContactDetail;
}

export async function listContacts(
  tenantId: string,
  filters?: ContactFilters
): Promise<ContactListResponse> {
  const response = await apiClient.get(`/tenants/${tenantId}/crm/contacts`, {
    params: filters,
  });
  return response.data;
}

export async function getContact(
  tenantId: string,
  contactId: string
): Promise<ContactResponse> {
  const response = await apiClient.get(
    `/tenants/${tenantId}/crm/contacts/${contactId}`
  );
  return response.data;
}

export async function createContact(
  tenantId: string,
  data: CreateCrmContactRequest
): Promise<ContactResponse> {
  const response = await apiClient.post(
    `/tenants/${tenantId}/crm/contacts`,
    data
  );
  return response.data;
}

export async function updateContact(
  tenantId: string,
  contactId: string,
  data: UpdateCrmContactRequest
): Promise<ContactResponse> {
  const response = await apiClient.patch(
    `/tenants/${tenantId}/crm/contacts/${contactId}`,
    data
  );
  return response.data;
}

export async function deleteContact(
  tenantId: string,
  contactId: string
): Promise<{ success: boolean; message?: string }> {
  const response = await apiClient.delete(
    `/tenants/${tenantId}/crm/contacts/${contactId}`
  );
  return response.data;
}

export async function getContactTags(
  tenantId: string,
  contactId: string
): Promise<{ success: boolean; data: CrmTag[] }> {
  const response = await apiClient.get(
    `/tenants/${tenantId}/crm/contacts/${contactId}/tags`
  );
  return response.data;
}

export async function assignTag(
  tenantId: string,
  contactId: string,
  tagId: string
): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.post(
    `/tenants/${tenantId}/crm/contacts/${contactId}/tags`,
    { tagId }
  );
  return response.data;
}

export async function removeTag(
  tenantId: string,
  contactId: string,
  tagId: string
): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.delete(
    `/tenants/${tenantId}/crm/contacts/${contactId}/tags/${tagId}`
  );
  return response.data;
}

export async function listTags(
  tenantId: string
): Promise<{ success: boolean; data: CrmTag[] }> {
  const response = await apiClient.get(
    `/tenants/${tenantId}/crm/tags`
  );
  return response.data;
}

export async function createTag(
  tenantId: string,
  name: string,
  color?: string
): Promise<{ success: boolean; data: CrmTag }> {
  const response = await apiClient.post(
    `/tenants/${tenantId}/crm/tags`,
    { name, color }
  );
  return response.data;
}

export async function convertContact(
  tenantId: string,
  contactId: string,
  roles: string[]
): Promise<ContactResponse> {
  const response = await apiClient.post(
    `/tenants/${tenantId}/crm/contacts/${contactId}/convert`,
    { roles }
  );
  return response.data;
}

export async function removeContactRole(
  tenantId: string,
  contactId: string,
  roleId: string
): Promise<{ success: boolean; data: any }> {
  const response = await apiClient.delete(
    `/tenants/${tenantId}/crm/contacts/${contactId}/roles/${roleId}`
  );
  return response.data;
}

export async function updateContactRoles(
  tenantId: string,
  contactId: string,
  roles: string[]
): Promise<ContactResponse> {
  const response = await apiClient.patch(
    `/tenants/${tenantId}/crm/contacts/${contactId}/roles`,
    { roles }
  );
  return response.data;
}

// ==================== DEALS ====================

export interface DealListResponse {
  success: boolean;
  deals: CrmDeal[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface DealResponse {
  success: boolean;
  data: CrmDeal;
}

export async function listDeals(
  tenantId: string,
  filters?: DealFilters
): Promise<DealListResponse> {
  const response = await apiClient.get(`/tenants/${tenantId}/crm/deals`, {
    params: filters,
  });
  return response.data;
}

export async function getDeal(
  tenantId: string,
  dealId: string
): Promise<DealResponse> {
  const response = await apiClient.get(
    `/tenants/${tenantId}/crm/deals/${dealId}`
  );
  return response.data;
}

export async function createDeal(
  tenantId: string,
  data: CreateCrmDealRequest
): Promise<DealResponse> {
  const response = await apiClient.post(
    `/tenants/${tenantId}/crm/deals`,
    data
  );
  return response.data;
}

export async function updateDeal(
  tenantId: string,
  dealId: string,
  data: UpdateCrmDealRequest
): Promise<DealResponse> {
  const response = await apiClient.patch(
    `/tenants/${tenantId}/crm/deals/${dealId}`,
    data
  );
  return response.data;
}

// ==================== ACTIVITIES ====================

export interface ActivityListResponse {
  success: boolean;
  activities: CrmActivity[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ActivityResponse {
  success: boolean;
  data: CrmActivity;
}

export async function listActivities(
  tenantId: string,
  filters?: ActivityFilters
): Promise<ActivityListResponse> {
  const response = await apiClient.get(`/tenants/${tenantId}/crm/activities`, {
    params: filters,
  });
  return response.data;
}

export async function createActivity(
  tenantId: string,
  data: CreateCrmActivityRequest
): Promise<ActivityResponse> {
  const response = await apiClient.post(
    `/tenants/${tenantId}/crm/activities`,
    data
  );
  return response.data;
}

// ==================== APPOINTMENTS ====================

// ==================== PROPERTY MATCHING ====================

export interface MatchPropertiesResponse {
  success: boolean;
  matches: PropertyMatch[];
}

export interface PropertyMatchesResponse {
  success: boolean;
  matches: any[]; // CrmDealProperty[]
}

export async function matchProperties(
  tenantId: string,
  dealId: string,
  threshold?: number,
  limit?: number
): Promise<MatchPropertiesResponse> {
  const response = await apiClient.post(
    `/tenants/${tenantId}/crm/deals/${dealId}/match`,
    { threshold, limit }
  );
  return response.data;
}

export async function getMatches(
  tenantId: string,
  dealId: string
): Promise<PropertyMatchesResponse> {
  const response = await apiClient.get(
    `/tenants/${tenantId}/crm/deals/${dealId}/matches`
  );
  return response.data;
}

export async function addPropertyToShortlist(
  tenantId: string,
  dealId: string,
  propertyId: string,
  matchScore: number,
  matchExplanation: any
): Promise<{ success: boolean; data: any }> {
  const response = await apiClient.post(
    `/tenants/${tenantId}/crm/deals/${dealId}/properties`,
    { propertyId, matchScore, matchExplanation }
  );
  return response.data;
}

export async function updatePropertyStatus(
  tenantId: string,
  dealId: string,
  propertyId: string,
  status: UpdatePropertyMatchStatusRequest['status']
): Promise<{ success: boolean; data: any }> {
  const response = await apiClient.post(
    `/tenants/${tenantId}/crm/deals/${dealId}/properties/${propertyId}/status`,
    { status }
  );
  return response.data;
}

// ==================== DASHBOARD ====================

export interface DashboardResponse {
  success: boolean;
  data: Dashboard;
}

export async function getDashboard(
  tenantId: string,
  assignedToUserId?: string
): Promise<DashboardResponse> {
  const response = await apiClient.get(
    `/tenants/${tenantId}/crm/dashboard`,
    {
      params: assignedToUserId ? { assignedTo: assignedToUserId } : {},
    }
  );
  return response.data;
}

// ==================== CALENDAR ====================

export type CalendarEventType = 'APPOINTMENT' | 'FOLLOWUP' | 'PROPERTY_VISIT';
export type CalendarScope = 'GLOBAL' | 'MINE';

export interface CalendarEvent {
  eventId: string;
  eventType: CalendarEventType;
  start: string; // ISO date string
  end: string | null; // ISO date string or null for follow-ups
  title: string;
  contactId: string;
  contactName: string;
  dealId: string | null;
  dealLabel: string | null;
  status?: string;
  badges: string[];
  canEdit: boolean;
  canDrag: boolean;
  appointmentType?: string;
  nextActionType?: string;
  location?: string;
  assignedToUserId?: string | null;
  createdByUserId: string;
  propertyId?: string | null; // For property visits
}

export interface CalendarResponse {
  success: boolean;
  events: CalendarEvent[];
}

export interface CalendarFilters {
  from: Date;
  to: Date;
  scope?: CalendarScope;
  types?: ('appointments' | 'followups' | 'propertyVisits')[];
}

export async function getCalendarEvents(
  tenantId: string,
  filters: CalendarFilters
): Promise<CalendarResponse> {
  const response = await apiClient.get(`/tenants/${tenantId}/crm/calendar`, {
    params: {
      from: filters.from.toISOString(),
      to: filters.to.toISOString(),
      scope: filters.scope || 'GLOBAL',
      types: filters.types ? filters.types.join(',') : undefined,
    },
  });
  return response.data;
}

export interface RescheduleFollowUpRequest {
  nextActionAt: Date;
}

export async function rescheduleFollowUp(
  tenantId: string,
  activityId: string,
  data: RescheduleFollowUpRequest
): Promise<ActivityResponse> {
  const response = await apiClient.patch(
    `/tenants/${tenantId}/crm/activities/${activityId}/next-action`,
    {
      nextActionAt: data.nextActionAt.toISOString(),
    }
  );
  return response.data;
}

export async function markFollowUpDone(
  tenantId: string,
  activityId: string
): Promise<ActivityResponse> {
  const response = await apiClient.patch(
    `/tenants/${tenantId}/crm/activities/${activityId}/mark-done`
  );
  return response.data;
}

