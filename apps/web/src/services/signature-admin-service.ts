import apiClient from '../utils/api-client';
import { getStoredActiveTenantId } from '../utils/active-tenant';
import type { SignatureRequestDto, SignatureRequestStatus } from '../types/signature-types';

export { cancelSignatureRequest, fetchSignatureFile, remindSignatureRequest } from './signature-service';

/** Demande telle que la liste globale la renvoie (champs absents de `SignatureRequestDto`). */
export interface SignatureAdminRequestDto extends SignatureRequestDto {
  targetType: string;
  targetId: string;
  title: string;
  sequential?: boolean;
  hasSignedFile?: boolean;
  signedHash?: string | null;
  /**
   * Calculé par l'API : l'utilisateur peut-il relancer ou annuler cette demande
   * (permission d'édition de son type de document) ? Seul `true` autorise les actions d'écriture.
   */
  canEdit?: boolean;
}

export interface SignatureEventDto {
  type: string;
  signerId?: string | null;
  createdAt: string;
}

export interface SignatureDetailDto extends SignatureAdminRequestDto {
  events: SignatureEventDto[];
  chainIntact?: boolean;
}

export type SignatureSortField = 'createdAt' | 'expiresAt' | 'status' | 'title';

export interface SignatureAdminFilters {
  page?: number;
  pageSize?: number;
  status?: SignatureRequestStatus;
  kind?: string;
  targetType?: string;
  q?: string;
  from?: string;
  to?: string;
  sortBy?: SignatureSortField;
  sortDir?: 'asc' | 'desc';
}

export interface SignaturePage {
  items: SignatureAdminRequestDto[];
  total: number;
}

export interface SignatureSummary {
  total: number;
  byStatus: Partial<Record<SignatureRequestStatus, number>>;
}

function unwrap<T>(body: unknown): T {
  const wrapped = body as { data?: T } | null | undefined;
  return (
    wrapped && typeof wrapped === 'object' && 'data' in wrapped && wrapped.data !== undefined ? wrapped.data : body
  ) as T;
}

function tenantParams(): { tenantId?: string } {
  const tenantId = getStoredActiveTenantId();
  return tenantId ? { tenantId } : {};
}

/** Retire les filtres vides : l'API ne reçoit que ce qui est renseigné. */
function clean<T extends object>(filters: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && value !== '')
  ) as Partial<T>;
}

export async function listSignaturesPage(filters: SignatureAdminFilters = {}): Promise<SignaturePage> {
  const response = await apiClient.get('/signatures', { params: { ...tenantParams(), ...clean(filters) } });
  const body = unwrap<SignaturePage | SignatureAdminRequestDto[]>(response.data);
  if (Array.isArray(body)) return { items: body, total: body.length };
  return { items: body?.items ?? [], total: body?.total ?? body?.items?.length ?? 0 };
}

export async function fetchSignatureSummary(
  filters: Pick<SignatureAdminFilters, 'kind' | 'q' | 'from' | 'to'> = {}
): Promise<SignatureSummary> {
  const response = await apiClient.get('/signatures/summary', { params: { ...tenantParams(), ...clean(filters) } });
  const body = unwrap<SignatureSummary | null>(response.data);
  return { total: body?.total ?? 0, byStatus: body?.byStatus ?? {} };
}

export async function fetchSignatureDetail(id: string): Promise<SignatureDetailDto> {
  const response = await apiClient.get(`/signatures/${encodeURIComponent(id)}`, { params: tenantParams() });
  const body = unwrap<SignatureDetailDto & { request?: SignatureDetailDto }>(response.data);
  const detail = (body?.request ?? body) as SignatureDetailDto;
  return {
    ...detail,
    events: detail.events ?? body?.events ?? [],
    chainIntact: detail.chainIntact ?? body?.chainIntact
  };
}
