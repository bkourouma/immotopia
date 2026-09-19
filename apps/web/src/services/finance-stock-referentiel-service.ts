/**
 * Frontière réseau du module financier — lot 5, premier sous-lot : le
 * référentiel du stock.
 *
 * Contrat gelé : les écrans appellent ces fonctions et rien d'autre. Aucun
 * écran ne construit d'URL ni n'appelle `apiClient` directement.
 *
 * Fichier séparé de `finance-service.ts`, `finance-lot2-service.ts`,
 * `finance-lot3-service.ts`, `finance-lot4-service.ts`,
 * `finance-partnerships-service.ts`, `finance-salaries-service.ts` et
 * `finance-contractors-service.ts`, tous gelés. `base()` et `toQuery()` sont
 * recopiées plutôt qu'importées d'un sous-lot précédent, pour la même raison
 * qu'aux sous-lots précédents : la frontière de ce sous-lot doit pouvoir
 * évoluer sans dépendre du détail d'implémentation d'un autre.
 *
 * ---------------------------------------------------------------------------
 * Aucun corps ne répète un identifiant que le chemin porte déjà
 * ---------------------------------------------------------------------------
 *
 * Les schémas Zod du serveur (`packages/api/src/lib/finance/
 * schemas-stock-referentiel.ts`) sont `.strict()` : un champ en trop est un
 * 400, bruyant plutôt que silencieux. `tenantId`, `itemId` et `locationId` ne
 * figurent donc dans AUCUN corps — ils voyagent tous dans le CHEMIN, et les
 * deux corrections prennent leur identifiant en ARGUMENT SÉPARÉ. C'est
 * exactement le défaut qui cassait cinq créations des lots 2 à 4, épinglé par
 * `__tests__/finance/corps-des-requetes.test.ts`, auquel les créations de ce
 * sous-lot ajoutent les leurs.
 *
 * ---------------------------------------------------------------------------
 * Ce que ce fichier retire du corps, et pourquoi
 * ---------------------------------------------------------------------------
 *
 * Le serveur refuse la chaîne VIDE là où il accepte l'absence
 * (`z.string().min(1)...optional()`) : `category`, `search`, et le libellé
 * d'une correction. Les clés vides sont donc **omises**, jamais envoyées en
 * `''` — la même leçon que `trade` au sous-lot des tâcherons.
 *
 * À l'inverse, `null` est significatif sur les deux corrections : une clé
 * ABSENTE veut dire « ne touche pas », `null` veut dire « efface ». Les
 * fonctions de correction ne retirent donc que `undefined`, jamais `null`.
 *
 * Comme aux lots précédents, c'est aussi le point d'insertion de l'atelier :
 * la fausse API se branche sous `apiClient`, au niveau de l'adaptateur axios.
 *
 * Routes : `packages/api/src/routes/finance-stock-referentiel-routes.ts`.
 * Contrat : `packages/api/src/lib/finance/types-lot5-referentiel.ts`, et son
 * dérivé web `types/finance-stock-referentiel-types.ts`.
 */

import apiClient from '../utils/api-client';
import type {
  CreateStockItemInput,
  CreateStockLocationInput,
  ListStockItemsFilters,
  ListStockLocationsFilters,
  SetStockValuationMethodInput,
  StockItem,
  StockLocation,
  StockSettings,
  UpdateStockItemInput,
  UpdateStockLocationInput
} from '../types/finance-stock-referentiel-types';

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

/**
 * Retire les clés `undefined` d'un corps de CORRECTION, et garde les `null`.
 *
 * La distinction est tout l'intérêt de cette fonction : côté serveur, une clé
 * absente veut dire « ne touche pas » et `null` veut dire « efface ». Une
 * sérialisation JSON naïve laisserait passer `undefined` comme une clé
 * manquante — ce qui serait juste ici — mais l'épingler explicitement rend la
 * règle lisible, et protège du jour où le corps passerait par un autre
 * transport.
 */
function sansIndefini(params: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(params).filter(([, valeur]) => valeur !== undefined));
}

// ---------------------------------------------------------------------------
// L'article
// ---------------------------------------------------------------------------

/** Route A. `onlyActive` et `search` partent en paramètres de REQUÊTE, jamais dans le chemin. */
export async function listStockItems(tenantId: string, filters?: ListStockItemsFilters): Promise<StockItem[]> {
  const recherche = filters?.search?.trim();
  const response = await apiClient.get<ApiResponse<StockItem[]>>(
    `${base(tenantId)}/stock/items${toQuery({
      onlyActive: filters?.onlyActive,
      // Le serveur refuse la chaîne vide (`.min(1)`) : la clé est omise.
      search: recherche ? recherche : undefined
    })}`
  );
  return response.data.data;
}

/**
 * Route B. Enregistre un article.
 *
 * `category` et `defaultCostCategoryId` vides sont RETIRÉS du corps plutôt
 * qu'envoyés en chaîne vide : les schémas serveur sont
 * `z.string().min(1)…optional()` et `z.string().uuid()…optional()`, une chaîne
 * vide est un 400 dans les deux cas.
 *
 * Rappel du contrat : `defaultCostCategoryId` est une **proposition**, sans
 * aucune autorité sur la sortie à venir.
 */
export async function createStockItem(tenantId: string, params: CreateStockItemInput): Promise<StockItem> {
  const corps: Record<string, unknown> = {
    reference: params.reference,
    label: params.label,
    unit: params.unit
  };
  const famille = params.category?.trim();
  if (famille) corps.category = famille;
  if (params.defaultCostCategoryId) corps.defaultCostCategoryId = params.defaultCostCategoryId;

  const response = await apiClient.post<ApiResponse<StockItem>>(`${base(tenantId)}/stock/items`, corps);
  return response.data.data;
}

/**
 * Route D. Corrige un article — désignation, unité, famille, poste proposé,
 * activité.
 *
 * L'article voyage dans le CHEMIN : `itemId` est un argument séparé et n'entre
 * jamais dans le corps. **`reference` n'est pas corrigeable** : le type
 * d'entrée ne la déclare pas, et le serveur la refuserait en 400.
 *
 * Seules les clés réellement fournies voyagent. L'écran n'envoie que ce qui a
 * changé, et le serveur refuse un corps vide (« Aucune correction fournie. »).
 */
export async function updateStockItem(
  tenantId: string,
  itemId: string,
  params: UpdateStockItemInput
): Promise<StockItem> {
  const response = await apiClient.patch<ApiResponse<StockItem>>(
    `${base(tenantId)}/stock/items/${itemId}`,
    sansIndefini(params as Record<string, unknown>)
  );
  return response.data.data;
}

/** Route C. Détail d'un article. */
export async function getStockItem(tenantId: string, itemId: string): Promise<StockItem> {
  const response = await apiClient.get<ApiResponse<StockItem>>(`${base(tenantId)}/stock/items/${itemId}`);
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Le lieu de stockage
// ---------------------------------------------------------------------------

/** Route E. `onlyActive` et `kind` partent en paramètres de REQUÊTE. */
export async function listStockLocations(
  tenantId: string,
  filters?: ListStockLocationsFilters
): Promise<StockLocation[]> {
  const response = await apiClient.get<ApiResponse<StockLocation[]>>(
    `${base(tenantId)}/stock/locations${toQuery({ onlyActive: filters?.onlyActive, kind: filters?.kind })}`
  );
  return response.data.data;
}

/**
 * Route F. Crée un magasin, ou le lieu de stockage d'un chantier.
 *
 * **`siteId` ne part QUE pour un lieu de chantier.** Le serveur l'exige quand
 * `kind` vaut `SITE` et le refuse sinon — « accepter un champ qui ne servira à
 * rien laisserait croire qu'il a servi ». L'union discriminée du type d'entrée
 * rend l'autre forme inexprimable ; ce `if` la rend en plus invisible sur le
 * fil, y compris si l'appelant contournait le typage.
 *
 * Le serveur refuse un second lieu pour le même chantier, et un libellé déjà
 * pris : l'écran relaie ses messages tels quels.
 */
export async function createStockLocation(tenantId: string, params: CreateStockLocationInput): Promise<StockLocation> {
  const corps: Record<string, unknown> = { kind: params.kind, label: params.label };
  if (params.kind === 'SITE') corps.siteId = params.siteId;

  const response = await apiClient.post<ApiResponse<StockLocation>>(`${base(tenantId)}/stock/locations`, corps);
  return response.data.data;
}

/**
 * Route G. Corrige un lieu : son libellé, son activité.
 *
 * Le lieu voyage dans le CHEMIN. **Ni `kind` ni `siteId`** : le type d'entrée
 * ne les déclare pas, et le schéma `.strict()` du serveur les refuserait en
 * 400 plutôt que de les ignorer en silence.
 */
export async function updateStockLocation(
  tenantId: string,
  locationId: string,
  params: UpdateStockLocationInput
): Promise<StockLocation> {
  const response = await apiClient.patch<ApiResponse<StockLocation>>(
    `${base(tenantId)}/stock/locations/${locationId}`,
    sansIndefini(params as Record<string, unknown>)
  );
  return response.data.data;
}

// ---------------------------------------------------------------------------
// La méthode de valorisation
// ---------------------------------------------------------------------------

/**
 * Route H. Lit la décision en vigueur.
 *
 * Ne lève jamais pour cause de réglages absents : le serveur les crée au
 * défaut du PRD. `decisionNote` vaut alors `null`, et l'écran le dit.
 */
export async function getStockSettings(tenantId: string): Promise<StockSettings> {
  const response = await apiClient.get<ApiResponse<StockSettings>>(`${base(tenantId)}/stock/settings`);
  return response.data.data;
}

/**
 * Route I. Arrête la méthode de valorisation, avec son motif.
 *
 * `PUT` et non `PATCH` : la décision est remplacée en entier, méthode ET motif
 * ensemble. Le motif est exigé, et le serveur le `trim()` avant de le refuser
 * vide — le service le `trim()` aussi, pour que ce qui est enregistré soit
 * exactement ce qui sera relu.
 */
export async function setStockValuationMethod(
  tenantId: string,
  params: SetStockValuationMethodInput
): Promise<StockSettings> {
  const response = await apiClient.put<ApiResponse<StockSettings>>(`${base(tenantId)}/stock/settings`, {
    valuationMethod: params.valuationMethod,
    decisionNote: params.decisionNote.trim()
  });
  return response.data.data;
}
