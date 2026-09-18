import { Router, Request, Response, NextFunction } from 'express';
import passport from 'passport';
import crypto from 'crypto';
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
  forgotPasswordRateLimiter,
  refreshRateLimiter,
  resetPasswordRateLimiter,
  invitationAcceptRateLimiter
} from '../middleware/rate-limit-middleware';
import { authenticate } from '../middleware/auth-middleware';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt-utils';
import { prisma } from '../utils/database';
import { setAuthCookies } from '../utils/auth-cookies';
import { frontendUrl, isProduction } from '../config/env';
import { isGoogleOAuthEnabled } from '../config/passport';
import { logger } from '../utils/logger';

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
router.post('/refresh', refreshRateLimiter, refresh);
router.post('/logout', logout);

// Password Management
router.post('/forgot-password', forgotPasswordRateLimiter, validate(forgotPasswordSchema), forgotPasswordHandler);
router.post('/reset-password', resetPasswordRateLimiter, validate(resetPasswordSchema), resetPasswordHandler);

// Invitation Acceptance (public route)
router.post('/invitations/accept', invitationAcceptRateLimiter, acceptInvitationHandler);

// User Info
router.get('/me', authenticate, getMe);

/**
 * Google OAuth
 *
 * The `state` parameter defends against login CSRF (an attacker completing the
 * flow with their own Google account so the victim ends up signed in as them).
 * We generate a random value, keep it in a short-lived httpOnly cookie, hand it
 * to Google, and require the two to match on the callback. This avoids adding a
 * server-side session store just for the OAuth handshake.
 */
const OAUTH_STATE_COOKIE = 'oauthState';
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

function oauthFailureRedirect(res: Response, reason: string): void {
  res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(reason)}`);
}

/**
 * Quels fournisseurs externes ce serveur sait-il réellement honorer ?
 *
 * Publique et sans authentification : l'écran de connexion l'interroge avant
 * d'afficher ses boutons. Ne renvoie que des booléens, jamais un identifiant
 * client ni quoi que ce soit de sensible.
 */
router.get('/providers', (_req: Request, res: Response) => {
  res.json({ success: true, data: { google: isGoogleOAuthEnabled() } });
});

/**
 * Refuse proprement quand la stratégie Google n'a pas été enregistrée.
 *
 * Sans ce garde-fou, `passport.authenticate('google')` levait
 * `Unknown authentication strategy "google"`, que le gestionnaire d'erreurs
 * transformait en 500 `INTERNAL` — un message qui ne dit pas que le serveur
 * n'a tout simplement pas d'identifiants Google.
 */
function requireGoogleOAuth(req: Request, res: Response, next: NextFunction): void {
  if (isGoogleOAuthEnabled()) {
    next();
    return;
  }

  logger.warn('Tentative de connexion Google alors que le fournisseur est non configuré', {
    path: req.path
  });

  // Le clic vient du navigateur : un JSON 503 en pleine page est illisible.
  oauthFailureRedirect(res, 'google_unavailable');
}

router.get('/google', requireGoogleOAuth, (req: Request, res: Response, next: NextFunction) => {
  const state = crypto.randomBytes(32).toString('hex');

  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: OAUTH_STATE_MAX_AGE_MS,
    path: '/api/auth'
  });

  passport.authenticate('google', { scope: ['profile', 'email'], state })(req, res, next);
});

/** Verify the state returned by Google against the cookie, in constant time. */
function verifyOAuthState(req: Request, res: Response, next: NextFunction): void {
  const expected = req.cookies?.[OAUTH_STATE_COOKIE];
  const received = typeof req.query.state === 'string' ? req.query.state : '';

  // Single use, whatever the outcome.
  res.clearCookie(OAUTH_STATE_COOKIE, { path: '/api/auth' });

  const expectedBuf = Buffer.from(String(expected || ''));
  const receivedBuf = Buffer.from(received);

  if (!expected || expectedBuf.length !== receivedBuf.length || !crypto.timingSafeEqual(expectedBuf, receivedBuf)) {
    logger.warn('Google OAuth state mismatch', { hasCookie: Boolean(expected) });
    oauthFailureRedirect(res, 'invalid_state');
    return;
  }

  next();
}

router.get(
  '/google/callback',
  requireGoogleOAuth,
  verifyOAuthState,
  (req: Request, res: Response, next: NextFunction) => {
    passport.authenticate('google', { session: false }, (err: Error | null, user: any) => {
      if (err || !user) {
        logger.warn('Google OAuth authentication failed', { error: err?.message });
        oauthFailureRedirect(res, 'auth_failed');
        return;
      }
      req.user = user;
      next();
    })(req, res, next);
  },
  async (req: Request, res: Response) => {
    try {
      const user = req.user as any;

      const accessToken = generateAccessToken({
        userId: user.id,
        email: user.email,
        globalRole: user.globalRole
      });

      const refreshToken = generateRefreshToken();
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

      setAuthCookies(res, accessToken, refreshToken);

      res.redirect(`${frontendUrl}/auth/callback?success=true`);
    } catch (error) {
      logger.error('Google callback error', { error });
      oauthFailureRedirect(res, 'auth_failed');
    }
  }
);

export default router;
