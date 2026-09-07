import apiClient from '../utils/api-client';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  legalName?: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
  contactEmail?: string;
  contactPhone?: string;
  country?: string;
  city?: string;
  address?: string;
  brandingPrimaryColor?: string;
  subdomain?: string;
  customDomain?: string;
  website?: string;
  lastActivityAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TenantFilters {
  status?: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
  type?: string;
  plan?: string;
  module?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface TenantStats {
  totalProperties: number;
  totalClients: number;
  totalCollaborators: number;
  activeModules: number;
  lastActivity: string;
}

export interface CreateTenantRequest {
  name: string;
  type: 'AGENCY' | 'OPERATOR';
  legalName?: string;
  contactEmail?: string;
  contactPhone?: string;
  country?: string;
  city?: string;
  address?: string;
  brandingPrimaryColor?: string;
  subdomain?: string;
  customDomain?: string;
}

export interface UpdateTenantRequest {
  name?: string;
  legalName?: string;
  contactEmail?: string;
  contactPhone?: string;
  country?: string;
  city?: string;
  address?: string;
  brandingPrimaryColor?: string;
  subdomain?: string;
  customDomain?: string;
  website?: string;
  status?: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE';
}

export interface TenantListResponse {
  success: boolean;
  data: {
    tenants: Tenant[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

export interface TenantResponse {
  success: boolean;
  data: Tenant;
}

export interface TenantStatsResponse {
  success: boolean;
  data: TenantStats;
}

// List all tenants (admin only)
export async function listTenants(filters?: TenantFilters): Promise<TenantListResponse> {
  const response = await apiClient.get('/admin/tenants', { params: filters });
  return response.data;
}

// Get tenant by ID (public endpoint, no admin required)
export async function getTenant(tenantId: string): Promise<TenantResponse> {
  const response = await apiClient.get(`/tenants/${tenantId}`);
  return response.data;
}

// Get tenant by ID (admin only)
export async function getTenantAdmin(tenantId: string): Promise<TenantResponse> {
  const response = await apiClient.get(`/admin/tenants/${tenantId}`);
  return response.data;
}

// Create tenant (admin only)
export async function createTenant(data: CreateTenantRequest): Promise<TenantResponse> {
  const response = await apiClient.post('/admin/tenants', data);
  return response.data;
}

// Update tenant (admin only)
export async function updateTenant(
  tenantId: string,
  data: UpdateTenantRequest
): Promise<TenantResponse> {
  const response = await apiClient.patch(`/admin/tenants/${tenantId}`, data);
  return response.data;
}

// Update tenant (self - for tenant members)
export async function updateTenantSelf(
  tenantId: string,
  data: Omit<UpdateTenantRequest, 'status' | 'subdomain' | 'customDomain'>
): Promise<TenantResponse> {
  const response = await apiClient.patch(`/tenants/${tenantId}`, data);
  return response.data;
}

// Suspend tenant (admin only)
export async function suspendTenant(tenantId: string): Promise<TenantResponse> {
  const response = await apiClient.post(`/admin/tenants/${tenantId}/suspend`);
  return response.data;
}

// Activate tenant (admin only)
export async function activateTenant(tenantId: string): Promise<TenantResponse> {
  const response = await apiClient.post(`/admin/tenants/${tenantId}/activate`);
  return response.data;
}

// Get tenant statistics
export async function getTenantStats(tenantId: string): Promise<TenantStatsResponse> {
  const response = await apiClient.get(`/admin/tenants/${tenantId}/stats`);
  return response.data;
}

// Client types
export interface TenantClient {
  id: string;
  userId: string;
  tenantId: string;
  clientType: 'OWNER' | 'RENTER' | 'BUYER' | 'CO_OWNER';
  details?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    avatarUrl?: string;
  };
}

export interface TenantClientsResponse {
  success: boolean;
  data: TenantClient[];
}

// Get all clients for a tenant
export async function getTenantClients(tenantId: string): Promise<TenantClientsResponse> {
  const response = await apiClient.get(`/tenants/${tenantId}/clients`);
  return response.data;
}




