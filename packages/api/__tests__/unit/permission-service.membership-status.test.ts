/**
 * M2 (contre-audit de la PR #205) : les permissions d'AGENCE ne sont accordées
 * qu'à un membre ACTIF de cette agence. Un membre désactivé (ou dont
 * l'invitation est en attente) garde ses lignes user_roles, mais n'en exerce
 * plus aucune permission, même s'il reste client de l'agence. Les permissions
 * de portée plateforme et celles du super-admin ne changent pas.
 */
const prismaMock: any = {
  user: { findUnique: jest.fn() },
  permission: { findMany: jest.fn() },
  membership: { findUnique: jest.fn() },
  userRole: { findMany: jest.fn() }
};
jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));

import { MembershipStatus } from '@prisma/client';
import {
  clearPermissionCache,
  getUserPermissions,
  invalidateAllUserPermissionCache
} from '../../src/services/permission-service';

function tenantRole(key: string, permissions: string[]) {
  return {
    role: { key, scope: 'TENANT', permissions: permissions.map(p => ({ permission: { key: p } })) }
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  clearPermissionCache();
  prismaMock.user.findUnique.mockResolvedValue({ globalRole: 'USER' });
  prismaMock.userRole.findMany.mockResolvedValue([tenantRole('TENANT_ADMIN', ['USERS_EDIT', 'USERS_DISABLE'])]);
});

describe("getUserPermissions : statut de l'appartenance", () => {
  it('membre ACTIF : permissions de ses rôles', async () => {
    prismaMock.membership.findUnique.mockResolvedValue({ status: MembershipStatus.ACTIVE });
    await expect(getUserPermissions('u1', 't1')).resolves.toEqual(['USERS_EDIT', 'USERS_DISABLE']);
    expect(prismaMock.membership.findUnique).toHaveBeenCalledWith({
      where: { userId_tenantId: { userId: 'u1', tenantId: 't1' } },
      select: { status: true }
    });
  });

  it.each([MembershipStatus.DISABLED, MembershipStatus.PENDING_INVITE])(
    'membre %s (même resté client) : aucune permission, rôles non lus',
    async status => {
      prismaMock.membership.findUnique.mockResolvedValue({ status });
      await expect(getUserPermissions('u1', 't1')).resolves.toEqual([]);
      expect(prismaMock.userRole.findMany).not.toHaveBeenCalled();
    }
  );

  it("sans appartenance (client de portail seul) : aucune permission d'agence", async () => {
    prismaMock.membership.findUnique.mockResolvedValue(null);
    await expect(getUserPermissions('u1', 't1')).resolves.toEqual([]);
  });

  it('désactivation puis invalidation du cache : les permissions tombent tout de suite', async () => {
    prismaMock.membership.findUnique.mockResolvedValueOnce({ status: MembershipStatus.ACTIVE });
    await expect(getUserPermissions('u1', 't1')).resolves.toHaveLength(2);
    prismaMock.membership.findUnique.mockResolvedValueOnce({ status: MembershipStatus.DISABLED });
    invalidateAllUserPermissionCache('u1');
    await expect(getUserPermissions('u1', 't1')).resolves.toEqual([]);
  });

  it('portée plateforme (sans agence) : inchangée, pas de lecture d’appartenance', async () => {
    prismaMock.userRole.findMany.mockResolvedValue([
      { role: { key: 'PLATFORM_X', scope: 'PLATFORM', permissions: [{ permission: { key: 'PLATFORM_VIEW' } }] } }
    ]);
    await expect(getUserPermissions('u1')).resolves.toEqual(['PLATFORM_VIEW']);
    expect(prismaMock.membership.findUnique).not.toHaveBeenCalled();
  });

  it('super-admin : toutes les permissions, même sans appartenance', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ globalRole: 'SUPER_ADMIN' });
    prismaMock.permission.findMany.mockResolvedValue([{ key: 'A' }, { key: 'B' }]);
    await expect(getUserPermissions('u1', 't1')).resolves.toEqual(['A', 'B']);
    expect(prismaMock.membership.findUnique).not.toHaveBeenCalled();
  });
});
