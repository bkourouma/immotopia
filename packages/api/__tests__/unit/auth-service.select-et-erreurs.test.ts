/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * AUTH-03 (service) : erreurs typées 400 au texte inchangé ; AUTH-11 e : verifyEmail
 * et getCurrentUser lisent User par `select` public (jamais `passwordHash`) ;
 * AUTH-07 : forgotPassword et resendVerificationEmail n'attendent pas l'envoi.
 */
const tx: Record<string, any> = {
  emailVerificationToken: { update: jest.fn() },
  user: { update: jest.fn() }
};
const mockPrisma: Record<string, any> = {
  emailVerificationToken: { findFirst: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  passwordResetToken: { findFirst: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
  user: { findUnique: jest.fn() },
  membership: { findMany: jest.fn().mockResolvedValue([]) },
  $transaction: jest.fn()
};
const sendVerificationEmail = jest.fn();
const sendPasswordResetEmail = jest.fn();
const validatePasswordStrength = jest.fn();

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/audit-auth-events', () => ({ logAuthEvent: jest.fn(), recordAuthEvent: jest.fn() }));
jest.mock('../../src/services/permission-service', () => ({ getUserPermissions: jest.fn() }));
jest.mock('../../src/services/email-service', () => ({
  emailService: {
    sendVerificationEmail: (...a: unknown[]) => sendVerificationEmail(...a),
    sendPasswordResetEmail: (...a: unknown[]) => sendPasswordResetEmail(...a)
  },
  isEmailDeliveryConfigured: () => true
}));
jest.mock('../../src/utils/password-utils', () => ({
  hashPassword: jest.fn(),
  validatePasswordStrength: (...a: unknown[]) => validatePasswordStrength(...a),
  comparePassword: jest.fn()
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() }
}));

import { logger } from '../../src/utils/logger';
import {
  verifyEmail,
  getCurrentUser,
  resetPassword,
  forgotPassword,
  resendVerificationEmail
} from '../../src/services/auth-service';
import { BadRequestError } from '../../src/middleware/error-middleware';

const publicUser = { id: 'u1', email: 'a@b.test', fullName: 'A', emailVerified: false };

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx));
  validatePasswordStrength.mockReturnValue({ isValid: true });
});

describe('erreurs typées (AUTH-03, côté service)', () => {
  const cases: Array<[string, () => Promise<unknown>, string, () => void]> = [
    [
      'verifyEmail',
      () => verifyEmail('t'),
      'Token de vérification invalide ou expiré.',
      () => mockPrisma.emailVerificationToken.findFirst.mockResolvedValue(null)
    ],
    [
      'resetPassword (jeton)',
      () => resetPassword({ token: 't', newPassword: 'x' } as any),
      'Token de réinitialisation invalide ou expiré. Veuillez faire une nouvelle demande.',
      () => mockPrisma.passwordResetToken.findFirst.mockResolvedValue(null)
    ],
    [
      'resetPassword (force)',
      () => resetPassword({ token: 't', newPassword: 'x' } as any),
      'Mot de passe trop faible.',
      () => validatePasswordStrength.mockReturnValue({ isValid: false, error: 'Mot de passe trop faible.' })
    ]
  ];
  it.each(cases)('%s : BadRequestError 400, texte inchangé', async (_n, call, message, setup) => {
    setup();
    const err: any = await call().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestError);
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe(message);
  });
});

describe('select public (AUTH-11 e)', () => {
  it('verifyEmail : select explicite sans passwordHash, utilisateur public renvoyé', async () => {
    mockPrisma.emailVerificationToken.findFirst.mockResolvedValue({ id: 'v1', userId: 'u1', user: publicUser });
    const out = await verifyEmail('t');
    const arg = mockPrisma.emailVerificationToken.findFirst.mock.calls[0][0];
    expect(arg.include).toBeUndefined();
    expect(arg.select.user.select.passwordHash).toBeUndefined();
    expect(arg.select.user.select.email).toBe(true);
    expect(out).toEqual(publicUser);
  });

  it('getCurrentUser : select public sans passwordHash', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(publicUser);
    await getCurrentUser('u1');
    const arg = mockPrisma.user.findUnique.mock.calls[0][0];
    expect(arg.include).toBeUndefined();
    expect(arg.select.passwordHash).toBeUndefined();
    expect(arg.select.id).toBe(true);
  });
});

describe('envoi d’e-mail détaché (AUTH-07)', () => {
  const unverified = { id: 'u1', email: 'a@b.test', emailVerified: false, fullName: 'A', preferredLanguage: 'fr' };
  const variants: Array<[string, () => Promise<unknown>, jest.Mock]> = [
    ['resendVerificationEmail', () => resendVerificationEmail('a@b.test'), sendVerificationEmail],
    ['forgotPassword', () => forgotPassword({ email: 'a@b.test' } as any), sendPasswordResetEmail]
  ];

  it.each(variants)('%s se termine sans attendre un envoi qui ne se résout jamais', async (_n, call, sender) => {
    mockPrisma.user.findUnique.mockResolvedValue(unverified);
    sender.mockReturnValue(new Promise(() => undefined));
    await expect(call()).resolves.toBeUndefined();
    expect(sender).toHaveBeenCalledTimes(1);
  });

  it.each(variants)('%s : une erreur d’envoi est journalisée sans remonter', async (_n, call, sender) => {
    mockPrisma.user.findUnique.mockResolvedValue(unverified);
    sender.mockRejectedValue(new Error('SMTP down'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(call()).resolves.toBeUndefined();
    await new Promise(resolve => setImmediate(resolve));
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to send'), expect.anything());
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
