/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Sécurité : un lien de réinitialisation livré par WhatsApp (jeton `wa-`, créé
 * quand l'agence ouvre un compte à partir d'un contact CRM) ne doit pas poser
 * `emailVerified: true` ; un lien livré par e-mail (mot de passe oublié) le pose.
 */

const txUserUpdate = jest.fn();
const txTokenUpdate = jest.fn();
const mockPrisma = {
  passwordResetToken: { findFirst: jest.fn() },
  $transaction: jest.fn(async (fn: any) =>
    fn({ user: { update: txUserUpdate }, passwordResetToken: { update: txTokenUpdate } })
  )
};

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/email-service', () => ({
  emailService: {},
  isEmailDeliveryConfigured: jest.fn().mockReturnValue(true)
}));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn() }));

import { resetPassword } from '../../src/services/auth-service';
import { newOutOfBandResetToken } from '../../src/lib/reset-token-channel';

const STRONG = 'Sup3r-Secret!Passw0rd';

function tokenRecord(token: string) {
  mockPrisma.passwordResetToken.findFirst.mockResolvedValue({ id: 't1', token, userId: 'u1', user: { id: 'u1' } });
}

beforeEach(() => jest.clearAllMocks());

describe('resetPassword — validation de l’e-mail', () => {
  it('valide l’e-mail quand le lien a été livré par e-mail', async () => {
    tokenRecord('11111111-1111-4111-8111-111111111111');
    await resetPassword({ token: 'x', newPassword: STRONG, confirmPassword: STRONG } as any);
    expect(txUserUpdate.mock.calls[0][0].data).toMatchObject({ emailVerified: true });
  });

  it('ne valide PAS l’e-mail quand le lien a été partagé par WhatsApp', async () => {
    tokenRecord(newOutOfBandResetToken());
    await resetPassword({ token: 'x', newPassword: STRONG, confirmPassword: STRONG } as any);
    const data = txUserUpdate.mock.calls[0][0].data;
    expect(data.passwordHash).toBeDefined();
    expect(data).not.toHaveProperty('emailVerified');
  });
});
