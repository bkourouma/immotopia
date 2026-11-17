import apiClient from '../utils/api-client';

/**
 * Formulaires paramétrables — routes du contrat §5
 * (`docs/architecture/FORMULAIRES_PARAMETRABLES_CONTRAT.md`).
 */

export type FieldMode = 'REQUIRED' | 'OPTIONAL' | 'HIDDEN';
/** `GATED` : réglable après déverrouillage par ImmoTopia ; `OPEN` : réglable par l'agence. */
export type FieldClass = 'GATED' | 'OPEN';
export type FormAudience = 'agency' | 'coowner-portal' | 'tenant-portal' | 'owner-portal';

export interface FormSettingsField {
  key: string;
  label: string;
  /** « Ce qui casse » si le champ change de mode, en français. */
  consequence: string;
  fieldClass: FieldClass;
  defaultMode: FieldMode;
  allowedModes: FieldMode[];
  /** Mode effectif. */
  mode: FieldMode;
  /** Réglage enregistré par l'agence ; `null` : aucun. */
  storedMode: FieldMode | null;
  /** Déverrouillage accordé par ImmoTopia (significatif pour `GATED`). */
  unlocked: boolean;
}

export interface FormSettingsForm {
  formKey: string;
  module: string;
  label: string;
  audience: FormAudience;
  fields: FormSettingsField[];
}

export interface FormSettingsResponse {
  forms: FormSettingsForm[];
}

export interface FormModesResponse {
  formKey: string;
  fields: Record<string, FieldMode>;
}

export interface FormUnlockEntry {
  formKey: string;
  formLabel: string;
  module: string;
  fieldKey: string;
  fieldLabel: string;
  consequence: string;
  unlocked: boolean;
  /** Auteur du déverrouillage (réponse de `splitAuthor`, côté API). */
  unlockedBy?: { id: string; firstName: string; lastName: string; email: string } | null;
  unlockedAt?: string | null;
  reason?: string | null;
}

type ApiResponse<T> = { success: boolean; data: T };

export async function getFormSettings(tenantId: string): Promise<FormSettingsResponse> {
  const response = await apiClient.get<ApiResponse<FormSettingsResponse | FormSettingsForm[]>>(
    `/tenants/${tenantId}/settings/forms`
  );
  const data = response.data.data;
  return Array.isArray(data) ? { forms: data } : data;
}

/** `null` : revenir au défaut du champ. */
export async function updateFormSettings(
  tenantId: string,
  formKey: string,
  fields: Record<string, FieldMode | null>
): Promise<void> {
  await apiClient.put(`/tenants/${tenantId}/settings/forms/${encodeURIComponent(formKey)}`, { fields });
}

export async function getFormModes(tenantId: string, formKey: string): Promise<FormModesResponse> {
  const response = await apiClient.get<ApiResponse<FormModesResponse>>(
    `/tenants/${tenantId}/forms/${encodeURIComponent(formKey)}/modes`
  );
  return response.data.data;
}

/** Portail copropriétaire : l'agence est portée par `X-Portal-Tenant-Id` (api-client). */
export async function getPortalFormModes(formKey: string): Promise<FormModesResponse> {
  const response = await apiClient.get<ApiResponse<FormModesResponse>>(
    `/portal/copropriete/forms/${encodeURIComponent(formKey)}/modes`
  );
  return response.data.data;
}

export async function getFormUnlocks(tenantId: string): Promise<FormUnlockEntry[]> {
  const response = await apiClient.get<ApiResponse<FormUnlockEntry[] | { entries: FormUnlockEntry[] }>>(
    `/admin/tenants/${tenantId}/form-unlocks`
  );
  const data = response.data.data;
  return Array.isArray(data) ? data : data.entries;
}

export async function setFormUnlock(
  tenantId: string,
  input: { formKey: string; fieldKey: string; unlocked: boolean; reason?: string }
): Promise<void> {
  await apiClient.put(`/admin/tenants/${tenantId}/form-unlocks`, input);
}
