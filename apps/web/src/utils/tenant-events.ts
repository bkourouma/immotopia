/**
 * Évènement DOM émis quand l'API refuse une requête avec
 * `{ code: 'TENANT_SUSPENDED' }` (agence suspendue, réponse 403).
 *
 * `utils/api-client.ts` l'émet depuis son intercepteur de réponse, sur
 * `window`. Un autre composant (le bandeau d'agence suspendue, lot G5) s'y
 * abonne avec `window.addEventListener(TENANT_SUSPENDED_EVENT, ...)` — voir
 * `detail.tenantId`, déduit de l'URL de la requête refusée quand c'est
 * possible (routes `/tenants/:id/...` et `/admin/tenants/:id/...`), sinon de
 * l'en-tête `X-Portal-Tenant-Id` de la requête qui vient d'échouer.
 */
export const TENANT_SUSPENDED_EVENT = 'immotopia:tenant-suspended';

/**
 * Évènement DOM émis après un ajout ou un retrait d'élément d'abonnement
 * (page « Abonnement et factures ») : les droits de l'agence ont pu changer
 * (nouveau module). `hooks/useMenuAccess.ts` relit alors les droits pour que
 * le menu reflète le changement sans recharger la page.
 */
export const ENTITLEMENTS_CHANGED_EVENT = 'immotopia:entitlements-changed';

export interface TenantSuspendedEventDetail {
  tenantId: string | null;
}
