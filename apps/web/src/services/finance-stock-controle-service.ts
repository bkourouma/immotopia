/**
 * Frontière réseau du contrôle du stock — lot 040 (ecrans §3.2).
 *
 * Contexte terrain, carnet des preneurs, bons et leurs PDF, pièces jointes,
 * alertes, indicateurs, réglages de contrôle, réceptions d'une facture,
 * factures réceptionnables, auteurs et export du journal, rebut et retour au
 * fournisseur. Les écrans appellent ces fonctions et rien d'autre.
 *
 * Mêmes règles que les autres services du stock :
 *
 *  - aucun corps ne répète un identifiant que le chemin porte déjà (schémas
 *    serveur `.strict()`) ;
 *  - chaque corps est recomposé champ par champ : aucun champ de valeur ne
 *    s'y glisse ;
 *  - une lecture qui renvoie `meta` rend `{ data, meta }` ; une écriture
 *    terrain rend en plus `replayed` (`200` = rejeu idempotent, `201` =
 *    création) ;
 *  - un fichier se lit par `apiClient` en `blob`, jamais par un lien direct :
 *    chaque lecture est tracée côté serveur (`DOCUMENT_DOWNLOADED`).
 *
 * `base()` et `toQuery()` sont recopiées : aucun service du dépôt n'en importe
 * un autre.
 */

import apiClient from '../utils/api-client';
import { filenameFromDisposition } from '../utils/save-blob';
import type {
  ControlsSettingsPatch,
  CreateTakerRequest,
  ScrapRequest,
  StockAlertsFilters,
  StockAlertView,
  StockAttachmentTarget,
  StockAttachmentUpload,
  StockAttachmentView,
  StockControlsSettings,
  StockCountView,
  StockDownload,
  StockFieldContext,
  StockIndicatorsQuery,
  StockIndicatorsView,
  StockInvoiceReceiptsView,
  StockMeta,
  StockMovementAuthor,
  StockMovementsFilters,
  StockMovementView,
  StockRead,
  StockReceivableInvoice,
  StockSlipView,
  StockTakerView,
  StockWrite,
  SupplierReturnRequest,
  UpdateTakerRequest
} from '../types/finance-stock-controle-types';

type ApiResponse<T> = { success: boolean; data: T };
type ApiResponseWithMeta<T> = { success: boolean; data: T; meta?: StockMeta };

function base(tenantId: string): string {
  return `/tenants/${tenantId}/finance`;
}

function toQuery(filters?: Record<string, string | number | boolean | undefined>): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

/** Absent, on ne suppose rien de favorable : valeurs non visibles. */
function metaOf(body: { meta?: StockMeta }): StockMeta {
  return body.meta ?? { valuesVisible: false, blindLocationIds: [] };
}

function trimmedOrUndefined(value: string | null | undefined): string | undefined {
  const texte = (value ?? '').trim();
  return texte ? texte : undefined;
}

/** Un champ facultatif d'un preneur : chaîne détourée, `null` si vide (efface). */
function nullableText(value: string | null | undefined): string | null {
  const texte = (value ?? '').trim();
  return texte ? texte : null;
}

async function downloadBlob(url: string, fallbackName: string): Promise<StockDownload> {
  const response = await apiClient.get<Blob>(url, { responseType: 'blob' });
  const headers = (response.headers ?? {}) as Record<string, unknown>;
  return {
    blob: response.data,
    filename: filenameFromDisposition(headers['content-disposition'], fallbackName)
  };
}

// ---------------------------------------------------------------------------
// Le contexte terrain (B3-R1), chargé une fois
// ---------------------------------------------------------------------------

/** `GET /stock/field-context` : lieux, chantiers, postes, articles, preneurs, factures, motifs, droits. */
export async function getStockFieldContext(tenantId: string): Promise<StockRead<StockFieldContext>> {
  const response = await apiClient.get<ApiResponseWithMeta<StockFieldContext>>(`${base(tenantId)}/stock/field-context`);
  return { data: response.data.data, meta: metaOf(response.data) };
}

// ---------------------------------------------------------------------------
// Le carnet des preneurs (B2)
// ---------------------------------------------------------------------------

/** La liste du carnet, triée par nom. `onlyActive` vaut vrai côté serveur quand il est omis. */
export async function listStockTakers(
  tenantId: string,
  filters?: { onlyActive?: boolean; search?: string }
): Promise<StockTakerView[]> {
  const response = await apiClient.get<ApiResponse<StockTakerView[]>>(
    `${base(tenantId)}/stock/takers${toQuery(filters)}`
  );
  return response.data.data;
}

/** Ajoute un preneur : les cinq champs du contrat, rien d'autre ; les vides partent à `null`. */
export async function createStockTaker(tenantId: string, params: CreateTakerRequest): Promise<StockTakerView> {
  const corps = {
    fullName: params.fullName.trim(),
    teamOrCompany: nullableText(params.teamOrCompany),
    phone: nullableText(params.phone),
    employeeId: params.employeeId ?? null,
    contractorId: params.contractorId ?? null
  };
  const response = await apiClient.post<ApiResponse<StockTakerView>>(`${base(tenantId)}/stock/takers`, corps);
  return response.data.data;
}

/**
 * Corrige un preneur : seuls les champs fournis partent. `phone: null` efface
 * le numéro ; `isActive: false` désactive le preneur (il ne se supprime pas).
 */
export async function updateStockTaker(
  tenantId: string,
  takerId: string,
  patch: UpdateTakerRequest
): Promise<StockTakerView> {
  const corps: Record<string, unknown> = {};
  if (patch.fullName !== undefined) corps.fullName = patch.fullName.trim();
  if (patch.teamOrCompany !== undefined) corps.teamOrCompany = nullableText(patch.teamOrCompany);
  if (patch.phone !== undefined) corps.phone = nullableText(patch.phone);
  if (patch.employeeId !== undefined) corps.employeeId = patch.employeeId;
  if (patch.contractorId !== undefined) corps.contractorId = patch.contractorId;
  if (patch.isActive !== undefined) corps.isActive = patch.isActive;
  const response = await apiClient.patch<ApiResponse<StockTakerView>>(
    `${base(tenantId)}/stock/takers/${takerId}`,
    corps
  );
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Les bons (B4)
// ---------------------------------------------------------------------------

/** Le détail d'un bon, masqué pour l'appelant. */
export async function getStockSlip(tenantId: string, slipId: string): Promise<StockRead<StockSlipView>> {
  const response = await apiClient.get<ApiResponseWithMeta<StockSlipView>>(`${base(tenantId)}/stock/slips/${slipId}`);
  return { data: response.data.data, meta: metaOf(response.data) };
}

/** Le PDF d'un bon, régénéré à la demande. `fallbackName` sert si l'en-tête ne nomme pas le fichier. */
export async function downloadStockSlipPdf(
  tenantId: string,
  slipId: string,
  fallbackName = 'bon.pdf'
): Promise<StockDownload> {
  return downloadBlob(`${base(tenantId)}/stock/slips/${slipId}/pdf`, fallbackName);
}

/** Le procès-verbal d'un inventaire validé (numéroté, ou antérieur à la numérotation). */
export async function downloadStockCountReport(
  tenantId: string,
  countId: string,
  fallbackName = 'proces-verbal-inventaire.pdf'
): Promise<StockDownload> {
  return downloadBlob(`${base(tenantId)}/stock/counts/${countId}/report.pdf`, fallbackName);
}

// ---------------------------------------------------------------------------
// Les pièces jointes (B5)
// ---------------------------------------------------------------------------

/**
 * Dépose une photo ou un scan, en `multipart` (champ « file »), avec son
 * identifiant de requête : un réessai après une coupure ne dépose jamais deux
 * fois la même pièce (B5-R7).
 */
export async function uploadStockAttachment(
  tenantId: string,
  upload: StockAttachmentUpload
): Promise<StockAttachmentView> {
  const formData = new FormData();
  if (upload.fileName) {
    formData.append('file', upload.file, upload.fileName);
  } else {
    formData.append('file', upload.file);
  }
  formData.append('targetType', upload.targetType);
  formData.append('targetId', upload.targetId);
  if (upload.purpose) formData.append('purpose', upload.purpose);
  const legende = trimmedOrUndefined(upload.caption);
  if (legende) formData.append('caption', legende);
  formData.append('clientRequestId', upload.clientRequestId);

  const response = await apiClient.post<ApiResponse<StockAttachmentView>>(
    `${base(tenantId)}/stock/attachments`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  // Un rejeu (200) rend la pièce d'origine : pour l'écran, c'est le même succès.
  return response.data.data;
}

/** Les pièces d'une cible. Les fichiers ne se chargent pas ici : seulement leurs fiches. */
export async function listStockAttachments(
  tenantId: string,
  targetType: StockAttachmentTarget,
  targetId: string
): Promise<StockAttachmentView[]> {
  const response = await apiClient.get<ApiResponse<StockAttachmentView[]>>(
    `${base(tenantId)}/stock/attachments${toQuery({ targetType, targetId })}`
  );
  return response.data.data;
}

/** Le fichier d'une pièce, en blob (lecture tracée par le serveur). */
export async function fetchStockAttachmentBlob(tenantId: string, attachmentId: string): Promise<Blob> {
  const response = await apiClient.get<Blob>(`${base(tenantId)}/stock/attachments/${attachmentId}/file`, {
    responseType: 'blob'
  });
  return response.data;
}

/** Retire une pièce, avec un motif (3 à 500 caractères). La fiche reste, avec son empreinte. */
export async function removeStockAttachment(
  tenantId: string,
  attachmentId: string,
  reason: string
): Promise<StockAttachmentView> {
  const response = await apiClient.post<ApiResponse<StockAttachmentView>>(
    `${base(tenantId)}/stock/attachments/${attachmentId}/remove`,
    { reason: reason.trim() }
  );
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Les alertes (B7)
// ---------------------------------------------------------------------------

/** Les alertes, filtrées. Titre et message viennent traduits du serveur. */
export async function listStockAlerts(
  tenantId: string,
  filters?: StockAlertsFilters
): Promise<StockRead<StockAlertView[]>> {
  const response = await apiClient.get<ApiResponseWithMeta<StockAlertView[]>>(
    `${base(tenantId)}/stock/alerts${toQuery(filters as Record<string, string | number | undefined>)}`
  );
  return { data: response.data.data, meta: metaOf(response.data) };
}

/** Marque une alerte comme traitée ; la note ne part que si elle n'est pas vide. */
export async function acknowledgeStockAlert(tenantId: string, alertId: string, note?: string): Promise<StockAlertView> {
  const texte = trimmedOrUndefined(note);
  const response = await apiClient.post<ApiResponse<StockAlertView>>(
    `${base(tenantId)}/stock/alerts/${alertId}/acknowledge`,
    texte ? { note: texte } : {}
  );
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Les indicateurs (B8) et les réglages de contrôle
// ---------------------------------------------------------------------------

/** Indicateurs par lieu et par mois (`from` / `to` en `AAAA-MM`). */
export async function getStockIndicators(tenantId: string, query: StockIndicatorsQuery): Promise<StockIndicatorsView> {
  const response = await apiClient.get<ApiResponse<StockIndicatorsView>>(
    `${base(tenantId)}/stock/indicators${toQuery({ from: query.from, to: query.to, locationId: query.locationId })}`
  );
  return response.data.data;
}

/** Les réglages de contrôle de l'agence. */
export async function getStockControls(tenantId: string): Promise<StockControlsSettings> {
  const response = await apiClient.get<ApiResponse<StockControlsSettings>>(`${base(tenantId)}/stock/settings/controls`);
  return response.data.data;
}

/**
 * N'envoie que les champs modifiés ; `null` sur un seuil le désactive et part
 * tel quel.
 */
export async function updateStockControls(
  tenantId: string,
  patch: ControlsSettingsPatch
): Promise<StockControlsSettings> {
  const corps: Record<string, unknown> = {};
  for (const key of [
    'backdatingLimitDays',
    'requireTaker',
    'issueAlertAmount',
    'countVarianceAlertAmount',
    'countVarianceAlertPercent',
    'cashMaterialAlertAmount',
    'materialCostCategoryIds'
  ] as const) {
    if (patch[key] !== undefined) {
      corps[key] = patch[key];
    }
  }
  const response = await apiClient.patch<ApiResponse<StockControlsSettings>>(
    `${base(tenantId)}/stock/settings/controls`,
    corps
  );
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Les factures (A8-R1, B3-R1)
// ---------------------------------------------------------------------------

/** Réceptions déjà faites sur une facture, ses lignes et le cumul par article. */
export async function getInvoiceReceipts(
  tenantId: string,
  invoiceId: string
): Promise<StockRead<StockInvoiceReceiptsView>> {
  const response = await apiClient.get<ApiResponseWithMeta<StockInvoiceReceiptsView>>(
    `${base(tenantId)}/stock/supplier-invoices/${invoiceId}/receipts`
  );
  return { data: response.data.data, meta: metaOf(response.data) };
}

/** Cherche une facture réceptionnable hors des 50 du contexte terrain (20 par page). */
export async function searchReceivableInvoices(
  tenantId: string,
  params?: { search?: string; cursor?: string; limit?: number }
): Promise<StockRead<StockReceivableInvoice[]>> {
  const response = await apiClient.get<ApiResponseWithMeta<StockReceivableInvoice[]>>(
    `${base(tenantId)}/stock/receivable-invoices${toQuery({
      search: trimmedOrUndefined(params?.search),
      cursor: params?.cursor,
      limit: params?.limit ?? 20
    })}`
  );
  return { data: response.data.data, meta: metaOf(response.data) };
}

// ---------------------------------------------------------------------------
// L'inventaire — mise à l'écart groupée des non comptés (A2-R8)
// ---------------------------------------------------------------------------

/** Écarte en une fois toutes les lignes non comptées, avec un motif commun. */
export async function setAsideUncountedLines(
  tenantId: string,
  countId: string,
  reason: string
): Promise<StockCountView> {
  const response = await apiClient.post<ApiResponse<StockCountView>>(
    `${base(tenantId)}/stock/counts/${countId}/set-aside-uncounted`,
    { reason: reason.trim() }
  );
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Le journal : auteurs et export (A5)
// ---------------------------------------------------------------------------

/** Les auteurs de mouvements de l'agence (filtre « Saisi par », valeurs visibles seulement). */
export async function listMovementAuthors(tenantId: string): Promise<StockMovementAuthor[]> {
  const response = await apiClient.get<ApiResponse<StockMovementAuthor[]>>(`${base(tenantId)}/stock/movements/authors`);
  return response.data.data;
}

/** L'export CSV du journal, mêmes filtres que la liste, sans curseur ni limite. */
export async function exportStockMovementsCsv(
  tenantId: string,
  filters?: Omit<StockMovementsFilters, 'cursor' | 'limit'>
): Promise<StockDownload> {
  const sansPagination = { ...(filters ?? {}) } as Record<string, string | number | undefined>;
  delete sansPagination.cursor;
  delete sansPagination.limit;
  return downloadBlob(
    `${base(tenantId)}/stock/movements/export.csv${toQuery(sansPagination)}`,
    'journal-des-mouvements.csv'
  );
}

// ---------------------------------------------------------------------------
// Rebut et retour au fournisseur (A6)
// ---------------------------------------------------------------------------

/** Enregistre un rebut : lieu, article, quantité, date, motif et précision. Aucun prix. */
export async function recordStockScrap(tenantId: string, params: ScrapRequest): Promise<StockWrite<StockMovementView>> {
  const precision = trimmedOrUndefined(params.reason);
  const corps = {
    locationId: params.locationId,
    itemId: params.itemId,
    quantity: params.quantity,
    scrapDate: params.scrapDate,
    reasonCode: params.reasonCode,
    ...(precision ? { reason: precision } : {}),
    ...(params.clientRequestId ? { clientRequestId: params.clientRequestId } : {})
  };
  const response = await apiClient.post<ApiResponseWithMeta<StockMovementView>>(
    `${base(tenantId)}/stock/scraps`,
    corps
  );
  return { data: response.data.data, meta: metaOf(response.data), replayed: response.status === 200 };
}

/**
 * Enregistre un retour au fournisseur. La ligne de facture ne part que si elle
 * est choisie ; aucun prix n'est envoyé (le serveur valorise, A6-R3 bis).
 */
export async function recordSupplierReturn(
  tenantId: string,
  params: SupplierReturnRequest
): Promise<StockWrite<StockMovementView>> {
  const precision = trimmedOrUndefined(params.reason);
  const corps = {
    locationId: params.locationId,
    supplierInvoiceId: params.supplierInvoiceId,
    ...(params.supplierInvoiceLineId ? { supplierInvoiceLineId: params.supplierInvoiceLineId } : {}),
    itemId: params.itemId,
    quantity: params.quantity,
    returnDate: params.returnDate,
    reasonCode: params.reasonCode,
    ...(precision ? { reason: precision } : {}),
    ...(params.clientRequestId ? { clientRequestId: params.clientRequestId } : {})
  };
  const response = await apiClient.post<ApiResponseWithMeta<StockMovementView>>(
    `${base(tenantId)}/stock/supplier-returns`,
    corps
  );
  return { data: response.data.data, meta: metaOf(response.data), replayed: response.status === 200 };
}
