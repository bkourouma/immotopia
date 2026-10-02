/**
 * Inscription : le limiteur (`registrationRateLimiter`) est monte APRES la
 * validation du corps (`validate(registerSchema)`) — une requete invalide ne
 * consomme pas le quota. Le vrai routeur est monte, le limiteur en base et le
 * controleur sont simules.
 */

import '../helpers/app-shims';
import express from 'express';
import request from 'supertest';

const assertSignupAllowed = jest.fn(async () => undefined);
jest.mock('../../src/services/signup-guard-service', () => ({
  assertSignupAllowed: (...a: unknown[]) => (assertSignupAllowed as any)(...a)
}));
const register = jest.fn((_req: any, res: any) => res.status(201).json({ success: true }));
jest.mock('../../src/controllers/auth-controller', () => {
  const noop = (_req: any, res: any) => res.status(204).end();
  return {
    register: (...a: unknown[]) => (register as any)(...a),
    verifyEmailHandler: noop,
    resendVerification: noop,
    login: noop,
    refresh: noop,
    getMe: noop,
    logout: noop,
    forgotPasswordHandler: noop,
    resetPasswordHandler: noop,
    updateMyLanguage: noop
  };
});

import authRoutes from '../../src/routes/auth-routes';
import { registrationRateLimiter } from '../../src/middleware/rate-limit-middleware';
import { errorHandler } from '../../src/middleware/error-middleware';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use(errorHandler);

const VALID = {
  email: 'nouveau@example.com',
  password: 'Abcdef1!',
  confirmPassword: 'Abcdef1!',
  fullName: 'Nouveau Venu'
};

beforeEach(() => jest.clearAllMocks());

describe('POST /api/auth/register : ordre des middlewares', () => {
  it('le limiteur est monte apres la validation', () => {
    const layer = (authRoutes as any).stack.find((l: any) => l.route?.path === '/register');
    const handles: unknown[] = layer.route.stack.map((s: any) => s.handle);
    const limiterIndex = handles.indexOf(registrationRateLimiter);
    expect(limiterIndex).toBeGreaterThan(0);
    expect(limiterIndex).toBeLessThan(handles.length - 1);
  });

  it('une requete invalide repond 422 sans consommer le quota', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'pas-un-email' });
    expect(res.status).toBe(422);
    expect(assertSignupAllowed).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it('une requete valide consomme le quota puis atteint le controleur', async () => {
    const res = await request(app).post('/api/auth/register').send(VALID);
    expect(res.status).toBe(201);
    expect(assertSignupAllowed).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledTimes(1);
  });
});
