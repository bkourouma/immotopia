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

/**
 * Menus coupés pour la personne connectée.
 *
 * Le serveur renvoie des clés de menu, pas des rôles : la coquille n'a pas à
 * savoir de quels rôles elle hérite pour masquer une entrée. Il renvoie aussi
 * les permissions effectives du compte dans l'agence : les entrées que ces
 * permissions ne permettent pas d'ouvrir (Biens et Patrimoine sans
 * `PROPERTIES_VIEW`) s'ajoutent aux coupures explicites.
 */
export async function getMyDisabledMenus(tenantId?: string | null): Promise<string[]> {
  const response = await apiClient.get('/roles/menu-access/me', {
    params: tenantId ? { tenantId } : {}
  });
  const disabled: string[] = response.data.data?.disabledMenuKeys ?? [];
  const permissions: unknown = response.data.data?.permissions;
  if (!Array.isArray(permissions)) return disabled;
  const denied = menuKeysDeniedByPermissions(
    'collaborateur',
    permissions.filter(p => typeof p === 'string')
  );
  return Array.from(new Set([...disabled, ...denied]));
}
