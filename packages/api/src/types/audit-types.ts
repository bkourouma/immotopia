// Audit log action keys
export enum AuditActionKey {
  // Tenant actions
  TENANT_CREATED = 'TENANT_CREATED',
  TENANT_UPDATED = 'TENANT_UPDATED',
  TENANT_SUSPENDED = 'TENANT_SUSPENDED',
  TENANT_ACTIVATED = 'TENANT_ACTIVATED',

  // Module actions
  MODULE_ENABLED = 'MODULE_ENABLED',
  MODULE_DISABLED = 'MODULE_DISABLED',

  // User/Collaborator actions
  USER_INVITED = 'USER_INVITED',
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  USER_DISABLED = 'USER_DISABLED',
  USER_ENABLED = 'USER_ENABLED',
  ROLE_ASSIGNED = 'ROLE_ASSIGNED',
  ROLE_REMOVED = 'ROLE_REMOVED',
  PASSWORD_RESET = 'PASSWORD_RESET',
  SESSIONS_REVOKED = 'SESSIONS_REVOKED',

  // Subscription actions
  SUBSCRIPTION_CREATED = 'SUBSCRIPTION_CREATED',
  SUBSCRIPTION_UPDATED = 'SUBSCRIPTION_UPDATED',
  SUBSCRIPTION_CANCELED = 'SUBSCRIPTION_CANCELED',

  // Invoice actions
  INVOICE_CREATED = 'INVOICE_CREATED',
  INVOICE_MARKED_PAID = 'INVOICE_MARKED_PAID',
  INVOICE_CANCELED = 'INVOICE_CANCELED',

  // CRM Calendar actions
  CRM_FOLLOWUP_RESCHEDULED = 'CRM_FOLLOWUP_RESCHEDULED',
  CRM_FOLLOWUP_MARKED_DONE = 'CRM_FOLLOWUP_MARKED_DONE',

  // Property actions
  PROPERTY_CREATED = 'PROPERTY_CREATED',
  PROPERTY_UPDATED = 'PROPERTY_UPDATED',
  PROPERTY_DELETED = 'PROPERTY_DELETED',
  PROPERTY_PUBLISHED = 'PROPERTY_PUBLISHED',
  PROPERTY_UNPUBLISHED = 'PROPERTY_UNPUBLISHED',
  PROPERTY_STATUS_CHANGED = 'PROPERTY_STATUS_CHANGED',
  PROPERTY_MEDIA_UPLOADED = 'PROPERTY_MEDIA_UPLOADED',
  PROPERTY_DOCUMENT_UPLOADED = 'PROPERTY_DOCUMENT_UPLOADED',
  PROPERTY_MANDATE_CREATED = 'PROPERTY_MANDATE_CREATED',
  PROPERTY_MANDATE_REVOKED = 'PROPERTY_MANDATE_REVOKED',
  PROPERTY_VISIT_SCHEDULED = 'PROPERTY_VISIT_SCHEDULED'
}

// Audit log entry
// CRM entity types for audit logging
export const CRM_ENTITY_TYPES = {
  CONTACT: 'CONTACT',
  DEAL: 'DEAL',
  ACTIVITY: 'ACTIVITY'
} as const;

// Property entity types for audit logging
export const PROPERTY_ENTITY_TYPES = {
  PROPERTY: 'PROPERTY',
  PROPERTY_MEDIA: 'PROPERTY_MEDIA',
  PROPERTY_DOCUMENT: 'PROPERTY_DOCUMENT',
  PROPERTY_MANDATE: 'PROPERTY_MANDATE',
  PROPERTY_VISIT: 'PROPERTY_VISIT'
} as const;

export type CrmEntityType = (typeof CRM_ENTITY_TYPES)[keyof typeof CRM_ENTITY_TYPES];

export interface AuditLogEntry {
  actorUserId?: string | null;
  tenantId?: string | null;
  actionKey: AuditActionKey | string;
  entityType: string;
  entityId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  payload?: Record<string, unknown> | null;
  createdAt?: Date;
}

// Audit log query filters
export interface AuditLogFilters {
  tenantId?: string;
  actionKey?: string;
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

// Audit log response
export interface AuditLogResponse {
  logs: AuditLogEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
