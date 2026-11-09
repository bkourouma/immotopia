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
 * cookie (cookie `accessToken` présent, pas d'en-tête `Authorization`) et que
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
 * Un client API qui envoie `Authorization: Bearer` ou n'a pas de cookie
 * `accessToken` n'est pas concerné (un CSRF suppose un cookie ambiant).
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

/** Vrai si le chemin n'est pas protégé par le garde (webhook, route publique, auth non connectée). */
export function isCsrfExemptPath(path: string): boolean {
  // Express route sans tenir compte de la casse ni d'une barre finale.
  const normalized = path.toLowerCase().replace(/\/+$/, '');
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
 * Middleware global (monté après `cookieParser` et CORS, avant tout routeur).
 * Réponse uniforme : 403 `CSRF_REJECTED`, quel que soit le motif.
 */
export function csrfOriginGuard(req: Request, res: Response, next: NextFunction): void {
  if (!UNSAFE_METHODS.has(req.method)) return next();
  if (!req.cookies?.accessToken || req.headers.authorization) return next();
  if (isCsrfExemptPath(req.path)) return next();

  const reason = rejectionReason(req);
  if (!reason) return next();

  logger.warn('Requête refusée par le garde CSRF', {
    reason,
    method: req.method,
    path: maskSensitivePath(req.path),
    ip: req.ip
  });
  const message = t('Requête refusée.');
  res.status(403).json({ success: false, message, error: message, code: CSRF_REJECTED_CODE });
}
