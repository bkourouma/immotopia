/**
 * Agence active mémorisée, pour un utilisateur rattaché à plusieurs agences —
 * collaborateur membre de plusieurs agences, ou client (propriétaire/
 * locataire) de plusieurs agences.
 *
 * Deux lecteurs :
 *  - `AuthContext` l'applique au lieu de « la première agence active » quand
 *    la valeur mémorisée désigne encore une agence à laquelle l'utilisateur
 *    appartient ;
 *  - `utils/api-client.ts` la pose dans l'en-tête `X-Portal-Tenant-Id` des
 *    routes `/portal/...`, pour qu'un client de plusieurs agences soit servi
 *    par la bonne.
 *
 * N'est écrite que par un geste explicite (`<TenantSwitcher>` /
 * `AuthContext.switchTenant`) : un utilisateur d'une seule agence n'a jamais
 * cette clé en stockage, et les lectures ci-dessous restent donc sans effet
 * pour lui.
 */
export const ACTIVE_TENANT_STORAGE_KEY = 'immotopia.activeTenantId';

export function getStoredActiveTenantId(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY);
  } catch {
    // Navigation privée ou stockage refusé : pas de préférence mémorisée,
    // on retombe sur le choix par défaut.
    return null;
  }
}

export function setStoredActiveTenantId(tenantId: string): void {
  try {
    window.localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, tenantId);
  } catch {
    // Sans conséquence fonctionnelle : le choix ne survivra simplement pas
    // à la session.
  }
}
