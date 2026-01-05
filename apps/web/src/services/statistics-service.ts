import apiClient from '../utils/api-client';

export interface GlobalStatistics {
  totalTenants: number;
  activeTenants: number;
  suspendedTenants: number;
  totalCollaborators: number;
  activeCollaborators: number;
  totalSubscriptions: number;
  activeSubscriptions: number;
  cancelledSubscriptions: number;
  moduleActivations: Record<string, number>;
}

export interface TenantActivityStats {
  totalProperties: number;
  totalClients: number;
  totalCollaborators: number;
  activeModules: number;
  lastActivity: string;
}

export interface GlobalStatisticsResponse {
  success: boolean;
  data: GlobalStatistics;
}

export interface TenantActivityStatsResponse {
  success: boolean;
  data: TenantActivityStats;
}

// Get global statistics (admin only)
export async function getGlobalStatistics(): Promise<GlobalStatisticsResponse> {
  const response = await apiClient.get('/admin/statistics');
  return response.data;
}

// Get tenant activity statistics
export async function getTenantActivityStats(
  tenantId: string
): Promise<TenantActivityStatsResponse> {
  const response = await apiClient.get(`/admin/tenants/${tenantId}/stats`);
  return response.data;
}





