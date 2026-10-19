/**
 * resetMemberPassword : membre ACTIF seulement ; pas d'écrasement du mot de
 * passe GLOBAL d'un super-admin ni d'un compte actif dans d'autres agences
 * (lien de réinitialisation seul) ; select minimal.
 */
const tx: any = {
  user: { update: jest.fn() },
  refreshToken: { updateMany: jest.fn() },
  passwordResetToken: { updateMany: jest.fn(), create: jest.fn() }
};
const prismaMock: any = {
  membership: { findUnique: jest.fn(), count: jest.fn() },
  $transaction: jest.fn(async (cb: (client: unknown) => Promise<unknown>) => cb(tx))
};
const sendPasswordResetEmail = jest.fn();
const recordAuditEvent = jest.fn().mockResolvedValue(undefined);
jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => {
  const actual = jest.requireActual('../../src/services/audit-service');
  return { ...actual, recordAuditEvent: (...a: unknown[]) => recordAuditEvent(...a) };
});
jest.mock('../../src/services/permission-service', () => ({ invalidateAllUserPermissionCache: jest.fn() }));
jest.mock('../../src/services/email-service', () => ({
  emailService: { sendPasswordResetEmail: (...a: unknown[]) => sendPasswordResetEmail(...a) }
}));

import { MembershipStatus } from '@prisma/client';
import { resetMemberPassword } from '../../src/services/membership-service';

function member(status: MembershipStatus, globalRole = 'USER') {
  prismaMock.membership.findUnique.mockResolvedValue({
    id: 'm1',
    status,
    user: { email: 'a@b.c', fullName: 'A', preferredLanguage: 'fr', globalRole }
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.membership.count.mockResolvedValue(0);
  tx.refreshToken.updateMany.mockResolvedValue({ count: 1 });
});

describe('resetMemberPassword', () => {
  it.each([MembershipStatus.PENDING_INVITE, MembershipStatus.DISABLED])('refuse un membre %s', async status => {
    member(status);
    await expect(resetMemberPassword('u2', 't1', undefined, 'admin')).rejects.toMatchObject({ statusCode: 409 });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('refuse un membre introuvable (404 typé)', async () => {
    prismaMock.membership.findUnique.mockResolvedValue(null);
    await expect(resetMemberPassword('u2', 't1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it("super-admin : le hash n'est pas écrasé, seul le lien est envoyé", async () => {
    member(MembershipStatus.ACTIVE, 'SUPER_ADMIN');
    const res = await resetMemberPassword('u2', 't1', undefined, 'admin');
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(tx.passwordResetToken.create).toHaveBeenCalledTimes(1);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(recordAuditEvent).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ resetLinkSent: true, sessionsRevoked: false });
  });

  it('super-admin : un mot de passe imposé est refusé (403)', async () => {
    member(MembershipStatus.ACTIVE, 'SUPER_ADMIN');
    await expect(resetMemberPassword('u2', 't1', 'Abcdef1!xyz', 'admin')).rejects.toMatchObject({ statusCode: 403 });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("membre actif d'une autre agence : lien seul, mot de passe imposé refusé", async () => {
    member(MembershipStatus.ACTIVE);
    prismaMock.membership.count.mockResolvedValue(1);
    const res = await resetMemberPassword('u2', 't1', undefined, 'admin');
    expect(prismaMock.membership.count).toHaveBeenCalledWith({
      where: { userId: 'u2', tenantId: { not: 't1' }, status: MembershipStatus.ACTIVE }
    });
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(res.sessionsRevoked).toBe(false);
    await expect(resetMemberPassword('u2', 't1', 'Abcdef1!xyz', 'admin')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('cas nominal mono-agence : hash remplacé, sessions révoquées, audit et lien conservés', async () => {
    member(MembershipStatus.ACTIVE);
    const res = await resetMemberPassword('u2', 't1', undefined, 'admin');
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'u2' }, data: { passwordHash: expect.any(String) } });
    expect(tx.refreshToken.updateMany).toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledWith(tx, expect.objectContaining({ entityId: 'u2', tenantId: 't1' }));
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ password: undefined, resetLinkSent: true, sessionsRevoked: true });
  });

  it('utilise un select minimal (jamais include user)', async () => {
    member(MembershipStatus.ACTIVE);
    await resetMemberPassword('u2', 't1');
    const arg = prismaMock.membership.findUnique.mock.calls[0][0];
    expect(arg.include).toBeUndefined();
    expect(arg.select.user.select.passwordHash).toBeUndefined();
  });
});
