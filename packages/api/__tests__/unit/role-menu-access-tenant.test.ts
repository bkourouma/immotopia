/**
 * B5 — `GET /api/roles/menu-access/me` : la route n'a pas de
 * `requireTenantAccess` (elle sert aussi un utilisateur plateforme sans
 * agence). Quand un `tenantId` est fourni en query, le handler doit verifier
 * que l'utilisateur y appartient (Membership ACTIVE ou super-admin) avant de
 * lire ses menus coupes pour cette agence — sinon n'importe quel utilisateur
 * authentifie pouvait lire la configuration de menus d'une agence qui n'est
 * pas la sienne en passant `?tenantId=<autre-agence>`.
 */

const userHasTenantAccess = jest.fn();
const getDisabledMenusForUser = jest.fn();
const getMenuPermissionKeysForUser = jest.fn().mockResolvedValue(null);

jest.mock('../../src/utils/tenant-access', () => ({
  userHasTenantAccess: (...a: any[]) => userHasTenantAccess(...a)
}));

jest.mock('../../src/services/role-menu-service', () => ({
  getDisabledMenusForUser: (...a: any[]) => getDisabledMenusForUser(...a),
  getMenuPermissionKeysForUser: (...a: any[]) => getMenuPermissionKeysForUser(...a)
}));

jest.mock('../../src/utils/database', () => ({
  prisma: {}
}));

import { getMyMenuAccessHandler } from '../../src/controllers/role-controller';

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  getMenuPermissionKeysForUser.mockResolvedValue(null);
});

describe('getMyMenuAccessHandler — tenantId de query verifie', () => {
  it("403 quand l'utilisateur n'appartient pas a l'agence demandee en query", async () => {
    userHasTenantAccess.mockResolvedValue(false);

    const req: any = {
      user: { userId: 'user-1', globalRole: 'USER' },
      query: { tenantId: 'tenant-autre-agence' },
      tenantContext: undefined
    };
    const res = mockRes();

    await getMyMenuAccessHandler(req, res);

    expect(userHasTenantAccess).toHaveBeenCalledWith('user-1', 'tenant-autre-agence', 'USER');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(getDisabledMenusForUser).not.toHaveBeenCalled();
  });

  it("200 et lit les menus quand l'utilisateur appartient a l'agence demandee en query", async () => {
    userHasTenantAccess.mockResolvedValue(true);
    getDisabledMenusForUser.mockResolvedValue(['finance']);

    const req: any = {
      user: { userId: 'user-1', globalRole: 'USER' },
      query: { tenantId: 'tenant-A' },
      tenantContext: undefined
    };
    const res = mockRes();

    await getMyMenuAccessHandler(req, res);

    expect(getDisabledMenusForUser).toHaveBeenCalledWith('user-1', 'tenant-A');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("ne casse pas l'appel sans tenantId (utilisateur plateforme)", async () => {
    getDisabledMenusForUser.mockResolvedValue([]);

    const req: any = {
      user: { userId: 'user-1', globalRole: 'SUPER_ADMIN' },
      query: {},
      tenantContext: undefined
    };
    const res = mockRes();

    await getMyMenuAccessHandler(req, res);

    expect(userHasTenantAccess).not.toHaveBeenCalled();
    expect(getDisabledMenusForUser).toHaveBeenCalledWith('user-1', undefined);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('getMyMenuAccessHandler — permissions pour le filtrage du menu', () => {
  it("renvoie les permissions calculees pour l'agence demandee", async () => {
    userHasTenantAccess.mockResolvedValue(true);
    getDisabledMenusForUser.mockResolvedValue([]);
    getMenuPermissionKeysForUser.mockResolvedValue(['PROPERTIES_VIEW']);

    const req: any = { user: { userId: 'u1', globalRole: 'USER' }, query: { tenantId: 'tenant-A' } };
    const res = mockRes();
    await getMyMenuAccessHandler(req, res);

    expect(getMenuPermissionKeysForUser).toHaveBeenCalledWith('u1', 'tenant-A', 'USER');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { disabledMenuKeys: [], permissionKeys: ['PROPERTIES_VIEW'] }
    });
  });
});
