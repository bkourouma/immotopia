/**
 * Droit TENANT_NOTIFICATIONS_ADMIN (menu lot 3) : le seed et la migration disent
 * la même chose — administrateur et gestionnaire d'agence, personne d'autre.
 */
import * as fs from 'fs';
import * as path from 'path';
import { NOTIFICATIONS_ALL_KEYS, NOTIFICATIONS_ROLE_GRANTS } from '../../prisma/seeds/notifications-permissions-seed';
import { PermissionKeys } from '../../src/types/rbac-types';

const MIGRATION = path.resolve(
  __dirname,
  '../../prisma/migrations/20261019180000_notifications_messagerie/migration.sql'
);

describe('droit du journal des notifications', () => {
  it('est une permission connue du code', () => {
    expect(PermissionKeys.TENANT_NOTIFICATIONS_ADMIN).toBe('TENANT_NOTIFICATIONS_ADMIN');
    expect(NOTIFICATIONS_ALL_KEYS).toEqual(['TENANT_NOTIFICATIONS_ADMIN']);
  });

  it('le seed : administrateur et gestionnaire d’agence uniquement', () => {
    expect(Object.keys(NOTIFICATIONS_ROLE_GRANTS).sort()).toEqual(['TENANT_ADMIN', 'TENANT_MANAGER']);
    expect(NOTIFICATIONS_ROLE_GRANTS.TENANT_ADMIN).toEqual(NOTIFICATIONS_ALL_KEYS);
    expect(NOTIFICATIONS_ROLE_GRANTS.TENANT_MANAGER).toEqual(NOTIFICATIONS_ALL_KEYS);
  });

  it('la migration attribue exactement les mêmes rôles, de façon idempotente', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    const roles = /r\."key" IN \(([^)]*)\)/
      .exec(sql)?.[1]
      .match(/'([A-Z_]+)'/g)
      ?.map(k => k.replace(/'/g, ''));
    expect((roles ?? []).sort()).toEqual(['TENANT_ADMIN', 'TENANT_MANAGER']);
    expect(sql).toMatch(/'TENANT_NOTIFICATIONS_ADMIN'/);
    expect(sql).toMatch(/ON CONFLICT \("key"\) DO NOTHING/);
    expect(sql).toMatch(/ON CONFLICT \("role_id", "permission_id"\) DO NOTHING/);
    expect(sql).not.toMatch(/TENANT_AGENT|TENANT_ACCOUNTANT/);
  });

  it('la migration crée les tables cloisonnées par agence, en cascade', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    for (const table of [
      'user_notifications',
      'notification_deliveries',
      'conversations',
      'conversation_participants',
      'messages'
    ]) {
      expect(sql).toContain(`CREATE TABLE "${table}"`);
      expect(sql).toMatch(
        new RegExp(`ALTER TABLE "${table}" ADD CONSTRAINT "${table}_tenant_id_fkey"[^;]*ON DELETE CASCADE`)
      );
    }
  });

  it('rbac-seed la crée avant d’attribuer les droits TENANT_* à l’administrateur', () => {
    const seed = fs.readFileSync(path.resolve(__dirname, '../../prisma/seeds/rbac-seed.ts'), 'utf8');
    const created = seed.indexOf('await seedNotificationsPermissions()');
    const assigned = seed.indexOf("startsWith: 'TENANT_'");
    expect(created).toBeGreaterThan(-1);
    expect(assigned).toBeGreaterThan(created);
  });
});
