/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * resendVerification : réponse identique (200, même message) que le compte
 * existe ou non, soit déjà vérifié, ou que l'envoi échoue. Aucun message brut.
 */
const mockPrisma: Record<string, any> = {
  user: { findUnique: jest.fn() },
  emailVerificationToken: { updateMany: jest.fn(), create: jest.fn() }
};
const mockSend = jest.fn();

jest.mock('../../src/utils/database', () => ({ prisma: mockPrisma }));
jest.mock('../../src/services/audit-service', () => ({ logAuditEvent: jest.fn(), recordAuditEvent: jest.fn() }));
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendVerificationEmail: (...a: any[]) => mockSend(...a) },
  isEmailDeliveryConfigured: () => true
}));

import { resendVerification } from '../../src/controllers/auth-controller';

async function call(email: string) {
  const res: any = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  await resendVerification({ body: { email } } as any, res);
  return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] };
}

describe('resendVerification : pas d’énumération', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.emailVerificationToken.updateMany.mockResolvedValue({});
    mockPrisma.emailVerificationToken.create.mockResolvedValue({});
  });

  it('même réponse pour inconnu, déjà vérifié, envoyé et échec d’envoi', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    const inconnu = await call('x@y.test');

    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'u1', email: 'a@b.test', emailVerified: true });
    const verifie = await call('a@b.test');

    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'u1', email: 'a@b.test', emailVerified: false });
    mockSend.mockResolvedValueOnce(undefined);
    const envoye = await call('a@b.test');

    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'u1', email: 'a@b.test', emailVerified: false });
    mockSend.mockRejectedValueOnce(new Error('SMTP connect ECONNREFUSED 10.0.0.5:587'));
    const echec = await call('a@b.test');

    for (const r of [verifie, envoye, echec]) {
      expect(r).toEqual(inconnu);
    }
    expect(inconnu.status).toBe(200);
    expect(JSON.stringify(echec)).not.toContain('ECONNREFUSED');
  });

  it('une panne de base ne renvoie pas son message', async () => {
    mockPrisma.user.findUnique.mockRejectedValueOnce(new Error('relation "users" does not exist'));
    const r = await call('a@b.test');
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).not.toContain('users');
  });
});
