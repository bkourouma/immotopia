import { Role, Permission, UserRole, RolePermission } from '@prisma/client';

// Re-export Prisma types
export type { Role, Permission, UserRole, RolePermission };

// Role scope enum
export enum RoleScope {
  PLATFORM = 'PLATFORM',
  TENANT = 'TENANT'
}

// Membership status enum
export enum MembershipStatus {
  PENDING_INVITE = 'PENDING_INVITE',
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED'
}

// Permission check result
export interface PermissionCheckResult {
  hasPermission: boolean;
  permissions: string[];
  missingPermissions?: string[];
}

// User permissions with cache metadata
export interface UserPermissions {
  userId: string;
  tenantId?: string;
  permissions: string[];
  roles: string[];
  cachedAt: Date;
  expiresAt: Date;
}

// Role assignment request
export interface AssignRoleRequest {
  roleIds: string[];
  tenantId?: string; // Required for tenant roles, null for platform roles
}

// Permission key constants (for type safety)
export const PermissionKeys = {
  // Platform permissions
  PLATFORM_TENANTS_VIEW: 'PLATFORM_TENANTS_VIEW',
  PLATFORM_TENANTS_CREATE: 'PLATFORM_TENANTS_CREATE',
  PLATFORM_TENANTS_EDIT: 'PLATFORM_TENANTS_EDIT',
  PLATFORM_MODULES_VIEW: 'PLATFORM_MODULES_VIEW',
  PLATFORM_MODULES_EDIT: 'PLATFORM_MODULES_EDIT',
  PLATFORM_SUBSCRIPTIONS_VIEW: 'PLATFORM_SUBSCRIPTIONS_VIEW',
  PLATFORM_SUBSCRIPTIONS_EDIT: 'PLATFORM_SUBSCRIPTIONS_EDIT',
  PLATFORM_INVOICES_VIEW: 'PLATFORM_INVOICES_VIEW',
  PLATFORM_INVOICES_CREATE: 'PLATFORM_INVOICES_CREATE',
  PLATFORM_INVOICES_EDIT: 'PLATFORM_INVOICES_EDIT',

  // Tenant permissions
  TENANT_SETTINGS_VIEW: 'TENANT_SETTINGS_VIEW',
  TENANT_SETTINGS_EDIT: 'TENANT_SETTINGS_EDIT',
  USERS_VIEW: 'USERS_VIEW',
  USERS_CREATE: 'USERS_CREATE',
  USERS_EDIT: 'USERS_EDIT',
  USERS_DISABLE: 'USERS_DISABLE',
  BILLING_VIEW: 'BILLING_VIEW'
} as const;

export type PermissionKey = (typeof PermissionKeys)[keyof typeof PermissionKeys];

// Role key constants
export const RoleKeys = {
  PLATFORM_SUPER_ADMIN: 'PLATFORM_SUPER_ADMIN',
  TENANT_ADMIN: 'TENANT_ADMIN',
  TENANT_MANAGER: 'TENANT_MANAGER',
  TENANT_AGENT: 'TENANT_AGENT',
  TENANT_ACCOUNTANT: 'TENANT_ACCOUNTANT'
} as const;

export type RoleKey = (typeof RoleKeys)[keyof typeof RoleKeys];




