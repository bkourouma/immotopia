/**
 * Droit TENANT_AUDIT_VIEW (ADR-006, phase 2) : le seed et la migration disent
 * la même chose — administrateur d'agence et super-admin, personne d'autre.
 */
import * as fs from 'fs';
import * as path from 'path';
import { AUDIT_ALL_KEYS, AUDIT_ROLE_GRANTS } from '../../prisma/seeds/audit-permissions-seed';
import { PermissionKeys } from '../../src/types/rbac-types';

const PLATFORM_MIGRATION = path.resolve(
  __dirname,
  '../../prisma/migrations/20261007120000_audit_platform_permissions/migration.sql'
);
const MIGRATION = path.resolve(
  __dirname,
  '../../prisma/migrations/20261007100000_audit_tenant_permission/migration.sql'
);

describe('droits du journal d’audit', () => {
  it('sont des permissions connues du code', () => {
    expect(PermissionKeys.TENANT_AUDIT_VIEW).toBe('TENANT_AUDIT_VIEW');
    expect(PermissionKeys.PLATFORM_AUDIT_VIEW).toBe('PLATFORM_AUDIT_VIEW');
    expect(PermissionKeys.PLATFORM_AUDIT_EXPORT).toBe('PLATFORM_AUDIT_EXPORT');
    expect(AUDIT_ALL_KEYS).toEqual(['TENANT_AUDIT_VIEW', 'PLATFORM_AUDIT_VIEW', 'PLATFORM_AUDIT_EXPORT']);
  });

  it('le seed : super-admin tous les droits, administrateur d’agence le seul droit d’agence', () => {
    expect(Object.keys(AUDIT_ROLE_GRANTS).sort()).toEqual(['PLATFORM_SUPER_ADMIN', 'TENANT_ADMIN']);
    expect(AUDIT_ROLE_GRANTS.PLATFORM_SUPER_ADMIN).toEqual(AUDIT_ALL_KEYS);
    expect(AUDIT_ROLE_GRANTS.TENANT_ADMIN).toEqual(['TENANT_AUDIT_VIEW']);
  });

  it('la migration d’agence attribue exactement les mêmes rôles, de façon idempotente', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    const roles = /r\."key" IN \(([^)]*)\)/
      .exec(sql)?.[1]
      .match(/'([A-Z_]+)'/g)
      ?.map(k => k.replace(/'/g, ''));
    expect((roles ?? []).sort()).toEqual(['PLATFORM_SUPER_ADMIN', 'TENANT_ADMIN']);
    expect(sql).toMatch(/ON CONFLICT \("key"\) DO NOTHING/);
    expect(sql).toMatch(/ON CONFLICT \("role_id", "permission_id"\) DO NOTHING/);
    expect(sql).not.toMatch(/TENANT_MANAGER|TENANT_AGENT|TENANT_ACCOUNTANT/);
  });

  it('la migration plateforme : consultation pour qui avait PLATFORM_TENANTS_VIEW, export pour le super-admin seul', () => {
    const sql = fs.readFileSync(PLATFORM_MIGRATION, 'utf8');
    expect(sql).toMatch(/op\."key" = 'PLATFORM_TENANTS_VIEW'/);
    // L'export n'est attribué qu'à PLATFORM_SUPER_ADMIN.
    const exportBlock = sql.slice(sql.lastIndexOf('p."key" = \'PLATFORM_AUDIT_EXPORT\''));
    expect(exportBlock).toMatch(/r\."key" = 'PLATFORM_SUPER_ADMIN'/);
    expect(sql).toMatch(/ON CONFLICT \("key"\) DO NOTHING/);
    expect(sql).toMatch(/ON CONFLICT \("role_id", "permission_id"\) DO NOTHING/);
  });

  it('rbac-seed les crée avant d’attribuer les droits TENANT_* à l’administrateur', () => {
    const seed = fs.readFileSync(path.resolve(__dirname, '../../prisma/seeds/rbac-seed.ts'), 'utf8');
    const created = seed.indexOf('await seedAuditPermissions()');
    const assigned = seed.indexOf("startsWith: 'TENANT_'");
    expect(created).toBeGreaterThan(-1);
    expect(assigned).toBeGreaterThan(created);
  });
});
