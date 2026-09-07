# Feature Specification: Tenant Portal Module

**Feature Branch**: `008-tenant-portal`  
**Created**: 2025-01-27  
**Status**: Draft  
**Input**: User description: "Module Portail Locataire - ImmoTopia: Développer un portail web complet pour les locataires leur permettant de consulter leur bail, suivre leurs paiements, déclarer des paiements, créer des demandes de maintenance et accéder à leurs documents de location."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Access Dashboard and View Lease Overview (Priority: P1)

A tenant logs into the portal and immediately sees a comprehensive dashboard showing their current lease status, outstanding balance, next payment due, security deposit information, recent payment history, and maintenance ticket summary. This provides tenants with instant visibility into their rental situation without navigating multiple pages.

**Why this priority**: The dashboard is the entry point and primary value proposition of the portal. It gives tenants immediate awareness of their financial obligations and lease status, reducing support inquiries and improving tenant satisfaction.

**Independent Test**: Can be fully tested by logging in as a tenant with an active lease and verifying all dashboard metrics are accurate and displayed correctly. Delivers immediate value by consolidating critical information in one view.

**Acceptance Scenarios**:

1. **Given** a tenant has an active lease, **When** they access the portal dashboard, **Then** they see their property address, lease dates, monthly rent amount, current balance (amount owed or advance), next installment due date and amount, security deposit held amount, last 5 payments, and maintenance ticket counts by status
2. **Given** a tenant has no outstanding balance, **When** they view the dashboard, **Then** the balance displays as zero or positive (indicating advance payment) with appropriate visual indicator
3. **Given** a tenant has overdue installments, **When** they view the dashboard, **Then** the current balance clearly shows the overdue amount with appropriate warning indicators
4. **Given** a tenant has no upcoming installments, **When** they view the dashboard, **Then** the next installment section indicates no upcoming payments

---

### User Story 2 - View Complete Lease Details and Documents (Priority: P1)

A tenant needs to access their complete lease agreement, view all lease terms, see co-renters associated with the lease, and download lease-related documents (contracts, addendums, receipts) at any time.

**Why this priority**: Tenants frequently need to reference their lease terms, verify contract details, and access official documents for personal records or third-party requirements (banks, government agencies). This reduces administrative burden on property managers.

**Independent Test**: Can be fully tested by accessing the lease details page and verifying all lease information, co-renter list, and document download functionality work correctly. Delivers value by providing self-service access to critical lease documentation.

**Acceptance Scenarios**:

1. **Given** a tenant has an active lease, **When** they navigate to the lease details page, **Then** they see complete lease information including property address, lease dates, rent amount, service charges, security deposit, billing frequency, payment terms, and any special conditions
2. **Given** a lease has co-renters, **When** a tenant views lease details, **Then** they see a list of all co-renters with their contact information
3. **Given** lease documents exist (contract, addendums, receipts), **When** a tenant views lease details, **Then** they see all available documents grouped by type with download options
4. **Given** a tenant clicks download on a document, **When** the download completes, **Then** they receive a PDF file of the document

---

### User Story 3 - Track Payment History and Installment Status (Priority: P1)

A tenant needs to view all their payment installments, see which are paid, due, overdue, or partially paid, filter installments by status or date range, and view detailed breakdown of each installment including charges, allocations, and penalties.

**Why this priority**: Payment tracking is a core tenant need. Tenants must verify their payment history, understand what they owe, and see how payments were applied to specific installments. This transparency builds trust and reduces disputes.

**Independent Test**: Can be fully tested by viewing the installments list, applying filters, and viewing installment details. Delivers value by providing complete payment transparency and reducing payment-related inquiries.

**Acceptance Scenarios**:

1. **Given** a tenant has multiple installments, **When** they view the installments page, **Then** they see a list of all installments with period, due date, amount, status (DUE, PAID, OVERDUE, PARTIAL), and can filter by status or date range
2. **Given** a tenant views an installment, **When** they click to see details, **Then** they see the complete breakdown including all charge items (rent, service charges, utilities), payment allocations, penalties applied, and related payment transactions
3. **Given** a tenant filters installments by "OVERDUE" status, **When** the filter is applied, **Then** only overdue installments are displayed
4. **Given** a tenant views installment summary, **When** the summary loads, **Then** they see totals for all installments, paid installments, due installments, overdue installments, and partially paid installments

---

### User Story 4 - Declare Payment Made Outside Portal (Priority: P2)

A tenant makes a payment through cash, bank transfer, or mobile money and needs to declare this payment in the portal by providing payment details, date, amount, method, reference number, and optionally upload proof of payment. The system records this declaration for property manager review and approval.

**Why this priority**: Many tenants pay through offline methods (cash, bank transfers, mobile money) and need a way to notify property managers of these payments. This streamlines payment reconciliation and ensures tenants get credit for payments made outside the system.

**Independent Test**: Can be fully tested by submitting a payment declaration with all required fields and verifying the declaration is created with PENDING status and property manager is notified. Delivers value by enabling tenants to self-report payments and reducing manual payment entry by property managers.

**Acceptance Scenarios**:

1. **Given** a tenant wants to declare a payment, **When** they click "Declare Payment" and fill the form with amount, payment date, method, reference number, and upload proof, **Then** the payment declaration is created with PENDING status and property manager receives a notification
2. **Given** a tenant declares a payment for a specific installment, **When** they submit the declaration, **Then** the declaration is linked to that installment and appears in the installment details
3. **Given** a tenant declares a payment without linking to an installment, **When** they submit, **Then** the declaration is created as a general payment that can be allocated later by the property manager
4. **Given** a tenant uploads a payment proof file, **When** the file is uploaded, **Then** the file is stored securely and accessible to property managers for review
5. **Given** a tenant submits a payment declaration, **When** validation fails (missing required fields, invalid amount, future date), **Then** appropriate error messages are displayed and the declaration is not created

---

### User Story 5 - View Payment History (Priority: P2)

A tenant needs to view their complete payment history showing all payments made, when they were made, payment methods used, amounts paid, and how payments were allocated across installments.

**Why this priority**: Tenants need to verify their payment records, track payment methods used, and see payment allocations. This provides transparency and helps tenants reconcile their records with property manager records.

**Independent Test**: Can be fully tested by viewing the payment history page and verifying all payments are displayed with correct details and allocations. Delivers value by providing complete payment transparency.

**Acceptance Scenarios**:

1. **Given** a tenant has made multiple payments, **When** they view payment history, **Then** they see a chronological list of all payments with date, amount, method, status, and total amount paid
2. **Given** a payment was allocated to multiple installments, **When** a tenant views that payment, **Then** they see how the payment was split across installments
3. **Given** a tenant wants to filter payments, **When** they apply date range or method filters, **Then** only matching payments are displayed

---

### User Story 6 - View Security Deposit Information (Priority: P2)

A tenant needs to see their security deposit amount, current held amount, deposit status, and history of deposit movements (collections, holds, releases, refunds, adjustments).

**Why this priority**: Security deposits are significant financial amounts. Tenants need visibility into deposit status and movements to understand how their deposit is being managed and when they can expect refunds.

**Independent Test**: Can be fully tested by viewing the deposit information page and verifying deposit amount, held amount, and movement history are displayed correctly. Delivers value by providing transparency into deposit management.

**Acceptance Scenarios**:

1. **Given** a tenant has a security deposit, **When** they view deposit information, **Then** they see the original deposit amount, current held amount, deposit status, and all deposit movements with dates and amounts
2. **Given** deposit movements have occurred, **When** a tenant views deposit history, **Then** they see movements in chronological order with type (COLLECT, HOLD, RELEASE, REFUND, FORFEIT, ADJUSTMENT) and amounts

---

### User Story 7 - Create Maintenance Request (Priority: P2)

A tenant discovers a maintenance issue (plumbing leak, electrical problem, appliance failure) and needs to create a maintenance request by providing category, priority level, description, title, and uploading photos. The system creates a ticket that property managers can view and assign.

**Why this priority**: Maintenance requests are common tenant needs. Enabling tenants to self-report issues with photos and priority levels streamlines the maintenance workflow and ensures issues are documented properly.

**Independent Test**: Can be fully tested by creating a maintenance ticket with all required information and photos, and verifying the ticket is created with DECLARED status and property manager is notified. Delivers value by enabling efficient maintenance request submission.

**Acceptance Scenarios**:

1. **Given** a tenant needs to report a maintenance issue, **When** they create a maintenance ticket with category, priority, title, description, and upload photos, **Then** the ticket is created with DECLARED status, linked to their lease and property, and property manager receives a notification
2. **Given** a tenant uploads multiple photos, **When** they submit the ticket, **Then** all photos are attached and viewable in the ticket details
3. **Given** a tenant creates an URGENT priority ticket, **When** the ticket is created, **Then** property managers receive priority notification
4. **Given** a tenant submits a ticket without required fields, **When** validation fails, **Then** appropriate error messages are displayed

---

### User Story 8 - Track Maintenance Requests and Add Comments (Priority: P2)

A tenant needs to view all their maintenance tickets, see ticket status (DECLARED, IN_PROGRESS, ASSIGNED, RESOLVED), filter tickets by status, view ticket details including comments and photos, and add comments to existing tickets to provide updates or additional information.

**Why this priority**: Tenants need visibility into maintenance request status and the ability to communicate with property managers about ongoing issues. This improves tenant satisfaction and reduces follow-up inquiries.

**Independent Test**: Can be fully tested by viewing maintenance tickets, filtering by status, viewing ticket details, and adding comments. Delivers value by providing transparency into maintenance request processing.

**Acceptance Scenarios**:

1. **Given** a tenant has multiple maintenance tickets, **When** they view the maintenance page, **Then** they see all their tickets with status, category, priority, creation date, and can filter by status
2. **Given** a tenant views a ticket, **When** they see ticket details, **Then** they see all ticket information, photos, status history, comments from property managers, and can add their own comments
3. **Given** a tenant adds a comment to a ticket, **When** they submit the comment, **Then** the comment is added to the ticket and property managers are notified
4. **Given** a ticket status changes, **When** a tenant views the ticket, **Then** they see the updated status and any status change notifications

---

### User Story 9 - Access and Download Rental Documents (Priority: P3)

A tenant needs to access all rental-related documents (lease contracts, rent receipts, quittances, deposit receipts, statements) organized by document type, view document metadata (generation date, type), and download documents as PDF files.

**Why this priority**: Tenants frequently need official documents for personal records, tax purposes, or third-party requirements. Self-service document access reduces administrative burden.

**Independent Test**: Can be fully tested by viewing the documents page, seeing documents grouped by type, and successfully downloading documents. Delivers value by providing convenient access to official documents.

**Acceptance Scenarios**:

1. **Given** a tenant has multiple rental documents, **When** they view the documents page, **Then** they see documents organized by type (LEASE_CONTRACT, RENT_RECEIPT, RENT_QUITTANCE, DEPOSIT_RECEIPT, STATEMENT) with generation dates
2. **Given** a tenant clicks download on a document, **When** the download completes, **Then** they receive a PDF file of the document
3. **Given** a tenant filters documents by type, **When** the filter is applied, **Then** only documents of that type are displayed

---

### Edge Cases

- What happens when a tenant has multiple active leases? System should display information for the primary active lease or allow selection if multiple exist
- How does system handle tenants who are co-renters but not primary renters? System should grant access if tenant is listed as co-renter in an active lease
- What happens when a lease becomes inactive or ends? System should restrict access or show historical information appropriately
- How does system handle payment declarations that exceed installment amounts? System should allow declarations but flag for property manager review
- What happens when a tenant tries to declare a payment for a future date? System should validate and reject future-dated declarations or allow with appropriate warnings
- How does system handle maintenance tickets for properties with multiple leases? System should link ticket to the active lease for that property
- What happens when a tenant uploads very large photo files? System should validate file size and reject or compress oversized files
- How does system handle concurrent payment declarations for the same installment? System should allow multiple declarations but flag potential duplicates for review
- What happens when a document download fails? System should provide clear error message and retry option
- How does system handle tenants with no active lease? System should deny portal access with appropriate message

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST authenticate tenants using existing JWT authentication before granting portal access
- **FR-002**: System MUST verify that authenticated user is linked to a TenantClient record before allowing portal access
- **FR-003**: System MUST verify that tenant has at least one active lease (where tenant is primary renter or co-renter) before granting portal access
- **FR-004**: System MUST display a dashboard showing lease overview, current balance, next installment, recent payments, deposit information, and maintenance ticket summary
- **FR-005**: System MUST allow tenants to view complete lease details including property information, lease terms, co-renters, and associated documents
- **FR-006**: System MUST display all payment installments with status (DUE, PAID, OVERDUE, PARTIAL) and allow filtering by status and date range
- **FR-007**: System MUST allow tenants to view detailed breakdown of each installment including charge items, payment allocations, and penalties
- **FR-008**: System MUST allow tenants to declare payments made outside the portal by providing amount, payment date, method, reference number, optional installment link, and optional proof file upload
- **FR-009**: System MUST create payment declarations with PENDING status and notify property managers for review
- **FR-010**: System MUST validate payment declarations (required fields, valid amounts, valid dates, file size limits) before creation
- **FR-011**: System MUST display complete payment history showing all payments with dates, amounts, methods, status, and allocation details
- **FR-012**: System MUST display security deposit information including original amount, current held amount, status, and movement history
- **FR-013**: System MUST allow tenants to create maintenance tickets with category, priority, title, description, and multiple photo uploads
- **FR-014**: System MUST link maintenance tickets to tenant's active lease and property automatically
- **FR-015**: System MUST create maintenance tickets with DECLARED status and notify property managers
- **FR-016**: System MUST allow tenants to view all their maintenance tickets with status, filter by status, and view ticket details including comments and photos
- **FR-017**: System MUST allow tenants to add comments to their maintenance tickets
- **FR-018**: System MUST display all rental documents organized by type (LEASE_CONTRACT, RENT_RECEIPT, RENT_QUITTANCE, DEPOSIT_RECEIPT, STATEMENT) with generation dates
- **FR-019**: System MUST allow tenants to download rental documents as PDF files
- **FR-020**: System MUST verify tenant access rights before allowing document downloads
- **FR-021**: System MUST calculate current balance as sum of DUE and OVERDUE installments minus allocated payments
- **FR-022**: System MUST display next upcoming installment (earliest DUE installment) on dashboard
- **FR-023**: System MUST restrict tenant access to only their own lease data, payments, tickets, and documents
- **FR-024**: System MUST handle file uploads for payment proof and maintenance photos with appropriate size and type validation
- **FR-025**: System MUST provide appropriate error messages when portal access is denied or data is not found

### Key Entities *(include if feature involves data)*

- **Tenant Portal Access**: Represents the authorization context for a tenant accessing the portal, including the active lease ID, tenant client ID, and lease details. Determines what data the tenant can access.

- **Payment Declaration**: Represents a tenant's self-reported payment made outside the portal system. Includes payment details (amount, date, method, reference), optional installment link, proof file, and review status (PENDING, APPROVED, REJECTED). Links to lease and tenant client.

- **Dashboard Summary**: Aggregated view of tenant's rental situation including lease overview, financial status (balance, next installment), recent activity (payments), deposit status, and maintenance ticket counts. Calculated from lease, installments, payments, and tickets.

- **Lease Details View**: Complete lease information including property details, lease terms, primary renter, co-renters, owner information, and associated documents. Provides comprehensive lease context.

- **Installment View**: Payment installment information including period, due date, total amount, status, charge breakdown (rent, service charges, utilities), payment allocations, and penalties. Shows how payments are applied.

- **Maintenance Ticket**: Tenant-reported maintenance issue with category, priority, description, photos, status, and comment thread. Links to lease, property, and tenant client.

- **Rental Document**: Official document (contract, receipt, quittance, statement) associated with a lease. Includes document type, generation date, file reference, and download capability.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Tenants can access their portal dashboard and view all key information (lease, balance, next payment, deposit, recent payments, maintenance summary) within 2 seconds of page load
- **SC-002**: Tenants can successfully declare a payment (including file upload) in under 1 minute from start to submission
- **SC-003**: Tenants can create a maintenance request with photos in under 2 minutes from start to submission
- **SC-004**: 95% of tenants can successfully download a rental document on first attempt
- **SC-005**: System supports 500 concurrent tenant portal users without performance degradation
- **SC-006**: Payment declarations are visible to property managers within 30 seconds of tenant submission
- **SC-007**: Maintenance tickets are visible to property managers within 30 seconds of tenant creation
- **SC-008**: Tenants can view complete payment history for their lease (up to 100 payments) without pagination delays
- **SC-009**: Portal access is denied for unauthorized users (non-tenants, tenants without active leases) with appropriate error messages in under 1 second
- **SC-010**: 90% of tenants successfully complete their primary task (view lease, declare payment, create ticket, download document) on first attempt without support

## Assumptions

- Tenants have existing user accounts linked to TenantClient records through the authentication system
- Property managers will review and approve/reject payment declarations through a separate admin interface (not part of this feature)
- Maintenance ticket assignment and resolution workflows are handled by property managers through existing maintenance module interfaces
- Document generation (contracts, receipts, quittances) is handled by existing document generation module
- File storage infrastructure exists for storing payment proof files and maintenance photos
- Email/notification infrastructure exists for notifying property managers of new payment declarations and maintenance tickets
- Multi-tenant data isolation is already implemented and enforced at the database and application level
- Existing rental management module (leases, installments, payments, deposits) is fully functional and provides the data needed for the portal

## Dependencies

- **Authentication Module**: JWT authentication must be functional and integrated
- **Rental Management Module**: Complete rental lease, installment, payment, and deposit data must be available
- **Maintenance Module**: Maintenance ticket system must be functional for ticket creation and status tracking
- **Document Generation Module**: Rental documents (contracts, receipts, quittances) must be generated and stored
- **File Storage Service**: Infrastructure for storing and serving payment proof files and maintenance photos
- **Notification Service**: System for notifying property managers of new payment declarations and maintenance tickets
- **Multi-Tenant Infrastructure**: Data isolation and tenant context must be properly implemented

## Out of Scope

- Property manager interfaces for reviewing payment declarations (handled by existing admin interfaces)
- Property manager interfaces for assigning/resolving maintenance tickets (handled by existing maintenance module)
- Real-time payment processing or payment gateway integration (tenants only declare payments made outside system)
- Document generation workflows (documents are assumed to already exist)
- Email notifications to tenants (only property manager notifications are in scope)
- Mobile native applications (web portal only)
- Offline functionality or data synchronization
- Advanced analytics or reporting beyond basic dashboard summaries
- Tenant-to-tenant communication or messaging features
- Lease renewal or termination workflows through the portal
