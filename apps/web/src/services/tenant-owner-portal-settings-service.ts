import apiClient from '../utils/api-client';

/**
 * Réglage d'agence du portail propriétaire — lot P5, carte « Portail
 * propriétaire » de la page « Paramètres de l'agence ».
 *
 * Modèle `OwnerPortalSettings`, un par agence au plus. Tant qu'il n'existe
 * pas, l'API renvoie des valeurs par défaut sans rien écrire (même patron
 * que `agency-finance-settings-service.ts`).
 */
export interface OwnerPortalSettings {
  patrimonyEnabled: boolean;
  patrimonyShowValuation: boolean;
  patrimonyShowYield: boolean;
  patrimonyShowLoans: boolean;
  patrimonyShowWorks: boolean;
  patrimonyShowDocuments: boolean;
}

export type OwnerPortalSettingsInput = Partial<OwnerPortalSettings>;

type ApiResponse<T> = { success: boolean; data: T };

export async function getOwnerPortalSettings(tenantId: string): Promise<OwnerPortalSettings> {
  const response = await apiClient.get<ApiResponse<OwnerPortalSettings>>(`/tenants/${tenantId}/settings/owner-portal`);
  return response.data.data;
}

export async function updateOwnerPortalSettings(
  tenantId: string,
  input: OwnerPortalSettingsInput
): Promise<OwnerPortalSettings> {
  const response = await apiClient.put<ApiResponse<OwnerPortalSettings>>(
    `/tenants/${tenantId}/settings/owner-portal`,
    input
  );
  return response.data.data;
}
