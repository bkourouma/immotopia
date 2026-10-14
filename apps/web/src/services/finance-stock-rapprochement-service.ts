/**
 * Frontière réseau du module financier — lot 5, quatrième sous-lot : la
 * bascule d'un chantier au stock et le rapprochement acheté / consommé /
 * restant.
 *
 * Contrat gelé : les écrans appellent ces trois fonctions et rien d'autre.
 * Aucun écran ne construit d'URL ni n'appelle `apiClient` directement.
 *
 * Fichier séparé des services des sous-lots précédents, tous gelés. `base()`
 * est recopiée plutôt qu'importée, pour la même raison qu'aux sous-lots
 * précédents : la frontière de ce sous-lot doit pouvoir évoluer sans dépendre
 * du détail d'implémentation d'un autre.
 *
 * Routes : `packages/api/src/routes/finance-stock-rapprochement-routes.ts`.
 * Contrat : `packages/api/src/lib/finance/types-lot5-rapprochement.ts`, et son
 * dérivé web `types/finance-stock-rapprochement-types.ts`.
 *
 * ---------------------------------------------------------------------------
 * Le corps de la bascule est VIDE, et ce n'est pas une économie
 * ---------------------------------------------------------------------------
 *
 * `POST .../stock/enable` part avec `{}`. Le schéma Zod du serveur
 * (`schemas-stock-rapprochement.ts`) est `z.object({}).strict()` : un corps
 * portant `enabledAt` reçoit un **400**, et c'est délibéré. Accepter une date
 * choisie par l'appelant laisserait antidater la bascule, c'est-à-dire
 * reclasser après coup des factures déjà imputées — exactement ce que le
 * contrat interdit quand il refuse de redater un chantier déjà basculé. La
 * date est celle de l'instant de la décision, et elle vient du serveur.
 *
 * `siteId` et `tenantId` voyagent dans le CHEMIN, jamais dans le corps : c'est
 * le défaut qui cassait quatre créations des lots 2 et 3, épinglé par
 * `__tests__/finance/corps-des-requetes.test.ts`, auquel ce sous-lot ajoute sa
 * bascule.
 *
 * ---------------------------------------------------------------------------
 * Aucune fonction de retour en arrière, et ce n'est pas un oubli
 * ---------------------------------------------------------------------------
 *
 * Il n'y a ici ni `disableSiteStock`, ni variante d'administrateur, ni
 * raccourci « pour les tests » : **aucune route serveur ne revient en
 * arrière**. En écrire une ici produirait un 404 et laisserait croire que le
 * geste existe.
 *
 * ---------------------------------------------------------------------------
 * Aucun filtre sur les deux lectures
 * ---------------------------------------------------------------------------
 *
 * `siteStockQuerySchema` est lui aussi vide et strict : pas de borne de
 * période saisie de l'extérieur. Regarder un écart sur une fenêtre choisie
 * après coup est une autre question que celle du besoin S7. Les deux lectures
 * partent donc sans aucun paramètre de requête.
 */

import apiClient from '../utils/api-client';
import type { SiteStockReconciliation, SiteStockStatus } from '../types/finance-stock-rapprochement-types';
import type { StockMeta, StockRead } from '../types/finance-stock-controle-types';

type ApiResponse<T> = { success: boolean; data: T };

function base(tenantId: string): string {
  return `/tenants/${tenantId}/finance`;
}

/**
 * Route A. **Fait passer le chantier au stock. IRRÉVERSIBLE.**
 *
 * Le corps est VIDE, et il doit le rester — voir l'en-tête. Rien n'est à
 * envoyer : ni la date (elle vient du serveur), ni l'auteur (il vient du
 * jeton), ni le chantier (il est dans le chemin).
 *
 * Le serveur refuse un chantier déjà basculé et un chantier clos ; son message
 * dit exactement ce qui s'est passé, et l'écran le relaie tel quel.
 */
export async function enableSiteStock(tenantId: string, siteId: string): Promise<SiteStockStatus> {
  const response = await apiClient.post<ApiResponse<SiteStockStatus>>(
    `${base(tenantId)}/sites/${siteId}/stock/enable`,
    {}
  );
  return response.data.data;
}

/** Route B. Où en est le chantier : basculé ou non, et où atterrissent ses réceptions. */
export async function getSiteStockStatus(tenantId: string, siteId: string): Promise<SiteStockStatus> {
  const response = await apiClient.get<ApiResponse<SiteStockStatus>>(`${base(tenantId)}/sites/${siteId}/stock/status`);
  return response.data.data;
}

/**
 * Route C. Le rapprochement acheté / consommé / restant (besoin S7).
 *
 * Répond aussi pour un chantier qui n'a PAS basculé : seuls le facturé et
 * l'écart y valent zéro, le consommé, le reçu et le restant disent la vérité.
 * L'écran n'a donc pas à savoir d'avance ce qu'il vient demander.
 */
export async function getSiteStockReconciliation(tenantId: string, siteId: string): Promise<SiteStockReconciliation> {
  const response = await apiClient.get<ApiResponse<SiteStockReconciliation>>(
    `${base(tenantId)}/sites/${siteId}/stock/reconciliation`
  );
  return response.data.data;
}

/**
 * Lot 040 : le même rapprochement, lu avec son `meta` (spec §8.2). Pendant un
 * comptage du lieu du chantier, `remainingQuantity` et `remainingValue` valent
 * `null` pour un appelant sans STOCK_COUNT_VALIDATE, et `meta.blindLocationIds`
 * le dit. `getSiteStockReconciliation` reste inchangée pour ses lecteurs.
 */
export async function getSiteStockReconciliationWithMeta(
  tenantId: string,
  siteId: string
): Promise<StockRead<SiteStockReconciliation>> {
  const response = await apiClient.get<{ success: boolean; data: SiteStockReconciliation; meta?: StockMeta }>(
    `${base(tenantId)}/sites/${siteId}/stock/reconciliation`
  );
  return {
    data: response.data.data,
    meta: response.data.meta ?? { valuesVisible: false, blindLocationIds: [] }
  };
}
