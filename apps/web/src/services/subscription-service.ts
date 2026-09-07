import apiClient from '../utils/api-client';

export interface Subscription {
  id: string;
  tenantId: string;
  plan: 'FREE' | 'BASIC' | 'PRO' | 'ENTERPRISE';
  billingCycle: 'MONTHLY' | 'YEARLY';
  status: 'ACTIVE' | 'CANCELLED' | 'EXPIRED' | 'TRIAL';
  startDate: string;
  endDate?: string;
  cancelledAt?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id: string;
  subscriptionId: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  status: 'DRAFT' | 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  issueDate: string;
  dueDate: string;
  paidAt?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSubscriptionRequest {
  plan: 'FREE' | 'BASIC' | 'PRO' | 'ENTERPRISE';
  billingCycle: 'MONTHLY' | 'YEARLY';
  startDate?: string;
  endDate?: string;
  metadata?: Record<string, any>;
}

export interface UpdateSubscriptionRequest {
  plan?: 'FREE' | 'BASIC' | 'PRO' | 'ENTERPRISE';
  billingCycle?: 'MONTHLY' | 'YEARLY';
  status?: 'ACTIVE' | 'CANCELLED' | 'EXPIRED' | 'TRIAL';
  endDate?: string;
  metadata?: Record<string, any>;
}

export interface CreateInvoiceRequest {
  amount: number;
  currency?: string;
  dueDate: string;
  metadata?: Record<string, any>;
}

export interface UpdateInvoiceRequest {
  amount?: number;
  status?: 'DRAFT' | 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  paidAt?: string;
  metadata?: Record<string, any>;
}

export interface InvoiceFilters {
  status?: 'DRAFT' | 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  page?: number;
  limit?: number;
}

export interface SubscriptionResponse {
  success: boolean;
  data: Subscription;
}

export interface InvoiceResponse {
  success: boolean;
  data: Invoice;
}

export interface InvoiceListResponse {
  success: boolean;
  data: {
    invoices: Invoice[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

// Get subscription for tenant
export async function getSubscription(tenantId: string): Promise<SubscriptionResponse> {
  const response = await apiClient.get(`/admin/tenants/${tenantId}/subscription`);
  return response.data;
}

// Create subscription
export async function createSubscription(
  tenantId: string,
  data: CreateSubscriptionRequest
): Promise<SubscriptionResponse> {
  const response = await apiClient.post(`/admin/tenants/${tenantId}/subscription`, data);
  return response.data;
}

// Update subscription
export async function updateSubscription(
  tenantId: string,
  data: UpdateSubscriptionRequest
): Promise<SubscriptionResponse> {
  const response = await apiClient.patch(`/admin/tenants/${tenantId}/subscription`, data);
  return response.data;
}

// Cancel subscription
export async function cancelSubscription(tenantId: string): Promise<SubscriptionResponse> {
  const response = await apiClient.post(`/admin/tenants/${tenantId}/subscription/cancel`);
  return response.data;
}

// List invoices
export async function listInvoices(
  tenantId: string,
  filters?: InvoiceFilters
): Promise<InvoiceListResponse> {
  const response = await apiClient.get(`/admin/tenants/${tenantId}/invoices`, { params: filters });
  return response.data;
}

// Get invoice by ID
export async function getInvoice(tenantId: string, invoiceId: string): Promise<InvoiceResponse> {
  const response = await apiClient.get(`/admin/tenants/${tenantId}/invoices/${invoiceId}`);
  return response.data;
}

// Create invoice
export async function createInvoice(
  tenantId: string,
  data: CreateInvoiceRequest
): Promise<InvoiceResponse> {
  const response = await apiClient.post(`/admin/tenants/${tenantId}/invoices`, data);
  return response.data;
}

// Update invoice
export async function updateInvoice(
  tenantId: string,
  invoiceId: string,
  data: UpdateInvoiceRequest
): Promise<InvoiceResponse> {
  const response = await apiClient.patch(`/admin/tenants/${tenantId}/invoices/${invoiceId}`, data);
  return response.data;
}

// Mark invoice as paid
export async function markInvoiceAsPaid(
  tenantId: string,
  invoiceId: string
): Promise<InvoiceResponse> {
  const response = await apiClient.post(`/admin/tenants/${tenantId}/invoices/${invoiceId}/pay`);
  return response.data;
}





