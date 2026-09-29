/**
 * Lot 4E : anti-abus d'inscription.
 *
 * - la réponse d'inscription est identique que l'adresse existe ou non, et
 *   aucun utilisateur n'est créé pour une adresse existante ;
 * - en production sans serveur d'e-mails : inscription 503 `SIGNUP_UNAVAILABLE`
 *   et le login ne marque plus rien vérifié ; hors production : ancien
 *   comportement conservé.
 */

import express from 'express';
import request from 'supertest';

const mockPrisma = {
  user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  emailVerificationToken: { updateMany: jest.fn(), create: jest.fn() },
  refreshToken: { create: jest.fn() },
  $transaction: jest.fn()
};
const mockEmail = { sendVerificationEmail: jest.fn(), sendEmail: jest.fn() };
const mockConfigured = jest.fn();
const mockEnv = { isProduction: false };

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/email-service', () => ({
  emailService: mockEmail,
  isEmailDeliveryConfigured: () => mockConfigured()
}));
jest.mock('../../src/config/env', () => ({
  get isProduction() {
    return mockEnv.isProduction;
  },
  frontendUrl: 'http://localhost:3000',
  env: { JWT_SECRET: 'test-jwt-secret-for-testing-only' }
}));
jest.mock('../../src/utils/password-utils', () => ({
  hashPassword: jest.fn(async () => 'hash'),
  comparePassword: jest.fn(async () => true),
  validatePasswordStrength: (p: string) => (p.length >= 8 ? { isValid: true } : { isValid: false, error: 'Trop court' })
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));
jest.mock('../../src/utils/jwt-utils', () => ({
  generateAccessToken: () => 'access',
  generateRefreshToken: () => 'refresh'
}));

import { register } from '../../src/controllers/auth-controller';
import { loginUser, resendVerificationEmail } from '../../src/services/auth-service';
import { asyncHandler, errorHandler } from '../../src/middleware/error-middleware';

function app() {
  const a = express();
  a.use(express.json());
  a.post('/register', asyncHandler(register));
  a.use(errorHandler);
  return a;
}

const BODY = { email: 'x@example.com', password: 'Abcdef1!', fullName: 'X Y' };

beforeEach(() => {
  jest.clearAllMocks();
  mockEnv.isProduction = false;
  mockConfigured.mockReturnValue(true);
  mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma));
  mockPrisma.user.create.mockResolvedValue({ id: 'u-new' });
  mockEmail.sendVerificationEmail.mockResolvedValue(undefined);
  mockEmail.sendEmail.mockResolvedValue(undefined);
});

describe('POST register : réponse non révélatrice', () => {
  it('renvoie exactement la même réponse pour une adresse inconnue, connue non vérifiée et connue vérifiée', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    const inconnue = await request(app()).post('/register').send(BODY);

    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'u1', email: BODY.email, emailVerified: false });
    const nonVerifiee = await request(app()).post('/register').send(BODY);

    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'u2', email: BODY.email, emailVerified: true });
    const verifiee = await request(app()).post('/register').send(BODY);

    expect(inconnue.status).toBe(201);
    expect(inconnue.body).toEqual({
      success: true,
      message: 'Si cette adresse est valide, un e-mail de vérification vient de vous être envoyé.'
    });
    expect(nonVerifiee.status).toBe(inconnue.status);
    expect(nonVerifiee.body).toEqual(inconnue.body);
    expect(verifiee.status).toBe(inconnue.status);
    expect(verifiee.body).toEqual(inconnue.body);
  });

  it('ne crée aucun utilisateur pour une adresse existante et calcule quand même le hash', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { hashPassword } = require('../../src/utils/password-utils');
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u2', email: BODY.email, emailVerified: true });
    await request(app()).post('/register').send(BODY);
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(hashPassword).toHaveBeenCalledTimes(1);
  });

  it('adresse existante non vérifiée : nouveau lien de vérification, sans nouvel utilisateur', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: BODY.email, emailVerified: false });
    await request(app()).post('/register').send(BODY);
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(mockPrisma.emailVerificationToken.updateMany).toHaveBeenCalled();
    expect(mockEmail.sendVerificationEmail).toHaveBeenCalledWith(BODY.email, expect.any(String));
  });

  it('adresse existante vérifiée : e-mail « Vous avez déjà un compte », aucun lien de vérification', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u2', email: BODY.email, emailVerified: true });
    await request(app()).post('/register').send(BODY);
    expect(mockEmail.sendVerificationEmail).not.toHaveBeenCalled();
    expect(mockEmail.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: BODY.email, subject: 'Vous avez déjà un compte' })
    );
  });

  it('adresse inconnue : crée le compte et envoie le lien', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    await request(app()).post('/register').send(BODY);
    expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
    expect(mockEmail.sendVerificationEmail).toHaveBeenCalledWith(BODY.email, expect.any(String));
  });

  it('inscription concurrente (P2002) : même réponse 201', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    const res = await request(app()).post('/register').send(BODY);
    expect(res.status).toBe(201);
    expect(mockEmail.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('mot de passe trop faible : 400 avec le message', async () => {
    const res = await request(app())
      .post('/register')
      .send({ ...BODY, password: 'a' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Trop court');
  });
});

describe('renvoi du lien de vérification', () => {
  it('adresse déjà vérifiée : retour silencieux comme pour une adresse inconnue, aucun e-mail', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'u2', email: BODY.email, emailVerified: true });
    await expect(resendVerificationEmail(BODY.email)).resolves.toBeUndefined();
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(resendVerificationEmail('autre@example.com')).resolves.toBeUndefined();
    expect(mockEmail.sendVerificationEmail).not.toHaveBeenCalled();
  });
});

describe('vérification réelle d’e-mail', () => {
  it('production sans serveur d’e-mails : inscription 503 SIGNUP_UNAVAILABLE, rien n’est écrit', async () => {
    mockEnv.isProduction = true;
    mockConfigured.mockReturnValue(false);
    const res = await request(app()).post('/register').send(BODY);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SIGNUP_UNAVAILABLE');
    expect(res.body.message).toBe("L'inscription est momentanément indisponible.");
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it('production avec serveur d’e-mails : inscription normale', async () => {
    mockEnv.isProduction = true;
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const res = await request(app()).post('/register').send(BODY);
    expect(res.status).toBe(201);
  });

  const unverified = {
    id: 'u1',
    email: BODY.email,
    isActive: true,
    emailVerified: false,
    passwordHash: 'h',
    globalRole: 'USER'
  };

  it('hors production sans serveur d’e-mails : le login marque le compte vérifié (comportement conservé)', async () => {
    mockConfigured.mockReturnValue(false);
    mockPrisma.user.findUnique.mockResolvedValue(unverified);
    const res = await loginUser({ email: BODY.email, password: 'Abcdef1!' });
    expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { emailVerified: true } });
    expect(res.accessToken).toBe('access');
  });

  it('production sans serveur d’e-mails : le login ne marque rien vérifié et refuse', async () => {
    mockEnv.isProduction = true;
    mockConfigured.mockReturnValue(false);
    mockPrisma.user.findUnique.mockResolvedValue(unverified);
    await expect(loginUser({ email: BODY.email, password: 'Abcdef1!' })).rejects.toThrow(/pas vérifiée/);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('compte déjà vérifié : login inchangé en production sans serveur d’e-mails', async () => {
    mockEnv.isProduction = true;
    mockConfigured.mockReturnValue(false);
    mockPrisma.user.findUnique.mockResolvedValue({ ...unverified, emailVerified: true });
    const res = await loginUser({ email: BODY.email, password: 'Abcdef1!' });
    expect(res.accessToken).toBe('access');
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});
