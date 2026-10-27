/**
 * BUG-2026-09-28-022 — le Comptable (TENANT_ACCOUNTANT) n'avait aucun droit sur
 * la gestion locative : échéances, paiements et pénalités en 403.
 *
 * Décision : il reçoit en LECTURE SEULE les droits locatifs de ses écrans
 * financiers, et aucun droit d'écriture. Le seed RBAC, idempotent (upsert),
 * l'attribue aussi aux agences déjà en base quand il est rejoué
 * (`npm run db:seed:rbac`).
 */

type Row = Record<string, any>;

const store = {
  permissions: [] as Row[],
  roles: [] as Row[],
  rolePermissions: new Set<string>()
};

jest.mock('@prisma/client', () => {
  const uid = (() => {
    let n = 0;
    return () => `id-${++n}`;
  })();

  const matches = (perm: Row, where: Row = {}) => {
    const key = where.key;
    if (!key) return true;
    if (typeof key === 'string') return perm.key === key;
    if (key.startsWith) return perm.key.startsWith(key.startsWith);
    if (key.in) return key.in.includes(perm.key);
    return true;
  };

  class PrismaClient {
    permission = {
      upsert: async ({ where, create }: Row) => {
        let found: Row | undefined = store.permissions.find(p => p.key === where.key);
        if (!found) {
          found = { id: uid(), ...create };
          store.permissions.push(found as Row);
        }
        return found as Row;
      },
      findMany: async (args: Row = {}) => store.permissions.filter(p => matches(p, args.where))
    };
    role = {
      upsert: async ({ where, create }: Row) => {
        let found: Row | undefined = store.roles.find(r => r.key === where.key);
        if (!found) {
          found = { id: uid(), ...create };
          store.roles.push(found as Row);
        }
        return found as Row;
      },
      findUnique: async ({ where }: Row) => store.roles.find(r => r.key === where.key) ?? null
    };
    rolePermission = {
      upsert: async ({ where }: Row) => {
        const { roleId, permissionId } = where.roleId_permissionId;
        store.rolePermissions.add(`${roleId}:${permissionId}`);
        return {};
      }
    };
    $disconnect = async () => undefined;
  }

  return { PrismaClient, RoleScope: { PLATFORM: 'PLATFORM', TENANT: 'TENANT' } };
});

// Ces seeds sont sans rapport avec les droits locatifs du comptable.
jest.mock('../../prisma/seeds/crm-permissions-seed', () => ({ seedCRMPermissions: jest.fn(async () => undefined) }));
jest.mock('../../prisma/seeds/property-permissions-seed', () => ({
  seedPropertyPermissions: jest.fn(async () => undefined)
}));
jest.mock('../../prisma/seeds/maintenance-permissions-seed', () => ({
  seedMaintenancePermissions: jest.fn(async () => undefined)
}));
jest.mock('../../prisma/seeds/communication-permissions-seed', () => ({
  seedCommunicationPermissions: jest.fn(async () => undefined)
}));
jest.mock('../../prisma/seeds/finance-permissions-seed', () => ({
  seedFinancePermissions: jest.fn(async () => undefined)
}));

import { seedRBAC } from '../../prisma/seeds/rbac-seed';

function keysOf(roleKey: string): string[] {
  const role = store.roles.find(r => r.key === roleKey)!;
  return store.permissions
    .filter(p => store.rolePermissions.has(`${role.id}:${p.id}`))
    .map(p => p.key)
    .sort();
}

describe('seed RBAC : droits locatifs du Comptable', () => {
  beforeAll(async () => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await seedRBAC();
    await seedRBAC(); // idempotent : rejouer ne change rien
  });

  it('le comptable lit les baux, échéances, paiements, pénalités et dépôts', () => {
    const comptable = keysOf('TENANT_ACCOUNTANT');

    expect(comptable).toEqual(
      expect.arrayContaining([
        'RENTAL_LEASES_VIEW',
        'RENTAL_INSTALLMENTS_VIEW',
        'RENTAL_PAYMENTS_VIEW',
        'RENTAL_PENALTIES_VIEW',
        'RENTAL_DEPOSITS_VIEW'
      ])
    );
  });

  it("le comptable n'a AUCUN droit locatif d'écriture", () => {
    const ecriture = keysOf('TENANT_ACCOUNTANT').filter(k => k.startsWith('RENTAL_') && !k.endsWith('_VIEW'));

    expect(ecriture).toEqual([]);
  });

  it('les droits de facturation du comptable sont conservés', () => {
    expect(keysOf('TENANT_ACCOUNTANT')).toContain('BILLING_VIEW');
  });

  it("le gestionnaire garde l'ensemble des droits locatifs", () => {
    expect(keysOf('TENANT_MANAGER')).toEqual(
      expect.arrayContaining(['RENTAL_PAYMENTS_CREATE', 'RENTAL_PAYMENTS_ALLOCATE', 'RENTAL_LEASES_EDIT'])
    );
  });
});
