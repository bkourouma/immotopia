import { MembershipStatus } from '@prisma/client';
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
