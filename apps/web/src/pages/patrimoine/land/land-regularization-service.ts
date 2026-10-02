import apiClient from '../../../utils/api-client';
import type {
  CreateLandRegularizationInput,
  LandCustomStepInput,
  LandRegularizationDetail,
  LandRegularizationFilters,
  LandRegularizationStatus,
  LandRegularizationSummary,
  LandStepStatus,
  LandTrack,
  UpdateLandRegularizationInput,
  UpdateLandStepInput
} from './land-types';

/**
 * Services du lot B2 — régularisation foncière.
 *
 * Une fonction par route du contrat, sous `/tenants/:tenantId/patrimoine`.
 * Réseau uniquement via `utils/api-client`.
 */

type ApiResponse<T> = { success: boolean; data: T };

function base(tenantId: string): string {
  return `/tenants/${encodeURIComponent(tenantId)}/patrimoine`;
}

function dossier(tenantId: string, regularizationId: string): string {
  return `${base(tenantId)}/land-regularizations/${encodeURIComponent(regularizationId)}`;
}

function etape(tenantId: string, regularizationId: string, stepId: string): string {
  return `${dossier(tenantId, regularizationId)}/steps/${encodeURIComponent(stepId)}`;
}

export async function listLandTracks(tenantId: string): Promise<LandTrack[]> {
  const response = await apiClient.get<ApiResponse<LandTrack[]>>(`${base(tenantId)}/land-tracks`);
  return response.data.data;
}

export async function listLandRegularizations(
  tenantId: string,
  filters?: LandRegularizationFilters
): Promise<LandRegularizationSummary[]> {
  const query = new URLSearchParams();
  if (filters?.propertyId) query.append('propertyId', filters.propertyId);
  if (filters?.status) query.append('status', filters.status);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const response = await apiClient.get<ApiResponse<LandRegularizationSummary[]>>(
    `${base(tenantId)}/land-regularizations${suffix}`
  );
  return response.data.data;
}

export async function createLandRegularization(
  tenantId: string,
  input: CreateLandRegularizationInput
): Promise<LandRegularizationDetail> {
  const response = await apiClient.post<ApiResponse<LandRegularizationDetail>>(
    `${base(tenantId)}/land-regularizations`,
    input
  );
  return response.data.data;
}

export async function getLandRegularization(
  tenantId: string,
  regularizationId: string
): Promise<LandRegularizationDetail> {
  const response = await apiClient.get<ApiResponse<LandRegularizationDetail>>(dossier(tenantId, regularizationId));
  return response.data.data;
}

export async function updateLandRegularization(
  tenantId: string,
  regularizationId: string,
  input: UpdateLandRegularizationInput
): Promise<LandRegularizationDetail> {
  const response = await apiClient.patch<ApiResponse<LandRegularizationDetail>>(
    dossier(tenantId, regularizationId),
    input
  );
  return response.data.data;
}

export async function changeLandRegularizationStatus(
  tenantId: string,
  regularizationId: string,
  status: LandRegularizationStatus,
  reason?: string
): Promise<LandRegularizationDetail> {
  const response = await apiClient.post<ApiResponse<LandRegularizationDetail>>(
    `${dossier(tenantId, regularizationId)}/status`,
    reason ? { status, reason } : { status }
  );
  return response.data.data;
}

export async function addLandStep(
  tenantId: string,
  regularizationId: string,
  input: LandCustomStepInput
): Promise<LandRegularizationDetail> {
  const response = await apiClient.post<ApiResponse<LandRegularizationDetail>>(
    `${dossier(tenantId, regularizationId)}/steps`,
    input
  );
  return response.data.data;
}

export async function updateLandStep(
  tenantId: string,
  regularizationId: string,
  stepId: string,
  input: UpdateLandStepInput
): Promise<LandRegularizationDetail> {
  const response = await apiClient.patch<ApiResponse<LandRegularizationDetail>>(
    etape(tenantId, regularizationId, stepId),
    input
  );
  return response.data.data;
}

export async function changeLandStepStatus(
  tenantId: string,
  regularizationId: string,
  stepId: string,
  status: LandStepStatus,
  reason?: string
): Promise<LandRegularizationDetail> {
  const response = await apiClient.post<ApiResponse<LandRegularizationDetail>>(
    `${etape(tenantId, regularizationId, stepId)}/status`,
    reason ? { status, reason } : { status }
  );
  return response.data.data;
}

export async function deleteLandStep(
  tenantId: string,
  regularizationId: string,
  stepId: string
): Promise<LandRegularizationDetail> {
  const response = await apiClient.delete<ApiResponse<LandRegularizationDetail>>(
    etape(tenantId, regularizationId, stepId)
  );
  return response.data.data;
}
