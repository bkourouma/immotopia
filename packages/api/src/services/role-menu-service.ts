import { prisma } from '../utils/database';
import { getUserPermissions } from './permission-service';

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
 * Conséquence directe : seul un `enabled = false` explicite coupe un menu. Un
 * `enabled = true` explicite, lui, dispense le menu du filtre par permission de
 * l'interface (le choix de l'agence prime) ; sans décision, le filtre s'applique.
 *
 * Défaut + surcharge par agence : une décision porte un `tenantId` nullable.
 * `null` sur un rôle d'agence ou de portail = défaut valable pour TOUTES les
 * agences ; `null` sur un rôle PLATFORM = périmètre plateforme ; un `tenantId`
 * = surcharge pour cette agence. Pour chaque (rôle, menu), la ligne de l'agence
 * l'emporte, à défaut la ligne `null`, à défaut rien (= autorisé).
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
 * Périmètre d'une ligne enregistrée : une agence (`tenantId`, surcharge) ou
 * `null` (défaut de toutes les agences pour un rôle d'agence ou de portail,
 * périmètre plateforme pour un rôle PLATFORM). Les fonctions de lecture et
 * d'écriture ci-dessous manipulent les lignes EXACTES d'un périmètre ; la
 * résolution défaut/surcharge n'a lieu que dans `getMenuDecisionsForUser`.
 */
export type MenuAccessScope = string | null;

/**
 * Le modèle est exempté de la garde tenant (`tenantId` nullable par
 * conception) : un `undefined` arrivé par erreur ferait ignorer le filtre par
 * Prisma et toucherait TOUTES les agences. On le refuse donc à l'exécution.
 */
function assertExplicitScope(tenantId: MenuAccessScope | undefined): asserts tenantId is MenuAccessScope {
  if (tenantId === undefined) {
    throw new Error('Périmètre des menus non précisé : passer un tenantId ou null.');
  }
}

/** Décisions enregistrées pour un périmètre, indexées par rôle puis par menu. */
export async function getMenuAccess(tenantId: MenuAccessScope): Promise<Record<string, Record<string, boolean>>> {
  assertExplicitScope(tenantId);
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
  assertExplicitScope(tenantId);
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
  assertExplicitScope(tenantId);
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

/** Décisions de menus d'un utilisateur : coupures et ouvertures explicites. */
export interface MenuDecisionsForUser {
  /** Menus coupés (au moins un rôle les coupe, aucun ne les ouvre). */
  disabledMenuKeys: string[];
  /**
   * Menus ouverts EXPLICITEMENT (ligne `enabled = true` pour au moins un rôle,
   * surcharge d'agence ou défaut commun). L'interface ne leur applique pas le
   * filtre par permission : le choix de l'agence prime sur la permission.
   */
  enabledMenuKeys: string[];
}

/**
 * Décisions de menus pour un utilisateur.
 *
 * Étape 1 : pour chaque rôle, valeur effective par menu. Avec une agence, la
 * ligne de l'agence l'emporte sur la ligne `null` (défaut) ; sans agence, seules
 * les lignes `null` comptent.
 *
 * Étape 2 : un compte qui cumule plusieurs rôles garde le menu dès qu'**un
 * seul** de ses rôles l'autorise : le cumul de rôles élargit les droits, il ne
 * les restreint pas. Un menu n'est donc coupé que si au moins un rôle le coupe
 * (valeur effective) et qu'aucun ne l'autorise. Un menu est « ouvert
 * explicitement » dès qu'un rôle l'autorise (valeur effective `true`).
 */
export async function getMenuDecisionsForUser(userId: string, tenantId?: string): Promise<MenuDecisionsForUser> {
  const roleKeys = await resolveRoleKeysForUser(userId, tenantId);
  if (roleKeys.length === 0) return { disabledMenuKeys: [], enabledMenuKeys: [] };

  const rows = await prisma.roleMenuAccess.findMany({
    where: {
      roleKey: { in: roleKeys },
      ...(tenantId ? { OR: [{ tenantId }, { tenantId: null }] } : { tenantId: null })
    },
    select: { roleKey: true, menuKey: true, enabled: true, tenantId: true }
  });

  // Valeur effective par (rôle, menu) : la ligne d'agence écrase la ligne null.
  const effective = new Map<string, { menuKey: string; enabled: boolean; fromTenant: boolean }>();
  for (const row of rows) {
    const key = `${row.roleKey}|${row.menuKey}`;
    const fromTenant = row.tenantId !== null;
    const current = effective.get(key);
    if (!current || (fromTenant && !current.fromTenant)) {
      effective.set(key, { menuKey: row.menuKey, enabled: row.enabled, fromTenant });
    }
  }

  const allowedSomewhere = new Set<string>();
  const deniedSomewhere = new Set<string>();
  for (const { menuKey, enabled } of effective.values()) {
    (enabled ? allowedSomewhere : deniedSomewhere).add(menuKey);
  }

  return {
    disabledMenuKeys: Array.from(deniedSomewhere).filter(menuKey => !allowedSomewhere.has(menuKey)),
    enabledMenuKeys: Array.from(allowedSomewhere)
  };
}

/** Menus coupés pour un utilisateur (voir `getMenuDecisionsForUser`). */
export async function getDisabledMenusForUser(userId: string, tenantId?: string): Promise<string[]> {
  return (await getMenuDecisionsForUser(userId, tenantId)).disabledMenuKeys;
}

/**
 * Permissions à comparer au catalogue de menus (`requires` côté interface).
 *
 * Renvoie `null` quand la navigation ne doit PAS être filtrée par permission :
 * hors agence, super-administrateur, et administrateur de l'agence (il voit
 * toute l'agence, comme avant). Pour tout autre rôle — y compris un rôle
 * personnalisé — l'interface masque ce que l'API refuserait : on préfère un
 * menu de moins à un bouton qui répond 403.
 */
export async function getMenuPermissionKeysForUser(
  userId: string,
  tenantId: string | undefined,
  globalRole?: string
): Promise<string[] | null> {
  if (!tenantId || globalRole === 'SUPER_ADMIN') return null;

  const roleKeys = await resolveRoleKeysForUser(userId, tenantId);
  if (roleKeys.includes('TENANT_ADMIN') || roleKeys.includes('PLATFORM_SUPER_ADMIN')) return null;

  return getUserPermissions(userId, tenantId);
}
