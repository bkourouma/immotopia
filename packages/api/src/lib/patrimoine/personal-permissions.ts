import type { prisma } from '../../utils/database';

/**
 * Permissions dediees aux donnees personnelles du patrimoine d'un particulier
 * (decision du 2026-09-29). Aucun role d'agence ne les porte par defaut : elles
 * vivent dans le role TENANT `PERSONAL_SPACE_OWNER`, ajoute EN PLUS de
 * TENANT_ADMIN au proprietaire d'un espace PARTICULIER.
 *
 * Fonctions idempotentes, sans import de la base globale : le seed
 * (`prisma/seeds/patrimoine-personal-permissions-seed.ts`) leur passe son
 * propre client, le service de creation d'espace le client de sa transaction.
 */

export const PATRIMOINE_PERSONAL_VIEW = 'PATRIMOINE_PERSONAL_VIEW';
export const PATRIMOINE_PERSONAL_EDIT = 'PATRIMOINE_PERSONAL_EDIT';
export const PERSONAL_SPACE_OWNER_ROLE_KEY = 'PERSONAL_SPACE_OWNER';

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

/** Cree (ou complete) le role PERSONAL_SPACE_OWNER et ses deux permissions. Retourne l'id du role. */
export async function ensurePersonalSpaceOwnerRole(client: PersonalPermissionsClient): Promise<string> {
  const existing = await client.role.findUnique({
    where: { key: PERSONAL_SPACE_OWNER_ROLE_KEY },
    select: { id: true, permissions: { select: { permission: { select: { key: true } } } } }
  });
  if (existing && PERSONAL_PERMISSIONS.every(p => existing.permissions.some(rp => rp.permission.key === p.key))) {
    return existing.id;
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
  for (const perm of PERSONAL_PERMISSIONS) {
    const permission = await client.permission.upsert({
      where: { key: perm.key },
      update: {},
      create: { key: perm.key, description: perm.description },
      select: { id: true }
    });
    await client.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: {},
      create: { roleId: role.id, permissionId: permission.id }
    });
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
 * Rattrapage : donne le role aux administrateurs (TENANT_ADMIN) de chaque
 * espace PARTICULIER existant. Idempotent ; n'ajoute jamais le role a une agence.
 */
export async function grantPersonalPermissionsToExistingSpaces(
  client: PersonalPermissionsClient
): Promise<{ spaces: number; admins: number }> {
  const roleId = await ensurePersonalSpaceOwnerRole(client);
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
