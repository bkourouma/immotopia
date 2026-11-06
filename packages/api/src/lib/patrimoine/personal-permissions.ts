import type { prisma } from '../../utils/database';

/**
 * Permissions dediees aux donnees personnelles du patrimoine (actifs non
 * immobiliers, dettes, entites detentrices, projections).
 *
 * Elles sont accordees au dirigeant d'agence / operateur / pack Patrimoine
 * (`TENANT_ADMIN`), au proprietaire d'un espace particulier (`PERSONAL_SPACE_OWNER`,
 * ajoute en plus de `TENANT_ADMIN` sur `PARTICULIER`) et au super-administrateur
 * (`PLATFORM_SUPER_ADMIN`). Les autres collaborateurs d'agence (`TENANT_MANAGER`,
 * `TENANT_AGENT`, `TENANT_ACCOUNTANT`, `TENANT_SITE_MANAGER`, `TENANT_STOREKEEPER`)
 * n'en recoivent aucune par defaut.
 *
 * Fonctions idempotentes, sans import de la base globale : le seed
 * (`prisma/seeds/patrimoine-personal-permissions-seed.ts`) leur passe son
 * propre client, le service de creation d'espace le client de sa transaction.
 */

export const PATRIMOINE_PERSONAL_VIEW = 'PATRIMOINE_PERSONAL_VIEW';
export const PATRIMOINE_PERSONAL_EDIT = 'PATRIMOINE_PERSONAL_EDIT';
export const PERSONAL_SPACE_OWNER_ROLE_KEY = 'PERSONAL_SPACE_OWNER';

/** Rôles système porteurs par défaut de PATRIMOINE_PERSONAL_VIEW et PATRIMOINE_PERSONAL_EDIT. */
export const PERSONAL_PERMISSIONS_ROLE_KEYS = [
  PERSONAL_SPACE_OWNER_ROLE_KEY,
  'TENANT_ADMIN',
  'PLATFORM_SUPER_ADMIN'
] as const;

/** Rôles jamais attribuables par une agence (invitation, changement de rôles, catalogue) : réservés au système et au super-admin. */
export const RESERVED_ROLE_KEYS: string[] = [PERSONAL_SPACE_OWNER_ROLE_KEY];

export const PERSONAL_PERMISSIONS = [
  { key: PATRIMOINE_PERSONAL_VIEW, description: 'View personal (non-real-estate) patrimoine data' },
  { key: PATRIMOINE_PERSONAL_EDIT, description: 'Edit personal (non-real-estate) patrimoine data' }
] as const;

export type PersonalPermissionsClient = Pick<
  typeof prisma,
  'permission' | 'role' | 'rolePermission' | 'userRole' | 'tenant'
>;

function hasAllPersonalPermissions(
  role: { permissions?: Array<{ permission: { key: string } }> } | null | undefined
): boolean {
  return Boolean(
    role &&
    Array.isArray(role.permissions) &&
    PERSONAL_PERMISSIONS.every(p => role.permissions!.some(rp => rp.permission.key === p.key))
  );
}

/**
 * Cree (ou complete) le role PERSONAL_SPACE_OWNER et ses deux permissions, et
 * les attache aussi a TENANT_ADMIN et PLATFORM_SUPER_ADMIN s'ils existent.
 * Retourne l'id du role PERSONAL_SPACE_OWNER.
 */
export async function ensurePersonalSpaceOwnerRole(client: PersonalPermissionsClient): Promise<string> {
  const roleSelect = { id: true, permissions: { select: { permission: { select: { key: true } } } } } as const;
  const [existingOwner, existingTenantAdmin, existingSuperAdmin] = await Promise.all([
    client.role.findUnique({ where: { key: PERSONAL_SPACE_OWNER_ROLE_KEY }, select: roleSelect }),
    client.role.findUnique({ where: { key: 'TENANT_ADMIN' }, select: roleSelect }),
    client.role.findUnique({ where: { key: 'PLATFORM_SUPER_ADMIN' }, select: roleSelect })
  ]);

  const ownerReady = hasAllPersonalPermissions(existingOwner);
  const tenantAdminReady = !existingTenantAdmin || hasAllPersonalPermissions(existingTenantAdmin);
  const superAdminReady = !existingSuperAdmin || hasAllPersonalPermissions(existingSuperAdmin);
  if (existingOwner && ownerReady && tenantAdminReady && superAdminReady) {
    return existingOwner.id;
  }

  const role = await client.role.upsert({
    where: { key: PERSONAL_SPACE_OWNER_ROLE_KEY },
    update: {},
    create: {
      key: PERSONAL_SPACE_OWNER_ROLE_KEY,
      name: 'Personal Space Owner',
      description: "Proprietaire d'un espace personnel : donnees personnelles du patrimoine",
      scope: 'TENANT'
    },
    select: { id: true }
  });

  const targetRoleIds = [role.id, existingTenantAdmin?.id, existingSuperAdmin?.id].filter((id): id is string =>
    Boolean(id)
  );

  for (const perm of PERSONAL_PERMISSIONS) {
    const permission = await client.permission.upsert({
      where: { key: perm.key },
      update: {},
      create: { key: perm.key, description: perm.description },
      select: { id: true }
    });
    for (const targetRoleId of targetRoleIds) {
      await client.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: targetRoleId, permissionId: permission.id } },
        update: {},
        create: { roleId: targetRoleId, permissionId: permission.id }
      });
    }
  }
  return role.id;
}

/** Ajoute le role PERSONAL_SPACE_OWNER a `userId` sur `tenantId` (idempotent). */
export async function grantPersonalSpaceOwnerRole(
  client: Pick<typeof prisma, 'userRole'>,
  roleId: string,
  userId: string,
  tenantId: string
): Promise<void> {
  await client.userRole.upsert({
    where: { userId_roleId_tenantId: { userId, roleId, tenantId } },
    update: {},
    create: { userId, roleId, tenantId }
  });
}

/**
 * Rattrapage : s'assure que PERSONAL_SPACE_OWNER et TENANT_ADMIN portent les
 * permissions PATRIMOINE_PERSONAL_*, et donne le role PERSONAL_SPACE_OWNER aux
 * administrateurs (TENANT_ADMIN) de chaque espace PARTICULIER existant.
 * Idempotent ; n'ajoute jamais le role PERSONAL_SPACE_OWNER a une agence.
 */
export async function grantPersonalPermissionsToExistingSpaces(
  client: PersonalPermissionsClient
): Promise<{ spaces: number; admins: number }> {
  const roleId = await ensurePersonalSpaceOwnerRole(client);
  if (!client.tenant?.findMany || !client.userRole?.findMany) {
    return { spaces: 0, admins: 0 };
  }
  const spaces = await client.tenant.findMany({ where: { type: 'PARTICULIER' }, select: { id: true } });
  if (spaces.length === 0) return { spaces: 0, admins: 0 };
  const admins = await client.userRole.findMany({
    where: { tenantId: { in: spaces.map(s => s.id) }, role: { key: 'TENANT_ADMIN' } },
    select: { userId: true, tenantId: true }
  });
  for (const admin of admins) {
    if (admin.tenantId) await grantPersonalSpaceOwnerRole(client, roleId, admin.userId, admin.tenantId);
  }
  return { spaces: spaces.length, admins: admins.length };
}
