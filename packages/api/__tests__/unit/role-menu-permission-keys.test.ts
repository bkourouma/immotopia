/**
 * `getMenuPermissionKeysForUser` : null (pas de filtrage) pour l'admin d'agence,
 * le super-admin et hors agence ; sinon les permissions reelles de l'utilisateur.
 */
const userRoleFindMany = jest.fn();
const clientFindMany = jest.fn();
const getUserPermissions = jest.fn();

jest.mock('../../src/utils/database', () => ({
  prisma: {
    userRole: { findMany: (...a: any[]) => userRoleFindMany(...a) },
    tenantClient: { findMany: (...a: any[]) => clientFindMany(...a) }
  }
}));
jest.mock('../../src/services/permission-service', () => ({
  getUserPermissions: (...a: any[]) => getUserPermissions(...a)
}));

import { getMenuPermissionKeysForUser } from '../../src/services/role-menu-service';

beforeEach(() => {
  jest.clearAllMocks();
  clientFindMany.mockResolvedValue([]);
});

describe('getMenuPermissionKeysForUser', () => {
  it('null hors agence et pour le super-admin', async () => {
    expect(await getMenuPermissionKeysForUser('u', undefined)).toBeNull();
    expect(await getMenuPermissionKeysForUser('u', 't', 'SUPER_ADMIN')).toBeNull();
    expect(getUserPermissions).not.toHaveBeenCalled();
  });

  it("null pour l'administrateur de l'agence : il voit tout comme avant", async () => {
    userRoleFindMany.mockResolvedValue([{ role: { key: 'TENANT_ADMIN' } }]);
    expect(await getMenuPermissionKeysForUser('u', 't', 'USER')).toBeNull();
  });

  it('un Agent (ou un role personnalise) recoit ses permissions reelles', async () => {
    userRoleFindMany.mockResolvedValue([{ role: { key: 'TENANT_AGENT' } }]);
    getUserPermissions.mockResolvedValue(['PROPERTIES_VIEW']);
    expect(await getMenuPermissionKeysForUser('u', 't', 'USER')).toEqual(['PROPERTIES_VIEW']);
    expect(getUserPermissions).toHaveBeenCalledWith('u', 't');
  });
});
