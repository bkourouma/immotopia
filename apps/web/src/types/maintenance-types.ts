// Frontend types for Maintenance module

export enum MaintenanceTicketCategory {
  PLUMBING = 'PLUMBING',
  ELECTRICITY = 'ELECTRICITY',
  AC = 'AC',
  OTHER = 'OTHER'
}

export enum MaintenanceTicketPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT'
}

export enum MaintenanceTicketStatus {
  DECLARED = 'DECLARED',
  IN_PROGRESS = 'IN_PROGRESS',
  ASSIGNED = 'ASSIGNED',
  RESOLVED = 'RESOLVED',
  CANCELED = 'CANCELED'
}

export enum MaintenanceTicketCommentAuthorType {
  TENANT = 'TENANT',
  MANAGER = 'MANAGER',
  SYSTEM = 'SYSTEM'
}

// Ticket interfaces
export interface Ticket {
  id: string;
  tenantId: string;
  propertyId: string;
  leaseId?: string;
  tenantContactId?: string;
  title: string;
  category: MaintenanceTicketCategory;
  priority: MaintenanceTicketPriority;
  description: string;
  locationDetails?: string;
  status: MaintenanceTicketStatus;
  assignedVendorId?: string;
  assignedToUserId?: string;
  resolutionNotes?: string;
  declaredAt: string;
  inProgressAt?: string;
  assignedAt?: string;
  resolvedAt?: string;
  canceledAt?: string;
  createdAt: string;
  updatedAt: string;
  property?: {
    id: string;
    internalReference: string;
    address: string;
    title: string;
  };
  lease?: {
    id: string;
    leaseNumber: string;
  };
  assignedVendor?: {
    id: string;
    name: string;
  };
}

export interface TicketDetail extends Ticket {
  attachments: Attachment[];
  comments: Comment[];
  statusHistory: StatusHistory[];
  tenantContact?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  assignedVendor?: {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    specialties?: string[];
  };
  assignedToUser?: {
    id: string;
    email: string;
    fullName?: string;
  };
}

export interface CreateTicketRequest {
  title: string;
  category: MaintenanceTicketCategory;
  priority: MaintenanceTicketPriority;
  description: string;
  locationDetails?: string;
  propertyId: string;
  leaseId?: string;
}

export interface Comment {
  id: string;
  ticketId: string;
  authorType: MaintenanceTicketCommentAuthorType;
  content: string;
  authorUserId?: string;
  authorContactId?: string;
  createdAt: string;
  authorUser?: {
    id: string;
    email: string;
    fullName?: string;
  };
  authorContact?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

export interface Attachment {
  id: string;
  ticketId: string;
  fileUrl: string;
  fileName: string;
  mimeType?: string; // Optional as it might be undefined for older records
  fileSize: number;
  uploadedByUserId?: string;
  uploadedByContactId?: string;
  createdAt: string;
}

export interface StatusHistory {
  id: string;
  ticketId: string;
  fromStatus?: MaintenanceTicketStatus;
  toStatus: MaintenanceTicketStatus;
  note?: string;
  changedByUserId?: string;
  changedAt: string;
  changedByUser?: {
    id: string;
    email: string;
    fullName?: string;
  };
}

export interface TicketFilters {
  status?: MaintenanceTicketStatus;
  propertyId?: string;
  tenantContactId?: string;
  leaseId?: string;
  page?: number;
  limit?: number;
}

export interface TicketListResponse {
  success: boolean;
  data: Ticket[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface TicketResponse {
  success: boolean;
  data: TicketDetail;
}
