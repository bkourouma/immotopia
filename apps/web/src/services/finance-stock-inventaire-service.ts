/**
 * Frontière réseau du module financier — lot 5, troisième sous-lot : les
 * transferts entre lieux et l'inventaire physique, alignée sur le contrat du
 * lot 040 (comptage à l'aveugle, clôture, justification, mise à l'écart,
 * abandon, validation par une autre personne).
 *
 * L'écran appelle ces fonctions et rien d'autre. Aucun écran ne construit
 * d'URL ni n'appelle `apiClient` directement.
 *
 * Fichier séparé des services des lots précédents, tous gelés. `base()` et
 * `toQuery()` sont recopiées plutôt qu'importées d'un autre service : aucun
 * service du dépôt n'en importe un autre.
 *
 * ---------------------------------------------------------------------------
 * Les règles, et elles ont toutes été payées
 * ---------------------------------------------------------------------------
 *
 * **1. Aucun corps ne répète un identifiant que le chemin porte déjà.**
 * `tenantId`, `countId` et `itemId` voyagent dans l'URL selon la route. Les
 * schémas serveur sont `.strict()` : un champ en trop est un 400. Les adresses
 * et les corps exacts sont épinglés dans
 * `__tests__/finance/corps-des-requetes.test.ts`.
 *
 * **2. `expectedQuantity` ne part JAMAIS dans le corps d'une ligne de
 * comptage**, ni aucun motif : le serveur fige l'attendu, et le motif se saisit
 * après la clôture du comptage (lot 040, A2-R5 : un motif à la saisie est un
 * 400). La ligne porte l'article, la quantité comptée et l'identifiant de
 * requête (B3-R2).
 *
 * **3. La validation n'envoie que la raison d'une dérogation**, quand il y en
 * a une (A1-R3) ; sinon un corps vide. L'auteur vient du jeton
 * d'authentification, jamais du corps.
 *
 * **4. Une lecture qui renvoie `meta` rend `{ data, meta }`** (ecrans §3.2) ;
 * une écriture terrain rend en plus `replayed` (`200` = rejeu idempotent).
 *
 * Contrat : `specs/040-controle-stock/contracts/openapi.yaml`, dérivé web
 * `types/finance-stock-controle-types.ts`.
 */

import apiClient from '../utils/api-client';
import type { StockItemRef, StockLocationRef } from '../types/finance-stock-inventaire-types';
import type {
  CreateCountRequest,
  JustifyLineRequest,
  SetCountLineRequest,
  StockBalanceView,
  StockCountLineView,
  StockCountsFilters,
  StockCountView,
  StockMeta,
  StockRead,
  StockTransferResult,
  StockWrite,
  TransferRequest
} from '../types/finance-stock-controle-types';

type ApiResponse<T> = { success: boolean; data: T };
type ApiResponseWithMeta<T> = { success: boolean; data: T; meta?: StockMeta };

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

/** Absent, on ne suppose rien de favorable : valeurs non visibles. */
function metaOf(body: { meta?: StockMeta }): StockMeta {
  return body.meta ?? { valuesVisible: false, blindLocationIds: [] };
}

function trimmedOrUndefined(value: string | null | undefined): string | undefined {
  const texte = (value ?? '').trim();
  return texte ? texte : undefined;
}

// ---------------------------------------------------------------------------
// Le référentiel, lu chez les voisins
// ---------------------------------------------------------------------------

/** Les articles, pour la liste de choix du transfert et de la saisie de comptage. */
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
 * Ce qu'il reste au lieu d'origine d'un transfert, avec son `meta`. **Jamais
 * appelée pour le lieu d'un comptage en cours** : l'écran de comptage ne lit
 * aucun solde du lieu compté (ecrans §3.4). Sur un lieu en comptage, la
 * quantité vaut `null` pour qui ne valide pas.
 */
export async function listStockBalances(
  tenantId: string,
  filters?: { locationId?: string; itemId?: string; onlyInStock?: boolean }
): Promise<StockRead<StockBalanceView[]>> {
  const response = await apiClient.get<ApiResponseWithMeta<StockBalanceView[]>>(
    `${base(tenantId)}/stock/balances${toQuery(filters)}`
  );
  return { data: response.data.data, meta: metaOf(response.data) };
}

// ---------------------------------------------------------------------------
// Le transfert (A11, A7-R4)
// ---------------------------------------------------------------------------

/**
 * Déplace un article d'un lieu vers un autre. Le corps est recomposé champ
 * par champ : les deux lieux, l'article, la quantité, la date, le demandeur
 * (`takerId`, sinon `requestedBy` détouré), le motif et sa précision (envoyée
 * seulement si elle n'est pas vide), l'identifiant de requête. Aucun prix,
 * aucun chantier : déplacer n'est pas consommer.
 */
export async function createStockTransfer(
  tenantId: string,
  params: TransferRequest
): Promise<StockWrite<StockTransferResult>> {
  const precision = trimmedOrUndefined(params.reason);
  const corps = {
    fromLocationId: params.fromLocationId,
    toLocationId: params.toLocationId,
    itemId: params.itemId,
    quantity: params.quantity,
    transferDate: params.transferDate,
    ...(params.takerId ? { takerId: params.takerId } : { requestedBy: (params.requestedBy ?? '').trim() }),
    reasonCode: params.reasonCode,
    ...(precision ? { reason: precision } : {}),
    ...(params.clientRequestId ? { clientRequestId: params.clientRequestId } : {})
  };
  const response = await apiClient.post<ApiResponseWithMeta<StockTransferResult>>(
    `${base(tenantId)}/stock/transfers`,
    corps
  );
  return { data: response.data.data, meta: metaOf(response.data), replayed: response.status === 200 };
}

// ---------------------------------------------------------------------------
// L'inventaire — lectures
// ---------------------------------------------------------------------------

/**
 * La liste des inventaires, **sans leurs lignes** (`withLines` n'est jamais
 * envoyé : le compte reste dans `linesCount`). Les filtres partent en requête.
 */
export async function listStockCounts(
  tenantId: string,
  filters?: StockCountsFilters
): Promise<StockRead<StockCountView[]>> {
  const response = await apiClient.get<ApiResponseWithMeta<StockCountView[]>>(
    `${base(tenantId)}/stock/counts${toQuery(filters as Record<string, string | undefined>)}`
  );
  return { data: response.data.data, meta: metaOf(response.data) };
}

/** Le détail d'un inventaire, avec ses lignes. En DRAFT, attendu et écart valent `null` pour tous. */
export async function getStockCount(tenantId: string, countId: string): Promise<StockCountView> {
  const response = await apiClient.get<ApiResponse<StockCountView>>(`${base(tenantId)}/stock/counts/${countId}`);
  return response.data.data;
}

// ---------------------------------------------------------------------------
// L'inventaire — écritures
// ---------------------------------------------------------------------------

/** Ouvre un inventaire : le lieu, la date, et la nature si elle n'est pas courante. */
export async function createStockCount(tenantId: string, params: CreateCountRequest): Promise<StockCountView> {
  const response = await apiClient.post<ApiResponse<StockCountView>>(`${base(tenantId)}/stock/counts`, {
    locationId: params.locationId,
    countedAt: params.countedAt,
    ...(params.kind ? { kind: params.kind } : {})
  });
  return response.data.data;
}

/**
 * Saisit (ou remplace) le comptage d'un article. Rend **la ligne saisie**, pas
 * l'inventaire entier (A2-R2). N'envoie jamais de motif.
 */
export async function setStockCountLine(
  tenantId: string,
  countId: string,
  params: SetCountLineRequest
): Promise<StockCountLineView> {
  const corps = {
    itemId: params.itemId,
    countedQuantity: params.countedQuantity,
    ...(params.clientRequestId ? { clientRequestId: params.clientRequestId } : {})
  };
  const response = await apiClient.put<ApiResponse<StockCountLineView>>(
    `${base(tenantId)}/stock/counts/${countId}/lines`,
    corps
  );
  return response.data.data;
}

/** Retire une ligne d'un inventaire en DRAFT. Les deux identifiants sont dans le chemin. */
export async function removeStockCountLine(tenantId: string, countId: string, itemId: string): Promise<StockCountView> {
  const response = await apiClient.delete<ApiResponse<StockCountView>>(
    `${base(tenantId)}/stock/counts/${countId}/lines/${itemId}`
  );
  return response.data.data;
}

/** Clôt le comptage (DRAFT → COUNTED) : les écarts deviennent visibles. Corps vide. */
export async function closeStockCount(tenantId: string, countId: string): Promise<StockCountView> {
  const response = await apiClient.post<ApiResponse<StockCountView>>(
    `${base(tenantId)}/stock/counts/${countId}/close`,
    {}
  );
  return response.data.data;
}

/** Justifie l'écart d'une ligne (COUNTED) : le motif, et sa précision si elle n'est pas vide. */
export async function justifyStockCountLine(
  tenantId: string,
  countId: string,
  itemId: string,
  params: JustifyLineRequest
): Promise<StockCountLineView> {
  const precision = trimmedOrUndefined(params.reason);
  const response = await apiClient.put<ApiResponse<StockCountLineView>>(
    `${base(tenantId)}/stock/counts/${countId}/lines/${itemId}/justification`,
    { reasonCode: params.reasonCode, ...(precision ? { reason: precision } : {}) }
  );
  return response.data.data;
}

/** Écarte une ligne (COUNTED, STOCK_COUNT_VALIDATE), avec un motif de 3 à 500 caractères. */
export async function setAsideStockCountLine(
  tenantId: string,
  countId: string,
  itemId: string,
  reason: string
): Promise<StockCountView> {
  const response = await apiClient.post<ApiResponse<StockCountView>>(
    `${base(tenantId)}/stock/counts/${countId}/lines/${itemId}/set-aside`,
    { reason: reason.trim() }
  );
  return response.data.data;
}

/** Abandonne un inventaire en DRAFT, avec un motif. */
export async function cancelStockCount(tenantId: string, countId: string, reason: string): Promise<StockCountView> {
  const response = await apiClient.post<ApiResponse<StockCountView>>(
    `${base(tenantId)}/stock/counts/${countId}/cancel`,
    { reason: reason.trim() }
  );
  return response.data.data;
}

/**
 * Valide un inventaire clos. Corps vide, ou `{ selfValidationReason }` pour la
 * dérogation du validateur unique (A1-R3).
 */
export async function validateStockCount(
  tenantId: string,
  countId: string,
  selfValidationReason?: string
): Promise<StockCountView> {
  const raison = trimmedOrUndefined(selfValidationReason);
  const response = await apiClient.post<ApiResponse<StockCountView>>(
    `${base(tenantId)}/stock/counts/${countId}/validate`,
    raison ? { selfValidationReason: raison } : {}
  );
  return response.data.data;
}
