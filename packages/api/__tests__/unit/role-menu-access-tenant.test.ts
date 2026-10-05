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
const getUserPermissions = jest.fn();

jest.mock('../../src/utils/tenant-access', () => ({
  userHasTenantAccess: (...a: any[]) => userHasTenantAccess(...a)
}));

jest.mock('../../src/services/role-menu-service', () => ({
  getDisabledMenusForUser: (...a: any[]) => getDisabledMenusForUser(...a)
}));

jest.mock('../../src/services/permission-service', () => ({
  getUserPermissions: (...a: any[]) => getUserPermissions(...a)
}));

jest.mock('../../src/utils/database', () => ({
  prisma: {}
}));

import { getMyMenuAccessHandler } from '../../src/controllers/role-controller';

/** Les handlers sont enveloppes par asyncHandler : l'erreur typee part dans next(). */
async function run(handler: any, req: any, res: any): Promise<any> {
  const next = jest.fn();
  await handler(req, res, next);
  return next.mock.calls[0]?.[0];
}

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  getUserPermissions.mockResolvedValue(['PROPERTIES_VIEW']);
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

    const error = await run(getMyMenuAccessHandler, req, res);

    expect(userHasTenantAccess).toHaveBeenCalledWith('user-1', 'tenant-autre-agence', 'USER');
    expect(error).toMatchObject({ name: 'ForbiddenError', statusCode: 403 });
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

    await run(getMyMenuAccessHandler, req, res);

    expect(getDisabledMenusForUser).toHaveBeenCalledWith('user-1', 'tenant-A');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("renvoie les permissions effectives dans l'agence pour masquer les entrées inaccessibles", async () => {
    userHasTenantAccess.mockResolvedValue(true);
    getDisabledMenusForUser.mockResolvedValue([]);
    getUserPermissions.mockResolvedValue(['FINANCE_REPORTS_READ']);

    const req: any = {
      user: { userId: 'user-1', globalRole: 'USER' },
      query: { tenantId: 'tenant-A' },
      tenantContext: undefined
    };
    const res = mockRes();

    await run(getMyMenuAccessHandler, req, res);

    expect(getUserPermissions).toHaveBeenCalledWith('user-1', 'tenant-A');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { disabledMenuKeys: [], permissions: ['FINANCE_REPORTS_READ'] }
    });
  });

  it("ne casse pas l'appel sans tenantId (utilisateur plateforme)", async () => {
    getDisabledMenusForUser.mockResolvedValue([]);

    const req: any = {
      user: { userId: 'user-1', globalRole: 'SUPER_ADMIN' },
      query: {},
      tenantContext: undefined
    };
    const res = mockRes();

    await run(getMyMenuAccessHandler, req, res);

    expect(userHasTenantAccess).not.toHaveBeenCalled();
    expect(getDisabledMenusForUser).toHaveBeenCalledWith('user-1', undefined);
    expect(getUserPermissions).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
