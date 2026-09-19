/**
 * Frontière réseau du module financier — lot 4, sixième et dernier sous-lot :
 * les lots d'un chantier, leur coût de revient, et la clôture.
 *
 * Contrat gelé : les écrans appellent ces fonctions et rien d'autre. Aucun
 * écran ne construit d'URL ni n'appelle `apiClient` directement.
 *
 * Fichier séparé de `finance-service.ts`, `finance-lot2-service.ts`,
 * `finance-lot3-service.ts`, `finance-lot4-service.ts`,
 * `finance-partnerships-service.ts`, `finance-salaries-service.ts` et
 * `finance-contractors-service.ts`, tous gelés. `base()` est recopiée plutôt
 * qu'importée d'un lot précédent, pour la même raison qu'aux sous-lots
 * précédents : la frontière de ce sous-lot doit pouvoir évoluer sans dépendre
 * du détail d'implémentation d'un autre.
 *
 * ---------------------------------------------------------------------------
 * Trois règles, et elles ont toutes été payées
 * ---------------------------------------------------------------------------
 *
 * **1. Aucun corps ne répète un identifiant que le chemin porte déjà.**
 * `tenantId`, `siteId` et `lotId` voyagent tous les trois dans l'URL. Les
 * schémas serveur (`packages/api/src/lib/finance/schemas-site-closing.ts`) sont
 * `.strict()` : un champ en trop est un 400, pas un champ ignoré. C'est le
 * défaut qui cassait quatre créations des lots 2 et 3 ; les adresses et les
 * corps exacts sont épinglés dans `__tests__/finance/corps-des-requetes.test.ts`.
 *
 * **2. La clôture et la réouverture envoient un corps VIDE.** L'auteur de la
 * clôture vient du jeton d'authentification, jamais du corps — un corps qui le
 * porterait permettrait de clôturer au nom de quelqu'un d'autre. Le schéma
 * serveur est `z.object({}).strict()` : le moindre champ ferait échouer la
 * requête en 400.
 *
 * **3. Les corps sont construits champ par champ**, jamais relayés en bloc.
 * Une clé absente veut dire « ne touche pas à ce champ », `null` veut dire
 * « efface-le » : recopier `undefined` effacerait ce que l'appelant n'a pas
 * nommé, et le serveur distingue explicitement les deux
 * (`'surfaceArea' in params`, contrôleur du sous-lot).
 *
 * Comme aux lots précédents, c'est aussi le point d'insertion de l'atelier : la
 * fausse API se branche sous `apiClient`, au niveau de l'adaptateur axios.
 *
 * Contrat : `packages/api/src/lib/finance/types-lot4-closing.ts` (gelé côté
 * serveur), ses routes `routes/finance-site-closing-routes.ts`, ses schémas
 * `lib/finance/schemas-site-closing.ts`, et son dérivé web
 * `types/finance-site-closing-types.ts`.
 */

import apiClient from '../utils/api-client';
import type {
  CapitalizedLot,
  CapitalizeSiteLotInput,
  CreateSiteLotInput,
  SiteClosure,
  SiteClosureBlocker,
  SiteCostBreakdown,
  SiteLot,
  SiteLotAllocationMethod,
  UpdateSiteLotInput
} from '../types/finance-site-closing-types';

type ApiResponse<T> = { success: boolean; data: T };

function base(tenantId: string): string {
  return `/tenants/${tenantId}/finance`;
}

function siteBase(tenantId: string, siteId: string): string {
  return `${base(tenantId)}/sites/${siteId}`;
}

// ---------------------------------------------------------------------------
// Les lots
// ---------------------------------------------------------------------------

export async function listSiteLots(tenantId: string, siteId: string): Promise<SiteLot[]> {
  const response = await apiClient.get<ApiResponse<SiteLot[]>>(`${siteBase(tenantId, siteId)}/lots`);
  return response.data.data;
}

/**
 * Ajoute un lot au chantier.
 *
 * Le chantier voyage dans le CHEMIN : le corps ne porte que `name`, et les deux
 * champs facultatifs quand ils ont une valeur. Un `surfaceArea` ou un
 * `manualSharePercent` laissé vide est OMIS du corps — le serveur refuse zéro
 * (les deux champs sont `.positive()`), et envoyer `null` sur une création
 * n'apporte rien de plus que l'absence.
 *
 * Refusé côté serveur sur un chantier clos.
 */
export async function createSiteLot(tenantId: string, siteId: string, params: CreateSiteLotInput): Promise<SiteLot> {
  const corps: Record<string, unknown> = { name: params.name };
  if (params.surfaceArea !== undefined && params.surfaceArea !== null) {
    corps.surfaceArea = params.surfaceArea;
  }
  if (params.manualSharePercent !== undefined && params.manualSharePercent !== null) {
    corps.manualSharePercent = params.manualSharePercent;
  }

  const response = await apiClient.post<ApiResponse<SiteLot>>(`${siteBase(tenantId, siteId)}/lots`, corps);
  return response.data.data;
}

/**
 * Corrige un lot — son nom, sa surface, sa quote-part.
 *
 * Seules les clés PRÉSENTES dans `params` partent : `undefined` n'est jamais
 * recopié, faute de quoi une correction du seul nom effacerait la surface. En
 * revanche `null` part bien, et efface — c'est la distinction que le contrôleur
 * serveur fait avec `'surfaceArea' in body`.
 *
 * Refusé côté serveur dès que le lot a basculé au patrimoine.
 */
export async function updateSiteLot(
  tenantId: string,
  siteId: string,
  lotId: string,
  params: UpdateSiteLotInput
): Promise<SiteLot> {
  const corps: Record<string, unknown> = {};
  if (params.name !== undefined) {
    corps.name = params.name;
  }
  if ('surfaceArea' in params) {
    corps.surfaceArea = params.surfaceArea ?? null;
  }
  if ('manualSharePercent' in params) {
    corps.manualSharePercent = params.manualSharePercent ?? null;
  }

  const response = await apiClient.patch<ApiResponse<SiteLot>>(`${siteBase(tenantId, siteId)}/lots/${lotId}`, corps);
  return response.data.data;
}

/**
 * Supprime un lot. **Irréversible côté écran** : l'appelant avertit avant, avec
 * `<ConfirmAction>`.
 *
 * Refusé côté serveur si le lot a basculé : le bien existe, et un lot supprimé
 * le laisserait orphelin de toute explication sur d'où vient sa valeur.
 */
export async function deleteSiteLot(tenantId: string, siteId: string, lotId: string): Promise<{ id: string }> {
  const response = await apiClient.delete<ApiResponse<{ id: string }>>(`${siteBase(tenantId, siteId)}/lots/${lotId}`);
  return response.data.data;
}

/**
 * Fixe la clé de répartition du chantier, et rend les lots recalculés.
 *
 * Le serveur VÉRIFIE que les lots existants la supportent et refuse plutôt que
 * de répartir à moitié : surface strictement positive partout pour `SURFACE`,
 * quotes-parts totalisant exactement cent (sur les valeurs ARRONDIES) pour
 * `MANUAL`. Son message de refus est relayé tel quel par l'écran.
 */
export async function setLotAllocationMethod(
  tenantId: string,
  siteId: string,
  method: SiteLotAllocationMethod
): Promise<SiteLot[]> {
  const response = await apiClient.put<ApiResponse<SiteLot[]>>(`${siteBase(tenantId, siteId)}/lot-allocation-method`, {
    method
  });
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Le coût de revient, vu du chantier
// ---------------------------------------------------------------------------

/**
 * Le coût qui sert de base, la clé en vigueur, les lots avec leur part et leur
 * coût de revient, et ce qui n'est réparti sur aucun lot.
 *
 * **Tout y est calculé côté serveur.** L'écran n'additionne ni ne proratise
 * rien : c'est le principe P-4, déjà appliqué au coût réel d'un chantier au
 * lot 2.
 */
export async function getSiteCostBreakdown(tenantId: string, siteId: string): Promise<SiteCostBreakdown> {
  const response = await apiClient.get<ApiResponse<SiteCostBreakdown>>(`${siteBase(tenantId, siteId)}/cost-breakdown`);
  return response.data.data;
}

// ---------------------------------------------------------------------------
// La clôture
// ---------------------------------------------------------------------------

/**
 * Ce qui empêche de clôturer, AVANT d'essayer.
 *
 * Répond 200 avec un tableau éventuellement vide : l'absence de bloqueur est
 * une réponse, pas une erreur. Ce sont exactement les mêmes règles que la
 * clôture appliquera.
 */
export async function getSiteClosureBlockers(tenantId: string, siteId: string): Promise<SiteClosureBlocker[]> {
  const response = await apiClient.get<ApiResponse<SiteClosureBlocker[]>>(
    `${siteBase(tenantId, siteId)}/closure-blockers`
  );
  return response.data.data;
}

/**
 * Clôture le chantier : statut clos, date, et coût figé.
 *
 * **Corps VIDE, et c'est une exigence de sécurité** : `closedByUserId` vient du
 * jeton, jamais du corps. Le schéma serveur est `z.object({}).strict()` — un
 * corps qui porterait l'auteur permettrait de clôturer au nom de quelqu'un
 * d'autre, et échouerait de toute façon en 400. Épinglé dans
 * `__tests__/finance/corps-des-requetes.test.ts`.
 *
 * À partir de là le chantier n'accepte plus aucune imputation : c'est LA garde
 * qui rend le coût figé vrai (contrat gelé).
 */
export async function closeSite(tenantId: string, siteId: string): Promise<SiteClosure> {
  const response = await apiClient.post<ApiResponse<SiteClosure>>(`${siteBase(tenantId, siteId)}/close`, {});
  return response.data.data;
}

/**
 * Rouvre un chantier clos par erreur : le coût redevient dérivé, et les
 * imputations sont de nouveau acceptées.
 *
 * **Corps VIDE**, même raison qu'à la clôture.
 *
 * Refusé côté serveur dès qu'un lot a basculé au patrimoine : un bien existe
 * désormais, avec une valeur d'acquisition tirée d'un coût qu'on s'apprêterait
 * à faire bouger. L'écran le dit AVANT, plutôt que de griser un bouton sans
 * raison.
 */
export async function reopenSite(tenantId: string, siteId: string): Promise<SiteClosure> {
  const response = await apiClient.post<ApiResponse<SiteClosure>>(`${siteBase(tenantId, siteId)}/reopen`, {});
  return response.data.data;
}

// ---------------------------------------------------------------------------
// La bascule au patrimoine
// ---------------------------------------------------------------------------

/**
 * Crée le bien d'un lot, avec son coût de revient pour valeur d'acquisition.
 *
 * **Irréversible** : un `Property` et une `AssetValuation` sont écrits, et le
 * lot ne bascule qu'une fois. L'écran demande donc une confirmation qui dit ce
 * qu'elle crée et avec quelle valeur d'acquisition.
 *
 * Refusé côté serveur sur un chantier OUVERT — le coût de revient n'y est
 * qu'une estimation, et un bien créé dessus porterait une valeur fausse que
 * plus rien ne corrigerait.
 *
 * Le corps porte les sept champs du bien, tous SAISIS, aucun deviné depuis le
 * chantier. Pas d'`acquisitionCost` : c'est le coût de revient dérivé qui le
 * fournit.
 */
export async function capitalizeSiteLot(
  tenantId: string,
  siteId: string,
  lotId: string,
  params: CapitalizeSiteLotInput
): Promise<CapitalizedLot> {
  const response = await apiClient.post<ApiResponse<CapitalizedLot>>(
    `${siteBase(tenantId, siteId)}/lots/${lotId}/capitalize`,
    {
      internalReference: params.internalReference,
      propertyType: params.propertyType,
      ownershipType: params.ownershipType,
      title: params.title,
      description: params.description,
      address: params.address,
      acquisitionDate: params.acquisitionDate
    }
  );
  return response.data.data;
}
