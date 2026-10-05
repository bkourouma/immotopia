/**
 * Accès aux menus par agence.
 *
 * Défaut + surcharge : `tenantId` null sur un rôle d'agence ou de portail est le
 * défaut de toutes les agences (null sur un rôle PLATFORM = plateforme) ; une
 * ligne d'agence est une surcharge qui n'atteint jamais une autre agence. Par
 * (rôle, menu) : agence > null > rien (autorisé).
 *
 * Prisma est remplacé par un magasin en mémoire qui applique réellement les
 * filtres `where` utilisés par le service, pour prouver l'étanchéité.
 */

type Row = { tenantId: string | null; roleKey: string; menuKey: string; enabled: boolean };

let store: Row[] = [];
const roles: Record<string, { scope: 'PLATFORM' | 'TENANT' }> = {
  TENANT_ADMIN: { scope: 'TENANT' },
  AGENT: { scope: 'TENANT' },
  SUPER_ADMIN: { scope: 'PLATFORM' }
};
const tenants = new Set(['tenant-A', 'tenant-B']);
let userRoleKeys: string[] = [];

function matches(row: Row, where: any): boolean {
  if (!where) return true;
  if ('tenantId' in where && row.tenantId !== where.tenantId) return false;
  if (where.OR && !where.OR.some((c: any) => row.tenantId === c.tenantId)) return false;
  if (where.roleKey !== undefined) {
    if (typeof where.roleKey === 'string' && row.roleKey !== where.roleKey) return false;
    if (where.roleKey?.in && !where.roleKey.in.includes(row.roleKey)) return false;
  }
  return true;
}

const roleMenuAccess = {
  findMany: jest.fn(async ({ where }: any) => store.filter(r => matches(r, where)).map(r => ({ ...r }))),
  deleteMany: jest.fn(async ({ where }: any) => {
    store = store.filter(r => !matches(r, where));
  }),
  createMany: jest.fn(async ({ data }: any) => {
    store.push(...data.map((d: Row) => ({ ...d })));
  })
};

const prismaMock: any = {
  roleMenuAccess,
  $transaction: jest.fn(async (fn: any) => fn(prismaMock)),
  userRole: {
    findMany: jest.fn(async () => userRoleKeys.map(key => ({ role: { key } })))
  },
  tenantClient: { findMany: jest.fn(async () => []) },
  role: {
    findUnique: jest.fn(async ({ where }: any) => roles[where.key] ?? null)
  },
  tenant: {
    findUnique: jest.fn(async ({ where }: any) => (tenants.has(where.id) ? { id: where.id } : null))
  }
};

jest.mock('../../src/utils/database', () => ({ prisma: prismaMock }));
jest.mock('../../src/utils/tenant-access', () => ({ userHasTenantAccess: jest.fn().mockResolvedValue(true) }));
jest.mock('../../src/services/permission-service', () => ({ getUserPermissions: jest.fn().mockResolvedValue([]) }));

import { getDisabledMenusForUser, getMenuAccess, replaceMenuAccessForRole } from '../../src/services/role-menu-service';
import {
  getMyMenuAccessHandler,
  listMenuAccessHandler,
  updateMenuAccessHandler
} from '../../src/controllers/role-controller';

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

async function run(handler: any, req: any) {
  const res = mockRes();
  const next = jest.fn();
  await handler(req, res, next);
  return { res, error: next.mock.calls[0]?.[0] };
}

beforeEach(() => {
  jest.clearAllMocks();
  store = [];
  userRoleKeys = [];
});

describe('service — périmètre par agence', () => {
  it("une coupure de l'agence A n'affecte pas l'agence B", async () => {
    await replaceMenuAccessForRole('TENANT_ADMIN', { finance: false, crm: true }, 'tenant-A');

    userRoleKeys = ['TENANT_ADMIN'];
    expect(await getDisabledMenusForUser('u1', 'tenant-A')).toEqual(['finance']);
    expect(await getDisabledMenusForUser('u1', 'tenant-B')).toEqual([]);
    expect(await getMenuAccess('tenant-B')).toEqual({});
  });

  it('sans agence, getDisabledMenusForUser ne lit que le périmètre null', async () => {
    store = [
      { tenantId: 'tenant-A', roleKey: 'SUPER_ADMIN', menuKey: 'finance', enabled: false },
      { tenantId: null, roleKey: 'SUPER_ADMIN', menuKey: 'plateforme', enabled: false }
    ];
    userRoleKeys = ['SUPER_ADMIN'];

    expect(await getDisabledMenusForUser('u1')).toEqual(['plateforme']);
    expect(roleMenuAccess.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: null }) })
    );
  });

  it("défaut (ligne null) appliqué à une agence qui n'a pas de ligne propre", async () => {
    store = [{ tenantId: null, roleKey: 'TENANT_ADMIN', menuKey: 'finance', enabled: false }];
    userRoleKeys = ['TENANT_ADMIN'];

    expect(await getDisabledMenusForUser('u1', 'tenant-A')).toEqual(['finance']);
    expect(await getDisabledMenusForUser('u1', 'tenant-B')).toEqual(['finance']);
  });

  it("la ligne d'agence lève une coupure du défaut", async () => {
    store = [
      { tenantId: null, roleKey: 'TENANT_ADMIN', menuKey: 'finance', enabled: false },
      { tenantId: 'tenant-A', roleKey: 'TENANT_ADMIN', menuKey: 'finance', enabled: true }
    ];
    userRoleKeys = ['TENANT_ADMIN'];

    expect(await getDisabledMenusForUser('u1', 'tenant-A')).toEqual([]);
    expect(await getDisabledMenusForUser('u1', 'tenant-B')).toEqual(['finance']);
  });

  it("la ligne d'agence ajoute une coupure absente du défaut", async () => {
    store = [
      { tenantId: null, roleKey: 'TENANT_ADMIN', menuKey: 'finance', enabled: true },
      { tenantId: 'tenant-A', roleKey: 'TENANT_ADMIN', menuKey: 'finance', enabled: false },
      { tenantId: 'tenant-A', roleKey: 'TENANT_ADMIN', menuKey: 'crm', enabled: false }
    ];
    userRoleKeys = ['TENANT_ADMIN'];

    expect((await getDisabledMenusForUser('u1', 'tenant-A')).sort()).toEqual(['crm', 'finance']);
    expect(await getDisabledMenusForUser('u1', 'tenant-B')).toEqual([]);
  });

  it('une surcharge de A est sans effet sur B, qui garde le défaut', async () => {
    store = [{ tenantId: null, roleKey: 'TENANT_ADMIN', menuKey: 'finance', enabled: false }];
    await replaceMenuAccessForRole('TENANT_ADMIN', { finance: true, crm: false }, 'tenant-A');
    userRoleKeys = ['TENANT_ADMIN'];

    expect(await getDisabledMenusForUser('u1', 'tenant-A')).toEqual(['crm']);
    expect(await getDisabledMenusForUser('u1', 'tenant-B')).toEqual(['finance']);
  });

  it("replace d'agence avec {} efface la surcharge : retour au défaut", async () => {
    store = [{ tenantId: null, roleKey: 'TENANT_ADMIN', menuKey: 'finance', enabled: false }];
    await replaceMenuAccessForRole('TENANT_ADMIN', { finance: true }, 'tenant-A');
    userRoleKeys = ['TENANT_ADMIN'];
    expect(await getDisabledMenusForUser('u1', 'tenant-A')).toEqual([]);

    const result = await replaceMenuAccessForRole('TENANT_ADMIN', {}, 'tenant-A');

    expect(result).toEqual({});
    expect(await getDisabledMenusForUser('u1', 'tenant-A')).toEqual(['finance']);
    expect(store).toEqual([{ tenantId: null, roleKey: 'TENANT_ADMIN', menuKey: 'finance', enabled: false }]);
  });

  it('cumul de rôles : valeurs effectives (agence > défaut) puis un rôle qui autorise suffit', async () => {
    store = [
      // TENANT_ADMIN : le défaut coupe finance et crm ; l'agence A rouvre crm.
      { tenantId: null, roleKey: 'TENANT_ADMIN', menuKey: 'finance', enabled: false },
      { tenantId: null, roleKey: 'TENANT_ADMIN', menuKey: 'crm', enabled: false },
      { tenantId: 'tenant-A', roleKey: 'TENANT_ADMIN', menuKey: 'crm', enabled: true },
      // AGENT : le défaut autorise finance, l'agence A le coupe ; stock coupé par défaut.
      { tenantId: null, roleKey: 'AGENT', menuKey: 'finance', enabled: true },
      { tenantId: 'tenant-A', roleKey: 'AGENT', menuKey: 'finance', enabled: false },
      { tenantId: null, roleKey: 'AGENT', menuKey: 'stock', enabled: false }
    ];
    userRoleKeys = ['TENANT_ADMIN', 'AGENT'];

    // Chez A : finance coupé par les deux, crm autorisé, stock coupé.
    expect((await getDisabledMenusForUser('u1', 'tenant-A')).sort()).toEqual(['finance', 'stock']);
    // Chez B (défauts seuls) : finance autorisé par AGENT, crm et stock coupés.
    expect((await getDisabledMenusForUser('u1', 'tenant-B')).sort()).toEqual(['crm', 'stock']);
  });

  it('un menu reste visible si un autre rôle de la personne le garde (règle inchangée)', async () => {
    store = [
      { tenantId: 'tenant-A', roleKey: 'TENANT_ADMIN', menuKey: 'finance', enabled: false },
      { tenantId: 'tenant-A', roleKey: 'AGENT', menuKey: 'finance', enabled: true }
    ];
    userRoleKeys = ['TENANT_ADMIN', 'AGENT'];

    expect(await getDisabledMenusForUser('u1', 'tenant-A')).toEqual([]);
  });

  it("replace n'efface que le périmètre visé", async () => {
    store = [
      { tenantId: 'tenant-A', roleKey: 'TENANT_ADMIN', menuKey: 'finance', enabled: false },
      { tenantId: 'tenant-B', roleKey: 'TENANT_ADMIN', menuKey: 'finance', enabled: false },
      { tenantId: 'tenant-A', roleKey: 'AGENT', menuKey: 'finance', enabled: false },
      { tenantId: null, roleKey: 'TENANT_ADMIN', menuKey: 'finance', enabled: false }
    ];

    const result = await replaceMenuAccessForRole('TENANT_ADMIN', { finance: true }, 'tenant-A');

    expect(result).toEqual({ finance: true });
    expect(roleMenuAccess.deleteMany).toHaveBeenCalledWith({
      where: { roleKey: 'TENANT_ADMIN', tenantId: 'tenant-A' }
    });
    expect(store).toContainEqual({ tenantId: 'tenant-B', roleKey: 'TENANT_ADMIN', menuKey: 'finance', enabled: false });
    expect(store).toContainEqual({ tenantId: 'tenant-A', roleKey: 'AGENT', menuKey: 'finance', enabled: false });
    expect(store).toContainEqual({ tenantId: null, roleKey: 'TENANT_ADMIN', menuKey: 'finance', enabled: false });
  });

  it('replace écrit le tenantId sur chaque ligne créée', async () => {
    await replaceMenuAccessForRole('SUPER_ADMIN', { plateforme: false }, null);
    expect(store).toEqual([{ tenantId: null, roleKey: 'SUPER_ADMIN', menuKey: 'plateforme', enabled: false }]);
  });

  it('un périmètre undefined est refusé : jamais de requête sur toutes les agences', async () => {
    store = [{ tenantId: 'tenant-B', roleKey: 'TENANT_ADMIN', menuKey: 'finance', enabled: false }];
    await expect(replaceMenuAccessForRole('TENANT_ADMIN', {}, undefined as any)).rejects.toThrow();
    await expect(getMenuAccess(undefined as any)).rejects.toThrow();
    expect(store).toHaveLength(1);
  });
});

describe('GET /api/roles/menu-access', () => {
  it('sans tenantId : périmètre plateforme (null)', async () => {
    store = [
      { tenantId: null, roleKey: 'SUPER_ADMIN', menuKey: 'a', enabled: false },
      { tenantId: 'tenant-A', roleKey: 'TENANT_ADMIN', menuKey: 'b', enabled: false }
    ];
    const { res, error } = await run(listMenuAccessHandler, { query: {} });

    expect(error).toBeUndefined();
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { SUPER_ADMIN: { a: false } } });
  });

  it("avec tenantId : ne renvoie que l'agence demandée", async () => {
    store = [
      { tenantId: 'tenant-A', roleKey: 'TENANT_ADMIN', menuKey: 'b', enabled: false },
      { tenantId: 'tenant-B', roleKey: 'TENANT_ADMIN', menuKey: 'c', enabled: false }
    ];
    const { res } = await run(listMenuAccessHandler, { query: { tenantId: 'tenant-A' } });

    expect(res.json).toHaveBeenCalledWith({ success: true, data: { TENANT_ADMIN: { b: false } } });
  });

  it('agence inexistante : NotFoundError', async () => {
    const { error } = await run(listMenuAccessHandler, { query: { tenantId: 'inconnue' } });
    expect(error).toMatchObject({ name: 'NotFoundError', statusCode: 404 });
  });
});

describe('PUT /api/roles/menu-access/:roleKey', () => {
  const put = (roleKey: string, query: any, menus: any = { finance: false }) =>
    run(updateMenuAccessHandler, { params: { roleKey }, query, body: { menus } });

  it('rôle TENANT sans tenantId : 200, écrit le défaut (null)', async () => {
    const { res, error } = await put('TENANT_ADMIN', {});
    expect(error).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(store).toEqual([{ tenantId: null, roleKey: 'TENANT_ADMIN', menuKey: 'finance', enabled: false }]);
  });

  it('pseudo-rôle de portail sans tenantId : 200, écrit le défaut (null)', async () => {
    const { error } = await put('PORTAL_OWNER', {});
    expect(error).toBeUndefined();
    expect(store).toEqual([{ tenantId: null, roleKey: 'PORTAL_OWNER', menuKey: 'finance', enabled: false }]);
  });

  it('rôle PLATFORM avec tenantId : 400', async () => {
    const { error } = await put('SUPER_ADMIN', { tenantId: 'tenant-A' });
    expect(error).toMatchObject({ statusCode: 400 });
    expect(store).toEqual([]);
  });

  it('rôle inconnu : NotFoundError', async () => {
    const { error } = await put('FANTOME', { tenantId: 'tenant-A' });
    expect(error).toMatchObject({ name: 'NotFoundError', statusCode: 404 });
  });

  it('agence inexistante : NotFoundError', async () => {
    const { error } = await put('TENANT_ADMIN', { tenantId: 'inconnue' });
    expect(error).toMatchObject({ name: 'NotFoundError', statusCode: 404 });
    expect(store).toEqual([]);
  });

  it('carte de menus trop longue : 400', async () => {
    const menus = Object.fromEntries(Array.from({ length: 501 }, (_, i) => [`menu-${i}`, false]));
    const { error } = await put('TENANT_ADMIN', { tenantId: 'tenant-A' }, menus);
    expect(error).toMatchObject({ statusCode: 400 });
    expect(store).toEqual([]);
  });

  it('corps invalide : 400', async () => {
    const { error } = await put('TENANT_ADMIN', { tenantId: 'tenant-A' }, { finance: 'non' });
    expect(error).toMatchObject({ statusCode: 400 });
  });

  it('rôle TENANT avec agence : écrit pour cette agence seulement', async () => {
    store = [{ tenantId: 'tenant-B', roleKey: 'TENANT_ADMIN', menuKey: 'finance', enabled: false }];
    const { res, error } = await put('TENANT_ADMIN', { tenantId: 'tenant-A' });

    expect(error).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: { finance: false } }));
    expect(store).toHaveLength(2);
    expect(store).toContainEqual({ tenantId: 'tenant-A', roleKey: 'TENANT_ADMIN', menuKey: 'finance', enabled: false });
  });

  it('pseudo-rôle de portail avec agence : accepté', async () => {
    const { error } = await put('PORTAL_RENTER', { tenantId: 'tenant-A' });
    expect(error).toBeUndefined();
    expect(store).toEqual([{ tenantId: 'tenant-A', roleKey: 'PORTAL_RENTER', menuKey: 'finance', enabled: false }]);
  });

  it('rôle PLATFORM sans tenantId : écrit au périmètre null', async () => {
    const { error } = await put('SUPER_ADMIN', {});
    expect(error).toBeUndefined();
    expect(store).toEqual([{ tenantId: null, roleKey: 'SUPER_ADMIN', menuKey: 'finance', enabled: false }]);
  });
});

describe('GET /api/roles/menu-access/me', () => {
  it("n'applique que les coupures de l'agence demandée", async () => {
    store = [
      { tenantId: 'tenant-A', roleKey: 'TENANT_ADMIN', menuKey: 'finance', enabled: false },
      { tenantId: 'tenant-B', roleKey: 'TENANT_ADMIN', menuKey: 'crm', enabled: false }
    ];
    userRoleKeys = ['TENANT_ADMIN'];

    const { res } = await run(getMyMenuAccessHandler, {
      user: { userId: 'u1', globalRole: 'USER' },
      query: { tenantId: 'tenant-B' }
    });

    expect(res.json).toHaveBeenCalledWith({ success: true, data: { disabledMenuKeys: ['crm'], permissions: [] } });
  });

  it('sans agence : ne lit que le périmètre null', async () => {
    store = [{ tenantId: 'tenant-A', roleKey: 'SUPER_ADMIN', menuKey: 'finance', enabled: false }];
    userRoleKeys = ['SUPER_ADMIN'];

    const { res } = await run(getMyMenuAccessHandler, {
      user: { userId: 'u1', globalRole: 'SUPER_ADMIN' },
      query: {}
    });

    expect(res.json).toHaveBeenCalledWith({ success: true, data: { disabledMenuKeys: [] } });
  });

  it('401 sans utilisateur', async () => {
    const { error } = await run(getMyMenuAccessHandler, { query: {} });
    expect(error).toMatchObject({ name: 'UnauthorizedError', statusCode: 401 });
  });
});
