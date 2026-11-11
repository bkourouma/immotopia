import apiClient from '../utils/api-client';

export type SubscriptionStatusKey = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'SUSPENDED';

/** Reponse de GET /api/admin/statistics (packages/api/src/services/statistics-service.ts). */
export interface GlobalStatistics {
  totalTenants: number;
  activeTenants: number;
  suspendedTenants: number;
  pendingTenants: number;
  totalCollaborators: number;
  activeCollaborators: number;
  totalSubscriptions: number;
  subscriptionsByPlan: { BASIC: number; PRO: number; ELITE: number };
  subscriptionsByStatus: Record<SubscriptionStatusKey, number>;
  moduleActivations: Record<string, number>;
  recentActivity: {
    tenantsCreatedLast30Days: number;
    lastLoginDate: string | null;
  };
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
export async function getTenantActivityStats(tenantId: string): Promise<TenantActivityStatsResponse> {
  const response = await apiClient.get(`/admin/tenants/${tenantId}/stats`);
  return response.data;
}
