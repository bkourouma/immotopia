import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { MembershipStatus } from '@prisma/client';
import { hashPassword, validatePasswordStrength } from '../utils/password-utils';
import { logAuditEvent, AuditActionKey } from './audit-service';
import { revokeUserSessions } from '../middleware/session-invalidation';
import { invalidateAllUserPermissionCache } from './permission-service';
import { emailService } from './email-service';
import crypto from 'crypto';

/**
 * Interface for listing members with filters
 */
export interface ListMembersFilters {
  tenantId: string;
  search?: string;
  status?: MembershipStatus;
  roleId?: string;
  page?: number;
  limit?: number;
}

/**
 * Interface for updating member roles
 */
export interface UpdateMemberRolesRequest {
  roleIds: string[];
}

/**
 * List members (collaborators) for a tenant with search and filtering
 * @param filters - Filter criteria
 * @returns List of members with pagination
 */
export async function listMembers(filters: ListMembersFilters) {
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const skip = (page - 1) * limit;

  const where: any = {
    tenantId: filters.tenantId
  };

  if (filters.status) {
    where.status = filters.status;
  }

  // Build user filter conditions
  const userConditions: any = {};

  if (filters.search) {
    userConditions.OR = [
      { email: { contains: filters.search, mode: 'insensitive' } },
      { fullName: { contains: filters.search, mode: 'insensitive' } }
    ];
  }

  // Filter by role if specified - roles are on User, not Membership
  if (filters.roleId) {
    userConditions.userRoles = {
      some: {
        roleId: filters.roleId,
        tenantId: filters.tenantId
      }
    };
  }

  // Only add user filter if there are conditions
  if (Object.keys(userConditions).length > 0) {
    where.user = userConditions;
  }

  const [members, total] = await Promise.all([
    prisma.membership.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            avatarUrl: true,
            isActive: true,
            lastLoginAt: true,
            userRoles: {
              where: {
                tenantId: filters.tenantId
              },
              include: {
                role: {
                  select: {
                    id: true,
                    key: true,
                    name: true,
                    scope: true
                  }
                }
              }
            }
          }
        }
      }
    }),
    prisma.membership.count({ where })
  ]);

  // Transform the response to match expected format
  const transformedMembers = members.map(member => ({
    ...member,
    roles: member.user.userRoles.map(ur => ur.role),
    user: {
      id: member.user.id,
      email: member.user.email,
      fullName: member.user.fullName,
      avatarUrl: member.user.avatarUrl,
      isActive: member.user.isActive,
      lastLoginAt: member.user.lastLoginAt
    }
  }));

  return {
    members: transformedMembers,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

/**
 * Get member by user ID and tenant ID
 * @param userId - User ID
 * @param tenantId - Tenant ID
 * @returns Membership with user and roles
 */
export async function getMemberById(userId: string, tenantId: string) {
  const membership = await prisma.membership.findUnique({
    where: {
      userId_tenantId: {
        userId,
        tenantId
      }
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          fullName: true,
          avatarUrl: true,
          isActive: true,
          emailVerified: true,
          lastLoginAt: true,
          createdAt: true,
          userRoles: {
            where: {
              tenantId: tenantId
            },
            include: {
              role: {
                select: {
                  id: true,
                  key: true,
                  name: true,
                  description: true,
                  scope: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!membership) {
    return null;
  }

  // Transform the response to match expected format
  return {
    ...membership,
    roles: membership.user.userRoles.map(ur => ur.role),
    user: {
      id: membership.user.id,
      email: membership.user.email,
      fullName: membership.user.fullName,
      avatarUrl: membership.user.avatarUrl,
      isActive: membership.user.isActive,
      emailVerified: membership.user.emailVerified,
      lastLoginAt: membership.user.lastLoginAt,
      createdAt: membership.user.createdAt
    }
  };
}

/**
 * Update member roles
 * @param userId - User ID
 * @param tenantId - Tenant ID
 * @param data - Role update data
 * @param actorUserId - User performing the update (for audit)
 * @returns Updated membership
 */
export async function updateMemberRoles(
  userId: string,
  tenantId: string,
  data: UpdateMemberRolesRequest,
  actorUserId: string
) {
  // Verify membership exists
  const membership = await prisma.membership.findUnique({
    where: {
      userId_tenantId: {
        userId,
        tenantId
      }
    }
  });

  if (!membership) {
    throw new Error('Membre introuvable.');
  }

  // Verify all roles exist and are tenant-scoped
  const roles = await prisma.role.findMany({
    where: {
      id: { in: data.roleIds },
      scope: 'TENANT'
    }
  });

  if (roles.length !== data.roleIds.length) {
    throw new Error('Un ou plusieurs roles sont invalides ou ne sont pas des roles tenant.');
  }

  // Remove existing tenant roles for this user in this tenant
  await prisma.userRole.deleteMany({
    where: {
      userId,
      tenantId
    }
  });

  // Assign new roles
  await prisma.userRole.createMany({
    data: data.roleIds.map(roleId => ({
      userId,
      roleId,
      tenantId
    }))
  });

  // Invalidate permission cache
  invalidateAllUserPermissionCache(userId);

  logger.info('Member roles updated', {
    userId,
    tenantId,
    roleIds: data.roleIds,
    actorUserId
  });

  // Audit log
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.ROLE_ASSIGNED,
    entityType: 'UserRole',
    entityId: userId,
    payload: {
      roleIds: data.roleIds
    }
  });

  // Return updated membership
  return getMemberById(userId, tenantId);
}

/**
 * Disable a member (membership)
 * @param userId - User ID
 * @param tenantId - Tenant ID
 * @param actorUserId - User performing the action (for audit)
 * @returns Updated membership
 */
export async function disableMember(userId: string, tenantId: string, actorUserId: string) {
  const membership = await prisma.membership.findUnique({
    where: {
      userId_tenantId: {
        userId,
        tenantId
      }
    }
  });

  if (!membership) {
    throw new Error('Membre introuvable.');
  }

  if (membership.status === MembershipStatus.DISABLED) {
    throw new Error('Ce membre est deja desactive.');
  }

  // Update membership status
  const updated = await prisma.membership.update({
    where: {
      userId_tenantId: {
        userId,
        tenantId
      }
    },
    data: {
      status: MembershipStatus.DISABLED
    }
  });

  // Revoke all sessions for this user
  await revokeUserSessions(userId);

  // Invalidate permission cache
  invalidateAllUserPermissionCache(userId);

  logger.info('Member disabled', { userId, tenantId, actorUserId });

  // Audit log
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.USER_DISABLED,
    entityType: 'Membership',
    entityId: membership.id,
    payload: {
      userId
    }
  });

  return updated;
}

/**
 * Enable a member (membership)
 * @param userId - User ID
 * @param tenantId - Tenant ID
 * @param actorUserId - User performing the action (for audit)
 * @returns Updated membership
 */
export async function enableMember(userId: string, tenantId: string, actorUserId: string) {
  const membership = await prisma.membership.findUnique({
    where: {
      userId_tenantId: {
        userId,
        tenantId
      }
    }
  });

  if (!membership) {
    throw new Error('Membre introuvable.');
  }

  if (membership.status === MembershipStatus.ACTIVE) {
    throw new Error('Ce membre est deja actif.');
  }

  // Update membership status
  const updated = await prisma.membership.update({
    where: {
      userId_tenantId: {
        userId,
        tenantId
      }
    },
    data: {
      status: MembershipStatus.ACTIVE
    }
  });

  // Invalidate permission cache
  invalidateAllUserPermissionCache(userId);

  logger.info('Member enabled', { userId, tenantId, actorUserId });

  // Audit log
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.USER_ENABLED,
    entityType: 'Membership',
    entityId: membership.id,
    payload: {
      userId
    }
  });

  return updated;
}

/**
 * Reset member password
 * @param userId - User ID
 * @param tenantId - Tenant ID
 * @param newPassword - New password (optional, generates random if not provided)
 * @param actorUserId - User performing the action (for audit)
 * @returns New password (if generated)
 */
export async function resetMemberPassword(
  userId: string,
  tenantId: string,
  newPassword?: string,
  actorUserId?: string
) {
  const membership = await prisma.membership.findUnique({
    where: {
      userId_tenantId: {
        userId,
        tenantId
      }
    },
    include: {
      user: true
    }
  });

  if (!membership) {
    throw new Error('Membre introuvable.');
  }

  // Generate random password if not provided
  let password = newPassword;
  if (!password) {
    password = crypto.randomBytes(16).toString('hex');
  }

  // Validate password strength
  const passwordValidation = validatePasswordStrength(password);
  if (!passwordValidation.isValid) {
    throw new Error(passwordValidation.error);
  }

  // Hash and update password
  const passwordHash = await hashPassword(password);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash }
  });

  // Revoke all sessions
  await revokeUserSessions(userId);

  // Send password reset notification email
  try {
    await emailService.sendEmail({
      to: membership.user.email,
      subject: 'Votre mot de passe a ete reinitialise',
      html: `
        <h1>Mot de passe reinitialise</h1>
        <p>Votre mot de passe a ete reinitialise par un administrateur.</p>
        <p>Votre nouveau mot de passe est: <strong>${password}</strong></p>
        <p>Veuillez vous connecter et changer votre mot de passe des que possible.</p>
      `
    });
    logger.info('Password reset notification email sent', { userId, tenantId });
  } catch (error) {
    logger.error('Failed to send password reset notification email', { userId, tenantId, error });
    // Don't throw - password is reset, email can be resent
  }

  logger.info('Member password reset', { userId, tenantId, actorUserId });

  // Audit log
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: AuditActionKey.PASSWORD_RESET,
      entityType: 'User',
      entityId: userId
    });
  }

  return { password }; // Return password for admin to share with user
}

/**
 * Revoke all sessions for a member
 * @param userId - User ID
 * @param tenantId - Tenant ID
 * @param actorUserId - User performing the action (for audit)
 */
export async function revokeMemberSessions(userId: string, tenantId: string, actorUserId: string) {
  const membership = await prisma.membership.findUnique({
    where: {
      userId_tenantId: {
        userId,
        tenantId
      }
    }
  });

  if (!membership) {
    throw new Error('Membre introuvable.');
  }

  // Revoke all sessions
  await revokeUserSessions(userId);

  logger.info('Member sessions revoked', { userId, tenantId, actorUserId });

  // Audit log
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: AuditActionKey.SESSIONS_REVOKED,
    entityType: 'User',
    entityId: userId
  });
}
