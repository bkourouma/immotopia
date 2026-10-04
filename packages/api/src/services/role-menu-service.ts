import { prisma } from '../utils/database';

/**
 * Accès aux menus par rôle.
 *
 * Deux principes tiennent ce service :
 *
 *   1. **Le catalogue n'est pas ici.** L'arbre des menus est décrit une seule
 *      fois, côté interface (`apps/web/src/navigation/menu-catalog.ts`), parce
 *      que c'est lui qui est réellement affiché. Dupliquer cet arbre en base
 *      garantirait qu'un jour les deux divergent. Le serveur ne connaît donc
 *      que des clés de menu opaques.
 *   2. **L'absence d'enregistrement vaut « autorisé ».** Tant qu'un
 *      administrateur n'a rien décidé, le menu reste visible : une table vide
 *      ne doit pas vider l'application de sa navigation.
 *
 * Conséquence directe : seul un `enabled = false` explicite masque un menu.
 */

/** Pseudo-rôle du portail propriétaire (aucune ligne dans `roles`). */
export const PORTAL_OWNER_ROLE_KEY = 'PORTAL_OWNER';
/** Pseudo-rôle du portail locataire (aucune ligne dans `roles`). */
export const PORTAL_RENTER_ROLE_KEY = 'PORTAL_RENTER';

export interface RoleMenuAccessEntry {
  roleKey: string;
  menuKey: string;
  enabled: boolean;
}

/**
 * Périmètre d'une décision : une agence (`tenantId`) ou la plateforme
 * (`null`, rôles de scope PLATFORM). Aucun héritage entre les deux : une
 * ligne `null` ne s'applique jamais à une agence, et inversement.
 */
export type MenuAccessScope = string | null;

/** Décisions enregistrées pour un périmètre, indexées par rôle puis par menu. */
export async function getMenuAccess(tenantId: MenuAccessScope): Promise<Record<string, Record<string, boolean>>> {
  const rows = await prisma.roleMenuAccess.findMany({
    where: { tenantId },
    select: { roleKey: true, menuKey: true, enabled: true }
  });

  const byRole: Record<string, Record<string, boolean>> = {};
  for (const row of rows) {
    if (!byRole[row.roleKey]) byRole[row.roleKey] = {};
    byRole[row.roleKey][row.menuKey] = row.enabled;
  }
  return byRole;
}

/** Décisions enregistrées pour un rôle donné, dans un périmètre. */
export async function getMenuAccessForRole(
  roleKey: string,
  tenantId: MenuAccessScope
): Promise<Record<string, boolean>> {
  const rows = await prisma.roleMenuAccess.findMany({
    where: { roleKey, tenantId },
    select: { menuKey: true, enabled: true }
  });

  return rows.reduce<Record<string, boolean>>((acc, row) => {
    acc[row.menuKey] = row.enabled;
    return acc;
  }, {});
}

/**
 * Remplace l'intégralité des décisions d'un rôle dans UN périmètre.
 *
 * L'appelant envoie la carte complète telle qu'affichée, y compris les `true` :
 * sans cela, réactiver un menu précédemment coupé demanderait de distinguer
 * « remis par défaut » de « explicitement autorisé », distinction sans objet
 * ici. On écrase donc, dans une transaction, plutôt que de fusionner. Seules
 * les lignes de ce périmètre sont effacées : les autres agences ne bougent pas.
 */
export async function replaceMenuAccessForRole(
  roleKey: string,
  menus: Record<string, boolean>,
  tenantId: MenuAccessScope
): Promise<Record<string, boolean>> {
  const entries = Object.entries(menus);

  await prisma.$transaction(async tx => {
    await tx.roleMenuAccess.deleteMany({ where: { roleKey, tenantId } });
    if (entries.length > 0) {
      await tx.roleMenuAccess.createMany({
        data: entries.map(([menuKey, enabled]) => ({
          tenantId,
          roleKey,
          menuKey,
          enabled: Boolean(enabled)
        }))
      });
    }
  });

  return getMenuAccessForRole(roleKey, tenantId);
}

/**
 * Clés de rôle applicables à un utilisateur, dans le contexte d'une agence.
 *
 * Un compte peut cumuler : un rôle plateforme, un ou plusieurs rôles d'agence,
 * et un rattachement client. On renvoie l'union — c'est l'appelant qui décide
 * comment la combiner.
 */
export async function resolveRoleKeysForUser(userId: string, tenantId?: string): Promise<string[]> {
  const keys = new Set<string>();

  const userRoles = await prisma.userRole.findMany({
    where: {
      userId,
      ...(tenantId ? { OR: [{ tenantId }, { tenantId: null }] } : { tenantId: null })
    },
    select: { role: { select: { key: true } } }
  });
  for (const userRole of userRoles) {
    keys.add(userRole.role.key);
  }

  const clients = await prisma.tenantClient.findMany({
    where: { userId, ...(tenantId ? { tenantId } : {}) },
    select: { clientType: true }
  });
  for (const client of clients) {
    if (client.clientType === 'OWNER') keys.add(PORTAL_OWNER_ROLE_KEY);
    if (client.clientType === 'RENTER') keys.add(PORTAL_RENTER_ROLE_KEY);
  }

  return Array.from(keys);
}

/**
 * Menus coupés pour un utilisateur.
 *
 * Un compte qui cumule plusieurs rôles garde le menu dès qu'**un seul** de ses
 * rôles l'autorise : le cumul de rôles élargit les droits, il ne les restreint
 * pas. Un menu n'est donc coupé que si tous ses rôles le coupent.
 *
 * Seules les décisions du périmètre demandé comptent : celles de l'agence, ou
 * celles de la plateforme (`null`) quand aucune agence n'est fournie.
 */
export async function getDisabledMenusForUser(userId: string, tenantId?: string): Promise<string[]> {
  const roleKeys = await resolveRoleKeysForUser(userId, tenantId);
  if (roleKeys.length === 0) return [];

  const rows = await prisma.roleMenuAccess.findMany({
    where: { roleKey: { in: roleKeys }, tenantId: tenantId ?? null },
    select: { menuKey: true, enabled: true }
  });

  const allowedSomewhere = new Set<string>();
  const deniedSomewhere = new Set<string>();
  for (const row of rows) {
    (row.enabled ? allowedSomewhere : deniedSomewhere).add(row.menuKey);
  }

  return Array.from(deniedSomewhere).filter(menuKey => !allowedSomewhere.has(menuKey));
}
