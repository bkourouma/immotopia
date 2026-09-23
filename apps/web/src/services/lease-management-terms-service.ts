import apiClient from '../utils/api-client';

// Une seule définition des conditions d'honoraires pour tout le front : celle
// des paramètres de l'agence, que les trois niveaux partagent.
import type { FeeTerms } from './agency-finance-settings-service';
export type { FeeTerms, ManagementFeeBase, ManagementFeeMode } from './agency-finance-settings-service';

export type FeeTermsSource = 'LEASE' | 'OWNER' | 'AGENCY';

/** Honoraires applicables à un encaissement, avec leur origine — ou `NONE` si rien n'est paramétré. */
export type EffectiveFeeTerms = (FeeTerms & { source: FeeTermsSource }) | { source: 'NONE' };

export interface LeaseManagementAgent {
  userId: string;
  fullName: string;
}

export interface LeaseManagementTerms {
  leaseId: string;
  ownerClientId: string | null;
  /** Conditions propres à ce bail ; `null` s'il n'y en a pas. */
  override: FeeTerms | null;
  /** Gestionnaire du bail. */
  agentUserId: string | null;
  effective: EffectiveFeeTerms;
  /** Collaborateurs sélectionnables comme gestionnaire. */
  agents: LeaseManagementAgent[];
}

export interface UpdateLeaseManagementTermsInput {
  override: FeeTerms | null;
  agentUserId: string | null;
}

type ApiResponse<T> = { success: boolean; data: T };

export async function getLeaseManagementTerms(tenantId: string, leaseId: string): Promise<LeaseManagementTerms> {
  const response = await apiClient.get<ApiResponse<LeaseManagementTerms>>(
    `/tenants/${tenantId}/rental/leases/${leaseId}/management-terms`
  );
  return response.data.data;
}

export async function updateLeaseManagementTerms(
  tenantId: string,
  leaseId: string,
  input: UpdateLeaseManagementTermsInput
): Promise<LeaseManagementTerms> {
  const response = await apiClient.put<ApiResponse<LeaseManagementTerms>>(
    `/tenants/${tenantId}/rental/leases/${leaseId}/management-terms`,
    input
  );
  return response.data.data;
}
