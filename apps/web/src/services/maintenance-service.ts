import apiClient from '../utils/api-client';
import {
  Ticket,
  TicketDetail,
  CreateTicketRequest,
  Comment,
  Attachment,
  TicketFilters,
  TicketListResponse,
  TicketResponse,
  MaintenanceTicketStatus,
  MaintenanceTicketPriority,
  MaintenanceTicketCategory
} from '../types/maintenance-types';

// Re-export types for convenience
export type {
  Ticket,
  TicketDetail,
  CreateTicketRequest,
  Comment,
  Attachment,
  TicketFilters,
  TicketListResponse,
  TicketResponse
} from '../types/maintenance-types';

/**
 * Tenant maintenance service
 * All functions require tenantId as a parameter
 */
export const tenantMaintenanceService = {
  /**
   * List tickets for tenant
   */
  async listTickets(
    tenantId: string,
    filters?: TicketFilters
  ): Promise<TicketListResponse> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.propertyId) params.append('propertyId', filters.propertyId);
    if (filters?.tenantContactId) params.append('tenantContactId', filters.tenantContactId);
    if (filters?.leaseId) params.append('leaseId', filters.leaseId);
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());

    const response = await apiClient.get<TicketListResponse>(
      `/tenants/${tenantId}/maintenance/tenant/tickets?${params.toString()}`
    );
    return response.data;
  },

  /**
   * Create a new ticket
   */
  async createTicket(
    tenantId: string,
    data: CreateTicketRequest,
    tenantContactId?: string
  ): Promise<TicketResponse> {
    const response = await apiClient.post<TicketResponse>(
      `/tenants/${tenantId}/maintenance/tenant/tickets`,
      {
        ...data,
        tenantContactId
      }
    );
    return response.data;
  },

  /**
   * Get ticket by ID with full details
   */
  async getTicket(
    tenantId: string,
    ticketId: string,
    tenantContactId?: string
  ): Promise<TicketResponse> {
    const params = new URLSearchParams();
    if (tenantContactId) params.append('tenantContactId', tenantContactId);

    const response = await apiClient.get<TicketResponse>(
      `/tenants/${tenantId}/maintenance/tenant/tickets/${ticketId}?${params.toString()}`
    );
    return response.data;
  },

  /**
   * Update a ticket (title, description, category, priority, locationDetails)
   * Only allowed if ticket status is DECLARED
   */
  async updateTicket(
    tenantId: string,
    ticketId: string,
    data: {
      title?: string;
      description?: string;
      category?: MaintenanceTicketCategory;
      priority?: MaintenanceTicketPriority;
      locationDetails?: string;
    },
    tenantContactId?: string
  ): Promise<TicketResponse> {
    const response = await apiClient.patch<TicketResponse>(
      `/tenants/${tenantId}/maintenance/tenant/tickets/${ticketId}`,
      {
        ...data,
        tenantContactId
      }
    );
    return response.data;
  },

  /**
   * Cancel a ticket
   */
  async cancelTicket(
    tenantId: string,
    ticketId: string,
    tenantContactId?: string
  ): Promise<TicketResponse> {
    const response = await apiClient.patch<TicketResponse>(
      `/tenants/${tenantId}/maintenance/tenant/tickets/${ticketId}`,
      {
        status: MaintenanceTicketStatus.CANCELED,
        tenantContactId
      }
    );
    return response.data;
  },

  /**
   * Delete a ticket permanently
   * Only allowed if ticket status is DECLARED or CANCELED
   */
  async deleteTicket(
    tenantId: string,
    ticketId: string,
    tenantContactId?: string
  ): Promise<{ success: boolean; message: string }> {
    const params = new URLSearchParams();
    if (tenantContactId) params.append('tenantContactId', tenantContactId);

    const response = await apiClient.delete<{ success: boolean; message: string }>(
      `/tenants/${tenantId}/maintenance/tenant/tickets/${ticketId}${params.toString() ? `?${params.toString()}` : ''}`
    );
    return response.data;
  },

  /**
   * Add a comment to a ticket
   */
  async addComment(
    tenantId: string,
    ticketId: string,
    content: string,
    tenantContactId?: string
  ): Promise<{ success: boolean; data: Comment }> {
    const body: { content: string; tenantContactId?: string } = { content };
    if (tenantContactId) {
      body.tenantContactId = tenantContactId;
    }
    
    const response = await apiClient.post<{ success: boolean; data: Comment }>(
      `/tenants/${tenantId}/maintenance/tenant/tickets/${ticketId}/comments`,
      body
    );
    return response.data;
  },

  /**
   * Upload an attachment to a ticket
   */
  async uploadAttachment(
    tenantId: string,
    ticketId: string,
    file: File,
    tenantContactId?: string
  ): Promise<{ success: boolean; data: Attachment }> {
    const formData = new FormData();
    formData.append('file', file);
    if (tenantContactId) {
      formData.append('tenantContactId', tenantContactId);
    }

    const response = await apiClient.post<{ success: boolean; data: Attachment }>(
      `/tenants/${tenantId}/maintenance/tenant/tickets/${ticketId}/attachments`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      }
    );
    return response.data;
  }
};

/**
 * Manager maintenance service
 * All functions require tenantId as a parameter
 */
export const managerMaintenanceService = {
  /**
   * List all tickets for managers (with advanced filters)
   */
  async listTickets(
    tenantId: string,
    filters?: {
      propertyId?: string;
      status?: MaintenanceTicketStatus;
      priority?: MaintenanceTicketPriority;
      assignedVendorId?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<TicketListResponse> {
    const params = new URLSearchParams();
    if (filters?.propertyId) params.append('propertyId', filters.propertyId);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.priority) params.append('priority', filters.priority);
    if (filters?.assignedVendorId) params.append('assignedVendorId', filters.assignedVendorId);
    if (filters?.dateFrom) params.append('dateFrom', filters.dateFrom);
    if (filters?.dateTo) params.append('dateTo', filters.dateTo);
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());

    const response = await apiClient.get<TicketListResponse>(
      `/tenants/${tenantId}/maintenance/admin/tickets?${params.toString()}`
    );
    return response.data;
  },

  /**
   * Get ticket by ID with full details (manager view)
   */
  async getTicket(tenantId: string, ticketId: string): Promise<TicketResponse> {
    const response = await apiClient.get<TicketResponse>(
      `/tenants/${tenantId}/maintenance/admin/tickets/${ticketId}`
    );
    return response.data;
  },

  /**
   * Update ticket (status, priority, vendor assignment, resolution notes)
   */
  async updateTicket(
    tenantId: string,
    ticketId: string,
    data: {
      status?: MaintenanceTicketStatus;
      priority?: MaintenanceTicketPriority;
      assignedVendorId?: string;
      assignedToUserId?: string;
      resolutionNotes?: string;
    }
  ): Promise<TicketResponse> {
    const response = await apiClient.patch<TicketResponse>(
      `/tenants/${tenantId}/maintenance/admin/tickets/${ticketId}`,
      data
    );
    return response.data;
  },

  /**
   * Add a manager comment to a ticket
   */
  async addComment(
    tenantId: string,
    ticketId: string,
    content: string
  ): Promise<{ success: boolean; data: Comment }> {
    const response = await apiClient.post<{ success: boolean; data: Comment }>(
      `/tenants/${tenantId}/maintenance/admin/tickets/${ticketId}/comments`,
      { content }
    );
    return response.data;
  }
};

/**
 * Property maintenance service
 * All functions require tenantId as a parameter
 */
export const propertyMaintenanceService = {
  /**
   * Get maintenance history for a property
   */
  async getHistory(
    tenantId: string,
    propertyId: string,
    filters?: {
      status?: MaintenanceTicketStatus;
      category?: MaintenanceTicketCategory;
    }
  ): Promise<{ success: boolean; data: Ticket[] }> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.category) params.append('category', filters.category);

    const response = await apiClient.get<{ success: boolean; data: Ticket[] }>(
      `/tenants/${tenantId}/maintenance/admin/properties/${propertyId}/maintenance?${params.toString()}`
    );
    return response.data;
  }
};

/**
 * Vendor maintenance service
 * All functions require tenantId as a parameter
 */
export const vendorMaintenanceService = {
  /**
   * List vendors with filters
   */
  async listVendors(
    tenantId: string,
    filters?: {
      isActive?: boolean;
      search?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<{ success: boolean; data: any[]; pagination: any }> {
    const params = new URLSearchParams();
    if (filters?.isActive !== undefined) params.append('isActive', filters.isActive.toString());
    if (filters?.search) params.append('search', filters.search);
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.limit) params.append('limit', filters.limit.toString());

    const response = await apiClient.get<{ success: boolean; data: any[]; pagination: any }>(
      `/tenants/${tenantId}/maintenance/admin/vendors?${params.toString()}`
    );
    return response.data;
  },

  /**
   * Create a new vendor
   */
  async createVendor(
    tenantId: string,
    data: {
      name: string;
      phone?: string;
      email?: string;
      address?: string;
      specialties?: string[];
    }
  ): Promise<{ success: boolean; data: any }> {
    const response = await apiClient.post<{ success: boolean; data: any }>(
      `/tenants/${tenantId}/maintenance/admin/vendors`,
      data
    );
    return response.data;
  },

  /**
   * Get vendor by ID
   */
  async getVendor(tenantId: string, vendorId: string): Promise<{ success: boolean; data: any }> {
    const response = await apiClient.get<{ success: boolean; data: any }>(
      `/tenants/${tenantId}/maintenance/admin/vendors/${vendorId}`
    );
    return response.data;
  },

  /**
   * Update vendor
   */
  async updateVendor(
    tenantId: string,
    vendorId: string,
    data: {
      name?: string;
      phone?: string;
      email?: string;
      address?: string;
      specialties?: string[];
      isActive?: boolean;
    }
  ): Promise<{ success: boolean; data: any }> {
    const response = await apiClient.patch<{ success: boolean; data: any }>(
      `/tenants/${tenantId}/maintenance/admin/vendors/${vendorId}`,
      data
    );
    return response.data;
  },

  /**
   * Deactivate vendor
   */
  async deactivateVendor(tenantId: string, vendorId: string): Promise<{ success: boolean; data: any }> {
    const response = await apiClient.delete<{ success: boolean; data: any }>(
      `/tenants/${tenantId}/maintenance/admin/vendors/${vendorId}`
    );
    return response.data;
  },

  /**
   * Delete vendor permanently
   */
  async deleteVendor(tenantId: string, vendorId: string): Promise<{ success: boolean; message?: string; data: any }> {
    const response = await apiClient.post<{ success: boolean; message?: string; data: any }>(
      `/tenants/${tenantId}/maintenance/admin/vendors/${vendorId}/delete`
    );
    return response.data;
  }
};
