import { prisma } from '../utils/database';
import { UserPermissions } from '../types/rbac-types';

// In-memory permission cache
const permissionCache = new Map<
  string,
  {
    permissions: string[];
    expiresAt: Date;
  }
>();

// Cache TTL: 5 minutes (balance between performance and freshness)
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Get user permissions (cached)
 * @param userId - User ID
 * @param tenantId - Optional tenant ID (required for tenant-scoped permissions)
 * @returns Array of permission keys
 */
export async function getUserPermissions(userId: string, tenantId?: string): Promise<string[]> {
  const cacheKey = `${userId}:${tenantId || 'platform'}`;
  const cached = permissionCache.get(cacheKey);

  // Check if cache is valid
  if (cached && cached.expiresAt > new Date()) {
    return cached.permissions;
  }

  // Fetch from database
  const permissions = await fetchPermissionsFromDB(userId, tenantId);

  // Cache with TTL
  permissionCache.set(cacheKey, {
    permissions,
    expiresAt: new Date(Date.now() + CACHE_TTL_MS)
  });

  return permissions;
}

/**
 * Fetch permissions from database
 * @param userId - User ID
 * @param tenantId - Optional tenant ID
 * @returns Array of permission keys
 */
async function fetchPermissionsFromDB(userId: string, tenantId?: string): Promise<string[]> {
  // Check if user is SUPER_ADMIN - grant all permissions
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { globalRole: true }
  });

  if (user?.globalRole === 'SUPER_ADMIN') {
    // SUPER_ADMIN has all permissions - return all permission keys
    const allPermissions = await prisma.permission.findMany({
      select: { key: true }
    });
    return allPermissions.map(p => p.key);
  }

  // Get all user roles
  const userRoles = await prisma.userRole.findMany({
    where: {
      userId,
      ...(tenantId ? { tenantId } : { tenantId: null }) // Platform roles have null tenantId
    },
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true
            }
          }
        }
      }
    }
  });

  // Extract unique permissions from all roles
  const permissionSet = new Set<string>();

  for (const userRole of userRoles) {
    // Check role scope matches tenant context
    if (userRole.role.scope === 'PLATFORM' && tenantId) {
      // Platform roles don't apply in tenant context
      continue;
    }
    if (userRole.role.scope === 'TENANT' && !tenantId) {
      // Tenant roles require tenant context
      continue;
    }

    // Add all permissions from this role
    for (const rolePermission of userRole.role.permissions) {
      permissionSet.add(rolePermission.permission.key);
    }
  }

  return Array.from(permissionSet);
}

/**
 * Check if user has a specific permission
 * @param userId - User ID
 * @param permissionKey - Permission key to check
 * @param tenantId - Optional tenant ID
 * @returns True if user has permission
 */
export async function hasPermission(userId: string, permissionKey: string, tenantId?: string): Promise<boolean> {
  const permissions = await getUserPermissions(userId, tenantId);
  return permissions.includes(permissionKey);
}

/**
 * Check if user has any of the specified permissions
 * @param userId - User ID
 * @param permissionKeys - Array of permission keys
 * @param tenantId - Optional tenant ID
 * @returns True if user has at least one permission
 */
export async function hasAnyPermission(userId: string, permissionKeys: string[], tenantId?: string): Promise<boolean> {
  const permissions = await getUserPermissions(userId, tenantId);
  return permissionKeys.some(key => permissions.includes(key));
}

/**
 * Check if user has all of the specified permissions
 * @param userId - User ID
 * @param permissionKeys - Array of permission keys
 * @param tenantId - Optional tenant ID
 * @returns True if user has all permissions
 */
export async function hasAllPermissions(userId: string, permissionKeys: string[], tenantId?: string): Promise<boolean> {
  const permissions = await getUserPermissions(userId, tenantId);
  return permissionKeys.every(key => permissions.includes(key));
}

/**
 * Invalidate permission cache for a user
 * @param userId - User ID
 * @param tenantId - Optional tenant ID
 */
export function invalidatePermissionCache(userId: string, tenantId?: string): void {
  const cacheKey = `${userId}:${tenantId || 'platform'}`;
  permissionCache.delete(cacheKey);
}

/**
 * Invalidate all permission caches for a user (all tenants)
 * @param userId - User ID
 */
export function invalidateAllUserPermissionCache(userId: string): void {
  const keysToDelete: string[] = [];
  for (const key of permissionCache.keys()) {
    if (key.startsWith(`${userId}:`)) {
      keysToDelete.push(key);
    }
  }
  for (const key of keysToDelete) {
    permissionCache.delete(key);
  }
}

/**
 * Clear entire permission cache (use with caution)
 */
export function clearPermissionCache(): void {
  permissionCache.clear();
}
