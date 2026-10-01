/**
 * Droit TENANT_AUDIT_VIEW (ADR-006, phase 2) : le seed et la migration disent
 * la même chose — administrateur d'agence et super-admin, personne d'autre.
 */
import * as fs from 'fs';
import * as path from 'path';
import { AUDIT_ALL_KEYS, AUDIT_ROLE_GRANTS } from '../../prisma/seeds/audit-permissions-seed';
import { PermissionKeys } from '../../src/types/rbac-types';

const MIGRATION = path.resolve(
  __dirname,
  '../../prisma/migrations/20261007100000_audit_tenant_permission/migration.sql'
);

describe('droit TENANT_AUDIT_VIEW', () => {
  it('est une permission connue du code', () => {
    expect(PermissionKeys.TENANT_AUDIT_VIEW).toBe('TENANT_AUDIT_VIEW');
    expect(AUDIT_ALL_KEYS).toEqual(['TENANT_AUDIT_VIEW']);
  });

  it('le seed ne l’attribue qu’à l’administrateur d’agence et au super-admin', () => {
    expect(Object.keys(AUDIT_ROLE_GRANTS).sort()).toEqual(['PLATFORM_SUPER_ADMIN', 'TENANT_ADMIN']);
    for (const keys of Object.values(AUDIT_ROLE_GRANTS)) expect(keys).toEqual(AUDIT_ALL_KEYS);
  });

  it('la migration attribue exactement les mêmes rôles, de façon idempotente', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    const roles = /r\."key" IN \(([^)]*)\)/
      .exec(sql)?.[1]
      .match(/'([A-Z_]+)'/g)
      ?.map(k => k.replace(/'/g, ''));
    expect((roles ?? []).sort()).toEqual(Object.keys(AUDIT_ROLE_GRANTS).sort());
    expect(sql).toMatch(/ON CONFLICT \("key"\) DO NOTHING/);
    expect(sql).toMatch(/ON CONFLICT \("role_id", "permission_id"\) DO NOTHING/);
    expect(sql).not.toMatch(/TENANT_MANAGER|TENANT_AGENT|TENANT_ACCOUNTANT/);
  });

  it('rbac-seed la crée avant d’attribuer les droits TENANT_* à l’administrateur', () => {
    const seed = fs.readFileSync(path.resolve(__dirname, '../../prisma/seeds/rbac-seed.ts'), 'utf8');
    const created = seed.indexOf('await seedAuditPermissions()');
    const assigned = seed.indexOf("startsWith: 'TENANT_'");
    expect(created).toBeGreaterThan(-1);
    expect(assigned).toBeGreaterThan(created);
  });
});
