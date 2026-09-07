/**
 * Owner Portal API Service
 * Frontend service for owner portal API endpoints
 */

import api from '../utils/api-client';

export const ownerPortalService = {
  // Dashboard
  getDashboard: () => api.get('/portal/owner/dashboard'),

  // Properties
  getProperties: (params?: { status?: string; propertyType?: string; transactionMode?: string }) =>
    api.get('/portal/owner/properties', { params }),

  getPropertyDetails: (id: string) => api.get(`/portal/owner/properties/${id}`),

  // Leases
  getLeases: (params?: { status?: string; propertyId?: string }) =>
    api.get('/portal/owner/leases', { params }),

  getLeaseDetails: (id: string) => api.get(`/portal/owner/leases/${id}`),

  // Revenues
  getRevenues: (params?: { startDate?: string; endDate?: string; propertyId?: string; groupBy?: string }) =>
    api.get('/portal/owner/revenues', { params }),

  getRevenueSummary: () => api.get('/portal/owner/revenues/summary'),

  getRevenuesByProperty: (params?: { startDate?: string; endDate?: string }) =>
    api.get('/portal/owner/revenues/by-property', { params }),

  getRevenuesByMonth: (params: { year: number }) =>
    api.get('/portal/owner/revenues/by-month', { params }),

  // Installments
  getInstallments: (params?: { status?: string; propertyId?: string; startDate?: string; endDate?: string }) =>
    api.get('/portal/owner/installments', { params }),

  // Payments
  getPayments: (params?: { startDate?: string; endDate?: string; propertyId?: string; method?: string }) =>
    api.get('/portal/owner/payments', { params }),

  getPaymentDetails: (id: string) => api.get(`/portal/owner/payments/${id}`),

  // Deposits
  getDeposits: () => api.get('/portal/owner/deposits'),

  getDepositMovements: (id: string) => api.get(`/portal/owner/deposits/${id}/movements`),

  // Maintenance
  getMaintenanceTickets: (params?: { status?: string; propertyId?: string; category?: string; priority?: string }) =>
    api.get('/portal/owner/maintenance', { params }),

  getMaintenanceTicketDetails: (id: string) => api.get(`/portal/owner/maintenance/${id}`),

  // Documents
  getDocuments: (params?: { documentType?: string; propertyId?: string; leaseId?: string }) =>
    api.get('/portal/owner/documents', { params }),

  downloadDocument: (documentId: string) =>
    api.get(`/portal/owner/documents/${documentId}/download`, { responseType: 'blob' }),

  // Reports
  generateRevenueReport: (data: { startDate: string; endDate: string; propertyId?: string; format: 'pdf' | 'csv' | 'excel' }) =>
    api.post('/portal/owner/reports/revenue', data, { responseType: 'blob' }),

  generateOccupancyReport: (data: { asOfDate: string; format: 'pdf' | 'csv' | 'excel' }) =>
    api.post('/portal/owner/reports/occupancy', data, { responseType: 'blob' }),

  exportData: (data: { entityType: 'payments' | 'installments' | 'leases'; startDate?: string; endDate?: string; propertyId?: string; format: 'csv' | 'excel' }) =>
    api.post('/portal/owner/reports/export', data, { responseType: 'blob' }),

  // Preferences
  getPreferences: () => api.get('/portal/owner/preferences'),
  updatePreferences: (data: { newsletterConsent?: boolean }) => api.patch('/portal/owner/preferences', data)
};
