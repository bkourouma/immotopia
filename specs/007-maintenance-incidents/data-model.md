# Data Model: Maintenance & Rental Incidents Module

**Feature**: 007-maintenance-incidents  
**Date**: 2025-01-28  
**Status**: Complete

## Overview

This document defines the data model for the Maintenance & Rental Incidents Module, including all Prisma models, enums, relationships, validation rules, and database constraints. The model follows existing codebase patterns with snake_case table names, UUID primary keys, tenant isolation, and audit fields.

## Enums

### MaintenanceTicketCategory
```prisma
enum MaintenanceTicketCategory {
  PLUMBING      // Plumbing issues (leaks, clogs, water heater)
  ELECTRICITY   // Electrical issues (outlets, wiring, power)
  AC            // Air conditioning / HVAC issues
  OTHER         // Other maintenance issues
}
```

### MaintenanceTicketPriority
```prisma
enum MaintenanceTicketPriority {
  LOW      // Low priority (non-urgent, can wait)
  MEDIUM   // Medium priority (normal response time)
  HIGH     // High priority (urgent, needs attention soon)
  URGENT   // Urgent priority (immediate attention required)
}
```

### MaintenanceTicketStatus
```prisma
enum MaintenanceTicketStatus {
  DECLARED     // Ticket created by tenant, awaiting manager review
  IN_PROGRESS  // Manager has started working on the ticket
  ASSIGNED     // Ticket assigned to a vendor
  RESOLVED     // Ticket resolved, work completed
  CANCELED     // Ticket canceled (by tenant or manager)
}
```

### MaintenanceTicketCommentAuthorType
```prisma
enum MaintenanceTicketCommentAuthorType {
  TENANT   // Comment from tenant (renter)
  MANAGER  // Comment from property manager
  SYSTEM   // System-generated comment (status changes, etc.)
}
```

## Models

### MaintenanceTicket

Represents a maintenance issue or incident reported by a tenant.

```prisma
model MaintenanceTicket {
  id                    String                      @id @default(uuid()) @db.Uuid
  tenant_id             String                      @map("tenant_id")
  property_id           String                      @map("property_id")
  lease_id              String?                     @db.Uuid @map("lease_id")
  tenant_contact_id     String?                     @map("tenant_contact_id")
  created_by_user_id    String?                     @map("created_by_user_id")
  created_by_contact_id String?                     @map("created_by_contact_id")
  
  title                 String
  category              MaintenanceTicketCategory
  priority              MaintenanceTicketPriority
  description           String                      @db.Text
  location_details      String?                     @db.Text @map("location_details")
  
  status                MaintenanceTicketStatus     @default(DECLARED)
  
  assigned_vendor_id    String?                     @db.Uuid @map("assigned_vendor_id")
  assigned_to_user_id   String?                     @map("assigned_to_user_id")
  
  resolution_notes      String?                     @db.Text @map("resolution_notes")
  
  // Status timestamps
  declared_at           DateTime                    @default(now()) @map("declared_at")
  in_progress_at        DateTime?                   @map("in_progress_at")
  assigned_at           DateTime?                   @map("assigned_at")
  resolved_at           DateTime?                   @map("resolved_at")
  canceled_at           DateTime?                   @map("canceled_at")
  
  created_at            DateTime                    @default(now()) @map("created_at")
  updated_at            DateTime                    @updatedAt @map("updated_at")
  
  // Relationships
  tenant                Tenant                      @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  property              Property                    @relation(fields: [property_id], references: [id])
  lease                 RentalLease?                @relation(fields: [lease_id], references: [id])
  tenantContact         CrmContact?                 @relation(fields: [tenant_contact_id], references: [id])
  createdByUser         User?                       @relation("MaintenanceTicketCreatedBy", fields: [created_by_user_id], references: [id])
  createdByContact      CrmContact?                 @relation("MaintenanceTicketCreatedByContact", fields: [created_by_contact_id], references: [id])
  assignedVendor        MaintenanceVendor?          @relation(fields: [assigned_vendor_id], references: [id])
  assignedToUser        User?                       @relation("MaintenanceTicketAssignedTo", fields: [assigned_to_user_id], references: [id])
  
  attachments           MaintenanceTicketAttachment[]
  comments              MaintenanceTicketComment[]
  statusHistory         MaintenanceTicketStatusHistory[]
  
  @@index([tenant_id])
  @@index([tenant_id, status])
  @@index([tenant_id, property_id])
  @@index([tenant_id, lease_id])
  @@index([tenant_id, assigned_vendor_id])
  @@index([tenant_id, created_at])
  @@index([property_id])
  @@index([lease_id])
  @@map("maintenance_tickets")
}
```

**Validation Rules**:
- `title`: Required, min 3 characters, max 200 characters
- `description`: Required, min 10 characters, max 5000 characters
- `category`: Required, must be one of PLUMBING, ELECTRICITY, AC, OTHER
- `priority`: Required, must be one of LOW, MEDIUM, HIGH, URGENT
- `location_details`: Optional, max 500 characters
- `status`: Defaults to DECLARED, must follow workflow transitions
- `lease_id`: Optional but recommended for tenant access validation
- `tenant_contact_id`: Required if created by contact (not user account)

**Status Workflow**:
- DECLARED → IN_PROGRESS (manager starts work)
- DECLARED → CANCELED (tenant or manager cancels)
- IN_PROGRESS → ASSIGNED (requires `assigned_vendor_id` or `assigned_to_user_id`)
- IN_PROGRESS → CANCELED (manager cancels)
- ASSIGNED → RESOLVED (work completed, optional `resolution_notes`)

---

### MaintenanceTicketAttachment

Represents a file (photo, document) attached to a ticket.

```prisma
model MaintenanceTicketAttachment {
  id                    String   @id @default(uuid()) @db.Uuid
  tenant_id             String   @map("tenant_id")
  ticket_id             String   @db.Uuid @map("ticket_id")
  
  file_url              String   @map("file_url")
  file_name             String   @map("file_name")
  mime_type             String   @map("mime_type")
  file_size             Int      @map("file_size") // Size in bytes
  
  uploaded_by_user_id   String?  @map("uploaded_by_user_id")
  uploaded_by_contact_id String? @map("uploaded_by_contact_id")
  
  created_at            DateTime @default(now()) @map("created_at")
  
  // Relationships
  tenant                Tenant   @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  ticket                MaintenanceTicket @relation(fields: [ticket_id], references: [id], onDelete: Cascade)
  uploadedByUser        User?    @relation("MaintenanceAttachmentUploadedBy", fields: [uploaded_by_user_id], references: [id])
  uploadedByContact     CrmContact? @relation("MaintenanceAttachmentUploadedByContact", fields: [uploaded_by_contact_id], references: [id])
  
  @@index([tenant_id])
  @@index([tenant_id, ticket_id])
  @@index([ticket_id])
  @@map("maintenance_ticket_attachments")
}
```

**Validation Rules**:
- `file_url`: Required, relative path from project root (e.g., `uploads/maintenance/<tenantId>/<ticketId>/<filename>`)
- `file_name`: Required, original filename (sanitized)
- `mime_type`: Required, must be one of: `image/jpeg`, `image/jpg`, `image/png`, `image/webp`, `application/pdf`
- `file_size`: Required, must be <= 5MB (5,242,880 bytes)
- Maximum 10 attachments per ticket (enforced at service layer)

---

### MaintenanceTicketComment

Represents a comment in the ticket's discussion thread.

```prisma
model MaintenanceTicketComment {
  id                    String                           @id @default(uuid()) @db.Uuid
  tenant_id             String                           @map("tenant_id")
  ticket_id             String                           @db.Uuid @map("ticket_id")
  
  author_type           MaintenanceTicketCommentAuthorType @map("author_type")
  content               String                           @db.Text
  
  author_user_id        String?                          @map("author_user_id")
  author_contact_id     String?                          @map("author_contact_id")
  
  created_at            DateTime                         @default(now()) @map("created_at")
  
  // Relationships
  tenant                Tenant                           @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  ticket                MaintenanceTicket                @relation(fields: [ticket_id], references: [id], onDelete: Cascade)
  authorUser            User?                            @relation("MaintenanceCommentAuthorUser", fields: [author_user_id], references: [id])
  authorContact         CrmContact?                      @relation("MaintenanceCommentAuthorContact", fields: [author_contact_id], references: [id])
  
  @@index([tenant_id])
  @@index([tenant_id, ticket_id])
  @@index([ticket_id])
  @@index([created_at])
  @@map("maintenance_ticket_comments")
}
```

**Validation Rules**:
- `content`: Required, min 1 character, max 5000 characters
- `author_type`: Required, must be one of TENANT, MANAGER, SYSTEM
- `author_user_id`: Required if `author_type` is MANAGER and user account exists
- `author_contact_id`: Required if `author_type` is TENANT and created by contact

---

### MaintenanceTicketStatusHistory

Represents a record of status change for a ticket.

```prisma
model MaintenanceTicketStatusHistory {
  id                    String                      @id @default(uuid()) @db.Uuid
  tenant_id             String                      @map("tenant_id")
  ticket_id             String                      @db.Uuid @map("ticket_id")
  
  from_status           MaintenanceTicketStatus?    @map("from_status")
  to_status             MaintenanceTicketStatus      @map("to_status")
  note                  String?                     @db.Text
  
  changed_by_user_id    String?                     @map("changed_by_user_id")
  changed_at            DateTime                    @default(now()) @map("changed_at")
  
  // Relationships
  tenant                Tenant                      @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  ticket                MaintenanceTicket           @relation(fields: [ticket_id], references: [id], onDelete: Cascade)
  changedByUser         User?                       @relation("MaintenanceStatusHistoryChangedBy", fields: [changed_by_user_id], references: [id])
  
  @@index([tenant_id])
  @@index([tenant_id, ticket_id])
  @@index([ticket_id])
  @@index([changed_at])
  @@map("maintenance_ticket_status_history")
}
```

**Validation Rules**:
- `from_status`: Optional (null for initial DECLARED status)
- `to_status`: Required, must be valid MaintenanceTicketStatus
- `note`: Optional, max 1000 characters (for resolution notes, cancellation reasons, etc.)
- `changed_by_user_id`: Required for status changes by managers (optional for system-generated changes)

---

### MaintenanceVendor

Represents a maintenance contractor or service provider.

```prisma
model MaintenanceVendor {
  id                    String                @id @default(uuid()) @db.Uuid
  tenant_id             String                @map("tenant_id")
  
  name                  String
  phone                 String?               @db.VarChar(50)
  email                 String?              @db.VarChar(255)
  address               String?               @db.Text
  specialties           String[]              @default([]) // Array of service types (e.g., ["plumbing", "electrical"])
  
  is_active             Boolean               @default(true) @map("is_active")
  
  created_at            DateTime              @default(now()) @map("created_at")
  updated_at            DateTime              @updatedAt @map("updated_at")
  
  // Relationships
  tenant                Tenant                @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  assignedTickets       MaintenanceTicket[]
  
  @@index([tenant_id])
  @@index([tenant_id, is_active])
  @@index([tenant_id, name])
  @@map("maintenance_vendors")
}
```

**Validation Rules**:
- `name`: Required, min 2 characters, max 200 characters
- `phone`: Optional, must be valid phone format if provided
- `email`: Optional, must be valid email format if provided
- `address`: Optional, max 1000 characters
- `specialties`: Optional array, each specialty max 50 characters
- `is_active`: Defaults to true, set to false for soft delete (vendors remain in historical records)

---

## Relationships

### MaintenanceTicket Relationships

- **tenant** (Tenant): Many-to-one. Ticket belongs to a tenant organization.
- **property** (Property): Many-to-one. Ticket is for a specific property.
- **lease** (RentalLease): Many-to-one (optional). Ticket linked to rental lease for access validation.
- **tenantContact** (CrmContact): Many-to-one (optional). Tenant contact (renter) who created the ticket.
- **createdByUser** (User): Many-to-one (optional). User account who created the ticket.
- **createdByContact** (CrmContact): Many-to-one (optional). Contact who created the ticket (if no user account).
- **assignedVendor** (MaintenanceVendor): Many-to-one (optional). Vendor assigned to the ticket.
- **assignedToUser** (User): Many-to-one (optional). Internal user assigned to the ticket.
- **attachments** (MaintenanceTicketAttachment[]): One-to-many. Files attached to the ticket.
- **comments** (MaintenanceTicketComment[]): One-to-many. Comments in the ticket thread.
- **statusHistory** (MaintenanceTicketStatusHistory[]): One-to-many. Status change history.

### MaintenanceTicketAttachment Relationships

- **tenant** (Tenant): Many-to-one. Attachment belongs to a tenant.
- **ticket** (MaintenanceTicket): Many-to-one. Attachment belongs to a ticket.
- **uploadedByUser** (User): Many-to-one (optional). User who uploaded the file.
- **uploadedByContact** (CrmContact): Many-to-one (optional). Contact who uploaded the file.

### MaintenanceTicketComment Relationships

- **tenant** (Tenant): Many-to-one. Comment belongs to a tenant.
- **ticket** (MaintenanceTicket): Many-to-one. Comment belongs to a ticket.
- **authorUser** (User): Many-to-one (optional). User who wrote the comment.
- **authorContact** (CrmContact): Many-to-one (optional). Contact who wrote the comment.

### MaintenanceTicketStatusHistory Relationships

- **tenant** (Tenant): Many-to-one. History entry belongs to a tenant.
- **ticket** (MaintenanceTicket): Many-to-one. History entry belongs to a ticket.
- **changedByUser** (User): Many-to-one (optional). User who changed the status.

### MaintenanceVendor Relationships

- **tenant** (Tenant): Many-to-one. Vendor belongs to a tenant organization.
- **assignedTickets** (MaintenanceTicket[]): One-to-many. Tickets assigned to this vendor.

---

## Database Indexes

### MaintenanceTicket Indexes
- `[tenant_id]`: Fast tenant-scoped queries
- `[tenant_id, status]`: Filter tickets by status per tenant
- `[tenant_id, property_id]`: Property maintenance history queries
- `[tenant_id, lease_id]`: Lease-related tickets
- `[tenant_id, assigned_vendor_id]`: Vendor assignment queries
- `[tenant_id, created_at]`: Chronological ticket lists
- `[property_id]`: Property detail page queries
- `[lease_id]`: Lease detail page queries

### MaintenanceTicketAttachment Indexes
- `[tenant_id]`: Tenant-scoped queries
- `[tenant_id, ticket_id]`: Ticket attachments list
- `[ticket_id]`: Ticket detail page queries

### MaintenanceTicketComment Indexes
- `[tenant_id]`: Tenant-scoped queries
- `[tenant_id, ticket_id]`: Ticket comments list
- `[ticket_id]`: Ticket detail page queries
- `[created_at]`: Chronological comment ordering

### MaintenanceTicketStatusHistory Indexes
- `[tenant_id]`: Tenant-scoped queries
- `[tenant_id, ticket_id]`: Ticket status history
- `[ticket_id]`: Ticket timeline queries
- `[changed_at]`: Chronological history ordering

### MaintenanceVendor Indexes
- `[tenant_id]`: Tenant-scoped queries
- `[tenant_id, is_active]`: Active vendor lists
- `[tenant_id, name]`: Vendor search by name

---

## Validation Rules Summary

### Ticket Creation
- Title: Required, 3-200 characters
- Description: Required, 10-5000 characters
- Category: Required, must be valid enum value
- Priority: Required, must be valid enum value
- Location details: Optional, max 500 characters
- Active lease validation: Tenant must have active lease for property

### File Upload
- File type: Images (JPEG, PNG, WebP) or PDFs only
- File size: Maximum 5MB per file
- File count: Maximum 10 files per ticket
- Filename sanitization: Prevent path traversal attacks

### Status Transitions
- DECLARED → IN_PROGRESS: Allowed
- DECLARED → CANCELED: Allowed
- IN_PROGRESS → ASSIGNED: Requires vendor or user assignment
- IN_PROGRESS → CANCELED: Allowed
- ASSIGNED → RESOLVED: Allowed (optional resolution notes)
- Invalid transitions: Rejected with error message

### Vendor Assignment
- Vendor must be active (`is_active = true`)
- Vendor must belong to same tenant
- Assignment required before ASSIGNED status

### Comment Creation
- Content: Required, 1-5000 characters
- Author type: Required, must be valid enum value
- Author user/contact: Required based on author type

---

## Migration Notes

### New Tables
1. `maintenance_tickets` - Main ticket table
2. `maintenance_ticket_attachments` - File attachments
3. `maintenance_ticket_comments` - Comment thread
4. `maintenance_ticket_status_history` - Status change history
5. `maintenance_vendors` - Vendor directory

### New Enums
1. `MaintenanceTicketCategory` - Ticket categories
2. `MaintenanceTicketPriority` - Priority levels
3. `MaintenanceTicketStatus` - Status workflow states
4. `MaintenanceTicketCommentAuthorType` - Comment author types

### Foreign Key Relationships
- All tables link to `Tenant` (tenant isolation)
- `MaintenanceTicket` links to `Property`, `RentalLease`, `CrmContact`, `User`, `MaintenanceVendor`
- Cascade deletes: Attachments, comments, status history deleted when ticket deleted
- Soft delete: Vendors use `is_active` flag (no cascade delete)

### Indexes
- All tables have `[tenant_id]` index for tenant isolation
- Composite indexes for common query patterns (status filtering, property history, etc.)
- Single-column indexes for foreign keys and timestamps

---

## Data Integrity Constraints

### Tenant Isolation
- All queries MUST include `tenant_id` filter
- Foreign keys enforce tenant boundaries
- Middleware validates tenant access before operations

### Status Workflow
- Status transitions validated at service layer
- Status history records all transitions
- Timestamps updated automatically on status change

### File Storage
- File paths stored relative to project root
- Directory structure: `uploads/maintenance/<tenantId>/<ticketId>/`
- Files deleted when ticket deleted (cascade)

### Vendor Management
- Vendors scoped to tenant
- Inactive vendors cannot be assigned to new tickets
- Historical assignments preserved (soft delete)

---

## Audit Fields

All tables include audit fields:
- `created_at`: Timestamp of record creation
- `updated_at`: Timestamp of last update (auto-updated)
- `created_by_user_id` / `created_by_contact_id`: Creator tracking
- `changed_by_user_id`: Status change tracking (status history)

These fields enable:
- Audit logging
- User activity tracking
- Compliance reporting
- Debugging and troubleshooting
