/**
 * Tenant Portal API Service
 * Frontend service for tenant portal API endpoints
 */

import api from '../utils/api-client';
import type { ReceivingAccountPublic } from './receiving-account-service';

/** Paramètres de liste : filtres (valeurs multiples en CSV), `search`, pagination. */
type PortalListParams = { [key: string]: string | number | undefined };

export const tenantPortalService = {
  // Dashboard
  getDashboard: () => api.get('/portal/tenant/dashboard'),

  // Baux actifs du locataire (plusieurs possibles)
  getLeases: () => api.get('/portal/tenant/leases'),

  // Lease Details — `leaseId` choisit le bail quand il y en a plusieurs
  getLeaseDetails: (leaseId?: string) => api.get('/portal/tenant/lease', { params: leaseId ? { leaseId } : undefined }),

  // Installments
  getInstallments: (
    params?: PortalListParams & { search?: string; status?: string; startDate?: string; endDate?: string }
  ) => api.get('/portal/tenant/installments', { params }),

  getInstallmentDetails: (id: string) => api.get(`/portal/tenant/installments/${id}`),

  // Payments
  getPaymentHistory: (
    params?: PortalListParams & { search?: string; startDate?: string; endDate?: string; method?: string }
  ) => api.get('/portal/tenant/payments', { params }),

  // `leaseId` (paramètre d'URL lu par l'API) désigne le bail quand le paiement n'est
  // rattaché à aucune échéance et que le locataire a plusieurs baux actifs.
  declarePayment: (data: FormData, leaseId?: string) =>
    api.post('/portal/tenant/payments/declare', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params: leaseId ? { leaseId } : undefined
    }),

  // Comptes de réception de l'agence (spec 048, lot Q) : comptes actifs seulement
  getReceivingAccounts: async (): Promise<ReceivingAccountPublic[]> => {
    const response = await api.get<{ success: boolean; data: ReceivingAccountPublic[] }>(
      '/portal/tenant/receiving-accounts'
    );
    return response.data.data;
  },

  // Deposit
  getDepositInfo: (leaseId?: string) =>
    api.get('/portal/tenant/deposit', { params: leaseId ? { leaseId } : undefined }),

  // Maintenance
  getMaintenanceTickets: (
    params?: PortalListParams & {
      search?: string;
      status?: string;
      category?: string;
      priority?: string;
      leaseId?: string;
    }
  ) => api.get('/portal/tenant/maintenance', { params }),

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
