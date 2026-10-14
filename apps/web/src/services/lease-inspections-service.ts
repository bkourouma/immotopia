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

/**
 * Neuf, Bon, Usagé, Mauvais, Hors service — dans cet ordre, du meilleur au
 * pire — puis Manquant (l'objet n'est pas dans le logement, spec 040 M2).
 */
export type InspectionCondition = 'NEW' | 'GOOD' | 'FAIR' | 'POOR' | 'BROKEN' | 'MISSING';

/** Bâti (attaché au logement, sans quantité) ou mobilier (avec quantité). */
export type InspectionItemKind = 'FIXTURE' | 'FURNITURE';

/** Modèle de départ d'un nouvel état des lieux. */
export type InspectionTemplate = 'STANDARD' | 'FURNISHED';

export interface InspectionItem {
  id: string;
  label: string;
  condition: InspectionCondition | null;
  comment: string | null;
  /** Absent = `FIXTURE` (document antérieur au volet meublés). */
  kind?: InspectionItemKind;
  /** Mobilier seulement ; entier de 0 à 9 999. */
  quantity?: number | null;
  /** Valeur de remplacement à l'unité, en FCFA. */
  replacementValue?: number | null;
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
  /** Absent = `MANUAL`. */
  source?: InspectionDeductionSource;
  /** Montant proposé au moment du clic (valeur × quantité manquante), `null` si inconnu. */
  proposedAmount?: number | null;
}

export type InspectionDeductionSource = 'MANUAL' | 'DEGRADED' | 'MISSING' | 'KEYS';

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
  kind: InspectionItemKind;
  entryQuantity: number | null;
  exitQuantity: number | null;
  missing: boolean;
  quantityDecrease: number;
  missingQuantity: number;
  absentFromExit: boolean;
  replacementValue: number | null;
  missingValue: number | null;
}

export type InspectionMeterKey = 'electricity' | 'water' | 'gas';

export interface InspectionMeterComparison {
  entry: string | null;
  exit: string | null;
  /** Sortie − entrée, `null` si l'un des relevés ne se lit pas comme un nombre. */
  difference: number | null;
}

export interface InspectionCompareSummary {
  keys: { entry: number | null; exit: number | null; missing: number | null };
  meters: Record<InspectionMeterKey, InspectionMeterComparison>;
  missingCount: number;
  quantityDecreaseCount: number;
  degradedCount: number;
  absentFromExitCount: number;
  missingValueTotal: number;
  missingWithoutValueCount: number;
}

export interface InspectionCompareResult {
  entry: LeaseInspection | null;
  exit: LeaseInspection | null;
  rows: InspectionCompareRow[];
  /** Facultatif pour lire une réponse d'une API antérieure au volet meublés. */
  summary?: InspectionCompareSummary;
}

export interface CreateInspectionRequest {
  type: InspectionType;
  inspectionDate: string;
  /** Absent = `STANDARD`. Ignoré pour une sortie quand l'entrée existe. */
  template?: InspectionTemplate;
}

/** Élément non évalué renvoyé par un refus de finalisation (`data.unevaluatedItems`). */
export interface UnevaluatedInspectionItem {
  roomId: string;
  roomName: string;
  itemId: string;
  label: string;
  missing: 'CONDITION' | 'QUANTITY';
}

/** Élément de l'entrée retiré de la sortie, refusé par l'API (`data.removedItems`). */
export interface RemovedInspectionItem {
  itemId: string;
  label: string;
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
