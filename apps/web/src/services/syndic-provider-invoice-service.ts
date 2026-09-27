import apiClient from '../utils/api-client';
import { filenameFromDisposition } from '../utils/save-blob';
import {
  CancelProviderInvoiceRequest,
  CreateProviderInvoiceRequest,
  CreateProviderInvoiceResult,
  CreateProviderPaymentRequest,
  FundMovementsResult,
  ProviderBalance,
  ProviderInvoice,
  ProviderInvoiceDetail,
  ProviderInvoiceListQuery,
  ProviderInvoiceListResult,
  ProviderPaymentResult,
  UpdateProviderInvoiceRequest
} from '../types/syndic-types';

/**
 * Lot S6 — factures et paiements des prestataires d'une copropriété.
 *
 * Service dédié (et non `syndic-service.ts`) : le contrôleur et le routeur
 * backend de ce lot vivent eux aussi dans des fichiers séparés, pour limiter
 * les conflits avec les lots qui avancent en parallèle sur `syndic-service.ts`.
 */

const base = (tenantId: string, syndicId: string) => `/tenants/${tenantId}/syndics/${syndicId}/factures-prestataires`;

export async function listProviderInvoices(
  tenantId: string,
  syndicId: string,
  query?: ProviderInvoiceListQuery
): Promise<ProviderInvoiceListResult> {
  const response = await apiClient.get<{ success: boolean; data: ProviderInvoiceListResult }>(
    base(tenantId, syndicId),
    { params: query }
  );
  return response.data.data;
}

/**
 * Envoie en multipart quand une pièce jointe est fournie, en JSON sinon : le
 * backend accepte les deux (`packages/api/.../provider-invoice-schemas.ts`).
 */
export async function createProviderInvoice(
  tenantId: string,
  syndicId: string,
  data: CreateProviderInvoiceRequest
): Promise<CreateProviderInvoiceResult> {
  const { file, ...fields } = data;
  if (file) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined || value === null || value === '') continue;
      formData.append(key, String(value));
    }
    formData.append('file', file);
    const response = await apiClient.post<{ success: boolean; data: CreateProviderInvoiceResult }>(
      base(tenantId, syndicId),
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data.data;
  }
  const response = await apiClient.post<{ success: boolean; data: CreateProviderInvoiceResult }>(
    base(tenantId, syndicId),
    fields
  );
  return response.data.data;
}

export async function getProviderInvoice(
  tenantId: string,
  syndicId: string,
  invoiceId: string
): Promise<ProviderInvoiceDetail> {
  const response = await apiClient.get<{ success: boolean; data: ProviderInvoiceDetail }>(
    `${base(tenantId, syndicId)}/${invoiceId}`
  );
  return response.data.data;
}

export async function updateProviderInvoice(
  tenantId: string,
  syndicId: string,
  invoiceId: string,
  data: UpdateProviderInvoiceRequest
): Promise<ProviderInvoice> {
  const response = await apiClient.patch<{ success: boolean; data: ProviderInvoice }>(
    `${base(tenantId, syndicId)}/${invoiceId}`,
    data
  );
  return response.data.data;
}

export async function cancelProviderInvoice(
  tenantId: string,
  syndicId: string,
  invoiceId: string,
  data: CancelProviderInvoiceRequest
): Promise<ProviderInvoice> {
  const response = await apiClient.post<{ success: boolean; data: ProviderInvoice }>(
    `${base(tenantId, syndicId)}/${invoiceId}/annulation`,
    data
  );
  return response.data.data;
}

export async function payProviderInvoice(
  tenantId: string,
  syndicId: string,
  invoiceId: string,
  data: CreateProviderPaymentRequest
): Promise<ProviderPaymentResult> {
  const response = await apiClient.post<{ success: boolean; data: ProviderPaymentResult }>(
    `${base(tenantId, syndicId)}/${invoiceId}/paiements`,
    data
  );
  return response.data.data;
}

export async function cancelProviderPayment(
  tenantId: string,
  syndicId: string,
  invoiceId: string,
  paymentId: string,
  data: CancelProviderInvoiceRequest
): Promise<ProviderPaymentResult> {
  const response = await apiClient.post<{ success: boolean; data: ProviderPaymentResult }>(
    `${base(tenantId, syndicId)}/${invoiceId}/paiements/${paymentId}/annulation`,
    data
  );
  return response.data.data;
}

/**
 * Télécharge la pièce jointe d'une facture. Jamais servie en statique — même
 * politique que `downloadSyndicDocument` (`syndic-service.ts`).
 */
export async function downloadProviderInvoiceFile(
  tenantId: string,
  syndicId: string,
  invoiceId: string,
  fallbackName: string
): Promise<{ blob: Blob; filename: string }> {
  const response = await apiClient.get<Blob>(`${base(tenantId, syndicId)}/${invoiceId}/fichier`, {
    responseType: 'blob'
  });
  return {
    blob: response.data,
    filename: filenameFromDisposition(response.headers?.['content-disposition'], fallbackName)
  };
}

export async function uploadProviderInvoiceFile(
  tenantId: string,
  syndicId: string,
  invoiceId: string,
  file: File
): Promise<ProviderInvoice> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post<{ success: boolean; data: ProviderInvoice }>(
    `${base(tenantId, syndicId)}/${invoiceId}/fichier`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return response.data.data;
}

export async function deleteProviderInvoiceFile(
  tenantId: string,
  syndicId: string,
  invoiceId: string
): Promise<ProviderInvoice> {
  const response = await apiClient.delete<{ success: boolean; data: ProviderInvoice }>(
    `${base(tenantId, syndicId)}/${invoiceId}/fichier`
  );
  return response.data.data;
}

export async function listProviderBalances(tenantId: string, syndicId: string): Promise<ProviderBalance[]> {
  const response = await apiClient.get<{ success: boolean; data: ProviderBalance[] }>(
    `/tenants/${tenantId}/syndics/${syndicId}/prestataires/soldes`
  );
  return response.data.data;
}

export async function listFundMovements(
  tenantId: string,
  syndicId: string,
  fundId: string,
  query?: { page?: number; limit?: number }
): Promise<FundMovementsResult> {
  const response = await apiClient.get<{ success: boolean; data: FundMovementsResult }>(
    `/tenants/${tenantId}/syndics/${syndicId}/fonds/${fundId}/mouvements`,
    { params: query }
  );
  return response.data.data;
}
