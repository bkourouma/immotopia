/**
 * Portail locataire : paiement mobile money déclaré (spec 049, famille « Déclarations »).
 * Contrat : specs/049-locatif-paiement-parite-syndic/contracts.md §1.3 à 1.5.
 *
 * La création passe toujours par `tenantPortalService.declarePayment(formData, leaseId)`
 * (route existante `POST /portal/tenant/payments/declare`, multipart) ; ce fichier porte
 * les routes NOUVELLES : disponibilité, lecture IA, mes déclarations, annulation.
 */
import apiClient from '../utils/api-client';
import type {
  DeclarePaymentAvailabilityDto,
  ProofReadResultDto,
  RentalDeclarationStatus,
  RentalPaginated,
  TenantPortalDeclarationDto
} from '../types/rental-declared-payment';

const BASE = '/portal/tenant/payments';

/** Types de capture acceptés et taille maximale (contrat §1.3, comme le Syndic). */
export const DECLARATION_PROOF_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const DECLARATION_PROOF_MAX_BYTES = 5 * 1024 * 1024;

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

const MULTIPART = { headers: { 'Content-Type': 'multipart/form-data' } };

/** `GET /payments/declare/availability` */
export async function getDeclaredPaymentAvailability(): Promise<DeclarePaymentAvailabilityDto> {
  const response = await apiClient.get<ApiResponse<DeclarePaymentAvailabilityDto>>(`${BASE}/declare/availability`);
  return response.data.data;
}

/** `POST /payments/declare/lecture` multipart, champ `proof` seul. */
export async function readPaymentProof(file: File): Promise<ProofReadResultDto> {
  const form = new FormData();
  form.append('proof', file);
  const response = await apiClient.post<ApiResponse<ProofReadResultDto>>(`${BASE}/declare/lecture`, form, MULTIPART);
  return response.data.data;
}

export interface ListMyDeclarationsParams {
  status?: RentalDeclarationStatus | 'ALL';
  page?: number;
  /** 20 par défaut, 50 au plus. */
  pageSize?: number;
}

/** `GET /payments/declarations` */
export async function listMyDeclarations(
  params: ListMyDeclarationsParams = {}
): Promise<RentalPaginated<TenantPortalDeclarationDto>> {
  const response = await apiClient.get<ApiResponse<RentalPaginated<TenantPortalDeclarationDto>>>(
    `${BASE}/declarations`,
    { params }
  );
  return response.data.data;
}

/** `POST /payments/declarations/:id/cancel`, sans corps. */
export async function cancelMyDeclaration(declarationId: string): Promise<TenantPortalDeclarationDto> {
  const response = await apiClient.post<ApiResponse<TenantPortalDeclarationDto>>(
    `${BASE}/declarations/${encodeURIComponent(declarationId)}/cancel`
  );
  return response.data.data;
}
