/**
 * Frontière réseau du module financier — lot 5, troisième sous-lot : les
 * transferts entre lieux et l'inventaire physique.
 *
 * Contrat gelé : l'écran appelle ces fonctions et rien d'autre. Aucun écran ne
 * construit d'URL ni n'appelle `apiClient` directement.
 *
 * Fichier séparé de `finance-service.ts`, `finance-lot2-service.ts`,
 * `finance-lot3-service.ts`, `finance-lot4-service.ts`,
 * `finance-partnerships-service.ts`, `finance-salaries-service.ts`,
 * `finance-contractors-service.ts`, `finance-site-closing-service.ts` et
 * `finance-retentions-service.ts`, tous gelés. `base()` et `toQuery()` sont
 * recopiées plutôt qu'importées d'un lot précédent, pour la même raison qu'aux
 * sous-lots précédents : la frontière de ce sous-lot doit pouvoir évoluer sans
 * dépendre du détail d'implémentation d'un autre.
 *
 * ---------------------------------------------------------------------------
 * Trois règles, et elles ont toutes été payées
 * ---------------------------------------------------------------------------
 *
 * **1. Aucun corps ne répète un identifiant que le chemin porte déjà.**
 * `tenantId`, `countId` et `itemId` voyagent dans l'URL selon la route, et
 * aucun corps de ce fichier n'en parle. Les schémas serveur
 * (`packages/api/src/lib/finance/schemas-stock-inventaire.ts`) sont
 * `.strict()` : un champ en trop est un 400, pas un champ ignoré. C'est le
 * défaut qui cassait cinq créations des lots 2, 3 et 4 ; les adresses et les
 * corps exacts sont épinglés dans `__tests__/finance/corps-des-requetes.test.ts`.
 *
 * **2. `expectedQuantity` ne part JAMAIS dans le corps d'une ligne de
 * comptage.** Le serveur la lit dans le stock au moment de la saisie et la
 * fige (principe P-4). `setStockCountLineSchema` est `.strict()` et ne la
 * déclare pas : l'envoyer vaudrait un 400, et la laisser entrer permettrait de
 * fabriquer un écart nul — exactement ce que le besoin S6 empêche. Même chose
 * pour `variance` et `varianceValue`, tout aussi dérivées.
 *
 * **3. La validation d'un inventaire envoie un corps VIDE.** Son schéma est
 * `z.object({}).strict()` : rien à décider au moment de valider, tout a été
 * décidé en comptant. L'auteur de la validation vient du jeton
 * d'authentification, jamais du corps — un corps qui le porterait permettrait
 * de valider une perte au nom de quelqu'un d'autre.
 *
 * ---------------------------------------------------------------------------
 * Trois lectures empruntées aux sous-lots voisins
 * ---------------------------------------------------------------------------
 *
 * `listStockItems`, `listStockLocations` et `listStockBalances` appellent des
 * routes des sous-lots 1 et 2, livrés en parallèle par d'autres agents. Cet
 * écran en a besoin pour remplir ses listes de choix et pour dire ce qu'il
 * reste au lieu d'origine ; il les appelle donc **directement**, plutôt que de
 * dépendre d'un service voisin encore en cours d'écriture. Le doublon est
 * assumé et consigné : voir l'en-tête de `types/finance-stock-inventaire-types.ts`.
 *
 * Comme aux lots précédents, c'est aussi le point d'insertion de l'atelier : la
 * fausse API se branche sous `apiClient`, au niveau de l'adaptateur axios.
 *
 * Contrat : `packages/api/src/lib/finance/types-lot5-inventaire.ts` (gelé côté
 * serveur), ses routes `routes/finance-stock-inventaire-routes.ts`, ses schémas
 * `lib/finance/schemas-stock-inventaire.ts`, et son dérivé web
 * `types/finance-stock-inventaire-types.ts`.
 */

import apiClient from '../utils/api-client';
import type {
  CreateStockCountInput,
  CreateStockTransferInput,
  ListStockCountsFilters,
  SetStockCountLineInput,
  StockBalanceRef,
  StockCount,
  StockItemRef,
  StockLocationRef,
  StockTransfer
} from '../types/finance-stock-inventaire-types';

type ApiResponse<T> = { success: boolean; data: T };

function base(tenantId: string): string {
  return `/tenants/${tenantId}/finance`;
}

function toQuery(filters?: Record<string, string | number | boolean | undefined>): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

// ---------------------------------------------------------------------------
// Le référentiel, lu chez les voisins (sous-lots 1 et 2)
// ---------------------------------------------------------------------------

/**
 * Les articles de l'agence, pour les listes de choix.
 *
 * `onlyActive` part en paramètre de REQUÊTE. Le serveur accepte les chaînes
 * `'true'` et `'false'` littérales en plus du booléen — `z.coerce.boolean()`
 * aurait transformé `?onlyActive=false` en `true`, toute chaîne non vide étant
 * « truthy ».
 */
export async function listStockItems(
  tenantId: string,
  filters?: { onlyActive?: boolean; search?: string }
): Promise<StockItemRef[]> {
  const response = await apiClient.get<ApiResponse<StockItemRef[]>>(`${base(tenantId)}/stock/items${toQuery(filters)}`);
  return response.data.data;
}

/** Les lieux de stockage : magasins et lieux de chantier. */
export async function listStockLocations(
  tenantId: string,
  filters?: { onlyActive?: boolean; kind?: string }
): Promise<StockLocationRef[]> {
  const response = await apiClient.get<ApiResponse<StockLocationRef[]>>(
    `${base(tenantId)}/stock/locations${toQuery(filters)}`
  );
  return response.data.data;
}

/**
 * Ce qu'il reste, par (article, lieu), avec sa valeur et son coût moyen.
 *
 * Cet écran s'en sert pour annoncer le stock du lieu d'ORIGINE avant un
 * transfert. C'est une prévenance, pas une autorité : c'est le serveur qui
 * refuse une quantité supérieure au stock, et son message est relayé tel quel.
 */
export async function listStockBalances(
  tenantId: string,
  filters?: { locationId?: string; itemId?: string; onlyInStock?: boolean }
): Promise<StockBalanceRef[]> {
  const response = await apiClient.get<ApiResponse<StockBalanceRef[]>>(
    `${base(tenantId)}/stock/balances${toQuery(filters)}`
  );
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Route A — le transfert
// ---------------------------------------------------------------------------

/**
 * Déplace un article d'un lieu vers un autre. **N'impute rien.**
 *
 * Écrit deux mouvements liés — une sortie du lieu d'origine, une entrée au lieu
 * d'arrivée — dans une seule transaction, et **aucune écriture comptable** :
 * déplacer n'est pas consommer (contrat gelé, principe P-7). Le coût du
 * chantier d'arrivée ne bouge pas d'un franc.
 *
 * Le corps porte les cinq champs du schéma, et rien d'autre : **aucun prix** —
 * la valeur part au coût moyen du lieu d'origine — et **aucun chantier**.
 *
 * Le serveur refuse le même lieu des deux côtés, une quantité nulle ou
 * négative, une quantité supérieure au stock d'origine, et un lieu désactivé.
 * Il n'a aucune raison de refuser un transfert vers un chantier CLOS : y
 * déposer du matériel n'impute rien, et un chantier clos peut légitimement
 * servir de lieu de stockage le temps qu'on évacue.
 */
export async function createStockTransfer(tenantId: string, params: CreateStockTransferInput): Promise<StockTransfer> {
  const response = await apiClient.post<ApiResponse<StockTransfer>>(`${base(tenantId)}/stock/transfers`, {
    fromLocationId: params.fromLocationId,
    toLocationId: params.toLocationId,
    itemId: params.itemId,
    quantity: params.quantity,
    transferDate: params.transferDate
  });
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Routes B à G — l'inventaire
// ---------------------------------------------------------------------------

/**
 * Route F. La liste des comptages, filtrable par lieu et par statut.
 *
 * Les deux filtres partent en paramètres de REQUÊTE, jamais dans le chemin.
 */
export async function listStockCounts(tenantId: string, filters?: ListStockCountsFilters): Promise<StockCount[]> {
  const response = await apiClient.get<ApiResponse<StockCount[]>>(
    `${base(tenantId)}/stock/counts${toQuery(filters as Record<string, string | undefined>)}`
  );
  return response.data.data;
}

/**
 * Route G. Le détail d'un comptage, lignes comprises.
 *
 * Côté serveur, cette route est déclarée EN DERNIER sous `/stock/counts/` :
 * un chemin littéral qui serait monté après elle — `/stock/counts/summary`, par
 * exemple — serait avalé par le paramètre et deviendrait injoignable. La
 * remarque est notée ici parce qu'elle explique pourquoi l'adresse ci-dessous
 * ne peut pas être « améliorée ».
 */
export async function getStockCount(tenantId: string, countId: string): Promise<StockCount> {
  const response = await apiClient.get<ApiResponse<StockCount>>(`${base(tenantId)}/stock/counts/${countId}`);
  return response.data.data;
}

/**
 * Route B. Ouvre un inventaire sur un lieu, **en brouillon et sans aucune
 * ligne** : on compte une allée après l'autre, et exiger la liste complète d'un
 * coup obligerait à tout ressaisir pour corriger un chiffre.
 *
 * Le serveur refuse un second inventaire en brouillon sur le même lieu : deux
 * comptages simultanés du même dépôt produiraient deux vérités, et le second
 * validé écraserait le premier sans que personne ne le voie.
 */
export async function createStockCount(tenantId: string, params: CreateStockCountInput): Promise<StockCount> {
  const response = await apiClient.post<ApiResponse<StockCount>>(`${base(tenantId)}/stock/counts`, {
    locationId: params.locationId,
    countedAt: params.countedAt
  });
  return response.data.data;
}

/**
 * Route C. Saisit ou corrige le comptage d'un article. **PUT**, parce que
 * rappeler le même article REMPLACE son comptage : on se reprend en comptant,
 * et une seconde ligne pour le même article rendrait l'écart ambigu.
 *
 * Le corps ne porte que `itemId`, `countedQuantity` et — quand il y en a un —
 * `reason`. **Pas de `countId`** : il est dans le chemin. **Pas
 * d'`expectedQuantity`** : le serveur la lit et la fige (règle n°2 de
 * l'en-tête).
 *
 * Un motif vide ou en blancs est OMIS plutôt qu'envoyé : le contrôleur pose
 * `reason ?? null`, si bien que l'absence efface le motif — ce qui est
 * exactement ce qu'on veut d'une correction qui le retire. Envoyer une chaîne
 * vide enregistrerait un motif qui n'en est pas un, et la validation le
 * laisserait passer.
 */
export async function setStockCountLine(
  tenantId: string,
  countId: string,
  params: SetStockCountLineInput
): Promise<StockCount> {
  const corps: Record<string, unknown> = {
    itemId: params.itemId,
    countedQuantity: params.countedQuantity
  };
  const motif = (params.reason ?? '').trim();
  if (motif) {
    corps.reason = motif;
  }

  const response = await apiClient.put<ApiResponse<StockCount>>(
    `${base(tenantId)}/stock/counts/${countId}/lines`,
    corps
  );
  return response.data.data;
}

/**
 * Route D. Retire une ligne du comptage.
 *
 * Les deux identifiants sont dans le CHEMIN, et **aucun corps n'est envoyé** :
 * une suppression n'a rien à négocier.
 */
export async function removeStockCountLine(tenantId: string, countId: string, itemId: string): Promise<StockCount> {
  const response = await apiClient.delete<ApiResponse<StockCount>>(
    `${base(tenantId)}/stock/counts/${countId}/lines/${itemId}`
  );
  return response.data.data;
}

/**
 * Route E. Valide l'inventaire : **les écarts deviennent des ajustements**.
 *
 * **Corps VIDE**, et c'est une exigence (règle n°3 de l'en-tête). Le schéma
 * serveur est `z.object({}).strict()` : le moindre champ ferait échouer la
 * requête en 400, et un corps qui porterait l'auteur permettrait de valider une
 * perte au nom de quelqu'un d'autre.
 *
 * **Irréversible.** Pour chaque ligne en écart, et seulement celles-là, le
 * serveur écrit un vrai mouvement d'ajustement qui ramène le solde à la
 * quantité comptée. **Aucune route ne défait un inventaire validé** : un
 * comptage erroné se corrige par un second comptage. L'appelant avertit avant,
 * avec `<ConfirmAction>`.
 *
 * Le serveur refuse tant qu'une ligne en écart n'a pas de motif (besoin S6), un
 * inventaire déjà validé, et un inventaire sans aucune ligne — valider un
 * comptage vide ne dit rien et pourrait se lire comme « tout est conforme ».
 * L'écran annonce le premier refus AVANT d'essayer, et relaie le message du
 * serveur tel quel s'il tombe quand même.
 */
export async function validateStockCount(tenantId: string, countId: string): Promise<StockCount> {
  const response = await apiClient.post<ApiResponse<StockCount>>(
    `${base(tenantId)}/stock/counts/${countId}/validate`,
    {}
  );
  return response.data.data;
}
