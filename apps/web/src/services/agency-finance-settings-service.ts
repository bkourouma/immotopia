import apiClient from '../utils/api-client';

export type ManagementFeeMode = 'PERCENT' | 'FIXED';
export type ManagementFeeBase = 'RENT_ONLY' | 'ALL_COLLECTED';
/** À qui reviennent les pénalités de retard encaissées. */
export type PenaltyBeneficiary = 'OWNER' | 'AGENCY';
/** Statut fiscal d'un propriétaire, pour la retenue à la source sur loyers. */
export type OwnerTaxStatus = 'INDIVIDUAL' | 'COMPANY' | 'EXEMPT';

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
  /** Compte de charge pour un écart de caisse en moins (manquant), défaut 6588. */
  cashShortageAccountNumber: string | null;
  /** Compte de produit pour un écart de caisse en plus (excédent), défaut 7588. */
  cashSurplusAccountNumber: string | null;
  /** À qui reviennent les pénalités de retard encaissées. */
  penaltyBeneficiary: PenaltyBeneficiary;
  /** Compte de produit, requis quand les pénalités reviennent à l'agence. */
  penaltyIncomeAccountNumber: string | null;
  /** Retenue à la source sur loyers : désactivée tant que le cabinet ne l'a pas confirmée. */
  withholdingEnabled: boolean;
  /** En pourcentage, propriétaire personne physique. */
  withholdingRateIndividual: number;
  /** En pourcentage, propriétaire personne morale. */
  withholdingRateCompany: number;
  withholdingAccountNumber: string | null;
  /** AAAA-MM-JJ. Premier jour d'encaissement soumis à la retenue ; requis si `withholdingEnabled`. */
  withholdingStartsOn: string | null;
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
  /** Statut fiscal pour la retenue à la source sur loyers ; `null` : non renseigné. */
  ownerTaxStatus: OwnerTaxStatus | null;
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

/** Corps de `PUT .../settings/finance/owners/:ownerClientId` : conditions d'honoraires + statut fiscal. */
export type OwnerFeeTermsInput = FeeTerms & { ownerTaxStatus: OwnerTaxStatus | null };

export async function updateOwnerFeeTerms(
  tenantId: string,
  ownerClientId: string,
  terms: OwnerFeeTermsInput
): Promise<OwnerFeeTermsInput> {
  const response = await apiClient.put<ApiResponse<OwnerFeeTermsInput>>(
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
