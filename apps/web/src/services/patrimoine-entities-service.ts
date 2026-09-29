import apiClient from '../utils/api-client';
import type {
  CreateHoldingEntityInput,
  EntityConsolidation,
  EntityHolding,
  EntityHoldingInput,
  EntityHoldingUpdateInput,
  EntityTaxEstimate,
  HoldingEntitiesFilters,
  HoldingEntityDetail,
  HoldingEntitySummary,
  PropertyHoldingsData,
  PropertyHoldingsInput,
  PropertyTaxEstimate,
  PropertyTaxProfileData,
  PropertyTaxProfileInput,
  TaxParametersData,
  UpdateHoldingEntityInput
} from '../types/patrimoine-entities-types';

/**
 * Services du lot P4 — entités détentrices et fiscalité CI/ML.
 *
 * Une fonction par route de `p4-contrat.md` §3, sous
 * `/tenants/:tenantId/patrimoine`. Réseau uniquement via `utils/api-client`.
 */

type ApiResponse<T> = { success: boolean; data: T };

function base(tenantId: string): string {
  return `/tenants/${tenantId}/patrimoine`;
}

function buildQuery(params: Record<string, unknown>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    query.append(key, String(value));
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
}

// --- Entités détentrices -------------------------------------------------

export async function listHoldingEntities(
  tenantId: string,
  filters?: HoldingEntitiesFilters
): Promise<HoldingEntitySummary[]> {
  const query = buildQuery({
    search: filters?.search,
    legalForm: filters?.legalForm,
    country: filters?.country,
    includeInactive: filters?.includeInactive ? 'true' : undefined
  });
  const response = await apiClient.get<ApiResponse<HoldingEntitySummary[]>>(`${base(tenantId)}/entities${query}`);
  return response.data.data;
}

export async function createHoldingEntity(
  tenantId: string,
  payload: CreateHoldingEntityInput
): Promise<HoldingEntityDetail> {
  const response = await apiClient.post<ApiResponse<HoldingEntityDetail>>(`${base(tenantId)}/entities`, payload);
  return response.data.data;
}

export async function getHoldingEntity(tenantId: string, entityId: string): Promise<HoldingEntityDetail> {
  const response = await apiClient.get<ApiResponse<HoldingEntityDetail>>(`${base(tenantId)}/entities/${entityId}`);
  return response.data.data;
}

export async function updateHoldingEntity(
  tenantId: string,
  entityId: string,
  payload: UpdateHoldingEntityInput
): Promise<HoldingEntityDetail> {
  const response = await apiClient.patch<ApiResponse<HoldingEntityDetail>>(
    `${base(tenantId)}/entities/${entityId}`,
    payload
  );
  return response.data.data;
}

export async function deleteHoldingEntity(tenantId: string, entityId: string): Promise<void> {
  await apiClient.delete(`${base(tenantId)}/entities/${entityId}`);
}

export async function addEntityHolding(
  tenantId: string,
  entityId: string,
  payload: EntityHoldingInput
): Promise<EntityHolding> {
  const response = await apiClient.post<ApiResponse<EntityHolding>>(
    `${base(tenantId)}/entities/${entityId}/holdings`,
    payload
  );
  return response.data.data;
}

export async function updateEntityHolding(
  tenantId: string,
  entityId: string,
  holdingId: string,
  payload: EntityHoldingUpdateInput
): Promise<EntityHolding> {
  const response = await apiClient.patch<ApiResponse<EntityHolding>>(
    `${base(tenantId)}/entities/${entityId}/holdings/${holdingId}`,
    payload
  );
  return response.data.data;
}

export async function removeEntityHolding(tenantId: string, entityId: string, holdingId: string): Promise<void> {
  await apiClient.delete(`${base(tenantId)}/entities/${entityId}/holdings/${holdingId}`);
}

export async function getEntityConsolidation(tenantId: string, entityId: string): Promise<EntityConsolidation> {
  const response = await apiClient.get<ApiResponse<EntityConsolidation>>(
    `${base(tenantId)}/entities/${entityId}/consolidation`
  );
  return response.data.data;
}

export async function getEntityTaxEstimate(
  tenantId: string,
  entityId: string,
  year?: number
): Promise<EntityTaxEstimate> {
  const query = buildQuery({ year });
  const response = await apiClient.get<ApiResponse<EntityTaxEstimate>>(
    `${base(tenantId)}/entities/${entityId}/tax-estimate${query}`
  );
  return response.data.data;
}

// --- Rattachements et profil fiscal d'un bien -----------------------------

export async function getPropertyHoldings(tenantId: string, propertyId: string): Promise<PropertyHoldingsData> {
  const response = await apiClient.get<ApiResponse<PropertyHoldingsData>>(
    `${base(tenantId)}/properties/${propertyId}/holdings`
  );
  return response.data.data;
}

export async function setPropertyHoldings(
  tenantId: string,
  propertyId: string,
  payload: PropertyHoldingsInput
): Promise<PropertyHoldingsData> {
  const response = await apiClient.put<ApiResponse<PropertyHoldingsData>>(
    `${base(tenantId)}/properties/${propertyId}/holdings`,
    payload
  );
  return response.data.data;
}

export async function getPropertyTaxProfile(tenantId: string, propertyId: string): Promise<PropertyTaxProfileData> {
  const response = await apiClient.get<ApiResponse<PropertyTaxProfileData>>(
    `${base(tenantId)}/properties/${propertyId}/tax-profile`
  );
  return response.data.data;
}

export async function setPropertyTaxProfile(
  tenantId: string,
  propertyId: string,
  payload: PropertyTaxProfileInput
): Promise<PropertyTaxProfileData> {
  const response = await apiClient.put<ApiResponse<PropertyTaxProfileData>>(
    `${base(tenantId)}/properties/${propertyId}/tax-profile`,
    payload
  );
  return response.data.data;
}

export async function getPropertyTaxEstimate(
  tenantId: string,
  propertyId: string,
  params?: { year?: number; country?: string }
): Promise<PropertyTaxEstimate> {
  const query = buildQuery({ year: params?.year, country: params?.country });
  const response = await apiClient.get<ApiResponse<PropertyTaxEstimate>>(
    `${base(tenantId)}/properties/${propertyId}/tax-estimate${query}`
  );
  return response.data.data;
}

// --- Paramètres fiscaux ---------------------------------------------------

export async function getTaxParameters(
  tenantId: string,
  params: { country?: string; year?: number }
): Promise<TaxParametersData> {
  const query = buildQuery({ country: params.country, year: params.year });
  const response = await apiClient.get<ApiResponse<TaxParametersData>>(`${base(tenantId)}/tax-parameters${query}`);
  return response.data.data;
}
