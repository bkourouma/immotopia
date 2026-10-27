import { GlobalRole, MembershipStatus, TenantStatus } from '@prisma/client';
import crypto from 'crypto';
import { hashPassword, validatePasswordStrength, comparePassword } from '../utils/password-utils';
import { emailService, isEmailDeliveryConfigured } from './email-service';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt-utils';
import { RegisterRequest, LoginRequest, PasswordResetRequest, ForgotPasswordRequest } from '../types/auth-types';
import { logger } from '../utils/logger';
import { prisma } from '../utils/database';
import { logAuthEvent, recordAuthEvent } from './audit-auth-events';
import { frontendUrl, isProduction } from '../config/env';
import { AppError, BadRequestError } from '../middleware/error-middleware';
import { AuditActionKey } from '../types/audit-types';
import { legacySanitizedPassword } from '../middleware/validation-middleware';
import { getUserPermissions } from './permission-service';
import type { Language } from '../i18n';

/** Entity type used for every authentication event. */
const AUTH_ENTITY = 'User';

/** Réponse unique de l'inscription, que l'adresse existe ou non (anti-sondage des comptes). */
export const REGISTRATION_ACCEPTED_MESSAGE =
  'Si cette adresse est valide, un e-mail de vérification vient de vous être envoyé.';

/** Réponse unique d'un échec de connexion tant que le mot de passe n'est pas correct. */
const INVALID_CREDENTIALS_MESSAGE = 'Email ou mot de passe incorrect.';

/**
 * Hash bcrypt (coût 12, comme `hashPassword`) d'une valeur aléatoire jetée :
 * sert à faire dépenser à un e-mail inconnu le même temps qu'un e-mail connu.
 * Aucun mot de passe réel n'y correspond.
 */
const DUMMY_PASSWORD_HASH = '$2b$12$wSyf5Hb.FEdQ5gWclTtBFezr9YiKXw0o1AejiRc15kyM9uvsEkef.';

/** Vrai quand une erreur Prisma est une violation de contrainte d'unicité (P2002). */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

/**
 * Invalide les liens de vérification en cours de l'utilisateur et en émet un
 * nouveau (valable 24 h). Retourne le jeton à envoyer par e-mail.
 */
async function issueVerificationToken(userId: string): Promise<string> {
  const verificationToken = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  await prisma.$transaction(async tx => {
    await tx.emailVerificationToken.updateMany({
      where: { userId, used: false },
      data: { used: true }
    });
    await tx.emailVerificationToken.create({
      data: { token: verificationToken, userId, expiresAt }
    });
  });
  return verificationToken;
}

/** Envoie un e-mail sans jamais faire échouer l'inscription (l'utilisateur peut demander un renvoi). */
async function sendQuietly(userId: string, what: string, send: () => Promise<void>): Promise<void> {
  try {
    await send();
    logger.info(`${what} sent`, { userId });
  } catch (error) {
    logger.error(`Failed to send ${what}`, { userId, error });
  }
}

/**
 * Register a new user.
 *
 * La réponse est identique que l'adresse existe déjà ou non (aucune fuite sur
 * l'existence d'un compte) : un compte non vérifié reçoit un nouveau lien de
 * vérification, un compte vérifié un e-mail « vous avez déjà un compte », et
 * aucun utilisateur n'est créé dans ces deux cas. Le hash du mot de passe est
 * calculé dans tous les cas pour que les temps de réponse restent comparables.
 *
 * En production, sans serveur d'e-mails, le lien de vérification ne peut pas
 * arriver : l'inscription est refusée (503 `SIGNUP_UNAVAILABLE`) plutôt que de
 * créer des comptes jamais vérifiables.
 */
export async function registerUser(data: RegisterRequest): Promise<void> {
  if (isProduction && !isEmailDeliveryConfigured()) {
    throw new AppError("L'inscription est momentanément indisponible.", 503, 'SIGNUP_UNAVAILABLE');
  }

  // Validate password strength
  const passwordValidation = validatePasswordStrength(data.password);
  if (!passwordValidation.isValid) {
    throw new BadRequestError(passwordValidation.error);
  }

  // Toujours calculé, même pour une adresse déjà connue (temps de réponse).
  const passwordHash = await hashPassword(data.password);

  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
    select: { id: true, email: true, emailVerified: true, fullName: true, preferredLanguage: true }
  });

  if (existingUser) {
    // Pré-détournement : un compte jamais vérifié appartient à la DERNIÈRE personne qui a prouvé
    // vouloir cette adresse. Son mot de passe et son nom remplacent ceux d'une inscription
    // antérieure (éventuellement d'un tiers), et toute session ouverte avec eux est révoquée,
    // AVANT de ré-émettre le lien de vérification. La réponse reste identique.
    if (!existingUser.emailVerified) {
      await takeOverUnverifiedAccount(existingUser.id, passwordHash, data.fullName);
    }
    await notifyExistingAccount({ ...existingUser, fullName: data.fullName ?? existingUser.fullName });
    return;
  }

  let user: { id: string; preferredLanguage: string | null };
  try {
    user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        fullName: data.fullName,
        globalRole: GlobalRole.USER, // Default role
        emailVerified: false,
        isActive: true
      },
      select: { id: true, preferredLanguage: true }
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Inscription concurrente de la même adresse : même réponse.
      return;
    }
    throw error;
  }

  const verificationToken = await issueVerificationToken(user.id);
  await sendQuietly(user.id, 'verification email', () =>
    emailService.sendVerificationEmail(data.email, verificationToken, {
      userName: data.fullName,
      language: user.preferredLanguage
    })
  );
}

/** Remplace identifiants et nom d'un compte NON vérifié par ceux de la dernière inscription et révoque ses sessions. */
async function takeOverUnverifiedAccount(
  userId: string,
  passwordHash: string,
  fullName: string | undefined
): Promise<void> {
  await prisma.$transaction(async tx => {
    await tx.user.update({
      where: { id: userId },
      data: { passwordHash, ...(fullName !== undefined ? { fullName } : {}) }
    });
    await tx.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true, revokedAt: new Date() }
    });
  });
}

/** E-mail sobre à une adresse déjà inscrite et vérifiée : ni lien de vérification ni création de compte. */
function sendAccountAlreadyExistsEmail(to: string): Promise<void> {
  const loginLink = `${frontendUrl}/login`;
  return emailService.sendEmail({
    to,
    subject: 'Vous avez déjà un compte',
    html: `
      <p>Vous avez déjà un compte avec cette adresse e-mail.</p>
      <p>Pour vous connecter : <a href="${loginLink}">${loginLink}</a></p>
      <p>Si vous avez oublié votre mot de passe, utilisez « Mot de passe oublié » sur la page de connexion.
      Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</p>
    `
  });
}

/** Courriel envoyé à une adresse déjà inscrite : nouveau lien, ou rappel de compte. */
async function notifyExistingAccount(existing: {
  id: string;
  email: string;
  emailVerified: boolean;
  fullName: string | null;
  preferredLanguage: string | null;
}): Promise<void> {
  if (existing.emailVerified) {
    await sendQuietly(existing.id, 'existing account email', () => sendAccountAlreadyExistsEmail(existing.email));
    return;
  }
  const verificationToken = await issueVerificationToken(existing.id);
  await sendQuietly(existing.id, 'verification email', () =>
    emailService.sendVerificationEmail(existing.email, verificationToken, {
      userName: existing.fullName ?? undefined,
      language: existing.preferredLanguage
    })
  );
}

/**
 * Verify email with token
 * @param token - Email verification token
 * @returns User with verified email
 */
export async function verifyEmail(token: string) {
  // Find valid verification token
  const verificationToken = await prisma.emailVerificationToken.findFirst({
    where: {
      token,
      used: false,
      expiresAt: {
        gt: new Date()
      }
    },
    include: {
      user: true
    }
  });

  if (!verificationToken) {
    throw new Error('Token de vérification invalide ou expiré.');
  }

  // Mark token as used and verify user email
  await prisma.$transaction(async tx => {
    await tx.emailVerificationToken.update({
      where: { id: verificationToken.id },
      data: { used: true }
    });

    await tx.user.update({
      where: { id: verificationToken.userId },
      data: { emailVerified: true }
    });
  });

  logger.info('Email verified', { userId: verificationToken.userId, email: verificationToken.user.email });

  const { passwordHash: removedPasswordHash, ...userPublic } = verificationToken.user;
  void removedPasswordHash;
  return userPublic;
}

/**
 * Resend email verification
 * @param email - User email
 */
export async function resendVerificationEmail(email: string) {
  // Find user
  const user = await prisma.user.findUnique({
    where: { email }
  });

  if (!user) {
    // Don't reveal if user exists
    return;
  }

  if (user.emailVerified) {
    // Meme reponse que pour une adresse inconnue : pas d'enumeration de comptes.
    return;
  }

  // Invalidate previous tokens
  await prisma.emailVerificationToken.updateMany({
    where: {
      userId: user.id,
      used: false
    },
    data: {
      used: true
    }
  });

  // Generate new verification token (UUID v4)
  const verificationToken = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours expiry

  // Create new token
  await prisma.emailVerificationToken.create({
    data: {
      token: verificationToken,
      userId: user.id,
      expiresAt: expiresAt
    }
  });

  // Send verification email
  try {
    await emailService.sendVerificationEmail(user.email, verificationToken, {
      userName: user.fullName ?? undefined,
      language: user.preferredLanguage
    });
  } catch (error) {
    // L'echec d'envoi est journalise, jamais expose : la reponse reste identique.
    logger.error('Verification email resend failed', { userId: user.id, error });
    return;
  }
  logger.info('Verification email resent', { userId: user.id, email: user.email });
}

/**
 * Login user
 * @param data - Login credentials
 * @returns User and tokens
 */
/**
 * Horodate la derniere connexion reussie (User.lastLoginAt).
 * Meilleur effort : un echec d'ecriture est journalise et ne bloque jamais la
 * connexion. Jamais appele par le rafraichissement de session.
 */
export async function recordLastLogin(userId: string): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
      select: { id: true }
    });
  } catch (error) {
    logger.warn('Failed to record lastLoginAt', { userId, error });
  }
}

/**
 * Compare le mot de passe saisi au hash du compte.
 *
 * Jusqu'au 2026-10-19, `sanitizeBody` retirait des mots de passe `<`, `>`, les
 * espaces de bord, `javascript:` et les motifs `onxxx=` : un compte inscrit ou
 * réinitialisé avant cette date a un hash calculé sur cette forme altérée.
 * Quand la saisie brute ne correspond pas et que sa forme altérée diffère, on
 * compare donc aussi cette dernière — exactement ce que faisait la connexion
 * jusqu'ici, rien de plus permissif. Sans compte (ou sans mot de passe), le
 * même nombre de comparaisons est fait sur un hash factice pour que le temps
 * de réponse ne dise rien de l'existence du compte.
 */
async function verifyLoginPassword(password: string, passwordHash: string | null): Promise<boolean> {
  const legacy = legacySanitizedPassword(password);
  const hasLegacyForm = legacy !== password && legacy.length > 0;

  if (!passwordHash) {
    await comparePassword(password, DUMMY_PASSWORD_HASH);
    if (hasLegacyForm) await comparePassword(legacy, DUMMY_PASSWORD_HASH);
    return false;
  }
  if (await comparePassword(password, passwordHash)) {
    return true;
  }
  return hasLegacyForm ? comparePassword(legacy, passwordHash) : false;
}

export async function loginUser(data: LoginRequest) {
  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email: data.email }
  });

  // Le mot de passe est vérifié AVANT de révéler quoi que ce soit de l'état du compte : e-mail
  // inconnu, compte OAuth sans mot de passe, mot de passe faux répondent pareil, et un `comparePassword`
  // factice égalise le temps de réponse quand il n'y a rien à comparer.
  const isPasswordValid = await verifyLoginPassword(data.password, user?.passwordHash ?? null);

  if (!user || !isPasswordValid) {
    if (user) {
      logger.warn('Failed login attempt', { userId: user.id });
      void logAuthEvent({
        actorUserId: user.id,
        actorLabel: user.email,
        actionKey: AuditActionKey.AUTH_LOGIN_FAILED,
        entityType: AUTH_ENTITY,
        entityId: user.id,
        outcome: 'FAILURE',
        payload: { reason: 'invalid_password' }
      });
    }
    throw new Error(INVALID_CREDENTIALS_MESSAGE);
  }

  // Mot de passe valide : l'état du compte peut maintenant être dit à son titulaire.
  // Check if account is active
  if (!user.isActive) {
    throw new Error("Votre compte a été désactivé. Contactez l'administrateur.");
  }

  // Check if email is verified
  if (!user.emailVerified) {
    if (isEmailDeliveryConfigured()) {
      try {
        await resendVerificationEmail(user.email);
        logger.info('Verification email auto-resent on login attempt', { userId: user.id });
      } catch (error) {
        logger.error('Failed to resend verification email on login', { userId: user.id, error });
      }
      throw new Error('Veuillez vérifier votre adresse email. Un nouveau lien de vérification a été envoyé.');
    }
    if (isProduction) {
      // Production sans serveur d'e-mails : aucune vérification automatique.
      logger.warn('Login refused: email not verified and mailer is not configured', { userId: user.id });
      throw new Error(
        "Votre adresse email n'est pas vérifiée et le service d'e-mails est momentanément indisponible. Réessayez plus tard."
      );
    }
    // Hors production sans serveur d'e-mails (développement, tests) : le lien ne
    // peut jamais arriver, on marque l'adresse vérifiée pour ne pas bloquer le compte.
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true }
    });
    logger.warn('Email verification skipped at login: mailer is not configured', {
      userId: user.id
    });
  }

  // Generate tokens
  const refreshTokenValue = generateRefreshToken();
  const refreshTokenHash = crypto.createHash('sha256').update(refreshTokenValue).digest('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

  // Create refresh token and update user in transaction
  await prisma.$transaction(async tx => {
    // Create refresh token
    await tx.refreshToken.create({
      data: {
        token: refreshTokenHash,
        userId: user.id,
        expiresAt: expiresAt,
        deviceInfo: 'Web Browser' // Could be enhanced with user-agent
      }
    });
  });

  await recordLastLogin(user.id);

  // Generate access token
  const accessToken = generateAccessToken({
    userId: user.id,
    email: user.email,
    globalRole: user.globalRole
  });

  logger.info('User logged in', { userId: user.id, role: user.globalRole });
  void logAuthEvent({
    actorUserId: user.id,
    actorLabel: user.email,
    actionKey: AuditActionKey.AUTH_LOGIN_SUCCEEDED,
    entityType: AUTH_ENTITY,
    entityId: user.id,
    payload: { method: 'password' }
  });

  // Return user (without password) and tokens
  const { passwordHash: removedPasswordHash, ...userPublic } = user;
  void removedPasswordHash;
  return {
    user: userPublic,
    accessToken,
    refreshToken: refreshTokenValue
  };
}

/**
 * Ouvre la session d'un compte authentifié par Google (callback OAuth) :
 * jeton de rafraîchissement haché en base, dernière connexion, trace
 * `AUTH_GOOGLE_LOGIN`. Le compte a déjà été contrôlé par `resolveGoogleUser`
 * (`config/passport.ts` : actif, adresse vérifiée par Google).
 */
export async function issueGoogleSession(
  user: { id: string; email: string; globalRole: GlobalRole },
  deviceInfo?: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const refreshToken = generateRefreshToken();
  const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.refreshToken.create({
    data: {
      token: refreshTokenHash,
      userId: user.id,
      expiresAt,
      deviceInfo: deviceInfo || 'Google Login'
    }
  });

  await recordLastLogin(user.id);

  const accessToken = generateAccessToken({
    userId: user.id,
    email: user.email,
    globalRole: user.globalRole
  });

  logger.info('User logged in with Google', { userId: user.id, role: user.globalRole });
  void logAuthEvent({
    actorUserId: user.id,
    actorLabel: user.email,
    actionKey: AuditActionKey.AUTH_GOOGLE_LOGIN,
    entityType: AUTH_ENTITY,
    entityId: user.id,
    payload: { method: 'google' }
  });

  return { accessToken, refreshToken };
}

/**
 * Refresh access token using refresh token.
 *
 * The refresh token is rotated on every use: the presented token is revoked and
 * a new one is issued. A stolen token is therefore usable at most once, and its
 * reuse after the legitimate client has refreshed is detectable (the record is
 * already revoked).
 *
 * @param refreshToken - Refresh token from cookie
 * @param deviceInfo - User-Agent of the caller, stored on the new token
 * @returns New access token and the new refresh token to set as a cookie
 */
export async function refreshAccessToken(refreshToken: string, deviceInfo?: string) {
  if (!refreshToken) {
    throw new Error('Refresh token manquant.');
  }

  // Hash the refresh token to compare with stored hash
  const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

  // Find the token record (revoked ones included, to detect reuse)
  const tokenRecord = await prisma.refreshToken.findFirst({
    where: { token: refreshTokenHash },
    include: { user: true }
  });

  if (!tokenRecord) {
    throw new Error('Refresh token invalide ou expiré. Veuillez vous reconnecter.');
  }

  // Reuse of an already-rotated token means the token leaked: revoke the whole
  // family so both the attacker and the legitimate client must re-authenticate.
  if (tokenRecord.revoked) {
    logger.warn('Refresh token reuse detected, revoking all sessions', {
      userId: tokenRecord.userId
    });
    // Événement critique : la révocation de toutes les sessions et sa trace
    // sont écrites ensemble, ou pas du tout.
    await prisma.$transaction(async tx => {
      await tx.refreshToken.updateMany({
        where: { userId: tokenRecord.userId, revoked: false },
        data: { revoked: true, revokedAt: new Date() }
      });
      await recordAuthEvent(tx, {
        actorUserId: tokenRecord.userId,
        actorLabel: tokenRecord.user.email,
        actionKey: AuditActionKey.AUTH_TOKEN_REUSE_DETECTED,
        entityType: AUTH_ENTITY,
        entityId: tokenRecord.userId,
        outcome: 'DENIED',
        payload: { revokedAllSessions: true }
      });
    });
    throw new Error('Session invalide. Veuillez vous reconnecter.');
  }

  if (tokenRecord.expiresAt <= new Date()) {
    throw new Error('Refresh token invalide ou expiré. Veuillez vous reconnecter.');
  }

  // Check if user is still active
  if (!tokenRecord.user.isActive || !tokenRecord.user.emailVerified) {
    // Revoke token
    await prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { revoked: true, revokedAt: new Date() }
    });
    throw new Error('Compte utilisateur désactivé ou non vérifié.');
  }

  // Rotate: revoke the presented token and issue a replacement atomically.
  const newRefreshToken = generateRefreshToken();
  const newRefreshTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { revoked: true, revokedAt: new Date() }
    }),
    prisma.refreshToken.create({
      data: {
        token: newRefreshTokenHash,
        userId: tokenRecord.userId,
        expiresAt,
        deviceInfo: deviceInfo || tokenRecord.deviceInfo || 'Web Browser'
      }
    })
  ]);

  // Generate new access token
  const accessToken = generateAccessToken({
    userId: tokenRecord.user.id,
    email: tokenRecord.user.email,
    globalRole: tokenRecord.user.globalRole
  });

  return { accessToken, refreshToken: newRefreshToken };
}

/** Appartenance active exposée par `/api/auth/me`, avec les droits effectifs du membre. */
export interface CurrentUserMembership {
  tenantId: string;
  tenantName: string;
  tenantSlug: string | null;
  tenantType: string;
  membershipId: string;
  /** Clés des rôles d'agence du membre dans ce tenant, triées. */
  roleKeys: string[];
  /**
   * Permissions effectives, calculées par `getUserPermissions` — le service
   * des gardes serveur (`requirePermission`). Triées, sans doublon. Un tableau
   * vide peut aussi signifier « calcul impossible » : il n'autorise jamais rien.
   */
  permissions: string[];
}

/** Plafond d'appartenances renvoyées par `/me` (au-delà : journalisé). */
const MAX_ME_MEMBERSHIPS = 50;
/** Calculs de permissions menés en parallèle (chacun fait jusqu'à deux requêtes). */
const PERMISSION_CONCURRENCY = 5;

/**
 * Appartenances ACTIVE de l'utilisateur dans une agence ni suspendue ni
 * désactivée, avec rôles et permissions effectives.
 *
 * Une requête pour les appartenances (`select`, jamais l'objet User), une pour
 * les rôles, puis `getUserPermissions` par agence (cache de 5 minutes partagé
 * avec les gardes), par lots de `PERMISSION_CONCURRENCY`. L'échec du calcul
 * pour une agence donne `permissions: []` pour elle seule, sans faire échouer
 * la réponse.
 *
 * « Agence active » suit `requireTenantAccess` (une agence PENDING est
 * accessible, une SUSPENDED non) et `suspendTenant`, qui pose aussi
 * `isActive: false`.
 */
export async function getActiveMembershipsWithPermissions(userId: string): Promise<CurrentUserMembership[]> {
  const memberships = await prisma.membership.findMany({
    where: {
      userId,
      status: MembershipStatus.ACTIVE,
      tenant: { isActive: true, status: { not: TenantStatus.SUSPENDED } }
    },
    select: {
      id: true,
      tenantId: true,
      tenant: { select: { name: true, slug: true, type: true } }
    },
    orderBy: { createdAt: 'asc' },
    take: MAX_ME_MEMBERSHIPS + 1
  });

  if (memberships.length > MAX_ME_MEMBERSHIPS) {
    logger.warn('/auth/me : appartenances tronquées au plafond', { userId, max: MAX_ME_MEMBERSHIPS });
    memberships.length = MAX_ME_MEMBERSHIPS;
  }
  if (memberships.length === 0) {
    return [];
  }

  const tenantIds = memberships.map(m => m.tenantId);
  const userRoles = await prisma.userRole.findMany({
    where: { userId, tenantId: { in: tenantIds } },
    select: { tenantId: true, role: { select: { key: true, scope: true } } }
  });
  const roleKeysByTenant = new Map<string, Set<string>>();
  for (const userRole of userRoles) {
    // Même règle que `getUserPermissions` : un rôle de plateforme ne vaut rien dans une agence.
    if (!userRole.tenantId || userRole.role.scope !== 'TENANT') continue;
    const keys = roleKeysByTenant.get(userRole.tenantId) ?? new Set<string>();
    keys.add(userRole.role.key);
    roleKeysByTenant.set(userRole.tenantId, keys);
  }

  const permissionsByTenant = new Map<string, string[]>();
  for (let i = 0; i < tenantIds.length; i += PERMISSION_CONCURRENCY) {
    const batch = tenantIds.slice(i, i + PERMISSION_CONCURRENCY);
    await Promise.all(
      batch.map(async tenantId => {
        try {
          // Copie avant tri : le tableau renvoyé est celui du cache partagé.
          const permissions = await getUserPermissions(userId, tenantId);
          permissionsByTenant.set(tenantId, [...new Set(permissions)].sort());
        } catch (error) {
          logger.warn('/auth/me : permissions indisponibles pour une agence, renvoyées vides', {
            userId,
            tenantId,
            error: error instanceof Error ? error.message : String(error)
          });
          permissionsByTenant.set(tenantId, []);
        }
      })
    );
  }

  return memberships.map(m => ({
    tenantId: m.tenantId,
    tenantName: m.tenant.name,
    tenantSlug: m.tenant.slug ?? null,
    tenantType: String(m.tenant.type),
    membershipId: m.id,
    roleKeys: [...(roleKeysByTenant.get(m.tenantId) ?? [])].sort(),
    permissions: permissionsByTenant.get(m.tenantId) ?? []
  }));
}

/**
 * Get current user from token
 * @param userId - User ID from token
 * @returns User public data (sans `passwordHash`) et ses appartenances actives
 *   avec leurs permissions effectives (`memberships`, voir `getActiveMembershipsWithPermissions`).
 */
export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) {
    throw new Error('Utilisateur introuvable.');
  }

  const { passwordHash: removedPasswordHash, ...userPublic } = user;
  void removedPasswordHash;
  const memberships = await getActiveMembershipsWithPermissions(user.id);
  return { ...userPublic, memberships };
}

/**
 * Enregistre la langue preferee d'un compte.
 *
 * Renvoie l'utilisateur public a jour, pour que l'appelant n'ait pas a rejouer
 * un `/me` derriere.
 */
export async function setPreferredLanguage(userId: string, language: Language) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { preferredLanguage: language }
  });

  const { passwordHash: removedPasswordHash, ...userPublic } = user;
  void removedPasswordHash;
  return userPublic;
}

/**
 * Logout user (revoke refresh token)
 * @param refreshToken - Refresh token to revoke
 */
export async function logoutUser(refreshToken: string) {
  if (!refreshToken) {
    return;
  }

  const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

  // Read the owner before revoking, so the audit line names who logged out.
  const tokenRecord = await prisma.refreshToken.findFirst({
    where: { token: refreshTokenHash },
    select: { userId: true }
  });

  await prisma.refreshToken.updateMany({
    where: {
      token: refreshTokenHash,
      revoked: false
    },
    data: {
      revoked: true,
      revokedAt: new Date()
    }
  });

  if (tokenRecord) {
    void logAuthEvent({
      actorUserId: tokenRecord.userId,
      actionKey: AuditActionKey.AUTH_LOGOUT,
      entityType: AUTH_ENTITY,
      entityId: tokenRecord.userId
    });
  }

  logger.info('User logged out', { tokenHash: refreshTokenHash.substring(0, 8) + '...' });
}

/**
 * Request password reset
 * @param data - Forgot password request with email
 */
export async function forgotPassword(data: ForgotPasswordRequest) {
  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email: data.email }
  });

  // Don't reveal if user exists (security best practice)
  if (!user) {
    return; // Silent success
  }

  // Invalidate all previous password reset tokens for this user
  await prisma.passwordResetToken.updateMany({
    where: {
      userId: user.id,
      used: false
    },
    data: {
      used: true
    }
  });

  // Generate new password reset token
  const resetToken = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour expiry

  // Create new token
  await prisma.passwordResetToken.create({
    data: {
      token: resetToken,
      userId: user.id,
      expiresAt: expiresAt
    }
  });

  // Send password reset email
  try {
    await emailService.sendPasswordResetEmail(user.email, resetToken, {
      userName: user.fullName ?? undefined,
      language: user.preferredLanguage
    });
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    // Don't throw - user can request again
  }
}

/**
 * Reset password with token
 * @param data - Password reset request with token and new password
 */
export async function resetPassword(data: PasswordResetRequest) {
  // Validate password strength
  const passwordValidation = validatePasswordStrength(data.newPassword);
  if (!passwordValidation.isValid) {
    throw new Error(passwordValidation.error);
  }

  // Find valid password reset token
  const resetToken = await prisma.passwordResetToken.findFirst({
    where: {
      token: data.token,
      used: false,
      expiresAt: {
        gt: new Date()
      }
    },
    // Jamais l'objet User complet : il porte `passwordHash`.
    select: { id: true, userId: true, user: { select: { id: true, email: true } } }
  });

  if (!resetToken) {
    throw new Error('Token de réinitialisation invalide ou expiré. Veuillez faire une nouvelle demande.');
  }

  // Hash new password
  const passwordHash = await hashPassword(data.newPassword);

  // Update password and mark token as used in transaction
  await prisma.$transaction(async tx => {
    // Update user password.
    // Le lien de reinitialisation a ete envoye a l'adresse du compte : en
    // l'utilisant, la personne prouve qu'elle en a le controle. On valide donc
    // l'email au passage, sinon un compte cree par l'agence (portail locataire
    // ou proprietaire) reste bloque au login par le controle emailVerified,
    // sans autre issue que de chercher un second email de verification.
    await tx.user.update({
      where: { id: resetToken.userId },
      data: {
        passwordHash: passwordHash,
        emailVerified: true
      }
    });

    // Mark token as used
    await tx.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { used: true }
    });

    // Toute session ouverte avec l'ancien mot de passe (éventuellement par la
    // personne dont on se protège en le changeant) est révoquée avec lui, comme
    // `resetMemberPassword` (services/membership-service.ts). Les jetons d'accès
    // déjà émis expirent d'eux-mêmes : aucun mécanisme de liste de révocation
    // n'existe pour eux dans le dépôt.
    await tx.refreshToken.updateMany({
      where: { userId: resetToken.userId, revoked: false },
      data: { revoked: true, revokedAt: new Date() }
    });

    // Événement critique : le nouveau mot de passe et sa trace sont écrits
    // ensemble, ou pas du tout.
    await recordAuthEvent(tx, {
      actorUserId: resetToken.userId,
      actorLabel: resetToken.user.email,
      actionKey: AuditActionKey.AUTH_PASSWORD_RESET_COMPLETED,
      entityType: AUTH_ENTITY,
      entityId: resetToken.userId
    });
  });
}
