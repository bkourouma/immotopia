import { GlobalRole } from '@prisma/client';
import crypto from 'crypto';
import { hashPassword, validatePasswordStrength, comparePassword } from '../utils/password-utils';
import { emailService, isEmailDeliveryConfigured } from './email-service';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt-utils';
import { RegisterRequest, LoginRequest, PasswordResetRequest, ForgotPasswordRequest } from '../types/auth-types';
import { logger } from '../utils/logger';
import { prisma } from '../utils/database';
import { logAuthEvent, recordAuthEvent } from './audit-auth-events';
import { AuditActionKey } from '../types/audit-types';
import type { Language } from '../i18n';

/** Entity type used for every authentication event. */
const AUTH_ENTITY = 'User';

/**
 * Register a new user
 * @param data - Registration data
 * @returns Created user (without password hash)
 */
export async function registerUser(data: RegisterRequest) {
  // Validate password strength
  const passwordValidation = validatePasswordStrength(data.password);
  if (!passwordValidation.isValid) {
    throw new Error(passwordValidation.error);
  }

  // Check if email already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email }
  });

  if (existingUser) {
    throw new Error('Cette adresse email est déjà utilisée.');
  }

  // Hash password
  const passwordHash = await hashPassword(data.password);

  // Generate email verification token (UUID v4)
  const verificationToken = crypto.randomUUID();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours expiry

  // Create user and verification token in transaction
  const result = await prisma.$transaction(async tx => {
    // Create user
    const user = await tx.user.create({
      data: {
        email: data.email,
        passwordHash: passwordHash,
        fullName: data.fullName,
        globalRole: GlobalRole.USER, // Default role
        emailVerified: false,
        isActive: true
      }
    });

    // Create email verification token
    await tx.emailVerificationToken.create({
      data: {
        token: verificationToken,
        userId: user.id,
        expiresAt: expiresAt
      }
    });

    return user;
  });

  // Send verification email (don't fail registration if email fails)
  try {
    await emailService.sendVerificationEmail(data.email, verificationToken, {
      userName: data.fullName,
      language: result.preferredLanguage
    });
    logger.info('Email verification sent', { userId: result.id, email: data.email });
  } catch (error) {
    logger.error('Failed to send verification email', { userId: result.id, email: data.email, error });
    // Continue even if email fails - user can request resend
  }

  // Return user without password hash
  const { passwordHash: removedPasswordHash, ...userPublic } = result;
  void removedPasswordHash;
  return userPublic;
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

export async function loginUser(data: LoginRequest) {
  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email: data.email }
  });

  if (!user) {
    throw new Error('Email ou mot de passe incorrect.');
  }

  // Check if account is active
  if (!user.isActive) {
    throw new Error("Votre compte a été désactivé. Contactez l'administrateur.");
  }

  // Check if email is verified
  if (!user.emailVerified) {
    if (!isEmailDeliveryConfigured()) {
      // No mailer: the verification link can never arrive. Mark the address
      // verified so the same account is not blocked on every subsequent login.
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true }
      });
      logger.warn('Email verification skipped at login: mailer is not configured', {
        userId: user.id
      });
    } else {
      try {
        await resendVerificationEmail(user.email);
        logger.info('Verification email auto-resent on login attempt', { userId: user.id, email: user.email });
      } catch (error) {
        logger.error('Failed to resend verification email on login', { userId: user.id, email: user.email, error });
      }
      throw new Error('Veuillez vérifier votre adresse email. Un nouveau lien de vérification a été envoyé.');
    }
  }

  // Verify password
  // Note: user.passwordHash can be null for OAuth users
  if (!user.passwordHash) {
    throw new Error('Veuillez vous connecter avec votre compte Google.');
  }

  const isPasswordValid = await comparePassword(data.password, user.passwordHash);

  if (!isPasswordValid) {
    logger.warn('Failed login attempt', { userId: user.id, email: user.email });
    void logAuthEvent({
      actorUserId: user.id,
      actorLabel: user.email,
      actionKey: AuditActionKey.AUTH_LOGIN_FAILED,
      entityType: AUTH_ENTITY,
      entityId: user.id,
      outcome: 'FAILURE',
      payload: { reason: 'invalid_password' }
    });
    throw new Error('Email ou mot de passe incorrect.');
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

  logger.info('User logged in', { userId: user.id, email: user.email, role: user.globalRole });
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
