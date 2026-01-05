import { GlobalRole } from '@prisma/client';
import crypto from 'crypto';
import { hashPassword, validatePasswordStrength, comparePassword } from '../utils/password-utils';
import { emailService } from './email-service';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt-utils';
import { RegisterRequest, LoginRequest, PasswordResetRequest, ForgotPasswordRequest } from '../types/auth-types';
import { logger } from '../utils/logger';
import { prisma } from '../utils/database';

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
    await emailService.sendVerificationEmail(data.email, verificationToken);
    logger.info('Email verification sent', { userId: result.id, email: data.email });
  } catch (error) {
    logger.error('Failed to send verification email', { userId: result.id, email: data.email, error });
    // Continue even if email fails - user can request resend
  }

  // Return user without password hash
  const { passwordHash: _, ...userPublic } = result;
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

  const { passwordHash, ...userPublic } = verificationToken.user;
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
    throw new Error('Cette adresse email est déjà vérifiée.');
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

  if (!user) {
    throw new Error('Email ou mot de passe incorrect.');
  }

  // Check if account is active
  if (!user.isActive) {
    throw new Error("Votre compte a été désactivé. Contactez l'administrateur.");
  }

  // Check if email is verified
  if (!user.emailVerified) {
    // Resend verification email automatically
    try {
      await resendVerificationEmail(user.email);
      logger.info('Verification email auto-resent on login attempt', { userId: user.id, email: user.email });
    } catch (error) {
      logger.error('Failed to resend verification email on login', { userId: user.id, email: user.email, error });
    }
    throw new Error('Veuillez vérifier votre adresse email. Un nouveau lien de vérification a été envoyé.');
  }

  // Verify password
  // Note: user.passwordHash can be null for OAuth users
  if (!user.passwordHash) {
    throw new Error('Veuillez vous connecter avec votre compte Google.');
  }

  const isPasswordValid = await comparePassword(data.password, user.passwordHash);

  if (!isPasswordValid) {
    logger.warn('Failed login attempt', { userId: user.id, email: user.email });
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

    // We can update last login here if we add that field back or keep track elsewhere
  });

  // Generate access token
  const accessToken = generateAccessToken({
    userId: user.id,
    email: user.email,
    globalRole: user.globalRole
  });

  logger.info('User logged in', { userId: user.id, email: user.email, role: user.globalRole });

  // Return user (without password) and tokens
  const { passwordHash, ...userPublic } = user;
  return {
    user: userPublic,
    accessToken,
    refreshToken: refreshTokenValue
  };
}

/**
 * Refresh access token using refresh token
 * @param refreshToken - Refresh token from cookie
 * @returns New access token
 */
export async function refreshAccessToken(refreshToken: string) {
  if (!refreshToken) {
    throw new Error('Refresh token manquant.');
  }

  // Hash the refresh token to compare with stored hash
  const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

  // Find valid refresh token
  const tokenRecord = await prisma.refreshToken.findFirst({
    where: {
      token: refreshTokenHash,
      revoked: false,
      expiresAt: {
        gt: new Date()
      }
    },
    include: {
      user: true
    }
  });

  if (!tokenRecord) {
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

  // Generate new access token
  const accessToken = generateAccessToken({
    userId: tokenRecord.user.id,
    email: tokenRecord.user.email,
    globalRole: tokenRecord.user.globalRole
  });

  return { accessToken };
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

  const { passwordHash, ...userPublic } = user;
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
    // Update user password
    await tx.user.update({
      where: { id: resetToken.userId },
      data: {
        passwordHash: passwordHash
      }
    });

    // Mark token as used
    await tx.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { used: true }
    });
  });
}
