# Feature Specification: Owner Portal Module

**Feature Branch**: `009-owner-portal`  
**Created**: 2025-01-27  
**Status**: Draft  
**Input**: User description: "Module Portail Propriétaire - ImmoTopia: Développer un portail web complet pour les propriétaires leur permettant de suivre leurs propriétés, consulter leurs revenus locatifs, visualiser les baux actifs, surveiller les paiements des locataires et accéder aux rapports et documents."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Access Dashboard and View Property Portfolio Overview (Priority: P1)

A property owner logs into the portal and immediately sees a comprehensive dashboard showing their property portfolio summary (total properties, rented properties, available properties, properties under maintenance), current month and year rental income, occupancy rate, upcoming payment due dates, and recent activity (recent payments and maintenance tickets). This provides owners with instant visibility into their rental business performance without navigating multiple pages.

**Why this priority**: The dashboard is the entry point and primary value proposition of the portal. It gives property owners immediate awareness of their property portfolio status, financial performance, and operational health, reducing support inquiries and improving owner satisfaction. This consolidates critical information that owners need to make informed decisions about their rental properties.

**Independent Test**: Can be fully tested by logging in as a property owner with multiple properties and leases, and verifying all dashboard metrics are accurate and displayed correctly. Delivers immediate value by consolidating critical business information in one view.

**Acceptance Scenarios**:

1. **Given** a property owner has multiple properties with different statuses (rented, available, under maintenance), **When** they access the portal dashboard, **Then** they see a summary showing total properties count, rented count, available count, and properties under maintenance count
2. **Given** a property owner has received rental payments, **When** they view the dashboard, **Then** they see current month revenue, current year revenue, last month revenue, and last year revenue for comparison
3. **Given** a property owner has properties with active leases, **When** they view the dashboard, **Then** they see occupancy rate (percentage of rented properties), rented units count, and total units count
4. **Given** a property owner has upcoming payment due dates, **When** they view the dashboard, **Then** they see the next 5 upcoming installments with due dates, amounts, and associated properties
5. **Given** a property owner has recent activity, **When** they view the dashboard, **Then** they see the last 5 recent payments and last 5 recent maintenance tickets with relevant details

---

### User Story 2 - View Property Portfolio and Property Details (Priority: P1)

A property owner needs to view all their properties in a list, filter properties by status (rented, available, under maintenance), property type, or transaction mode, and access detailed information for each property including current lease status, lease history, revenue statistics, and maintenance history.

**Why this priority**: Property owners need to manage their property portfolio effectively. They must be able to see all their properties, understand which are generating income, which are available for rent, and access detailed information about each property's performance and history. This is foundational for property portfolio management.

**Independent Test**: Can be fully tested by viewing the properties list, applying filters, and accessing property details. Delivers value by providing comprehensive property portfolio visibility and enabling owners to track property performance.

**Acceptance Scenarios**:

1. **Given** a property owner has multiple properties, **When** they view the properties page, **Then** they see a list of all their properties with key information (address, type, status, current lease status if applicable) and can filter by status, property type, or transaction mode
2. **Given** a property owner views a property, **When** they access property details, **Then** they see complete property information including address, type, media, documents, current active lease (if any), lease history (ended leases), revenue statistics (total received, current month, average monthly), and maintenance ticket history
3. **Given** a property has no active lease, **When** a property owner views property details, **Then** the current lease section indicates the property is available for rent
4. **Given** a property owner filters properties by "RENTED" status, **When** the filter is applied, **Then** only properties with active leases are displayed

---

### User Story 3 - View Active Leases and Lease Details (Priority: P1)

A property owner needs to view all active leases for their properties, see lease status (active, suspended, ended), filter leases by status or property, and access detailed lease information including tenant information, rent amounts, payment history, installment schedule, security deposit status, and lease documents.

**Why this priority**: Leases are the foundation of rental income. Property owners need visibility into all their active leases, tenant relationships, payment status, and lease terms. This enables owners to monitor lease performance, identify payment issues, and manage tenant relationships effectively.

**Independent Test**: Can be fully tested by viewing the leases list, filtering by status or property, and accessing detailed lease information. Delivers value by providing complete lease visibility and enabling owners to track lease performance and tenant relationships.

**Acceptance Scenarios**:

1. **Given** a property owner has multiple active leases, **When** they view the leases page, **Then** they see a list of all leases with property address, primary tenant name, monthly rent, lease dates, status, and a summary showing active count, ended count, and suspended count
2. **Given** a property owner views a lease, **When** they access lease details, **Then** they see complete lease information including property details, all renters (primary and co-renters), lease terms (dates, rent amount, service charges), installment schedule, payment history, current balance (total due, total paid, remaining), and security deposit information
3. **Given** a lease has overdue installments, **When** a property owner views lease details, **Then** the balance section clearly shows overdue amounts with appropriate indicators
4. **Given** a property owner filters leases by property, **When** they select a specific property, **Then** only leases for that property are displayed
5. **Given** a lease has associated documents, **When** a property owner views lease details, **Then** they see all lease documents (contracts, receipts, statements) with download options

---

### User Story 4 - Track Rental Income and Revenue Analytics (Priority: P1)

A property owner needs to view their rental income across different time periods, see revenue breakdown by property and by month, access revenue summaries (current month, current year, all-time, average monthly), and analyze revenue trends over time.

**Why this priority**: Rental income tracking is the core financial value proposition for property owners. Owners need to understand their revenue performance, identify which properties generate the most income, track revenue trends, and make informed financial decisions. This is essential for business planning and financial management.

**Independent Test**: Can be fully tested by viewing revenue summaries, revenue by property, revenue by month, and revenue trends. Delivers value by providing comprehensive financial visibility and enabling data-driven decision making.

**Acceptance Scenarios**:

1. **Given** a property owner has received rental payments, **When** they view the revenue summary, **Then** they see current month revenue, last month revenue, current year revenue, last year revenue, all-time total revenue, and average monthly revenue
2. **Given** a property owner has multiple properties, **When** they view revenue by property, **Then** they see a breakdown showing each property with total revenue, number of payments, and average monthly revenue
3. **Given** a property owner wants to analyze revenue trends, **When** they view revenue by month for a specific year, **Then** they see monthly revenue for all 12 months with month names and total year revenue
4. **Given** a property owner filters revenue by date range, **When** they specify start and end dates, **Then** they see revenue for that period with total amount and payment breakdown
5. **Given** a property owner views revenue analytics, **When** the data is displayed, **Then** they can see visual representations (charts, graphs) of revenue trends over time

---

### User Story 5 - Monitor Payment Status and Installment Tracking (Priority: P2)

A property owner needs to view all payment installments for their properties, see installment status (due, paid, overdue, partial), filter installments by status, property, or date range, and track upcoming and overdue payments.

**Why this priority**: Payment tracking is critical for cash flow management. Property owners need to identify which payments are due, which are overdue, and track payment status across all their properties. This enables proactive management of payment collection and identification of payment issues.

**Independent Test**: Can be fully tested by viewing installments list, applying filters, and viewing installment summaries. Delivers value by providing payment visibility and enabling owners to track cash flow and identify payment issues.

**Acceptance Scenarios**:

1. **Given** a property owner has multiple leases with installments, **When** they view the installments page, **Then** they see a list of all installments with property, tenant, period, due date, amount, status, and a summary showing total count, due count, overdue count, paid count, total amount, and due amount
2. **Given** a property owner filters installments by "OVERDUE" status, **When** the filter is applied, **Then** only overdue installments are displayed with days overdue information
3. **Given** a property owner wants to see upcoming payments, **When** they filter installments by "DUE" status and future dates, **Then** they see upcoming installments sorted by due date
4. **Given** a property owner views installment details, **When** they access an installment, **Then** they see complete installment information including associated lease, property, tenant, charge breakdown, payment allocations, and penalties if applicable

---

### User Story 6 - View Payment History and Payment Details (Priority: P2)

A property owner needs to view all rental payments received, see payment details (date, amount, method, tenant, property), filter payments by date range, property, or payment method, and access detailed payment information including allocations to installments.

**Why this priority**: Payment history provides transparency and audit trail. Property owners need to verify received payments, understand payment methods used, see how payments were allocated, and maintain financial records. This supports financial reconciliation and record keeping.

**Independent Test**: Can be fully tested by viewing payment history, applying filters, and accessing payment details. Delivers value by providing payment transparency and supporting financial record keeping.

**Acceptance Scenarios**:

1. **Given** a property owner has received multiple payments, **When** they view payment history, **Then** they see a chronological list of all payments with date, property, tenant, payment method, amount, status, and a summary showing total payments, total amount, this month amount, and this year amount
2. **Given** a property owner filters payments by date range, **When** they specify start and end dates, **Then** only payments within that period are displayed
3. **Given** a property owner filters payments by property, **When** they select a specific property, **Then** only payments for that property are displayed
4. **Given** a property owner views a payment, **When** they access payment details, **Then** they see complete payment information including date, amount, method, status, associated lease, property, tenant, and how the payment was allocated across installments
5. **Given** a payment was made via mobile money, **When** a property owner views payment details, **Then** they see mobile money operator information and transaction reference

---

### User Story 7 - Monitor Security Deposits (Priority: P2)

A property owner needs to view all security deposits for their properties, see deposit status (held, released, refunded), track deposit movements (collections, holds, releases, refunds), and view deposit balances.

**Why this priority**: Security deposits represent significant financial amounts. Property owners need visibility into deposit status, movements, and balances to manage tenant funds properly and ensure compliance with deposit handling requirements.

**Independent Test**: Can be fully tested by viewing deposits list and deposit movement history. Delivers value by providing transparency into deposit management and financial protection.

**Acceptance Scenarios**:

1. **Given** a property owner has leases with security deposits, **When** they view the deposits page, **Then** they see a list of all deposits with property, tenant, deposit amount, current held amount, status, and a summary showing total deposits, total held amount, and total released amount
2. **Given** a property owner views a deposit, **When** they access deposit movements, **Then** they see all deposit movements in chronological order with type (collect, hold, release, refund, forfeit, adjustment), date, amount, and current held amount
3. **Given** a deposit has been partially released, **When** a property owner views deposit details, **Then** they see the original deposit amount, current held amount, and released amount

---

### User Story 8 - Track Maintenance Requests and Issues (Priority: P2)

A property owner needs to view all maintenance tickets for their properties, see ticket status (declared, in progress, resolved), filter tickets by status, property, category, or priority, and access detailed ticket information including descriptions, photos, comments, and cost information.

**Why this priority**: Maintenance issues affect property condition and tenant satisfaction. Property owners need visibility into maintenance requests, costs, and resolution status to manage property maintenance effectively and control maintenance expenses.

**Independent Test**: Can be fully tested by viewing maintenance tickets list, applying filters, and accessing ticket details. Delivers value by providing maintenance visibility and enabling owners to track property condition and maintenance costs.

**Acceptance Scenarios**:

1. **Given** a property owner has multiple properties with maintenance tickets, **When** they view the maintenance page, **Then** they see a list of all tickets with property, category, priority, status, creation date, and a summary showing total tickets, open tickets, in-progress tickets, resolved tickets, and total maintenance costs
2. **Given** a property owner filters tickets by status, **When** they select "OPEN", **Then** only unresolved tickets are displayed
3. **Given** a property owner views a maintenance ticket, **When** they access ticket details, **Then** they see complete ticket information including property, lease, category, priority, description, photos, comments, status history, and cost information
4. **Given** a property owner filters tickets by property, **When** they select a specific property, **Then** only maintenance tickets for that property are displayed

---

### User Story 9 - Access and Download Rental Documents (Priority: P2)

A property owner needs to access all rental-related documents (lease contracts, rent receipts, quittances, statements, deposit receipts) organized by document type, filter documents by property, lease, or document type, and download documents as files.

**Why this priority**: Property owners need official documents for record keeping, tax purposes, legal requirements, and financial reporting. Self-service document access reduces administrative burden and ensures owners have timely access to important documents.

**Independent Test**: Can be fully tested by viewing documents list, applying filters, and downloading documents. Delivers value by providing convenient access to official rental documents.

**Acceptance Scenarios**:

1. **Given** a property owner has multiple leases with documents, **When** they view the documents page, **Then** they see all documents grouped by type (lease contracts, rent receipts, quittances, statements) with document metadata (type, property, lease, generation date) and can filter by document type, property, or lease
2. **Given** a property owner wants to download a document, **When** they click download on a document, **Then** the document file is downloaded successfully
3. **Given** a property owner filters documents by property, **When** they select a specific property, **Then** only documents related to that property are displayed

---

### User Story 10 - Generate Revenue and Occupancy Reports (Priority: P3)

A property owner needs to generate revenue reports for specific time periods showing detailed revenue breakdown, and generate occupancy reports showing property occupancy rates and availability. Reports should be exportable in standard formats.

**Why this priority**: Property owners need formal reports for financial planning, tax reporting, business analysis, and stakeholder communication. While not as critical as real-time data access, report generation provides formal documentation and supports business decision making.

**Independent Test**: Can be fully tested by generating revenue and occupancy reports and verifying report content and export functionality. Delivers value by providing formal documentation and supporting business analysis.

**Acceptance Scenarios**:

1. **Given** a property owner wants to generate a revenue report, **When** they specify a time period and request report generation, **Then** a revenue report is generated showing period, total revenue, properties count, payments count, and detailed revenue breakdown, and the report is available for download
2. **Given** a property owner wants to generate an occupancy report, **When** they request report generation, **Then** an occupancy report is generated showing total properties, rented properties, available properties, and occupancy rate, and the report is available for download
3. **Given** a property owner generates a report, **When** the report is ready, **Then** they can download the report in a standard format (PDF, CSV, or Excel)

---

### Edge Cases

- What happens when a property owner has no properties yet? → System displays empty state with appropriate messaging
- What happens when a property owner has properties but no active leases? → Dashboard shows zero revenue and 0% occupancy with appropriate indicators
- What happens when a property owner has no payments received? → Revenue sections show zero amounts with appropriate messaging
- How does system handle property owners with hundreds of properties? → System provides pagination and efficient data loading
- What happens when a property owner tries to access details of a property they don't own? → System denies access and shows appropriate error message
- How does system handle concurrent access when multiple property owners view the same property? → System allows concurrent read access without conflicts
- What happens when payment data is being updated while owner views payment history? → System shows consistent data snapshot or indicates data refresh
- How does system handle timezone differences for date-based filters? → System uses consistent timezone for all date displays and filters
- What happens when a lease ends while owner is viewing lease details? → System updates lease status appropriately and reflects ended status
- How does system handle maintenance tickets that span multiple properties? → System shows tickets only for properties owned by the viewing owner

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST authenticate property owners and verify they have PROPRIETAIRE role before granting portal access
- **FR-002**: System MUST restrict property owners to view only properties they own, ensuring complete data isolation between different property owners
- **FR-003**: System MUST display a dashboard showing property portfolio summary (total, rented, available, under maintenance), revenue metrics (current month, current year, comparisons), occupancy rate, upcoming payments, and recent activity
- **FR-004**: System MUST allow property owners to view all their properties in a list with filtering capabilities (status, type, transaction mode)
- **FR-005**: System MUST provide detailed property information including current lease, lease history, revenue statistics, and maintenance history for each property
- **FR-006**: System MUST allow property owners to view all active leases for their properties with filtering by status or property
- **FR-007**: System MUST provide detailed lease information including tenant details, rent amounts, payment history, installment schedule, balance information, and security deposit status
- **FR-008**: System MUST display revenue summaries showing current month, current year, all-time totals, and average monthly revenue
- **FR-009**: System MUST provide revenue breakdown by property showing total revenue, payment count, and average monthly revenue per property
- **FR-010**: System MUST provide revenue breakdown by month showing monthly revenue for a selected year with month names
- **FR-011**: System MUST allow property owners to filter revenue data by date range, property, or other criteria
- **FR-012**: System MUST display all payment installments for owner's properties with status (due, paid, overdue, partial) and filtering capabilities
- **FR-013**: System MUST provide installment summaries showing total count, due count, overdue count, paid count, and total amounts
- **FR-014**: System MUST display payment history showing all received payments with date, amount, method, tenant, property, and status
- **FR-015**: System MUST allow property owners to filter payments by date range, property, or payment method
- **FR-016**: System MUST provide detailed payment information including payment allocations to specific installments
- **FR-017**: System MUST display security deposit information including deposit amounts, current held amounts, and deposit status
- **FR-018**: System MUST show deposit movement history with movement types (collect, hold, release, refund, forfeit, adjustment), dates, and amounts
- **FR-019**: System MUST display maintenance tickets for owner's properties with status, category, priority, and cost information
- **FR-020**: System MUST allow property owners to filter maintenance tickets by status, property, category, or priority
- **FR-021**: System MUST provide detailed maintenance ticket information including descriptions, photos, comments, status history, and costs
- **FR-022**: System MUST organize rental documents by type (lease contracts, receipts, quittances, statements) with filtering by property, lease, or document type
- **FR-023**: System MUST allow property owners to download rental documents as files
- **FR-024**: System MUST allow property owners to generate revenue reports for specific time periods with detailed breakdowns
- **FR-025**: System MUST allow property owners to generate occupancy reports showing property occupancy rates and availability
- **FR-026**: System MUST provide report export functionality in standard formats (PDF, CSV, Excel)
- **FR-027**: System MUST ensure all data displayed is accurate and reflects current system state
- **FR-028**: System MUST handle empty states gracefully when owners have no properties, leases, payments, or other data
- **FR-029**: System MUST provide visual representations (charts, graphs) for revenue trends and analytics
- **FR-030**: System MUST support pagination and efficient data loading for owners with large property portfolios

### Key Entities *(include if feature involves data)*

- **Property Owner (TenantClient with PROPRIETAIRE role)**: Represents a property owner user who can access the owner portal. Key attributes: user account, tenant organization, owned properties list, portal access permissions
- **Property**: Represents a real estate property owned by a property owner. Key attributes: address, type, status (rented, available, under maintenance), current lease, lease history, revenue statistics, maintenance history
- **Lease (RentalLease)**: Represents a rental agreement between property owner and tenant. Key attributes: property, primary renter, co-renters, lease dates, rent amount, service charges, status, installment schedule, payment history, balance, security deposit
- **Revenue**: Represents rental income received by property owner. Key attributes: total amounts (monthly, yearly, all-time), breakdown by property, breakdown by month, payment count, average monthly revenue
- **Payment Installment**: Represents a scheduled payment obligation. Key attributes: lease, property, tenant, period, due date, amount, status (due, paid, overdue, partial), charges breakdown, payment allocations
- **Payment (RentalPayment)**: Represents a received rental payment. Key attributes: date, amount, method, status, lease, property, tenant, allocations to installments
- **Security Deposit**: Represents a security deposit held for a lease. Key attributes: lease, property, tenant, deposit amount, current held amount, status, movement history
- **Maintenance Ticket**: Represents a maintenance request or issue. Key attributes: property, lease, category, priority, status, description, photos, comments, cost, status history
- **Rental Document**: Represents an official rental document. Key attributes: document type (contract, receipt, quittance, statement), property, lease, generation date, file content

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Property owners can access their dashboard and view complete portfolio overview in under 3 seconds after login
- **SC-002**: Property owners can view all their properties and access property details in under 2 seconds per property
- **SC-003**: Property owners can view revenue summaries and analytics for any time period in under 2 seconds
- **SC-004**: Property owners can generate and download revenue or occupancy reports in under 10 seconds
- **SC-005**: Property owners can filter and view payment history for any date range in under 2 seconds
- **SC-006**: System supports property owners with up to 100 properties without performance degradation
- **SC-007**: Property owners can successfully download documents 100% of the time when documents exist
- **SC-008**: All data displayed to property owners is accurate and matches actual system data with 100% accuracy
- **SC-009**: Property owners can complete primary tasks (view dashboard, check revenue, view properties) on first attempt 95% of the time
- **SC-010**: System prevents property owners from accessing data for properties they don't own with 100% security enforcement
- **SC-011**: Property owners can view maintenance ticket details and history in under 2 seconds
- **SC-012**: Revenue analytics and charts render correctly and display accurate data for all time periods
