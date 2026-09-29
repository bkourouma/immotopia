import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { t } from '../i18n';
import { assertSignupAllowed } from '../services/signup-guard-service';

/**
 * Limiteur d'inscription : 3 par heure et par IP (fenêtre glissante).
 * L'état est en base (`services/signup-guard-service.ts`), donc il survit au
 * redémarrage et se partage entre instances, contrairement aux autres
 * limiteurs de ce fichier (magasin en mémoire de processus). Refus : 429,
 * code `SIGNUP_RATE_LIMITED`.
 */
export function registrationRateLimiter(req: Request, _res: Response, next: NextFunction): void {
  assertSignupAllowed(req.ip).then(() => next(), next);
}

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
 * Portail copropriétaire : routes qui produisent ou servent un PDF
 * (`/quittances/:receiptId/fichier`, `/lots/:lotId/releve`). 30 par minute
 * et par utilisateur — posé APRÈS `authenticate` et la garde du portail,
 * donc `req.user` est connu ; l'adresse IP ne sert que de repli.
 */
export const coOwnerPortalPdfRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  keyGenerator: req => `coowner-pdf:${req.user?.userId ?? req.ip ?? 'anonyme'}`,
  message: {
    success: false,
    message: 'Trop de requêtes. Veuillez réessayer dans quelques minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false
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

/**
 * Clé d'un limiteur « par utilisateur et par agence » (routes authentifiées,
 * après `authenticate` et `requireTenantAccess`) : un collaborateur de deux
 * agences a un budget dans chacune, et deux collaborateurs derrière la même
 * IP ne se partagent pas le leur.
 */
function userTenantKey(req: Request): string {
  const tenantId = req.tenantContext?.tenantId || 'aucune-agence';
  return `${req.user?.userId ?? 'anonyme'}:${tenantId}`;
}

/** Lot S3 : impression groupée des quittances, coûteuse (PDF de centaines de pages). 5 par minute. */
export const receiptPrintRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: userTenantKey,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: "Trop d'impressions de quittances en peu de temps. Réessayez dans une minute."
  },
  standardHeaders: true,
  legacyHeaders: false
});

/** Lot S3 : renvoi par e-mail d'un reçu ou d'une quittance. 30 par heure. */
export const receiptResendRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  keyGenerator: userTenantKey,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: "Trop de renvois d'e-mails en peu de temps. Réessayez plus tard."
  },
  standardHeaders: true,
  legacyHeaders: false
});

/** Lot S4 : exécution manuelle d'une programmation d'appels de charges (relit et réécrit les répartitions budgétaires). 10 par minute. */
export const chargeScheduleExecuteRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: userTenantKey,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: "Trop d'exécutions de programmations en peu de temps. Réessayez dans une minute."
  },
  standardHeaders: true,
  legacyHeaders: false
});

/** Lot S4 : avis d'appel de charges PDF côté gestion (génère un PDF à chaque appel). 30 par minute. */
export const chargeCallNoticeRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: userTenantKey,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: "Trop de téléchargements d'avis d'appel en peu de temps. Réessayez dans une minute."
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Patrimoine : projection, simulation et exécution d'un scénario. Un appel
 * recharge le patrimoine de l'agence et calcule jusqu'à 30 ans de trajectoires,
 * bien plus coûteux qu'une lecture. 30 par minute, par utilisateur ET par
 * agence (posé après `authenticate` et `requireTenantAccess`, avant les gardes
 * lourdes). Compteurs en mémoire, purgés à chaque fenêtre.
 */
export const patrimoineProjectionRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: userTenantKey,
  message: {
    success: false,
    code: 'RATE_LIMITED',
    message: 'Trop de calculs de projection en peu de temps. Réessayez dans une minute.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * ImmoCopilot : chaque tour de chat appelle un fournisseur LLM payant.
 * 20 par minute et, en plus, 300 par jour, par utilisateur ET par agence
 * (posés après `authenticate` et `requireTenantAccess`). Compteurs en mémoire
 * PAR instance d'API : avec N instances, le plafond effectif est N × la valeur
 * configurée.
 */
export const aiChatRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: userTenantKey,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      code: 'RATE_LIMITED',
      message: t("Trop de messages envoyés à l'assistant. Réessayez dans une minute.")
    });
  },
  standardHeaders: true,
  legacyHeaders: false
});

export const aiChatDailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 300,
  keyGenerator: userTenantKey,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      code: 'RATE_LIMITED',
      message: t("Limite quotidienne de l'assistant atteinte. Réessayez demain.")
    });
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * ImmoCopilot : plafond PAR AGENCE, en complément des limites par utilisateur
 * (sinon une agence de N collaborateurs consommerait N × 300 appels par jour).
 * Clé = agence seule ; plafonds `AI_TENANT_MINUTE_LIMIT` et
 * `AI_TENANT_DAILY_LIMIT` (`config/env.ts`). Posés APRÈS les limiteurs par
 * utilisateur, pour qu'un utilisateur déjà bloqué ne consomme pas le budget
 * commun. Compteurs en mémoire PAR instance d'API : avec N instances, le plafond
 * effectif est N × la valeur configurée.
 */
function tenantKey(req: Request): string {
  return req.tenantContext?.tenantId || 'aucune-agence';
}

export const aiTenantChatRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: () => env.AI_TENANT_MINUTE_LIMIT,
  keyGenerator: tenantKey,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      code: 'RATE_LIMITED',
      message: t("Trop de messages envoyés à l'assistant par votre agence. Réessayez dans une minute.")
    });
  },
  standardHeaders: true,
  legacyHeaders: false
});

export const aiTenantDailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: () => env.AI_TENANT_DAILY_LIMIT,
  keyGenerator: tenantKey,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      code: 'RATE_LIMITED',
      message: t("Limite quotidienne de l'assistant atteinte pour votre agence. Réessayez demain.")
    });
  },
  standardHeaders: true,
  legacyHeaders: false
});

/** ImmoCopilot : confirmation d'une proposition (génère un document). 10 par minute. */
export const aiActionRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: userTenantKey,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      code: 'RATE_LIMITED',
      message: t('Trop de confirmations en peu de temps. Réessayez dans une minute.')
    });
  },
  standardHeaders: true,
  legacyHeaders: false
});
