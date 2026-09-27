import apiClient from '../utils/api-client';
import { filenameFromDisposition, saveBlob } from '../utils/save-blob';

/**
 * Export complet des données d'une agence (lot S7, besoin 8) — super-admin
 * uniquement, monté sous `/admin/tenants/:tenantId/data-exports`
 * (`packages/api/src/routes/tenant-data-export-routes.ts`).
 *
 * DTO recopié exactement sur `TenantDataExportDto`
 * (`packages/api/src/services/tenant-data-export/export-service.ts`) : aucune
 * réponse ne porte de chemin disque, seul `downloadPath` (relatif, présent
 * uniquement quand READY) sort de l'API.
 */

export type TenantDataExportStatus = 'QUEUED' | 'RUNNING' | 'READY' | 'FAILED' | 'EXPIRED';

export interface TenantDataExport {
  id: string;
  tenantId: string;
  status: TenantDataExportStatus;
  requestedBy: { id: string; fullName: string | null; email: string | null };
  sizeBytes: number | null;
  modelCount: number | null;
  rowCount: number | null;
  fileCount: number | null;
  missingFileCount: number | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  downloadPath: string | null;
}

interface Envelope<T> {
  success: boolean;
  data: T;
}

const base = (tenantId: string) => `/admin/tenants/${tenantId}/data-exports`;

/** Demande un nouvel export ; 409 si un export QUEUED/RUNNING existe déjà. */
export async function requestTenantDataExport(tenantId: string): Promise<TenantDataExport> {
  const response = await apiClient.post<Envelope<TenantDataExport>>(base(tenantId));
  return response.data.data;
}

/** 50 exports les plus récents de l'agence. */
export async function listTenantDataExports(tenantId: string): Promise<TenantDataExport[]> {
  const response = await apiClient.get<Envelope<TenantDataExport[]>>(base(tenantId));
  return response.data.data;
}

/** Un export précis — à interroger tant que son statut est QUEUED ou RUNNING. */
export async function getTenantDataExport(tenantId: string, exportId: string): Promise<TenantDataExport> {
  const response = await apiClient.get<Envelope<TenantDataExport>>(`${base(tenantId)}/${exportId}`);
  return response.data.data;
}

export async function deleteTenantDataExport(tenantId: string, exportId: string): Promise<void> {
  await apiClient.delete(`${base(tenantId)}/${exportId}`);
}

/**
 * Télécharge l'archive ZIP. Le nom vient de `Content-Disposition` (retombe
 * sur `immotopia-export.zip`). 410 `EXPORT_EXPIRED` remonte tel quel : c'est
 * à l'appelant de proposer un nouvel export.
 */
export async function downloadTenantDataExport(tenantId: string, exportId: string): Promise<void> {
  const response = await apiClient.get(`${base(tenantId)}/${exportId}/download`, { responseType: 'blob' });
  const filename = filenameFromDisposition(response.headers?.['content-disposition'], 'immotopia-export.zip');
  saveBlob(response.data as Blob, filename);
}
