/**
 * Contrôleur d'authentification (audit 2026-11-09, AUTH-03) : plus de
 * `error.message` brut. Un refus métier (BadRequestError) reste un 400 au même
 * texte ; une panne imprévue devient un 500 générique sans texte interne.
 */
const verifyEmail = jest.fn();
const loginUser = jest.fn();
const resetPassword = jest.fn();

jest.mock('../../src/services/auth-service', () => ({
  registerUser: jest.fn(),
  REGISTRATION_ACCEPTED_MESSAGE: 'ok',
  verifyEmail: (...a: unknown[]) => verifyEmail(...a),
  resendVerificationEmail: jest.fn(),
  loginUser: (...a: unknown[]) => loginUser(...a),
  refreshAccessToken: jest.fn(),
  getCurrentUser: jest.fn(),
  logoutUser: jest.fn(),
  forgotPassword: jest.fn(),
  resetPassword: (...a: unknown[]) => resetPassword(...a),
  setPreferredLanguage: jest.fn(),
  issueGoogleSession: jest.fn()
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() }
}));

import express from 'express';
import request from 'supertest';
import { asyncHandler, errorHandler, BadRequestError } from '../../src/middleware/error-middleware';
import { login, verifyEmailHandler, resetPasswordHandler } from '../../src/controllers/auth-controller';

const app = express();
app.use(express.json());
app.post('/login', asyncHandler(login));
app.get('/verify-email', asyncHandler(verifyEmailHandler));
app.post('/reset-password', asyncHandler(resetPasswordHandler));
app.use(errorHandler);

const LEAK = 'secret interne : connexion postgres://u:p@db';

beforeEach(() => jest.clearAllMocks());

describe('POST /login', () => {
  it('échec métier : 400 avec le même message (le limiteur compte les >= 400)', async () => {
    loginUser.mockRejectedValue(new BadRequestError('Email ou mot de passe incorrect.'));
    const res = await request(app).post('/login').send({ email: 'a@b.test', password: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Email ou mot de passe incorrect.');
    expect(res.body.error).toBe('Email ou mot de passe incorrect.');
  });
  it('panne imprévue : 500 générique sans le texte interne', async () => {
    loginUser.mockRejectedValue(new Error(LEAK));
    const res = await request(app).post('/login').send({ email: 'a@b.test', password: 'x' });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret interne');
  });
  it('succès inchangé : cookies posés, utilisateur renvoyé', async () => {
    loginUser.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', user: { id: 'u1' } });
    const res = await request(app).post('/login').send({ email: 'a@b.test', password: 'x' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Connexion réussie.', user: { id: 'u1' } });
    expect((res.headers['set-cookie'] as unknown as string[]).some(c => c.startsWith('accessToken=a'))).toBe(true);
  });
});

describe('GET /verify-email', () => {
  it('sans jeton : 400 « Token de vérification requis. »', async () => {
    const res = await request(app).get('/verify-email');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Token de vérification requis.');
    expect(verifyEmail).not.toHaveBeenCalled();
  });
  it('jeton refusé (métier) : 400 au même texte', async () => {
    verifyEmail.mockRejectedValue(new BadRequestError('Token de vérification invalide ou expiré.'));
    const res = await request(app).get('/verify-email?token=abc');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Token de vérification invalide ou expiré.');
  });
  it('panne imprévue : 500 sans le texte interne', async () => {
    verifyEmail.mockRejectedValue(new Error(LEAK));
    const res = await request(app).get('/verify-email?token=abc');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret interne');
  });
  it('succès inchangé', async () => {
    verifyEmail.mockResolvedValue({ id: 'u1' });
    const res = await request(app).get('/verify-email?token=abc');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Email vérifié avec succès !', user: { id: 'u1' } });
  });
});

describe('POST /reset-password', () => {
  it('échec métier : 400 au même texte', async () => {
    resetPassword.mockRejectedValue(new BadRequestError('Token de réinitialisation invalide ou expiré.'));
    const res = await request(app).post('/reset-password').send({ token: 't', password: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Token de réinitialisation invalide ou expiré.');
  });
  it('panne imprévue : 500 sans le texte interne', async () => {
    resetPassword.mockRejectedValue(new Error(LEAK));
    const res = await request(app).post('/reset-password').send({ token: 't', password: 'x' });
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('secret interne');
  });
  it('succès inchangé', async () => {
    resetPassword.mockResolvedValue(undefined);
    const res = await request(app).post('/reset-password').send({ token: 't', password: 'x' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
