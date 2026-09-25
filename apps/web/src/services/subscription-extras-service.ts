import apiClient from '../utils/api-client';
import type {
  CapacityKeyCode,
  SubscriptionItemDTO,
  SubscriptionPhase,
  SubscriptionStatusCode
} from './subscription-v2-service';

/**
 * Abonnements, vague 3 lot B : modification d'un élément, résumé de la liste
 * des agences, demandes d'extension. Fichier SÉPARÉ de
 * `subscription-v2-service.ts`, que le menu charge dans le chunk d'entrée :
 * ces appels ne servent qu'à des pages chargées en `React.lazy`.
 *
 * Types recopiés sur packages/api/src/services/subscription-admin-extras-service.ts
 * et controllers/platform-billing-controller.ts.
 */

interface Envelope<T> {
  success: boolean;
  data: T;
  message?: string;
}

// ------------------------------------------------------------------ vague 3, lot B

export interface UpdateItemInput {
  discountPercent?: number;
  unitMonthlyPrice?: number;
  note?: string | null;
  reason?: string;
}

/** `PATCH /api/admin/tenants/:tenantId/subscription/items/:itemId` — remise ou prix figé (audit). */
export async function updateSubscriptionItem(tenantId: string, itemId: string, input: UpdateItemInput): Promise<SubscriptionItemDTO> {
  const response = await apiClient.patch<Envelope<SubscriptionItemDTO>>(
    `/admin/tenants/${tenantId}/subscription/items/${itemId}`,
    input
  );
  return response.data.data;
}

/** `SubscriptionSummary` (subscription-admin-extras-service.ts). */
export interface SubscriptionSummary {
  tenantId: string;
  status: SubscriptionStatusCode | 'NONE';
  phase: SubscriptionPhase;
  readOnly: boolean;
  packs: string[];
  capacities: Record<CapacityKeyCode, { limit: number; used: number }>;
  lotsUsagePercent: number | null;
  nearLimit: boolean;
  nextDueAt: string | null;
  openExtensionRequests: number;
}

/** `GET /api/admin/subscriptions/summaries?tenantIds=` — une requête pour toute la page. */
export async function getSubscriptionSummaries(tenantIds: string[]): Promise<Record<string, SubscriptionSummary>> {
  if (tenantIds.length === 0) return {};
  const response = await apiClient.get<Envelope<Record<string, SubscriptionSummary>>>('/admin/subscriptions/summaries', {
    params: { tenantIds: tenantIds.join(',') }
  });
  return response.data.data;
}

export type ExtensionRequestStatus = 'OPEN' | 'HANDLED' | 'DECLINED';

/** `ExtensionRequestDto`. */
export interface ExtensionRequest {
  id: string;
  tenantId: string;
  requestedByUserId: string | null;
  requestedByName: string | null;
  catalogCode: string | null;
  catalogName: string | null;
  quantity: number | null;
  message: string;
  status: ExtensionRequestStatus;
  handledAt: string | null;
  handledByUserId: string | null;
  handledNote: string | null;
  createdAt: string;
}

export interface ExtensionRequestInput {
  catalogCode?: string | null;
  quantity?: number | null;
  message: string;
}

/** Agence : `POST /api/tenants/:tenantId/subscription/extension-requests`. */
export async function createExtensionRequest(tenantId: string, input: ExtensionRequestInput): Promise<ExtensionRequest> {
  const response = await apiClient.post<Envelope<ExtensionRequest>>(`/tenants/${tenantId}/subscription/extension-requests`, input);
  return response.data.data;
}

/** Agence : ses propres demandes. */
export async function listOwnExtensionRequests(tenantId: string): Promise<ExtensionRequest[]> {
  const response = await apiClient.get<Envelope<ExtensionRequest[]>>(`/tenants/${tenantId}/subscription/extension-requests`);
  return response.data.data;
}

/** Super-admin : demandes d'une agence (fiche agence). */
export async function listExtensionRequests(tenantId: string): Promise<ExtensionRequest[]> {
  const response = await apiClient.get<Envelope<ExtensionRequest[]>>(`/admin/tenants/${tenantId}/subscription/extension-requests`);
  return response.data.data;
}

export async function handleExtensionRequest(
  tenantId: string,
  requestId: string,
  input: { status: 'HANDLED' | 'DECLINED'; note?: string | null }
): Promise<ExtensionRequest> {
  const response = await apiClient.patch<Envelope<ExtensionRequest>>(
    `/admin/tenants/${tenantId}/subscription/extension-requests/${requestId}`,
    input
  );
  return response.data.data;
}
