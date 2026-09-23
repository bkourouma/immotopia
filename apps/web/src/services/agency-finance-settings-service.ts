import apiClient from '../utils/api-client';

export type ManagementFeeMode = 'PERCENT' | 'FIXED';
export type ManagementFeeBase = 'RENT_ONLY' | 'ALL_COLLECTED';

/**
 * Conditions d'honoraires de gestion — contrat Lot 2 (`lot2-contrat-api.md`).
 *
 * Même forme pour l'agence, un propriétaire ou un bail : le taux applicable à
 * un encaissement se résout dans cet ordre — conditions du bail, sinon
 * conditions du propriétaire, sinon paramètres de l'agence.
 */
export interface FeeTerms {
  managementFeeMode: ManagementFeeMode;
  /** En pourcentage ; obligatoire si `managementFeeMode` vaut `PERCENT`. */
  managementFeeRate: number | null;
  /** En FCFA, par échéance mensuelle ; obligatoire si `managementFeeMode` vaut `FIXED`. */
  managementFeeFixedAmount: number | null;
  /** Ignorée si `managementFeeMode` vaut `FIXED`. */
  managementFeeBase: ManagementFeeBase;
}

/** Paramètres financiers de l'agence — voir `lib/settings/finance-settings.ts` côté API. */
export interface AgencyFinanceSettings extends FeeTerms {
  vatRegistered: boolean;
  /** En pourcentage : 18 pour 18 %. */
  vatRate: number;
  taxpayerNumber: string | null;
  ownerFundsAccountNumber: string | null;
  managementFeeAccountNumber: string | null;
  vatCollectedAccountNumber: string | null;
  /** Vrai tant que l'agence n'a jamais enregistré ses paramètres. */
  isDefault: boolean;
  updatedAt: string | null;
}

export type AgencyFinanceSettingsInput = Omit<AgencyFinanceSettings, 'isDefault' | 'updatedAt'>;

/** Conditions d'honoraires d'un propriétaire — `GET .../settings/finance/owners`. */
export interface OwnerFeeTerms {
  ownerClientId: string;
  ownerName: string;
  email: string | null;
  leaseCount: number;
  /** `null` : le propriétaire suit les paramètres de l'agence. */
  terms: FeeTerms | null;
}

/** Part de commission d'un collaborateur — `GET .../settings/finance/agents`. */
export interface AgentCommissionShare {
  userId: string;
  fullName: string;
  email: string;
  /** Part des honoraires HT reversée au collaborateur ; `null` : aucune part. */
  sharePercent: number | null;
}

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

export async function listOwnerFeeTerms(tenantId: string): Promise<OwnerFeeTerms[]> {
  const response = await apiClient.get<ApiResponse<OwnerFeeTerms[]>>(`/tenants/${tenantId}/settings/finance/owners`);
  return response.data.data;
}

export async function updateOwnerFeeTerms(tenantId: string, ownerClientId: string, terms: FeeTerms): Promise<FeeTerms> {
  const response = await apiClient.put<ApiResponse<FeeTerms>>(
    `/tenants/${tenantId}/settings/finance/owners/${ownerClientId}`,
    terms
  );
  return response.data.data;
}

/** Supprime les conditions particulières : le propriétaire suit ensuite l'agence. */
export async function deleteOwnerFeeTerms(tenantId: string, ownerClientId: string): Promise<void> {
  await apiClient.delete(`/tenants/${tenantId}/settings/finance/owners/${ownerClientId}`);
}

export async function listAgentCommissionShares(tenantId: string): Promise<AgentCommissionShare[]> {
  const response = await apiClient.get<ApiResponse<AgentCommissionShare[]>>(
    `/tenants/${tenantId}/settings/finance/agents`
  );
  return response.data.data;
}

export async function updateAgentCommissionShare(
  tenantId: string,
  userId: string,
  sharePercent: number | null
): Promise<{ userId: string; sharePercent: number | null }> {
  const response = await apiClient.put<ApiResponse<{ userId: string; sharePercent: number | null }>>(
    `/tenants/${tenantId}/settings/finance/agents/${userId}`,
    { sharePercent }
  );
  return response.data.data;
}
