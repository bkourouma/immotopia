/**
 * Frontière réseau du module financier — lot 5, deuxième sous-lot :
 * réceptions, sorties et valorisation.
 *
 * Contrat gelé : l'écran appelle ces fonctions et rien d'autre. Aucun écran ne
 * construit d'URL ni n'appelle `apiClient` directement.
 *
 * Fichier séparé des services des lots précédents, tous gelés. `base()` et
 * `toQuery()` sont recopiées plutôt qu'importées, pour la même raison qu'aux
 * sous-lots précédents : la frontière de ce sous-lot doit pouvoir évoluer sans
 * dépendre du détail d'implémentation d'un autre. Aucun service du dépôt n'en
 * importe un autre, et celui-ci ne fait pas exception.
 *
 * Routes : `packages/api/src/routes/finance-stock-mouvements-routes.ts`.
 * Contrat : `packages/api/src/lib/finance/types-lot5-mouvements.ts`, et son
 * dérivé web `types/finance-stock-mouvements-types.ts`.
 *
 * ---------------------------------------------------------------------------
 * Aucun corps ne répète un identifiant que le chemin porte déjà
 * ---------------------------------------------------------------------------
 *
 * Les deux schémas Zod de création du serveur
 * (`packages/api/src/lib/finance/schemas-stock-mouvements.ts`) sont
 * `.strict()` : un champ en trop est un 400. Le chemin ne porte ici que
 * `tenantId`, et **aucun corps ne le répète**. C'est le défaut qui cassait
 * cinq créations des lots 2, 3 et 4, épinglé par
 * `__tests__/finance/corps-des-requetes.test.ts`, auquel ces deux créations
 * ajoutent les leurs.
 *
 * `supplierInvoiceId` dans le corps d'une réception n'est PAS une répétition :
 * il n'est nulle part dans le chemin, et c'est lui qui valorise l'entrée.
 *
 * ---------------------------------------------------------------------------
 * Le prix d'une SORTIE n'est pas transmis, parce qu'il n'est pas saisi
 * ---------------------------------------------------------------------------
 *
 * `recordStockIssue` ne prend ni `unitCost`, ni `totalValue`, ni
 * `averageUnitCost` : le prix est dérivé du coût moyen du lieu avant la sortie
 * (principe P-4). Le schéma serveur étant strict, un corps qui en porterait un
 * recevrait un 400 — ce qui vaut mieux qu'un prix silencieusement jeté.
 *
 * ---------------------------------------------------------------------------
 * Deux routes du sous-lot VOISIN sont appelées ici, et c'est délibéré
 * ---------------------------------------------------------------------------
 *
 * `GET /stock/items` et `GET /stock/locations` appartiennent au **premier**
 * sous-lot du lot 5 (le référentiel), écrit en parallèle par un autre agent.
 * On ne choisit pas un article ni un lieu sans les voir : cet écran les liste
 * donc en appelant les routes **directement**, sans importer le service de cet
 * agent — aucun fichier dont le nom porte « referentiel » n'est touché ni lu
 * par ce fichier.
 *
 * Conséquence assumée : le jour où `finance-stock-referentiel-service.ts`
 * existera, ces deux fonctions feront doublon avec les siennes. Elles sont
 * isolées en bas de ce fichier, sous un titre explicite, pour que le
 * superviseur n'ait qu'un endroit à retirer.
 *
 * Comme aux lots précédents, c'est aussi le point d'insertion de l'atelier :
 * la fausse API se branche sous `apiClient`, au niveau de l'adaptateur axios.
 */

import apiClient from '../utils/api-client';
import type { SupplierInvoice } from '../types/finance-lot2-types';
import type {
  CreateStockIssueInput,
  CreateStockReceiptInput,
  ListStockBalancesFilters,
  ListStockItemsFilters,
  ListStockLocationsFilters,
  ListStockMovementsFilters,
  StockBalance,
  StockItemRef,
  StockLocationRef,
  StockMovement
} from '../types/finance-stock-mouvements-types';

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
// Route C. L'état du stock — ce qu'il reste, et ce que ça vaut (besoin S4)
// ---------------------------------------------------------------------------

/**
 * Les soldes par (article, lieu), avec leur valeur et leur coût moyen déduit.
 *
 * Les trois filtres partent en paramètres de REQUÊTE, jamais dans le chemin.
 * `onlyInStock` masque les lignes à quantité nulle ; il est **omis** quand il
 * est faux plutôt qu'envoyé `false`, pour que la clé de cache et l'URL soient
 * les mêmes qu'au premier chargement.
 */
export async function listStockBalances(tenantId: string, filters?: ListStockBalancesFilters): Promise<StockBalance[]> {
  const response = await apiClient.get<ApiResponse<StockBalance[]>>(
    `${base(tenantId)}/stock/balances${toQuery(filters as Record<string, string | boolean | undefined>)}`
  );
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Route D. Le journal des mouvements
// ---------------------------------------------------------------------------

/** Filtrable par article, lieu, chantier, nature et période. Tout en requête. */
export async function listStockMovements(
  tenantId: string,
  filters?: ListStockMovementsFilters
): Promise<StockMovement[]> {
  const response = await apiClient.get<ApiResponse<StockMovement[]>>(
    `${base(tenantId)}/stock/movements${toQuery(filters as Record<string, string | undefined>)}`
  );
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Route A. La réception (besoin S2)
// ---------------------------------------------------------------------------

/**
 * Enregistre une réception : un ou plusieurs articles entrent dans un lieu,
 * adossés à une facture fournisseur validée.
 *
 * Rend **un mouvement par ligne**, jamais un objet unique : le coût moyen se
 * recalcule article par article.
 *
 * Le corps porte exactement les quatre champs du schéma serveur. Le
 * `tenantId` reste dans le chemin.
 */
export async function recordStockReceipt(tenantId: string, params: CreateStockReceiptInput): Promise<StockMovement[]> {
  const corps = {
    locationId: params.locationId,
    supplierInvoiceId: params.supplierInvoiceId,
    receiptDate: params.receiptDate,
    lines: params.lines.map(ligne => ({
      itemId: ligne.itemId,
      quantity: ligne.quantity,
      unitCost: ligne.unitCost
    }))
  };

  const response = await apiClient.post<ApiResponse<StockMovement[]>>(`${base(tenantId)}/stock/receipts`, corps);
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Route B. La sortie vers un chantier (besoin S3) — le geste du lot
// ---------------------------------------------------------------------------

/**
 * Sort un article vers un chantier, et l'impute à son coût.
 *
 * **Le corps est recomposé champ par champ**, et non passé en bloc : c'est la
 * seule façon de garantir qu'aucun prix ne s'y glisse jamais, même si
 * l'appelant en ajoutait un à son objet d'entrée. Le schéma serveur est
 * `.strict()` et refuse `unitCost`, `totalValue` et `averageUnitCost` ; la
 * valorisation se fait au coût moyen du lieu **avant** la sortie.
 *
 * `requestedBy` est envoyé sans espaces de bord : le serveur `.trim()` puis
 * refuse la chaîne vide, autant ne pas lui faire refuser une saisie qui
 * n'était qu'un espace.
 */
export async function recordStockIssue(tenantId: string, params: CreateStockIssueInput): Promise<StockMovement> {
  const corps = {
    locationId: params.locationId,
    itemId: params.itemId,
    quantity: params.quantity,
    siteId: params.siteId,
    costCategoryId: params.costCategoryId,
    requestedBy: params.requestedBy.trim(),
    issueDate: params.issueDate
  };

  const response = await apiClient.post<ApiResponse<StockMovement>>(`${base(tenantId)}/stock/issues`, corps);
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Le détour des factures réceptionnables — UNE seule fonction, ici
// ---------------------------------------------------------------------------

/**
 * Les factures d'un fournisseur sur lesquelles une réception peut s'adosser.
 *
 * **Le contrat n'offre aucune liste des factures « sans réception ».** Aucune
 * route ne dit quelles factures restent à réceptionner, et aucun champ d'une
 * facture ne le dit non plus. Cette liste se compose donc depuis les factures
 * **validées** du fournisseur choisi : le serveur refuse les autres, et
 * proposer une ligne dont on sait qu'elle échouera est une invitation à une
 * erreur.
 *
 * Deux limites, assumées et consignées au rapport :
 *
 *  - une facture **déjà réceptionnée** reste proposée. Rien ne permet de le
 *    savoir depuis le web, et rien n'interdit non plus une seconde réception
 *    partielle sur la même facture — le contrat prévoit explicitement que le
 *    total d'une réception puisse différer du montant de sa facture (besoin
 *    S7, rapprochement) ;
 *  - il faut passer par le fournisseur d'abord. Un clic de plus, mais aucun
 *    identifiant à taper.
 *
 * Le détour est isolé **ici**, et nulle part ailleurs, pour qu'une future
 * route `GET /stock/receivable-invoices` n'ait qu'un seul point à remplacer.
 * L'URL des factures d'un fournisseur appartient au lot 2 ; elle est recopiée
 * plutôt qu'importée, aucun service du dépôt n'important un autre service.
 */
export async function listSupplierInvoicesForReceipt(tenantId: string, supplierId: string): Promise<SupplierInvoice[]> {
  const response = await apiClient.get<ApiResponse<SupplierInvoice[]>>(
    `${base(tenantId)}/suppliers/${supplierId}/invoices`
  );
  return response.data.data.filter(facture => facture.status === 'VALIDATED');
}

// ---------------------------------------------------------------------------
// Le référentiel, appelé directement — voir l'en-tête du fichier
//
// Ces deux fonctions servent les listes déroulantes de cet écran. Elles
// appellent les routes A et E du PREMIER sous-lot du lot 5 sans importer quoi
// que ce soit de son territoire. À retirer le jour où son service existe.
// ---------------------------------------------------------------------------

/** `GET /stock/items`. Les filtres partent en requête, jamais dans le chemin. */
export async function listStockItems(tenantId: string, filters?: ListStockItemsFilters): Promise<StockItemRef[]> {
  const response = await apiClient.get<ApiResponse<StockItemRef[]>>(
    `${base(tenantId)}/stock/items${toQuery(filters as Record<string, string | boolean | undefined>)}`
  );
  return response.data.data;
}

/** `GET /stock/locations`. Même règle pour les filtres. */
export async function listStockLocations(
  tenantId: string,
  filters?: ListStockLocationsFilters
): Promise<StockLocationRef[]> {
  const response = await apiClient.get<ApiResponse<StockLocationRef[]>>(
    `${base(tenantId)}/stock/locations${toQuery(filters as Record<string, string | boolean | undefined>)}`
  );
  return response.data.data;
}
