/**
 * TEN-04 : un gestionnaire (USERS_EDIT) ne peut ni s'attribuer / attribuer le rôle
 * TENANT_ADMIN, ni le retirer, ni désactiver / réactiver / déconnecter un
 * administrateur ; nul ne modifie ses propres rôles ; la révocation de sessions
 * épargne un super-admin et un compte actif dans d'autres agences.
 */
const tx: any = {
  membership: { update: jest.fn(), count: jest.fn() },
  user: { findUnique: jest.fn() },
  tenantClient: { count: jest.fn() },
  refreshToken: { updateMany: jest.fn() },
  userRole: { deleteMany: jest.fn(), createMany: jest.fn(), count: jest.fn() }
};
const prismaMock: any = {
  membership: { findUnique: jest.fn() },
  role: { findMany: jest.fn() },
  userRole: { count: jest.fn() },
  user: { findUnique: jest.fn() },
  $transaction: jest.fn(async (cb: (client: unknown) => Promise<unknown>) => cb(tx))
};
jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => {
  const actual = jest.requireActual('../../src/services/audit-service');
  return { ...actual, recordAuditEvent: jest.fn().mockResolvedValue(undefined) };
});
jest.mock('../../src/services/permission-service', () => ({ invalidateAllUserPermissionCache: jest.fn() }));
jest.mock('../../src/services/email-service', () => ({ emailService: {} }));

import { MembershipStatus } from '@prisma/client';
import {
  disableMember,
  enableMember,
  revokeMemberSessions,
  updateMemberRoles
} from '../../src/services/membership-service';

const T = 't1';
const ADMIN_ROLE = { id: 'r-admin', key: 'TENANT_ADMIN' };
const AGENT_ROLE = { id: 'r-agent', key: 'TENANT_AGENT' };

/** Acteur 'actor', cible 'target' ; `otherAdmins` = autres administrateurs actifs. */
function scene(opts: {
  actorAdmin?: boolean;
  actorGlobal?: string;
  targetAdmin?: boolean;
  otherAdmins?: number;
  targetGlobal?: string;
  status?: MembershipStatus;
}) {
  prismaMock.userRole.count.mockImplementation(async ({ where }: any) => {
    if (typeof where.userId === 'object') return opts.otherAdmins ?? 1;
    if (where.userId === 'actor') return opts.actorAdmin ? 1 : 0;
    return opts.targetAdmin ? 1 : 0;
  });
  prismaMock.user.findUnique.mockResolvedValue({ globalRole: opts.actorGlobal ?? 'USER' });
  prismaMock.membership.findUnique.mockResolvedValue({
    id: 'm1',
    status: opts.status ?? MembershipStatus.ACTIVE,
    user: { id: 'target', globalRole: opts.targetGlobal ?? 'USER', userRoles: [] }
  });
  tx.user.findUnique.mockResolvedValue({ globalRole: opts.targetGlobal ?? 'USER' });
}

beforeEach(() => {
  jest.clearAllMocks();
  tx.membership.update.mockResolvedValue({ id: 'm1' });
  tx.membership.count.mockResolvedValue(0);
  tx.userRole.count.mockResolvedValue(0);
  tx.tenantClient.count.mockResolvedValue(0);
  tx.refreshToken.updateMany.mockResolvedValue({ count: 2 });
  prismaMock.role.findMany.mockResolvedValue([AGENT_ROLE]);
});

describe('updateMemberRoles : escalade TENANT_ADMIN', () => {
  it('un gestionnaire ne peut pas attribuer TENANT_ADMIN à un autre membre (403)', async () => {
    scene({ actorAdmin: false });
    prismaMock.role.findMany.mockResolvedValue([ADMIN_ROLE]);
    await expect(updateMemberRoles('target', T, { roleIds: ['r-admin'] }, 'actor')).rejects.toMatchObject({
      statusCode: 403
    });
    expect(tx.userRole.deleteMany).not.toHaveBeenCalled();
  });

  it('un gestionnaire ne peut pas se donner TENANT_ADMIN (403, ses propres rôles)', async () => {
    scene({ actorAdmin: false });
    prismaMock.role.findMany.mockResolvedValue([ADMIN_ROLE]);
    await expect(updateMemberRoles('actor', T, { roleIds: ['r-admin'] }, 'actor')).rejects.toMatchObject({
      statusCode: 403
    });
    expect(prismaMock.membership.findUnique).not.toHaveBeenCalled();
    expect(tx.userRole.deleteMany).not.toHaveBeenCalled();
  });

  it('un gestionnaire ne peut pas retirer TENANT_ADMIN à un administrateur (403)', async () => {
    scene({ actorAdmin: false, targetAdmin: true, otherAdmins: 2 });
    await expect(updateMemberRoles('target', T, { roleIds: ['r-agent'] }, 'actor')).rejects.toMatchObject({
      statusCode: 403
    });
    expect(tx.userRole.deleteMany).not.toHaveBeenCalled();
  });

  it("un gestionnaire ne peut pas modifier d'autres rôles d'un administrateur (403)", async () => {
    scene({ actorAdmin: false, targetAdmin: true });
    prismaMock.role.findMany.mockResolvedValue([ADMIN_ROLE, AGENT_ROLE]);
    await expect(updateMemberRoles('target', T, { roleIds: ['r-admin', 'r-agent'] }, 'actor')).rejects.toMatchObject({
      statusCode: 403
    });
  });

  it('un administrateur de la même agence peut attribuer TENANT_ADMIN', async () => {
    scene({ actorAdmin: true });
    prismaMock.role.findMany.mockResolvedValue([ADMIN_ROLE]);
    await updateMemberRoles('target', T, { roleIds: ['r-admin'] }, 'actor');
    expect(tx.userRole.createMany).toHaveBeenCalledTimes(1);
  });

  it('un administrateur peut retirer TENANT_ADMIN à un autre administrateur (il en reste un)', async () => {
    scene({ actorAdmin: true, targetAdmin: true, otherAdmins: 1 });
    await updateMemberRoles('target', T, { roleIds: ['r-agent'] }, 'actor');
    expect(tx.userRole.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("un super-admin (rôle global) peut attribuer TENANT_ADMIN sans être admin de l'agence", async () => {
    scene({ actorAdmin: false, actorGlobal: 'SUPER_ADMIN' });
    prismaMock.role.findMany.mockResolvedValue([ADMIN_ROLE]);
    await updateMemberRoles('target', T, { roleIds: ['r-admin'] }, 'actor');
    expect(tx.userRole.createMany).toHaveBeenCalledTimes(1);
  });

  it("H1 : un gestionnaire garde l'édition des rôles non-administrateur d'un agent", async () => {
    scene({ actorAdmin: false, targetAdmin: false });
    await updateMemberRoles('target', T, { roleIds: ['r-agent'] }, 'actor');
    expect(tx.userRole.createMany).toHaveBeenCalledTimes(1);
  });

  it('nul ne modifie ses propres rôles, même un administrateur ou un super-admin (403)', async () => {
    scene({ actorAdmin: true, actorGlobal: 'SUPER_ADMIN' });
    await expect(updateMemberRoles('actor', T, { roleIds: ['r-agent'] }, 'actor')).rejects.toMatchObject({
      statusCode: 403
    });
    expect(tx.userRole.deleteMany).not.toHaveBeenCalled();
  });
});

describe('disableMember / enableMember / revokeMemberSessions : compte administrateur protégé', () => {
  it('un gestionnaire ne peut pas désactiver un administrateur (403)', async () => {
    scene({ actorAdmin: false, targetAdmin: true, otherAdmins: 2 });
    await expect(disableMember('target', T, 'actor')).rejects.toMatchObject({ statusCode: 403 });
    expect(tx.membership.update).not.toHaveBeenCalled();
  });

  it('un gestionnaire ne peut pas réactiver un administrateur (403)', async () => {
    scene({ actorAdmin: false, targetAdmin: true, status: MembershipStatus.DISABLED });
    await expect(enableMember('target', T, 'actor')).rejects.toMatchObject({ statusCode: 403 });
    expect(tx.membership.update).not.toHaveBeenCalled();
  });

  it("un gestionnaire ne peut pas révoquer les sessions d'un administrateur (403)", async () => {
    scene({ actorAdmin: false, targetAdmin: true });
    await expect(revokeMemberSessions('target', T, 'actor')).rejects.toMatchObject({ statusCode: 403 });
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('un administrateur peut désactiver, réactiver et déconnecter un autre administrateur', async () => {
    scene({ actorAdmin: true, targetAdmin: true, otherAdmins: 1 });
    await disableMember('target', T, 'actor');
    scene({ actorAdmin: true, targetAdmin: true, status: MembershipStatus.DISABLED });
    await enableMember('target', T, 'actor');
    scene({ actorAdmin: true, targetAdmin: true });
    await revokeMemberSessions('target', T, 'actor');
    expect(tx.membership.update).toHaveBeenCalledTimes(2);
    expect(tx.refreshToken.updateMany).toHaveBeenCalledTimes(2); // disable + revoke
  });

  it('un super-admin peut désactiver un administrateur', async () => {
    scene({ actorAdmin: false, actorGlobal: 'SUPER_ADMIN', targetAdmin: true, otherAdmins: 1 });
    await disableMember('target', T, 'actor');
    expect(tx.membership.update).toHaveBeenCalledTimes(1);
  });

  it('un gestionnaire garde la main sur un membre non administrateur', async () => {
    scene({ actorAdmin: false, targetAdmin: false });
    await disableMember('target', T, 'actor');
    scene({ actorAdmin: false, targetAdmin: false, status: MembershipStatus.DISABLED });
    await enableMember('target', T, 'actor');
    scene({ actorAdmin: false, targetAdmin: false });
    await revokeMemberSessions('target', T, 'actor');
    expect(tx.membership.update).toHaveBeenCalledTimes(2);
  });
});

describe('revokeUserSessionsInTx : sessions communes épargnées', () => {
  it('revokeMemberSessions refuse un super-admin cible (403), aucun token touché', async () => {
    scene({ actorAdmin: true, targetGlobal: 'SUPER_ADMIN' });
    await expect(revokeMemberSessions('target', T, 'actor')).rejects.toMatchObject({ statusCode: 403 });
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it("disableMember d'un compte actif dans une autre agence ne révoque pas ses refresh tokens", async () => {
    scene({ actorAdmin: true, targetAdmin: false });
    tx.membership.count.mockResolvedValue(1);
    await disableMember('target', T, 'actor');
    expect(tx.membership.update).toHaveBeenCalledTimes(1);
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(tx.membership.count).toHaveBeenCalledWith({ where: { userId: 'target', tenantId: { not: T } } });
  });

  it('disableMember : un super-admin désactivé dans une agence garde ses sessions', async () => {
    scene({ actorAdmin: true, targetAdmin: false });
    tx.user.findUnique.mockResolvedValue({ globalRole: 'SUPER_ADMIN' });
    await disableMember('target', T, 'actor');
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('revokeMemberSessions : compte multi-agences, aucun token révoqué', async () => {
    scene({ actorAdmin: true, targetAdmin: false });
    tx.membership.count.mockResolvedValue(2);
    await revokeMemberSessions('target', T, 'actor');
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('compte mono-agence : les sessions sont révoquées', async () => {
    scene({ actorAdmin: true, targetAdmin: false });
    await revokeMemberSessions('target', T, 'actor');
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'target', revoked: false },
      data: { revoked: true, revokedAt: expect.any(Date) }
    });
  });
});

describe('N1 : revokeMemberSessions annonce honnêtement ce qui a été fait', () => {
  it('compte mono-agence : sessionsRevoked true, audit SESSIONS_REVOKED écrit', async () => {
    scene({ actorAdmin: true });
    const res = await revokeMemberSessions('target', T, 'actor');
    expect(res).toMatchObject({ sessionsRevoked: true, tokensRevoked: 2 });
    const { recordAuditEvent } = require('../../src/services/audit-service');
    expect(recordAuditEvent).toHaveBeenCalledWith(tx, expect.objectContaining({ actionKey: 'SESSIONS_REVOKED' }));
  });

  it('compte actif ailleurs : sessionsRevoked false et aucun audit SESSIONS_REVOKED', async () => {
    scene({ actorAdmin: true });
    tx.membership.count.mockResolvedValue(1);
    const res = await revokeMemberSessions('target', T, 'actor');
    expect(res.sessionsRevoked).toBe(false);
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
    const { recordAuditEvent } = require('../../src/services/audit-service');
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
});

describe('N2 : un seul prédicat « compte partagé » (critères complets)', () => {
  it.each([
    ['appartenance non active ailleurs', () => tx.membership.count.mockResolvedValue(1)],
    ['rôle de portée plateforme ou autre agence', () => tx.userRole.count.mockResolvedValue(1)],
    ['profil client dans une autre agence', () => tx.tenantClient.count.mockResolvedValue(1)]
  ])('disableMember : %s, sessions épargnées', async (_label, arrange) => {
    scene({ actorAdmin: true, targetAdmin: false });
    arrange();
    await disableMember('target', T, 'actor');
    expect(tx.membership.update).toHaveBeenCalledTimes(1);
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});

describe('A2 : seul un super-admin agit sur un super-admin', () => {
  it('disableMember / enableMember / updateMemberRoles refusés (403) pour un acteur non super-admin', async () => {
    scene({ actorAdmin: true, targetGlobal: 'SUPER_ADMIN' });
    await expect(disableMember('target', T, 'actor')).rejects.toMatchObject({ statusCode: 403 });
    scene({ actorAdmin: true, targetGlobal: 'SUPER_ADMIN', status: MembershipStatus.DISABLED });
    await expect(enableMember('target', T, 'actor')).rejects.toMatchObject({ statusCode: 403 });
    scene({ actorAdmin: true, targetGlobal: 'SUPER_ADMIN' });
    await expect(updateMemberRoles('target', T, { roleIds: ['r-agent'] }, 'actor')).rejects.toMatchObject({
      statusCode: 403
    });
    expect(tx.membership.update).not.toHaveBeenCalled();
    expect(tx.userRole.deleteMany).not.toHaveBeenCalled();
  });

  it('un super-admin acteur peut agir sur un super-admin', async () => {
    scene({ actorGlobal: 'SUPER_ADMIN', targetGlobal: 'SUPER_ADMIN' });
    await disableMember('target', T, 'actor');
    expect(tx.membership.update).toHaveBeenCalledTimes(1);
  });
});
