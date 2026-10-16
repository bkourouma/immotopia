import apiClient from '../utils/api-client';
import { filenameFromDisposition } from '../utils/save-blob';

/**
 * Spec 042, lot P1 — créanciers et mandats de prélèvement bancaire.
 *
 * Contrat : `specs/042-prelevement-bancaire/data-model.md` §3–§4. Toutes les
 * routes sont sous `/tenants/:tenantId/rental/direct-debit`, réponses
 * `{ success, data }`. Montants en FCFA, dates en ISO.
 *
 * L'IBAN complet n'est jamais renvoyé : seul `ibanMasked` est affiché. Il ne
 * voyage que dans le corps de `createMandate` et `checkIban`, et n'est
 * conservé nulle part côté écran.
 */

export type MandateStatus = 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED';

export interface CreditorDto {
  id: string;
  label: string;
  treasuryAccountId: string;
  treasuryAccountLabel: string;
  bankName: string | null;
  creditorIdentifier: string | null;
  fileFormat: 'GENERIC_CSV';
  collectionDay: number;
  prenotificationBusinessDays: number;
  rejectFeeAmount: number;
  maxConsecutiveRejects: number;
  isActive: boolean;
  /** Mandats DRAFT, ACTIVE ou SUSPENDED. */
  openMandateCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCreditorInput {
  treasuryAccountId: string;
  label: string;
  creditorIdentifier?: string;
  collectionDay?: number;
  prenotificationBusinessDays?: number;
  rejectFeeAmount?: number;
  maxConsecutiveRejects?: number;
}

export interface UpdateCreditorInput {
  label?: string;
  creditorIdentifier?: string;
  collectionDay?: number;
  prenotificationBusinessDays?: number;
  rejectFeeAmount?: number;
  maxConsecutiveRejects?: number;
  isActive?: boolean;
}

export interface IbanCheckDto {
  valid: boolean;
  ibanMasked: string | null;
  bankCode: string | null;
  /** Message traduit si invalide. */
  error: string | null;
  warnings: string[];
}

export interface MandateDto {
  id: string;
  /** Ex. MDT-2026-0001. */
  reference: string;
  scope: 'RENTAL_LEASE';
  status: MandateStatus;
  creditor: { id: string; label: string; creditorIdentifier: string | null };
  debtor: { id: string; displayName: string | null };
  lease: { id: string; leaseNumber: string; status: string } | null;
  ibanMasked: string;
  bankCode: string;
  holderName: string;
  maxAmount: number | null;
  collectionDay: number | null;
  effectiveCollectionDay: number;
  signedAt: string | null;
  hasSignedScan: boolean;
  signedScanUploadedAt: string | null;
  activatedAt: string | null;
  suspendedAt: string | null;
  suspensionReason: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
  consecutiveRejects: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MandateListFilters {
  leaseId?: string;
  debtorClientId?: string;
  creditorId?: string;
  status?: MandateStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface MandateListResult {
  items: MandateDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateMandateInput {
  creditorId: string;
  leaseId: string;
  debtorClientId: string;
  iban: string;
  holderName: string;
  maxAmount?: number;
  collectionDay?: number;
  notes?: string;
}

/** `null` efface la valeur. */
export interface UpdateMandateInput {
  maxAmount?: number | null;
  collectionDay?: number | null;
  notes?: string | null;
}

export const SIGNED_SCAN_MAX_BYTES = 10 * 1024 * 1024;
export const SIGNED_SCAN_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

const base = (tenantId: string) => `/tenants/${tenantId}/rental/direct-debit`;

// --- Créanciers -------------------------------------------------------------

export async function listCreditors(tenantId: string): Promise<CreditorDto[]> {
  const response = await apiClient.get(`${base(tenantId)}/creditors`);
  return response.data.data;
}

export async function createCreditor(tenantId: string, input: CreateCreditorInput): Promise<CreditorDto> {
  const response = await apiClient.post(`${base(tenantId)}/creditors`, input);
  return response.data.data;
}

export async function updateCreditor(
  tenantId: string,
  creditorId: string,
  input: UpdateCreditorInput
): Promise<CreditorDto> {
  const response = await apiClient.patch(`${base(tenantId)}/creditors/${creditorId}`, input);
  return response.data.data;
}

// --- IBAN -------------------------------------------------------------------

export async function checkIban(tenantId: string, iban: string): Promise<IbanCheckDto> {
  const response = await apiClient.post(`${base(tenantId)}/iban-check`, { iban });
  return response.data.data;
}

// --- Mandats ----------------------------------------------------------------

export async function listMandates(tenantId: string, filters: MandateListFilters = {}): Promise<MandateListResult> {
  const params: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    params[key] = value as string | number;
  }
  const response = await apiClient.get(`${base(tenantId)}/mandates`, { params });
  return response.data.data;
}

export async function getMandate(tenantId: string, mandateId: string): Promise<MandateDto> {
  const response = await apiClient.get(`${base(tenantId)}/mandates/${mandateId}`);
  return response.data.data;
}

export async function createMandate(
  tenantId: string,
  input: CreateMandateInput
): Promise<{ mandate: MandateDto; warnings: string[] }> {
  const response = await apiClient.post(`${base(tenantId)}/mandates`, input);
  return response.data.data;
}

export async function updateMandate(
  tenantId: string,
  mandateId: string,
  input: UpdateMandateInput
): Promise<MandateDto> {
  const response = await apiClient.patch(`${base(tenantId)}/mandates/${mandateId}`, input);
  return response.data.data;
}

export async function activateMandate(tenantId: string, mandateId: string, signedAt: string): Promise<MandateDto> {
  const response = await apiClient.post(`${base(tenantId)}/mandates/${mandateId}/activate`, { signedAt });
  return response.data.data;
}

export async function suspendMandate(tenantId: string, mandateId: string, reason: string): Promise<MandateDto> {
  const response = await apiClient.post(`${base(tenantId)}/mandates/${mandateId}/suspend`, { reason });
  return response.data.data;
}

export async function reactivateMandate(tenantId: string, mandateId: string): Promise<MandateDto> {
  const response = await apiClient.post(`${base(tenantId)}/mandates/${mandateId}/reactivate`);
  return response.data.data;
}

export async function revokeMandate(
  tenantId: string,
  mandateId: string,
  reason: string,
  revokedAt?: string
): Promise<MandateDto> {
  const response = await apiClient.post(`${base(tenantId)}/mandates/${mandateId}/revoke`, {
    reason,
    ...(revokedAt ? { revokedAt } : {})
  });
  return response.data.data;
}

// --- Fichiers privés --------------------------------------------------------

export async function downloadAuthorizationPdf(
  tenantId: string,
  mandateId: string,
  fallbackName: string
): Promise<{ blob: Blob; filename: string }> {
  const response = await apiClient.get<Blob>(`${base(tenantId)}/mandates/${mandateId}/authorization-pdf`, {
    responseType: 'blob'
  });
  return {
    blob: response.data,
    filename: filenameFromDisposition(response.headers?.['content-disposition'], fallbackName)
  };
}

export async function uploadSignedScan(tenantId: string, mandateId: string, file: File): Promise<MandateDto> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post(`${base(tenantId)}/mandates/${mandateId}/signed-scan`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data.data;
}

export async function downloadSignedScan(
  tenantId: string,
  mandateId: string,
  fallbackName: string
): Promise<{ blob: Blob; filename: string }> {
  const response = await apiClient.get<Blob>(`${base(tenantId)}/mandates/${mandateId}/signed-scan`, {
    responseType: 'blob'
  });
  return {
    blob: response.data,
    filename: filenameFromDisposition(response.headers?.['content-disposition'], fallbackName)
  };
}

// --- P2 : remises de loyers --------------------------------------------------
//
// Contrat : `specs/042-prelevement-bancaire/data-model.md` §7. Aucun champ ne
// porte l'IBAN complet, le texte chiffré ou l'adresse e-mail du débiteur : le
// fichier de remise (IBAN complet) ne se télécharge que par `exportRemittance`.

export type RemittanceStatus = 'DRAFT' | 'VALIDATED' | 'EXPORTED' | 'SUBMITTED' | 'CANCELED';
export type RemittanceLineStatus = 'PENDING' | 'CANCELED';
export type PrenotificationStatus = 'PENDING' | 'SENT' | 'NO_EMAIL' | 'DISABLED' | 'FAILED';
export type SkipReason =
  'NO_INSTALLMENT' | 'NOTHING_DUE' | 'ALREADY_IN_REMITTANCE' | 'LEASE_NOT_ACTIVE' | 'COLLECTION_DAY_LATER';

export interface RemittanceSummaryDto {
  id: string;
  /** Ex. PRL-2026-0001. */
  reference: string;
  status: RemittanceStatus;
  /** Valeurs figées après validation. */
  creditor: { id: string; label: string; creditorIdentifier: string | null };
  /** AAAA-MM-JJ. */
  collectionDate: string;
  periodYear: number;
  periodMonth: number;
  /** AAAA-MM-JJ. */
  prenotificationDeadline: string;
  fileFormat: 'GENERIC_CSV';
  lineCount: number;
  totalAmount: number;
  validatedAt: string | null;
  firstExportedAt: string | null;
  lastExportedAt: string | null;
  exportCount: number;
  submittedAt: string | null;
  canceledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RemittanceLineDto {
  id: string;
  lineNumber: number;
  /** Référence d'opération, ex. PRL-2026-0001-001. */
  reference: string;
  status: RemittanceLineStatus;
  mandate: {
    id: string;
    reference: string;
    ibanMasked: string;
    holderName: string;
    maxAmount: number | null;
  };
  debtor: { id: string; displayName: string | null };
  lease: { id: string; leaseNumber: string };
  installment: { id: string; periodYear: number; periodMonth: number; dueDate: string };
  amount: number;
  remainingDueAtSelection: number;
  capped: boolean;
  prenotificationStatus: PrenotificationStatus;
  prenotifiedAt: string | null;
  canceledAt: string | null;
  cancellationReason: string | null;
}

export interface PrenotificationSummaryDto {
  pending: number;
  sent: number;
  noEmail: number;
  disabled: number;
  failed: number;
}

export interface RemittanceDto extends RemittanceSummaryDto {
  notes: string | null;
  /** Toutes les lignes, annulées comprises, par `lineNumber`. */
  lines: RemittanceLineDto[];
  /** Lignes PENDING seulement. */
  prenotificationSummary: PrenotificationSummaryDto;
}

export interface SkippedMandateDto {
  mandateId: string;
  mandateReference: string;
  leaseNumber: string | null;
  debtorName: string | null;
  reason: SkipReason;
}

export interface RemittanceListFilters {
  creditorId?: string;
  status?: RemittanceStatus;
  page?: number;
  pageSize?: number;
}

export interface RemittanceListResult {
  items: RemittanceSummaryDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateRemittanceInput {
  creditorId: string;
  /** AAAA-MM-JJ. */
  collectionDate: string;
  notes?: string;
}

export interface RemittanceWithSkipped {
  remittance: RemittanceDto;
  skipped: SkippedMandateDto[];
}

export interface RemittanceWithPrenotifications {
  remittance: RemittanceDto;
  prenotifications: PrenotificationSummaryDto;
}

export async function listRemittances(
  tenantId: string,
  filters: RemittanceListFilters = {}
): Promise<RemittanceListResult> {
  const params: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    params[key] = value as string | number;
  }
  const response = await apiClient.get(`${base(tenantId)}/remittances`, { params });
  return response.data.data;
}

export async function createRemittance(tenantId: string, input: CreateRemittanceInput): Promise<RemittanceWithSkipped> {
  const response = await apiClient.post(`${base(tenantId)}/remittances`, input);
  return response.data.data;
}

export async function getRemittance(tenantId: string, remittanceId: string): Promise<RemittanceDto> {
  const response = await apiClient.get(`${base(tenantId)}/remittances/${remittanceId}`);
  return response.data.data;
}

export async function refreshRemittance(tenantId: string, remittanceId: string): Promise<RemittanceWithSkipped> {
  const response = await apiClient.post(`${base(tenantId)}/remittances/${remittanceId}/refresh`);
  return response.data.data;
}

export async function cancelRemittanceLine(
  tenantId: string,
  remittanceId: string,
  lineId: string,
  reason?: string
): Promise<RemittanceDto> {
  const response = await apiClient.post(
    `${base(tenantId)}/remittances/${remittanceId}/lines/${lineId}/cancel`,
    reason ? { reason } : {}
  );
  return response.data.data;
}

export async function validateRemittance(
  tenantId: string,
  remittanceId: string
): Promise<RemittanceWithPrenotifications> {
  const response = await apiClient.post(`${base(tenantId)}/remittances/${remittanceId}/validate`);
  return response.data.data;
}

export async function resendPrenotifications(
  tenantId: string,
  remittanceId: string
): Promise<RemittanceWithPrenotifications> {
  const response = await apiClient.post(`${base(tenantId)}/remittances/${remittanceId}/prenotifications`);
  return response.data.data;
}

/**
 * Une erreur reçue avec `responseType: 'blob'` porte son JSON dans un Blob :
 * on le relit pour que `apiErrorMessage` retrouve le message de l'API.
 */
async function unwrapBlobError(error: unknown): Promise<void> {
  const response = (error as { response?: { data?: unknown } })?.response;
  if (!response || !(response.data instanceof Blob)) return;
  try {
    response.data = JSON.parse(await response.data.text());
  } catch {
    // Corps illisible : on garde l'erreur d'origine.
  }
}

/** Produit le fichier de remise (IBAN complets) : un `POST` qui renvoie un fichier. */
export async function exportRemittance(
  tenantId: string,
  remittanceId: string,
  fallbackName: string
): Promise<{ blob: Blob; filename: string }> {
  let response;
  try {
    response = await apiClient.post<Blob>(`${base(tenantId)}/remittances/${remittanceId}/export`, undefined, {
      responseType: 'blob'
    });
  } catch (error) {
    await unwrapBlobError(error);
    throw error;
  }
  return {
    blob: response.data,
    filename: filenameFromDisposition(response.headers?.['content-disposition'], fallbackName)
  };
}

export async function submitRemittance(tenantId: string, remittanceId: string): Promise<RemittanceDto> {
  const response = await apiClient.post(`${base(tenantId)}/remittances/${remittanceId}/submit`);
  return response.data.data;
}

export async function cancelRemittance(tenantId: string, remittanceId: string, reason: string): Promise<RemittanceDto> {
  const response = await apiClient.post(`${base(tenantId)}/remittances/${remittanceId}/cancel`, { reason });
  return response.data.data;
}
