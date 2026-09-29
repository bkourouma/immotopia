import { GlobalRole } from '@prisma/client';
import crypto from 'crypto';
import { hashPassword, validatePasswordStrength, comparePassword } from '../utils/password-utils';
import { emailService, isEmailDeliveryConfigured } from './email-service';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt-utils';
import { RegisterRequest, LoginRequest, PasswordResetRequest, ForgotPasswordRequest } from '../types/auth-types';
import { logger } from '../utils/logger';
import { prisma } from '../utils/database';
import { frontendUrl, isProduction } from '../config/env';
import { AppError, BadRequestError } from '../middleware/error-middleware';
import { logAuditEvent } from './audit-service';
import { AuditActionKey } from '../types/audit-types';
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
    select: { id: true, email: true, emailVerified: true }
  });

  if (existingUser) {
    // Pré-détournement : un compte jamais vérifié appartient à la DERNIÈRE personne qui a prouvé
    // vouloir cette adresse. Son mot de passe et son nom remplacent ceux d'une inscription
    // antérieure (éventuellement d'un tiers), et toute session ouverte avec eux est révoquée,
    // AVANT de ré-émettre le lien de vérification. La réponse reste identique.
    if (!existingUser.emailVerified) {
      await takeOverUnverifiedAccount(existingUser.id, passwordHash, data.fullName);
    }
    await notifyExistingAccount(existingUser);
    return;
  }

  let user: { id: string };
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
      select: { id: true }
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
    emailService.sendVerificationEmail(data.email, verificationToken)
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
async function notifyExistingAccount(existing: { id: string; email: string; emailVerified: boolean }): Promise<void> {
  if (existing.emailVerified) {
    await sendQuietly(existing.id, 'existing account email', () => sendAccountAlreadyExistsEmail(existing.email));
    return;
  }
  const verificationToken = await issueVerificationToken(existing.id);
  await sendQuietly(existing.id, 'verification email', () =>
    emailService.sendVerificationEmail(existing.email, verificationToken)
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
    // Même réponse que pour une adresse inconnue : ne révèle pas le compte.
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
  await emailService.sendVerificationEmail(user.email, verificationToken);
  logger.info('Verification email resent', { userId: user.id, email: user.email });
}

/**
 * Login user
 * @param data - Login credentials
 * @returns User and tokens
 */
export async function loginUser(data: LoginRequest) {
  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email: data.email }
  });

  // Le mot de passe est vérifié AVANT de révéler quoi que ce soit de l'état du compte : e-mail
  // inconnu, compte OAuth sans mot de passe, mot de passe faux répondent pareil, et un `comparePassword`
  // factice égalise le temps de réponse quand il n'y a rien à comparer.
  const isPasswordValid = user?.passwordHash
    ? await comparePassword(data.password, user.passwordHash)
    : await comparePassword(data.password, DUMMY_PASSWORD_HASH).then(() => false);

  if (!user || !isPasswordValid) {
    if (user) {
      logger.warn('Failed login attempt', { userId: user.id });
      logAuditEvent({
        actorUserId: user.id,
        tenantId: null,
        actionKey: AuditActionKey.AUTH_LOGIN_FAILED,
        entityType: AUTH_ENTITY,
        entityId: user.id,
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

    // We can update last login here if we add that field back or keep track elsewhere
  });

  // Generate access token
  const accessToken = generateAccessToken({
    userId: user.id,
    email: user.email,
    globalRole: user.globalRole
  });

  logger.info('User logged in', { userId: user.id, role: user.globalRole });
  logAuditEvent({
    actorUserId: user.id,
    tenantId: null,
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
    logAuditEvent({
      actorUserId: tokenRecord.userId,
      tenantId: null,
      actionKey: AuditActionKey.AUTH_TOKEN_REUSE_DETECTED,
      entityType: AUTH_ENTITY,
      entityId: tokenRecord.userId,
      payload: { revokedAllSessions: true }
    });
    await prisma.refreshToken.updateMany({
      where: { userId: tokenRecord.userId, revoked: false },
      data: { revoked: true, revokedAt: new Date() }
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

/**
 * Get current user from token
 * @param userId - User ID from token
 * @returns User public data
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
  return userPublic;
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
    logAuditEvent({
      actorUserId: tokenRecord.userId,
      tenantId: null,
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
    await emailService.sendPasswordResetEmail(user.email, resetToken);
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
    include: {
      user: true
    }
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
  });

  logAuditEvent({
    actorUserId: resetToken.userId,
    tenantId: null,
    actionKey: AuditActionKey.AUTH_PASSWORD_RESET_COMPLETED,
    entityType: AUTH_ENTITY,
    entityId: resetToken.userId
  });
}
