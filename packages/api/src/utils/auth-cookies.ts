import { CookieOptions, Response } from 'express';
import { isProduction } from '../config/env';

/**
 * Single source of truth for auth cookie options.
 *
 * Previously duplicated across auth-controller, auth-routes (Google callback)
 * and logout, which let the three drift apart.
 *
 * Chemins des cookies (audit 2026-11-09, AUTH-11) :
 * - `accessToken` : path `/` (lu par toute l'API, et par /uploads).
 * - `refreshToken` : path `/api/auth`. Le navigateur ne l'envoie plus qu'à
 *   `/api/auth/refresh` et `/api/auth/logout` (les seuls lecteurs), au lieu de
 *   chaque requête. Les sessions ouvertes avant ce changement portent encore
 *   un `refreshToken` de path `/` : il est effacé à chaque pose et à chaque
 *   déconnexion (un cookie ne s'efface que sur le path où il a été posé).
 */

export const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes
export const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  // 'lax' (not 'strict') so the cookie survives the Google OAuth redirect.
  sameSite: 'lax',
  path: '/'
};

export function setAccessTokenCookie(res: Response, token: string): void {
  res.cookie('accessToken', token, { ...baseCookieOptions, maxAge: ACCESS_TOKEN_MAX_AGE_MS });
}

/** Chemin du cookie de rafraîchissement : limité aux routes d'authentification. */
export const REFRESH_TOKEN_COOKIE_PATH = '/api/auth';
/** Ancien chemin (avant AUDIT AUTH-11) : à effacer chez les navigateurs déjà connectés. */
const LEGACY_REFRESH_TOKEN_COOKIE_PATH = '/';

export function setRefreshTokenCookie(res: Response, token: string): void {
  // Sans cela, l'ancien cookie (path `/`) subsisterait à côté du nouveau.
  res.clearCookie('refreshToken', { ...baseCookieOptions, path: LEGACY_REFRESH_TOKEN_COOKIE_PATH });
  res.cookie('refreshToken', token, {
    ...baseCookieOptions,
    path: REFRESH_TOKEN_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_MAX_AGE_MS
  });
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  setAccessTokenCookie(res, accessToken);
  setRefreshTokenCookie(res, refreshToken);
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: REFRESH_TOKEN_COOKIE_PATH });
  res.clearCookie('refreshToken', { path: LEGACY_REFRESH_TOKEN_COOKIE_PATH });
}
