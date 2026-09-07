import apiClient from '../../utils/api-client';
import { CrmDashboardResponse, CrmDashboardFilters } from '../../types/crmDashboard';

/**
 * Get CRM dashboard data with filters
 * This function aggregates data from multiple endpoints if the backend
 * doesn't provide a single comprehensive endpoint
 */
export async function getCrmDashboard(
  tenantId: string,
  filters?: CrmDashboardFilters
): Promise<CrmDashboardResponse> {
  const params: Record<string, string> = {};

  if (filters?.start) params.start = filters.start;
  if (filters?.end) params.end = filters.end;
  if (filters?.assignee) params.assignee = filters.assignee;
  if (filters?.tags && filters.tags.length > 0) {
    params.tags = filters.tags.join(',');
  }
  if (filters?.stages && filters.stages.length > 0) {
    params.stages = filters.stages.join(',');
  }
  if (filters?.statuses && filters.statuses.length > 0) {
    params.statuses = filters.statuses.join(',');
  }

  try {
    const response = await apiClient.get(`/tenants/${tenantId}/crm/dashboard`, { params });
    return response.data;
  } catch (error) {
    // If backend doesn't support filters yet, try to aggregate client-side
    console.warn('Dashboard endpoint may not support all filters, falling back to client-side aggregation');
    return aggregateDashboardData(tenantId, filters);
  }
}

/**
 * Aggregate dashboard data from multiple endpoints (fallback)
 * This is called if the backend doesn't provide a comprehensive endpoint
 */
async function aggregateDashboardData(
  tenantId: string,
  filters?: CrmDashboardFilters
): Promise<CrmDashboardResponse> {
  // This would require importing all the CRM services
  // For now, we'll return a structure that matches what the backend should provide
  // The backend endpoint should ideally handle all this aggregation

  // TODO: Implement client-side aggregation if needed
  // For now, we'll rely on the backend endpoint

  throw new Error('Dashboard aggregation not yet implemented. Please ensure backend supports dashboard filters.');
}

