/**
 * `POST /auth/refresh` et `GET /auth/me` : une panne n'est pas un refus
 * d'authentification. Seul un jeton invalide, expiré ou révoqué mène à 401 et
 * à l'effacement des cookies ; une panne de base remonte en 500 (middleware
 * d'erreurs) sans toucher aux cookies.
 */
const refreshAccessToken = jest.fn();
const getCurrentUser = jest.fn();
const clearAuthCookies = jest.fn();
const setAuthCookies = jest.fn();

jest.mock('../../src/services/auth-service', () => ({
  registerUser: jest.fn(),
  REGISTRATION_ACCEPTED_MESSAGE: 'ok',
  verifyEmail: jest.fn(),
  resendVerificationEmail: jest.fn(),
  loginUser: jest.fn(),
  refreshAccessToken: (...a: unknown[]) => refreshAccessToken(...a),
  getCurrentUser: (...a: unknown[]) => getCurrentUser(...a),
  logoutUser: jest.fn(),
  forgotPassword: jest.fn(),
  resetPassword: jest.fn(),
  setPreferredLanguage: jest.fn()
}));
jest.mock('../../src/utils/auth-cookies', () => ({
  setAuthCookies: (...a: unknown[]) => setAuthCookies(...a),
  clearAuthCookies: (...a: unknown[]) => clearAuthCookies(...a)
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() }
}));

import type { Request, Response } from 'express';
import { refresh, getMe } from '../../src/controllers/auth-controller';
import { BadRequestError, UnauthorizedError } from '../../src/middleware/error-middleware';

const makeRes = () => {
  const json = jest.fn();
  const res = { status: jest.fn().mockReturnValue({ json }) } as unknown as Response;
  return { res, json };
};
const reqRefresh = { cookies: { refreshToken: 'tok' }, headers: {} } as unknown as Request;
const panneBase = Object.assign(new Error("Can't reach database server"), { name: 'PrismaClientInitializationError' });

beforeEach(() => jest.clearAllMocks());

describe('refresh', () => {
  it.each([
    'Refresh token invalide ou expiré. Veuillez vous reconnecter.',
    'Session invalide. Veuillez vous reconnecter.',
    'Compte utilisateur désactivé ou non vérifié.'
  ])('jeton refusé (%s) : 401 et cookies effacés', async message => {
    refreshAccessToken.mockRejectedValue(new UnauthorizedError(message));
    const { res, json } = makeRes();
    await refresh(reqRefresh, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ success: false, message });
    expect(clearAuthCookies).toHaveBeenCalledTimes(1);
  });

  it('Error simple au texte identique : plus reconnue, relancée, cookies intacts', async () => {
    const simple = new Error('Session invalide. Veuillez vous reconnecter.');
    refreshAccessToken.mockRejectedValue(simple);
    const { res } = makeRes();
    await expect(refresh(reqRefresh, res)).rejects.toBe(simple);
    expect(res.status).not.toHaveBeenCalled();
    expect(clearAuthCookies).not.toHaveBeenCalled();
  });

  it('panne de base : relancée vers le middleware d’erreurs, cookies intacts', async () => {
    refreshAccessToken.mockRejectedValue(panneBase);
    const { res } = makeRes();
    await expect(refresh(reqRefresh, res)).rejects.toBe(panneBase);
    expect(res.status).not.toHaveBeenCalled();
    expect(clearAuthCookies).not.toHaveBeenCalled();
  });

  it('sans cookie : 401 sans appel au service', async () => {
    const { res } = makeRes();
    await refresh({ cookies: {}, headers: {} } as unknown as Request, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });
});

describe('getMe', () => {
  const req = { user: { userId: 'u1' } } as unknown as Request;

  it('compte introuvable : erreur typée 400 relancée au middleware', async () => {
    const introuvable = new BadRequestError('Utilisateur introuvable.');
    getCurrentUser.mockRejectedValue(introuvable);
    const { res } = makeRes();
    await expect(getMe(req, res)).rejects.toBe(introuvable);
    expect(introuvable.statusCode).toBe(400);
  });

  it('panne de base : relancée vers le middleware d’erreurs (500), pas 400', async () => {
    getCurrentUser.mockRejectedValue(panneBase);
    const { res } = makeRes();
    await expect(getMe(req, res)).rejects.toBe(panneBase);
    expect(res.status).not.toHaveBeenCalled();
  });
});
