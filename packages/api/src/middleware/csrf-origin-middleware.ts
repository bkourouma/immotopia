import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { t } from '../i18n';
import { logger } from '../utils/logger';
import { maskSensitivePath } from '../utils/sensitive-path';

/**
 * Garde CSRF par contrôle d'origine (audit 2026-11-09, AUTH-05 / FRI-04).
 *
 * Le cookie `accessToken` est `SameSite=Lax` : il part aussi sur les requêtes
 * « même site » (sous-domaines voisins). Le garde refuse donc une requête qui
 * MODIFIE (POST/PUT/PATCH/DELETE) quand l'authentification repose sur ce
 * cookie (cookie `accessToken` présent, avec ou sans `Authorization`) et que
 * le navigateur indique qu'elle ne vient pas de notre interface :
 *
 * 1. `Sec-Fetch-Site: cross-site` : refusée.
 * 2. `Sec-Fetch-Site: same-origin` ou `none` : autorisée (même origine, ou
 *    action de l'utilisateur lui-même). En production le front et l'API sont
 *    sur la même origine (nginx proxie /api).
 * 3. Sinon (`same-site`, ou en-tête absent) : l'origine déclarée (`Origin`, à
 *    défaut l'origine du `Referer`) doit être celle de `FRONTEND_URL`
 *    (comparaison d'origines normalisées). `Origin: null` ou un `Referer`
 *    illisible : refusée. `same-site` sans `Origin` ni `Referer` : refusée.
 *    En développement le front (3000/3002) et l'API (8001) sont `same-site` :
 *    leur `Origin` égale `FRONTEND_URL`, donc ils passent.
 * 4. Sans `Origin`, sans `Referer` et sans `Sec-Fetch-Site` (client non
 *    navigateur : scripts, supertest) : autorisée.
 *
 * Un client API sans cookie `accessToken` (`Authorization: Bearer` seul, dont
 * la passerelle IA en boucle locale) n'est pas concerné : un CSRF suppose un
 * cookie ambiant. Connexion et inscription sont contrôlées à part (CSRF de
 * connexion, voir `loginRejectionReason`).
 */

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const CSRF_REJECTED_CODE = 'CSRF_REJECTED';

/**
 * Chemins exclus du contrôle : webhooks signés et routes publiques à jeton,
 * appelés par des tiers ou par des visiteurs sans session, sans cookie
 * `accessToken` légitime. Une exclusion trop large est dangereuse : préfixes
 * précis, jamais `/api/tenants/:tenantId/newsletter` (routes connectées).
 * Chaque préfixe correspond à `chemin` ou `chemin/...` ; `exact` seulement à `chemin`.
 */
const EXEMPT_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ['/api/webhooks/whatsapp-cloud', 'webhook Meta WhatsApp Cloud (signé X-Hub-Signature-256, corps brut)'],
  ['/api/webhooks/livekit', 'webhook LiveKit (signé, corps brut)'],
  ['/api/public/signature-provider', 'webhook du prestataire de signature (Yousign), signé'],
  ['/api/public/signatures', 'signature électronique publique (jeton dans le chemin)'],
  ['/api/public/secure-links', 'liens sécurisés publics (jeton dans le corps)'],
  ['/api/public/external-access', 'accès des tiers de confiance (jeton dans le corps)'],
  ['/api/public/assemblees', 'AG en direct par lien personnel (jeton dans le corps)'],
  ['/api/payment-gateway/simulator', 'simulateur de la passerelle de paiement (public, hors production)'],
  [
    '/api/newsletter',
    'newsletter publique (subscribe, confirm, unsubscribe, track/open) ; PAS /api/tenants/:tenantId/newsletter'
  ]
];

const EXEMPT_EXACT: ReadonlyArray<readonly [string, string]> = [
  ['/api/whatsapp/webhook', 'webhook Twilio / WaSender WhatsApp (signature Twilio vérifiée)'],
  ['/api/payment-gateway/paysecurehub/ipn', 'IPN PaySecureHub (réconciliation serveur-à-serveur)'],
  ['/api/payment-gateway/paysecurehub/platform-ipn', 'IPN PaySecureHub du compte plateforme'],
  ['/api/auth/login', 'connexion (pas encore de session)'],
  ['/api/auth/register', 'inscription (pas de session)'],
  ['/api/auth/forgot-password', 'mot de passe oublié (pas de session)'],
  ['/api/auth/reset-password', 'réinitialisation par jeton (pas de session)'],
  ['/api/auth/resend-verification', "renvoi de l'e-mail de vérification (pas de session)"],
  ['/api/auth/refresh', 'rafraîchissement : authentifié par le seul cookie refreshToken, pas accessToken']
];

/**
 * Longueur maximale d'un chemin examiné par le garde. Aucune route de l'API n'en
 * approche ; au-delà, une écriture portant le cookie est refusée sans autre
 * calcul (contre-audit PR #205 : coût borné avant tout traitement du chemin).
 */
export const CSRF_MAX_PATH_LENGTH = 2048;

/** Connexion et inscription : exclues du garde (pas de session), mais protégées contre le CSRF de connexion. */
const LOGIN_CSRF_PATHS: ReadonlySet<string> = new Set(['/api/auth/login', '/api/auth/register']);

const SLASH = 0x2f;

/**
 * Chemin en minuscules sans barre(s) finale(s). Boucle linéaire : l'ancienne
 * expression `/\/+$/` était quadratique sur une longue suite de `/` (ReDoS).
 */
export function normalizeCsrfPath(path: string): string {
  let end = path.length;
  while (end > 0 && path.charCodeAt(end - 1) === SLASH) end -= 1;
  return path.slice(0, end).toLowerCase();
}

/** Vrai si le chemin n'est pas protégé par le garde (webhook, route publique, auth non connectée). */
export function isCsrfExemptPath(path: string): boolean {
  // Aucun chemin exclu n'est aussi long : pas d'exclusion, donc contrôle complet.
  if (path.length > CSRF_MAX_PATH_LENGTH) return false;
  // Express route sans tenir compte de la casse ni d'une barre finale.
  const normalized = normalizeCsrfPath(path);
  if (EXEMPT_EXACT.some(([exact]) => normalized === exact)) return true;
  return EXEMPT_PREFIXES.some(([prefix]) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

/** Origine normalisée d'une URL, ou null si illisible (ou `null` littéral). */
function originOf(value: string): string | null {
  try {
    const { origin } = new URL(value);
    return origin === 'null' ? null : origin;
  } catch {
    return null;
  }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Raison du refus, ou null si la requête est autorisée. */
function rejectionReason(req: Request): string | null {
  const site = headerValue(req.headers['sec-fetch-site'])?.toLowerCase();
  if (site === 'cross-site') return 'cross-site';
  if (site === 'same-origin' || site === 'none') return null;

  const origin = headerValue(req.headers.origin);
  const referer = headerValue(req.headers.referer);
  if (origin === undefined && !referer) {
    // Navigateur same-site qui ne dit pas d'où il vient : refusé ; client non navigateur : toléré.
    return site === 'same-site' ? 'same-site-sans-origine' : null;
  }

  const declared = originOf(origin !== undefined ? origin : (referer as string));
  if (!declared) return 'origine-illisible';
  const allowed = originOf(env.FRONTEND_URL);
  return declared === allowed ? null : 'origine-etrangere';
}

/**
 * CSRF de connexion (`/api/auth/login`, `/api/auth/register`), cookie présent ou
 * non : un site tiers ne doit pas pouvoir connecter la victime à SON compte.
 * Refus : `Sec-Fetch-Site: cross-site`, ou `Origin` présente (`null` compris)
 * différente de `FRONTEND_URL` hors `same-origin`/`none`. Un client sans
 * `Origin` ni `Sec-Fetch-Site` (scripts, supertest) passe.
 */
function loginRejectionReason(req: Request): string | null {
  const site = headerValue(req.headers['sec-fetch-site'])?.toLowerCase();
  if (site === 'cross-site') return 'connexion-cross-site';
  if (site === 'same-origin' || site === 'none') return null;
  const origin = headerValue(req.headers.origin);
  if (origin === undefined) return null;
  const declared = originOf(origin);
  return declared && declared === originOf(env.FRONTEND_URL) ? null : 'connexion-origine-etrangere';
}

function reject(req: Request, res: Response, reason: string): void {
  logger.warn('Requête refusée par le garde CSRF', {
    reason,
    method: req.method,
    path: req.path.length > CSRF_MAX_PATH_LENGTH ? '[chemin trop long]' : maskSensitivePath(req.path),
    ip: req.ip
  });
  const message = t('Requête refusée.');
  res.status(403).json({ success: false, message, error: message, code: CSRF_REJECTED_CODE });
}

/**
 * Middleware global (monté après `cookieParser`, CORS et `globalApiRateLimiter`,
 * avant tout routeur). Réponse uniforme : 403 `CSRF_REJECTED`, quel que soit le motif.
 *
 * Le garde ne s'efface que sans cookie `accessToken` : `authenticate` lit le
 * cookie AVANT l'en-tête `Authorization`, donc un `Authorization` ajouté à une
 * requête portant le cookie ne prouve rien (contre-audit PR #205).
 */
export function csrfOriginGuard(req: Request, res: Response, next: NextFunction): void {
  if (!UNSAFE_METHODS.has(req.method)) return next();
  const hasCookie = Boolean(req.cookies?.accessToken);
  if (req.path.length > CSRF_MAX_PATH_LENGTH) {
    return hasCookie ? reject(req, res, 'chemin-trop-long') : next();
  }
  if (LOGIN_CSRF_PATHS.has(normalizeCsrfPath(req.path))) {
    const loginReason = loginRejectionReason(req);
    return loginReason ? reject(req, res, loginReason) : next();
  }
  if (!hasCookie) return next();
  if (isCsrfExemptPath(req.path)) return next();

  const reason = rejectionReason(req);
  if (!reason) return next();
  reject(req, res, reason);
}
