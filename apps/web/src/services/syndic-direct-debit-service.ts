import apiClient from '../utils/api-client';
import { filenameFromDisposition } from '../utils/save-blob';
import type {
  CreditorDto,
  IbanCheckDto,
  MandateDto,
  MandateStatus,
  RemittanceDto,
  RemittanceListResult,
  RemittanceStatus,
  RemittanceWithPrenotifications,
  RemittanceWithSkipped
} from './direct-debit-service';

/**
 * Spec 042, lot P4 — prélèvement bancaire des charges de copropriété.
 *
 * Contrat : `specs/042-prelevement-bancaire/data-model.md` §9.4 et §9.5. Routes
 * sous `/tenants/:tenantId/syndics/:syndicId/prelevements`, réponses
 * `{ success, data }`. Les objets renvoyés sont ceux du locatif (types de
 * `direct-debit-service`), élargis au périmètre `SYNDIC_LOT`.
 *
 * Les retours banque et les constats (régler, rejeter) relèvent d'une autre
 * partie du lot : ils ne sont pas ici.
 */

export interface SyndicCreditorInput {
  label: string;
  bankName?: string;
  bankAccountRef?: string;
  creditorIdentifier?: string;
  collectionDay?: number;
  prenotificationBusinessDays?: number;
  maxConsecutiveRejects?: number;
  isActive?: boolean;
}

/** Copropriétaire d'un lot pouvant être débiteur d'un mandat. */
export interface LotDebtorDto {
  contactId: string;
  displayName: string;
  /** Sans e-mail, aucun avis de prélèvement ne peut partir. */
  hasEmail: boolean;
}

export interface SyndicMandateListFilters {
  lotId?: string;
  status?: MandateStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface SyndicMandateListResult {
  items: MandateDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateSyndicMandateInput {
  lotId: string;
  debtorContactId: string;
  iban: string;
  holderName: string;
  maxAmount?: number;
  collectionDay?: number;
  notes?: string;
}

/** `null` efface la valeur. */
export interface UpdateSyndicMandateInput {
  maxAmount?: number | null;
  collectionDay?: number | null;
  notes?: string | null;
}

export interface SyndicRemittanceListFilters {
  status?: RemittanceStatus;
  page?: number;
  pageSize?: number;
}

export interface CreateSyndicRemittanceInput {
  /** AAAA-MM-JJ. Le créancier est toujours celui du syndicat. */
  collectionDate: string;
  notes?: string;
}

const base = (tenantId: string, syndicId: string) => `/tenants/${tenantId}/syndics/${syndicId}/prelevements`;

function cleanParams(filters: object): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    params[key] = value as string | number;
  }
  return params;
}

// --- Créancier du syndicat ---------------------------------------------------

export async function getSyndicCreditor(tenantId: string, syndicId: string): Promise<CreditorDto | null> {
  const response = await apiClient.get(`${base(tenantId, syndicId)}/creancier`);
  return response.data.data ?? null;
}

/** Crée ou modifie l'unique créancier du syndicat. */
export async function saveSyndicCreditor(
  tenantId: string,
  syndicId: string,
  input: SyndicCreditorInput
): Promise<CreditorDto> {
  const response = await apiClient.put(`${base(tenantId, syndicId)}/creancier`, input);
  return response.data.data;
}

// --- IBAN et débiteurs -------------------------------------------------------

export async function checkSyndicIban(tenantId: string, syndicId: string, iban: string): Promise<IbanCheckDto> {
  const response = await apiClient.post(`${base(tenantId, syndicId)}/controle-iban`, { iban });
  return response.data.data;
}

export async function listLotDebtors(tenantId: string, syndicId: string, lotId: string): Promise<LotDebtorDto[]> {
  const response = await apiClient.get(`${base(tenantId, syndicId)}/lots/${lotId}/debiteurs`);
  return response.data.data;
}

// --- Mandats -----------------------------------------------------------------

export async function listSyndicMandates(
  tenantId: string,
  syndicId: string,
  filters: SyndicMandateListFilters = {}
): Promise<SyndicMandateListResult> {
  const response = await apiClient.get(`${base(tenantId, syndicId)}/mandats`, { params: cleanParams(filters) });
  return response.data.data;
}

export async function getSyndicMandate(tenantId: string, syndicId: string, mandateId: string): Promise<MandateDto> {
  const response = await apiClient.get(`${base(tenantId, syndicId)}/mandats/${mandateId}`);
  return response.data.data;
}

export async function createSyndicMandate(
  tenantId: string,
  syndicId: string,
  input: CreateSyndicMandateInput
): Promise<{ mandate: MandateDto; warnings: string[] }> {
  const response = await apiClient.post(`${base(tenantId, syndicId)}/mandats`, input);
  return response.data.data;
}

export async function updateSyndicMandate(
  tenantId: string,
  syndicId: string,
  mandateId: string,
  input: UpdateSyndicMandateInput
): Promise<MandateDto> {
  const response = await apiClient.patch(`${base(tenantId, syndicId)}/mandats/${mandateId}`, input);
  return response.data.data;
}

/** `signedAt` peut manquer si le mandat porte déjà une date de signature. */
export async function activateSyndicMandate(
  tenantId: string,
  syndicId: string,
  mandateId: string,
  signedAt?: string
): Promise<MandateDto> {
  const response = await apiClient.post(
    `${base(tenantId, syndicId)}/mandats/${mandateId}/activer`,
    signedAt ? { signedAt } : {}
  );
  return response.data.data;
}

export async function suspendSyndicMandate(
  tenantId: string,
  syndicId: string,
  mandateId: string,
  reason: string
): Promise<MandateDto> {
  const response = await apiClient.post(`${base(tenantId, syndicId)}/mandats/${mandateId}/suspendre`, { reason });
  return response.data.data;
}

export async function reactivateSyndicMandate(
  tenantId: string,
  syndicId: string,
  mandateId: string
): Promise<MandateDto> {
  const response = await apiClient.post(`${base(tenantId, syndicId)}/mandats/${mandateId}/reactiver`);
  return response.data.data;
}

export async function revokeSyndicMandate(
  tenantId: string,
  syndicId: string,
  mandateId: string,
  reason: string,
  revokedAt?: string
): Promise<MandateDto> {
  const response = await apiClient.post(`${base(tenantId, syndicId)}/mandats/${mandateId}/revoquer`, {
    reason,
    ...(revokedAt ? { revokedAt } : {})
  });
  return response.data.data;
}

export async function downloadSyndicAuthorizationPdf(
  tenantId: string,
  syndicId: string,
  mandateId: string,
  fallbackName: string
): Promise<{ blob: Blob; filename: string }> {
  const response = await apiClient.get<Blob>(`${base(tenantId, syndicId)}/mandats/${mandateId}/autorisation-pdf`, {
    responseType: 'blob'
  });
  return {
    blob: response.data,
    filename: filenameFromDisposition(response.headers?.['content-disposition'], fallbackName)
  };
}

export async function uploadSyndicSignedScan(
  tenantId: string,
  syndicId: string,
  mandateId: string,
  file: File
): Promise<MandateDto> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post(`${base(tenantId, syndicId)}/mandats/${mandateId}/scan-signe`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data.data;
}

export async function downloadSyndicSignedScan(
  tenantId: string,
  syndicId: string,
  mandateId: string,
  fallbackName: string
): Promise<{ blob: Blob; filename: string }> {
  const response = await apiClient.get<Blob>(`${base(tenantId, syndicId)}/mandats/${mandateId}/scan-signe`, {
    responseType: 'blob'
  });
  return {
    blob: response.data,
    filename: filenameFromDisposition(response.headers?.['content-disposition'], fallbackName)
  };
}

// --- Remises -----------------------------------------------------------------

export async function listSyndicRemittances(
  tenantId: string,
  syndicId: string,
  filters: SyndicRemittanceListFilters = {}
): Promise<RemittanceListResult> {
  const response = await apiClient.get(`${base(tenantId, syndicId)}/remises`, { params: cleanParams(filters) });
  return response.data.data;
}

export async function createSyndicRemittance(
  tenantId: string,
  syndicId: string,
  input: CreateSyndicRemittanceInput
): Promise<RemittanceWithSkipped> {
  const response = await apiClient.post(`${base(tenantId, syndicId)}/remises`, input);
  return response.data.data;
}

export async function getSyndicRemittance(
  tenantId: string,
  syndicId: string,
  remittanceId: string
): Promise<RemittanceDto> {
  const response = await apiClient.get(`${base(tenantId, syndicId)}/remises/${remittanceId}`);
  return response.data.data;
}

export async function refreshSyndicRemittance(
  tenantId: string,
  syndicId: string,
  remittanceId: string
): Promise<RemittanceWithSkipped> {
  const response = await apiClient.post(`${base(tenantId, syndicId)}/remises/${remittanceId}/actualiser`);
  return response.data.data;
}

export async function removeSyndicRemittanceLine(
  tenantId: string,
  syndicId: string,
  remittanceId: string,
  lineId: string,
  reason?: string
): Promise<RemittanceDto> {
  const response = await apiClient.post(
    `${base(tenantId, syndicId)}/remises/${remittanceId}/lignes/${lineId}/retirer`,
    reason ? { reason } : {}
  );
  return response.data.data;
}

export async function validateSyndicRemittance(
  tenantId: string,
  syndicId: string,
  remittanceId: string
): Promise<RemittanceWithPrenotifications> {
  const response = await apiClient.post(`${base(tenantId, syndicId)}/remises/${remittanceId}/valider`);
  return response.data.data;
}

export async function resendSyndicPrenotifications(
  tenantId: string,
  syndicId: string,
  remittanceId: string
): Promise<RemittanceWithPrenotifications> {
  const response = await apiClient.post(`${base(tenantId, syndicId)}/remises/${remittanceId}/avis`);
  return response.data.data;
}

/** Produit le fichier de remise (IBAN complets) : un `POST` qui renvoie un fichier. */
export async function exportSyndicRemittance(
  tenantId: string,
  syndicId: string,
  remittanceId: string,
  fallbackName: string
): Promise<{ blob: Blob; filename: string }> {
  const response = await apiClient.post<Blob>(
    `${base(tenantId, syndicId)}/remises/${remittanceId}/fichier`,
    undefined,
    {
      responseType: 'blob'
    }
  );
  return {
    blob: response.data,
    filename: filenameFromDisposition(response.headers?.['content-disposition'], fallbackName)
  };
}

export async function submitSyndicRemittance(
  tenantId: string,
  syndicId: string,
  remittanceId: string
): Promise<RemittanceDto> {
  const response = await apiClient.post(`${base(tenantId, syndicId)}/remises/${remittanceId}/deposer`);
  return response.data.data;
}

export async function cancelSyndicRemittance(
  tenantId: string,
  syndicId: string,
  remittanceId: string,
  reason: string
): Promise<RemittanceDto> {
  const response = await apiClient.post(`${base(tenantId, syndicId)}/remises/${remittanceId}/annuler`, { reason });
  return response.data.data;
}
