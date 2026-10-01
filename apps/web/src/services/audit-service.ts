import apiClient from '../utils/api-client';
import { filenameFromDisposition } from '../utils/save-blob';
import type { TenantAuditActorType, TenantAuditCategory, TenantAuditOutcome } from './tenant-audit-service';

/**
 * Journal d'audit de la plateforme (spec 023, phase 4) :
 * `GET /api/admin/audit` (pagination par curseur, plus de `page` ni de
 * `total`) et `GET /api/admin/audit/export` (CSV). La plateforme voit tout :
 * lignes réservées, lignes sans agence, IP et navigateur du personnel.
 */

export type PlatformAuditScope = 'TENANT' | 'PLATFORM';
export type PlatformAuditVisibility = 'TENANT' | 'PLATFORM_ONLY';

export interface PlatformAuditLog {
  id: string;
  /** Date ISO de l'événement. */
  createdAt: string;
  /** Clé d'action, ex. `PROPERTY_CREATED`. */
  action: string;
  category: TenantAuditCategory;
  outcome: TenantAuditOutcome;
  scope: PlatformAuditScope;
  visibility: PlatformAuditVisibility;
  actorType: TenantAuditActorType;
  source?: string;
  /** Acteur résolu (absent si le compte a été supprimé). */
  user?: { id: string; email: string; fullName: string | null };
  userId?: string;
  /** Libellé figé à l'écriture : survit à la suppression du compte. */
  actorLabel?: string;
  tenantId?: string;
  tenant?: { id: string; name: string };
  resourceType: string;
  resourceId: string;
  resourceLabel?: string;
  details?: Record<string, unknown>;
  changes?: Record<string, { before?: unknown; after?: unknown } | unknown>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

/** Filtres de l'export : ceux de la liste, sans `cursor` ni `limit` (refusés en 400). */
export interface PlatformAuditExportFilters {
  tenantId?: string;
  scope?: PlatformAuditScope;
  visibility?: PlatformAuditVisibility;
  category?: TenantAuditCategory;
  outcome?: TenantAuditOutcome;
  actorType?: TenantAuditActorType;
  /** Clé exacte, en MAJUSCULES. */
  actionKey?: string;
  actorUserId?: string;
  entityType?: string;
  entityId?: string;
  requestId?: string;
  /** `YYYY-MM-DD`, borne incluse. */
  startDate?: string;
  /** `YYYY-MM-DD`, borne incluse. */
  endDate?: string;
}

/** Filtres de la liste. Toute autre clé est rejetée en 400. */
export interface PlatformAuditFilters extends PlatformAuditExportFilters {
  /** Curseur opaque renvoyé par `nextCursor`. */
  cursor?: string;
  /** 1 à 100 (50 par défaut côté API). */
  limit?: number;
}

export interface PlatformAuditPage {
  logs: PlatformAuditLog[];
  nextCursor: string | null;
}

export interface PlatformAuditResponse {
  success: boolean;
  data: PlatformAuditPage;
}

export interface PlatformAuditExportResult {
  blob: Blob;
  filename: string;
  /** Vrai quand le filtre était trop large : l'export est coupé à 50 000 lignes. */
  truncated: boolean;
}

/** Ne garde que les valeurs définies et non vides : l'API refuse un paramètre inconnu et n'a que faire d'une chaîne vide. */
function definedParams(filters: PlatformAuditFilters | AuditIntegrityParams): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    params[key] = value as string | number;
  }
  return params;
}

export async function getAuditLogs(filters: PlatformAuditFilters = {}): Promise<PlatformAuditResponse> {
  const response = await apiClient.get<PlatformAuditResponse>('/admin/audit', { params: definedParams(filters) });
  return response.data;
}

function fallbackExportName(): string {
  return `journal-audit-${new Date().toISOString().slice(0, 10)}.csv`;
}

/**
 * Export CSV du journal, avec les mêmes filtres que la liste. Le corps est lu
 * en blob par `apiClient` (jamais un lien direct vers l'API) ; `cursor` et
 * `limit` sont écartés même si l'appelant les passe.
 */
export async function exportAuditLogs(filters: PlatformAuditExportFilters = {}): Promise<PlatformAuditExportResult> {
  const { cursor: _cursor, limit: _limit, ...exportFilters } = filters as PlatformAuditFilters;
  const response = await apiClient.get<Blob>('/admin/audit/export', {
    params: definedParams(exportFilters),
    responseType: 'blob'
  });
  const headers = (response.headers ?? {}) as Record<string, unknown>;
  return {
    blob: response.data,
    filename: filenameFromDisposition(headers['content-disposition'], fallbackExportName()),
    truncated: String(headers['x-export-truncated'] ?? '').toLowerCase() === 'true'
  };
}

export type AuditIntegrityStatus = 'OK' | 'EXPIRED' | 'LATE_ROWS' | 'ROWS_MISSING' | 'ALTERED';

/** Une partition (jour de scellement, agence, visibilité) dont le contenu diffère du scellé. */
export interface AuditIntegrityFinding {
  /** Jour scellé, `YYYY-MM-DD` (UTC). */
  sealDate: string;
  /** Identifiant de l'agence, ou clé réservée aux lignes sans agence. */
  tenantKey: string;
  visibility: PlatformAuditVisibility;
  status: AuditIntegrityStatus;
  sealedRows: number;
  foundRows: number;
}

export interface AuditIntegrityChainHead {
  seq: number;
  sealDate: string;
  chainHash: string;
}

export interface AuditIntegrityReport {
  ok: boolean;
  chain: {
    ok: boolean;
    sealsChecked: number;
    /** Numéro du premier scellé dont le chaînage est rompu. */
    brokenAtSeq?: number;
    head: AuditIntegrityChainHead | null;
  };
  partitions: {
    checked: number;
    ok: number;
    /** Partitions purgées après la durée de rétention : normal, rien à signaler. */
    expired: number;
    /** Lignes arrivées après le scellement : pas forcément une altération. */
    lateRows: AuditIntegrityFinding[];
    tampered: AuditIntegrityFinding[];
    /** Vrai quand la période est trop large : seules les premières anomalies sont listées. */
    truncated: boolean;
  };
}

export interface AuditIntegrityResponse {
  success: true;
  data: AuditIntegrityReport;
}

/** Période de la vérification : jours `YYYY-MM-DD` (UTC), l'API répond 400 sinon. */
export interface AuditIntegrityParams {
  from?: string;
  to?: string;
}

/**
 * Vérifie l'intégrité du journal : chaîne des scellés puis partitions
 * (`GET /api/admin/audit/integrity`). Sans période, les 500 derniers scellés.
 * Calcul lourd, limité à 10 appels par 10 minutes côté API.
 */
export async function getAuditIntegrity(params: AuditIntegrityParams = {}): Promise<AuditIntegrityResponse> {
  const response = await apiClient.get<AuditIntegrityResponse>('/admin/audit/integrity', {
    params: definedParams(params)
  });
  return response.data;
}
