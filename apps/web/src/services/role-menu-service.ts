import apiClient from '../utils/api-client';

/** Décisions enregistrées, indexées par clé de rôle puis par clé de menu. */
export type MenuAccessMap = Record<string, Record<string, boolean>>;

/**
 * Carte complète des accès aux menus, tous rôles confondus.
 *
 * Un seul appel plutôt qu'un par rôle : l'écran d'administration bascule d'un
 * rôle à l'autre en un clic, et refaire un aller-retour réseau à chaque clic
 * rendrait la comparaison entre deux rôles pénible.
 */
export async function listMenuAccess(): Promise<MenuAccessMap> {
  const response = await apiClient.get('/roles/menu-access');
  return response.data.data ?? {};
}

/** Remplace les menus d'un rôle par la carte fournie. */
export async function updateMenuAccess(
  roleKey: string,
  menus: Record<string, boolean>
): Promise<Record<string, boolean>> {
  const response = await apiClient.put(`/roles/menu-access/${encodeURIComponent(roleKey)}`, { menus });
  return response.data.data ?? {};
}

/**
 * Menus coupés pour la personne connectée.
 *
 * Le serveur renvoie des clés de menu, pas des rôles : la coquille n'a pas à
 * savoir de quels rôles elle hérite pour masquer une entrée.
 */
export async function getMyDisabledMenus(tenantId?: string | null): Promise<string[]> {
  const response = await apiClient.get('/roles/menu-access/me', {
    params: tenantId ? { tenantId } : {}
  });
  return response.data.data?.disabledMenuKeys ?? [];
}
