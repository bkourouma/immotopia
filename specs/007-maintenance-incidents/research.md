# Research: Maintenance & Rental Incidents Module

**Feature**: 007-maintenance-incidents  
**Date**: 2025-01-28  
**Purpose**: Document technology decisions and rationale for maintenance incident management implementation

---

## Technology Decisions

### 1. File Upload Implementation

**Decision**: Use **Multer with memory storage** and save files to local filesystem in `uploads/maintenance/<tenantId>/<ticketId>/` directory structure.

**Rationale**:
- **Multer** is already configured and used in existing modules (properties, documents) - consistent with project patterns
- **Memory storage** allows validation before saving to disk, reducing disk I/O for invalid files
- **Directory structure** (`uploads/maintenance/<tenantId>/<ticketId>/`) provides:
  - Tenant isolation at filesystem level
  - Easy cleanup when tickets are deleted
  - Organized file management per ticket
- **File size limit**: 5MB per file (consistent with document upload limits in existing modules)
- **File count limit**: 10 files per ticket (reasonable for incident reporting, prevents abuse)

**Alternatives Considered**:
- **Cloud storage (S3, Cloudinary)**: More scalable but adds complexity and cost; local storage sufficient for MVP
- **Database storage (BLOB)**: Not recommended for large files; filesystem storage is more efficient
- **Different directory structure**: Current structure provides best organization and isolation

**Implementation**:
```typescript
// Follow existing pattern from property-media-service.ts
// Use multer.memoryStorage(), validate file, then save to disk
// Directory: uploads/maintenance/<tenantId>/<ticketId>/
```

**References**:
- Existing implementation: `packages/api/src/services/property-media-service.ts`
- Multer middleware: `packages/api/src/middleware/upload-middleware.ts`

---

### 2. File Type Validation

**Decision**: Allow **images (JPEG, PNG, WebP) and PDFs only** for ticket attachments.

**Rationale**:
- **Images** are essential for visual documentation of maintenance issues (photos of leaks, electrical problems, etc.)
- **PDFs** allow tenants to upload documents (inspection reports, receipts, etc.)
- **Restricted types** prevent security risks (executable files, scripts) and reduce storage costs
- **MIME type validation** at both multer middleware and service layer for defense in depth

**Allowed Types**:
- Images: `image/jpeg`, `image/jpg`, `image/png`, `image/webp`
- Documents: `application/pdf`

**Implementation**:
```typescript
// File filter in multer middleware + service layer validation
// Reject all other file types with clear error messages
```

---

### 3. Email Notification Service

**Decision**: Use **Nodemailer** (already configured) for sending status change notifications to tenants and property managers.

**Rationale**:
- **Nodemailer** is already integrated and used in existing modules (auth, invitations)
- **Flexible transport**: Supports SMTP (development), SendGrid, AWS SES (production)
- **Reliable delivery**: Handles retries, error logging
- **Template support**: Can use HTML email templates for professional notifications
- **Non-blocking**: Email failures don't block ticket status updates (notifications are informational)

**Notification Triggers**:
- New ticket created → Notify property managers
- Status changed (DECLARED → IN_PROGRESS) → Notify tenant
- Status changed (IN_PROGRESS → ASSIGNED) → Notify tenant
- Status changed (ASSIGNED → RESOLVED) → Notify tenant
- Ticket canceled → Notify property managers

**Implementation**:
```typescript
// Use existing email-utils.ts or create maintenance-specific email templates
// Send notifications asynchronously (don't block status updates)
// Log failures but don't throw errors
```

**References**:
- Existing email service: `packages/api/src/utils/email-utils.ts`
- Email templates: `packages/api/src/utils/email-templates.ts`

---

### 4. Status Workflow Validation

**Decision**: Implement **state machine pattern** for ticket status transitions with strict validation.

**Rationale**:
- **Workflow enforcement**: Prevents invalid status transitions (e.g., DECLARED → RESOLVED without going through IN_PROGRESS and ASSIGNED)
- **Data integrity**: Ensures tickets follow proper resolution process
- **Audit trail**: Status history records all transitions with timestamps and user information
- **Business logic**: Vendor assignment required before ASSIGNED status (FR-011)

**Valid Transitions**:
- DECLARED → IN_PROGRESS (property manager starts work)
- DECLARED → CANCELED (tenant or manager cancels)
- IN_PROGRESS → ASSIGNED (requires vendor assignment)
- IN_PROGRESS → CANCELED (manager cancels)
- ASSIGNED → RESOLVED (work completed)
- ASSIGNED → IN_PROGRESS (vendor unassigned, back to in progress)

**Invalid Transitions** (rejected):
- DECLARED → RESOLVED (skip workflow)
- ASSIGNED → DECLARED (backward transition)
- RESOLVED → any other status (resolved is terminal)

**Implementation**:
```typescript
// Status transition validation function
// Check current status, validate target status, enforce business rules
// Record status history entry on successful transition
```

---

### 5. Tenant Access Validation

**Decision**: **Validate active lease exists** for property before allowing ticket creation by tenant.

**Rationale**:
- **Security**: Prevents tenants from creating tickets for properties they don't rent
- **Data integrity**: Ensures tickets are linked to valid rental relationships
- **Business logic**: Only active leases should allow ticket creation (tenants with ended leases shouldn't create new tickets)
- **Multi-tenant safety**: Additional layer of tenant isolation validation

**Validation Logic**:
1. Verify tenant contact (renter) exists and is linked to user account
2. Verify active lease exists for the property
3. Verify lease is linked to the tenant contact
4. Verify lease status is ACTIVE (not ENDED, CANCELED, SUSPENDED)

**Implementation**:
```typescript
// Service layer validation before ticket creation
// Query RentalLease table with filters: propertyId, primaryRenter/coRenters, status=ACTIVE
// Reject ticket creation if no active lease found
```

**References**:
- Rental lease model: `packages/api/prisma/schema.prisma` (RentalLease model)
- Lease status enum: `RentalLeaseStatus.ACTIVE`

---

### 6. File Access Security

**Decision**: **Secure file access** via authenticated endpoints with permission checks, not public URLs.

**Rationale**:
- **Security**: Prevents unauthorized access to ticket attachments (sensitive property photos, documents)
- **Tenant isolation**: Ensures users can only access files for tickets they have permission to view
- **Audit trail**: File access can be logged for security monitoring
- **Flexibility**: Can implement additional access controls (e.g., expiration, download limits)

**Access Control**:
- Tenant users: Can access files for their own tickets only
- Property managers: Can access files for all tickets in their tenant organization
- System validates ticket ownership/access before serving file

**Implementation**:
```typescript
// GET /api/tenants/:tenantId/maintenance/files/:attachmentId
// Middleware: authenticate + requireTenantAccess + check ticket permission
// Service: Verify user has access to ticket, then serve file
// Use Express res.sendFile() or stream file with proper headers
```

---

## Integration Patterns

### File Upload Flow
1. Client sends multipart/form-data request with ticket data + files
2. Multer middleware processes files (memory storage, validation)
3. Service layer validates ticket data (Zod schema)
4. Service layer validates tenant access (active lease check)
5. Service layer saves files to disk (`uploads/maintenance/<tenantId>/<ticketId>/`)
6. Service layer creates database records (ticket + attachments)
7. Service layer sends email notification to property managers
8. Response returns ticket with attachment metadata

### Status Update Flow
1. Property manager requests status update (PATCH /tickets/:ticketId)
2. Service layer validates status transition (state machine)
3. Service layer enforces business rules (vendor assignment for ASSIGNED)
4. Service layer updates ticket status and timestamps
5. Service layer creates status history entry
6. Service layer sends email notification to tenant (async, non-blocking)
7. Response returns updated ticket

### File Download Flow
1. Client requests file download (GET /files/:attachmentId)
2. Middleware authenticates user and validates tenant access
3. Service layer verifies user has permission to view ticket
4. Service layer reads file from filesystem
5. Service layer streams file to client with appropriate headers
6. (Optional) Log file access for audit

---

## Dependencies on Existing Modules

### Properties Module
- **Property entity**: Link tickets to properties
- **Property detail page**: Add maintenance history tab

### Rental Management Module
- **RentalLease entity**: Validate tenant access (active lease check)
- **Lease status**: Check ACTIVE status before ticket creation

### CRM Module
- **CrmContact entity**: Link tickets to tenant contacts (renters)
- **Contact roles**: Support LOCATAIRE (renter) role for ticket creation

### Multi-Tenant & RBAC
- **Tenant entity**: Tenant isolation
- **Membership entity**: User-tenant relationships
- **RBAC middleware**: Permission checks for tenant vs. property manager access

### File Storage
- **Uploads directory**: Use existing `uploads/` directory structure
- **Multer configuration**: Reuse existing multer setup patterns

### Email Service
- **Nodemailer**: Use existing email service configuration
- **Email templates**: Create maintenance-specific templates

---

## Performance Considerations

### File Upload
- **Memory storage**: Files held in memory during upload (5MB max per file)
- **Async file save**: Save files to disk asynchronously to avoid blocking request
- **File validation**: Validate early (multer middleware) to reject invalid files quickly

### Database Queries
- **Indexes**: Add indexes on `tenantId`, `propertyId`, `leaseId`, `status`, `createdAt` for fast filtering
- **Pagination**: Implement pagination for ticket lists (support 500+ tickets per tenant)
- **Eager loading**: Use Prisma `include` to load related data (attachments, comments) efficiently

### Email Notifications
- **Async processing**: Send emails asynchronously (don't block status updates)
- **Queue system**: Consider job queue (Bull/BullMQ) for production if email volume is high
- **Error handling**: Log email failures but don't fail ticket operations

---

## Security Considerations

### File Upload Security
- **File type validation**: Strict MIME type checking (images + PDFs only)
- **File size limits**: 5MB per file, 10 files per ticket (prevent DoS)
- **Filename sanitization**: Sanitize uploaded filenames to prevent path traversal
- **Virus scanning**: Consider ClamAV integration for production (out of scope for MVP)

### Access Control
- **Tenant isolation**: All queries must include `tenantId` filter
- **Permission checks**: Verify user has permission to view/modify ticket
- **File access**: Secure file downloads with permission validation

### Data Validation
- **Input validation**: Zod schemas for all request bodies
- **Status transitions**: Validate status workflow transitions
- **Business rules**: Enforce vendor assignment, active lease validation

---

## Future Enhancements (Out of Scope for MVP)

- **Vendor portal**: Allow vendors to view assigned tickets and update status
- **SMS notifications**: Send SMS in addition to email for urgent tickets
- **File compression**: Compress images before storage to reduce disk usage
- **Cloud storage**: Migrate to S3/Cloudinary for better scalability
- **Advanced analytics**: Dashboard with ticket metrics, resolution times, vendor performance
- **Mobile app**: Native mobile apps for tenants and property managers
- **Real-time updates**: WebSocket integration for real-time ticket updates
- **Automated scheduling**: Calendar integration for vendor assignment scheduling
