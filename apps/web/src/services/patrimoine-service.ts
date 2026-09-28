import apiClient from '../utils/api-client';
import {
  AssetValuation,
  OwnerStatement,
  PatrimoineOverviewData,
  PropertyExpense,
  PropertyLoan,
  PropertyYieldData,
  WorkProgram
} from '../types/patrimoine-types';

type ApiResponse<T> = { success: boolean; data: T };
type YieldAssumptions = {
  years?: number;
  valueGrowthRate?: number;
  rentGrowthRate?: number;
  expenseGrowthRate?: number;
  vacancyRate?: number;
};

function buildYieldQuery(assumptions?: YieldAssumptions): string {
  if (!assumptions) return '';
  const params = new URLSearchParams();
  if (typeof assumptions.years === 'number') params.set('years', String(assumptions.years));
  if (typeof assumptions.valueGrowthRate === 'number')
    params.set('valueGrowthRate', String(assumptions.valueGrowthRate));
  if (typeof assumptions.rentGrowthRate === 'number') params.set('rentGrowthRate', String(assumptions.rentGrowthRate));
  if (typeof assumptions.expenseGrowthRate === 'number')
    params.set('expenseGrowthRate', String(assumptions.expenseGrowthRate));
  if (typeof assumptions.vacancyRate === 'number') params.set('vacancyRate', String(assumptions.vacancyRate));
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

export async function getPatrimoineOverview(tenantId: string): Promise<PatrimoineOverviewData> {
  const response = await apiClient.get<ApiResponse<PatrimoineOverviewData>>(`/tenants/${tenantId}/patrimoine/overview`);
  return response.data.data;
}

export async function getPatrimoinePerformance(tenantId: string, propertyId?: string, assumptions?: YieldAssumptions) {
  const query = new URLSearchParams();
  if (propertyId) query.set('propertyId', propertyId);
  if (assumptions?.years !== undefined) query.set('years', String(assumptions.years));
  if (assumptions?.valueGrowthRate !== undefined) query.set('valueGrowthRate', String(assumptions.valueGrowthRate));
  if (assumptions?.rentGrowthRate !== undefined) query.set('rentGrowthRate', String(assumptions.rentGrowthRate));
  if (assumptions?.expenseGrowthRate !== undefined)
    query.set('expenseGrowthRate', String(assumptions.expenseGrowthRate));
  if (assumptions?.vacancyRate !== undefined) query.set('vacancyRate', String(assumptions.vacancyRate));
  const encoded = query.toString();
  const response = await apiClient.get<ApiResponse<any>>(
    `/tenants/${tenantId}/patrimoine/performance${encoded ? `?${encoded}` : ''}`
  );
  return response.data.data;
}

export async function getPropertyYield(
  tenantId: string,
  propertyId: string,
  assumptions?: YieldAssumptions
): Promise<PropertyYieldData> {
  const response = await apiClient.get<ApiResponse<PropertyYieldData>>(
    `/tenants/${tenantId}/properties/${propertyId}/yield${buildYieldQuery(assumptions)}`
  );
  return response.data.data;
}

export async function listValuations(tenantId: string, propertyId: string): Promise<AssetValuation[]> {
  const response = await apiClient.get<ApiResponse<AssetValuation[]>>(
    `/tenants/${tenantId}/properties/${propertyId}/valuations`
  );
  return response.data.data;
}

export async function createValuation(tenantId: string, propertyId: string, payload: Record<string, unknown>) {
  const response = await apiClient.post<ApiResponse<AssetValuation>>(
    `/tenants/${tenantId}/properties/${propertyId}/valuations`,
    payload
  );
  return response.data.data;
}

export async function updateValuation(
  tenantId: string,
  propertyId: string,
  valuationId: string,
  payload: Record<string, unknown>
) {
  const response = await apiClient.patch<ApiResponse<AssetValuation>>(
    `/tenants/${tenantId}/properties/${propertyId}/valuations/${valuationId}`,
    payload
  );
  return response.data.data;
}

export async function deleteValuation(tenantId: string, propertyId: string, valuationId: string): Promise<void> {
  await apiClient.delete(`/tenants/${tenantId}/properties/${propertyId}/valuations/${valuationId}`);
}

export async function listExpenses(tenantId: string, propertyId: string): Promise<PropertyExpense[]> {
  const response = await apiClient.get<ApiResponse<PropertyExpense[]>>(
    `/tenants/${tenantId}/properties/${propertyId}/expenses`
  );
  return response.data.data;
}

export async function createExpense(tenantId: string, propertyId: string, payload: Record<string, unknown>) {
  const response = await apiClient.post<ApiResponse<PropertyExpense>>(
    `/tenants/${tenantId}/properties/${propertyId}/expenses`,
    payload
  );
  return response.data.data;
}

export async function updateExpense(
  tenantId: string,
  propertyId: string,
  expenseId: string,
  payload: Record<string, unknown>
) {
  const response = await apiClient.patch<ApiResponse<PropertyExpense>>(
    `/tenants/${tenantId}/properties/${propertyId}/expenses/${expenseId}`,
    payload
  );
  return response.data.data;
}

export async function deleteExpense(tenantId: string, propertyId: string, expenseId: string): Promise<void> {
  await apiClient.delete(`/tenants/${tenantId}/properties/${propertyId}/expenses/${expenseId}`);
}

export async function listLoans(tenantId: string, propertyId: string): Promise<PropertyLoan[]> {
  const response = await apiClient.get<ApiResponse<PropertyLoan[]>>(
    `/tenants/${tenantId}/properties/${propertyId}/loans`
  );
  return response.data.data;
}

export async function createLoan(tenantId: string, propertyId: string, payload: Record<string, unknown>) {
  const response = await apiClient.post<ApiResponse<PropertyLoan>>(
    `/tenants/${tenantId}/properties/${propertyId}/loans`,
    payload
  );
  return response.data.data;
}

export async function updateLoan(
  tenantId: string,
  propertyId: string,
  loanId: string,
  payload: Record<string, unknown>
) {
  const response = await apiClient.patch<ApiResponse<PropertyLoan>>(
    `/tenants/${tenantId}/properties/${propertyId}/loans/${loanId}`,
    payload
  );
  return response.data.data;
}

export async function deleteLoan(tenantId: string, propertyId: string, loanId: string): Promise<void> {
  await apiClient.delete(`/tenants/${tenantId}/properties/${propertyId}/loans/${loanId}`);
}

export async function listWorkPrograms(tenantId: string, propertyId: string): Promise<WorkProgram[]> {
  const response = await apiClient.get<ApiResponse<WorkProgram[]>>(
    `/tenants/${tenantId}/properties/${propertyId}/work-programs`
  );
  return response.data.data;
}

/** Un programme de travaux, accompagné du bien auquel il se rapporte. */
export interface WorkProgramAvecBien extends WorkProgram {
  property?: { id: string; title: string; internalReference: string } | null;
}

export interface TenantWorkProgramsResponse {
  items: WorkProgramAvecBien[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Tous les programmes de travaux d'une agence, en UNE requête (§8.4).
 *
 * Remplace un N+1 que la spécification chiffre : les deux écrans Patrimoine
 * chargeaient jusqu'à 100 biens, puis lançaient une requête de travaux **par
 * bien** — jusqu'à 101 requêtes au montage. Le filtrage par statut et la
 * pagination se font côté serveur ; `property` est joint, ce qui évite un
 * second appel pour afficher le nom du bien.
 *
 * Endpoint livré au commit `75f910b`. `upcoming` ne garde que les programmes
 * planifiés ou en cours, triés par date de début prévue croissante.
 */
export async function listTenantWorkPrograms(
  tenantId: string,
  filtres?: { status?: string; upcoming?: boolean; page?: number; limit?: number }
): Promise<TenantWorkProgramsResponse> {
  const params = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(filtres ?? {})) {
    if (valeur === undefined || valeur === null || valeur === '') continue;
    params.append(cle, String(valeur));
  }

  const response = await apiClient.get<ApiResponse<TenantWorkProgramsResponse>>(
    `/tenants/${tenantId}/work-programs?${params.toString()}`
  );
  return response.data.data;
}

export async function createWorkProgram(tenantId: string, propertyId: string, payload: Record<string, unknown>) {
  const response = await apiClient.post<ApiResponse<WorkProgram>>(
    `/tenants/${tenantId}/properties/${propertyId}/work-programs`,
    payload
  );
  return response.data.data;
}

export async function updateWorkProgram(
  tenantId: string,
  propertyId: string,
  programId: string,
  payload: Record<string, unknown>
) {
  const response = await apiClient.patch<ApiResponse<WorkProgram>>(
    `/tenants/${tenantId}/properties/${propertyId}/work-programs/${programId}`,
    payload
  );
  return response.data.data;
}

export async function deleteWorkProgram(tenantId: string, propertyId: string, programId: string): Promise<void> {
  await apiClient.delete(`/tenants/${tenantId}/properties/${propertyId}/work-programs/${programId}`);
}

export async function listOwnerStatements(tenantId: string): Promise<OwnerStatement[]> {
  const response = await apiClient.get<ApiResponse<OwnerStatement[]>>(`/tenants/${tenantId}/owner-statements`);
  return response.data.data;
}

export async function createOwnerStatement(tenantId: string, payload: Record<string, unknown>) {
  const response = await apiClient.post<ApiResponse<OwnerStatement>>(`/tenants/${tenantId}/owner-statements`, payload);
  return response.data.data;
}

export async function getOwnerStatementById(tenantId: string, statementId: string): Promise<OwnerStatement> {
  const response = await apiClient.get<ApiResponse<OwnerStatement>>(
    `/tenants/${tenantId}/owner-statements/${statementId}`
  );
  return response.data.data;
}

/** Recalcule un relevé avec ses propres biens et son propre mois. */
export async function recomputeOwnerStatement(tenantId: string, statementId: string): Promise<OwnerStatement> {
  const response = await apiClient.post<ApiResponse<OwnerStatement>>(
    `/tenants/${tenantId}/owner-statements/${statementId}/recompute`
  );
  return response.data.data;
}

export async function sendOwnerStatement(tenantId: string, statementId: string) {
  const response = await apiClient.post<ApiResponse<{ sent: boolean; reason?: string; whatsappSent?: boolean }>>(
    `/tenants/${tenantId}/owner-statements/${statementId}/send`
  );
  return response.data.data;
}
