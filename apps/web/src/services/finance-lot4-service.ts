/**
 * Frontière réseau du module financier — lot 4, sous-lot « baux de terrain ».
 *
 * Contrat gelé : les écrans appellent ces fonctions et rien d'autre. Aucun
 * écran ne construit d'URL ni n'appelle `apiClient` directement.
 *
 * Fichier séparé de `finance-service.ts`, `finance-lot2-service.ts` et
 * `finance-lot3-service.ts`, tous gelés. `base()` et `toQuery()` sont
 * recopiées plutôt qu'importées d'un lot précédent, pour la même raison
 * qu'au lot 3 : la frontière de chaque lot doit pouvoir évoluer sans
 * dépendre du détail d'implémentation d'un autre lot.
 *
 * Le rattachement d'un chantier à un bail (`setSiteLandLease`) porte sur la
 * route `PUT sites/{siteId}/land-lease`, qui appartient bien au contrat de ce
 * sous-lot (`data-model.md` §5) même si elle raisonne « depuis le chantier » :
 * l'écran `ChantierDetail.tsx` qui aurait pu la porter appartient au lot 2,
 * gelé et hors du territoire de cet agent. Le geste est donc exposé ici et
 * câblé depuis la fiche du bail (`BailDeTerrain.tsx`), dans le sens inverse —
 * voir la rubrique « Hypothèses » du rapport de cet agent.
 *
 * Comme aux lots précédents, c'est aussi le point d'insertion de l'atelier :
 * la fausse API se branche sous `apiClient`, au niveau de l'adaptateur axios.
 *
 * Contrat : `specs/019-finance-baux-terrain/data-model.md` §5, et le type
 * gelé `types/finance-lot4-types.ts`.
 */

import apiClient from '../utils/api-client';
import type {
  CreateLandLeaseInput,
  CreateLandLeasePaymentInput,
  LandLease,
  LandLeaseAccrual,
  LandLeasePayment
} from '../types/finance-lot4-types';

type ApiResponse<T> = { success: boolean; data: T };

function base(tenantId: string): string {
  return `/tenants/${tenantId}/finance`;
}

// ---------------------------------------------------------------------------
// Le bail
// ---------------------------------------------------------------------------

export async function listLandLeases(tenantId: string): Promise<LandLease[]> {
  const response = await apiClient.get<ApiResponse<LandLease[]>>(`${base(tenantId)}/land-leases`);
  return response.data.data;
}

/** Enregistre un bail : ouvre dans le même geste le compte de tiers du bailleur (§2 du modèle). */
export async function createLandLease(tenantId: string, params: CreateLandLeaseInput): Promise<LandLease> {
  const response = await apiClient.post<ApiResponse<LandLease>>(`${base(tenantId)}/land-leases`, params);
  return response.data.data;
}

export async function getLandLease(tenantId: string, landLeaseId: string): Promise<LandLease> {
  const response = await apiClient.get<ApiResponse<LandLease>>(`${base(tenantId)}/land-leases/${landLeaseId}`);
  return response.data.data;
}

/**
 * Rattache (ou détache, avec `landLeaseId: null`) un chantier à un bail.
 *
 * Le contrat (`data-model.md` §5) documente cette route au singulier — « le
 * rattachement d'un chantier prend `{ landLeaseId }` » — donc côté chantier.
 * Faute de pouvoir toucher `ChantierDetail.tsx` (lot 2, gelé, hors territoire
 * de cet agent), le geste est déclenché depuis la fiche du bail : on y choisit
 * un chantier existant à rattacher, ou on détache l'un de ceux déjà listés.
 * La route reste rigoureusement celle du contrat ; seul l'écran d'où on
 * l'appelle diffère de ce que §5 suggère implicitement.
 */
export async function setSiteLandLease(
  tenantId: string,
  siteId: string,
  landLeaseId: string | null
): Promise<LandLease | null> {
  const response = await apiClient.put<ApiResponse<LandLease | null>>(`${base(tenantId)}/sites/${siteId}/land-lease`, {
    landLeaseId
  });
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Le paiement annuel
// ---------------------------------------------------------------------------

export async function listLandLeasePayments(tenantId: string, landLeaseId: string): Promise<LandLeasePayment[]> {
  const response = await apiClient.get<ApiResponse<LandLeasePayment[]>>(
    `${base(tenantId)}/land-leases/${landLeaseId}/payments`
  );
  return response.data.data;
}

/** Saisit un paiement annuel, brouillon : rien ne bouge au compte du bailleur avant validation. */
export async function createLandLeasePayment(
  tenantId: string,
  params: CreateLandLeasePaymentInput
): Promise<LandLeasePayment> {
  // Le corps ne repete PAS `landLeaseId` : le chemin le porte deja.
  //
  // Il le repetait, et cela ne cassait rien — seulement parce que
  // `createLandLeasePaymentSchema` n'etait pas `.strict()` et que Zod retirait
  // le champ en silence. Le jour ou ce schema serait durci comme ceux des
  // sous-lots suivants, cette creation serait tombee en 400. C'etait la
  // cinquieme occurrence du defaut que `corps-des-requetes.test.ts` existe
  // pour attraper, relevee par l'agent des ecrans des tacherons en lisant un
  // fichier qui ne lui appartenait pas.
  const { landLeaseId, ...corps } = params;
  const response = await apiClient.post<ApiResponse<LandLeasePayment>>(
    `${base(tenantId)}/land-leases/${landLeaseId}/payments`,
    corps
  );
  return response.data.data;
}

/**
 * Valide un paiement annuel : irréversible, c'est à cet instant que l'avance
 * est réputée versée et que le compte du bailleur devient débiteur de la
 * jouissance du terrain (§2 du modèle). L'écran doit le dire avant, dans une
 * confirmation, jamais après coup.
 */
export async function validateLandLeasePayment(tenantId: string, paymentId: string): Promise<LandLeasePayment> {
  const response = await apiClient.post<ApiResponse<LandLeasePayment>>(
    `${base(tenantId)}/land-lease-payments/${paymentId}/validate`,
    {}
  );
  return response.data.data;
}

// ---------------------------------------------------------------------------
// La constatation mensuelle
// ---------------------------------------------------------------------------

export async function listLandLeaseAccruals(tenantId: string, landLeaseId: string): Promise<LandLeaseAccrual[]> {
  const response = await apiClient.get<ApiResponse<LandLeaseAccrual[]>>(
    `${base(tenantId)}/land-leases/${landLeaseId}/accruals`
  );
  return response.data.data;
}

/**
 * Constate un mois à la main, quand le travail programmé du 1er du mois n'a
 * pas tourné (§6 du modèle). Idempotente comme lui : rejouer un mois déjà
 * constaté ne double rien, grâce à l'unicité `(bail, année, mois)`.
 *
 * **Écart de contrat, signalé et non corrigé ici.** Le type gelé
 * (`finance-lot4-types.ts`) ne déclare aucun `CreateLandLeaseAccrualInput` —
 * à la différence de chaque autre route de création du lot 4 — et
 * `data-model.md` §5 ne documente pas non plus le corps attendu par cette
 * route. Un mois « à la main » suppose pourtant de dire LEQUEL : cette
 * fonction envoie donc `{ periodYear, periodMonth }`, la forme la plus
 * probable au vu de `LandLeaseAccrual`, mais c'est une supposition. Voir la
 * rubrique « Hypothèses » du rapport de cet agent.
 */
export async function recordLandLeaseAccrual(
  tenantId: string,
  landLeaseId: string,
  period: { periodYear: number; periodMonth: number }
): Promise<LandLeaseAccrual> {
  const response = await apiClient.post<ApiResponse<LandLeaseAccrual>>(
    `${base(tenantId)}/land-leases/${landLeaseId}/accruals`,
    period
  );
  return response.data.data;
}
