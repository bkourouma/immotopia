/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Contre-audit PR #205 (AUTH, moyen) : un refus « compte verrouillé » (400,
 * identique à un échec ordinaire pour le client) ne doit PAS être compté par
 * `loginRateLimiter` contre l'IP du titulaire ; il a son propre plafond
 * (`loginLockedRefusalRateLimiter`, 30 / 15 min). Chaîne réelle : limiteurs,
 * contrôleur, service et verrou ; seuls Prisma, bcrypt et les jetons sont simulés.
 */
const mockPrisma: Record<string, any> = {
  user: { findUnique: jest.fn(), update: jest.fn() },
  refreshToken: { create: jest.fn() },
  $transaction: jest.fn()
};
const mockCompare = jest.fn();

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/audit-auth-events', () => ({ logAuthEvent: jest.fn(), recordAuthEvent: jest.fn() }));
jest.mock('../../src/services/email-service', () => ({ emailService: {}, isEmailDeliveryConfigured: () => true }));
jest.mock('../../src/utils/password-utils', () => ({
  hashPassword: jest.fn(),
  validatePasswordStrength: jest.fn(),
  comparePassword: (...a: unknown[]) => mockCompare(...a)
}));
jest.mock('../../src/utils/jwt-utils', () => ({
  generateAccessToken: jest.fn().mockReturnValue('access'),
  generateRefreshToken: jest.fn().mockReturnValue('refresh')
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() }
}));

import express, { Express } from 'express';
import request from 'supertest';
import { asyncHandler, errorHandler } from '../../src/middleware/error-middleware';
import {
  LOGIN_THROTTLE_GLOBAL_MAX_FAILURES,
  recordLoginFailure,
  resetLoginThrottle
} from '../../src/services/login-throttle-service';
import { LoginLockedError } from '../../src/services/auth-service';

const VICTIM_IP = '203.0.113.7';
const USER = {
  id: 'u1',
  email: 'chef@agence.test',
  isActive: true,
  emailVerified: true,
  passwordHash: 'h',
  globalRole: 'USER'
};

/** Application avec la vraie chaîne de connexion (limiteurs en mémoire partagés : une IP par test). */
function buildApp(): Express {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const limiters = require('../../src/middleware/rate-limit-middleware');
  const { login } = require('../../src/controllers/auth-controller');
  /* eslint-enable @typescript-eslint/no-var-requires */
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.post('/login', limiters.loginRateLimiter, limiters.loginLockedRefusalRateLimiter, asyncHandler(login));
  app.use(errorHandler);
  return app;
}

const attempt = (app: Express, password: string, ip = VICTIM_IP) =>
  request(app).post('/login').set('X-Forwarded-For', ip).send({ email: USER.email, password });

/** Attaque distribuée : verrou global de l'e-mail engagé depuis d'autres IP. */
function engageGlobalLock(): void {
  for (let i = 0; i < LOGIN_THROTTLE_GLOBAL_MAX_FAILURES; i++) recordLoginFailure(USER.email, `198.51.100.${i + 1}`);
}

beforeEach(() => {
  jest.clearAllMocks();
  resetLoginThrottle();
  mockPrisma.user.findUnique.mockResolvedValue(USER);
  mockPrisma.user.update.mockResolvedValue({ id: 'u1' });
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
  mockCompare.mockImplementation(async (pwd: string, hash: string) => hash === 'h' && pwd === 'bon');
});

describe('refus pendant un verrou et loginRateLimiter', () => {
  it('le titulaire qui réessaie 8 fois avec le bon mot de passe pendant le verrou n’est pas bloqué en 429', async () => {
    const app = buildApp();
    engageGlobalLock();
    for (let i = 0; i < 8; i++) {
      const res = await attempt(app, 'bon');
      expect(res.status).toBe(400);
    }
    // Les vrais échecs restent plafonnés à 5 : le compteur ordinaire est intact.
    resetLoginThrottle();
    for (let i = 0; i < 5; i++) expect((await attempt(app, 'mauvais')).status).toBe(400);
    expect((await attempt(app, 'mauvais')).status).toBe(429);
  });

  it('la réponse d’un refus pendant le verrou est identique à celle d’un échec ordinaire', async () => {
    const app = buildApp();
    const ordinary = await attempt(app, 'mauvais', '192.0.2.10');
    engageGlobalLock();
    const locked = await attempt(app, 'bon', '192.0.2.11');
    expect(locked.status).toBe(ordinary.status);
    expect(locked.body).toEqual(ordinary.body);
    expect(JSON.stringify(locked.body)).not.toContain('LOGIN_LOCKED');
  });

  it('les refus pendant un verrou ont leur propre plafond : 30, puis 429', async () => {
    const app = buildApp();
    engageGlobalLock();
    const ip = '192.0.2.50';
    for (let i = 0; i < 30; i++) expect((await attempt(app, 'bon', ip)).status).toBe(400);
    expect((await attempt(app, 'bon', ip)).status).toBe(429);
  });

  it('LoginLockedError garde le nom, le statut, le code et le message d’un échec ordinaire', () => {
    const err = new LoginLockedError();
    expect({ name: err.name, status: err.statusCode, code: err.code, message: err.message }).toEqual({
      name: 'BadRequestError',
      status: 400,
      code: 'BAD_REQUEST',
      message: 'Email ou mot de passe incorrect.'
    });
    expect(err.reason).toBe('LOGIN_LOCKED');
  });
});
