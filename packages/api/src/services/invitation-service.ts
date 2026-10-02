import { RESERVED_ROLE_KEYS } from '../lib/patrimoine/personal-permissions';
import { prisma, PrismaTransactionClient } from '../utils/database';
import { logger } from '../utils/logger';
import { GlobalRole, InvitationStatus, MembershipStatus } from '@prisma/client';
import { emailService } from './email-service';
import { hashPassword, validatePasswordStrength } from '../utils/password-utils';
import { logAuditEvent, AuditActionKey } from './audit-service';
import {
  BadRequestError,
  ConflictError,
  InvitationRequiresLoginError,
  NotFoundError
} from '../middleware/error-middleware';
import { assertBelongsToTenant } from '../utils/tenant-ownership';
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
    select: { id: true, scope: true, key: true }
  });
  // Rôle réservé (PERSONAL_SPACE_OWNER) : même réponse qu'un rôle inexistant.
  if (roles.length !== roleIds.length || roles.some(role => RESERVED_ROLE_KEYS.includes(role.key))) {
    throw new BadRequestError('Un ou plusieurs roles sont introuvables.');
  }
  if (roles.some(role => role.scope !== 'TENANT')) {
    throw new BadRequestError("Seuls les roles d'agence peuvent etre attribues par invitation.");
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
  /** Requis uniquement pour la creation d'un NOUVEAU compte (voir acceptInvitation). */
  password?: string;
  fullName?: string;
  /**
   * userId de la session en cours, si l'appelant est deja authentifie
   * (`optionalAuthenticate` sur la route). Sert a verifier qu'un compte
   * EXISTANT n'accepte l'invitation que depuis sa propre session — jamais
   * a partir du seul jeton d'invitation, qui ne prouve pas l'identite.
   */
  requestingUserId?: string;
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
  // Normalise en defense en profondeur : `inviteCollaboratorSchema`
  // (invitation-controller.ts) normalise deja la requete HTTP, mais cette
  // fonction reste appelable directement (tests, futurs appelants) — sans
  // ceci, le garde anti-super-admin juste en dessous se contournait par
  // variation de casse (`SuperAdmin@…` invite alors que le compte existant
  // est `superadmin@…`), et `Invitation.email` finissait a casse variable.
  const email = data.email.trim().toLowerCase();

  // Verify tenant exists and is active
  const tenant = await prisma.tenant.findUnique({
    where: { id: data.tenantId }
  });

  if (!tenant) {
    throw new NotFoundError('Tenant introuvable.');
  }

  if (tenant.status !== 'ACTIVE') {
    throw new BadRequestError("Ce tenant n'est plus actif.");
  }

  // Check for existing pending invitation. Insensible a la casse : une
  // invitation posee avant la normalisation peut encore porter une casse
  // mixte.
  const existingInvitation = await prisma.invitation.findFirst({
    where: {
      tenantId: data.tenantId,
      email: { equals: email, mode: 'insensitive' },
      status: InvitationStatus.PENDING,
      expiresAt: { gt: new Date() }
    }
  });

  if (existingInvitation) {
    throw new ConflictError('Une invitation en attente existe déjà pour cet email.');
  }

  // Check if user already has membership. `select` explicite : jamais
  // `passwordHash`, et globalRole sert au garde-fou super-admin ci-dessous.
  // `findFirst` + `mode: 'insensitive'` (pas `findUnique`) : un compte
  // existant peut porter une casse differente de celle saisie ici.
  const existingUser = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, globalRole: true }
  });

  // Un administrateur d'agence ne peut jamais inviter un compte super-admin
  // de la plateforme (prise de compte possible sinon : invite -> resend ->
  // jeton -> acceptation qui reecrivait le mot de passe). Message neutre :
  // ne confirme pas que l'adresse appartient a un super-admin.
  if (existingUser?.globalRole === 'SUPER_ADMIN') {
    throw new BadRequestError("Cette adresse e-mail ne peut pas recevoir d'invitation.");
  }

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
      throw new ConflictError('Cet utilisateur est déjà membre de ce tenant.');
    }
  }

  await assertTenantRoles(data.roleIds);

  // Create invitation in database (write core shared with tenant-provisioning-service)
  const { invitation, token } = await prisma.$transaction(tx =>
    createInvitationRecordTx(tx, {
      tenantId: data.tenantId,
      email,
      roleIds: data.roleIds,
      invitedByUserId: data.invitedByUserId
    })
  );

  // Send invitation email (don't fail if email fails)
  const roleLabels = await resolveRoleLabels(data.roleIds);
  try {
    await emailService.sendInviteEmail(
      email,
      token, // Send plain token, not hash
      tenant.name,
      roleLabels,
      invitation.expiresAt,
      data.tenantId
    );
    logger.info('Invitation email sent', {
      invitationId: invitation.id,
      email,
      tenantId: data.tenantId
    });
  } catch (error) {
    logger.error('Failed to send invitation email', {
      invitationId: invitation.id,
      email,
      error
    });
    // Don't throw - invitation is created, can be resent later
  }

  await sendInvitationWhatsapp({
    tenantId: data.tenantId,
    email,
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
      email,
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
    }
  };
}

/**
 * Compte cree par le provisionnement d'agence de la plateforme et jamais
 * active : seul cas ou le jeton d'invitation SEUL peut fixer un mot de passe
 * sur un compte existant (le jeton en clair ne prouve pas l'identite de son
 * porteur, donc toute autre situation exige la session du compte).
 *
 * Protections effectives : `emailVerified` faux (les chemins de connexion
 * l'exigent ou le forcent, voir auth-service.ts / passport.ts : c'est le
 * couplage a maintenir), aucun refresh token jamais emis pour ce compte, aucune
 * adhesion ACTIVE ailleurs, adhesion PENDING_INVITE dans l'agence de
 * l'invitation posee par le meme acteur, cet acteur etant super-admin actif.
 * `lastLoginAt` n'est PAS alimente aujourd'hui : le tester est inoffensif
 * mais ne protege rien tant qu'il n'est pas ecrit a la connexion.
 * Defense en profondeur : compte USER simple, sans Google, actif.
 */
async function isNeverActivatedProvisionedAdmin(
  user: {
    id: string;
    emailVerified: boolean;
    lastLoginAt: Date | null;
    globalRole: GlobalRole;
    googleId: string | null;
    isActive: boolean;
  },
  invitation: { tenantId: string; invitedBy: string | null }
): Promise<boolean> {
  if (user.emailVerified || user.lastLoginAt || !invitation.invitedBy) return false;
  if (user.globalRole !== GlobalRole.USER || user.googleId || user.isActive === false) return false;

  const issuedTokens = await prisma.refreshToken.count({ where: { userId: user.id } });
  if (issuedTokens > 0) return false;

  const activeMembership = await prisma.membership.findFirst({
    where: { userId: user.id, status: MembershipStatus.ACTIVE },
    select: { id: true }
  });
  if (activeMembership) return false;

  const pending = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: user.id, tenantId: invitation.tenantId } },
    select: { status: true, invitedBy: true }
  });
  if (!pending || pending.status !== MembershipStatus.PENDING_INVITE || pending.invitedBy !== invitation.invitedBy) {
    return false;
  }

  const inviter = await prisma.user.findUnique({
    where: { id: invitation.invitedBy },
    select: { globalRole: true, isActive: true }
  });
  return inviter?.globalRole === 'SUPER_ADMIN' && inviter.isActive !== false;
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
    throw new NotFoundError('Invitation invalide.');
  }

  // Check status
  if (invitation.status !== InvitationStatus.PENDING) {
    if (invitation.status === InvitationStatus.ACCEPTED) {
      throw new ConflictError('Cette invitation a déjà été acceptée.');
    }
    if (invitation.status === InvitationStatus.REVOKED) {
      throw new ConflictError('Cette invitation a été révoquée.');
    }
    if (invitation.status === InvitationStatus.EXPIRED) {
      throw new ConflictError('Cette invitation a expiré.');
    }
  }

  // Check expiration
  if (new Date() > invitation.expiresAt) {
    // Mark as expired
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: InvitationStatus.EXPIRED }
    });
    throw new ConflictError('Cette invitation a expiré.');
  }

  // Check if an account already exists for this email. `select` explicite :
  // jamais `passwordHash`. `findFirst` + `mode: 'insensitive'` (pas
  // `findUnique`) : une invitation posee avant la normalisation de
  // `inviteCollaboratorSchema` peut porter une casse differente de celle du
  // compte, sans quoi la recherche exacte ratait le compte existant et
  // acceptInvitation en recreait un second, doublon, sous la casse du jeton.
  let user = await prisma.user.findFirst({
    where: { email: { equals: invitation.email, mode: 'insensitive' } },
    select: {
      id: true,
      email: true,
      fullName: true,
      emailVerified: true,
      lastLoginAt: true,
      globalRole: true,
      googleId: true,
      isActive: true
    }
  });

  const isNewUser = !user;
  // Vrai seulement pour l'administrateur d'une agence fraichement creee par
  // le super-admin : son compte n'a jamais ete active (voir plus bas).
  let activatesProvisionedAdmin = false;
  let provisionedPasswordHash: string | null = null;

  if (user) {
    // Compte EXISTANT : l'acceptation ne fixe/reecrit JAMAIS son mot de
    // passe. Seule la session de CE compte (jeton + `optionalAuthenticate`
    // sur la route) peut le rattacher a l'agence — le seul jeton
    // d'invitation en clair ne prouve pas l'identite de son porteur, et
    // permettait auparavant une prise de compte (invite d'un email
    // existant -> resend -> jeton -> reecriture du mot de passe).
    if (!data.requestingUserId || data.requestingUserId !== user.id) {
      // Exception etroite : premier administrateur cree par le provisionnement
      // de la plateforme (compte jamais active, mot de passe jetable inconnu).
      // Le jeton ne sert alors qu'a FIXER un premier mot de passe, et
      // seulement si toutes les conditions de `isNeverActivatedProvisionedAdmin`
      // sont reunies ; sinon comportement inchange (session requise).
      if (!(await isNeverActivatedProvisionedAdmin(user, invitation))) {
        throw new InvitationRequiresLoginError();
      }
      if (!data.password) {
        throw new BadRequestError('Le mot de passe est requis pour créer votre compte.');
      }
      const passwordValidation = validatePasswordStrength(data.password);
      if (!passwordValidation.isValid) {
        throw new BadRequestError(passwordValidation.error);
      }
      provisionedPasswordHash = await hashPassword(data.password);
      activatesProvisionedAdmin = true;
    }

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
        throw new ConflictError('Vous êtes déjà membre de ce tenant.');
      }
    }
    // Rien d'autre a ecrire sur le compte : ni mot de passe, ni nom, ni
    // statut — la session prouve deja que le compte est actif et verifie.
  } else {
    // Nouveau compte : c'est le SEUL cas ou l'acceptation fixe un mot de
    // passe.
    if (!data.password) {
      throw new BadRequestError('Le mot de passe est requis pour créer votre compte.');
    }

    const passwordValidation = validatePasswordStrength(data.password);
    if (!passwordValidation.isValid) {
      throw new BadRequestError(passwordValidation.error);
    }

    const passwordHash = await hashPassword(data.password);

    user = await prisma.user.create({
      data: {
        email: invitation.email,
        passwordHash,
        fullName: data.fullName,
        emailVerified: true, // Trust invitation email
        isActive: true
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        emailVerified: true,
        lastLoginAt: true,
        globalRole: true,
        googleId: true,
        isActive: true
      }
    });
  }

  if (!user) {
    throw new NotFoundError('Invitation invalide.');
  }
  const activatedUser = user;
  const membership = await prisma.$transaction(async tx => {
    // Reservation atomique de l'invitation : une seule acceptation gagne, la
    // seconde (course) echoue proprement avant d'ecrire quoi que ce soit.
    const claimed = await tx.invitation.updateMany({
      // tokenHash + expiresAt : un resend (nouveau jeton) ou une expiration
      // pendant le hachage du mot de passe ne laissent pas passer l'ancien jeton.
      where: { id: invitation.id, status: InvitationStatus.PENDING, tokenHash, expiresAt: { gt: new Date() } },
      data: {
        status: InvitationStatus.ACCEPTED,
        acceptedBy: activatedUser.id,
        acceptedAt: new Date()
      }
    });
    if (claimed.count !== 1) {
      throw new ConflictError('Cette invitation a déjà été acceptée.');
    }

    if (activatesProvisionedAdmin && provisionedPasswordHash) {
      // Garde rejouee dans l'ecriture : le compte ne doit toujours jamais
      // avoir ete active ni verifie au moment precis de l'ecriture.
      const written = await tx.user.updateMany({
        where: { id: activatedUser.id, emailVerified: false, lastLoginAt: null, isActive: true },
        data: {
          passwordHash: provisionedPasswordHash,
          fullName: data.fullName ?? activatedUser.fullName,
          emailVerified: true
        }
      });
      if (written.count !== 1) {
        throw new InvitationRequiresLoginError();
      }
    }

    const upserted = await tx.membership.upsert({
      where: {
        userId_tenantId: {
          userId: activatedUser.id,
          tenantId: invitation.tenantId
        }
      },
      update: {
        status: MembershipStatus.ACTIVE,
        acceptedAt: new Date()
      },
      create: {
        userId: activatedUser.id,
        tenantId: invitation.tenantId,
        status: MembershipStatus.ACTIVE,
        invitedBy: invitation.invitedBy,
        invitedAt: invitation.createdAt,
        acceptedAt: new Date()
      }
    });

    // Attribution des roles choisis au moment de l'invitation. Les
    // permissions sont calculees uniquement a partir de user_roles : sans
    // cette etape, le collaborateur arrive sans aucun droit.
    if (invitation.roleIds.length > 0) {
      await tx.userRole.createMany({
        data: invitation.roleIds.map(roleId => ({
          userId: activatedUser.id,
          roleId,
          tenantId: invitation.tenantId
        })),
        skipDuplicates: true
      });
    }
    return upserted;
  });

  if (invitation.roleIds.length > 0) {
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
      isNewUser,
      passwordSetByInvitation: activatesProvisionedAdmin
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
 * @param tenantId - Agence de l'appelant (posee par `requireTenantAccess`), jamais un
 * simple champ du body : sans elle, un administrateur d'une agence A pouvait renvoyer
 * l'invitation d'une agence B (IDOR) et en recuperer le jeton via `acceptUrl`.
 * @param actorUserId - User resending (for audit)
 * @returns La nouvelle date d'expiration (le token reste interne au serveur)
 */
export async function resendInvitation(invitationId: string, tenantId: string, actorUserId: string) {
  // Garde-fou generique (utils/tenant-ownership.ts) plutot qu'un
  // `findFirst({ id, tenantId })` recopie a la main : une invitation d'une
  // autre agence leve la meme NotFoundError, exactement comme si elle
  // n'existait pas.
  await assertBelongsToTenant(prisma, 'invitation', invitationId, tenantId, {
    message: 'Invitation introuvable.'
  });

  const invitation = await prisma.invitation.findUnique({
    where: { id: invitationId },
    include: { tenant: true }
  });

  if (!invitation) {
    throw new NotFoundError('Invitation introuvable.');
  }

  if (invitation.status !== InvitationStatus.PENDING) {
    throw new ConflictError('Seules les invitations en attente peuvent être renvoyées.');
  }

  if (new Date() > invitation.expiresAt) {
    throw new ConflictError('Cette invitation a expiré.');
  }

  // Generate new token (invalidate old one)
  const { token, hash } = generateInvitationToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // Reset to 7 days

  await prisma.invitation.update({
    where: { id: invitationId },
    data: {
      tokenHash: hash,
      expiresAt
    }
  });

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
    throw new BadRequestError("Échec de l'envoi de l'email. L'invitation a été mise à jour.");
  }

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
 * @param tenantId - Agence de l'appelant (posee par `requireTenantAccess`) : meme
 * garde-fou IDOR que `resendInvitation`.
 * @param actorUserId - User revoking (for audit)
 */
export async function revokeInvitation(invitationId: string, tenantId: string, actorUserId: string) {
  await assertBelongsToTenant(prisma, 'invitation', invitationId, tenantId, {
    message: 'Invitation introuvable.'
  });

  const invitation = await prisma.invitation.findUnique({
    where: { id: invitationId }
  });

  if (!invitation) {
    throw new NotFoundError('Invitation introuvable.');
  }

  if (invitation.status !== InvitationStatus.PENDING) {
    throw new ConflictError('Seules les invitations en attente peuvent être révoquées.');
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

  // `roleIds` est une colonne de l'invitation : on ne le relit plus dans le
  // journal d'audit (une requête par invitation, et une dépendance à une table
  // que la retention purge, ADR-006 phase 5).
  return invitations.map(invitation => ({
    id: invitation.id,
    email: invitation.email,
    status: invitation.status,
    invitedAt: invitation.createdAt,
    expiresAt: invitation.expiresAt,
    acceptedAt: invitation.acceptedAt,
    revokedAt: invitation.revokedAt,
    roleIds: invitation.roleIds,
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
  }));
}
