/**
 * Garde-fous de `disableMember` et `updateMemberRoles` : un administrateur ne se
 * désactive pas lui-même, et l'agence ne perd jamais son dernier administrateur
 * actif (désactivation ou retrait du rôle).
 */
const tx: any = {
  membership: { update: jest.fn() },
  refreshToken: { updateMany: jest.fn() },
  userRole: { deleteMany: jest.fn(), createMany: jest.fn() }
};
const prismaMock: any = {
  membership: { findUnique: jest.fn() },
  role: { findMany: jest.fn() },
  userRole: { count: jest.fn() },
  $transaction: jest.fn(async (cb: (client: unknown) => Promise<unknown>) => cb(tx))
};
jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));
jest.mock('../../src/services/audit-service', () => {
  const actual = jest.requireActual('../../src/services/audit-service');
  return { ...actual, logAuditEvent: jest.fn(), recordAuditEvent: jest.fn().mockResolvedValue(undefined) };
});
jest.mock('../../src/services/permission-service', () => ({ invalidateAllUserPermissionCache: jest.fn() }));
jest.mock('../../src/services/email-service', () => ({ emailService: {} }));

import { MembershipStatus } from '@prisma/client';
import { disableMember, updateMemberRoles } from '../../src/services/membership-service';

const TENANT = 't1';

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.membership.findUnique.mockResolvedValue({ id: 'm1', status: MembershipStatus.ACTIVE });
  tx.membership.update.mockResolvedValue({ id: 'm1', status: MembershipStatus.DISABLED });
  tx.refreshToken.updateMany.mockResolvedValue({ count: 0 });
});

/** `count` est appelé d'abord pour « la cible est-elle admin ? », puis pour « combien d'autres admins actifs ? ». */
function adminCounts(targetIsAdmin: number, otherActiveAdmins: number) {
  prismaMock.userRole.count.mockResolvedValueOnce(targetIsAdmin).mockResolvedValueOnce(otherActiveAdmins);
}

describe('disableMember', () => {
  it("refuse l'auto-désactivation sans toucher à la base", async () => {
    await expect(disableMember('u1', TENANT, 'u1')).rejects.toMatchObject({
      statusCode: 409,
      message: 'Vous ne pouvez pas désactiver votre propre compte.'
    });
    expect(prismaMock.membership.findUnique).not.toHaveBeenCalled();
    expect(tx.membership.update).not.toHaveBeenCalled();
  });

  it('refuse la désactivation du dernier administrateur actif', async () => {
    adminCounts(1, 0);
    await expect(disableMember('u2', TENANT, 'u1')).rejects.toMatchObject({
      statusCode: 409,
      message: "Impossible de désactiver le dernier administrateur actif de l'agence."
    });
    expect(tx.membership.update).not.toHaveBeenCalled();
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('désactive un autre collaborateur (non administrateur)', async () => {
    prismaMock.userRole.count.mockResolvedValue(0);
    await disableMember('u2', TENANT, 'u1');
    expect(tx.membership.update).toHaveBeenCalledTimes(1);
  });

  it('désactive un administrateur quand un autre administrateur actif existe', async () => {
    adminCounts(1, 1);
    await disableMember('u2', TENANT, 'u1');
    expect(tx.membership.update).toHaveBeenCalledTimes(1);
    // Le décompte des autres administrateurs exclut la cible et n'admet que des membres actifs.
    expect(prismaMock.userRole.count.mock.calls[1][0].where).toMatchObject({
      tenantId: TENANT,
      userId: { not: 'u2' },
      role: { key: 'TENANT_ADMIN' },
      user: { isActive: true, memberships: { some: { tenantId: TENANT, status: MembershipStatus.ACTIVE } } }
    });
  });
});

describe('updateMemberRoles', () => {
  it("refuse de retirer le rôle d'administrateur au dernier administrateur actif", async () => {
    prismaMock.role.findMany.mockResolvedValue([{ id: 'r-agent', key: 'TENANT_AGENT' }]);
    adminCounts(1, 0);
    await expect(updateMemberRoles('u2', TENANT, { roleIds: ['r-agent'] }, 'u1')).rejects.toMatchObject({
      statusCode: 409
    });
    expect(tx.userRole.deleteMany).not.toHaveBeenCalled();
  });

  it('autorise le retrait quand un autre administrateur actif existe', async () => {
    prismaMock.role.findMany.mockResolvedValue([{ id: 'r-agent', key: 'TENANT_AGENT' }]);
    adminCounts(1, 2);
    await updateMemberRoles('u2', TENANT, { roleIds: ['r-agent'] }, 'u1').catch(() => undefined);
    expect(tx.userRole.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("ne contrôle rien quand le rôle d'administrateur est conservé", async () => {
    prismaMock.role.findMany.mockResolvedValue([{ id: 'r-admin', key: 'TENANT_ADMIN' }]);
    await updateMemberRoles('u2', TENANT, { roleIds: ['r-admin'] }, 'u1').catch(() => undefined);
    expect(prismaMock.userRole.count).not.toHaveBeenCalled();
    expect(tx.userRole.deleteMany).toHaveBeenCalledTimes(1);
  });
});
