import rateLimit from 'express-rate-limit';

/**
 * Rate limiter for registration endpoint
 * 3 attempts per hour per IP
 */
export const registrationRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 requests per window
  message: {
    success: false,
    message: "Trop de tentatives d'inscription. Veuillez réessayer dans une heure."
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Rate limiter for login endpoint
 * 5 attempts per 15 minutes per IP
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: {
    success: false,
    message: 'Trop de tentatives de connexion. Veuillez réessayer dans 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Rate limiter for forgot password endpoint
 * 3 attempts per hour per IP
 */
export const forgotPasswordRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 requests per window
  message: {
    success: false,
    message: 'Trop de tentatives. Veuillez réessayer dans une heure.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Rate limiter for resend verification endpoint
 * 3 attempts per hour per IP
 */
export const resendVerificationRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 requests per window
  message: {
    success: false,
    message: 'Trop de tentatives. Veuillez réessayer dans une heure.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Rate limiter for token refresh
 * Generous enough for normal use (a 15-minute access token means ~4 refreshes
 * per hour per tab) while blocking refresh-token brute forcing.
 */
export const refreshRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  message: {
    success: false,
    message: 'Trop de tentatives de rafraîchissement. Veuillez réessayer dans quelques minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Rate limiter for password reset submission
 * The reset token is a UUID; this blocks guessing it.
 */
export const resetPasswordRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: {
    success: false,
    message: 'Trop de tentatives de réinitialisation. Veuillez réessayer dans une heure.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Rate limiter for invitation acceptance (public endpoint carrying a token)
 */
export const invitationAcceptRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: {
    success: false,
    message: 'Trop de tentatives. Veuillez réessayer dans une heure.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Rate limiter for the public WhatsApp webhook.
 * Sized for provider traffic, not for a flood.
 */
export const webhookRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  message: {
    success: false,
    message: 'Trop de requêtes.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Baseline limiter applied to the whole API.
 * Sized well above normal single-user traffic; the per-endpoint limiters above
 * remain the tight ones on sensitive routes.
 */
export const globalApiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  message: {
    success: false,
    message: 'Trop de requêtes. Veuillez réessayer dans quelques minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Health checks and static uploads must not consume the budget.
  skip: req => req.path === '/health' || req.path.startsWith('/uploads/')
});
