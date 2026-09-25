import apiClient from '../utils/api-client';

/**
 * Factures d'abonnement (PLATFORM) et leur paiement — vague 3.
 *
 * Types recopiés EXACTEMENT sur les réponses de l'API :
 * - lot A : packages/api/src/services/platform-invoice-service.ts
 *   (`serializePlatformInvoice`, `listPlatformInvoices`) et
 *   controllers/platform-invoice-controller.ts ;
 * - lot B : services/platform-payment-service.ts (`toPlatformCheckoutDto`,
 *   `toPaymentDto`), services/subscription-admin-extras-service.ts et
 *   controllers/platform-billing-controller.ts.
 */

export type PlatformInvoiceStatus = 'DRAFT' | 'ISSUED' | 'OVERDUE' | 'PAID' | 'FAILED' | 'CANCELED' | 'REFUNDED';
export type PlatformInvoiceNature = 'PERIOD' | 'OVERAGE' | 'CREDIT_NOTE';
export type PlatformPaymentMethod = 'ONLINE' | 'BANK_TRANSFER' | 'MOBILE_MONEY' | 'CHECK' | 'CASH';
export type ManualPaymentMethod = Exclude<PlatformPaymentMethod, 'ONLINE'>;
export type CheckoutStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELED' | 'EXPIRED' | 'REVIEW';

export interface PlatformInvoiceLine {
  id: string;
  kind: string;
  label: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  periodStart: string | null;
  periodEnd: string | null;
  capacityKey: string | null;
}

/** `serializePlatformInvoice` ; `lines`, `issuer`, `customer` seulement sur le détail. */
export interface PlatformInvoice {
  id: string;
  tenantId: string;
  /** `null` tant que la facture est un brouillon. */
  invoiceNumber: string | null;
  nature: PlatformInvoiceNature | null;
  status: PlatformInvoiceStatus;
  issueDate: string;
  issuedAt: string | null;
  dueDate: string;
  periodStart: string | null;
  periodEnd: string | null;
  currency: string;
  amountExclTax: number;
  taxRate: number;
  taxAmount: number;
  amountTotal: number;
  paidAt: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  canceledAt: string | null;
  cancelReason: string | null;
  creditedInvoice: { id: string; invoiceNumber: string } | null;
  sentAt: string | null;
  notes: string | null;
  issuer?: unknown;
  customer?: unknown;
  lines?: PlatformInvoiceLine[];
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PlatformInvoicePage {
  invoices: PlatformInvoice[];
  pagination: Pagination;
}

/** `toPlatformCheckoutDto`. */
export interface PlatformCheckout {
  id: string;
  invoiceId: string;
  codePaiement: string;
  status: CheckoutStatus;
  mode: 'SIMULATOR' | 'LIVE';
  amount: number;
  currency: string;
  checkoutUrl: string | null;
  providerServiceName: string | null;
  failureMessage: string | null;
  reviewReason: string | null;
  createdAt: string;
  completedAt: string | null;
}

/** `toPaymentDto`. */
export interface PlatformInvoicePayment {
  id: string;
  invoiceId: string;
  method: PlatformPaymentMethod;
  amount: number;
  currency: string;
  paidAt: string;
  reference: string | null;
  note: string | null;
  hasProof: boolean;
  proofName: string | null;
  checkoutId: string | null;
  recordedByUserId: string | null;
  createdAt: string;
}

export interface PaymentAvailability {
  available: boolean;
  mode: 'SIMULATOR' | 'LIVE';
}

interface Envelope<T> {
  success: boolean;
  data: T;
  pagination?: Pagination;
  message?: string;
}

function savePdf(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function pageOf(response: { data: Envelope<PlatformInvoice[]> }): PlatformInvoicePage {
  return {
    invoices: response.data.data,
    pagination: response.data.pagination ?? { page: 1, limit: response.data.data.length, total: response.data.data.length, totalPages: 1 }
  };
}

// ------------------------------------------------------------------ super-admin

const adminBase = (tenantId: string) => `/admin/tenants/${tenantId}/platform-invoices`;

export async function listAdminPlatformInvoices(
  tenantId: string,
  params: { page?: number; limit?: number; status?: PlatformInvoiceStatus } = {}
): Promise<PlatformInvoicePage> {
  return pageOf(await apiClient.get<Envelope<PlatformInvoice[]>>(adminBase(tenantId), { params }));
}

export async function getAdminPlatformInvoice(tenantId: string, invoiceId: string): Promise<PlatformInvoice> {
  const response = await apiClient.get<Envelope<PlatformInvoice>>(`${adminBase(tenantId)}/${invoiceId}`);
  return response.data.data;
}

export interface GenerateInvoiceInput {
  nature?: 'PERIOD' | 'OVERAGE';
  issue?: boolean;
}

/** `data` nul quand rien n'est à facturer. */
export async function generatePlatformInvoice(
  tenantId: string,
  input: GenerateInvoiceInput
): Promise<{ invoice: PlatformInvoice | null; created: boolean }> {
  const response = await apiClient.post<Envelope<PlatformInvoice | null> & { created: boolean }>(
    `${adminBase(tenantId)}/generate`,
    input
  );
  return { invoice: response.data.data, created: response.data.created };
}

export async function issuePlatformInvoice(tenantId: string, invoiceId: string): Promise<PlatformInvoice> {
  const response = await apiClient.post<Envelope<PlatformInvoice>>(`${adminBase(tenantId)}/${invoiceId}/issue`);
  return response.data.data;
}

export async function issueCreditNote(
  tenantId: string,
  invoiceId: string,
  input: { reason: string; reissuePending?: boolean }
): Promise<PlatformInvoice> {
  const response = await apiClient.post<Envelope<PlatformInvoice>>(`${adminBase(tenantId)}/${invoiceId}/credit-note`, input);
  return response.data.data;
}

export async function downloadAdminInvoicePdf(tenantId: string, invoice: Pick<PlatformInvoice, 'id' | 'invoiceNumber'>) {
  const response = await apiClient.get(`${adminBase(tenantId)}/${invoice.id}/pdf`, { responseType: 'blob' });
  savePdf(response.data as Blob, `${invoice.invoiceNumber ?? 'brouillon'}.pdf`);
}

export interface ManualPaymentInput {
  method: ManualPaymentMethod;
  /** Date ISO. */
  paidAt: string;
  reference?: string;
  note?: string;
  proof?: File | null;
}

export interface ManualPaymentResult {
  payment: PlatformInvoicePayment;
  subscription: 'NONE' | 'RENEWED';
}

/** Constat manuel, multipart (justificatif facultatif). */
export async function recordManualPayment(
  tenantId: string,
  invoiceId: string,
  input: ManualPaymentInput
): Promise<ManualPaymentResult> {
  const form = new FormData();
  form.append('method', input.method);
  form.append('paidAt', input.paidAt);
  if (input.reference) form.append('reference', input.reference);
  if (input.note) form.append('note', input.note);
  if (input.proof) form.append('proof', input.proof);
  const response = await apiClient.post<Envelope<ManualPaymentResult>>(`${adminBase(tenantId)}/${invoiceId}/payment`, form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data.data;
}

export async function getAdminInvoicePayment(
  tenantId: string,
  invoiceId: string
): Promise<{ payment: PlatformInvoicePayment | null; checkouts: PlatformCheckout[] }> {
  const response = await apiClient.get<Envelope<{ payment: PlatformInvoicePayment | null; checkouts: PlatformCheckout[] }>>(
    `${adminBase(tenantId)}/${invoiceId}/payment`
  );
  return response.data.data;
}

export async function downloadPaymentProof(tenantId: string, invoiceId: string, filename: string) {
  const response = await apiClient.get(`${adminBase(tenantId)}/${invoiceId}/payment/proof`, { responseType: 'blob' });
  savePdf(response.data as Blob, filename);
}

// ------------------------------------------------------------------ agence

const tenantBase = (tenantId: string) => `/tenants/${tenantId}/subscription`;

export async function listOwnPlatformInvoices(
  tenantId: string,
  params: { page?: number; limit?: number } = {}
): Promise<PlatformInvoicePage> {
  return pageOf(await apiClient.get<Envelope<PlatformInvoice[]>>(`${tenantBase(tenantId)}/invoices`, { params }));
}

export async function downloadOwnInvoicePdf(tenantId: string, invoice: Pick<PlatformInvoice, 'id' | 'invoiceNumber'>) {
  const response = await apiClient.get(`${tenantBase(tenantId)}/invoices/${invoice.id}/pdf`, { responseType: 'blob' });
  savePdf(response.data as Blob, `${invoice.invoiceNumber ?? 'facture'}.pdf`);
}

export async function getPaymentAvailability(tenantId: string): Promise<PaymentAvailability> {
  const response = await apiClient.get<Envelope<PaymentAvailability>>(`${tenantBase(tenantId)}/payment-availability`);
  return response.data.data;
}

/**
 * Démarre le paiement en ligne. Un 409 porte `data.codePaiement` et
 * `data.checkoutUrl` : l'appelant reprend alors le paiement en cours.
 */
export async function startInvoiceCheckout(tenantId: string, invoiceId: string): Promise<PlatformCheckout> {
  const response = await apiClient.post<Envelope<PlatformCheckout>>(`${tenantBase(tenantId)}/invoices/${invoiceId}/checkout`);
  return response.data.data;
}

export async function getInvoiceCheckout(tenantId: string, codePaiement: string): Promise<PlatformCheckout> {
  const response = await apiClient.get<Envelope<PlatformCheckout>>(
    `${tenantBase(tenantId)}/checkouts/${encodeURIComponent(codePaiement)}`
  );
  return response.data.data;
}
