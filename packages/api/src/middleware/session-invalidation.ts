import { prisma } from '../utils/database';
import { logger } from '../utils/logger';

/**
 * Revoke all refresh tokens for users belonging to a tenant
 * Used when tenant is suspended
 * @param tenantId - Tenant ID
 */
export async function revokeTenantSessions(tenantId: string): Promise<void> {
  try {
    // Find all active memberships for this tenant
    const memberships = await prisma.membership.findMany({
      where: {
        tenantId,
        status: 'ACTIVE'
      },
      select: {
        userId: true
      }
    });

    const userIds = memberships.map(m => m.userId);

    if (userIds.length === 0) {
      logger.info('No active users found for tenant', { tenantId });
      return;
    }

    // Revoke all refresh tokens for these users
    const result = await prisma.refreshToken.updateMany({
      where: {
        userId: {
          in: userIds
        },
        revoked: false
      },
      data: {
        revoked: true,
        revokedAt: new Date()
      }
    });

    logger.info('Revoked tenant sessions', {
      tenantId,
      userIdsCount: userIds.length,
      tokensRevoked: result.count
    });
  } catch (error) {
    logger.error('Error revoking tenant sessions', { tenantId, error });
    throw error;
  }
}

/**
 * Revoke all sessions for a specific user
 * Used when user is disabled or password is reset
 * @param userId - User ID
 */
export async function revokeUserSessions(userId: string): Promise<void> {
  try {
    const result = await prisma.refreshToken.updateMany({
      where: {
        userId,
        revoked: false
      },
      data: {
        revoked: true,
        revokedAt: new Date()
      }
    });

    logger.info('Revoked user sessions', {
      userId,
      tokensRevoked: result.count
    });
  } catch (error) {
    logger.error('Error revoking user sessions', { userId, error });
    throw error;
  }
}




