/**
 * Mots de passe et assainissement (audit 2026-10-19, lot 1 §8).
 *
 * `sanitizeBody` ne touche plus aux champs mot de passe. Les comptes dont le
 * hash a été calculé sur la forme altérée d'avant le correctif doivent pouvoir
 * se connecter encore : `loginUser` compare cette forme en second recours.
 */
const mockPrisma: Record<string, any> = {
  user: { findUnique: jest.fn(), update: jest.fn() },
  refreshToken: { create: jest.fn() },
  $transaction: jest.fn()
};
const comparePassword = jest.fn();

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/audit-auth-events', () => ({ logAuthEvent: jest.fn(), recordAuthEvent: jest.fn() }));
jest.mock('../../src/services/email-service', () => ({
  emailService: {},
  isEmailDeliveryConfigured: () => true
}));
jest.mock('../../src/utils/password-utils', () => ({
  hashPassword: jest.fn(),
  validatePasswordStrength: jest.fn(),
  comparePassword: (...a: unknown[]) => comparePassword(...a)
}));
jest.mock('../../src/utils/jwt-utils', () => ({
  generateAccessToken: jest.fn().mockReturnValue('access'),
  generateRefreshToken: jest.fn().mockReturnValue('refresh')
}));

import { loginUser } from '../../src/services/auth-service';

const user = {
  id: 'u1',
  email: 'a@b.test',
  isActive: true,
  emailVerified: true,
  passwordHash: 'stored-hash',
  globalRole: 'USER'
};

/** Simule bcrypt : le hash « stored-hash » correspond au seul mot de passe `matching`. */
function hashMatches(matching: string): void {
  comparePassword.mockImplementation(async (pwd: string, hash: string) => hash === 'stored-hash' && pwd === matching);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findUnique.mockResolvedValue(user);
  mockPrisma.user.update.mockResolvedValue({ id: 'u1' });
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
});

describe('loginUser et mots de passe contenant des caractères autrefois retirés', () => {
  it('accepte le mot de passe tel que saisi (hash calculé sur la forme brute)', async () => {
    hashMatches('Abc<def>1!&');
    await expect(loginUser({ email: 'a@b.test', password: 'Abc<def>1!&' })).resolves.toBeDefined();
    expect(comparePassword).toHaveBeenCalledTimes(1);
  });

  it("accepte encore un compte dont le hash date d'avant le correctif (forme assainie)", async () => {
    hashMatches('Abcdef1!&');
    await expect(loginUser({ email: 'a@b.test', password: ' Abc<def>1!& ' })).resolves.toBeDefined();
    expect(comparePassword).toHaveBeenNthCalledWith(1, ' Abc<def>1!& ', 'stored-hash');
    expect(comparePassword).toHaveBeenNthCalledWith(2, 'Abcdef1!&', 'stored-hash');
  });

  it('refuse un mauvais mot de passe sous ses deux formes', async () => {
    hashMatches('autre');
    await expect(loginUser({ email: 'a@b.test', password: 'Abc<def>1!' })).rejects.toThrow(
      'Email ou mot de passe incorrect.'
    );
  });

  it("ne fait qu'une comparaison quand la saisie n'a pas de forme assainie distincte", async () => {
    hashMatches('autre');
    await expect(loginUser({ email: 'a@b.test', password: 'Simple-Pass1' })).rejects.toThrow();
    expect(comparePassword).toHaveBeenCalledTimes(1);
  });

  it('compte inconnu : autant de comparaisons factices que pour un compte connu (temps de réponse)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    comparePassword.mockResolvedValue(false);
    await expect(loginUser({ email: 'x@b.test', password: 'Abc<def>1!' })).rejects.toThrow(
      'Email ou mot de passe incorrect.'
    );
    expect(comparePassword).toHaveBeenCalledTimes(2);
  });
});
