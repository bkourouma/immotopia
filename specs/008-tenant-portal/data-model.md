# Data Model: Tenant Portal Module

**Feature**: 008-tenant-portal  
**Date**: 2025-01-27  
**Purpose**: Document data model changes for tenant portal module

---

## New Entities

### RentalPaymentDeclaration

Represents a tenant's self-reported payment made outside the portal system. Payment declarations require property manager review before being converted to actual payments.

**Table**: `rental_payment_declarations`

**Fields**:
- `id` (UUID, PK): Unique identifier
- `tenant_id` (UUID, FK → tenants.id): Tenant organization (inherited from lease)
- `lease_id` (UUID, FK → rental_leases.id): Lease associated with payment
- `installment_id` (UUID?, FK → rental_installments.id): Optional installment linkage
- `declared_by` (UUID, FK → tenant_clients.id): Tenant client who declared the payment
- `amount` (Decimal(12,2)): Declared payment amount
- `payment_date` (DateTime): Date when payment was made
- `payment_method` (RentalPaymentMethod): Payment method used (CASH, BANK_TRANSFER, MOBILE_MONEY, etc.)
- `mobile_operator` (MobileMoneyOperator?): Mobile money operator (if method is MOBILE_MONEY)
- `reference` (String?): Payment reference number (transaction ID, check number, etc.)
- `proof_file_url` (String?): URL to uploaded proof file (receipt, screenshot, etc.)
- `status` (PaymentDeclarationStatus): Declaration status (default: PENDING)
- `reviewed_by` (UUID?, FK → users.id): User who reviewed the declaration
- `reviewed_at` (DateTime?): Timestamp when declaration was reviewed
- `review_notes` (Text?): Notes from property manager review
- `notes` (Text?): Additional notes from tenant
- `created_at` (DateTime): Creation timestamp (default: now())
- `updated_at` (DateTime): Last update timestamp

**Relationships**:
- `tenant` → Tenant (belongs to, via lease)
- `lease` → RentalLease (belongs to, onDelete: Cascade)
- `installment` → RentalInstallment? (optional, belongs to)
- `declarer` → TenantClient (belongs to, who declared the payment)
- `reviewer` → User? (optional, belongs to, who reviewed)

**Indexes**:
- `lease_id` (for filtering declarations by lease)
- `declared_by` (for filtering declarations by tenant)
- `status` (for filtering by review status)
- `tenant_id` (for tenant isolation)
- `installment_id` (for filtering by installment)

**Validation Rules**:
- `amount` must be positive (> 0)
- `payment_date` cannot be in the future
- `payment_method` must be valid RentalPaymentMethod enum value
- `mobile_operator` required if `payment_method` is MOBILE_MONEY
- `reference` recommended but optional
- `proof_file_url` optional but recommended for verification

**Business Rules**:
- Status workflow: PENDING → APPROVED/REJECTED/CANCELED
- Only tenants with active leases can create declarations
- Declarations can be linked to specific installments or left unlinked
- Property managers review and approve/reject declarations
- Approved declarations can be converted to actual RentalPayment records (out of scope for this feature)
- Cancelled declarations are typically tenant-initiated cancellations

**State Transitions**:
```
PENDING → APPROVED (by property manager)
PENDING → REJECTED (by property manager)
PENDING → CANCELED (by tenant or property manager)
```

---

## Enums

### PaymentDeclarationStatus

Enumeration for payment declaration review status.

**Values**:
- `PENDING`: Declaration is pending property manager review (default)
- `APPROVED`: Declaration has been approved by property manager
- `REJECTED`: Declaration has been rejected by property manager
- `CANCELED`: Declaration has been canceled (by tenant or property manager)

---

## Extended Entities

### TenantClient

Extended to track tenant portal usage.

**New Fields** (to be added):
- `tenant_portal_enabled` (Boolean, default: false): Whether tenant has portal access enabled
- `tenant_portal_last_access` (DateTime?): Last time tenant accessed the portal

**New Relationships**:
- `paymentDeclarations` → RentalPaymentDeclaration[] (has many declarations)

**Note**: These fields are optional and can be added in a future migration if needed for analytics/tracking.

---

## Relationships Diagram

```
Tenant
  └── RentalLease (ACTIVE)
       ├── RentalInstallment[]
       │    └── RentalPaymentAllocation[]
       ├── RentalPayment[] (actual payments)
       ├── RentalPaymentDeclaration[] (tenant-declared payments)
       │    ├── declared_by → TenantClient
       │    ├── lease → RentalLease
       │    └── installment? → RentalInstallment (optional)
       ├── RentalSecurityDeposit
       │    └── RentalDepositMovement[]
       ├── RentalDocument[]
       └── MaintenanceTicket[]
            └── MaintenanceTicketAttachment[]
```

---

## Data Access Patterns

### Tenant Portal Access

Tenants can only access data for their active lease:
- **Lease**: Where `primaryRenterId = tenantClient.id` OR `tenantClient.id` in `RentalLeaseCoRenter.renterClientId`
- **Installments**: Where `leaseId = activeLease.id`
- **Payments**: Where `leaseId = activeLease.id` OR `renterClientId = tenantClient.id`
- **Payment Declarations**: Where `declaredBy = tenantClient.id` AND `leaseId = activeLease.id`
- **Deposit**: Where `leaseId = activeLease.id`
- **Documents**: Where `leaseId = activeLease.id`
- **Maintenance Tickets**: Where `reportedBy = tenantClient.id` AND `leaseId = activeLease.id`

### Dashboard Aggregation

Dashboard data is calculated from existing entities:
- **Current Balance**: Sum of `RentalInstallment.amount` where `status IN (DUE, OVERDUE)` minus sum of `RentalPaymentAllocation.amount` where `payment.status = SUCCESS`
- **Next Installment**: Earliest `RentalInstallment` where `status = DUE` (sorted by `dueDate ASC`)
- **Recent Payments**: Last 5 `RentalPayment` records where `leaseId = activeLease.id` AND `status = SUCCESS` (sorted by `succeededAt DESC`)
- **Deposit Info**: `RentalSecurityDeposit` where `leaseId = activeLease.id` with `RentalDepositMovement[]`
- **Maintenance Summary**: Count `MaintenanceTicket` records by `status` where `reportedBy = tenantClient.id` AND `leaseId = activeLease.id`

---

## Migration Strategy

### Step 1: Add PaymentDeclarationStatus Enum

```prisma
enum PaymentDeclarationStatus {
  PENDING
  APPROVED
  REJECTED
  CANCELED
}
```

### Step 2: Create RentalPaymentDeclaration Model

```prisma
model RentalPaymentDeclaration {
  id              String   @id @default(uuid()) @db.Uuid
  tenant_id       String   // Inherited from lease
  lease_id        String   @db.Uuid
  installment_id  String?  @db.Uuid
  declared_by     String   // TenantClient.id
  amount          Decimal  @db.Decimal(12, 2)
  payment_date    DateTime @map("payment_date")
  payment_method  RentalPaymentMethod @map("payment_method")
  mobile_operator MobileMoneyOperator? @map("mobile_operator")
  reference       String?
  proof_file_url  String?  @map("proof_file_url")
  status          PaymentDeclarationStatus @default(PENDING)
  reviewed_by     String?  @map("reviewed_by")
  reviewed_at     DateTime? @map("reviewed_at")
  review_notes    String?  @map("review_notes") @db.Text
  notes           String?  @db.Text
  created_at      DateTime @default(now()) @map("created_at")
  updated_at      DateTime @updatedAt @map("updated_at")
  
  // Relations
  lease           RentalLease           @relation("RentalPaymentDeclarationLease", fields: [lease_id], references: [id], onDelete: Cascade)
  installment     RentalInstallment?    @relation("RentalPaymentDeclarationInstallment", fields: [installment_id], references: [id])
  declarer        TenantClient          @relation("RentalPaymentDeclarationDeclarer", fields: [declared_by], references: [id])
  reviewer        User?                 @relation("RentalPaymentDeclarationReviewer", fields: [reviewed_by], references: [id])
  
  @@index([tenant_id])
  @@index([lease_id])
  @@index([declared_by])
  @@index([status])
  @@index([installment_id])
  @@map("rental_payment_declarations")
}
```

### Step 3: Add Relations to Existing Models

**RentalLease**:
```prisma
model RentalLease {
  // ... existing fields
  paymentDeclarations RentalPaymentDeclaration[] @relation("RentalPaymentDeclarationLease")
}
```

**RentalInstallment**:
```prisma
model RentalInstallment {
  // ... existing fields
  paymentDeclarations RentalPaymentDeclaration[] @relation("RentalPaymentDeclarationInstallment")
}
```

**TenantClient**:
```prisma
model TenantClient {
  // ... existing fields
  paymentDeclarations RentalPaymentDeclaration[] @relation("RentalPaymentDeclarationDeclarer")
  // Optional: tenant_portal_enabled Boolean @default(false)
  // Optional: tenant_portal_last_access DateTime?
}
```

**User**:
```prisma
model User {
  // ... existing fields
  reviewedPaymentDeclarations RentalPaymentDeclaration[] @relation("RentalPaymentDeclarationReviewer")
}
```

### Step 4: Run Migration

```bash
npx prisma migrate dev --name add_payment_declarations
```

---

## Validation Rules Summary

### Payment Declaration Creation

- `amount` > 0
- `payment_date` <= today (cannot be future date)
- `payment_method` is valid enum value
- `mobile_operator` required if `payment_method = MOBILE_MONEY`
- `lease_id` must reference active lease where tenant is primary renter or co-renter
- `installment_id` (if provided) must belong to the same lease
- `proof_file_url` (if provided) must be valid file URL from uploads directory

### File Upload Validation

- File size: Maximum 5MB per file
- File types: Images (JPEG, PNG, WebP) or PDFs only
- File storage: `uploads/portal/payments/<tenantId>/<declarationId>/`
- Filename sanitization: Prevent path traversal attacks

---

## Indexes for Performance

### Query Patterns

1. **Get declarations by tenant**: `WHERE declared_by = ? AND status = ?`
   - Index: `declared_by`, `status`

2. **Get declarations by lease**: `WHERE lease_id = ? AND status = ?`
   - Index: `lease_id`, `status`

3. **Get pending declarations for review**: `WHERE status = 'PENDING' ORDER BY created_at DESC`
   - Index: `status`, `created_at`

4. **Get declarations by installment**: `WHERE installment_id = ?`
   - Index: `installment_id`

5. **Tenant isolation**: `WHERE tenant_id = ?` (always required)
   - Index: `tenant_id` (on all queries)

---

## Notes

- Payment declarations are separate from actual payments to maintain clear audit trail
- Property managers review declarations through separate admin interface (out of scope)
- Approved declarations can be converted to RentalPayment records in future feature
- File uploads follow existing patterns from maintenance module
- All queries enforce tenant isolation via `tenant_id` filter
