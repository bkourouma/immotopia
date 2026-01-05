# Data Model: Rental Management Module

**Feature**: 006-rental-management  
**Date**: 2025-01-27  
**Status**: Complete

## Overview

This document defines the data model for the Rental Management Module, including all Prisma models, enums, relationships, validation rules, and database constraints. The model follows existing codebase patterns with snake_case table names, UUID primary keys, tenant isolation, and audit fields.

## Enums

### RentalLeaseStatus
```prisma
enum RentalLeaseStatus {
  DRAFT      // Lease created but not yet active
  ACTIVE     // Lease is active and generating installments
  SUSPENDED  // Lease temporarily suspended
  ENDED      // Lease has ended (normal termination)
  CANCELED   // Lease was canceled before activation
}
```

### RentalBillingFrequency
```prisma
enum RentalBillingFrequency {
  MONTHLY      // Monthly installments
  QUARTERLY    // Quarterly installments (every 3 months)
  SEMIANNUAL   // Semiannual installments (every 6 months)
  ANNUAL       // Annual installments (once per year)
}
```

### RentalInstallmentStatus
```prisma
enum RentalInstallmentStatus {
  DRAFT     // Installment created but not yet due
  DUE       // Installment is due (due_date has arrived)
  PARTIAL   // Installment partially paid
  PAID      // Installment fully paid
  OVERDUE   // Installment past due date with incomplete payment
  CANCELED  // Installment canceled
}
```

### RentalChargeType
```prisma
enum RentalChargeType {
  RENT          // Base rent amount
  SERVICE_CHARGE // Service charges
  UTILITY       // Utility fees
  MAINTENANCE   // Maintenance fees
  DOSSIER_FEE   // Dossier/application fee
  OTHER         // Other charges
}
```

### RentalPaymentMethod
```prisma
enum RentalPaymentMethod {
  CASH           // Cash payment
  BANK_TRANSFER  // Bank transfer
  CHECK          // Check payment
  MOBILE_MONEY   // Mobile money payment
  CARD           // Card payment
  OTHER          // Other payment method
}
```

### RentalPaymentStatus
```prisma
enum RentalPaymentStatus {
  PENDING            // Payment initiated but not confirmed
  SUCCESS            // Payment successful
  FAILED             // Payment failed
  CANCELED           // Payment canceled
  REFUNDED           // Payment fully refunded
  PARTIALLY_REFUNDED // Payment partially refunded
}
```

### MobileMoneyOperator
```prisma
enum MobileMoneyOperator {
  ORANGE  // Orange Money
  MTN     // MTN Mobile Money
  MOOV    // Moov Money
  WAVE    // Wave
  OTHER   // Other mobile money operator
}
```

### RentalPenaltyMode
```prisma
enum RentalPenaltyMode {
  FIXED_AMOUNT        // Fixed penalty amount
  PERCENT_OF_RENT     // Percentage of rent amount
  PERCENT_OF_BALANCE  // Percentage of outstanding balance
}
```

### RentalDepositMovementType
```prisma
enum RentalDepositMovementType {
  COLLECT     // Deposit collection
  HOLD        // Deposit held (e.g., for damages)
  RELEASE     // Deposit released (ready for refund)
  REFUND      // Deposit refunded
  FORFEIT     // Deposit forfeited
  ADJUSTMENT  // Deposit adjustment
}
```

### RentalDocumentType
```prisma
enum RentalDocumentType {
  LEASE_CONTRACT  // Lease contract document
  LEASE_ADDENDUM  // Lease addendum/amendment
  RENT_RECEIPT    // Rent payment receipt
  RENT_QUITTANCE  // Rent quittance (proof of payment)
  DEPOSIT_RECEIPT // Security deposit receipt
  STATEMENT       // Account statement
  OTHER           // Other document type
}
```

### RentalDocumentStatus
```prisma
enum RentalDocumentStatus {
  DRAFT  // Document in draft
  FINAL  // Document finalized
  VOID   // Document voided
}
```

## Core Models

### RentalLease

Represents a rental contract (bail) between a property owner and renter(s).

**Table**: `rental_leases`

**Fields**:
- `id` (UUID, PK): Unique identifier
- `tenant_id` (UUID, FK → tenants.id): Tenant organization
- `property_id` (UUID, FK → properties.id): Property being leased
- `primary_renter_client_id` (UUID, FK → tenant_clients.id): Primary renter
- `owner_client_id` (UUID?, FK → tenant_clients.id): Property owner (optional)
- `crm_deal_id` (UUID?, FK → crm_deals.id): Optional CRM deal linkage
- `lease_number` (String, Unique): Unique lease number per tenant
- `status` (RentalLeaseStatus): Lease status (default: DRAFT)
- `start_date` (DateTime): Lease start date
- `end_date` (DateTime?): Lease end date (optional)
- `move_in_date` (DateTime?): Actual move-in date
- `move_out_date` (DateTime?): Actual move-out date
- `billing_frequency` (RentalBillingFrequency): Billing frequency (default: MONTHLY)
- `due_day_of_month` (Int): Day of month when installments are due (default: 5)
- `currency` (String): Currency code (default: "FCFA")
- `rent_amount` (Decimal(12,2)): Base rent amount
- `service_charge_amount` (Decimal(12,2)): Service charge amount (default: 0)
- `security_deposit_amount` (Decimal(12,2)): Security deposit target amount (default: 0)
- `penalty_grace_days` (Int): Grace period before penalties (default: 0)
- `penalty_mode` (RentalPenaltyMode): Penalty calculation mode (default: PERCENT_OF_BALANCE)
- `penalty_rate` (Decimal(12,4)): Penalty rate (e.g., 0.02 = 2%)
- `penalty_fixed_amount` (Decimal(12,2)): Fixed penalty amount (if mode is FIXED_AMOUNT)
- `penalty_cap_amount` (Decimal(12,2)?): Maximum penalty amount (optional)
- `notes` (Text?): Additional notes
- `terms_json` (Json?): Flexible terms storage
- `created_by_user_id` (UUID, FK → users.id): User who created the lease
- `created_at` (DateTime): Creation timestamp
- `updated_at` (DateTime): Last update timestamp

**Relationships**:
- `tenant` → Tenant (belongs to)
- `property` → Property (belongs to)
- `primaryRenter` → TenantClient (belongs to, relation: "RentalLeasePrimaryRenter")
- `ownerClient` → TenantClient? (optional, relation: "RentalLeaseOwner")
- `createdBy` → User (belongs to)
- `coRenters` → RentalLeaseCoRenter[] (has many)
- `installments` → RentalInstallment[] (has many)
- `deposit` → RentalSecurityDeposit? (has one)
- `documents` → RentalDocument[] (has many)

**Indexes**:
- `tenant_id`
- `tenant_id, status` (composite)
- `tenant_id, property_id` (composite)
- `tenant_id, primary_renter_client_id` (composite)
- `crm_deal_id`
- `start_date`
- `end_date`

**Validation Rules**:
- `lease_number` must be unique within tenant
- `start_date` must not be in the past (or allow with warning)
- `end_date` must be after `start_date` if provided
- `rent_amount` must be positive
- `due_day_of_month` must be between 1 and 28 (to avoid month-end issues)

**Business Rules**:
- New leases default to DRAFT status
- Only ACTIVE leases can generate installments
- Lease status transitions: DRAFT → ACTIVE → SUSPENDED/ENDED/CANCELED
- When lease becomes ACTIVE, move_in_date can be set
- When lease ends, move_out_date can be recorded

---

### RentalLeaseCoRenter

Represents additional renters (co-titulaires) on a lease.

**Table**: `rental_lease_co_renters`

**Fields**:
- `id` (UUID, PK): Unique identifier
- `tenant_id` (UUID, FK → tenants.id): Tenant organization
- `lease_id` (UUID, FK → rental_leases.id): Lease
- `renter_client_id` (UUID, FK → tenant_clients.id): Co-renter client
- `created_at` (DateTime): Creation timestamp

**Relationships**:
- `tenant` → Tenant (belongs to)
- `lease` → RentalLease (belongs to, onDelete: Cascade)
- `renterClient` → TenantClient (belongs to)

**Constraints**:
- Unique: `lease_id, renter_client_id` (prevent duplicate co-renters)

**Indexes**:
- `tenant_id`
- `lease_id`
- `renter_client_id`

---

### RentalInstallment

Represents a scheduled payment period (échéance) for a lease.

**Table**: `rental_installments`

**Fields**:
- `id` (UUID, PK): Unique identifier
- `tenant_id` (UUID, FK → tenants.id): Tenant organization
- `lease_id` (UUID, FK → rental_leases.id): Lease
- `period_year` (Int): Billing period year
- `period_month` (Int): Billing period month (1-12)
- `due_date` (DateTime): Installment due date
- `status` (RentalInstallmentStatus): Installment status (default: DRAFT)
- `currency` (String): Currency code (default: "FCFA")
- `amount_rent` (Decimal(12,2)): Rent amount for this period
- `amount_service` (Decimal(12,2)): Service charge amount (default: 0)
- `amount_other_fees` (Decimal(12,2)): Other fees amount (default: 0)
- `penalty_amount` (Decimal(12,2)): Calculated penalty amount (default: 0)
- `amount_paid` (Decimal(12,2)): Total amount paid (default: 0)
- `paid_at` (DateTime?): Timestamp when fully paid
- `invoice_id` (UUID?, FK → invoices.id): Optional invoice linkage
- `created_at` (DateTime): Creation timestamp
- `updated_at` (DateTime): Last update timestamp

**Relationships**:
- `tenant` → Tenant (belongs to)
- `lease` → RentalLease (belongs to, onDelete: Cascade)
- `invoice` → Invoice? (optional, belongs to)
- `items` → RentalInstallmentItem[] (has many)
- `payments` → RentalPaymentAllocation[] (has many)
- `penalties` → RentalPenalty[] (has many)

**Constraints**:
- Unique: `lease_id, period_year, period_month` (prevent duplicate installments)

**Indexes**:
- `tenant_id`
- `tenant_id, status` (composite)
- `tenant_id, due_date` (composite)
- `lease_id`
- `invoice_id`

**Validation Rules**:
- `period_month` must be between 1 and 12
- `due_date` must be set based on lease billing frequency
- `amount_paid` cannot exceed total due amount (unless overpayment allowed)

**Business Rules**:
- Status transitions: DRAFT → DUE → PARTIAL → PAID (or OVERDUE if past due)
- When `amount_paid` equals total due, status becomes PAID and `paid_at` is set
- When due_date passes and payment incomplete, status becomes OVERDUE
- Penalties calculated daily for OVERDUE installments

---

### RentalInstallmentItem

Represents a line item within an installment (detailed charge breakdown).

**Table**: `rental_installment_items`

**Fields**:
- `id` (UUID, PK): Unique identifier
- `tenant_id` (UUID, FK → tenants.id): Tenant organization
- `installment_id` (UUID, FK → rental_installments.id): Installment
- `charge_type` (RentalChargeType): Type of charge
- `label` (String): Charge description
- `amount` (Decimal(12,2)): Charge amount
- `currency` (String): Currency code (default: "FCFA")
- `metadata` (Json?): Additional metadata
- `created_at` (DateTime): Creation timestamp

**Relationships**:
- `tenant` → Tenant (belongs to)
- `installment` → RentalInstallment (belongs to, onDelete: Cascade)

**Indexes**:
- `tenant_id`
- `installment_id`
- `charge_type`

---

### RentalPayment

Represents a payment transaction from renter to property manager.

**Table**: `rental_payments`

**Fields**:
- `id` (UUID, PK): Unique identifier
- `tenant_id` (UUID, FK → tenants.id): Tenant organization
- `lease_id` (UUID?, FK → rental_leases.id): Optional lease linkage
- `renter_client_id` (UUID?, FK → tenant_clients.id): Optional renter linkage
- `invoice_id` (UUID?, FK → invoices.id): Optional invoice linkage
- `method` (RentalPaymentMethod): Payment method
- `status` (RentalPaymentStatus): Payment status (default: PENDING)
- `currency` (String): Currency code (default: "FCFA")
- `amount` (Decimal(12,2)): Payment amount
- `mm_operator` (MobileMoneyOperator?): Mobile money operator (if method is MOBILE_MONEY)
- `mm_phone` (String?): Mobile money phone number
- `idempotency_key` (String, Unique): Idempotency key for duplicate prevention
- `psp_name` (String?): Payment service provider name
- `psp_transaction_id` (String?, Unique): PSP transaction ID
- `psp_reference` (String?): PSP reference number
- `initiated_at` (DateTime): Payment initiation timestamp (default: now())
- `succeeded_at` (DateTime?): Payment success timestamp
- `failed_at` (DateTime?): Payment failure timestamp
- `canceled_at` (DateTime?): Payment cancellation timestamp
- `raw_event_payload` (Json?): Raw PSP webhook payload
- `created_by_user_id` (UUID?, FK → users.id): User who created payment (null if webhook)
- `created_at` (DateTime): Creation timestamp
- `updated_at` (DateTime): Last update timestamp

**Relationships**:
- `tenant` → Tenant (belongs to)
- `lease` → RentalLease? (optional, belongs to)
- `renterClient` → TenantClient? (optional, belongs to)
- `invoice` → Invoice? (optional, belongs to)
- `createdBy` → User? (optional, belongs to)
- `allocations` → RentalPaymentAllocation[] (has many)
- `refunds` → RentalRefund[] (has many)

**Indexes**:
- `tenant_id`
- `tenant_id, status` (composite)
- `tenant_id, method` (composite)
- `lease_id`
- `invoice_id`
- `renter_client_id`
- `initiated_at`

**Validation Rules**:
- `amount` must be positive
- `currency` must match lease currency if lease_id provided
- `idempotency_key` must be unique (prevents duplicate payments)
- `psp_transaction_id` must be unique if provided

**Business Rules**:
- Payment status transitions: PENDING → SUCCESS/FAILED/CANCELED
- When payment fails/cancels, allocations are reversed
- Idempotency key ensures webhook idempotency

---

### RentalPaymentAllocation

Represents the allocation of a payment amount to a specific installment.

**Table**: `rental_payment_allocations`

**Fields**:
- `id` (UUID, PK): Unique identifier
- `tenant_id` (UUID, FK → tenants.id): Tenant organization
- `payment_id` (UUID, FK → rental_payments.id): Payment
- `installment_id` (UUID, FK → rental_installments.id): Installment
- `amount` (Decimal(12,2)): Allocated amount
- `currency` (String): Currency code (default: "FCFA")
- `created_at` (DateTime): Creation timestamp

**Relationships**:
- `tenant` → Tenant (belongs to)
- `payment` → RentalPayment (belongs to, onDelete: Cascade)
- `installment` → RentalInstallment (belongs to, onDelete: Cascade)

**Constraints**:
- Unique: `payment_id, installment_id` (prevent duplicate allocations)

**Indexes**:
- `tenant_id`
- `payment_id`
- `installment_id`

**Validation Rules**:
- `amount` must be positive
- Sum of allocations for a payment cannot exceed payment amount
- Allocation amount cannot exceed installment remaining due

**Business Rules**:
- Allocation priority: oldest overdue first, then earliest due date
- When allocation created, installment `amount_paid` increases
- When allocation deleted, installment `amount_paid` decreases

---

### RentalRefund

Represents a refund of a payment.

**Table**: `rental_refunds`

**Fields**:
- `id` (UUID, PK): Unique identifier
- `tenant_id` (UUID, FK → tenants.id): Tenant organization
- `payment_id` (UUID, FK → rental_payments.id): Original payment
- `status` (RentalPaymentStatus): Refund status (default: PENDING)
- `currency` (String): Currency code (default: "FCFA")
- `amount` (Decimal(12,2)): Refund amount
- `psp_refund_id` (String?, Unique): PSP refund transaction ID
- `raw_event_payload` (Json?): Raw PSP webhook payload
- `created_by_user_id` (UUID?, FK → users.id): User who initiated refund
- `created_at` (DateTime): Creation timestamp
- `updated_at` (DateTime): Last update timestamp

**Relationships**:
- `tenant` → Tenant (belongs to)
- `payment` → RentalPayment (belongs to, onDelete: Cascade)
- `createdBy` → User? (optional, belongs to)

**Indexes**:
- `tenant_id`
- `payment_id`
- `tenant_id, status` (composite)

**Validation Rules**:
- `amount` cannot exceed original payment amount
- `psp_refund_id` must be unique if provided

---

### RentalPenaltyRule

Represents configurable penalty rules at tenant level.

**Table**: `rental_penalty_rules`

**Fields**:
- `id` (UUID, PK): Unique identifier
- `tenant_id` (UUID, FK → tenants.id): Tenant organization
- `is_active` (Boolean): Rule active status (default: true)
- `grace_days` (Int): Grace period before penalties (default: 0)
- `mode` (RentalPenaltyMode): Penalty calculation mode (default: PERCENT_OF_BALANCE)
- `fixed_amount` (Decimal(12,2)): Fixed penalty amount (if mode is FIXED_AMOUNT, default: 0)
- `rate` (Decimal(12,4)): Penalty rate (if mode is PERCENT_*, default: 0)
- `cap_amount` (Decimal(12,2)?): Maximum penalty amount (optional)
- `min_balance_to_apply` (Decimal(12,2)?): Minimum balance threshold (optional)
- `created_at` (DateTime): Creation timestamp
- `updated_at` (DateTime): Last update timestamp

**Relationships**:
- `tenant` → Tenant (belongs to)

**Indexes**:
- `tenant_id`
- `tenant_id, is_active` (composite)

**Business Rules**:
- Default penalty rules applied to new leases
- Leases can override penalty rules per lease

---

### RentalPenalty

Represents a calculated penalty applied to an overdue installment.

**Table**: `rental_penalties`

**Fields**:
- `id` (UUID, PK): Unique identifier
- `tenant_id` (UUID, FK → tenants.id): Tenant organization
- `installment_id` (UUID, FK → rental_installments.id): Installment
- `calculated_at` (DateTime): Penalty calculation timestamp (default: now())
- `days_late` (Int): Number of days overdue
- `mode` (RentalPenaltyMode): Calculation mode used
- `rate` (Decimal(12,4)?): Rate used (if mode is PERCENT_*)
- `fixed_amount` (Decimal(12,2)?): Fixed amount used (if mode is FIXED_AMOUNT)
- `amount` (Decimal(12,2)): Calculated penalty amount
- `currency` (String): Currency code (default: "FCFA")
- `is_manual_override` (Boolean): Manual adjustment flag (default: false)
- `override_reason` (Text?): Reason for manual override
- `created_by_user_id` (UUID?, FK → users.id): User who created/overrode penalty
- `created_at` (DateTime): Creation timestamp

**Relationships**:
- `tenant` → Tenant (belongs to)
- `installment` → RentalInstallment (belongs to, onDelete: Cascade)
- `createdBy` → User? (optional, belongs to)

**Indexes**:
- `tenant_id`
- `installment_id`
- `calculated_at`

**Validation Rules**:
- `amount` must be non-negative
- `days_late` must be positive
- If `is_manual_override` is true, `override_reason` should be provided

**Business Rules**:
- Penalties calculated daily for overdue installments
- Penalty amount cannot exceed cap if cap is set
- When installment is fully paid, penalty is considered resolved

---

### RentalSecurityDeposit

Represents a security deposit account for a lease.

**Table**: `rental_security_deposits`

**Fields**:
- `id` (UUID, PK): Unique identifier
- `tenant_id` (UUID, FK → tenants.id): Tenant organization
- `lease_id` (UUID, Unique, FK → rental_leases.id): Lease (one deposit per lease)
- `currency` (String): Currency code (default: "FCFA")
- `target_amount` (Decimal(12,2)): Target deposit amount (default: 0)
- `collected_amount` (Decimal(12,2)): Total collected amount (default: 0)
- `held_amount` (Decimal(12,2)): Amount currently held (default: 0)
- `refunded_amount` (Decimal(12,2)): Total refunded amount (default: 0)
- `forfeited_amount` (Decimal(12,2)): Total forfeited amount (default: 0)
- `created_at` (DateTime): Creation timestamp
- `updated_at` (DateTime): Last update timestamp

**Relationships**:
- `tenant` → Tenant (belongs to)
- `lease` → RentalLease (belongs to, onDelete: Cascade)
- `movements` → RentalDepositMovement[] (has many)

**Indexes**:
- `tenant_id`

**Validation Rules**:
- `target_amount` must be non-negative
- `collected_amount` cannot exceed `target_amount` (single payment requirement)
- Balance validation: `collected_amount` = `held_amount` + `refunded_amount` + `forfeited_amount`

**Business Rules**:
- Deposit must be collected in single payment equal to target amount
- Movements update aggregated amounts (collected, held, refunded, forfeited)

---

### RentalDepositMovement

Represents a movement (collection, hold, release, refund, forfeit, adjustment) on a security deposit.

**Table**: `rental_deposit_movements`

**Fields**:
- `id` (UUID, PK): Unique identifier
- `tenant_id` (UUID, FK → tenants.id): Tenant organization
- `deposit_id` (UUID, FK → rental_security_deposits.id): Security deposit
- `type` (RentalDepositMovementType): Movement type
- `currency` (String): Currency code (default: "FCFA")
- `amount` (Decimal(12,2)): Movement amount
- `payment_id` (UUID?, FK → rental_payments.id): Optional payment linkage
- `installment_id` (UUID?, FK → rental_installments.id): Optional installment linkage
- `note` (Text?): Movement note/description
- `metadata` (Json?): Additional metadata
- `created_by_user_id` (UUID?, FK → users.id): User who created movement
- `created_at` (DateTime): Creation timestamp

**Relationships**:
- `tenant` → Tenant (belongs to)
- `deposit` → RentalSecurityDeposit (belongs to, onDelete: Cascade)
- `payment` → RentalPayment? (optional, belongs to)
- `installment` → RentalInstallment? (optional, belongs to)
- `createdBy` → User? (optional, belongs to)

**Indexes**:
- `tenant_id`
- `deposit_id`
- `payment_id`
- `installment_id`
- `created_at`

**Validation Rules**:
- `amount` must be positive
- COLLECT movement: amount must equal deposit target_amount (single payment)
- REFUND movement: amount cannot exceed (collected_amount - forfeited_amount)
- FORFEIT movement: amount cannot exceed collected_amount

**Business Rules**:
- COLLECT: Updates `collected_amount`
- HOLD: Updates `held_amount`
- RELEASE: Decreases `held_amount`
- REFUND: Updates `refunded_amount`
- FORFEIT: Updates `forfeited_amount`
- ADJUSTMENT: Adjusts aggregated amounts

---

### RentalDocument

Represents a rental document (contract, receipt, quittance, statement).

**Table**: `rental_documents`

**Fields**:
- `id` (UUID, PK): Unique identifier
- `tenant_id` (UUID, FK → tenants.id): Tenant organization
- `type` (RentalDocumentType): Document type
- `status` (RentalDocumentStatus): Document status (default: DRAFT)
- `lease_id` (UUID?, FK → rental_leases.id): Optional lease linkage
- `installment_id` (UUID?, FK → rental_installments.id): Optional installment linkage
- `payment_id` (UUID?, FK → rental_payments.id): Optional payment linkage
- `document_number` (String, Unique): Unique document number (format: YYYY-NNN)
- `file_url` (String?): Document file URL
- `file_key` (String?): Document file storage key
- `mime_type` (String?): Document MIME type
- `content_hash` (String?): Document content hash for integrity
- `issued_at` (DateTime?): Document issue date
- `title` (String?): Document title
- `description` (Text?): Document description
- `metadata` (Json?): Additional metadata
- `created_by_user_id` (UUID, FK → users.id): User who created document
- `created_at` (DateTime): Creation timestamp
- `updated_at` (DateTime): Last update timestamp

**Relationships**:
- `tenant` → Tenant (belongs to)
- `lease` → RentalLease? (optional, belongs to)
- `installment` → RentalInstallment? (optional, belongs to)
- `payment` → RentalPayment? (optional, belongs to)
- `createdBy` → User (belongs to)

**Indexes**:
- `tenant_id`
- `tenant_id, type` (composite)
- `lease_id`
- `installment_id`
- `payment_id`
- `issued_at`

**Validation Rules**:
- `document_number` must be unique per tenant per year (format: YYYY-NNN)
- `document_number` format: YYYY-NNN where YYYY is year, NNN is 3-digit sequential number
- At least one of `lease_id`, `installment_id`, or `payment_id` must be provided
- If `status` is FINAL, `issued_at` should be set

**Business Rules**:
- Document number generated sequentially per tenant per year
- Status transitions: DRAFT → FINAL → VOID
- Voided documents remain in history for audit
- Document generation uses templates (implementation detail)

---

## Relationships Summary

### External Dependencies
- **Tenant**: All rental entities belong to a tenant (tenant isolation)
- **Property**: Leases link to properties (from Properties module)
- **TenantClient**: Leases link to renters/owners (from CRM module)
- **User**: All entities track `created_by_user_id` (from Auth module)
- **Invoice**: Optional linkage for installments and payments (from Invoice module)
- **CrmDeal**: Optional linkage for leases (from CRM module)

### Internal Relationships
- **RentalLease** → RentalLeaseCoRenter (1:N)
- **RentalLease** → RentalInstallment (1:N)
- **RentalLease** → RentalSecurityDeposit (1:1)
- **RentalLease** → RentalDocument (1:N)
- **RentalInstallment** → RentalInstallmentItem (1:N)
- **RentalInstallment** → RentalPaymentAllocation (1:N)
- **RentalInstallment** → RentalPenalty (1:N)
- **RentalPayment** → RentalPaymentAllocation (1:N)
- **RentalPayment** → RentalRefund (1:N)
- **RentalSecurityDeposit** → RentalDepositMovement (1:N)

---

## Database Constraints

### Unique Constraints
- `rental_leases`: `tenant_id, lease_number` (unique lease numbers per tenant)
- `rental_lease_co_renters`: `lease_id, renter_client_id` (no duplicate co-renters)
- `rental_installments`: `lease_id, period_year, period_month` (unique installments per period)
- `rental_payment_allocations`: `payment_id, installment_id` (no duplicate allocations)
- `rental_payments`: `idempotency_key` (unique, prevents duplicate payments)
- `rental_payments`: `psp_transaction_id` (unique if provided)
- `rental_refunds`: `psp_refund_id` (unique if provided)
- `rental_security_deposits`: `lease_id` (one deposit per lease)
- `rental_documents`: `document_number` (unique document numbers)

### Foreign Key Constraints
- All `tenant_id` fields reference `tenants.id` with cascade delete
- All `created_by_user_id` fields reference `users.id` (nullable where appropriate)
- `property_id` references `properties.id`
- `primary_renter_client_id`, `owner_client_id`, `renter_client_id` reference `tenant_clients.id`
- `lease_id` references `rental_leases.id` with cascade delete
- `installment_id` references `rental_installments.id` with cascade delete
- `payment_id` references `rental_payments.id` with cascade delete
- `deposit_id` references `rental_security_deposits.id` with cascade delete
- Optional `invoice_id` references `invoices.id`
- Optional `crm_deal_id` references `crm_deals.id`

---

## Migration Notes

1. **Add rental enums** to Prisma schema
2. **Create rental models** with all fields, relationships, indexes
3. **Add rental relationships** to existing models:
   - `Tenant`: Add `rentalLeases`, `rentalInstallments`, `rentalPayments`, `rentalPenaltyRules`, `rentalDocuments`
   - `Property`: Add `rentalLeases`
   - `TenantClient`: Add `primaryLeases`, `ownerLeases`, `coRenterLeases`
   - `User`: Add rental creation relationships
   - `Invoice`: Add `rentalInstallments`, `rentalPayments` (if Invoice module exists)
4. **Create indexes** for performance (tenant_id, status, dates, foreign keys)
5. **Add unique constraints** for business rules
6. **Set up cascade deletes** for dependent entities

---

## Data Integrity Rules

1. **Tenant Isolation**: All queries must filter by `tenant_id`
2. **Lease Number Uniqueness**: Enforced at database level
3. **Installment Period Uniqueness**: Enforced at database level
4. **Payment Idempotency**: Enforced via `idempotency_key` uniqueness
5. **Security Deposit Single Payment**: Validated in application logic (amount = target_amount)
6. **Document Number Uniqueness**: Enforced at database level, generated sequentially
7. **Currency Consistency**: Validated in application logic (payment currency = lease currency)
8. **Balance Calculations**: Aggregated amounts (collected, held, refunded, forfeited) must balance

---

## Performance Considerations

1. **Indexes**: All foreign keys and frequently queried fields are indexed
2. **Composite Indexes**: Tenant + status, tenant + date for common queries
3. **Cascade Deletes**: Efficient cleanup of dependent entities
4. **Pagination**: All list endpoints support pagination
5. **Query Optimization**: Use Prisma includes/select to minimize data transfer

---

## Audit Trail

All rental entities track:
- `created_by_user_id`: User who created the record
- `created_at`: Creation timestamp
- `updated_at`: Last update timestamp (auto-updated)

Additional audit logging via `AuditLog` model for:
- Lease status changes
- Payment status changes
- Penalty calculations
- Security deposit movements
- Document generation/voiding





