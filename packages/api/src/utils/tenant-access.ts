import { MembershipStatus, TenantStatus } from '@prisma/client';
import { prisma } from './database';

/**
 * Whether a user may access data belonging to a tenant.
 *
 * Mirrors the checks in requireTenantAccess (membership, then legacy
 * TenantClient), for code paths that run outside the route middleware chain —
 * notably static file serving.
 *
 * @param userId - Authenticated user id
 * @param tenantId - Tenant owning the resource
 * @param globalRole - Global role from the JWT (SUPER_ADMIN bypasses)
 */
export async function userHasTenantAccess(
  userId: string,
  tenantId: string,
  globalRole?: string
): Promise<boolean> {
  if (!userId || !tenantId) {
    return false;
  }

  if (globalRole === 'SUPER_ADMIN') {
    return true;
  }

  const status = await getTenantStatus(tenantId);
  if (status === null || status === TenantStatus.SUSPENDED) {
    return false;
  }

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { status: true }
  });

  if (membership?.status === MembershipStatus.ACTIVE) {
    return true;
  }

  const client = await prisma.tenantClient.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    select: { id: true }
  });

  return Boolean(client);
}

/**
 * Status of a tenant, or null when it does not exist.
 *
 * Checked on every tenant-scoped request so that suspending an agency cuts
 * access at once, including for users who log in again after the suspension.
 */
export async function getTenantStatus(tenantId: string): Promise<TenantStatus | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { status: true }
  });
  return tenant?.status ?? null;
}
