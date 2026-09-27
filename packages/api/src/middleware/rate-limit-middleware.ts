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
 * 5 failed attempts per 15 minutes per IP.
 *
 * `skipSuccessfulRequests` : le contrôleur (`login` dans auth-controller.ts)
 * répond 200 sur une connexion réussie et 400 sur un échec, donc seuls les
 * échecs consomment le quota. Sans ça, une agence dont les collaborateurs
 * sortent par la même IP (ou un super-admin qui bascule entre deux comptes)
 * se fait bloquer après 5 connexions RÉUSSIES en 15 minutes — constaté en
 * recette Syndic. La protection anti-force-brute reste intacte : un
 * attaquant qui devine juste ne produit que des 400 et reste plafonné à 5
 * essais par fenêtre.
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 échecs par fenêtre
  skipSuccessfulRequests: true,
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
 *
 * Pas de `skipSuccessfulRequests` ici : le contrôleur répond toujours 200,
 * même en cas d'échec (email inconnu), pour ne pas révéler quels comptes
 * existent. Ajouter `skipSuccessfulRequests` reviendrait à ne plus jamais
 * compter aucune requête et désactiverait de fait ce limiteur.
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

/**
 * Lot S4 : avis d'appel de charges PDF du portail copropriétaire. Chaque
 * demande rend un PDF (identité, images) : 20 par minute et par compte
 * (repli sur l'adresse IP sans session), bien au-dessus d'un usage normal.
 */
export const coOwnerChargeNoticeRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: req => (req.user?.userId ? `user:${req.user.userId}` : `ip:${req.ip}`),
  message: {
    success: false,
    message: 'Trop de téléchargements. Veuillez réessayer dans une minute.'
  },
  standardHeaders: true,
  legacyHeaders: false
});
