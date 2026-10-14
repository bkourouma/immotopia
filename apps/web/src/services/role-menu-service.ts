import apiClient from '../utils/api-client';
import { menuKeysDeniedByPermissions } from '../navigation/menu-catalog';

/** Décisions enregistrées, indexées par clé de rôle puis par clé de menu. */
export type MenuAccessMap = Record<string, Record<string, boolean>>;

/**
 * Carte complète des accès aux menus, tous rôles confondus.
 *
 * Un seul appel plutôt qu'un par rôle : l'écran d'administration bascule d'un
 * rôle à l'autre en un clic, et refaire un aller-retour réseau à chaque clic
 * rendrait la comparaison entre deux rôles pénible.
 */
export async function listMenuAccess(tenantId?: string | null): Promise<MenuAccessMap> {
  const response = await apiClient.get('/roles/menu-access', { params: tenantId ? { tenantId } : {} });
  return response.data.data ?? {};
}

/**
 * Remplace les menus d'un rôle par la carte fournie.
 *
 * Sans `tenantId`, le périmètre est la plateforme (rôles PLATFORM) ; pour un
 * rôle d'agence ou un portail, l'agence est obligatoire.
 */
export async function updateMenuAccess(
  roleKey: string,
  menus: Record<string, boolean>,
  tenantId?: string | null
): Promise<Record<string, boolean>> {
  const response = await apiClient.put(
    `/roles/menu-access/${encodeURIComponent(roleKey)}`,
    { menus },
    { params: tenantId ? { tenantId } : {} }
  );
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
 * Il renvoie aussi les permissions effectives du compte dans l'agence : les
 * entrées que ces permissions ne permettent pas d'ouvrir (Biens et Patrimoine
 * sans `PROPERTIES_VIEW`) s'ajoutent aux coupures explicites.
 */
export async function getMyMenuAccess(tenantId?: string | null): Promise<MyMenuAccess> {
  const response = await apiClient.get('/roles/menu-access/me', {
    params: tenantId ? { tenantId } : {}
  });
  const data = response.data?.data;
  const disabled: string[] = data?.disabledMenuKeys ?? [];
  const permissions: unknown = data?.permissions;
  const denied = Array.isArray(permissions)
    ? menuKeysDeniedByPermissions(
        'collaborateur',
        permissions.filter((p): p is string => typeof p === 'string')
      )
    : [];
  return {
    disabledMenuKeys: Array.from(new Set([...disabled, ...denied])),
    permissionKeys: Array.isArray(data?.permissionKeys) ? data.permissionKeys : null
  };
}

/** Menus coupés pour la personne connectée. */
export async function getMyDisabledMenus(tenantId?: string | null): Promise<string[]> {
  return (await getMyMenuAccess(tenantId)).disabledMenuKeys;
}
