import apiClient from '../utils/api-client';

/**
 * SMS — Lot SMS-1, fournisseur Orange, un seul compte au nom d'ImmoTopia.
 *
 * Contrat gelé entre le backend et ce frontend (`specs/020-fournisseur-sms/spec.md`).
 * Écrit contre le contrat pendant que l'API est développée en parallèle : mêmes
 * types, mêmes routes, même enveloppe `{ success, data }` que les autres
 * services (`payment-gateway-service.ts`, `admin-subscription-service.ts`).
 *
 * Décision produit : l'agence ne saisit aucun identifiant Orange. Ses réglages
 * (activé, nom d'expéditeur, quota mensuel) sont fixés par le super-admin ;
 * l'agence les voit en lecture seule (`getTenantSmsOverview`).
 */

export type SmsProviderKind = 'orange' | 'log';
export type SmsMessageStatus = 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED';

type ApiResponse<T> = { success: boolean; data: T };

/**
 * `GET /tenants/:tenantId/settings/sms` (agence) et
 * `GET /admin/tenants/:tenantId/sms` (super-admin) — même forme des deux côtés.
 */
export interface TenantSmsOverview {
  enabled: boolean;
  /** Nom effectif, chaîne vide si aucun n'est configuré. */
  senderName: string;
  /** Vrai quand `senderName` est le nom de la plateforme, pas un nom propre à l'agence. */
  senderNameIsDefault: boolean;
  monthlyQuota: number;
  /** Vrai quand `monthlyQuota` est le quota par défaut de la plateforme. */
  monthlyQuotaIsDefault: boolean;
  usedThisMonth: number;
  remainingThisMonth: number;
  provider: SmsProviderKind;
  /** Faux si le compte Orange de la plateforme n'est pas configuré côté serveur. */
  platformConfigured: boolean;
}

/** `GET /admin/sms/platform` — statut et solde du compte Orange unique de la plateforme. */
export interface PlatformSmsStatus {
  provider: SmsProviderKind;
  configured: boolean;
  senderAddress: string;
  platformSenderName: string;
  balance: {
    contracts: Array<{ country?: string; availableUnits: number; expiresAt: string | null; status?: string }>;
  } | null;
  error: string | null;
}

/** `POST /admin/sms/platform/test` — jamais un 500 : un échec de connexion donne `ok: false`. */
export interface PlatformSmsTestResult {
  ok: boolean;
  message: string;
}

/**
 * Corps de `PATCH /admin/tenants/:tenantId/sms`, partiel.
 *
 * `null` sur `senderName` ou `monthlyQuota` signifie « revenir à la valeur de
 * la plateforme », pas « ne pas modifier » — l'absence du champ, elle, laisse
 * la valeur actuelle inchangée.
 */
export interface UpdateTenantSmsSettings {
  enabled?: boolean;
  senderName?: string | null;
  monthlyQuota?: number | null;
}

/** `POST /admin/tenants/:tenantId/sms/test` — 400 si le numéro est invalide, 409 si le quota est épuisé. */
export interface SmsMessageDto {
  id: string;
  to: string;
  body: string;
  senderName: string | null;
  status: SmsMessageStatus;
  provider: SmsProviderKind;
  providerMessageId: string | null;
  errorMessage: string | null;
  createdAt: string;
  sentAt: string | null;
}

export interface SendTestSms {
  to: string;
  body?: string;
}

// ==================== Agence ====================

export async function getTenantSmsOverview(tenantId: string): Promise<TenantSmsOverview> {
  const response = await apiClient.get<ApiResponse<TenantSmsOverview>>(`/tenants/${tenantId}/settings/sms`);
  return response.data.data;
}

// ==================== Super-admin — compte de la plateforme ====================

export async function getPlatformSmsStatus(): Promise<PlatformSmsStatus> {
  const response = await apiClient.get<ApiResponse<PlatformSmsStatus>>('/admin/sms/platform');
  return response.data.data;
}

export async function testPlatformSmsConnection(): Promise<PlatformSmsTestResult> {
  const response = await apiClient.post<ApiResponse<PlatformSmsTestResult>>('/admin/sms/platform/test');
  return response.data.data;
}

// ==================== Super-admin — réglages d'une agence ====================

export async function getAdminTenantSms(tenantId: string): Promise<TenantSmsOverview> {
  const response = await apiClient.get<ApiResponse<TenantSmsOverview>>(`/admin/tenants/${tenantId}/sms`);
  return response.data.data;
}

export async function updateAdminTenantSms(
  tenantId: string,
  input: UpdateTenantSmsSettings
): Promise<TenantSmsOverview> {
  const response = await apiClient.patch<ApiResponse<TenantSmsOverview>>(`/admin/tenants/${tenantId}/sms`, input);
  return response.data.data;
}

export async function sendAdminTenantSmsTest(tenantId: string, input: SendTestSms): Promise<SmsMessageDto> {
  const response = await apiClient.post<ApiResponse<SmsMessageDto>>(`/admin/tenants/${tenantId}/sms/test`, input);
  return response.data.data;
}
