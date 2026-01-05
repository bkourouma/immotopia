// Tenant and Collaborator types for the application

export type TenantType = 'AGENCY' | 'OPERATOR';
export type ClientType = 'OWNER' | 'RENTER' | 'BUYER' | 'CO_OWNER';
export type CollaboratorRole = 'ADMIN' | 'MANAGER' | 'AGENT';

export interface Tenant {
    id: string;
    name: string;
    slug: string;
    type: TenantType;
    logoUrl?: string;
    website?: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface TenantClient {
    id: string;
    userId: string;
    tenantId: string;
    clientType: ClientType;
    details?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}

export interface Collaborator {
    id: string;
    userId: string;
    tenantId: string;
    role: CollaboratorRole;
    createdAt: Date;
    updatedAt: Date;
    user?: {
        id: string;
        email: string;
        fullName?: string;
        avatarUrl?: string;
    };
}

export interface InviteCollaboratorRequest {
    email: string;
    tenantId: string;
    role: CollaboratorRole;
}

export interface AcceptInviteRequest {
    token: string;
    password: string;
    fullName?: string;
}

