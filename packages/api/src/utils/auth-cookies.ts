import { CookieOptions, Response } from 'express';
import { isProduction } from '../config/env';

/**
 * Single source of truth for auth cookie options.
 *
 * Previously duplicated across auth-controller, auth-routes (Google callback)
 * and logout, which let the three drift apart.
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

export function setRefreshTokenCookie(res: Response, token: string): void {
  res.cookie('refreshToken', token, { ...baseCookieOptions, maxAge: REFRESH_TOKEN_MAX_AGE_MS });
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  setAccessTokenCookie(res, accessToken);
  setRefreshTokenCookie(res, refreshToken);
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: '/' });
}
