import apiClient from '../utils/api-client';

/**
 * Lot 5, section B — états des lieux d'entrée et de sortie.
 *
 * Toutes les routes sont sous `/tenants/:tenantId/rental/leases/:leaseId`, comme
 * documenté dans le contrat d'API du lot. Les montants sont en FCFA, les dates
 * s'envoient en `YYYY-MM-DD` et reviennent en ISO.
 */

export type InspectionType = 'ENTRY' | 'EXIT';
export type InspectionStatus = 'DRAFT' | 'FINALIZED';

/** Neuf, Bon, Usagé, Mauvais, Hors service — dans cet ordre, du meilleur au pire. */
export type InspectionCondition = 'NEW' | 'GOOD' | 'FAIR' | 'POOR' | 'BROKEN';

export interface InspectionItem {
  id: string;
  label: string;
  condition: InspectionCondition | null;
  comment: string | null;
}

export interface InspectionRoom {
  id: string;
  name: string;
  items: InspectionItem[];
}

export interface InspectionDeduction {
  id: string;
  label: string;
  amount: number;
  roomId?: string | null;
  itemId?: string | null;
}

export interface InspectionPhoto {
  id: string;
  roomId: string | null;
  itemId: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  caption: string | null;
  createdAt: string;
}

export interface InspectionMeters {
  electricity?: string | null;
  water?: string | null;
  gas?: string | null;
}

export interface LeaseInspection {
  id: string;
  type: InspectionType;
  status: InspectionStatus;
  inspectionDate: string;
  rooms: InspectionRoom[];
  meters: InspectionMeters | null;
  keysCount: number | null;
  generalComment: string | null;
  tenantPresent: boolean;
  tenantSignatoryName: string | null;
  agentSignatoryName: string | null;
  deductions: InspectionDeduction[];
  finalizedAt: string | null;
  photos: InspectionPhoto[];
}

export interface InspectionCompareRow {
  roomId: string;
  roomName: string;
  itemId: string;
  label: string;
  entryCondition: InspectionCondition | null;
  exitCondition: InspectionCondition | null;
  degraded: boolean;
}

export interface InspectionCompareResult {
  entry: LeaseInspection | null;
  exit: LeaseInspection | null;
  rows: InspectionCompareRow[];
}

export interface CreateInspectionRequest {
  type: InspectionType;
  inspectionDate: string;
}

export interface UpdateInspectionRequest {
  inspectionDate?: string;
  rooms?: InspectionRoom[];
  meters?: InspectionMeters | null;
  keysCount?: number | null;
  generalComment?: string | null;
  tenantPresent?: boolean;
  tenantSignatoryName?: string | null;
  agentSignatoryName?: string | null;
  deductions?: InspectionDeduction[];
}

export interface UploadInspectionPhotoOptions {
  roomId?: string;
  itemId?: string;
  caption?: string;
}

interface ApiSuccess<T> {
  success: true;
  data: T;
}

function leaseBase(tenantId: string, leaseId: string): string {
  return `/tenants/${tenantId}/rental/leases/${leaseId}`;
}

export async function listInspections(tenantId: string, leaseId: string): Promise<ApiSuccess<LeaseInspection[]>> {
  const response = await apiClient.get(`${leaseBase(tenantId, leaseId)}/inspections`);
  return response.data;
}

export async function createInspection(
  tenantId: string,
  leaseId: string,
  data: CreateInspectionRequest
): Promise<ApiSuccess<LeaseInspection>> {
  const response = await apiClient.post(`${leaseBase(tenantId, leaseId)}/inspections`, data);
  return response.data;
}

export async function updateInspection(
  tenantId: string,
  leaseId: string,
  inspectionId: string,
  data: UpdateInspectionRequest
): Promise<ApiSuccess<LeaseInspection>> {
  const response = await apiClient.put(`${leaseBase(tenantId, leaseId)}/inspections/${inspectionId}`, data);
  return response.data;
}

export async function finalizeInspection(
  tenantId: string,
  leaseId: string,
  inspectionId: string
): Promise<ApiSuccess<LeaseInspection>> {
  const response = await apiClient.post(`${leaseBase(tenantId, leaseId)}/inspections/${inspectionId}/finalize`);
  return response.data;
}

export async function deleteInspection(
  tenantId: string,
  leaseId: string,
  inspectionId: string
): Promise<{ success: boolean; message?: string }> {
  const response = await apiClient.delete(`${leaseBase(tenantId, leaseId)}/inspections/${inspectionId}`);
  return response.data;
}

export async function compareInspections(
  tenantId: string,
  leaseId: string
): Promise<ApiSuccess<InspectionCompareResult>> {
  const response = await apiClient.get(`${leaseBase(tenantId, leaseId)}/inspections/compare`);
  return response.data;
}

export async function uploadInspectionPhoto(
  tenantId: string,
  leaseId: string,
  inspectionId: string,
  file: File,
  options: UploadInspectionPhotoOptions = {}
): Promise<ApiSuccess<InspectionPhoto>> {
  const formData = new FormData();
  formData.append('file', file);
  if (options.roomId) formData.append('roomId', options.roomId);
  if (options.itemId) formData.append('itemId', options.itemId);
  if (options.caption) formData.append('caption', options.caption);

  const response = await apiClient.post(
    `${leaseBase(tenantId, leaseId)}/inspections/${inspectionId}/photos`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return response.data;
}

export async function deleteInspectionPhoto(
  tenantId: string,
  leaseId: string,
  inspectionId: string,
  photoId: string
): Promise<{ success: boolean; message?: string }> {
  const response = await apiClient.delete(
    `${leaseBase(tenantId, leaseId)}/inspections/${inspectionId}/photos/${photoId}`
  );
  return response.data;
}

/**
 * Charge le fichier d'une photo en blob, via `apiClient`.
 *
 * Le fichier est protégé par l'authentification (cookie de session) et jamais
 * servi en statique. Un simple `<img src="…">` pointant vers l'API ne porterait
 * le cookie que si web et API partagent le même site — vrai en développement
 * (ports différents du même `localhost`), pas garanti en production si l'API
 * vit sur un sous-domaine distinct avec des règles de cookie différentes.
 * Passer par `apiClient` garantit le cookie dans tous les déploiements et
 * bénéficie du rafraîchissement de session sur 401.
 */
export async function fetchInspectionPhotoBlob(
  tenantId: string,
  leaseId: string,
  inspectionId: string,
  photoId: string
): Promise<Blob> {
  const response = await apiClient.get(
    `${leaseBase(tenantId, leaseId)}/inspections/${inspectionId}/photos/${photoId}/file`,
    { responseType: 'blob' }
  );
  return response.data;
}
