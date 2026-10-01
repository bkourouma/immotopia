import { prisma, PrismaTransactionClient } from '../utils/database';
import { logger } from '../utils/logger';
import { MembershipStatus } from '@prisma/client';
import { hashPassword, validatePasswordStrength } from '../utils/password-utils';
import { recordAuditEvent, AuditActionKey } from './audit-service';
import { invalidateAllUserPermissionCache } from './permission-service';
import { emailService } from './email-service';
import crypto from 'crypto';

/**
 * Revoke every active refresh token of a user inside the caller's transaction,
 * so the revocation commits together with its audit trace. Mirrors
 * `revokeUserSessions` (middleware/session-invalidation), which uses the global
 * client and cannot join a transaction.
 */
async function revokeUserSessionsInTx(tx: PrismaTransactionClient, userId: string): Promise<number> {
  const result = await tx.refreshToken.updateMany({
    where: { userId, revoked: false },
    data: { revoked: true, revokedAt: new Date() }
  });
  logger.info('Revoked user sessions', { userId, tokensRevoked: result.count });
  return result.count;
}

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

  // Critical action: roles swap and audit trace commit together or not at all.
  await prisma.$transaction(async tx => {
    // Remove existing tenant roles for this user in this tenant
    await tx.userRole.deleteMany({
      where: {
        userId,
        tenantId
      }
    });

    // Assign new roles
    await tx.userRole.createMany({
      data: data.roleIds.map(roleId => ({
        userId,
        roleId,
        tenantId
      }))
    });

    await recordAuditEvent(tx, {
      actorUserId,
      tenantId,
      actionKey: AuditActionKey.ROLE_ASSIGNED,
      entityType: 'UserRole',
      entityId: userId,
      payload: {
        roleIds: data.roleIds
      }
    });
  });

  // Invalidate permission cache
  invalidateAllUserPermissionCache(userId);

  logger.info('Member roles updated', {
    userId,
    tenantId,
    roleIds: data.roleIds,
    actorUserId
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

  // Update membership status (critical action: audit trace in the same transaction)
  const updated = await prisma.$transaction(async tx => {
    const result = await tx.membership.update({
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
    await revokeUserSessionsInTx(tx, userId);

    await recordAuditEvent(tx, {
      actorUserId,
      tenantId,
      actionKey: AuditActionKey.USER_DISABLED,
      entityType: 'Membership',
      entityId: membership.id,
      payload: {
        userId
      }
    });

    return result;
  });

  // Invalidate permission cache
  invalidateAllUserPermissionCache(userId);

  logger.info('Member disabled', { userId, tenantId, actorUserId });

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

  // Update membership status (critical action: audit trace in the same transaction)
  const updated = await prisma.$transaction(async tx => {
    const result = await tx.membership.update({
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

    await recordAuditEvent(tx, {
      actorUserId,
      tenantId,
      actionKey: AuditActionKey.USER_ENABLED,
      entityType: 'Membership',
      entityId: membership.id,
      payload: {
        userId
      }
    });

    return result;
  });

  // Invalidate permission cache
  invalidateAllUserPermissionCache(userId);

  logger.info('Member enabled', { userId, tenantId, actorUserId });

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

  // When the admin does not supply a password, set an unguessable one so the
  // previous credentials stop working immediately. It is never disclosed:
  // the member regains access through the one-time reset link below.
  const generated = !newPassword;
  const password = newPassword || crypto.randomBytes(32).toString('base64url');

  // Validate the strength of a password the admin typed. The generated one is
  // random and never shown to anyone: validating it made roughly one reset in
  // four fail ("au moins un caractère spécial"), because base64url often has
  // no `-` or `_`.
  if (!generated) {
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      throw new Error(passwordValidation.error);
    }
  }

  // Hash and update password
  const passwordHash = await hashPassword(password);

  // Issue a single-use reset link instead of e-mailing the password in clear
  // text (e-mail is not a confidential channel and the message is archived).
  const resetToken = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  // Critical action: password change, session revocation, reset token and
  // audit trace commit together or not at all.
  await prisma.$transaction(async tx => {
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash }
    });

    // Revoke all sessions
    await revokeUserSessionsInTx(tx, userId);

    await tx.passwordResetToken.updateMany({
      where: { userId, used: false },
      data: { used: true }
    });

    await tx.passwordResetToken.create({
      data: { token: resetToken, userId, expiresAt }
    });

    if (actorUserId) {
      await recordAuditEvent(tx, {
        actorUserId,
        tenantId,
        actionKey: AuditActionKey.PASSWORD_RESET,
        entityType: 'User',
        entityId: userId
      });
    }
  });

  // Send password reset notification email
  try {
    await emailService.sendPasswordResetEmail(membership.user.email, resetToken, {
      userName: membership.user.fullName ?? undefined,
      language: membership.user.preferredLanguage
    });
    logger.info('Password reset link sent', { userId, tenantId });
  } catch (error) {
    logger.error('Failed to send password reset link', { userId, tenantId, error });
    // Don't throw - password is reset, email can be resent
  }

  logger.info('Member password reset', { userId, tenantId, actorUserId });

  // A generated password is deliberately never returned: the member sets their
  // own through the reset link. Only an admin-chosen password is echoed back,
  // since the admin already knows it.
  return { password: generated ? undefined : password, resetLinkSent: true };
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

  // Revoke all sessions (critical action: audit trace in the same transaction)
  await prisma.$transaction(async tx => {
    await revokeUserSessionsInTx(tx, userId);

    await recordAuditEvent(tx, {
      actorUserId,
      tenantId,
      actionKey: AuditActionKey.SESSIONS_REVOKED,
      entityType: 'User',
      entityId: userId
    });
  });

  logger.info('Member sessions revoked', { userId, tenantId, actorUserId });
}

/**
 * Membres ASSIGNABLES d'une agence : identifiant, nom d'affichage et roles des
 * collaborateurs ACTIFS, rien d'autre (ni e-mail, ni telephone, ni derniere
 * connexion). Alimente les listes deroulantes « assigne a », « negociateur »,
 * « participant » pour des roles qui n'ont pas le droit de lister les
 * collaborateurs (USERS_VIEW). Filtre par `tenantId` : une autre agence ne
 * fuit jamais.
 */
export async function listAssignableMembers(tenantId: string) {
  const memberships = await prisma.membership.findMany({
    where: { tenantId, status: MembershipStatus.ACTIVE, user: { isActive: true } },
    orderBy: { createdAt: 'asc' },
    select: {
      user: {
        select: {
          id: true,
          fullName: true,
          userRoles: {
            where: { tenantId },
            select: { role: { select: { key: true, name: true } } }
          }
        }
      }
    }
  });

  return memberships.map(m => ({
    userId: m.user.id,
    displayName: m.user.fullName?.trim() || 'Collaborateur',
    roles: m.user.userRoles.map(ur => ur.role)
  }));
}
