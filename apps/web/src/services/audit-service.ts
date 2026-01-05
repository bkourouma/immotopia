import apiClient from '../utils/api-client';

export interface AuditLog {
  id: string;
  userId: string;
  tenantId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
  user?: {
    id: string;
    email: string;
    fullName: string | null;
  };
  tenant?: {
    id: string;
    name: string;
  };
}

export interface AuditFilters {
  userId?: string;
  tenantId?: string;
  action?: string;
  resourceType?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface AuditLogListResponse {
  success: boolean;
  data: {
    logs: AuditLog[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

// Get audit logs (admin only)
export async function getAuditLogs(filters?: AuditFilters): Promise<AuditLogListResponse> {
  const response = await apiClient.get('/admin/audit', { params: filters });
  return response.data;
}





