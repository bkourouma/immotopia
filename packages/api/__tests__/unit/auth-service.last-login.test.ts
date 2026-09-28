/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * BUG-2026-09-28-005 : `User.lastLoginAt` n'était jamais écrit, laissant la
 * colonne « Dernière connexion » à « Jamais » même après une connexion
 * réussie. `loginUser` doit l'écrire, en meilleur effort (un échec d'écriture
 * ne doit pas faire échouer une connexion par ailleurs valide).
 */

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn()
  },
  refreshToken: {
    create: jest.fn()
  },
  $transaction: jest.fn()
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));

jest.mock('../../src/services/email-service', () => ({
  emailService: { sendVerificationEmail: jest.fn() },
  isEmailDeliveryConfigured: jest.fn().mockReturnValue(true)
}));

jest.mock('../../src/services/audit-service', () => ({
  logAuditEvent: jest.fn()
}));

jest.mock('../../src/utils/jwt-utils', () => ({
  generateAccessToken: jest.fn().mockReturnValue('access-token'),
  generateRefreshToken: jest.fn().mockReturnValue('refresh-token')
}));

jest.mock('../../src/utils/password-utils', () => ({
  ...jest.requireActual('../../src/utils/password-utils'),
  comparePassword: jest.fn().mockResolvedValue(true)
}));

import { loginUser } from '../../src/services/auth-service';

describe('loginUser — écriture de lastLoginAt', () => {
  const user = {
    id: 'user-1',
    email: 'admin.oi@recette.test',
    passwordHash: 'hashed',
    isActive: true,
    emailVerified: true,
    globalRole: 'USER'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue({ ...user });
    mockPrisma.refreshToken.create.mockResolvedValue({});
  });

  it('écrit lastLoginAt sur une connexion réussie', async () => {
    mockPrisma.user.update.mockResolvedValueOnce({ ...user, lastLoginAt: new Date() });

    await loginUser({ email: user.email, password: 'whatever-strong' } as any);

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { lastLoginAt: expect.any(Date) }
    });
  });

  it("ne fait pas échouer la connexion si l'écriture de lastLoginAt échoue", async () => {
    mockPrisma.user.update.mockRejectedValueOnce(new Error('DB down'));

    const result = await loginUser({ email: user.email, password: 'whatever-strong' } as any);

    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toBe('refresh-token');
  });
});
