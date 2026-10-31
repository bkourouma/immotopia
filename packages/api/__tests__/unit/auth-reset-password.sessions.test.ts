/**
 * Réinitialisation du mot de passe par lien (audit 2026-10-19, lot 1 §8) :
 * les refresh tokens de l'utilisateur sont révoqués DANS la transaction qui
 * change le hash, et le jeton de réinitialisation est lu avec un `select`
 * minimal (jamais l'objet User complet, qui porte `passwordHash`).
 */
const tx: Record<string, any> = {
  user: { update: jest.fn() },
  passwordResetToken: { update: jest.fn() },
  refreshToken: { updateMany: jest.fn() }
};
const mockPrisma: Record<string, any> = {
  passwordResetToken: { findFirst: jest.fn() },
  user: { update: jest.fn() },
  refreshToken: { updateMany: jest.fn() },
  $transaction: jest.fn()
};
const recordAuthEvent = jest.fn();

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/audit-auth-events', () => ({
  logAuthEvent: jest.fn(),
  recordAuthEvent: (...a: unknown[]) => recordAuthEvent(...a)
}));
jest.mock('../../src/services/email-service', () => ({
  emailService: {},
  isEmailDeliveryConfigured: () => true
}));
jest.mock('../../src/utils/password-utils', () => ({
  hashPassword: jest.fn().mockResolvedValue('new-hash'),
  validatePasswordStrength: jest.fn().mockReturnValue({ isValid: true }),
  comparePassword: jest.fn()
}));

import { resetPassword } from '../../src/services/auth-service';

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.passwordResetToken.findFirst.mockResolvedValue({
    id: 'rt1',
    userId: 'u1',
    user: { id: 'u1', email: 'a@b.test' }
  });
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx));
});

describe('resetPassword', () => {
  it('révoque tous les refresh tokens actifs dans la transaction du nouveau mot de passe', async () => {
    await resetPassword({ token: 'tok', newPassword: 'N3w-Passw0rd!', confirmPassword: 'N3w-Passw0rd!' } as any);

    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' }, data: expect.objectContaining({ passwordHash: 'new-hash' }) })
    );
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revoked: false },
      data: { revoked: true, revokedAt: expect.any(Date) }
    });
    // Hors transaction : rien.
    expect(mockPrisma.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(recordAuthEvent).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ actionKey: 'AUTH_PASSWORD_RESET_COMPLETED', actorLabel: 'a@b.test' })
    );
  });

  it("lit le jeton avec un select minimal, jamais l'objet User complet", async () => {
    await resetPassword({ token: 'tok', newPassword: 'N3w-Passw0rd!', confirmPassword: 'N3w-Passw0rd!' } as any);

    const call = mockPrisma.passwordResetToken.findFirst.mock.calls[0][0];
    expect(call.include).toBeUndefined();
    expect(call.select).toEqual({ id: true, userId: true, user: { select: { id: true, email: true } } });
  });

  it('ne révoque rien quand le jeton est invalide', async () => {
    mockPrisma.passwordResetToken.findFirst.mockResolvedValue(null);
    await expect(
      resetPassword({ token: 'bad', newPassword: 'N3w-Passw0rd!', confirmPassword: 'N3w-Passw0rd!' } as any)
    ).rejects.toThrow();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});
