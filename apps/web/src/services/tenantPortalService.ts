/**
 * Tenant Portal API Service
 * Frontend service for tenant portal API endpoints
 */

import api from '../utils/api-client';

export const tenantPortalService = {
  // Dashboard
  getDashboard: () => api.get('/portal/tenant/dashboard'),

  // Lease Details
  getLeaseDetails: () => api.get('/portal/tenant/lease'),

  // Installments
  getInstallments: (params?: { status?: string; startDate?: string; endDate?: string }) =>
    api.get('/portal/tenant/installments', { params }),

  getInstallmentDetails: (id: string) => api.get(`/portal/tenant/installments/${id}`),

  // Payments
  getPaymentHistory: (params?: { startDate?: string; endDate?: string; method?: string }) =>
    api.get('/portal/tenant/payments', { params }),

  declarePayment: (data: FormData) =>
    api.post('/portal/tenant/payments/declare', data, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),

  // Deposit
  getDepositInfo: () => api.get('/portal/tenant/deposit'),

  // Maintenance
  getMaintenanceTickets: (params?: { status?: string }) =>
    api.get('/portal/tenant/maintenance', { params }),

  createMaintenanceTicket: (data: FormData) =>
    api.post('/portal/tenant/maintenance', data, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),

  getMaintenanceTicketDetails: (id: string) => api.get(`/portal/tenant/maintenance/${id}`),

  addTicketComment: (ticketId: string, comment: string) =>
    api.post(`/portal/tenant/maintenance/${ticketId}/comment`, { comment }),

  // Documents
  getDocuments: (params?: { type?: string }) => api.get('/portal/tenant/documents', { params }),

  downloadDocument: (documentId: string) =>
    api.get(`/portal/tenant/documents/${documentId}/download`, { responseType: 'blob' })
};
