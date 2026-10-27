import apiClient from '../utils/api-client';
import { API_URL } from '../config/api';
import { getStoredActiveTenantId } from '../utils/active-tenant';
import type {
  CreateSignatureRequestInput,
  ListSignaturesFilters,
  PublicFailure,
  PublicOtpResult,
  PublicSignatureDto,
  PublicSignInput,
  PublicSignOutcome,
  PublicVerifyResult,
  RemindOutcome,
  SignatureKind,
  SignatureRequestDto,
  SignatureTargetContext
} from '../types/signature-types';

/** Les réponses sont lues enveloppées (`{ success, data }`) ou nues, selon la route. */
function unwrap<T>(body: unknown): T {
  const wrapped = body as { data?: T } | null | undefined;
  return (
    wrapped && typeof wrapped === 'object' && 'data' in wrapped && wrapped.data !== undefined ? wrapped.data : body
  ) as T;
}

/* ------------------------------------------------------------------ agence */

/**
 * Les routes plates `/signatures` ne portent pas l'agence : un utilisateur de
 * plusieurs agences la passe en `?tenantId=` (l'API l'impose, sinon elle
 * retient l'unique adhésion active). Aucune valeur mémorisée : rien n'est envoyé.
 */
function tenantParams(): { tenantId?: string } {
  const tenantId = getStoredActiveTenantId();
  return tenantId ? { tenantId } : {};
}

/** Signataires proposés pour une cible : la cible est vérifiée côté API (agence, statut). */
export async function fetchSignatureContext(kind: SignatureKind, targetId: string): Promise<SignatureTargetContext> {
  const response = await apiClient.get(
    `/signatures/targets/${encodeURIComponent(kind)}/${encodeURIComponent(targetId)}/context`,
    { params: tenantParams() }
  );
  return unwrap<SignatureTargetContext>(response.data);
}

export async function createSignatureRequest(input: CreateSignatureRequestInput): Promise<SignatureRequestDto> {
  const response = await apiClient.post('/signatures', input, { params: tenantParams() });
  return unwrap<SignatureRequestDto>(response.data);
}

export async function listSignatureRequests(filters: ListSignaturesFilters = {}): Promise<SignatureRequestDto[]> {
  const response = await apiClient.get('/signatures', { params: { ...tenantParams(), ...filters } });
  const body = unwrap<SignatureRequestDto[] | { items: SignatureRequestDto[] }>(response.data);
  return Array.isArray(body) ? body : (body?.items ?? []);
}

export async function cancelSignatureRequest(id: string): Promise<SignatureRequestDto> {
  const response = await apiClient.post(`/signatures/${encodeURIComponent(id)}/cancel`, undefined, {
    params: tenantParams()
  });
  return unwrap<SignatureRequestDto>(response.data);
}

/** Relance : l'API renvoie `{ reminded, failed }` (nombres ou listes). */
export async function remindSignatureRequest(id: string): Promise<RemindOutcome> {
  const response = await apiClient.post(`/signatures/${encodeURIComponent(id)}/remind`, undefined, {
    params: tenantParams()
  });
  const body = unwrap<{ reminded?: number | unknown[]; failed?: number | unknown[] } | null>(response.data);
  const count = (value: unknown) => (Array.isArray(value) ? value.length : Number(value) || 0);
  return { reminded: count(body?.reminded), failed: count(body?.failed) };
}

/**
 * Réémet le jeton « sur place » d'un signataire : la liste ne le renvoie jamais,
 * seules la création de la demande et cette route le donnent.
 */
export async function reissueInPersonToken(requestId: string, signerId: string): Promise<{ inPersonUrlToken: string }> {
  const response = await apiClient.post(
    `/signatures/${encodeURIComponent(requestId)}/signers/${encodeURIComponent(signerId)}/in-person-token`,
    undefined,
    { params: tenantParams() }
  );
  return unwrap<{ inPersonUrlToken: string }>(response.data);
}

/** PDF source ou scellé : route authentifiée, jamais un lien direct. */
export async function fetchSignatureFile(id: string, variant: 'source' | 'signed'): Promise<Blob> {
  const response = await apiClient.get(`/signatures/${encodeURIComponent(id)}/file`, {
    params: { ...tenantParams(), variant },
    responseType: 'blob'
  });
  return response.data as Blob;
}

/* ------------------------------------------------------------------ public */

// Sans session, statut HTTP lu ici : le refresh de session ne doit jamais se déclencher.
const PUBLIC_CONFIG = { withCredentials: false, validateStatus: () => true } as const;

export type PublicResult<T> = { status: 'ok'; data: T } | PublicFailure;

function failureStatus(httpStatus: number): PublicFailure['status'] {
  if (httpStatus === 429) return 'rate_limited';
  if (httpStatus === 409) return 'conflict';
  if (httpStatus >= 500) return 'unavailable';
  return 'invalid';
}

/** Lit `{ code, details }` d'une erreur, à plat ou sous `error`. */
function failureFrom(httpStatus: number, body: unknown): PublicFailure {
  const raw = (body && typeof body === 'object' ? body : {}) as Record<string, any>;
  const source = (raw.error && typeof raw.error === 'object' ? raw.error : raw) as Record<string, any>;
  const code = typeof source.code === 'string' ? source.code : typeof raw.code === 'string' ? raw.code : undefined;
  const details = (source.details ?? raw.details) as Record<string, unknown> | undefined;
  const retry = Number(details?.retryAfterSeconds ?? source.retryAfterSeconds ?? raw.retryAfterSeconds);
  return {
    status: failureStatus(httpStatus),
    httpStatus,
    code,
    details,
    retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? retry : undefined
  };
}

function publicBase(token: string): string {
  return `/public/signatures/${encodeURIComponent(token)}`;
}

/** URL du PDF à lire (iframe / lien) : le jeton est dans le chemin, rien d'autre. */
export function publicSignatureFileUrl(token: string): string {
  return `${API_URL}${publicBase(token)}/file`;
}

async function publicCall<T>(run: () => Promise<{ status: number; data: unknown }>): Promise<PublicResult<T>> {
  try {
    const response = await run();
    if (response.status >= 200 && response.status < 300) {
      return { status: 'ok', data: unwrap<T>(response.data) };
    }
    return failureFrom(response.status, response.data);
  } catch {
    return { status: 'unavailable', httpStatus: 0 };
  }
}

export function fetchPublicSignature(token: string): Promise<PublicResult<PublicSignatureDto>> {
  return publicCall(() => apiClient.get(publicBase(token), PUBLIC_CONFIG));
}

export function requestPublicOtp(token: string): Promise<PublicResult<PublicOtpResult>> {
  return publicCall(() => apiClient.post(`${publicBase(token)}/otp`, {}, PUBLIC_CONFIG));
}

/** En-tête du jeton de consultation (types « code avant consultation ») : jamais dans l'URL. */
const VIEW_TOKEN_HEADER = 'X-Signature-View-Token';

function viewTokenConfig(viewToken?: string) {
  return viewToken ? { ...PUBLIC_CONFIG, headers: { [VIEW_TOKEN_HEADER]: viewToken } } : PUBLIC_CONFIG;
}

/** Signature : avec un jeton de consultation (code déjà vérifié), il remplace le code. */
export function submitPublicSignature(
  token: string,
  input: PublicSignInput,
  viewToken?: string
): Promise<PublicResult<PublicSignOutcome>> {
  return publicCall(() => apiClient.post(`${publicBase(token)}/sign`, input, viewTokenConfig(viewToken)));
}

/** Vérifie le code reçu et obtient le jeton de consultation (valable 15 min). */
export function verifyPublicOtp(token: string, code: string): Promise<PublicResult<PublicVerifyResult>> {
  return publicCall(() => apiClient.post(`${publicBase(token)}/otp/verify`, { code }, PUBLIC_CONFIG));
}

/** PDF lu par une requête portant le jeton de consultation (réponse en blob, jamais d'URL avec jeton). */
export function fetchPublicSignatureBlob(token: string, viewToken: string): Promise<PublicResult<Blob>> {
  return publicCall(() =>
    apiClient.get(`${publicBase(token)}/file`, { ...viewTokenConfig(viewToken), responseType: 'blob' })
  );
}

/** Fournisseur externe : lien de signature du signataire, remis après vérification du code. */
export function fetchPublicExternalLink(token: string, viewToken: string): Promise<PublicResult<{ url: string }>> {
  return publicCall(() => apiClient.get(`${publicBase(token)}/external-link`, viewTokenConfig(viewToken)));
}

/** Refus : les types « code avant consultation » exigent le jeton de consultation (en-tête), comme la signature. */
export function declinePublicSignature(
  token: string,
  reason?: string,
  viewToken?: string
): Promise<PublicResult<{ status?: string }>> {
  return publicCall(() =>
    apiClient.post(`${publicBase(token)}/decline`, reason ? { reason } : {}, viewTokenConfig(viewToken))
  );
}
