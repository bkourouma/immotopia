# Tasks: Owner Portal Module

**Input**: Design documents from `/specs/009-owner-portal/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are OPTIONAL - not explicitly requested in feature specification, so test tasks are not included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Backend**: `packages/api/src/`
- **Frontend**: `apps/web/src/`
- **Database**: `packages/api/prisma/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Create directory structure for owner portal module in packages/api/src/
- [X] T002 [P] Create directory structure for owner portal pages in apps/web/src/pages/OwnerPortal/
- [X] T003 [P] Create directory structure for owner portal components in apps/web/src/components/OwnerPortal/
- [X] T004 [P] Install backend dependencies: date-fns, pdf-lib, exceljs, csv-writer in packages/api/
- [X] T005 [P] Install frontend dependencies: recharts in apps/web/

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T006 Add ownerPortalEnabled and ownerPortalLastAccess fields to TenantClient model in packages/api/prisma/schema.prisma
- [X] T007 Run Prisma migration: npx prisma migrate dev --name add_owner_portal_fields (fields added via script, Prisma client regenerated)
- [X] T008 Create owner portal access middleware in packages/api/src/middleware/owner-portal-access.ts with PROPRIETAIRE role check
- [X] T009 Implement property ownership resolution in packages/api/src/middleware/owner-portal-access.ts (direct ownership via Property.ownerUserId)
- [X] T010 Implement property ownership resolution in packages/api/src/middleware/owner-portal-access.ts (lease ownership via RentalLease.ownerClient)
- [X] T011 Create owner portal types file in packages/api/src/types/owner-portal-types.ts with TypeScript interfaces
- [X] T012 Create owner portal validators file in packages/api/src/utils/owner-portal-validators.ts with Zod schemas for filters and date ranges
- [X] T013 Create owner portal service file in packages/api/src/services/owner-portal-service.ts (empty service class)
- [X] T014 Create owner portal controller file in packages/api/src/controllers/owner-portal-controller.ts (empty controller class)
- [X] T015 Create owner portal routes file in packages/api/src/routes/owner-portal-routes.ts with route definitions
- [X] T016 Register owner portal routes in packages/api/src/index.ts under /api/portal/owner
- [X] T017 Create owner portal API service in apps/web/src/services/ownerPortalService.ts with all API methods
- [X] T018 Create report generator utility file in packages/api/src/utils/report-generator.ts (empty utility functions)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Access Dashboard and View Property Portfolio Overview (Priority: P1) 🎯 MVP

**Goal**: Property owner can access portal dashboard and see comprehensive overview of property portfolio, revenue metrics, occupancy rate, upcoming payments, and recent activity

**Independent Test**: Login as property owner with multiple properties, access /owner dashboard, verify all metrics display correctly (portfolio summary, revenue KPIs, occupancy rate, upcoming installments, recent payments, recent tickets)

### Implementation for User Story 1

- [X] T019 [US1] Implement getDashboard method in packages/api/src/services/owner-portal-service.ts to calculate portfolio summary (total, rented, available, inMaintenance)
- [X] T020 [US1] Implement getDashboard method in packages/api/src/services/owner-portal-service.ts to calculate revenue metrics (current month, current year, last month, last year)
- [X] T021 [US1] Implement getDashboard method in packages/api/src/services/owner-portal-service.ts to calculate occupancy rate (rented/total * 100)
- [X] T022 [US1] Implement getDashboard method in packages/api/src/services/owner-portal-service.ts to get upcoming payments (next 5 installments with status DUE)
- [X] T023 [US1] Implement getDashboard method in packages/api/src/services/owner-portal-service.ts to get recent payments (last 5)
- [X] T024 [US1] Implement getDashboard method in packages/api/src/services/owner-portal-service.ts to get recent maintenance tickets (last 5)
- [X] T025 [US1] Implement getDashboard controller method in packages/api/src/controllers/owner-portal-controller.ts
- [X] T026 [US1] Create Dashboard page component in apps/web/src/pages/OwnerPortal/Dashboard.tsx
- [X] T027 [US1] Create StatCard reusable component in apps/web/src/components/OwnerPortal/StatCard.tsx
- [X] T028 [US1] Implement portfolio summary cards in apps/web/src/pages/OwnerPortal/Dashboard.tsx (total, rented, available, inMaintenance)
- [X] T029 [US1] Implement revenue KPI cards in apps/web/src/pages/OwnerPortal/Dashboard.tsx (current month, current year, comparisons)
- [X] T030 [US1] Implement occupancy rate card in apps/web/src/pages/OwnerPortal/Dashboard.tsx
- [X] T031 [US1] Implement upcoming payments section in apps/web/src/pages/OwnerPortal/Dashboard.tsx
- [X] T032 [US1] Implement recent activity section in apps/web/src/pages/OwnerPortal/Dashboard.tsx (recent payments and tickets)
- [X] T033 [US1] Create OwnerPortal Layout component in apps/web/src/pages/OwnerPortal/Layout.tsx with sidebar navigation
- [X] T034 [US1] Add owner portal routes to apps/web/src/App.tsx with Layout and Dashboard routes

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - View Property Portfolio and Property Details (Priority: P1)

**Goal**: Property owner can view all their properties in a list with filtering, and access detailed property information including current lease, lease history, revenue stats, and maintenance history

**Independent Test**: Access /owner/properties page, verify property list displays correctly, apply filters (status, type, transaction mode), access property details, verify all property information displays correctly

### Implementation for User Story 2

- [X] T035 [US2] Implement getProperties method in packages/api/src/services/owner-portal-service.ts with filtering by status, propertyType, transactionMode
- [X] T036 [US2] Implement getProperties method in packages/api/src/services/owner-portal-service.ts to calculate portfolio summary (total, available, rented, underMaintenance)
- [X] T037 [US2] Implement getPropertyDetails method in packages/api/src/services/owner-portal-service.ts to fetch complete property with media and documents
- [X] T038 [US2] Implement getPropertyDetails method in packages/api/src/services/owner-portal-service.ts to fetch current active lease
- [X] T039 [US2] Implement getPropertyDetails method in packages/api/src/services/owner-portal-service.ts to fetch lease history (ended leases)
- [X] T040 [US2] Implement getPropertyDetails method in packages/api/src/services/owner-portal-service.ts to calculate revenue statistics (total received, current month, average monthly)
- [X] T041 [US2] Implement getPropertyDetails method in packages/api/src/services/owner-portal-service.ts to fetch maintenance ticket history
- [X] T042 [US2] Implement getProperties controller method in packages/api/src/controllers/owner-portal-controller.ts
- [X] T043 [US2] Implement getPropertyDetails controller method in packages/api/src/controllers/owner-portal-controller.ts with property ownership validation
- [X] T044 [US2] Create Properties page component in apps/web/src/pages/OwnerPortal/Properties.tsx
- [X] T045 [US2] Create PropertyCard component in apps/web/src/components/OwnerPortal/PropertyCard.tsx
- [X] T046 [US2] Implement property list with filters in apps/web/src/pages/OwnerPortal/Properties.tsx (status, type, transaction mode)
- [X] T047 [US2] Create PropertyDetails page component in apps/web/src/pages/OwnerPortal/PropertyDetails.tsx
- [X] T048 [US2] Implement property information section in apps/web/src/pages/OwnerPortal/PropertyDetails.tsx
- [X] T049 [US2] Implement current lease section in apps/web/src/pages/OwnerPortal/PropertyDetails.tsx
- [X] T050 [US2] Implement lease history section in apps/web/src/pages/OwnerPortal/PropertyDetails.tsx
- [X] T051 [US2] Implement revenue statistics section in apps/web/src/pages/OwnerPortal/PropertyDetails.tsx
- [X] T052 [US2] Implement maintenance history section in apps/web/src/pages/OwnerPortal/PropertyDetails.tsx
- [X] T053 [US2] Add property routes to apps/web/src/App.tsx (properties list and property details)

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - View Active Leases and Lease Details (Priority: P1)

**Goal**: Property owner can view all active leases for their properties with filtering, and access detailed lease information including tenant details, payment history, installment schedule, balance, and security deposit

**Independent Test**: Access /owner/leases page, verify lease list displays correctly, apply filters (status, property), access lease details, verify all lease information displays correctly

### Implementation for User Story 3

- [X] T054 [US3] Implement getLeases method in packages/api/src/services/owner-portal-service.ts with filtering by status and propertyId
- [X] T055 [US3] Implement getLeases method in packages/api/src/services/owner-portal-service.ts to calculate lease summary (active, ended, suspended)
- [X] T056 [US3] Implement getLeaseDetails method in packages/api/src/services/owner-portal-service.ts to fetch complete lease with property and renters
- [X] T057 [US3] Implement getLeaseDetails method in packages/api/src/services/owner-portal-service.ts to fetch all renters (primary and co-renters)
- [X] T058 [US3] Implement getLeaseDetails method in packages/api/src/services/owner-portal-service.ts to fetch installment schedule
- [X] T059 [US3] Implement getLeaseDetails method in packages/api/src/services/owner-portal-service.ts to fetch payment history
- [X] T060 [US3] Implement getLeaseDetails method in packages/api/src/services/owner-portal-service.ts to calculate balance (total due, total paid, remaining)
- [X] T061 [US3] Implement getLeaseDetails method in packages/api/src/services/owner-portal-service.ts to fetch security deposit information
- [X] T062 [US3] Implement getLeases controller method in packages/api/src/controllers/owner-portal-controller.ts
- [X] T063 [US3] Implement getLeaseDetails controller method in packages/api/src/controllers/owner-portal-controller.ts with property ownership validation
- [X] T064 [US3] Create Leases page component in apps/web/src/pages/OwnerPortal/Leases.tsx
- [X] T065 [US3] Implement lease list with filters in apps/web/src/pages/OwnerPortal/Leases.tsx (status, property)
- [X] T066 [US3] Create LeaseDetails page component in apps/web/src/pages/OwnerPortal/LeaseDetails.tsx
- [X] T067 [US3] Implement lease information section in apps/web/src/pages/OwnerPortal/LeaseDetails.tsx
- [X] T068 [US3] Implement renters section in apps/web/src/pages/OwnerPortal/LeaseDetails.tsx (primary and co-renters)
- [X] T069 [US3] Implement installment schedule section in apps/web/src/pages/OwnerPortal/LeaseDetails.tsx
- [X] T070 [US3] Implement payment history section in apps/web/src/pages/OwnerPortal/LeaseDetails.tsx
- [X] T071 [US3] Implement balance section in apps/web/src/pages/OwnerPortal/LeaseDetails.tsx with overdue indicators
- [X] T072 [US3] Implement security deposit section in apps/web/src/pages/OwnerPortal/LeaseDetails.tsx
- [X] T073 [US3] Add lease routes to apps/web/src/App.tsx (leases list and lease details)

**Checkpoint**: At this point, User Stories 1, 2, AND 3 should all work independently

---

## Phase 6: User Story 4 - Track Rental Income and Revenue Analytics (Priority: P1)

**Goal**: Property owner can view rental income across different time periods, see revenue breakdown by property and by month, access revenue summaries, and analyze revenue trends with visual charts

**Independent Test**: Access /owner/revenues page, verify revenue summary displays correctly, view revenue by property, view revenue by month, verify charts render correctly with accurate data

### Implementation for User Story 4

- [X] T074 [US4] Implement getRevenues method in packages/api/src/services/owner-portal-service.ts with filtering by date range, property, and grouping
- [X] T075 [US4] Implement getRevenueSummary method in packages/api/src/services/owner-portal-service.ts to calculate current month, last month, current year, last year, all-time, average monthly
- [X] T076 [US4] Implement getRevenuesByProperty method in packages/api/src/services/owner-portal-service.ts to calculate revenue breakdown by property
- [X] T077 [US4] Implement getRevenuesByMonth method in packages/api/src/services/owner-portal-service.ts to calculate monthly revenue for a year
- [X] T078 [US4] Implement getRevenues controller method in packages/api/src/controllers/owner-portal-controller.ts
- [X] T079 [US4] Implement getRevenueSummary controller method in packages/api/src/controllers/owner-portal-controller.ts
- [X] T080 [US4] Implement getRevenuesByProperty controller method in packages/api/src/controllers/owner-portal-controller.ts
- [X] T081 [US4] Implement getRevenuesByMonth controller method in packages/api/src/controllers/owner-portal-controller.ts
- [X] T082 [US4] Create Revenues page component in apps/web/src/pages/OwnerPortal/Revenues.tsx
- [X] T083 [US4] Create RevenueChart component in apps/web/src/components/OwnerPortal/RevenueChart.tsx with Recharts line and bar charts
- [X] T084 [US4] Implement revenue summary cards in apps/web/src/pages/OwnerPortal/Revenues.tsx (current month, current year, all-time, average monthly)
- [X] T085 [US4] Implement revenue by month chart in apps/web/src/pages/OwnerPortal/Revenues.tsx (line chart)
- [X] T086 [US4] Implement revenue by property chart in apps/web/src/pages/OwnerPortal/Revenues.tsx (bar chart)
- [X] T087 [US4] Implement revenue by property table in apps/web/src/pages/OwnerPortal/Revenues.tsx with property details and revenue metrics
- [X] T088 [US4] Implement date range filter in apps/web/src/pages/OwnerPortal/Revenues.tsx
- [X] T089 [US4] Implement year selector for monthly revenue view in apps/web/src/pages/OwnerPortal/Revenues.tsx
- [X] T090 [US4] Add revenues route to apps/web/src/App.tsx

**Checkpoint**: At this point, User Stories 1, 2, 3, AND 4 should all work independently

---

## Phase 7: User Story 5 - Monitor Payment Status and Installment Tracking (Priority: P2)

**Goal**: Property owner can view all payment installments for their properties, see installment status, filter installments, and track upcoming and overdue payments

**Independent Test**: Access /owner/installments page, verify installment list displays correctly, apply filters (status, property, date range), verify installment summary shows correct counts and amounts

### Implementation for User Story 5

- [X] T091 [US5] Implement getInstallments method in packages/api/src/services/owner-portal-service.ts with filtering by status, propertyId, date range
- [X] T092 [US5] Implement getInstallments method in packages/api/src/services/owner-portal-service.ts to calculate installment summary (total, due, overdue, paid, totalAmount, dueAmount)
- [X] T093 [US5] Implement getInstallments controller method in packages/api/src/controllers/owner-portal-controller.ts
- [X] T094 [US5] Create Installments page component in apps/web/src/pages/OwnerPortal/Installments.tsx
- [X] T095 [US5] Implement installment list with filters in apps/web/src/pages/OwnerPortal/Installments.tsx (status, property, date range)
- [X] T096 [US5] Implement installment summary cards in apps/web/src/pages/OwnerPortal/Installments.tsx (total, due, overdue, paid counts and amounts)
- [X] T097 [US5] Implement installment table in apps/web/src/pages/OwnerPortal/Installments.tsx with property, tenant, period, due date, amount, status
- [X] T098 [US5] Add installments route to apps/web/src/App.tsx

**Checkpoint**: At this point, User Stories 1-5 should all work independently

---

## Phase 8: User Story 6 - View Payment History and Payment Details (Priority: P2)

**Goal**: Property owner can view all rental payments received, see payment details, filter payments, and access detailed payment information including allocations to installments

**Independent Test**: Access /owner/payments page, verify payment history displays correctly, apply filters (date range, property, method), access payment details, verify payment allocations display correctly

### Implementation for User Story 6

- [X] T099 [US6] Implement getPayments method in packages/api/src/services/owner-portal-service.ts with filtering by date range, propertyId, method
- [X] T100 [US6] Implement getPayments method in packages/api/src/services/owner-portal-service.ts to calculate payment summary (total, totalAmount, thisMonth, thisYear)
- [X] T101 [US6] Implement getPaymentDetails method in packages/api/src/services/owner-portal-service.ts to fetch complete payment with allocations
- [X] T102 [US6] Implement getPayments controller method in packages/api/src/controllers/owner-portal-controller.ts
- [X] T103 [US6] Implement getPaymentDetails controller method in packages/api/src/controllers/owner-portal-controller.ts with property ownership validation
- [X] T104 [US6] Create Payments page component in apps/web/src/pages/OwnerPortal/Payments.tsx
- [X] T105 [US6] Create PaymentDetailsModal component in apps/web/src/components/OwnerPortal/PaymentDetailsModal.tsx
- [X] T106 [US6] Implement payment history table with filters in apps/web/src/pages/OwnerPortal/Payments.tsx (date range, property, method)
- [X] T107 [US6] Implement payment summary cards in apps/web/src/pages/OwnerPortal/Payments.tsx (total, totalAmount, thisMonth, thisYear)
- [X] T108 [US6] Implement payment details modal in apps/web/src/components/OwnerPortal/PaymentDetailsModal.tsx with payment info and allocations
- [X] T109 [US6] Add payments route to apps/web/src/App.tsx

**Checkpoint**: At this point, User Stories 1-6 should all work independently

---

## Phase 9: User Story 7 - Monitor Security Deposits (Priority: P2)

**Goal**: Property owner can view all security deposits for their properties, see deposit status, track deposit movements, and view deposit balances

**Independent Test**: Access /owner/deposits page, verify deposit list displays correctly, access deposit movements, verify movement history displays correctly with types, dates, and amounts

### Implementation for User Story 7

- [X] T110 [US7] Implement getDeposits method in packages/api/src/services/owner-portal-service.ts to fetch all deposits for owner's properties
- [X] T111 [US7] Implement getDeposits method in packages/api/src/services/owner-portal-service.ts to calculate deposit summary (total, totalHeld, totalReleased)
- [X] T112 [US7] Implement getDepositMovements method in packages/api/src/services/owner-portal-service.ts to fetch deposit movement history
- [X] T113 [US7] Implement getDeposits controller method in packages/api/src/controllers/owner-portal-controller.ts
- [X] T114 [US7] Implement getDepositMovements controller method in packages/api/src/controllers/owner-portal-controller.ts with property ownership validation
- [X] T115 [US7] Create Deposits page component in apps/web/src/pages/OwnerPortal/Deposits.tsx
- [X] T116 [US7] Implement deposit list in apps/web/src/pages/OwnerPortal/Deposits.tsx with property, tenant, deposit amount, current held amount, status
- [X] T117 [US7] Implement deposit summary cards in apps/web/src/pages/OwnerPortal/Deposits.tsx (total, totalHeld, totalReleased)
- [X] T118 [US7] Implement deposit movements view in apps/web/src/pages/OwnerPortal/Deposits.tsx with chronological movement history
- [X] T119 [US7] Add deposits route to apps/web/src/App.tsx

**Checkpoint**: At this point, User Stories 1-7 should all work independently

---

## Phase 10: User Story 8 - Track Maintenance Requests and Issues (Priority: P2)

**Goal**: Property owner can view all maintenance tickets for their properties, see ticket status, filter tickets, and access detailed ticket information including descriptions, photos, comments, and costs

**Independent Test**: Access /owner/maintenance page, verify ticket list displays correctly, apply filters (status, property, category, priority), access ticket details, verify all ticket information displays correctly

### Implementation for User Story 8

- [X] T120 [US8] Implement getMaintenanceTickets method in packages/api/src/services/owner-portal-service.ts with filtering by status, propertyId, category, priority
- [X] T121 [US8] Implement getMaintenanceTickets method in packages/api/src/services/owner-portal-service.ts to calculate ticket summary (total, open, inProgress, resolved, totalCost)
- [X] T122 [US8] Implement getMaintenanceTicketDetails method in packages/api/src/services/owner-portal-service.ts to fetch complete ticket with attachments, comments, status history
- [X] T123 [US8] Implement getMaintenanceTickets controller method in packages/api/src/controllers/owner-portal-controller.ts
- [X] T124 [US8] Implement getMaintenanceTicketDetails controller method in packages/api/src/controllers/owner-portal-controller.ts with property ownership validation
- [X] T125 [US8] Create Maintenance page component in apps/web/src/pages/OwnerPortal/Maintenance.tsx
- [X] T126 [US8] Implement maintenance ticket list with filters in apps/web/src/pages/OwnerPortal/Maintenance.tsx (status, property, category, priority)
- [X] T127 [US8] Implement maintenance ticket summary cards in apps/web/src/pages/OwnerPortal/Maintenance.tsx (total, open, inProgress, resolved, totalCost)
- [X] T128 [US8] Implement maintenance ticket details view in apps/web/src/pages/OwnerPortal/Maintenance.tsx with description, photos, comments, status history, costs
- [X] T129 [US8] Add maintenance route to apps/web/src/App.tsx

**Checkpoint**: At this point, User Stories 1-8 should all work independently

---

## Phase 11: User Story 9 - Access and Download Rental Documents (Priority: P2)

**Goal**: Property owner can access all rental-related documents organized by type, filter documents, and download documents as files

**Independent Test**: Access /owner/documents page, verify documents are grouped by type, apply filters (document type, property, lease), download a document, verify file downloads successfully

### Implementation for User Story 9

- [X] T130 [US9] Implement getDocuments method in packages/api/src/services/owner-portal-service.ts with filtering by documentType, propertyId, leaseId
- [X] T131 [US9] Implement getDocuments method in packages/api/src/services/owner-portal-service.ts to group documents by type
- [X] T132 [US9] Implement downloadDocument method in packages/api/src/services/owner-portal-service.ts to fetch and return document file
- [X] T133 [US9] Implement getDocuments controller method in packages/api/src/controllers/owner-portal-controller.ts
- [X] T134 [US9] Implement downloadDocument controller method in packages/api/src/controllers/owner-portal-controller.ts with property ownership validation
- [X] T135 [US9] Create Documents page component in apps/web/src/pages/OwnerPortal/Documents.tsx
- [X] T136 [US9] Implement documents list grouped by type in apps/web/src/pages/OwnerPortal/Documents.tsx
- [X] T137 [US9] Implement document filters in apps/web/src/pages/OwnerPortal/Documents.tsx (document type, property, lease)
- [X] T138 [US9] Implement document download functionality in apps/web/src/pages/OwnerPortal/Documents.tsx
- [X] T139 [US9] Add documents route to apps/web/src/App.tsx

**Checkpoint**: At this point, User Stories 1-9 should all work independently

---

## Phase 12: User Story 10 - Generate Revenue and Occupancy Reports (Priority: P3)

**Goal**: Property owner can generate revenue reports and occupancy reports for specific time periods, and download reports in PDF, CSV, or Excel formats

**Independent Test**: Access /owner/reports page, generate revenue report with date range, verify report generates correctly, download report in PDF format, verify file downloads successfully. Repeat for occupancy report and other formats.

### Implementation for User Story 10

- [X] T140 [US10] Implement generateRevenueReport method in packages/api/src/utils/report-generator.ts for PDF format using pdf-lib
- [X] T141 [US10] Implement generateRevenueReport method in packages/api/src/utils/report-generator.ts for CSV format using csv-writer
- [X] T142 [US10] Implement generateRevenueReport method in packages/api/src/utils/report-generator.ts for Excel format using exceljs
- [X] T143 [US10] Implement generateOccupancyReport method in packages/api/src/utils/report-generator.ts for PDF format
- [X] T144 [US10] Implement generateOccupancyReport method in packages/api/src/utils/report-generator.ts for CSV format
- [X] T145 [US10] Implement generateOccupancyReport method in packages/api/src/utils/report-generator.ts for Excel format
- [X] T146 [US10] Implement exportData method in packages/api/src/utils/report-generator.ts for payments/installments/leases data export
- [X] T147 [US10] Implement generateRevenueReport controller method in packages/api/src/controllers/owner-portal-controller.ts
- [X] T148 [US10] Implement generateOccupancyReport controller method in packages/api/src/controllers/owner-portal-controller.ts
- [X] T149 [US10] Implement exportData controller method in packages/api/src/controllers/owner-portal-controller.ts
- [X] T150 [US10] Create Reports page component in apps/web/src/pages/OwnerPortal/Reports.tsx
- [X] T151 [US10] Create ReportGenerator component in apps/web/src/components/OwnerPortal/ReportGenerator.tsx
- [X] T152 [US10] Implement revenue report generation interface in apps/web/src/pages/OwnerPortal/Reports.tsx with date range and format selection
- [X] T153 [US10] Implement occupancy report generation interface in apps/web/src/pages/OwnerPortal/Reports.tsx with format selection
- [X] T154 [US10] Implement report download functionality in apps/web/src/pages/OwnerPortal/Reports.tsx
- [X] T155 [US10] Add reports route to apps/web/src/App.tsx

**Checkpoint**: At this point, all User Stories 1-10 should work independently

---

## Phase 13: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T156 [P] Add error handling and empty states for all pages when no data exists
- [X] T157 [P] Implement pagination for large data sets (properties, leases, payments, installments) in all list views
- [X] T158 [P] Add loading states and skeletons for all async operations
- [X] T159 [P] Implement responsive design for mobile devices across all pages
- [X] T160 [P] Add French translations for all UI text (labels, messages, errors) per Constitution requirement
- [X] T161 [P] Optimize dashboard queries for performance (caching, efficient aggregations)
- [X] T162 [P] Add data refresh functionality for real-time updates
- [X] T163 [P] Implement proper error boundaries in React components
- [X] T164 [P] Add accessibility features (ARIA labels, keyboard navigation)
- [X] T165 [P] Run quickstart.md validation to ensure all implementation steps are complete
- [X] T166 [P] Code cleanup and refactoring across all components
- [X] T167 [P] Performance optimization (lazy loading, code splitting, memoization)
- [X] T168 [P] Security audit: verify all property ownership validations are in place
- [X] T169 [P] Documentation updates: API documentation, component documentation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-12)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Phase 13)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 3 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 4 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 5 (P2)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 6 (P2)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 7 (P2)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 8 (P2)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 9 (P2)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 10 (P3)**: Can start after Foundational (Phase 2) - No dependencies on other stories

### Within Each User Story

- Service methods before controller methods
- Controller methods before routes
- Backend implementation before frontend implementation
- Core functionality before UI polish
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- Backend and frontend tasks within a story can run in parallel (different files)
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 1

```bash
# Backend and frontend can be developed in parallel:
Task: "Implement getDashboard method in packages/api/src/services/owner-portal-service.ts"
Task: "Create Dashboard page component in apps/web/src/pages/OwnerPortal/Dashboard.tsx"

# Multiple service methods can be implemented in parallel:
Task: "Implement getDashboard method to calculate portfolio summary"
Task: "Implement getDashboard method to calculate revenue metrics"
Task: "Implement getDashboard method to calculate occupancy rate"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (Dashboard)
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Add User Story 4 → Test independently → Deploy/Demo
6. Add User Stories 5-9 (P2) → Test independently → Deploy/Demo
7. Add User Story 10 (P3) → Test independently → Deploy/Demo
8. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (Dashboard)
   - Developer B: User Story 2 (Properties)
   - Developer C: User Story 3 (Leases)
   - Developer D: User Story 4 (Revenues)
3. Stories complete and integrate independently
4. Continue with P2 and P3 stories in parallel

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- All UI text must be in French (Constitution Principle I)
- Property ownership validation must be enforced at all layers (middleware, service, controller)
- Revenue calculations must use Prisma aggregations for efficiency
- Report generation must support PDF, CSV, and Excel formats
- Charts must use Recharts library for visualization
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence

---

## Summary

- **Total Tasks**: 169 tasks
- **Setup Tasks**: 5 tasks (Phase 1)
- **Foundational Tasks**: 13 tasks (Phase 2)
- **User Story Tasks**: 141 tasks (Phases 3-12, 10 user stories)
- **Polish Tasks**: 14 tasks (Phase 13)
- **MVP Scope**: Phases 1-3 (User Story 1 - Dashboard)
- **Independent Test Criteria**: Each user story has clear independent test criteria
- **Parallel Opportunities**: Multiple parallel execution paths identified
