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
export async function listMembers(tenantId: string, filters?: MembershipFilters): Promise<MemberListResponse> {
  const response = await apiClient.get(`/tenants/${tenantId}/users`, { params: filters });
  return response.data;
}

/**
 * Membres ASSIGNABLES (listes deroulantes « assigne a », negociateur…) : route
 * minimale sans e-mail, ouverte aux roles qui n'ont pas USERS_VIEW. Renvoie la
 * meme forme que `listMembers` pour les ecrans existants ; `user.email` est vide.
 */
export async function listAssignableMembers(tenantId: string): Promise<MemberListResponse> {
  const response = await apiClient.get(`/tenants/${tenantId}/members/assignable`);
  const raw: Array<{ userId: string; displayName: string; roles: Array<{ key: string; name: string }> }> =
    response.data?.data?.members ?? [];
  const members: Member[] = raw.map(m => ({
    id: m.userId,
    userId: m.userId,
    tenantId,
    status: 'ACTIVE',
    createdAt: '',
    updatedAt: '',
    user: {
      id: m.userId,
      email: '',
      fullName: m.displayName,
      avatarUrl: null,
      isActive: true,
      emailVerified: true,
      lastLoginAt: null
    },
    roles: (m.roles ?? []).map(r => ({
      id: r.key,
      key: r.key,
      name: r.name,
      description: null,
      scope: 'TENANT' as const
    }))
  }));
  return {
    success: Boolean(response.data?.success),
    data: { members, pagination: { page: 1, limit: members.length, total: members.length, totalPages: 1 } }
  };
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
