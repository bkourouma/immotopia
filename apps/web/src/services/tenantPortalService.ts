/**
 * Tenant Portal API Service
 * Frontend service for tenant portal API endpoints
 */

import api from '../utils/api-client';

export const tenantPortalService = {
  // Dashboard
  getDashboard: () => api.get('/portal/tenant/dashboard'),

  // Baux actifs du locataire (plusieurs possibles)
  getLeases: () => api.get('/portal/tenant/leases'),

  // Lease Details — `leaseId` choisit le bail quand il y en a plusieurs
  getLeaseDetails: (leaseId?: string) => api.get('/portal/tenant/lease', { params: leaseId ? { leaseId } : undefined }),

  // Installments
  getInstallments: (params?: { status?: string; startDate?: string; endDate?: string }) =>
    api.get('/portal/tenant/installments', { params }),

  getInstallmentDetails: (id: string) => api.get(`/portal/tenant/installments/${id}`),

  // Payments
  getPaymentHistory: (params?: { startDate?: string; endDate?: string; method?: string }) =>
    api.get('/portal/tenant/payments', { params }),

  // `leaseId` (paramètre d'URL lu par l'API) désigne le bail quand le paiement n'est
  // rattaché à aucune échéance et que le locataire a plusieurs baux actifs.
  declarePayment: (data: FormData, leaseId?: string) =>
    api.post('/portal/tenant/payments/declare', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params: leaseId ? { leaseId } : undefined
    }),

  // Deposit
  getDepositInfo: () => api.get('/portal/tenant/deposit'),

  // Maintenance
  getMaintenanceTickets: (params?: { status?: string; leaseId?: string }) =>
    api.get('/portal/tenant/maintenance', { params }),

  // `leaseId` : bail concerné quand le locataire en a plusieurs
  createMaintenanceTicket: (data: FormData, leaseId?: string) =>
    api.post('/portal/tenant/maintenance', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params: leaseId ? { leaseId } : undefined
    }),

  getMaintenanceTicketDetails: (id: string) => api.get(`/portal/tenant/maintenance/${id}`),

  addTicketComment: (ticketId: string, comment: string) =>
    api.post(`/portal/tenant/maintenance/${ticketId}/comment`, { comment }),

  // Documents
  getDocuments: (params?: { type?: string }) => api.get('/portal/tenant/documents', { params }),

  downloadDocument: (documentId: string) =>
    api.get(`/portal/tenant/documents/${documentId}/download`, { responseType: 'blob' })
};
