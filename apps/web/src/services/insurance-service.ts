import apiClient from '../utils/api-client';
import { filenameFromDisposition } from '../utils/save-blob';
import type {
  AttachClaimDocumentInput,
  InsuranceClaimDetailDto,
  InsuranceClaimDocumentLinkDto,
  InsuranceClaimDto,
  InsuranceClaimInput,
  InsuranceClaimStatus,
  InsuranceClaimStatusInput,
  InsuranceClaimUpdate,
  InsurancePolicyDto,
  InsurancePolicyInput,
  InsurancePolicyStatus,
  InsurancePolicyUpdate,
  MaintenanceLogCategory,
  MaintenanceLogEntryDto,
  MaintenanceLogEntryInput,
  MaintenanceLogEntryUpdate
} from '../types/insurance-types';

type ApiResponse<T> = { success: boolean; data: T };

const base = (tenantId: string) => `/tenants/${encodeURIComponent(tenantId)}/patrimoine`;
const seg = (id: string) => encodeURIComponent(id);

/** Paramètres de requête sans les valeurs vides. */
function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

// --- Polices -----------------------------------------------------------------

export async function listInsurancePolicies(
  tenantId: string,
  filters: { propertyId?: string; status?: InsurancePolicyStatus } = {}
): Promise<InsurancePolicyDto[]> {
  const response = await apiClient.get<ApiResponse<InsurancePolicyDto[]>>(
    `${base(tenantId)}/insurance/policies${query(filters)}`
  );
  return response.data.data;
}

export async function createInsurancePolicy(
  tenantId: string,
  payload: InsurancePolicyInput
): Promise<InsurancePolicyDto> {
  const response = await apiClient.post<ApiResponse<InsurancePolicyDto>>(
    `${base(tenantId)}/insurance/policies`,
    payload
  );
  return response.data.data;
}

export async function updateInsurancePolicy(
  tenantId: string,
  policyId: string,
  payload: InsurancePolicyUpdate
): Promise<InsurancePolicyDto> {
  const response = await apiClient.patch<ApiResponse<InsurancePolicyDto>>(
    `${base(tenantId)}/insurance/policies/${seg(policyId)}`,
    payload
  );
  return response.data.data;
}

export async function deleteInsurancePolicy(tenantId: string, policyId: string): Promise<void> {
  await apiClient.delete(`${base(tenantId)}/insurance/policies/${seg(policyId)}`);
}

// --- Sinistres ---------------------------------------------------------------

export async function listInsuranceClaims(
  tenantId: string,
  filters: { propertyId?: string; status?: InsuranceClaimStatus; policyId?: string; limit?: number } = {}
): Promise<InsuranceClaimDto[]> {
  const response = await apiClient.get<ApiResponse<InsuranceClaimDto[]>>(
    `${base(tenantId)}/insurance/claims${query(filters)}`
  );
  return response.data.data;
}

export async function getInsuranceClaim(tenantId: string, claimId: string): Promise<InsuranceClaimDetailDto> {
  const response = await apiClient.get<ApiResponse<InsuranceClaimDetailDto>>(
    `${base(tenantId)}/insurance/claims/${seg(claimId)}`
  );
  return response.data.data;
}

export async function createInsuranceClaim(tenantId: string, payload: InsuranceClaimInput): Promise<InsuranceClaimDto> {
  const response = await apiClient.post<ApiResponse<InsuranceClaimDto>>(`${base(tenantId)}/insurance/claims`, payload);
  return response.data.data;
}

export async function updateInsuranceClaim(
  tenantId: string,
  claimId: string,
  payload: InsuranceClaimUpdate
): Promise<InsuranceClaimDto> {
  const response = await apiClient.patch<ApiResponse<InsuranceClaimDto>>(
    `${base(tenantId)}/insurance/claims/${seg(claimId)}`,
    payload
  );
  return response.data.data;
}

export async function deleteInsuranceClaim(tenantId: string, claimId: string): Promise<void> {
  await apiClient.delete(`${base(tenantId)}/insurance/claims/${seg(claimId)}`);
}

export async function changeInsuranceClaimStatus(
  tenantId: string,
  claimId: string,
  payload: InsuranceClaimStatusInput
): Promise<InsuranceClaimDetailDto> {
  const response = await apiClient.post<ApiResponse<InsuranceClaimDetailDto>>(
    `${base(tenantId)}/insurance/claims/${seg(claimId)}/status`,
    payload
  );
  return response.data.data;
}

export async function attachClaimDocument(
  tenantId: string,
  claimId: string,
  payload: AttachClaimDocumentInput
): Promise<InsuranceClaimDocumentLinkDto> {
  const response = await apiClient.post<ApiResponse<InsuranceClaimDocumentLinkDto>>(
    `${base(tenantId)}/insurance/claims/${seg(claimId)}/documents`,
    payload
  );
  return response.data.data;
}

export async function detachClaimDocument(tenantId: string, claimId: string, linkId: string): Promise<void> {
  await apiClient.delete(`${base(tenantId)}/insurance/claims/${seg(claimId)}/documents/${seg(linkId)}`);
}

// --- Carnet d'entretien --------------------------------------------------------

export async function listMaintenanceLog(
  tenantId: string,
  propertyId: string,
  filters: { category?: MaintenanceLogCategory } = {}
): Promise<MaintenanceLogEntryDto[]> {
  const response = await apiClient.get<ApiResponse<MaintenanceLogEntryDto[]>>(
    `${base(tenantId)}/maintenance-log${query({ propertyId, ...filters })}`
  );
  return response.data.data;
}

export async function createMaintenanceLogEntry(
  tenantId: string,
  payload: MaintenanceLogEntryInput
): Promise<MaintenanceLogEntryDto> {
  const response = await apiClient.post<ApiResponse<MaintenanceLogEntryDto>>(
    `${base(tenantId)}/maintenance-log`,
    payload
  );
  return response.data.data;
}

export async function updateMaintenanceLogEntry(
  tenantId: string,
  entryId: string,
  payload: MaintenanceLogEntryUpdate
): Promise<MaintenanceLogEntryDto> {
  const response = await apiClient.patch<ApiResponse<MaintenanceLogEntryDto>>(
    `${base(tenantId)}/maintenance-log/${seg(entryId)}`,
    payload
  );
  return response.data.data;
}

export async function deleteMaintenanceLogEntry(tenantId: string, entryId: string): Promise<void> {
  await apiClient.delete(`${base(tenantId)}/maintenance-log/${seg(entryId)}`);
}

/** CSV du carnet (UTF-8 avec BOM, séparateur `;`) : à enregistrer avec `saveBlob`. */
export async function downloadMaintenanceLogCsv(
  tenantId: string,
  propertyId: string
): Promise<{ blob: Blob; filename: string }> {
  const response = await apiClient.get<Blob>(`${base(tenantId)}/maintenance-log/export${query({ propertyId })}`, {
    responseType: 'blob'
  });
  return {
    blob: response.data,
    filename: filenameFromDisposition(response.headers?.['content-disposition'], 'carnet-entretien.csv')
  };
}
