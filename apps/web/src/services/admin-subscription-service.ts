import apiClient from '../utils/api-client';

/**
 * Service admin — abonnement SaaS, factures et activité d'une agence (lot G).
 *
 * `services/subscription-service.ts` existe déjà mais appelle de mauvaises
 * routes pour une facture individuelle (`/admin/tenants/:tenantId/invoices/:id`
 * au lieu de `/admin/invoices/:id`) et `services/statistics-service.ts` appelle
 * `/admin/tenants/:tenantId/stats` sous le nom `getTenantActivityStats`, pas
 * `/admin/tenants/:tenantId/activity`. Ni l'un ni l'autre fichier n'est dans le
 * territoire de cet agent : ce service recopie les bons appels plutôt que de
 * les corriger sur place.
 */

export type SubscriptionPlanKey = 'BASIC' | 'PRO' | 'ELITE';
export type SubscriptionBillingCycle = 'MONTHLY' | 'ANNUAL';
export type SubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'SUSPENDED';
export type AdminInvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'FAILED' | 'CANCELED' | 'REFUNDED';

export interface AdminSubscriptionInvoiceSummary {
  id: string;
  invoiceNumber: string;
  amountTotal: number;
  status: AdminInvoiceStatus;
  issueDate: string;
  dueDate: string;
  paidAt: string | null;
}

export interface AdminSubscription {
  id: string;
  tenantId: string;
  planKey: SubscriptionPlanKey;
  billingCycle: SubscriptionBillingCycle;
  status: SubscriptionStatus;
  startAt: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAt: string | null;
  canceledAt: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  invoices?: AdminSubscriptionInvoiceSummary[];
}

export interface AdminInvoice {
  id: string;
  tenantId: string;
  subscriptionId: string | null;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  amountTotal: number;
  status: AdminInvoiceStatus;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TenantActivity {
  memberships: { total: number; active: number; disabled: number };
  modules: { enabled: number; modules: Array<{ key: string; enabledAt: string }> };
  subscription: {
    plan: SubscriptionPlanKey;
    status: SubscriptionStatus;
    billingCycle: SubscriptionBillingCycle;
    currentPeriodEnd: string;
  } | null;
  lastLogin: string | null;
}

export interface CreateAdminSubscriptionRequest {
  planKey: SubscriptionPlanKey;
  billingCycle: SubscriptionBillingCycle;
  status?: SubscriptionStatus;
  startAt?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateAdminSubscriptionRequest {
  planKey?: SubscriptionPlanKey;
  billingCycle?: SubscriptionBillingCycle;
  status?: SubscriptionStatus;
  cancelAt?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CreateAdminInvoiceRequest {
  subscriptionId?: string;
  amountTotal: number;
  currency?: string;
  dueDate: string;
  issueDate?: string;
  notes?: string;
}

export interface UpdateAdminInvoiceRequest {
  status?: AdminInvoiceStatus;
  paidAt?: string | null;
  notes?: string;
}

export interface AdminInvoiceFilters {
  status?: AdminInvoiceStatus;
  subscriptionId?: string;
  page?: number;
  limit?: number;
}

interface Envelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

interface PaginatedEnvelope<T> {
  success: boolean;
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

// ---- Abonnement ----------------------------------------------------------

/** `null` quand l'agence n'a pas encore d'abonnement (l'API renvoie 404). */
export async function getAdminSubscription(tenantId: string): Promise<AdminSubscription | null> {
  try {
    const response = await apiClient.get<Envelope<AdminSubscription>>(`/admin/tenants/${tenantId}/subscription`);
    return response.data.data;
  } catch (err: any) {
    if (err?.response?.status === 404) return null;
    throw err;
  }
}

export async function createAdminSubscription(
  tenantId: string,
  data: CreateAdminSubscriptionRequest
): Promise<AdminSubscription> {
  const response = await apiClient.post<Envelope<AdminSubscription>>(`/admin/tenants/${tenantId}/subscription`, data);
  return response.data.data;
}

export async function updateAdminSubscription(
  tenantId: string,
  data: UpdateAdminSubscriptionRequest
): Promise<AdminSubscription> {
  const response = await apiClient.patch<Envelope<AdminSubscription>>(`/admin/tenants/${tenantId}/subscription`, data);
  return response.data.data;
}

export async function cancelAdminSubscription(tenantId: string, cancelAt?: string): Promise<AdminSubscription> {
  const response = await apiClient.post<Envelope<AdminSubscription>>(`/admin/tenants/${tenantId}/subscription/cancel`, {
    cancelAt
  });
  return response.data.data;
}

// ---- Factures --------------------------------------------------------------

export async function listAdminInvoices(
  tenantId: string,
  filters?: AdminInvoiceFilters
): Promise<{ invoices: AdminInvoice[]; pagination: PaginatedEnvelope<AdminInvoice>['pagination'] }> {
  const response = await apiClient.get<PaginatedEnvelope<AdminInvoice>>(`/admin/tenants/${tenantId}/invoices`, {
    params: filters
  });
  return { invoices: response.data.data, pagination: response.data.pagination };
}

export async function createAdminInvoice(tenantId: string, data: CreateAdminInvoiceRequest): Promise<AdminInvoice> {
  const response = await apiClient.post<Envelope<AdminInvoice>>(`/admin/tenants/${tenantId}/invoices`, data);
  return response.data.data;
}

/** Facture individuelle : route plateforme, pas imbriquée sous l'agence. */
export async function getAdminInvoice(invoiceId: string): Promise<AdminInvoice> {
  const response = await apiClient.get<Envelope<AdminInvoice>>(`/admin/invoices/${invoiceId}`);
  return response.data.data;
}

export async function updateAdminInvoice(invoiceId: string, data: UpdateAdminInvoiceRequest): Promise<AdminInvoice> {
  const response = await apiClient.patch<Envelope<AdminInvoice>>(`/admin/invoices/${invoiceId}`, data);
  return response.data.data;
}

export async function markAdminInvoicePaid(invoiceId: string, paidAt?: string): Promise<AdminInvoice> {
  const response = await apiClient.post<Envelope<AdminInvoice>>(`/admin/invoices/${invoiceId}/mark-paid`, { paidAt });
  return response.data.data;
}

// ---- Activité ----------------------------------------------------------------

export async function getTenantActivity(tenantId: string): Promise<TenantActivity> {
  const response = await apiClient.get<Envelope<TenantActivity>>(`/admin/tenants/${tenantId}/activity`);
  return response.data.data;
}
