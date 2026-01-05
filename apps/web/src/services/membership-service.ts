import apiClient from '../utils/api-client';

export interface Member {
  id: string;
  userId: string;
  tenantId: string;
  status: 'ACTIVE' | 'PENDING_INVITE' | 'DISABLED';
  invitedAt?: string;
  invitedBy?: string;
  acceptedAt?: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    fullName: string | null;
    avatarUrl: string | null;
    isActive: boolean;
    emailVerified: boolean;
    lastLoginAt: string | null;
  };
  roles: Array<{
    id: string;
    key: string;
    name: string;
    description: string | null;
    scope: 'PLATFORM' | 'TENANT';
  }>;
}

export interface MembershipFilters {
  search?: string;
  status?: 'ACTIVE' | 'PENDING_INVITE' | 'DISABLED';
  role?: string;
  page?: number;
  limit?: number;
}

export interface UpdateMemberRequest {
  roleIds: string[];
}

export interface ResetMemberPasswordRequest {
  sendEmail?: boolean;
}

export interface MemberListResponse {
  success: boolean;
  data: {
    members: Member[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

export interface MemberResponse {
  success: boolean;
  data: Member;
}

// List members (collaborators) for a tenant
export async function listMembers(
  tenantId: string,
  filters?: MembershipFilters
): Promise<MemberListResponse> {
  const response = await apiClient.get(`/tenants/${tenantId}/users`, { params: filters });
  return response.data;
}

// Get member by ID
export async function getMember(tenantId: string, userId: string): Promise<MemberResponse> {
  const response = await apiClient.get(`/tenants/${tenantId}/users/${userId}`);
  return response.data;
}

// Update member roles
export async function updateMember(
  tenantId: string,
  userId: string,
  data: UpdateMemberRequest
): Promise<MemberResponse> {
  const response = await apiClient.patch(`/tenants/${tenantId}/users/${userId}`, data);
  return response.data;
}

// Disable member
export async function disableMember(tenantId: string, userId: string): Promise<MemberResponse> {
  const response = await apiClient.post(`/tenants/${tenantId}/users/${userId}/disable`);
  return response.data;
}

// Enable member
export async function enableMember(tenantId: string, userId: string): Promise<MemberResponse> {
  const response = await apiClient.post(`/tenants/${tenantId}/users/${userId}/enable`);
  return response.data;
}

// Reset member password
export async function resetMemberPassword(
  tenantId: string,
  userId: string,
  data?: ResetMemberPasswordRequest
): Promise<{ success: boolean; message: string; data?: { newPassword: string } }> {
  const response = await apiClient.post(`/tenants/${tenantId}/users/${userId}/reset-password`, data);
  return response.data;
}

// Revoke member sessions
export async function revokeMemberSessions(
  tenantId: string,
  userId: string
): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.post(`/tenants/${tenantId}/users/${userId}/revoke-sessions`);
  return response.data;
}





