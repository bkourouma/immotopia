# Feature Specification: Rental Management Module

**Feature Branch**: `006-rental-management`  
**Created**: 2025-01-27  
**Status**: Draft  
**Input**: User description: "Rental Management Module (Module Gestion Locative) - Complete rental management system with leases, installments, payments (including mobile money), penalties, security deposits, and document management for multi-tenant real estate platform"

## Clarifications

### Session 2025-01-27

- Q: When should the system calculate penalties for overdue installments? → A: Automatic daily calculation with manual trigger option (default automatic, but property managers can manually recalculate)
- Q: When should installments be generated for a lease? → A: Manual trigger by property manager (property manager must explicitly request installment generation)
- Q: When a payment is allocated to multiple installments, what should be the default allocation priority? → A: Oldest overdue first, then earliest due date (prioritize overdue installments by age, then future installments by due date)
- Q: Can security deposits be collected in multiple partial payments, or must they be collected in a single payment? → A: Single payment only (deposit must be collected in one payment equal to target amount)
- Q: What format should document numbers follow? → A: Sequential with year prefix (e.g., 2025-001, 2025-002)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Lease Creation and Management (Priority: P1)

Property managers and real estate agents need to create and manage rental leases (bail) for properties. They can create leases with primary renters, co-renters, set lease terms (start/end dates, rent amounts, billing frequency), configure penalty rules, and track lease status (draft, active, suspended, ended, canceled).

**Why this priority**: This is the foundation of rental management. Without lease management, property managers cannot establish rental contracts, track tenant relationships, or manage rental terms. It provides immediate value by replacing manual lease tracking and enabling structured rental operations.

**Independent Test**: Can be fully tested by creating leases with primary renters, setting lease terms (dates, amounts, billing frequency), adding co-renters, updating lease status, and verifying tenant isolation. This delivers the value of centralized lease management within a multi-tenant system.

**Acceptance Scenarios**:

1. **Given** a property and a tenant client (renter) exist, **When** a property manager creates a new lease with lease number, start date, end date, rent amount, billing frequency (monthly/quarterly/semiannual/annual), and due day of month, **Then** the lease is created in DRAFT status, linked to the property and primary renter, and visible only within the tenant organization. If required fields (lease number, start date, rent amount) are missing, **Then** validation errors are displayed.
2. **Given** a lease exists in DRAFT status, **When** a property manager activates the lease, **Then** the lease status changes to ACTIVE, move-in date can be set, and the system can generate installments based on billing frequency.
3. **Given** a lease exists, **When** a property manager adds a co-renter (co-titulaire), **Then** the co-renter is linked to the lease, and both primary renter and co-renters are associated with the lease for payment and communication purposes.
4. **Given** multiple leases exist with different statuses, **When** a property manager filters leases by status (e.g., "ACTIVE"), **Then** only active leases are displayed.
5. **Given** an active lease, **When** the lease end date is reached or the property manager ends the lease, **Then** the lease status changes to ENDED, move-out date can be recorded, and security deposit processing can be initiated.

---

### User Story 2 - Installment Schedule Generation and Management (Priority: P1)

Property managers need automatic generation of payment installments (échéances) based on lease billing frequency. The system should create installments for each billing period, track due dates, calculate amounts (rent, service charges, other fees), and update installment status as payments are received.

**Why this priority**: Core revenue tracking functionality. Installments enable property managers to track expected payments, identify overdue amounts, and manage cash flow. Without this, property managers cannot systematically track rental income or identify payment issues.

**Independent Test**: Can be fully tested by generating installments for a lease, viewing installment schedules, updating installment amounts, tracking payment status, and filtering installments by due date/status. This delivers the value of automated payment scheduling and tracking.

**Acceptance Scenarios**:

1. **Given** an active lease with billing frequency MONTHLY and start date January 1st, **When** a property manager explicitly requests installment generation, **Then** monthly installments are created for each month (January, February, March, etc.) with due dates set to the lease's due day of month (e.g., 5th of each month), and each installment includes rent amount, service charge amount, and other fees.
2. **Given** installments exist for a lease, **When** a property manager views the installment schedule, **Then** they see all installments in chronological order with period (year/month), due date, status, amounts (rent, service, other fees, penalties), and paid amount.
3. **Given** an installment exists with status DUE, **When** a payment is allocated to the installment, **Then** the installment's paid amount increases, and if fully paid, the status changes to PAID and paid_at timestamp is recorded.
4. **Given** an installment's due date has passed without full payment, **When** the system checks overdue installments, **Then** the installment status changes to OVERDUE, and penalties can be calculated based on the lease's penalty rules.
5. **Given** a lease's rent amount or billing frequency changes, **When** a property manager updates the lease, **Then** future installments (not yet due) can be recalculated, but past or current installments remain unchanged.

---

### User Story 3 - Payment Processing and Allocation (Priority: P1)

Property managers and renters need to record payments (cash, bank transfer, check, mobile money, card) and allocate them to specific installments. The system should support mobile money payments with operator tracking (Orange, MTN, Moov, Wave), handle payment status (pending, success, failed, canceled, refunded), and provide idempotency for payment processing.

**Why this priority**: Essential for revenue collection and tracking. Without payment processing, property managers cannot record received payments, allocate payments to installments, or track payment methods. This is critical for financial management and tenant relationship tracking.

**Independent Test**: Can be fully tested by creating payments (various methods), allocating payments to installments, tracking payment status, handling mobile money payments with operator details, and verifying payment allocation accuracy. This delivers the value of comprehensive payment tracking and allocation.

**Acceptance Scenarios**:

1. **Given** installments exist for a lease, **When** a property manager records a payment (e.g., bank transfer) with amount, method, and date, **Then** the payment is created with status PENDING, linked to the lease and renter, and can be allocated to one or more installments.
2. **Given** a payment exists, **When** a property manager allocates the payment amount to specific installments, **Then** the system prioritizes allocation to oldest overdue installments first, then earliest due date installments, the payment is split across selected installments, each installment's paid amount increases, and the allocation is recorded with timestamps.
3. **Given** a mobile money payment is received (e.g., Orange Money), **When** the property manager records the payment with operator (Orange/MTN/Moov/Wave), phone number, and transaction reference, **Then** the payment is recorded with mobile money details, and the system can track payment source for reconciliation.
4. **Given** a payment is processed through a payment service provider (PSP), **When** a webhook or callback confirms payment success, **Then** the payment status updates to SUCCESS, succeeded_at timestamp is recorded, and PSP transaction ID and reference are stored for audit.
5. **Given** a payment fails or is canceled, **When** the payment status is updated to FAILED or CANCELED, **Then** any allocations to installments are reversed, installment paid amounts are adjusted, and the payment failure reason can be recorded.

---

### User Story 4 - Penalty Calculation and Management (Priority: P2)

Property managers need automatic calculation of late payment penalties based on configurable rules (fixed amount, percentage of rent, percentage of balance). The system should calculate penalties when installments become overdue, apply penalty caps, respect grace periods, and allow manual penalty adjustments.

**Why this priority**: Important for enforcing lease terms and recovering costs from late payments. While not foundational like leases and payments, penalty management significantly improves financial control and ensures consistent application of lease terms. It helps property managers maintain cash flow and tenant accountability.

**Independent Test**: Can be fully tested by configuring penalty rules, triggering penalty calculation for overdue installments, viewing calculated penalties, adjusting penalties manually, and verifying penalty application to installments. This delivers the value of automated penalty management and financial control.

**Acceptance Scenarios**:

1. **Given** a lease exists with penalty rules (e.g., 2% of balance per month, 5-day grace period), **When** an installment becomes overdue (due date + grace period passed) and the daily automatic penalty calculation job runs, **Then** the system calculates penalty based on the lease's penalty mode and rate, creates a penalty record linked to the installment, and updates the installment's penalty amount. Property managers can also manually trigger penalty calculation at any time.
2. **Given** penalty rules are configured at tenant level (default rules), **When** a lease is created, **Then** the lease inherits default penalty rules, but property managers can override penalty settings per lease (grace days, mode, rate, cap).
3. **Given** a penalty is calculated for an overdue installment, **When** a property manager views the penalty details, **Then** they see days late, calculation method (fixed/percentage), calculated amount, and can manually adjust the penalty with a reason if needed.
4. **Given** a penalty cap amount is set (e.g., maximum 10,000 FCFA), **When** the calculated penalty exceeds the cap, **Then** the penalty amount is limited to the cap amount, and the system records that the cap was applied.
5. **Given** a penalty exists, **When** the overdue installment is fully paid (including penalty), **Then** the penalty is considered resolved, and no further penalties are calculated for that installment period.

---

### User Story 5 - Security Deposit Management (Priority: P2)

Property managers need to track security deposits (dépôt de garantie) for leases, including collection, holding, release, refund, and forfeiture. The system should track deposit movements, link deposits to payments, and maintain deposit balances.

**Why this priority**: Important for financial protection and lease compliance. Security deposits protect property owners from damages and unpaid rent. While not foundational like leases and payments, deposit management ensures proper handling of tenant funds and compliance with rental regulations.

**Independent Test**: Can be fully tested by creating security deposits for leases, recording deposit collections, tracking deposit movements (hold, release, refund, forfeit), viewing deposit balances, and linking deposits to payments. This delivers the value of comprehensive deposit tracking and financial protection.

**Acceptance Scenarios**:

1. **Given** a lease exists with a security deposit amount specified, **When** a property manager creates a security deposit record, **Then** a deposit account is created for the lease with target amount, and the deposit status is initialized (collected amount = 0).
2. **Given** a security deposit exists, **When** a renter makes a payment designated as deposit collection equal to the target amount, **Then** a deposit movement of type COLLECT is recorded, the deposit's collected amount increases to match the target amount, and the movement is linked to the payment. The deposit must be collected in a single payment (partial payments are not allowed).
3. **Given** a security deposit has been collected, **When** a property manager holds a portion of the deposit (e.g., for damages), **Then** a movement of type HOLD is recorded, the held amount increases, and a note explains the hold reason.
4. **Given** a lease ends and security deposit is held, **When** a property manager releases the deposit (no damages, full refund), **Then** a movement of type RELEASE is recorded, followed by a REFUND movement, the refunded amount increases, and the deposit can be linked to a refund payment.
5. **Given** a lease ends with damages or unpaid rent, **When** a property manager forfeits a portion of the deposit, **Then** a movement of type FORFEIT is recorded with amount and reason, the forfeited amount increases, and the remaining deposit (if any) can be refunded.

---

### User Story 6 - Document Generation and Management (Priority: P2)

Property managers need to generate, store, and manage rental documents (lease contracts, rent receipts, quittances, deposit receipts, statements). Documents should be linked to leases, installments, or payments, have document numbers, and support versioning (draft, final, void).

**Why this priority**: Important for legal compliance and tenant communication. Documents provide proof of transactions, lease terms, and payment history. While not foundational, document management ensures proper record-keeping and enables professional tenant communication.

**Independent Test**: Can be fully tested by generating documents (lease contracts, receipts), storing document files, linking documents to leases/installments/payments, updating document status, and retrieving documents for viewing/downloading. This delivers the value of organized document management and legal compliance.

**Acceptance Scenarios**:

1. **Given** a lease exists in ACTIVE status, **When** a property manager generates a lease contract document, **Then** a document of type LEASE_CONTRACT is created with document number in format YYYY-NNN (e.g., 2025-001), linked to the lease, stored as a file, and marked as FINAL status with issued_at timestamp.
2. **Given** a payment is recorded and allocated to an installment, **When** a property manager generates a rent receipt, **Then** a document of type RENT_RECEIPT is created with document number in format YYYY-NNN (e.g., 2025-001), linked to the payment and installment, and includes payment details (amount, date, method).
3. **Given** an installment is fully paid, **When** a property manager generates a quittance (proof of payment), **Then** a document of type RENT_QUITTANCE is created with document number in format YYYY-NNN (e.g., 2025-001), linked to the installment, and certifies that the installment is paid in full.
4. **Given** documents exist for a lease, **When** a property manager views the lease's document list, **Then** they see all documents (contracts, receipts, quittances) in chronological order with type, status, issue date, and can download/view each document.
5. **Given** a document is generated with an error, **When** a property manager voids the document, **Then** the document status changes to VOID, a new corrected document can be generated, and the voided document remains in history for audit purposes.

---

### Edge Cases

- What happens when a lease's end date is before the start date? → System should reject the lease creation and display validation error.
- How does the system handle overlapping leases for the same property? → System should warn property managers if an active lease exists for the property, but allow multiple leases if previous lease is ENDED or CANCELED.
- What happens when a payment amount exceeds the total due amount for installments? → System should allow overpayment, allocate to current installments first, then apply excess to future installments or record as credit.
- How does the system handle partial payments across multiple installments? → System should allow allocation of a single payment to multiple installments, with each allocation tracked separately.
- What happens when penalty calculation results in negative amount? → System should prevent negative penalties and set penalty to zero.
- How does the system handle security deposit refund when deposit was never collected? → System should prevent refund movements if collected amount is zero, and display warning.
- What happens when a renter attempts to make a partial security deposit payment? → System should reject partial deposit payments and require the full target amount in a single payment.
- What happens when a document generation fails (storage error, template error)? → System should log the error, keep document in DRAFT status, and allow retry or manual document upload.
- How does the system handle lease status changes when installments are pending? → System should warn property managers when suspending or ending a lease with unpaid installments, but allow the status change.
- What happens when billing frequency changes mid-lease? → System should allow frequency change, but only affect future installments; past installments remain unchanged.
- How does the system handle currency mismatches between lease and payment? → System should validate currency consistency and reject payments with mismatched currency, or provide currency conversion if supported.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow property managers to create rental leases with lease number, primary renter, property, start/end dates, rent amount, billing frequency, and due day of month.
- **FR-002**: System MUST enforce unique lease numbers within each tenant organization.
- **FR-003**: System MUST support lease statuses: DRAFT, ACTIVE, SUSPENDED, ENDED, CANCELED.
- **FR-004**: System MUST allow property managers to add co-renters (co-titulaires) to leases.
- **FR-005**: System MUST allow property managers to manually trigger installment generation based on lease billing frequency (monthly, quarterly, semiannual, annual) and due day of month.
- **FR-006**: System MUST create installments for each billing period with period year/month, due date, rent amount, service charge amount, and other fees.
- **FR-007**: System MUST track installment status: DRAFT, DUE, PARTIAL, PAID, OVERDUE, CANCELED.
- **FR-008**: System MUST allow property managers to record payments with method (cash, bank transfer, check, mobile money, card, other), amount, currency, and date.
- **FR-009**: System MUST support mobile money payments with operator tracking (Orange, MTN, Moov, Wave, other) and phone number.
- **FR-010**: System MUST allow payment allocation to one or more installments, with amount tracking per allocation. When allocating to multiple installments, system MUST prioritize oldest overdue installments first, then earliest due date installments.
- **FR-011**: System MUST track payment status: PENDING, SUCCESS, FAILED, CANCELED, REFUNDED, PARTIALLY_REFUNDED.
- **FR-012**: System MUST provide payment idempotency through unique idempotency keys to prevent duplicate payment processing.
- **FR-013**: System MUST support payment service provider (PSP) integration with transaction ID and reference tracking.
- **FR-014**: System MUST automatically calculate penalties for overdue installments daily based on lease penalty rules (grace days, mode, rate, cap), and MUST allow property managers to manually trigger penalty calculation at any time.
- **FR-015**: System MUST support penalty calculation modes: FIXED_AMOUNT, PERCENT_OF_RENT, PERCENT_OF_BALANCE.
- **FR-016**: System MUST allow property managers to configure default penalty rules at tenant level and override per lease.
- **FR-017**: System MUST allow manual penalty adjustments with reason tracking.
- **FR-018**: System MUST track security deposits for leases with target amount, collected amount, held amount, refunded amount, and forfeited amount. Security deposits MUST be collected in a single payment equal to the target amount (partial payments are not allowed).
- **FR-019**: System MUST support security deposit movements: COLLECT, HOLD, RELEASE, REFUND, FORFEIT, ADJUSTMENT.
- **FR-020**: System MUST link security deposit movements to payments and installments when applicable.
- **FR-021**: System MUST allow property managers to generate and store rental documents: lease contracts, lease addendums, rent receipts, rent quittances, deposit receipts, statements.
- **FR-022**: System MUST assign unique document numbers to generated documents in format YYYY-NNN (e.g., 2025-001, 2025-002) where YYYY is the year and NNN is a sequential number per year per tenant.
- **FR-023**: System MUST support document statuses: DRAFT, FINAL, VOID.
- **FR-024**: System MUST link documents to leases, installments, or payments as applicable.
- **FR-025**: System MUST store document files with file URL, file key, mime type, and content hash for integrity verification.
- **FR-026**: System MUST enforce tenant isolation: all rental data (leases, installments, payments, deposits, documents) must be scoped to tenant and not accessible across tenants.
- **FR-027**: System MUST link leases to properties and tenant clients (renters) from existing property and CRM modules.
- **FR-028**: System MUST optionally link leases to CRM deals (deals of type LOCATION) for pipeline tracking.
- **FR-029**: System MUST optionally link installments to invoices from existing invoice module for billing integration.
- **FR-030**: System MUST track created_by_user_id and timestamps (created_at, updated_at) for all rental entities for audit purposes.
- **FR-031**: System MUST validate that lease start date is not in the past when creating new leases (or allow past dates with warning).
- **FR-032**: System MUST validate that payment amount is positive and currency matches lease currency.
- **FR-033**: System MUST prevent payment allocation that exceeds installment due amount (unless overpayment is allowed).
- **FR-034**: System MUST update installment status automatically when payment allocations change (DUE → PARTIAL → PAID).
- **FR-035**: System MUST mark installments as OVERDUE when due date passes and payment is incomplete.
- **FR-036**: System MUST prevent creating duplicate installments for the same lease and period (year/month combination must be unique per lease).

### Key Entities *(include if feature involves data)*

- **RentalLease (Lease/Bail)**: Represents a rental contract between a property owner and renter(s). Key attributes: lease number (unique), primary renter, property, start/end dates, move-in/out dates, billing frequency, due day of month, rent amount, service charge amount, security deposit amount, penalty rules, status, optional owner and CRM deal linkage. Relationships: belongs to tenant, property, primary renter, optional owner, created by user; has many co-renters, installments, security deposit, documents.

- **RentalLeaseCoRenter (Co-Renter)**: Represents additional renters (co-titulaires) on a lease. Key attributes: lease, renter client. Relationships: belongs to tenant, lease, renter client.

- **RentalInstallment (Installment/Échéance)**: Represents a scheduled payment period for a lease. Key attributes: lease, period year/month, due date, status, rent amount, service charge amount, other fees amount, penalty amount, paid amount, paid_at timestamp, optional invoice linkage. Relationships: belongs to tenant, lease, optional invoice; has many items, payment allocations, penalties.

- **RentalInstallmentItem (Installment Item)**: Represents a line item within an installment (detailed charge breakdown). Key attributes: installment, charge type (rent, service charge, utility, maintenance, dossier fee, other), label, amount. Relationships: belongs to tenant, installment.

- **RentalPayment (Payment)**: Represents a payment transaction from renter to property manager. Key attributes: lease, renter client, payment method, status, amount, currency, mobile money operator/phone (if applicable), idempotency key, PSP transaction ID/reference, timestamps (initiated, succeeded, failed, canceled), optional invoice linkage. Relationships: belongs to tenant, optional lease, renter client, invoice, created by user; has many allocations, refunds.

- **RentalPaymentAllocation (Payment Allocation)**: Represents the allocation of a payment amount to a specific installment. Key attributes: payment, installment, amount. Relationships: belongs to tenant, payment, installment.

- **RentalRefund (Refund)**: Represents a refund of a payment. Key attributes: payment, status, amount, currency, PSP refund ID. Relationships: belongs to tenant, payment, created by user.

- **RentalPenaltyRule (Penalty Rule)**: Represents configurable penalty rules at tenant level. Key attributes: tenant, active status, grace days, mode (fixed/percentage), rate, fixed amount, cap amount, minimum balance threshold. Relationships: belongs to tenant.

- **RentalPenalty (Penalty)**: Represents a calculated penalty applied to an overdue installment. Key attributes: installment, calculated date, days late, mode, rate, fixed amount, calculated amount, manual override flag, override reason. Relationships: belongs to tenant, installment, optional created by user.

- **RentalSecurityDeposit (Security Deposit)**: Represents a security deposit account for a lease. Key attributes: lease (unique), target amount, collected amount, held amount, refunded amount, forfeited amount. Relationships: belongs to tenant, lease; has many movements.

- **RentalDepositMovement (Deposit Movement)**: Represents a movement (collection, hold, release, refund, forfeit, adjustment) on a security deposit. Key attributes: deposit, movement type, amount, optional payment/installment linkage, note. Relationships: belongs to tenant, deposit, optional payment, installment, created by user.

- **RentalDocument (Document)**: Represents a rental document (contract, receipt, quittance, statement). Key attributes: document type, status, document number (unique), lease/installment/payment linkage, file storage (URL, key, mime type), content hash, issued date, title, description. Relationships: belongs to tenant, optional lease, installment, payment, created by user.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Property managers can create a complete lease (with renter, property, dates, amounts, billing frequency) in under 3 minutes from lease creation form to saved lease.
- **SC-002**: System generates installments for a 12-month monthly lease (12 installments) in under 2 seconds.
- **SC-003**: Property managers can record a payment and allocate it to installments in under 1 minute.
- **SC-004**: System calculates penalties for overdue installments automatically within 1 second of penalty calculation trigger.
- **SC-005**: Property managers can view all installments for a lease with payment status in under 1 second.
- **SC-006**: System supports 1,000 active leases per tenant organization without performance degradation.
- **SC-007**: System processes 100 payment allocations per minute without errors or data inconsistency.
- **SC-008**: 95% of payment allocations are accurately recorded with correct installment updates on first attempt.
- **SC-009**: Property managers can generate and retrieve rental documents (receipts, quittances) in under 5 seconds.
- **SC-010**: System maintains 100% tenant data isolation: zero cross-tenant data access incidents in production.
- **SC-011**: Property managers can view complete payment history for a lease (all payments and allocations) in under 2 seconds.
- **SC-012**: System accurately tracks security deposit balances with zero calculation errors in deposit movement operations.

## Assumptions

- Property and tenant client (renter) entities already exist in the system from previous modules (Properties module, CRM module).
- Invoice module exists and can be optionally linked to installments and payments for billing integration.
- Document storage service (file storage) is available for storing generated documents (contracts, receipts, quittances).
- Payment service provider (PSP) integration is available or will be implemented separately; this module provides the data model and status tracking for PSP integration.
- Multi-tenant architecture is already established with tenant isolation mechanisms in place.
- Users have appropriate permissions (RBAC) to access rental management features based on their roles (property manager, accountant, etc.).
- Currency is primarily FCFA (West African CFA franc) but system supports multiple currencies per lease.
- Lease terms and penalty rules follow local rental regulations; system provides flexibility for configuration but does not enforce legal compliance.
- Mobile money operators (Orange, MTN, Moov, Wave) are the primary mobile payment methods in the target market.
- Document generation uses templates that will be defined during implementation; specification focuses on document storage and management, not template design.

## Dependencies

- **Properties Module**: Requires Property entity to link leases to properties.
- **CRM Module**: Requires TenantClient entity to link leases to renters (primary renter, co-renters, owner). Optionally links to CRM Deal entity for pipeline tracking.
- **Invoice Module** (if exists): Optional integration to link installments and payments to invoices.
- **User Management & RBAC**: Requires User entity and permission system for access control.
- **Multi-Tenant Infrastructure**: Requires Tenant entity and tenant isolation mechanisms.
- **File Storage Service**: Requires document storage service for storing generated documents (contracts, receipts, quittances, statements).
- **Payment Service Provider Integration** (optional): May require PSP API integration for automated payment processing and webhook handling.

## Out of Scope

- Property listing and search functionality (handled by Properties module).
- Contact/lead management (handled by CRM module).
- Invoice generation and billing (handled by Invoice module, though installments can link to invoices).
- Accounting and financial reporting (general ledger, profit/loss statements).
- Property maintenance and work order management.
- Tenant communication and messaging (notifications, SMS, email sending).
- Legal document template design and customization (system stores and manages documents but does not design templates).
- Payment gateway integration implementation (system provides data model for payments but PSP integration is separate).
- Automated rent collection (system tracks payments but does not initiate collection).
- Property inspection and condition reporting.
- Insurance management for properties or leases.
