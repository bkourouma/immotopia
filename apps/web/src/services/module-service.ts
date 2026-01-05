import apiClient from '../utils/api-client';

export interface TenantModule {
  id: string;
  tenantId: string;
  moduleKey: string;
  enabled: boolean;
  enabledAt?: string;
  enabledBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateTenantModulesRequest {
  modules: Array<{
    moduleKey: string;
    enabled: boolean;
  }>;
}

export interface TenantModulesResponse {
  success: boolean;
  data: {
    modules: TenantModule[];
  };
}

// Get tenant modules
export async function getTenantModules(tenantId: string): Promise<TenantModulesResponse> {
  const response = await apiClient.get(`/admin/tenants/${tenantId}/modules`);
  return response.data;
}

// Update tenant modules
export async function updateTenantModules(
  tenantId: string,
  data: UpdateTenantModulesRequest
): Promise<TenantModulesResponse> {
  const response = await apiClient.patch(`/admin/tenants/${tenantId}/modules`, data);
  return response.data;
}





