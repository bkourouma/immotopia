# Research: Rental Management Module

**Feature**: 006-rental-management  
**Date**: 2025-01-27  
**Status**: Complete

## Research Questions & Decisions

### 1. Scheduled Job Implementation for Daily Penalty Calculation

**Question**: How should we implement the daily automated penalty calculation job?

**Decision**: Use `node-cron` library for scheduled jobs in Node.js/Express application.

**Rationale**: 
- `node-cron` is a mature, widely-used library for scheduling tasks in Node.js
- Provides cron-like syntax for flexible scheduling
- Lightweight and doesn't require external job queue systems (Redis, Bull, etc.)
- Easy to integrate with existing Express.js application
- Supports timezone configuration
- Can be started/stopped programmatically

**Alternatives Considered**:
- **Bull/BullMQ with Redis**: Overkill for single daily job, adds Redis dependency
- **node-schedule**: Similar to node-cron but less popular
- **External cron service**: Adds complexity and external dependency
- **Database triggers**: Not suitable for complex business logic, harder to test

**Implementation Notes**:
- Job runs daily at configurable time (e.g., 2:00 AM server time)
- Job queries all overdue installments (due_date + grace_days < today)
- For each overdue installment, calculates penalty based on lease penalty rules
- Creates/updates RentalPenalty records
- Updates installment penalty_amount field
- Logs job execution and errors
- Manual trigger endpoint allows property managers to recalculate penalties on-demand

---

### 2. Installment Generation Algorithm

**Question**: How should installments be generated when property manager triggers generation?

**Decision**: Generate all installments for the lease term (from start_date to end_date) based on billing frequency, calculating period year/month and due dates.

**Rationale**:
- Provides complete visibility of payment schedule upfront
- Simplifies installment tracking and reporting
- Aligns with manual trigger requirement (FR-005)
- Allows property managers to review and adjust installments before they become due

**Algorithm**:
1. Calculate number of billing periods: `(end_date - start_date) / billing_frequency_days`
2. For each period:
   - Calculate period start date (lease start_date + period_offset)
   - Calculate period end date (period_start + billing_frequency_days - 1)
   - Set due_date to: day of month = lease.due_day_of_month, month = period_end.month, year = period_end.year
   - If due_date falls before period_start, move to next month
   - Create installment with period_year, period_month, due_date
   - Set amounts: rent_amount, service_charge_amount, other_fees_amount from lease
   - Set status: DRAFT (becomes DUE when due_date arrives)
3. Validate no duplicate installments (lease_id + period_year + period_month unique)

**Alternatives Considered**:
- **Generate installments monthly**: Adds complexity, requires recurring job
- **Generate installments on-demand**: Doesn't provide full schedule visibility
- **Generate installments quarterly**: Doesn't match all billing frequencies

**Edge Cases Handled**:
- Lease end_date is null: Generate installments for 12 months (or configurable default)
- Billing frequency changes mid-lease: Only affect future installments
- Start date is mid-month: First installment due date based on due_day_of_month

---

### 3. Payment Allocation Algorithm

**Question**: How should payment allocation prioritize installments when allocating to multiple installments?

**Decision**: Allocate to oldest overdue installments first (by days overdue descending), then earliest due date installments (by due_date ascending).

**Rationale**:
- Prioritizes resolving overdue amounts first (financial priority)
- Then addresses upcoming installments (cash flow management)
- Clear, predictable allocation order
- Aligns with business requirement (FR-010)

**Algorithm**:
1. Sort installments by priority:
   - First: Overdue installments (status OVERDUE or DUE with due_date < today), sorted by days overdue descending
   - Second: Future installments (status DUE with due_date >= today), sorted by due_date ascending
2. Allocate payment amount sequentially:
   - For each installment in priority order:
     - Calculate remaining_due = (rent + service + other_fees + penalty) - paid_amount
     - If remaining_due > 0:
       - allocation_amount = min(payment_remaining, remaining_due)
       - Create RentalPaymentAllocation record
       - Update installment paid_amount
       - Update payment remaining amount
3. If payment amount exceeds all installments, handle overpayment:
   - Allocate to all due/overdue installments first
   - Apply excess to future installments or record as credit

**Alternatives Considered**:
- **Earliest due date first**: Doesn't prioritize overdue amounts
- **Largest amount first**: Doesn't prioritize overdue installments
- **Manual selection only**: Too cumbersome for property managers

---

### 4. Document Number Generation

**Question**: How should document numbers be generated in format YYYY-NNN?

**Decision**: Use year-prefixed sequential numbering per tenant, with counter stored in database or generated from existing document count.

**Rationale**:
- Simple and predictable format
- Year prefix provides natural organization
- Sequential numbering ensures uniqueness
- Per-tenant isolation maintains tenant data separation

**Algorithm**:
1. Get current year (YYYY)
2. Query existing documents for tenant in current year: `SELECT COUNT(*) FROM rental_documents WHERE tenant_id = ? AND EXTRACT(YEAR FROM created_at) = ?`
3. Next number = count + 1
4. Format: `YYYY-NNN` where NNN is zero-padded 3-digit number (e.g., 2025-001, 2025-002)
5. Validate uniqueness: Check if document_number already exists (handle race conditions with database constraint)

**Alternatives Considered**:
- **UUID-based**: Not human-readable, doesn't match requirement
- **Timestamp-based**: Not sequential, harder to read
- **Global counter**: Doesn't provide tenant isolation

**Edge Cases Handled**:
- Year rollover: Counter resets to 001 for new year
- Concurrent document generation: Database unique constraint prevents duplicates
- Document voiding: Voided documents still count in sequence (no reuse of numbers)

---

### 5. Security Deposit Single Payment Validation

**Question**: How should we validate that security deposit is collected in a single payment?

**Decision**: Validate payment amount equals target amount exactly when creating COLLECT movement, and prevent multiple COLLECT movements if deposit already collected.

**Rationale**:
- Enforces business rule (FR-018)
- Prevents partial payments
- Clear validation error messages for users

**Validation Logic**:
1. When creating COLLECT movement:
   - Check if deposit.collected_amount > 0: Reject (deposit already collected)
   - Validate payment.amount == deposit.target_amount: Reject if not equal
   - If validation passes: Create movement, update deposit.collected_amount = target_amount
2. When recording payment designated as deposit:
   - Validate payment amount equals deposit target amount
   - Display clear error if amount doesn't match: "Le dépôt de garantie doit être collecté en un seul paiement égal au montant cible (X FCFA)"

**Alternatives Considered**:
- **Allow partial with minimum**: Doesn't match requirement
- **Allow multiple payments**: Doesn't match requirement

---

### 6. Currency Handling

**Question**: How should currency validation and consistency be handled?

**Decision**: Validate currency matches lease currency for all payments, reject mismatched currencies with clear error message.

**Rationale**:
- Prevents currency confusion and calculation errors
- Aligns with edge case requirement
- Clear validation prevents data inconsistency

**Validation Logic**:
1. When creating payment:
   - Validate payment.currency == lease.currency
   - If mismatch: Reject with error "La devise du paiement (X) ne correspond pas à la devise du bail (Y)"
2. When allocating payment to installment:
   - Validate payment.currency == installment.currency (should match lease currency)
3. Currency conversion: Out of scope for V1 (future enhancement)

**Alternatives Considered**:
- **Automatic currency conversion**: Adds complexity, requires exchange rate API
- **Allow mixed currencies**: Creates calculation and reporting complexity

---

## Technology Choices

### Scheduled Jobs: node-cron
- **Version**: Latest stable (^3.x)
- **Integration**: Add to Express app startup, configure cron schedule
- **Testing**: Mock time in tests, test job execution manually

### Document Storage
- **Assumption**: Existing file storage service available (S3, local filesystem, etc.)
- **Integration**: Use existing document storage service from property/document modules
- **Format**: Store files with metadata (file_key, file_url, mime_type, content_hash)

### Payment Service Provider (PSP) Integration
- **Status**: Out of scope for V1 (data model only)
- **Future**: Webhook handlers for PSP callbacks, transaction status updates
- **Current**: Manual payment recording with PSP transaction ID/reference fields

---

## Dependencies Confirmed

- ✅ Property entity exists (from Properties module)
- ✅ TenantClient entity exists (from CRM module)
- ✅ Invoice entity exists (optional, from Invoice module)
- ✅ User entity exists (from Auth module)
- ✅ Tenant entity exists (from Multi-tenant module)
- ✅ File storage service available (assumed from dependencies)
- ✅ RBAC middleware exists (from Multi-tenant RBAC module)
- ✅ Tenant isolation middleware exists (from Multi-tenant module)

---

## Open Questions (Resolved)

All research questions have been resolved. No open questions remain.

---

## References

- [node-cron documentation](https://github.com/node-cron/node-cron)
- Prisma schema patterns from existing modules (CRM, Properties)
- Express.js middleware patterns from existing codebase
- React component patterns from existing frontend code





