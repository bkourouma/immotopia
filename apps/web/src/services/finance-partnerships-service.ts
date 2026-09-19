/**
 * Frontière réseau du module financier — lot 4, sous-lot « associations ».
 *
 * Contrat gelé : les écrans appellent ces fonctions et rien d'autre. Aucun
 * écran ne construit d'URL ni n'appelle `apiClient` directement.
 *
 * Fichier séparé de `finance-service.ts`, `finance-lot2-service.ts`,
 * `finance-lot3-service.ts` et `finance-lot4-service.ts`, tous gelés.
 * `base()` et `toQuery()` sont recopiées plutôt qu'importées d'un lot
 * précédent, pour la même raison qu'aux sous-lots précédents : la frontière de
 * ce sous-lot doit pouvoir évoluer sans dépendre du détail d'implémentation
 * d'un autre.
 *
 * **Aucun corps de requête ne répète un identifiant que le chemin porte
 * déjà.** C'est le défaut relevé dans `corps-des-requetes.test.ts`, qui a
 * cassé quatre créations des lots 2 et 3 contre les schémas Zod stricts du
 * serveur. `addPartnershipShare` et `setPropertyPartnership` ci-dessous y
 * font tous deux attention.
 *
 * Comme aux lots précédents, c'est aussi le point d'insertion de l'atelier :
 * la fausse API se branche sous `apiClient`, au niveau de l'adaptateur axios.
 *
 * Contrat : `packages/api/src/lib/finance/types-lot4-partnerships.ts`, le
 * contrat gelé côté serveur, et son dérivé web
 * `types/finance-partnerships-types.ts`.
 */

import apiClient from '../utils/api-client';
import type {
  AddPartnershipShareInput,
  CreatePartnershipInput,
  ListPartnershipsFilters,
  Partnership,
  PartnerStatement,
  PartnerStatementFilters
} from '../types/finance-partnerships-types';

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
// L'association et ses parts
// ---------------------------------------------------------------------------

export async function listPartnerships(tenantId: string, filters?: ListPartnershipsFilters): Promise<Partnership[]> {
  const response = await apiClient.get<ApiResponse<Partnership[]>>(
    `${base(tenantId)}/partnerships${toQuery(filters as Record<string, string | number | boolean | undefined>)}`
  );
  return response.data.data;
}

/** Crée une association, sans associé : les parts s'ajoutent ensuite, une par une. */
export async function createPartnership(tenantId: string, params: CreatePartnershipInput): Promise<Partnership> {
  const response = await apiClient.post<ApiResponse<Partnership>>(`${base(tenantId)}/partnerships`, params);
  return response.data.data;
}

export async function getPartnership(tenantId: string, partnershipId: string): Promise<Partnership> {
  const response = await apiClient.get<ApiResponse<Partnership>>(`${base(tenantId)}/partnerships/${partnershipId}`);
  return response.data.data;
}

/**
 * Ajoute un associé, et ouvre son compte de tiers.
 *
 * L'association voyage dans le CHEMIN (`partnerships/{id}/shares`) : le corps
 * ne porte que ce que le contrat gelé (`AddPartnershipShareTx`) attend en
 * plus, `partnerName` et `sharePercent` — jamais `partnershipId`.
 */
export async function addPartnershipShare(
  tenantId: string,
  partnershipId: string,
  params: AddPartnershipShareInput
): Promise<Partnership> {
  const response = await apiClient.post<ApiResponse<Partnership>>(
    `${base(tenantId)}/partnerships/${partnershipId}/shares`,
    params
  );
  return response.data.data;
}

/**
 * Retire un associé. **Irréversible côté écran** : l'appelant doit avertir
 * avant, avec `<ConfirmAction>` (voir `pages/finance/Association.tsx`).
 *
 * Le serveur refuse ce geste dès qu'une ventilation a été constatée sur la
 * part de l'associé (contrat gelé, `RemovePartnershipShareTx`) : l'écran
 * relaie alors le message d'erreur du serveur, il ne le devine pas.
 *
 * La route est `DELETE partnership-shares/{shareId}`, au singulier et hors de
 * `partnerships/{id}` : `shareId` identifie déjà, sans ambiguïté, à la fois
 * l'associé et son association.
 */
export async function removePartnershipShare(tenantId: string, shareId: string): Promise<Partnership> {
  const response = await apiClient.delete<ApiResponse<Partnership>>(`${base(tenantId)}/partnership-shares/${shareId}`);
  return response.data.data;
}

/**
 * Rattache (ou détache, avec `partnershipId: null`) un bien à une
 * association.
 *
 * Un bien a au plus une association : le rattacher ailleurs remplace le lien,
 * sans recalculer aucune ventilation passée (contrat gelé,
 * `AttachPropertyToPartnershipTx`). Le bien voyage dans le CHEMIN
 * (`properties/{propertyId}/partnership`) ; le corps ne porte que
 * `partnershipId`.
 */
export async function setPropertyPartnership(
  tenantId: string,
  propertyId: string,
  partnershipId: string | null
): Promise<Partnership | null> {
  const response = await apiClient.put<ApiResponse<Partnership | null>>(
    `${base(tenantId)}/properties/${propertyId}/partnership`,
    { partnershipId }
  );
  return response.data.data;
}

// ---------------------------------------------------------------------------
// L'état de quote-part — lecture seule
// ---------------------------------------------------------------------------

/**
 * L'état de quote-part d'un associé, en lecture seule (priorité C du PRD) :
 * ce qui a été facturé, ce qui a été encaissé, sa part, ce qui lui a déjà été
 * reversé. Rien ici ne s'écrit, c'est un relevé, pas une pièce.
 */
export async function getPartnerStatement(
  tenantId: string,
  shareId: string,
  filters?: PartnerStatementFilters
): Promise<PartnerStatement> {
  const response = await apiClient.get<ApiResponse<PartnerStatement>>(
    `${base(tenantId)}/partnership-shares/${shareId}/statement${toQuery(filters as Record<string, string | undefined>)}`
  );
  return response.data.data;
}
