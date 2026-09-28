import apiClient from '../utils/api-client';
import { filenameFromDisposition } from '../utils/save-blob';
import {
  BackfillReceiptsResult,
  ReceiptListQuery,
  ReceiptListResult,
  ReceiptPrintQuery,
  ResendReceiptResult
} from '../types/syndic-types';

/**
 * Reçus de paiement et quittances de charges (lot S3, besoin 1). Contrat :
 * `packages/api/src/routes/syndic-receipts-routes.ts`. Les téléchargements
 * (fichier d'un document, impression groupée) passent en `blob` : ce sont des
 * documents privés, jamais servis en statique.
 */

function toParams(query: Partial<ReceiptListQuery>): Record<string, unknown> {
  return {
    lotId: query.lotId || undefined,
    contactId: query.contactId || undefined,
    kind: query.kind || undefined,
    from: query.from || undefined,
    to: query.to || undefined,
    page: query.page,
    limit: query.limit
  };
}

export async function listSyndicateReceipts(
  tenantId: string,
  syndicId: string,
  query: Partial<ReceiptListQuery> = {}
): Promise<ReceiptListResult> {
  const response = await apiClient.get<{ success: boolean; data: ReceiptListResult }>(
    `/tenants/${tenantId}/syndics/${syndicId}/quittances`,
    { params: toParams(query) }
  );
  return response.data.data;
}

export async function listLotReceipts(
  tenantId: string,
  syndicId: string,
  lotId: string,
  query: Partial<Omit<ReceiptListQuery, 'lotId'>> = {}
): Promise<ReceiptListResult> {
  const response = await apiClient.get<{ success: boolean; data: ReceiptListResult }>(
    `/tenants/${tenantId}/syndics/${syndicId}/lots/${lotId}/quittances`,
    { params: toParams(query) }
  );
  return response.data.data;
}

/** Fichier PDF d'un document (`GET .../quittances/:receiptId/fichier`), nom tiré de `Content-Disposition`. */
export async function downloadReceiptFile(
  tenantId: string,
  syndicId: string,
  receiptId: string,
  fallbackName = 'Document.pdf'
): Promise<{ blob: Blob; filename: string }> {
  const response = await apiClient.get<Blob>(
    `/tenants/${tenantId}/syndics/${syndicId}/quittances/${encodeURIComponent(receiptId)}/fichier`,
    { responseType: 'blob' }
  );
  return {
    blob: response.data,
    filename: filenameFromDisposition(response.headers?.['content-disposition'], fallbackName)
  };
}

/** Renvoi manuel par e-mail. 422 sans adresse copropriétaire, 502 `code: 'EMAIL_SEND_FAILED'`. */
export async function resendReceiptEmail(
  tenantId: string,
  syndicId: string,
  receiptId: string
): Promise<ResendReceiptResult> {
  const response = await apiClient.post<{ success: boolean; data: ResendReceiptResult }>(
    `/tenants/${tenantId}/syndics/${syndicId}/quittances/${encodeURIComponent(receiptId)}/envoi`
  );
  return response.data.data;
}

/**
 * Impression groupée (`GET .../quittances/impression`). 422 si aucun document
 * ne correspond ou si plus de 500 en correspondent : la période ou les
 * filtres doivent être resserrés.
 */
export async function printReceipts(
  tenantId: string,
  syndicId: string,
  query: ReceiptPrintQuery
): Promise<{ blob: Blob; filename: string }> {
  const response = await apiClient.get<Blob>(`/tenants/${tenantId}/syndics/${syndicId}/quittances/impression`, {
    params: {
      from: query.from,
      to: query.to,
      kind: query.kind || undefined,
      lotId: query.lotId || undefined,
      contactId: query.contactId || undefined,
      cols: query.cols,
      rows: query.rows
    },
    responseType: 'blob'
  });
  return {
    blob: response.data,
    filename: filenameFromDisposition(response.headers?.['content-disposition'], 'Quittances.pdf')
  };
}

/** « Générer les quittances manquantes » (idempotent, aucun e-mail envoyé). */
export async function backfillMissingReceipts(tenantId: string, syndicId: string): Promise<BackfillReceiptsResult> {
  const response = await apiClient.post<{ success: boolean; data: BackfillReceiptsResult }>(
    `/tenants/${tenantId}/syndics/${syndicId}/quittances/generer-manquantes`
  );
  return response.data.data;
}
