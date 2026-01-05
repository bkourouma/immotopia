import { Router } from 'express';
import passport from 'passport';
import {
  register,
  verifyEmailHandler,
  resendVerification,
  login,
  refresh,
  getMe,
  logout,
  forgotPasswordHandler,
  resetPasswordHandler
} from '../controllers/auth-controller';
import { acceptInvitationHandler } from '../controllers/invitation-controller';
import {
  validate,
  registerSchema,
  loginSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema
} from '../middleware/validation-middleware';
import {
  registrationRateLimiter,
  resendVerificationRateLimiter,
  loginRateLimiter,
  forgotPasswordRateLimiter
} from '../middleware/rate-limit-middleware';
import { authenticate } from '../middleware/auth-middleware';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt-utils';
import { prisma } from '../utils/database';

const router = Router();

// Register and Login
router.post('/register', registrationRateLimiter, validate(registerSchema), register);
router.post('/login', loginRateLimiter, validate(loginSchema), login);

// Email Verification
router.get('/verify-email', verifyEmailHandler);
router.post(
  '/resend-verification',
  resendVerificationRateLimiter,
  validate(resendVerificationSchema),
  resendVerification
);

// Token Management
router.post('/refresh', refresh);
router.post('/logout', logout);

// Password Management
router.post('/forgot-password', forgotPasswordRateLimiter, validate(forgotPasswordSchema), forgotPasswordHandler);
router.post('/reset-password', validate(resetPasswordSchema), resetPasswordHandler);

// Invitation Acceptance (public route)
router.post('/invitations/accept', acceptInvitationHandler);

// User Info
router.get('/me', authenticate, getMe);

// Google OAuth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login' }),
  async (req, res) => {
    try {
      const user = req.user as any;

      // Generate tokens
      const accessToken = generateAccessToken({
        userId: user.id,
        email: user.email,
        globalRole: user.globalRole
      });

      const refreshToken = generateRefreshToken();

      // Save refresh token
      // Hash logic duplication here - ideally should be in auth-service helper
      // For now, implementing simply to unblock
      const crypto = require('crypto');
      const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await prisma.refreshToken.create({
        data: {
          token: refreshTokenHash,
          userId: user.id,
          expiresAt,
          deviceInfo: req.headers['user-agent'] || 'Google Login'
        }
      });

      // Set cookies
      const isProduction = process.env.NODE_ENV === 'production';
      res.cookie('accessToken', accessToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax', // Changed from 'strict' to 'lax' to allow cookies during OAuth redirects
        maxAge: 15 * 60 * 1000
      });

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax', // Changed from 'strict' to 'lax' to allow cookies during OAuth redirects
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      // Redirect to frontend
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:3001';
      res.redirect(`${clientUrl}/auth/callback?success=true`);
    } catch (error) {
      console.error('Google callback error:', error);
      res.redirect('/login?error=auth_failed');
    }
  }
);

export default router;
