/**
 * Frontière réseau de l'indivision (lot 4) — `PropertyOwnershipCard.tsx`
 * appelle ces fonctions et rien d'autre.
 *
 * Contrat : `lot4-contrat-api.md` (scratchpad de cet agent). Réponse réussie
 * `{ success: true, data }`, erreur `{ success: false, message, errors? }` —
 * l'écran lit `message` tel quel sur un 400, sans le reformuler.
 */

import apiClient from '../utils/api-client';

export interface OwnershipOwner {
  ownerClientId: string;
  ownerName: string;
  email: string | null;
}

export interface OwnershipShare extends OwnershipOwner {
  sharePercent: number;
}

export interface PropertyOwnership {
  propertyId: string;
  /** Propriétaire désigné sur les baux du bien, quand il est unique ; sert de proposition de départ. */
  leaseOwner: { ownerClientId: string; ownerName: string } | null;
  shares: OwnershipShare[];
  /** Propriétaires de l'agence, sélectionnables comme indivisaires. */
  owners: OwnershipOwner[];
}

export interface UpdatePropertyOwnershipInput {
  /** `[]` supprime l'indivision : le bien revient à son propriétaire désigné sur les baux. */
  shares: Array<{ ownerClientId: string; sharePercent: number }>;
}

type ApiResponse<T> = { success: boolean; data: T };

function base(tenantId: string, propertyId: string): string {
  return `/tenants/${tenantId}/properties/${propertyId}/ownership`;
}

export async function getPropertyOwnership(tenantId: string, propertyId: string): Promise<PropertyOwnership> {
  const response = await apiClient.get<ApiResponse<PropertyOwnership>>(base(tenantId, propertyId));
  return response.data.data;
}

export async function updatePropertyOwnership(
  tenantId: string,
  propertyId: string,
  input: UpdatePropertyOwnershipInput
): Promise<PropertyOwnership> {
  const response = await apiClient.put<ApiResponse<PropertyOwnership>>(base(tenantId, propertyId), input);
  return response.data.data;
}
