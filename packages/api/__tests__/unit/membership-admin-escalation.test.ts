/**
 * TEN-04 : un gestionnaire (USERS_EDIT) ne peut ni s'attribuer / attribuer le rôle
 * TENANT_ADMIN, ni le retirer, ni désactiver / réactiver / déconnecter un
 * administrateur ; nul ne modifie ses propres rôles ; la révocation de sessions
 * épargne seulement un super-admin (M1 : un compte présent dans d'autres agences
 * est déconnecté quand même) ; un administrateur DÉSACTIVÉ n'exerce plus ses
 * pouvoirs (M2) ; contrôles rejoués sous verrou (F1) ; invitations en attente de
 * l'auteur désactivé annulées (F2).
 */
const tx: any = {
  $executeRaw: jest.fn(),
  membership: { update: jest.fn(), count: jest.fn() },
  invitation: { updateMany: jest.fn() },
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

/**
 * Acteur 'actor', cible 'target' ; `otherAdmins` = autres administrateurs actifs.
 * `actorDisabled` : l'acteur porte TENANT_ADMIN mais son appartenance n'est plus
 * ACTIVE (la requête filtrée sur `user.memberships` ne le compte pas).
 */
function scene(opts: {
  actorAdmin?: boolean;
  actorDisabled?: boolean;
  actorGlobal?: string;
  targetAdmin?: boolean;
  otherAdmins?: number;
  targetGlobal?: string;
  status?: MembershipStatus;
}) {
  const count = async ({ where }: any) => {
    if (typeof where.userId === 'object') return opts.otherAdmins ?? 1;
    if (where.userId === 'actor') {
      if (where.user && opts.actorDisabled) return 0;
      return opts.actorAdmin ? 1 : 0;
    }
    return opts.targetAdmin ? 1 : 0;
  };
  prismaMock.userRole.count.mockImplementation(count);
  tx.userRole.count.mockImplementation(count);
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
  tx.invitation.updateMany.mockResolvedValue({ count: 0 });
  tx.$executeRaw.mockResolvedValue(1);
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

describe('M1 : révocation de sessions toujours faite (sauf super-admin)', () => {
  it('revokeMemberSessions refuse un super-admin cible (403), aucun token touché', async () => {
    scene({ actorAdmin: true, targetGlobal: 'SUPER_ADMIN' });
    await expect(revokeMemberSessions('target', T, 'actor')).rejects.toMatchObject({ statusCode: 403 });
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it("disableMember d'un compte présent dans une autre agence révoque quand même ses refresh tokens", async () => {
    scene({ actorAdmin: true, targetAdmin: false });
    tx.membership.count.mockResolvedValue(1);
    await disableMember('target', T, 'actor');
    expect(tx.membership.update).toHaveBeenCalledTimes(1);
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'target', revoked: false },
      data: { revoked: true, revokedAt: expect.any(Date) }
    });
  });

  it('disableMember : un super-admin désactivé dans une agence garde ses sessions (portée plateforme)', async () => {
    scene({ actorGlobal: 'SUPER_ADMIN', targetGlobal: 'SUPER_ADMIN' });
    await disableMember('target', T, 'actor');
    expect(tx.membership.update).toHaveBeenCalledTimes(1);
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('revokeMemberSessions : compte avec une appartenance « fantôme » ailleurs, sessions révoquées et auditées', async () => {
    scene({ actorAdmin: true, targetAdmin: false });
    // Appartenance et profil client ailleurs : ne protègent plus les sessions.
    tx.membership.count.mockResolvedValue(2);
    tx.tenantClient.count.mockResolvedValue(1);
    const res = await revokeMemberSessions('target', T, 'actor');
    expect(tx.refreshToken.updateMany).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ sessionsRevoked: true, tokensRevoked: 2 });
    const { recordAuditEvent } = require('../../src/services/audit-service');
    expect(recordAuditEvent).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actionKey: 'SESSIONS_REVOKED',
        actorUserId: 'actor',
        tenantId: T,
        entityId: 'target',
        payload: { tokensRevoked: 2 }
      })
    );
  });

  it('compte mono-agence : les sessions sont révoquées', async () => {
    scene({ actorAdmin: true, targetAdmin: false });
    await revokeMemberSessions('target', T, 'actor');
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'target', revoked: false },
      data: { revoked: true, revokedAt: expect.any(Date) }
    });
  });

  it('disableMember écrit aussi la trace SESSIONS_REVOKED', async () => {
    scene({ actorAdmin: true, targetAdmin: false });
    await disableMember('target', T, 'actor');
    const { recordAuditEvent } = require('../../src/services/audit-service');
    const keys = recordAuditEvent.mock.calls.map((call: any[]) => call[1].actionKey);
    expect(keys).toEqual(expect.arrayContaining(['SESSIONS_REVOKED', 'USER_DISABLED']));
  });
});

describe("M2 : un administrateur désactivé n'exerce plus ses pouvoirs", () => {
  it('ne peut pas réactiver un administrateur, lui-même compris (403)', async () => {
    scene({ actorAdmin: true, actorDisabled: true, targetAdmin: true, status: MembershipStatus.DISABLED });
    await expect(enableMember('target', T, 'actor')).rejects.toMatchObject({ statusCode: 403 });
    expect(tx.membership.update).not.toHaveBeenCalled();
  });

  it('ne peut pas rétrograder un administrateur (403)', async () => {
    scene({ actorAdmin: true, actorDisabled: true, targetAdmin: true, otherAdmins: 2 });
    await expect(updateMemberRoles('target', T, { roleIds: ['r-agent'] }, 'actor')).rejects.toMatchObject({
      statusCode: 403
    });
    expect(tx.userRole.deleteMany).not.toHaveBeenCalled();
  });

  it("ne peut pas attribuer TENANT_ADMIN (403) ; le filtre exige une appartenance ACTIVE de l'acteur", async () => {
    scene({ actorAdmin: true, actorDisabled: true });
    prismaMock.role.findMany.mockResolvedValue([ADMIN_ROLE]);
    await expect(updateMemberRoles('target', T, { roleIds: ['r-admin'] }, 'actor')).rejects.toMatchObject({
      statusCode: 403
    });
    expect(prismaMock.userRole.count).toHaveBeenCalledWith({
      where: {
        userId: 'actor',
        tenantId: T,
        role: { key: 'TENANT_ADMIN' },
        user: { isActive: true, memberships: { some: { tenantId: T, status: MembershipStatus.ACTIVE } } }
      }
    });
  });
});

describe("F2 : les invitations en attente de l'auteur désactivé sont annulées", () => {
  it('disableMember révoque les invitations PENDING émises par le membre, dans la transaction', async () => {
    scene({ actorAdmin: true, targetAdmin: false });
    await disableMember('target', T, 'actor');
    expect(tx.invitation.updateMany).toHaveBeenCalledWith({
      where: { tenantId: T, invitedBy: 'target', status: 'PENDING' },
      data: { status: 'REVOKED', revokedAt: expect.any(Date) }
    });
  });
});

describe('F1 : contrôles rejoués sous le verrou des administrateurs', () => {
  it("updateMemberRoles prend le verrou consultatif de l'agence dans la transaction", async () => {
    scene({ actorAdmin: true, targetAdmin: true, otherAdmins: 1 });
    await updateMemberRoles('target', T, { roleIds: ['r-agent'] }, 'actor');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const [, key] = tx.$executeRaw.mock.calls[0];
    expect(key).toBe(`tenant-admins:${T}`);
  });

  it("course : le dernier autre administrateur est rétrogradé entre la lecture et l'écriture -> 409, rien écrit", async () => {
    scene({ actorAdmin: true, targetAdmin: true, otherAdmins: 1 });
    // Sous le verrou, l'autre administrateur a disparu (rétrogradé en parallèle).
    tx.userRole.count.mockImplementation(async ({ where }: any) => (typeof where.userId === 'object' ? 0 : 1));
    await expect(updateMemberRoles('target', T, { roleIds: ['r-agent'] }, 'actor')).rejects.toMatchObject({
      statusCode: 409
    });
    expect(tx.userRole.deleteMany).not.toHaveBeenCalled();
  });

  it("course : la cible est devenue administratrice entre la lecture et l'écriture -> 403 pour un gestionnaire", async () => {
    scene({ actorAdmin: false, targetAdmin: false });
    tx.userRole.count.mockImplementation(async ({ where }: any) => {
      if (typeof where.userId === 'object') return 1;
      return where.userId === 'target' ? 1 : 0;
    });
    await expect(updateMemberRoles('target', T, { roleIds: ['r-agent'] }, 'actor')).rejects.toMatchObject({
      statusCode: 403
    });
    expect(tx.userRole.deleteMany).not.toHaveBeenCalled();
  });

  it('disableMember : le dernier autre administrateur disparaît sous le verrou -> 409, rien écrit', async () => {
    scene({ actorAdmin: true, targetAdmin: true, otherAdmins: 1 });
    tx.userRole.count.mockImplementation(async ({ where }: any) => (typeof where.userId === 'object' ? 0 : 1));
    await expect(disableMember('target', T, 'actor')).rejects.toMatchObject({ statusCode: 409 });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.membership.update).not.toHaveBeenCalled();
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
