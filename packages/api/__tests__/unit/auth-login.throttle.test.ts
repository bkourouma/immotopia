/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * loginUser et verrou par e-mail (AUTH-01) : après 10 échecs, refus uniforme
 * (même erreur, même statut) même avec le bon mot de passe, sans comparaison
 * du vrai hash ; un succès avant le seuil remet le compteur à zéro.
 */
const mockPrisma: Record<string, any> = {
  user: { findUnique: jest.fn(), update: jest.fn() },
  refreshToken: { create: jest.fn() },
  $transaction: jest.fn()
};
const comparePassword = jest.fn();

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/audit-auth-events', () => ({ logAuthEvent: jest.fn(), recordAuthEvent: jest.fn() }));
jest.mock('../../src/services/email-service', () => ({ emailService: {}, isEmailDeliveryConfigured: () => true }));
jest.mock('../../src/utils/password-utils', () => ({
  hashPassword: jest.fn(),
  validatePasswordStrength: jest.fn(),
  comparePassword: (...a: unknown[]) => comparePassword(...a)
}));
jest.mock('../../src/utils/jwt-utils', () => ({
  generateAccessToken: jest.fn().mockReturnValue('access'),
  generateRefreshToken: jest.fn().mockReturnValue('refresh')
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() }
}));

import { loginUser } from '../../src/services/auth-service';
import { resetLoginThrottle, LOGIN_THROTTLE_MAX_FAILURES } from '../../src/services/login-throttle-service';
import { BadRequestError } from '../../src/middleware/error-middleware';

const user = {
  id: 'u1',
  email: 'a@b.test',
  isActive: true,
  emailVerified: true,
  passwordHash: 'stored-hash',
  globalRole: 'USER'
};
const UNIFORM = 'Email ou mot de passe incorrect.';

const OWNER_IP = '203.0.113.7';
const attempt = (password: string, email = 'a@b.test', ip: string | undefined = OWNER_IP) =>
  loginUser({ email, password } as any, { ip });
const failure = async (password: string, email?: string, ip?: string) => {
  try {
    await attempt(password, email, ip);
  } catch (e) {
    return e as BadRequestError;
  }
  throw new Error('devait échouer');
};

beforeEach(() => {
  jest.clearAllMocks();
  resetLoginThrottle();
  mockPrisma.user.findUnique.mockImplementation(async ({ where }: any) => (where.email === 'a@b.test' ? user : null));
  mockPrisma.user.update.mockResolvedValue({ id: 'u1' });
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
  comparePassword.mockImplementation(async (pwd: string, hash: string) => hash === 'stored-hash' && pwd === 'bon');
});

describe('loginUser : verrou par e-mail', () => {
  it('10 échecs puis refus uniforme même avec le bon mot de passe, sans comparer le vrai hash', async () => {
    for (let i = 0; i < LOGIN_THROTTLE_MAX_FAILURES; i++) await failure('mauvais');
    comparePassword.mockClear();

    const err = await failure('bon');
    expect(err).toBeInstanceOf(BadRequestError);
    expect(err.message).toBe(UNIFORM);
    expect(err.statusCode).toBe(400);
    // Uniquement des comparaisons factices pendant le verrou.
    expect(comparePassword).toHaveBeenCalled();
    for (const call of comparePassword.mock.calls) expect(call[1]).not.toBe('stored-hash');
  });

  it('le refus pendant le verrou est identique à un échec ordinaire (message, statut, code)', async () => {
    const ordinary = await failure('mauvais');
    for (let i = 1; i < LOGIN_THROTTLE_MAX_FAILURES; i++) await failure('mauvais');
    const locked = await failure('bon');
    expect({ m: locked.message, s: locked.statusCode, c: locked.code, n: locked.name }).toEqual({
      m: ordinary.message,
      s: ordinary.statusCode,
      c: ordinary.code,
      n: ordinary.name
    });
  });

  it('un e-mail inconnu est verrouillé de la même façon', async () => {
    for (let i = 0; i < LOGIN_THROTTLE_MAX_FAILURES; i++) await failure('x', 'ghost@b.test');
    const err = await failure('x', 'ghost@b.test');
    expect(err.message).toBe(UNIFORM);
    expect(err.statusCode).toBe(400);
  });

  it('un succès avant le seuil remet le compteur à zéro', async () => {
    for (let i = 0; i < LOGIN_THROTTLE_MAX_FAILURES - 1; i++) await failure('mauvais');
    await expect(attempt('bon')).resolves.toBeDefined();
    for (let i = 0; i < LOGIN_THROTTLE_MAX_FAILURES - 1; i++) await failure('mauvais');
    await expect(attempt('bon')).resolves.toBeDefined();
  });

  it('casse et espaces de l’e-mail ne contournent pas le verrou', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    for (let i = 0; i < LOGIN_THROTTLE_MAX_FAILURES; i++) await failure('x', i % 2 ? ' G@B.test' : 'g@b.TEST ');
    mockPrisma.user.findUnique.mockClear();
    await failure('x', 'g@b.test');
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('un refus post-authentification (compte désactivé) n’est pas compté comme échec', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...user, isActive: false });
    for (let i = 0; i < LOGIN_THROTTLE_MAX_FAILURES + 2; i++) {
      await expect(attempt('bon')).rejects.toThrow(/désactivé/);
    }
  });

  it('un attaquant d’une autre IP (autre /64) ne peut pas enfermer le titulaire', async () => {
    const attackerIp = '2001:db8:dead:beef::99';
    for (let i = 0; i < 200; i++) await failure('mauvais', 'a@b.test', attackerIp);
    // Le titulaire, depuis sa propre IP, se connecte.
    await expect(attempt('bon')).resolves.toBeDefined();
  });

  it('le verrou est propre à la paire : même e-mail, autre IP, pas de refus', async () => {
    for (let i = 0; i < LOGIN_THROTTLE_MAX_FAILURES; i++) await failure('mauvais', 'a@b.test', '198.51.100.5');
    await expect(attempt('bon', 'a@b.test', '198.51.100.5')).rejects.toThrow(UNIFORM);
    await expect(attempt('bon', 'a@b.test', OWNER_IP)).resolves.toBeDefined();
  });
});
