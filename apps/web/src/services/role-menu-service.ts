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

/** Accès aux menus de la personne connectée, tel que le serveur le calcule. */
export interface MyMenuAccess {
  disabledMenuKeys: string[];
  /**
   * Permissions détenues dans l'agence, ou `null` quand la navigation n'est
   * pas filtrée par permission (administrateur d'agence, super-admin, hors agence).
   */
  permissionKeys: string[] | null;
}

/**
 * Menus coupés et permissions de la personne connectée.
 *
 * Le serveur renvoie des clés de menu et des permissions, pas des rôles : la
 * coquille n'a pas à savoir de quels rôles elle hérite pour masquer une entrée.
 */
export async function getMyMenuAccess(tenantId?: string | null): Promise<MyMenuAccess> {
  const response = await apiClient.get('/roles/menu-access/me', {
    params: tenantId ? { tenantId } : {}
  });
  const data = response.data?.data;
  return {
    disabledMenuKeys: data?.disabledMenuKeys ?? [],
    permissionKeys: Array.isArray(data?.permissionKeys) ? data.permissionKeys : null
  };
}

/** Menus coupés pour la personne connectée. */
export async function getMyDisabledMenus(tenantId?: string | null): Promise<string[]> {
  return (await getMyMenuAccess(tenantId)).disabledMenuKeys;
}
