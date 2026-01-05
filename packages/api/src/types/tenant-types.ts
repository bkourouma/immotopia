import { Tenant, TenantType, TenantModule, Subscription, Invoice } from '@prisma/client';

// Re-export Prisma types
export type { Tenant, TenantType, TenantModule, Subscription, Invoice };

// Tenant status enum
export enum TenantStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED'
}

// Extended Tenant with relationships
export interface TenantDetail extends Tenant {
  modules?: TenantModule[];
  subscription?: Subscription | null;
  invoices?: Invoice[];
  collaboratorCount?: number;
  activeCollaborators?: number;
  disabledCollaborators?: number;
  lastActivityAt?: Date | null;
}

// Create tenant request
export interface CreateTenantRequest {
  name: string;
  legalName?: string;
  type: TenantType;
  contactEmail: string;
  contactPhone?: string;
  country?: string;
  city?: string;
  address?: string;
  brandingPrimaryColor?: string;
  subdomain?: string;
  customDomain?: string;
  status?: TenantStatus;
}

// Update tenant request
export interface UpdateTenantRequest {
  name?: string;
  legalName?: string;
  status?: TenantStatus;
  contactEmail?: string;
  contactPhone?: string;
  country?: string;
  city?: string;
  address?: string;
  brandingPrimaryColor?: string;
  subdomain?: string;
  customDomain?: string;
  logoUrl?: string;
  website?: string;
}

// Tenant list filters
export interface TenantFilters {
  status?: TenantStatus;
  type?: TenantType;
  plan?: string;
  module?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// Tenant statistics
export interface TenantStats {
  collaboratorCount: number;
  activeCollaborators: number;
  disabledCollaborators: number;
  enabledModules: string[];
  subscription?: {
    plan: string;
    status: string;
    billingCycle: string;
  } | null;
  lastLoginAt: Date | null;
}

// Module update request
export interface UpdateTenantModulesRequest {
  modules: Array<{
    moduleKey: string;
    enabled: boolean;
  }>;
}




