import apiClient from '../utils/api-client';
import type {
  InstallmentPaymentLinkCopyResult,
  InstallmentPaymentLinkSendResult,
  InstallmentPaymentLinkSummary
} from '../types/installment-payment-link-types';

type ApiResponse<T> = { success: boolean; data: T };

function base(tenantId: string, installmentId: string): string {
  return `/tenants/${tenantId}/rental/installments/${installmentId}`;
}

/** Envoie le lien de paiement au locataire (WhatsApp ou e-mail). Aucun lien n'est conservé si rien n'est parti. */
export async function sendInstallmentPaymentLink(
  tenantId: string,
  installmentId: string,
  ttlDays?: number
): Promise<InstallmentPaymentLinkSendResult> {
  const response = await apiClient.post<ApiResponse<InstallmentPaymentLinkSendResult>>(
    `${base(tenantId, installmentId)}/payment-link`,
    ttlDays === undefined ? { delivery: 'SEND' } : { delivery: 'SEND', ttlDays }
  );
  return response.data.data;
}

/** Crée un lien à copier. L'URL (jeton en clair) n'est renvoyée qu'ici, une seule fois. */
export async function createInstallmentPaymentLinkToCopy(
  tenantId: string,
  installmentId: string,
  ttlDays?: number
): Promise<InstallmentPaymentLinkCopyResult> {
  const response = await apiClient.post<ApiResponse<InstallmentPaymentLinkCopyResult>>(
    `${base(tenantId, installmentId)}/payment-link`,
    ttlDays === undefined ? { delivery: 'COPY' } : { delivery: 'COPY', ttlDays }
  );
  return response.data.data;
}

export async function listInstallmentPaymentLinks(
  tenantId: string,
  installmentId: string
): Promise<InstallmentPaymentLinkSummary[]> {
  const response = await apiClient.get<ApiResponse<InstallmentPaymentLinkSummary[]>>(
    `${base(tenantId, installmentId)}/payment-links`
  );
  return response.data.data;
}

export async function revokeInstallmentPaymentLink(
  tenantId: string,
  installmentId: string,
  linkId: string
): Promise<void> {
  await apiClient.delete(`${base(tenantId, installmentId)}/payment-link/${encodeURIComponent(linkId)}`);
}
