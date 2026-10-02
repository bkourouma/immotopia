import apiClient from '../utils/api-client';
import type {
  CashPlanData,
  CashPlanQuery,
  CashPlanSettingsData,
  CashPlanSettingsInput
} from '../types/cash-plan-types';

type ApiResponse<T> = { success: boolean; data: T };

/** Plan de trésorerie prévisionnel de l'agence ; `openingBalance` n'est envoyé que s'il est saisi. */
export async function getCashPlan(tenantId: string, query: CashPlanQuery): Promise<CashPlanData> {
  const params: Record<string, string | number> = { months: query.months };
  if (typeof query.openingBalance === 'number' && Number.isFinite(query.openingBalance)) {
    params.openingBalance = query.openingBalance;
  }
  if (query.propertyId) params.propertyId = query.propertyId;
  const response = await apiClient.get<ApiResponse<CashPlanData>>(`/tenants/${tenantId}/patrimoine/cash-plan`, {
    params
  });
  return response.data.data;
}

/** Date d'exigibilité de la taxe foncière (mois et jour) ; deux `null` l'effacent. */
export async function updateCashPlanSettings(
  tenantId: string,
  input: CashPlanSettingsInput
): Promise<CashPlanSettingsData> {
  const response = await apiClient.put<ApiResponse<CashPlanSettingsData>>(
    `/tenants/${tenantId}/patrimoine/cash-plan/settings`,
    input
  );
  return response.data.data;
}
