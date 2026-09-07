# Research: Tenant Portal Module

**Feature**: 008-tenant-portal  
**Date**: 2025-01-27  
**Purpose**: Document technology decisions and rationale for tenant portal implementation

---

## Technology Decisions

### 1. Tenant Portal Access Middleware

**Decision**: Create new middleware `requireTenantPortalAccess` that verifies JWT authentication, checks user is linked to TenantClient, and verifies user has an active lease (as primary renter or co-renter).

**Rationale**:
- **JWT Authentication**: Existing `authenticate` middleware handles JWT validation, so new middleware runs after authentication
- **TenantClient Link**: Users must be linked to TenantClient records to access portal (tenants, not property managers)
- **Active Lease Check**: Portal access requires at least one active lease where user is primary renter OR co-renter (via RentalLeaseCoRenter table)
- **Context Storage**: Store `leaseId`, `tenantClientId`, and `lease` object in `req.tenantPortal` for use in controllers/services

**Alternatives Considered**:
- **RBAC Permission Check**: Could use existing permission system, but tenant portal is a special case requiring active lease validation
- **Separate Route Group**: Portal routes are already grouped under `/api/portal/tenant/*`, middleware provides additional security layer

**Implementation**:
```typescript
// Middleware checks:
// 1. req.user exists (from authenticate middleware)
// 2. Find TenantClient where userId = req.user.userId
// 3. Find active RentalLease where:
//    - primaryRenterId = tenantClient.id OR
//    - tenantClient.id in RentalLeaseCoRenter.renterClientId
// 4. Store in req.tenantPortal = { leaseId, tenantClientId, lease }
```

**References**:
- Existing authentication: `packages/api/src/middleware/auth-middleware.ts`
- Existing tenant access: `packages/api/src/middleware/tenant-middleware.ts`
- Rental lease model: `packages/api/prisma/schema.prisma` (RentalLease, RentalLeaseCoRenter)

---

### 2. Payment Declaration Model

**Decision**: Create new Prisma model `RentalPaymentDeclaration` to track tenant-declared payments with status workflow (PENDING → APPROVED/REJECTED/CANCELED).

**Rationale**:
- **Separation of Concerns**: Payment declarations are different from actual payments - they require property manager review before being converted to payments
- **Status Workflow**: PENDING status allows property managers to review and approve/reject declarations
- **Optional Installment Link**: Tenants can link declarations to specific installments or leave unlinked for general payments
- **Proof File Storage**: Store proof file URL for property manager review
- **Audit Trail**: Track who declared, who reviewed, when reviewed, and review notes

**Alternatives Considered**:
- **Extend RentalPayment Model**: Would mix actual payments with pending declarations, complicating payment queries
- **Use Maintenance Ticket Pattern**: Different use case - payment declarations are financial transactions, not maintenance issues

**Implementation**:
```prisma
model RentalPaymentDeclaration {
  id              String   @id @default(uuid())
  leaseId         String
  installmentId   String?
  declaredBy      String   // TenantClient.id
  amount          Decimal  @db.Decimal(12, 2)
  paymentDate     DateTime
  paymentMethod   RentalPaymentMethod
  mobileOperator  MobileMoneyOperator?
  reference       String?
  proofFileUrl    String?
  status          PaymentDeclarationStatus @default(PENDING)
  reviewedBy      String?  // User.id
  reviewedAt      DateTime?
  reviewNotes     String?  @db.Text
  notes           String?  @db.Text
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  // Relations
  lease           RentalLease           @relation(...)
  installment     RentalInstallment?    @relation(...)
  declarer        TenantClient          @relation(...)
  reviewer        User?                 @relation(...)
}

enum PaymentDeclarationStatus {
  PENDING
  APPROVED
  REJECTED
  CANCELED
}
```

**References**:
- Existing payment model: `packages/api/prisma/schema.prisma` (RentalPayment)
- Existing maintenance ticket pattern: `packages/api/prisma/schema.prisma` (MaintenanceTicket)

---

### 3. File Upload for Payment Proof

**Decision**: Use existing Multer pattern with memory storage, save payment proof files to `uploads/portal/payments/<tenantId>/<declarationId>/` directory structure.

**Rationale**:
- **Consistency**: Follows existing file upload patterns from maintenance and property modules
- **Memory Storage**: Allows validation before saving to disk, reducing disk I/O for invalid files
- **Directory Structure**: `uploads/portal/payments/<tenantId>/<declarationId>/` provides:
  - Tenant isolation at filesystem level
  - Easy cleanup when declarations are deleted
  - Organized file management per declaration
- **File Size Limit**: 5MB per file (consistent with maintenance module limits)
- **File Types**: Images (JPEG, PNG, WebP) and PDFs only (same as maintenance attachments)

**Alternatives Considered**:
- **Cloud Storage (S3, Cloudinary)**: More scalable but adds complexity and cost; local storage sufficient for MVP
- **Database Storage (BLOB)**: Not recommended for large files; filesystem storage is more efficient
- **Different Directory Structure**: Current structure provides best organization and isolation

**Implementation**:
```typescript
// Follow existing pattern from maintenance-attachment-service.ts
// Use multer.memoryStorage(), validate file, then save to disk
// Directory: uploads/portal/payments/<tenantId>/<declarationId>/
// File validation: 5MB max, images (JPEG, PNG, WebP) and PDFs only
```

**References**:
- Existing implementation: `packages/api/src/services/maintenance-attachment-service.ts`
- Multer middleware: `packages/api/src/middleware/upload-middleware.ts`
- File validation: `packages/api/src/utils/maintenance-validators.ts`

---

### 4. Dashboard Aggregation Logic

**Decision**: Calculate dashboard data by aggregating from existing rental management and maintenance modules (leases, installments, payments, deposits, tickets).

**Rationale**:
- **Reuse Existing Data**: No need to duplicate data - use existing rental and maintenance modules
- **Real-time Calculation**: Dashboard calculates current balance, next installment, recent payments from live data
- **Performance**: Use Prisma queries with proper includes and aggregations for efficient data fetching
- **Consistency**: Dashboard reflects current state of rental management system

**Calculation Logic**:
- **Current Balance**: Sum of DUE and OVERDUE installments minus allocated payments
- **Next Installment**: Earliest DUE installment (sorted by dueDate)
- **Recent Payments**: Last 5 payments (sorted by date DESC)
- **Deposit Info**: From RentalSecurityDeposit with current held amount and movements
- **Maintenance Summary**: Count tickets by status (open, inProgress, resolved)

**Alternatives Considered**:
- **Cached Dashboard Data**: Could cache dashboard data, but real-time calculation ensures accuracy
- **Separate Dashboard Table**: Would duplicate data and create synchronization issues

**Implementation**:
```typescript
// Service methods aggregate from existing models:
// - getDashboard(): Aggregate lease, installments, payments, deposit, tickets
// - Calculate balance: Sum DUE + OVERDUE installments - allocated payments
// - Find next installment: Earliest DUE installment
// - Get recent payments: Last 5 payments
// - Get deposit info: RentalSecurityDeposit with movements
// - Get maintenance summary: Count tickets by status
```

**References**:
- Existing rental services: `packages/api/src/services/rental-lease-service.ts`, `rental-installment-service.ts`, `rental-payment-service.ts`, `rental-deposit-service.ts`
- Existing maintenance service: `packages/api/src/services/maintenance-ticket-service.ts`

---

### 5. Maintenance Ticket Integration

**Decision**: Reuse existing maintenance module endpoints and services for tenant portal maintenance functionality.

**Rationale**:
- **No Duplication**: Maintenance module already handles ticket creation, status tracking, comments, attachments
- **Consistency**: Tenants use same ticket system as property managers, ensuring consistency
- **Access Control**: Existing maintenance module already validates tenant access (reportedBy = tenantClientId)
- **File Upload**: Existing maintenance attachment service handles photo uploads

**Integration Points**:
- **Ticket Creation**: Use existing `POST /api/tenants/:tenantId/maintenance/tickets` endpoint
- **Ticket List**: Use existing `GET /api/tenants/:tenantId/maintenance/tickets` endpoint with filters
- **Ticket Details**: Use existing `GET /api/tenants/:tenantId/maintenance/tickets/:id` endpoint
- **Add Comment**: Use existing `POST /api/tenants/:tenantId/maintenance/tickets/:id/comments` endpoint

**Alternatives Considered**:
- **Separate Tenant Portal Maintenance Endpoints**: Would duplicate functionality and create maintenance burden
- **New Maintenance Service Methods**: Unnecessary - existing methods already support tenant access

**Implementation**:
```typescript
// Tenant portal service delegates to existing maintenance service:
// - createMaintenanceTicket(): Call maintenance-ticket-service.createTicket()
// - getMaintenanceTickets(): Call maintenance-ticket-service.getTickets() with reportedBy filter
// - addTicketComment(): Call maintenance-comment-service.addComment()
```

**References**:
- Existing maintenance service: `packages/api/src/services/maintenance-ticket-service.ts`
- Existing maintenance routes: `packages/api/src/routes/maintenance-routes.ts`
- Existing maintenance controller: `packages/api/src/controllers/maintenance-ticket-controller.ts`

---

### 6. Document Access Integration

**Decision**: Use existing rental document service with access validation to ensure tenants can only access documents for their active lease.

**Rationale**:
- **Reuse Existing Service**: Rental document service already handles document retrieval and download
- **Access Validation**: Service validates document belongs to tenant's lease before allowing access
- **File Serving**: Existing static file serving handles document downloads
- **Document Types**: Existing RentalDocumentType enum covers all needed document types

**Integration Points**:
- **Document List**: Query RentalDocument where leaseId = tenant's active lease.id
- **Document Download**: Use existing document download endpoint with access validation
- **Document Grouping**: Group documents by RentalDocumentType for UI display

**Alternatives Considered**:
- **New Document Service Methods**: Unnecessary - existing methods already support lease-based access
- **Separate Document Storage**: Would duplicate document storage and create synchronization issues

**Implementation**:
```typescript
// Tenant portal service uses existing rental document service:
// - getDocuments(): Query RentalDocument where leaseId = lease.id, group by type
// - downloadDocument(): Use existing rental-document-service with access validation
```

**References**:
- Existing document service: `packages/api/src/services/rental-document-service.ts`
- Existing document routes: `packages/api/src/routes/document-routes.ts`
- Document model: `packages/api/prisma/schema.prisma` (RentalDocument)

---

### 7. Notification Service Integration

**Decision**: Use existing email notification service to notify property managers when payment declarations and maintenance tickets are created.

**Rationale**:
- **Reuse Existing Service**: Email service already configured and used in maintenance module
- **Consistency**: Same notification pattern as maintenance ticket notifications
- **Property Manager Notification**: Notify property managers (not tenants) for review/action items

**Notification Triggers**:
- **Payment Declaration Created**: Notify property managers when tenant declares payment (for review)
- **Maintenance Ticket Created**: Use existing maintenance notification (already implemented)

**Alternatives Considered**:
- **In-App Notifications**: Could add in-app notifications, but email is sufficient for MVP
- **SMS Notifications**: Adds complexity and cost; email is sufficient

**Implementation**:
```typescript
// Use existing email-service for notifications:
// - Payment declaration: email-service.sendPaymentDeclarationNotification()
// - Maintenance ticket: Existing maintenance-notification-service (already implemented)
```

**References**:
- Existing email service: `packages/api/src/services/email-service.ts`
- Existing maintenance notifications: `packages/api/src/services/maintenance-notification-service.ts`

---

## Summary

All technical decisions align with existing project patterns and infrastructure:
- ✅ Tenant portal access middleware follows existing authentication/authorization patterns
- ✅ Payment declaration model follows existing Prisma model patterns
- ✅ File upload follows existing Multer patterns from maintenance module
- ✅ Dashboard aggregation reuses existing rental and maintenance services
- ✅ Maintenance ticket integration reuses existing maintenance module
- ✅ Document access reuses existing rental document service
- ✅ Notifications use existing email service

No new infrastructure or technology choices required - all decisions leverage existing patterns and services.
