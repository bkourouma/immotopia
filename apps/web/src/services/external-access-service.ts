import apiClient from '../utils/api-client';
import type {
  CreateExternalAccessInput,
  CreateExternalAccessResult,
  ExternalAccessGrantDetail,
  ExternalAccessGrantSummary,
  ExternalAccessLogEntry,
  ExternalAccessPropertyDocument,
  ExternalAccessScopeOptions,
  ExternalAccessViewDto,
  PublicExternalAccessDownloadResult,
  PublicExternalAccessResult,
  SendExternalAccessLinkInput,
  SendExternalAccessLinkResult,
  UpdateExternalAccessInput
} from '../types/external-access';

/**
 * Services du lot B3 — accès en lecture seule des tiers de confiance (spec 034).
 *
 * Côté agence : une fonction par route de `/tenants/:tenantId/patrimoine/external-access`.
 * Côté public : le jeton part dans le CORPS d'un POST, jamais dans l'URL, sans
 * en-tête d'authentification ni cookie.
 */

type ApiResponse<T> = { success: boolean; data: T };

function base(tenantId: string): string {
  return `/tenants/${tenantId}/patrimoine/external-access`;
}

// --- Agence --------------------------------------------------------------------

export async function listExternalAccessGrants(tenantId: string): Promise<ExternalAccessGrantSummary[]> {
  const response = await apiClient.get<ApiResponse<{ items: ExternalAccessGrantSummary[] }>>(base(tenantId));
  return response.data.data.items;
}

export async function getExternalAccessScopeOptions(tenantId: string): Promise<ExternalAccessScopeOptions> {
  const response = await apiClient.get<ApiResponse<ExternalAccessScopeOptions>>(`${base(tenantId)}/scope-options`);
  return response.data.data;
}

export async function listExternalAccessPropertyDocuments(
  tenantId: string,
  propertyId: string
): Promise<ExternalAccessPropertyDocument[]> {
  const response = await apiClient.get<ApiResponse<{ items: ExternalAccessPropertyDocument[] }>>(
    `${base(tenantId)}/property-documents/${encodeURIComponent(propertyId)}`
  );
  return response.data.data.items;
}

export async function createExternalAccessGrant(
  tenantId: string,
  input: CreateExternalAccessInput
): Promise<CreateExternalAccessResult> {
  const response = await apiClient.post<ApiResponse<CreateExternalAccessResult>>(base(tenantId), input);
  return response.data.data;
}

export async function getExternalAccessGrant(tenantId: string, grantId: string): Promise<ExternalAccessGrantDetail> {
  const response = await apiClient.get<ApiResponse<ExternalAccessGrantDetail>>(
    `${base(tenantId)}/${encodeURIComponent(grantId)}`
  );
  return response.data.data;
}

export async function updateExternalAccessGrant(
  tenantId: string,
  grantId: string,
  input: UpdateExternalAccessInput
): Promise<ExternalAccessGrantDetail> {
  const response = await apiClient.patch<ApiResponse<ExternalAccessGrantDetail>>(
    `${base(tenantId)}/${encodeURIComponent(grantId)}`,
    input
  );
  return response.data.data;
}

export async function revokeExternalAccessGrant(tenantId: string, grantId: string): Promise<ExternalAccessGrantDetail> {
  const response = await apiClient.post<ApiResponse<ExternalAccessGrantDetail>>(
    `${base(tenantId)}/${encodeURIComponent(grantId)}/revoke`,
    {}
  );
  return response.data.data;
}

export async function sendExternalAccessLink(
  tenantId: string,
  grantId: string,
  input: SendExternalAccessLinkInput = {}
): Promise<SendExternalAccessLinkResult> {
  const response = await apiClient.post<ApiResponse<SendExternalAccessLinkResult>>(
    `${base(tenantId)}/${encodeURIComponent(grantId)}/send-link`,
    input
  );
  return response.data.data;
}

export async function listExternalAccessLog(
  tenantId: string,
  grantId: string,
  limit = 100
): Promise<ExternalAccessLogEntry[]> {
  const response = await apiClient.get<ApiResponse<{ items: ExternalAccessLogEntry[] }>>(
    `${base(tenantId)}/${encodeURIComponent(grantId)}/access-log?limit=${limit}`
  );
  return response.data.data.items;
}

// --- Public (sans compte) --------------------------------------------------------

/**
 * Options des appels publics. `withCredentials: false` : aucun cookie de session ;
 * `validateStatus: () => true` : un 401/404 ne passe pas par l'intercepteur de
 * l'api-client (qui redirigerait vers la connexion), l'appelant lit le statut.
 */
const PUBLIC_CALL = { withCredentials: false, validateStatus: () => true } as const;

type PublicFailure = 'invalid' | 'rate_limited' | 'unavailable';

function failureFromStatus(status: number): PublicFailure {
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'unavailable';
  // Inconnu, expiré, révoqué, corps refusé (404/400) : un seul écran.
  return 'invalid';
}

/**
 * Lit la vue d'un accès partagé par son jeton (POST corps). Le 429 donne
 * `rate_limited`, un 5xx ou une erreur réseau `unavailable`, tout autre échec
 * `invalid`.
 */
export async function fetchPublicExternalAccessView(token: string): Promise<PublicExternalAccessResult> {
  try {
    const response = await apiClient.post<ApiResponse<ExternalAccessViewDto>>(
      '/public/external-access/patrimoine',
      { token },
      PUBLIC_CALL
    );
    if (response.status === 200 && response.data?.success && response.data.data) {
      return { status: 'ok', view: response.data.data };
    }
    return { status: failureFromStatus(response.status) };
  } catch {
    return { status: 'unavailable' };
  }
}

/** Nom de fichier tiré de `Content-Disposition`, ou `null`. */
function fileNameFromDisposition(header: unknown): string | null {
  if (typeof header !== 'string') return null;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * Télécharge un document partagé (POST corps → blob). Le jeton et la référence
 * du document ne passent jamais par l'URL.
 */
export async function downloadPublicExternalAccessDocument(
  token: string,
  documentRef: string
): Promise<PublicExternalAccessDownloadResult> {
  try {
    const response = await apiClient.post<Blob>(
      '/public/external-access/documents/download',
      { token, documentRef },
      { ...PUBLIC_CALL, responseType: 'blob' }
    );
    if (response.status === 200 && response.data) {
      const headers = response.headers as Record<string, unknown> | undefined;
      return {
        status: 'ok',
        blob: response.data,
        fileName: fileNameFromDisposition(headers?.['content-disposition'])
      };
    }
    return { status: failureFromStatus(response.status) };
  } catch {
    return { status: 'unavailable' };
  }
}
