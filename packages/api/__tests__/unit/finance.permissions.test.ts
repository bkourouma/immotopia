/**
 * Droits du module financier operationnel — lot 1.
 *
 * Couvre :
 *  - le seed cree les six permissions du middleware financier ;
 *  - le seed relance est idempotent (aucun doublon de permission ni de
 *    rattachement role/permission) ;
 *  - chaque role recoit exactement les droits decides dans
 *    `finance-permissions-seed.ts` ;
 *  - un role prive d'un droit se voit refuser l'acces par le garde
 *    correspondant de `finance-rbac-middleware.ts`, et un role qui le
 *    possede passe.
 */

// --- Mock Prisma en memoire, avec upsert idempotent, sur le modele du mock
// de syndics.accounting.test.ts (prisma factice plutot qu'une vraie base).
jest.mock('@prisma/client', () => {
  let permissionSeq = 0;
  let roleSeq = 0;

  const permissionsByKey = new Map<string, { id: string; key: string; description: string }>();
  const rolesByKey = new Map<string, { id: string; key: string }>();
  const rolePermissionLinks = new Set<string>(); // `${roleId}:${permissionId}`

  const prisma = {
    __reset() {
      permissionsByKey.clear();
      rolesByKey.clear();
      rolePermissionLinks.clear();
      permissionSeq = 0;
      roleSeq = 0;
    },
    __seedRole(key: string) {
      roleSeq += 1;
      const role = { id: `role-${roleSeq}`, key };
      rolesByKey.set(key, role);
      return role;
    },
    __linksForRole(roleId: string) {
      return Array.from(rolePermissionLinks).filter(link => link.startsWith(`${roleId}:`));
    },
    permission: {
      upsert: jest.fn(async ({ where, update, create }: any) => {
        const existing = permissionsByKey.get(where.key);
        if (existing) {
          const updated = { ...existing, ...update };
          permissionsByKey.set(where.key, updated);
          return updated;
        }
        permissionSeq += 1;
        const created = { id: `perm-${permissionSeq}`, ...create };
        permissionsByKey.set(create.key, created);
        return created;
      }),
      findMany: jest.fn(async ({ where }: any = {}) => {
        const all = Array.from(permissionsByKey.values());
        if (!where?.key?.in) return all;
        return all.filter(p => where.key.in.includes(p.key));
      }),
      create: jest.fn()
    },
    role: {
      findUnique: jest.fn(async ({ where }: any) => rolesByKey.get(where.key) ?? null)
    },
    rolePermission: {
      upsert: jest.fn(async ({ where, create }: any) => {
        const linkKey = `${where.roleId_permissionId.roleId}:${where.roleId_permissionId.permissionId}`;
        rolePermissionLinks.add(linkKey);
        return { id: linkKey, ...create };
      })
    }
  };

  return {
    PrismaClient: jest.fn(() => prisma),
    __mockPrisma: prisma
  };
});

// --- Mock des services consultes par le garde RBAC generique. On ne teste
// pas ici la logique de `hasPermission` (deja hors perimetre de cet agent) :
// on verifie que le garde du module financier consulte bien la permission
// attendue et se comporte en consequence.
jest.mock('../../src/services/permission-service', () => ({
  hasPermission: jest.fn(),
  hasAnyPermission: jest.fn(),
  hasAllPermissions: jest.fn()
}));

jest.mock('../../src/services/subscription-service', () => ({
  checkSubscriptionAccess: jest.fn(async () => ({ hasAccess: true, isReadOnly: false }))
}));

import { seedFinancePermissions, ALL_KEYS, READ_KEYS } from '../../prisma/seeds/finance-permissions-seed';
import { requireDocumentsCreate } from '../../src/middleware/finance-rbac-middleware';

const { __mockPrisma: mockPrisma } = jest.requireMock('@prisma/client') as { __mockPrisma: any };
const { hasPermission: mockHasPermission } = jest.requireMock('../../src/services/permission-service') as {
  hasPermission: jest.Mock;
};

async function grantedKeysForRole(roleKey: string): Promise<string[]> {
  const role = await mockPrisma.role.findUnique({ where: { key: roleKey } });
  if (!role) return [];
  const links = mockPrisma.__linksForRole(role.id);
  const allPerms = await mockPrisma.permission.findMany();
  return links
    .map((link: string) => link.split(':')[1])
    .map((permId: string) => allPerms.find((p: any) => p.id === permId)?.key)
    .filter(Boolean)
    .sort();
}

describe('Finance permissions seed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.__reset();
    mockPrisma.__seedRole('TENANT_ADMIN');
    mockPrisma.__seedRole('TENANT_MANAGER');
    mockPrisma.__seedRole('TENANT_ACCOUNTANT');
    mockPrisma.__seedRole('TENANT_AGENT');
  });

  it('creates the six permissions declared by the finance middleware', async () => {
    await seedFinancePermissions();

    const created = await mockPrisma.permission.findMany();
    const keys = created.map((p: any) => p.key).sort();

    expect(keys).toEqual(
      [
        'FINANCE_ACCOUNTS_READ',
        'FINANCE_DOCUMENTS_CREATE',
        'FINANCE_DOCUMENTS_VALIDATE',
        'FINANCE_REPORTS_READ',
        'FINANCE_SETTINGS_MANAGE',
        'FINANCE_SITES_MANAGE'
      ].sort()
    );
    expect([...ALL_KEYS].sort()).toEqual(keys);
  });

  it('is idempotent: re-running creates no duplicate permission and no duplicate role link', async () => {
    await seedFinancePermissions();
    const afterFirstRun = await mockPrisma.permission.findMany();
    const adminRole = await mockPrisma.role.findUnique({ where: { key: 'TENANT_ADMIN' } });
    const adminLinksAfterFirstRun = mockPrisma.__linksForRole(adminRole.id);

    await seedFinancePermissions();
    const afterSecondRun = await mockPrisma.permission.findMany();
    const adminLinksAfterSecondRun = mockPrisma.__linksForRole(adminRole.id);

    expect(afterSecondRun).toHaveLength(afterFirstRun.length);
    expect(afterSecondRun).toHaveLength(6);
    expect(adminLinksAfterSecondRun).toHaveLength(adminLinksAfterFirstRun.length);
    expect(adminLinksAfterSecondRun).toHaveLength(6);
    // Jamais de creation directe : seul upsert est utilise, cote permission.
    expect(mockPrisma.permission.create).not.toHaveBeenCalled();
  });

  it('grants TENANT_ADMIN all six finance permissions (validateur cible)', async () => {
    await seedFinancePermissions();
    expect(await grantedKeysForRole('TENANT_ADMIN')).toEqual([...ALL_KEYS].sort());
  });

  it('grants TENANT_ACCOUNTANT read access plus document creation, but not validation', async () => {
    await seedFinancePermissions();
    const granted = await grantedKeysForRole('TENANT_ACCOUNTANT');

    expect(granted).toEqual([...READ_KEYS, 'FINANCE_DOCUMENTS_CREATE'].sort());
    expect(granted).not.toContain('FINANCE_DOCUMENTS_VALIDATE');
    expect(granted).not.toContain('FINANCE_SITES_MANAGE');
    expect(granted).not.toContain('FINANCE_SETTINGS_MANAGE');
  });

  it('grants TENANT_MANAGER read-only finance access', async () => {
    await seedFinancePermissions();
    expect(await grantedKeysForRole('TENANT_MANAGER')).toEqual([...READ_KEYS].sort());
  });

  it('grants TENANT_AGENT no finance permission at all', async () => {
    await seedFinancePermissions();
    expect(await grantedKeysForRole('TENANT_AGENT')).toEqual([]);
  });

  it('does not throw when a target role has not been seeded yet', async () => {
    mockPrisma.__reset(); // aucun role connu cette fois
    await expect(seedFinancePermissions()).resolves.toBeUndefined();
  });
});

describe('Finance RBAC guard enforcement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function buildReqRes(userId: string) {
    const req: any = { user: { userId }, tenantContext: { tenantId: 'tenant-1' } };
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const res: any = { status, json };
    const next = jest.fn();
    return { req, res, status, next };
  }

  it('denies access when the caller lacks FINANCE_DOCUMENTS_CREATE (e.g. TENANT_AGENT, per the seed)', async () => {
    mockHasPermission.mockResolvedValueOnce(false);
    const { req, res, status, next } = buildReqRes('user-agent');

    await requireDocumentsCreate(req, res, next);

    expect(mockHasPermission).toHaveBeenCalledWith('user-agent', 'FINANCE_DOCUMENTS_CREATE', 'tenant-1');
    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows access when the caller holds FINANCE_DOCUMENTS_CREATE (e.g. TENANT_ACCOUNTANT, per the seed)', async () => {
    mockHasPermission.mockResolvedValueOnce(true);
    const { req, res, next } = buildReqRes('user-accountant');

    await requireDocumentsCreate(req, res, next);

    expect(mockHasPermission).toHaveBeenCalledWith('user-accountant', 'FINANCE_DOCUMENTS_CREATE', 'tenant-1');
    expect(next).toHaveBeenCalled();
  });
});
