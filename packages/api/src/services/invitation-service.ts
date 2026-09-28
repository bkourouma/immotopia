import { prisma, PrismaTransactionClient } from '../utils/database';
import { logger } from '../utils/logger';
import { InvitationStatus, MembershipStatus } from '@prisma/client';
import { emailService } from './email-service';
import { hashPassword, validatePasswordStrength } from '../utils/password-utils';
import { logAuditEvent, AuditActionKey } from './audit-service';
import crypto from 'crypto';

export function getFrontendBaseUrl(): string {
  return (process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:3000').replace(/\/$/, '');
}

/** URL d'acceptation d'une invitation, a partir du jeton en clair. Format partage par l'email et l'API. */
export function buildInvitationAcceptUrl(token: string): string {
  return `${getFrontendBaseUrl()}/auth/accept-invite?token=${token}`;
}

/** Libelles francais des roles de scope TENANT, pour l'email d'invitation. */
const TENANT_ROLE_LABELS_FR: Record<string, string> = {
  TENANT_ADMIN: "Administrateur de l'agence",
  TENANT_MANAGER: 'Gestionnaire',
  TENANT_AGENT: 'Agent immobilier',
  TENANT_ACCOUNTANT: 'Comptable'
};

/**
 * Verifie que les roles demandes existent et sont bien de scope TENANT.
 * Sans ce controle, l'endpoint d'invitation permettrait d'attribuer un role
 * PLATFORM a un simple collaborateur.
 */
async function assertTenantRoles(roleIds: string[]): Promise<void> {
  if (!roleIds || roleIds.length === 0) return;
  const roles = await prisma.role.findMany({
    where: { id: { in: roleIds } },
    select: { id: true, scope: true }
  });
  if (roles.length !== roleIds.length) {
    throw new Error('Un ou plusieurs roles sont introuvables.');
  }
  if (roles.some(role => role.scope !== 'TENANT')) {
    throw new Error("Seuls les roles d'agence peuvent etre attribues par invitation.");
  }
}

/**
 * Resout les libelles francais des roles attribues a une invitation.
 * Les noms stockes en base sont en anglais : on les traduit quand la cle est
 * connue, sinon on retombe sur le nom de la base.
 */
export async function resolveRoleLabels(roleIds: string[]): Promise<string[]> {
  if (!roleIds || roleIds.length === 0) return [];
  try {
    const roles = await prisma.role.findMany({
      where: { id: { in: roleIds } },
      select: { key: true, name: true }
    });
    return roles.map(role => TENANT_ROLE_LABELS_FR[role.key] || role.name);
  } catch (error) {
    logger.warn('Failed to resolve role labels for invitation email', { error });
    return [];
  }
}

async function sendInvitationWhatsapp(params: {
  tenantId: string;
  email: string;
  tenantName: string;
  token: string;
}): Promise<void> {
  const { tenantId, email, tenantName, token } = params;
  try {
    const { getCrmContactIdForWhatsApp } = await import('./whatsapp-contact-resolve');
    const contactId = await getCrmContactIdForWhatsApp(tenantId, email);
    if (!contactId) {
      logger.info('Invitation WhatsApp skipped: no CRM contact with consent/phone for email', {
        tenantId,
        email
      });
      return;
    }

    const { sendWhatsappNotification } = await import('./whatsapp-notification-send-service');
    const inviteUrl = buildInvitationAcceptUrl(token);
    await sendWhatsappNotification({
      tenantId,
      notificationKey: 'PORTAL_ACCOUNT_CREATED',
      contactId,
      variables: {
        userName: email,
        tenantName,
        resetUrl: inviteUrl,
        inviteUrl
      }
    });
  } catch (error) {
    logger.warn('Invitation WhatsApp send failed', {
      tenantId,
      email,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Interface for inviting a collaborator
 */
export interface InviteCollaboratorRequest {
  email: string;
  tenantId: string;
  roleIds: string[]; // Array of role IDs to assign
  invitedByUserId: string;
}

/**
 * Interface for accepting an invitation
 */
export interface AcceptInvitationRequest {
  token: string;
  password: string;
  fullName?: string;
}

/**
 * Generate invitation token and hash
 * @returns Object with token and hash
 */
export function generateInvitationToken(): { token: string; hash: string } {
  const token = crypto.randomUUID();
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hash };
}

/** Duree de validite par defaut d'une invitation. */
const INVITATION_VALIDITY_DAYS = 7;

/**
 * Partie ECRITURE, transactionnelle, de la creation d'une invitation : jeton +
 * ligne `Invitation`. Aucune verification metier ici (tenant actif, invitation
 * en attente deja existante, membre deja actif, roles valides) : ces controles
 * restent la responsabilite de l'appelant, avant d'ouvrir la transaction —
 * exactement comme `inviteCollaborator` ci-dessous, qui les fait puis delegue
 * l'ecriture a cette fonction.
 *
 * Extraite pour `tenant-provisioning-service.ts` (lot F1) : provisionner une
 * agence pose l'invitation de son administrateur DANS la meme transaction que
 * le reste (agence, modules, abonnement...), pour rester tout-ou-rien. L'envoi
 * de l'e-mail, lui, ne peut pas se faire ici : il doit arriver apres COMMIT,
 * pour qu'un e-mail parti ne pointe jamais vers une transaction annulee.
 *
 * @returns L'invitation creee et son jeton EN CLAIR (a envoyer par e-mail/WhatsApp
 * hors de cette fonction ; seul son hash est persiste).
 */
export async function createInvitationRecordTx(
  tx: PrismaTransactionClient,
  params: { tenantId: string; email: string; roleIds: string[]; invitedByUserId: string; validityDays?: number }
): Promise<{ invitation: Awaited<ReturnType<typeof tx.invitation.create>>; token: string }> {
  const { token, hash } = generateInvitationToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (params.validityDays ?? INVITATION_VALIDITY_DAYS));

  const invitation = await tx.invitation.create({
    data: {
      tenantId: params.tenantId,
      email: params.email,
      tokenHash: hash,
      expiresAt,
      status: InvitationStatus.PENDING,
      roleIds: params.roleIds ?? [],
      invitedBy: params.invitedByUserId
    }
  });

  return { invitation, token };
}

/**
 * Invite a collaborator to a tenant
 * @param data - Invitation data
 * @returns L'invitation creee (sans le token, qui reste interne au serveur)
 */
export async function inviteCollaborator(data: InviteCollaboratorRequest) {
  // Verify tenant exists and is active
  const tenant = await prisma.tenant.findUnique({
    where: { id: data.tenantId }
  });

  if (!tenant) {
    throw new Error('Tenant introuvable.');
  }

  if (tenant.status !== 'ACTIVE') {
    throw new Error("Ce tenant n'est plus actif.");
  }

  // Check for existing pending invitation
  const existingInvitation = await prisma.invitation.findFirst({
    where: {
      tenantId: data.tenantId,
      email: data.email,
      status: InvitationStatus.PENDING,
      expiresAt: { gt: new Date() }
    }
  });

  if (existingInvitation) {
    throw new Error('Une invitation en attente existe déjà pour cet email.');
  }

  // Check if user already has membership
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email }
  });

  if (existingUser) {
    const existingMembership = await prisma.membership.findUnique({
      where: {
        userId_tenantId: {
          userId: existingUser.id,
          tenantId: data.tenantId
        }
      }
    });

    if (existingMembership && existingMembership.status === MembershipStatus.ACTIVE) {
      throw new Error('Cet utilisateur est déjà membre de ce tenant.');
    }
  }

  await assertTenantRoles(data.roleIds);

  // Create invitation in database (write core shared with tenant-provisioning-service)
  const { invitation, token } = await prisma.$transaction(tx =>
    createInvitationRecordTx(tx, {
      tenantId: data.tenantId,
      email: data.email,
      roleIds: data.roleIds,
      invitedByUserId: data.invitedByUserId
    })
  );

  // Send invitation email (don't fail if email fails ; on remonte l'echec au
  // lieu d'annoncer un succes qui n'a pas eu lieu — BUG-2026-09-28-004)
  const roleLabels = await resolveRoleLabels(data.roleIds);
  let emailSent = true;
  try {
    await emailService.sendInviteEmail(
      data.email,
      token, // Send plain token, not hash
      tenant.name,
      roleLabels,
      invitation.expiresAt,
      data.tenantId
    );
    logger.info('Invitation email sent', {
      invitationId: invitation.id,
      email: data.email,
      tenantId: data.tenantId
    });
  } catch (error) {
    emailSent = false;
    logger.error('Failed to send invitation email', {
      invitationId: invitation.id,
      email: data.email,
      error
    });
    // Don't throw - invitation is created, can be resent later
  }

  await sendInvitationWhatsapp({
    tenantId: data.tenantId,
    email: data.email,
    tenantName: tenant.name,
    token
  });

  // Audit log
  logAuditEvent({
    actorUserId: data.invitedByUserId,
    tenantId: data.tenantId,
    actionKey: AuditActionKey.USER_INVITED,
    entityType: 'Invitation',
    entityId: invitation.id,
    payload: {
      email: data.email,
      roleIds: data.roleIds
    }
  });

  // Le token en clair reste interne au serveur (email + WhatsApp) : il ne doit
  // jamais etre expose dans la reponse HTTP, seul son hash est persiste.
  return {
    invitation: {
      id: invitation.id,
      email: invitation.email,
      expiresAt: invitation.expiresAt,
      status: invitation.status
    },
    emailSent
  };
}

/**
 * Accept an invitation
 * @param data - Acceptance data
 * @returns Created membership and user
 */
export async function acceptInvitation(data: AcceptInvitationRequest) {
  // Hash the token to find invitation
  const tokenHash = crypto.createHash('sha256').update(data.token).digest('hex');

  // Find invitation
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash },
    include: { tenant: true }
  });

  if (!invitation) {
    throw new Error('Invitation invalide.');
  }

  // Check status
  if (invitation.status !== InvitationStatus.PENDING) {
    if (invitation.status === InvitationStatus.ACCEPTED) {
      throw new Error('Cette invitation a déjà été acceptée.');
    }
    if (invitation.status === InvitationStatus.REVOKED) {
      throw new Error('Cette invitation a été révoquée.');
    }
    if (invitation.status === InvitationStatus.EXPIRED) {
      throw new Error('Cette invitation a expiré.');
    }
  }

  // Check expiration
  if (new Date() > invitation.expiresAt) {
    // Mark as expired
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: InvitationStatus.EXPIRED }
    });
    throw new Error('Cette invitation a expiré.');
  }

  // Validate password
  const passwordValidation = validatePasswordStrength(data.password);
  if (!passwordValidation.isValid) {
    throw new Error(passwordValidation.error);
  }

  const passwordHash = await hashPassword(data.password);

  // Check if user already exists
  let user = await prisma.user.findUnique({
    where: { email: invitation.email }
  });

  const isNewUser = !user;

  if (user) {
    // User exists - check if already has membership
    const existingMembership = await prisma.membership.findUnique({
      where: {
        userId_tenantId: {
          userId: user.id,
          tenantId: invitation.tenantId
        }
      }
    });

    if (existingMembership) {
      if (existingMembership.status === MembershipStatus.ACTIVE) {
        // Mark invitation as accepted anyway
        await prisma.invitation.update({
          where: { id: invitation.id },
          data: {
            status: InvitationStatus.ACCEPTED,
            acceptedBy: user.id,
            acceptedAt: new Date()
          }
        });
        throw new Error('Vous êtes déjà membre de ce tenant.');
      }
    }

    // Existing user: refresh password from invitation flow so login works
    // with the password entered during invite acceptance.
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        ...(data.fullName ? { fullName: data.fullName } : {}),
        emailVerified: true,
        isActive: true
      }
    });
  } else {
    // Create new user
    user = await prisma.user.create({
      data: {
        email: invitation.email,
        passwordHash,
        fullName: data.fullName,
        emailVerified: true, // Trust invitation email
        isActive: true
      }
    });
  }

  // Create or update membership
  const membership = await prisma.membership.upsert({
    where: {
      userId_tenantId: {
        userId: user.id,
        tenantId: invitation.tenantId
      }
    },
    update: {
      status: MembershipStatus.ACTIVE,
      acceptedAt: new Date()
    },
    create: {
      userId: user.id,
      tenantId: invitation.tenantId,
      status: MembershipStatus.ACTIVE,
      invitedBy: invitation.invitedBy,
      invitedAt: invitation.createdAt,
      acceptedAt: new Date()
    }
  });

  // Update invitation
  await prisma.invitation.update({
    where: { id: invitation.id },
    data: {
      status: InvitationStatus.ACCEPTED,
      acceptedBy: user.id,
      acceptedAt: new Date()
    }
  });

  // Attribution des roles choisis au moment de l'invitation. Les permissions
  // sont calculees uniquement a partir de user_roles : sans cette etape, le
  // collaborateur arrive sans aucun droit et toutes les routes repondent 403.
  if (invitation.roleIds.length > 0) {
    await prisma.userRole.createMany({
      data: invitation.roleIds.map(roleId => ({
        userId: user.id,
        roleId,
        tenantId: invitation.tenantId
      })),
      skipDuplicates: true
    });
    logger.info('Invitation roles assigned', {
      invitationId: invitation.id,
      userId: user.id,
      tenantId: invitation.tenantId,
      roleIds: invitation.roleIds
    });
  } else {
    logger.warn('Invitation accepted without any role', {
      invitationId: invitation.id,
      userId: user.id,
      tenantId: invitation.tenantId
    });
  }

  logger.info('Invitation accepted', {
    invitationId: invitation.id,
    userId: user.id,
    tenantId: invitation.tenantId,
    isNewUser
  });

  // Audit log
  logAuditEvent({
    actorUserId: user.id,
    tenantId: invitation.tenantId,
    actionKey: AuditActionKey.USER_CREATED,
    entityType: 'Membership',
    entityId: membership.id,
    payload: {
      email: invitation.email,
      isNewUser
    }
  });

  return {
    membership,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName
    }
  };
}

/**
 * Resend invitation email
 * @param invitationId - Invitation ID
 * @param actorUserId - User resending (for audit)
 * @returns La nouvelle date d'expiration (le token reste interne au serveur)
 */
export async function resendInvitation(invitationId: string, actorUserId: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { id: invitationId },
    include: { tenant: true }
  });

  if (!invitation) {
    throw new Error('Invitation introuvable.');
  }

  if (invitation.status !== InvitationStatus.PENDING) {
    throw new Error('Seules les invitations en attente peuvent être renvoyées.');
  }

  if (new Date() > invitation.expiresAt) {
    throw new Error('Cette invitation a expiré.');
  }

  // Nouveau jeton PREPARE mais pas encore persiste : tant que l'e-mail n'est
  // pas parti, l'ancien jeton (toujours en base) doit rester valable. Avant
  // ce correctif, le tokenHash etait ecrase avant l'envoi : un echec d'envoi
  // invalidait l'ancien lien sans qu'aucun lien nouveau ne soit connu de
  // personne (BUG-2026-09-28-004).
  const { token, hash } = generateInvitationToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // Reset to 7 days

  // Send email
  try {
    const roleLabels = await resolveRoleLabels(invitation.roleIds);
    await emailService.sendInviteEmail(
      invitation.email,
      token,
      invitation.tenant.name,
      roleLabels,
      expiresAt,
      invitation.tenantId
    );
    logger.info('Invitation email resent', {
      invitationId,
      email: invitation.email,
      actorUserId
    });
  } catch (error) {
    logger.error('Failed to resend invitation email', {
      invitationId,
      email: invitation.email,
      error,
      actorUserId
    });
    throw new Error("Échec de l'envoi de l'email. L'ancien lien d'invitation reste valable.");
  }

  // L'e-mail est parti : on peut maintenant invalider l'ancien jeton et
  // persister le nouveau, sans risque de perdre un lien valide en route.
  await prisma.invitation.update({
    where: { id: invitationId },
    data: {
      tokenHash: hash,
      expiresAt
    }
  });

  await sendInvitationWhatsapp({
    tenantId: invitation.tenantId,
    email: invitation.email,
    tenantName: invitation.tenant.name,
    token
  });

  // acceptUrl/emailSent : ajoutes pour F2 (le super-admin doit pouvoir copier
  // le lien et voir l'etat de l'envoi sans deviner). On atteint ce point
  // uniquement si l'e-mail est parti (sinon le catch ci-dessus a deja leve) :
  // emailSent vaut donc toujours true ici. Champs ajoutes en fin de reponse,
  // aucun appelant existant ne lisait plus que `expiresAt`.
  return { expiresAt, acceptUrl: buildInvitationAcceptUrl(token), emailSent: true };
}

/**
 * Revoke an invitation
 * @param invitationId - Invitation ID
 * @param actorUserId - User revoking (for audit)
 */
export async function revokeInvitation(invitationId: string, actorUserId: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { id: invitationId }
  });

  if (!invitation) {
    throw new Error('Invitation introuvable.');
  }

  if (invitation.status !== InvitationStatus.PENDING) {
    throw new Error('Seules les invitations en attente peuvent être révoquées.');
  }

  await prisma.invitation.update({
    where: { id: invitationId },
    data: {
      status: InvitationStatus.REVOKED,
      revokedAt: new Date()
    }
  });

  logger.info('Invitation revoked', { invitationId, actorUserId });

  // Audit log
  logAuditEvent({
    actorUserId,
    tenantId: invitation.tenantId,
    actionKey: AuditActionKey.USER_INVITED, // Could add REVOKED action
    entityType: 'Invitation',
    entityId: invitationId,
    payload: { action: 'revoked' }
  });
}

/**
 * List invitations for a tenant
 * @param tenantId - Tenant ID
 * @returns List of invitations with roleIds from audit logs
 */
export async function listInvitations(tenantId: string) {
  // Get all invitations for the tenant
  const invitations = await prisma.invitation.findMany({
    where: { tenantId },
    include: {
      inviter: {
        select: {
          id: true,
          email: true,
          fullName: true
        }
      },
      accepter: {
        select: {
          id: true,
          email: true,
          fullName: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  // Get roleIds from audit logs for each invitation
  const invitationsWithRoleIds = await Promise.all(
    invitations.map(async invitation => {
      // Find audit log for this invitation creation
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          tenantId,
          entityType: 'Invitation',
          entityId: invitation.id,
          actionKey: AuditActionKey.USER_INVITED
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      // Extract roleIds from audit log payload
      let roleIds: string[] = [];
      if (auditLog?.payload && typeof auditLog.payload === 'object') {
        const payload = auditLog.payload as any;
        if (Array.isArray(payload.roleIds)) {
          roleIds = payload.roleIds;
        }
      }

      return {
        id: invitation.id,
        email: invitation.email,
        status: invitation.status,
        invitedAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
        acceptedAt: invitation.acceptedAt,
        revokedAt: invitation.revokedAt,
        roleIds,
        invitedBy: invitation.inviter
          ? {
              id: invitation.inviter.id,
              email: invitation.inviter.email,
              fullName: invitation.inviter.fullName
            }
          : null,
        acceptedBy: invitation.accepter
          ? {
              id: invitation.accepter.id,
              email: invitation.accepter.email,
              fullName: invitation.accepter.fullName
            }
          : null
      };
    })
  );

  return invitationsWithRoleIds;
}
