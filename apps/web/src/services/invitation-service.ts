import apiClient from '../utils/api-client';

export interface Invitation {
  id: string;
  tenantId: string;
  email: string;
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  invitedBy: string;
  invitedAt: string;
  acceptedAt?: string;
  expiresAt: string;
  roleIds: string[];
}

export interface InviteCollaboratorRequest {
  email: string;
  roleIds: string[];
}

export interface AcceptInvitationRequest {
  token: string;
  password: string;
  fullName?: string;
}

export interface InvitationResponse {
  success: boolean;
  data: Invitation;
  message?: string;
}

export interface InvitationListResponse {
  success: boolean;
  data: {
    invitations: Invitation[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

// Invite collaborator to tenant
export async function inviteCollaborator(
  tenantId: string,
  data: InviteCollaboratorRequest
): Promise<InvitationResponse> {
  const response = await apiClient.post(`/tenants/${tenantId}/users/invite`, data);
  return response.data;
}

// Accept invitation (public endpoint)
export async function acceptInvitation(
  data: AcceptInvitationRequest
): Promise<{ success: boolean; message: string; data?: { user: any; tenant: any } }> {
  const response = await apiClient.post('/auth/invitations/accept', data);
  return response.data;
}

// Resend invitation
export async function resendInvitation(
  tenantId: string,
  invitationId: string
): Promise<InvitationResponse> {
  const response = await apiClient.post(
    `/tenants/${tenantId}/users/invitations/${invitationId}/resend`
  );
  return response.data;
}

// Revoke invitation
export async function revokeInvitation(
  tenantId: string,
  invitationId: string
): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.delete(
    `/tenants/${tenantId}/users/invitations/${invitationId}`
  );
  return response.data;
}





