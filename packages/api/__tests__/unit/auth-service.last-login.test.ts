/**
 * BUG-2026-09-28-005 : User.lastLoginAt est écrit à chaque connexion réussie,
 * en meilleur effort (un échec d'écriture ne bloque pas la connexion).
 */
const mockPrisma: Record<string, any> = {
  user: { findUnique: jest.fn(), update: jest.fn() },
  refreshToken: { create: jest.fn() },
  $transaction: jest.fn()
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));
jest.mock('../../src/services/email-service', () => ({
  emailService: {},
  isEmailDeliveryConfigured: () => true
}));
jest.mock('../../src/utils/password-utils', () => ({
  hashPassword: jest.fn(),
  validatePasswordStrength: jest.fn(),
  comparePassword: jest.fn().mockResolvedValue(true)
}));
jest.mock('../../src/utils/jwt-utils', () => ({
  generateAccessToken: jest.fn().mockReturnValue('access'),
  generateRefreshToken: jest.fn().mockReturnValue('refresh')
}));

import { loginUser, recordLastLogin } from '../../src/services/auth-service';

const user = {
  id: 'u1',
  email: 'a@b.test',
  isActive: true,
  emailVerified: true,
  passwordHash: 'hash',
  globalRole: 'USER'
};

describe('User.lastLoginAt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue(user);
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
  });

  it('est écrit après une connexion par mot de passe, sans charger le User complet', async () => {
    mockPrisma.user.update.mockResolvedValue({ id: 'u1' });
    await loginUser({ email: 'a@b.test', password: 'x' } as any);
    const call = mockPrisma.user.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'u1' });
    expect(call.data.lastLoginAt).toBeInstanceOf(Date);
    expect(call.select).toEqual({ id: true });
    expect(call.include).toBeUndefined();
  });

  it("un échec d'écriture ne fait pas échouer la connexion", async () => {
    mockPrisma.user.update.mockRejectedValue(new Error('db down'));
    await expect(loginUser({ email: 'a@b.test', password: 'x' } as any)).resolves.toBeDefined();
  });

  it('recordLastLogin avale les erreurs', async () => {
    mockPrisma.user.update.mockRejectedValue(new Error('boom'));
    await expect(recordLastLogin('u1')).resolves.toBeUndefined();
  });
});
