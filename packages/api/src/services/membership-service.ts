import { escapeLike } from '../utils/like-escape';
import { RESERVED_ROLE_KEYS } from '../lib/patrimoine/personal-permissions';
import { prisma, PrismaTransactionClient } from '../utils/database';
import { logger } from '../utils/logger';
import { InvitationStatus, MembershipStatus } from '@prisma/client';
import { hashPassword, validatePasswordStrength } from '../utils/password-utils';
import { recordAuditEvent, AuditActionKey } from './audit-service';
import { invalidateAllUserPermissionCache } from './permission-service';
import { emailService } from './email-service';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../middleware/error-middleware';
import crypto from 'crypto';
import { t } from '../i18n';
import {
  TENANT_ADMIN_ROLE_KEY,
  actorMayTouchAdmin,
  assertActorMayTouchAdmin,
  assertActorMayTouchSuperAdmin,
  isSharedOrPlatformAccount,
  isTenantAdmin
} from './tenant-admin-guard';

/**
 * Refuse l'opération si `userId` est administrateur de l'agence et qu'aucun autre
 * administrateur ACTIF (membre actif, compte actif) ne resterait : l'agence se
 * retrouverait sans personne pour la gérer. Sans effet pour un non-administrateur.
 * `targetIsAdmin` évite de recompter quand l'appelant le sait déjà.
 */
async function assertNotLastActiveAdmin(
  userId: string,
  tenantId: string,
  message: string,
  targetIsAdmin?: boolean,
  client: Pick<PrismaTransactionClient, 'userRole'> = prisma
): Promise<void> {
  const isAdmin = targetIsAdmin ?? (await isTenantAdmin(userId, tenantId, client));
  if (!isAdmin) return;

  const otherActiveAdmins = await client.userRole.count({
    where: {
      tenantId,
      userId: { not: userId },
      role: { key: TENANT_ADMIN_ROLE_KEY },
      user: { isActive: true, memberships: { some: { tenantId, status: MembershipStatus.ACTIVE } } }
    }
  });
  if (otherActiveAdmins === 0) {
    throw new ConflictError(message);
  }
}

/**
 * Verrou consultatif de transaction propre aux administrateurs d'une agence :
 * deux changements qui peuvent retirer un administrateur (rôles, désactivation)
 * se suivent, et la règle « au moins un administrateur actif » est rejouée sous
 * ce verrou (sinon deux administrateurs se rétrogradant l'un l'autre en même
 * temps laissaient l'agence sans administrateur). Relâché au commit/rollback.
 */
async function lockTenantAdminsTx(tx: PrismaTransactionClient, tenantId: string): Promise<void> {
  const key = `tenant-admins:${tenantId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

/**
 * Revoke every active refresh token of a user inside the caller's transaction,
 * so the revocation and its SESSIONS_REVOKED audit trace commit together.
 * Mirrors `revokeUserSessions` (middleware/session-invalidation), which uses the
 * global client and cannot join a transaction.
 * Toujours faite, compte partagé ou non (une déconnexion forcée est sans danger
 * pour les autres agences, et un compte qui se fabriquerait une appartenance
 * ailleurs ne doit pas y échapper) ; seule exception : un super-admin, dont les
 * sessions sont de portée plateforme (`skipped` vaut alors true).
 */
async function revokeUserSessionsInTx(
  tx: PrismaTransactionClient,
  params: { userId: string; tenantId: string; targetGlobalRole: string | null | undefined; actorUserId?: string }
): Promise<{ skipped: boolean; count: number }> {
  const { userId, tenantId, targetGlobalRole, actorUserId } = params;
  if (targetGlobalRole === 'SUPER_ADMIN') {
    logger.info('Session revocation skipped for platform account', { userId, tenantId });
    return { skipped: true, count: 0 };
  }
  const result = await tx.refreshToken.updateMany({
    where: { userId, revoked: false },
    data: { revoked: true, revokedAt: new Date() }
  });
  await recordAuditEvent(tx, {
    actorUserId: actorUserId ?? null,
    tenantId,
    actionKey: AuditActionKey.SESSIONS_REVOKED,
    entityType: 'User',
    entityId: userId,
    payload: { tokensRevoked: result.count }
  });
  logger.info('Revoked user sessions', { userId, tokensRevoked: result.count });
  return { skipped: false, count: result.count };
}

/**
 * Interface for listing members with filters
 */
export interface ListMembersFilters {
  tenantId: string;
  search?: string;
  /** Un ou plusieurs statuts (OU). Vide ou absent : tous les statuts. */
  status?: MembershipStatus[];
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

  if (filters.status && filters.status.length > 0) {
    where.status = filters.status.length === 1 ? filters.status[0] : { in: filters.status };
  }

  // Build user filter conditions
  const userConditions: any = {};

  if (filters.search) {
    userConditions.OR = [
      { email: { contains: escapeLike(filters.search), mode: 'insensitive' } },
      { fullName: { contains: escapeLike(filters.search), mode: 'insensitive' } }
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
  // Personne ne modifie ses propres rôles (auto-élévation ou auto-rétrogradation).
  if (userId === actorUserId) {
    throw new ForbiddenError(t('Vous ne pouvez pas modifier vos propres rôles.'));
  }

  // Verify membership exists
  const membership = await prisma.membership.findUnique({
    where: {
      userId_tenantId: {
        userId,
        tenantId
      }
    },
    include: { user: { select: { globalRole: true } } }
  });

  if (!membership) {
    throw new NotFoundError('Membre introuvable.');
  }

  await assertActorMayTouchSuperAdmin(membership.user?.globalRole, actorUserId);

  // Verify all roles exist and are tenant-scoped
  const roles = await prisma.role.findMany({
    where: {
      id: { in: data.roleIds },
      scope: 'TENANT',
      key: { notIn: RESERVED_ROLE_KEYS }
    }
  });

  if (roles.length !== data.roleIds.length) {
    throw new BadRequestError('Un ou plusieurs roles sont invalides ou ne sont pas des roles tenant.');
  }

  // Attribuer/retirer TENANT_ADMIN, ou modifier un compte qui le porte : réservé
  // à un administrateur de l'agence ou au super-admin (un gestionnaire garde
  // l'édition des rôles non-administrateur des membres non-administrateurs).
  const targetIsAdmin = await isTenantAdmin(userId, tenantId);
  const grantsAdmin = roles.some(role => role.key === TENANT_ADMIN_ROLE_KEY);
  if (targetIsAdmin || grantsAdmin) {
    await assertActorMayTouchAdmin(actorUserId, tenantId);
  }

  // Retirer le rôle d'administrateur au dernier administrateur actif laisserait l'agence sans gestionnaire.
  if (!grantsAdmin) {
    await assertNotLastActiveAdmin(
      userId,
      tenantId,
      "Impossible de retirer le rôle d'administrateur au dernier administrateur actif de l'agence.",
      targetIsAdmin
    );
  }

  // Critical action: roles swap and audit trace commit together or not at all.
  await prisma.$transaction(async tx => {
    // Contrôles rejoués sous le verrou des administrateurs de l'agence : entre
    // la lecture ci-dessus et l'écriture, un autre administrateur a pu être
    // rétrogradé, la cible promue ou l'acteur rétrogradé (TOCTOU).
    await lockTenantAdminsTx(tx, tenantId);
    const targetIsAdminNow = await isTenantAdmin(userId, tenantId, tx);
    if (targetIsAdminNow || grantsAdmin) {
      await assertActorMayTouchAdmin(actorUserId, tenantId);
    }
    if (!grantsAdmin) {
      await assertNotLastActiveAdmin(
        userId,
        tenantId,
        "Impossible de retirer le rôle d'administrateur au dernier administrateur actif de l'agence.",
        targetIsAdminNow,
        tx
      );
    }

    // Remove existing tenant roles for this user in this tenant
    await tx.userRole.deleteMany({
      where: {
        userId,
        tenantId,
        // Le rôle réservé d'un particulier survit à une réécriture des rôles.
        role: { key: { notIn: RESERVED_ROLE_KEYS } }
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
  if (userId === actorUserId) {
    throw new ConflictError('Vous ne pouvez pas désactiver votre propre compte.');
  }

  const membership = await prisma.membership.findUnique({
    where: {
      userId_tenantId: {
        userId,
        tenantId
      }
    },
    include: { user: { select: { globalRole: true } } }
  });

  if (!membership) {
    throw new NotFoundError('Membre introuvable.');
  }

  await assertActorMayTouchSuperAdmin(membership.user?.globalRole, actorUserId);

  if (membership.status === MembershipStatus.DISABLED) {
    throw new ConflictError('Ce membre est deja desactive.');
  }

  const targetIsAdmin = await isTenantAdmin(userId, tenantId);
  if (targetIsAdmin) {
    await assertActorMayTouchAdmin(actorUserId, tenantId);
  }

  await assertNotLastActiveAdmin(
    userId,
    tenantId,
    "Impossible de désactiver le dernier administrateur actif de l'agence.",
    targetIsAdmin
  );

  // Update membership status (critical action: audit trace in the same transaction)
  const updated = await prisma.$transaction(async tx => {
    // Contrôles rejoués sous le verrou des administrateurs (même verrou que
    // `updateMemberRoles`) : statut d'administrateur de la cible, droit de
    // l'acteur, règle du dernier administrateur actif.
    await lockTenantAdminsTx(tx, tenantId);
    const targetIsAdminNow = await isTenantAdmin(userId, tenantId, tx);
    if (targetIsAdminNow) {
      await assertActorMayTouchAdmin(actorUserId, tenantId);
    }
    await assertNotLastActiveAdmin(
      userId,
      tenantId,
      "Impossible de désactiver le dernier administrateur actif de l'agence.",
      targetIsAdminNow,
      tx
    );

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

    // Les invitations encore en attente émises par ce membre tombent avec lui :
    // une invitation (administrateur ou non) ne survit pas à la désactivation
    // de son auteur.
    await tx.invitation.updateMany({
      where: { tenantId, invitedBy: userId, status: InvitationStatus.PENDING },
      data: { status: InvitationStatus.REVOKED, revokedAt: new Date() }
    });

    // Revoke all sessions for this user (sauf super-admin, portée plateforme)
    await revokeUserSessionsInTx(tx, {
      userId,
      tenantId,
      targetGlobalRole: membership.user?.globalRole,
      actorUserId
    });

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
    },
    include: { user: { select: { globalRole: true } } }
  });

  if (!membership) {
    throw new NotFoundError('Membre introuvable.');
  }

  await assertActorMayTouchSuperAdmin(membership.user?.globalRole, actorUserId);

  if (membership.status === MembershipStatus.ACTIVE) {
    throw new ConflictError('Ce membre est deja actif.');
  }

  if (await isTenantAdmin(userId, tenantId)) {
    await assertActorMayTouchAdmin(actorUserId, tenantId);
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
    select: {
      id: true,
      status: true,
      user: { select: { email: true, fullName: true, preferredLanguage: true, globalRole: true } }
    }
  });

  if (!membership) {
    throw new NotFoundError('Membre introuvable.');
  }

  // Un membre désactivé ou en attente n'a pas à recevoir de lien ni de mot de
  // passe : on ne rouvre pas un accès par la voie de la réinitialisation.
  if (membership.status !== MembershipStatus.ACTIVE) {
    throw new ConflictError(t('Seul un membre actif peut voir son mot de passe réinitialisé.'));
  }

  // Le mot de passe est GLOBAL (table User) : l'écraser depuis une agence
  // toucherait aussi les autres agences du compte, ou un super-admin. Pour ces
  // comptes protégés, seul le lien à usage unique est émis et le hash n'est pas
  // modifié. Les sessions, elles, sont révoquées quand même (sauf super-admin) :
  // une déconnexion forcée est sans danger pour les autres agences.
  // Est aussi protégé : un compte portant un rôle de portée plateforme ou d'une
  // autre agence, un profil client dans une autre agence, ou une appartenance
  // (même non active : invitation, désactivée) ailleurs.
  const protectedAccount = await isSharedOrPlatformAccount(prisma, userId, tenantId, membership.user.globalRole);

  if (protectedAccount && newPassword) {
    throw new ForbiddenError(
      t(
        "Ce compte est partagé avec d'autres agences ou la plateforme : un mot de passe ne peut pas être imposé. Envoyez un lien de réinitialisation."
      )
    );
  }

  // Un administrateur d'agence ne peut être touché que par le super-admin ou un
  // administrateur ACTIF de la même agence : sinon (gestionnaire), le compte est
  // traité comme protégé. Pas de mot de passe imposé (on se connecterait à sa
  // place), et ni écrasement du hash ni révocation de ses sessions (un
  // gestionnaire ne déconnecte pas un administrateur, comme pour
  // `revokeMemberSessions`) : seul le lien de réinitialisation, envoyé à son
  // adresse, est émis.
  const targetIsAdmin = await isTenantAdmin(userId, tenantId);
  const adminShielded = targetIsAdmin && !(await actorMayTouchAdmin(actorUserId, tenantId));
  if (adminShielded && newPassword) {
    throw new ForbiddenError(
      t(
        "Seul un administrateur de l'agence peut imposer un mot de passe à un administrateur. Envoyez un lien de réinitialisation."
      )
    );
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
      throw new BadRequestError(passwordValidation.error ?? t('Mot de passe invalide.'));
    }
  }

  // Hash and update password (jamais pour un compte protégé)
  const passwordHash = protectedAccount || adminShielded ? null : await hashPassword(password);

  // Issue a single-use reset link instead of e-mailing the password in clear
  // text (e-mail is not a confidential channel and the message is archived).
  const resetToken = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  // Critical action: password change, session revocation, reset token and
  // audit trace commit together or not at all.
  const sessionsRevoked = await prisma.$transaction(async tx => {
    if (passwordHash) {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash }
      });
    }

    // Révocation des sessions : toujours, sauf administrateur protégé d'un
    // gestionnaire et super-admin (portée plateforme, sauté par la fonction).
    const revocation = adminShielded
      ? { skipped: true, count: 0 }
      : await revokeUserSessionsInTx(tx, {
          userId,
          tenantId,
          targetGlobalRole: membership.user.globalRole,
          actorUserId
        });

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
    return !revocation.skipped;
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
  return {
    password: generated ? undefined : password,
    resetLinkSent: true,
    passwordReplaced: passwordHash !== null,
    sessionsRevoked
  };
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
    },
    select: { id: true, user: { select: { globalRole: true } } }
  });

  if (!membership) {
    throw new NotFoundError('Membre introuvable.');
  }

  // Les sessions d'un super-admin sont de portée plateforme : une agence n'y touche pas.
  if (membership.user.globalRole === 'SUPER_ADMIN') {
    throw new ForbiddenError(
      t("Les sessions d'un super-administrateur ne peuvent pas être révoquées depuis une agence.")
    );
  }

  if (await isTenantAdmin(userId, tenantId)) {
    await assertActorMayTouchAdmin(actorUserId, tenantId);
  }

  // Revoke all sessions (critical action: SESSIONS_REVOKED audit trace in the
  // same transaction). Toujours faite, même pour un compte présent dans d'autres
  // agences : sinon le titulaire d'une session volée y échapperait en se créant
  // une appartenance ailleurs (le super-admin est refusé plus haut).
  const { count: tokensRevoked } = await prisma.$transaction(tx =>
    revokeUserSessionsInTx(tx, {
      userId,
      tenantId,
      targetGlobalRole: membership.user.globalRole,
      actorUserId
    })
  );

  logger.info('Member sessions revoked', { userId, tenantId, actorUserId, tokensRevoked });
  return { sessionsRevoked: true, tokensRevoked };
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
