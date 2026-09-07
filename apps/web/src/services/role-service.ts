import apiClient from '../utils/api-client';

export interface Role {
  id: string;
  key: string;
  name: string;
  description?: string;
  scope: 'PLATFORM' | 'TENANT';
  permissions?: Permission[];
}

export interface Permission {
  id: string;
  key: string;
  description?: string;
}

export interface UpdateRolePermissionsRequest {
  permissionIds: string[];
}

/**
 * List all roles
 */
export async function listRoles(scope?: 'PLATFORM' | 'TENANT'): Promise<Role[]> {
  const response = await apiClient.get('/roles', {
    params: scope ? { scope } : {}
  });
  return response.data.data;
}

/**
 * Get role with permissions
 */
export async function getRole(roleId: string): Promise<Role> {
  const response = await apiClient.get(`/roles/${roleId}`);
  return response.data.data;
}

/**
 * List all permissions
 */
export async function listPermissions(): Promise<Permission[]> {
  const response = await apiClient.get('/roles/permissions/all');
  return response.data.data;
}

/**
 * Update role permissions
 */
export async function updateRolePermissions(
  roleId: string,
  permissionIds: string[]
): Promise<Role> {
  const response = await apiClient.patch(`/roles/${roleId}/permissions`, {
    permissionIds
  });
  return response.data.data;
}

