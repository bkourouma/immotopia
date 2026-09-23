import apiClient from '../utils/api-client';

export type ManagementFeeBase = 'RENT_ONLY' | 'ALL_COLLECTED';

/** Paramètres financiers de l'agence — voir `lib/settings/finance-settings.ts` côté API. */
export interface AgencyFinanceSettings {
  vatRegistered: boolean;
  /** En pourcentage : 18 pour 18 %. */
  vatRate: number;
  taxpayerNumber: string | null;
  /** En pourcentage ; `null` : non paramétré. */
  managementFeeRate: number | null;
  managementFeeBase: ManagementFeeBase;
  ownerFundsAccountNumber: string | null;
  managementFeeAccountNumber: string | null;
  vatCollectedAccountNumber: string | null;
  /** Vrai tant que l'agence n'a jamais enregistré ses paramètres. */
  isDefault: boolean;
  updatedAt: string | null;
}

export type AgencyFinanceSettingsInput = Omit<AgencyFinanceSettings, 'isDefault' | 'updatedAt'>;

type ApiResponse<T> = { success: boolean; data: T };

export async function getAgencyFinanceSettings(tenantId: string): Promise<AgencyFinanceSettings> {
  const response = await apiClient.get<ApiResponse<AgencyFinanceSettings>>(`/tenants/${tenantId}/settings/finance`);
  return response.data.data;
}

export async function updateAgencyFinanceSettings(
  tenantId: string,
  input: AgencyFinanceSettingsInput
): Promise<AgencyFinanceSettings> {
  const response = await apiClient.put<ApiResponse<AgencyFinanceSettings>>(
    `/tenants/${tenantId}/settings/finance`,
    input
  );
  return response.data.data;
}
