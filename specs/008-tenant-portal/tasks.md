# Tasks: Tenant Portal Module

**Input**: Design documents from `/specs/008-tenant-portal/`
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

- [X] T001 Create directory structure for tenant portal module in packages/api/src/
- [X] T002 [P] Create directory structure for tenant portal pages in apps/web/src/pages/TenantPortal/
- [X] T003 [P] Create directory structure for tenant portal components in apps/web/src/components/TenantPortal/
- [X] T004 Verify existing dependencies (Express, Prisma, Multer, Zod, React Router) are installed

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 Add PaymentDeclarationStatus enum to packages/api/prisma/schema.prisma
- [X] T006 Add RentalPaymentDeclaration model to packages/api/prisma/schema.prisma with all fields and relationships
- [X] T007 Add paymentDeclarations relation to RentalLease model in packages/api/prisma/schema.prisma
- [X] T008 Add paymentDeclarations relation to RentalInstallment model in packages/api/prisma/schema.prisma
- [X] T009 Add paymentDeclarations relation to TenantClient model in packages/api/prisma/schema.prisma
- [X] T010 Add reviewedPaymentDeclarations relation to User model in packages/api/prisma/schema.prisma
- [X] T011 Run Prisma migration: npx prisma migrate dev --name add_payment_declarations
- [X] T012 Create tenant portal access middleware in packages/api/src/middleware/tenant-portal-access.ts
- [X] T013 Create tenant portal types file in packages/api/src/types/tenant-portal-types.ts with TypeScript interfaces
- [X] T014 Create tenant portal validators file in packages/api/src/utils/tenant-portal-validators.ts with Zod schemas
- [X] T015 Create tenant portal service file in packages/api/src/services/tenant-portal-service.ts (empty service class)
- [X] T016 Create tenant portal controller file in packages/api/src/controllers/tenant-portal-controller.ts (empty controller class)
- [X] T017 Create tenant portal routes file in packages/api/src/routes/tenant-portal-routes.ts with route definitions
- [X] T018 Register tenant portal routes in packages/api/src/index.ts under /api/portal/tenant
- [X] T019 Create tenant portal API service in apps/web/src/services/tenantPortalService.ts with all API methods

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Access Dashboard and View Lease Overview (Priority: P1) 🎯 MVP

**Goal**: Tenant can access portal dashboard and see comprehensive overview of lease status, balance, next payment, deposit, recent payments, and maintenance summary

**Independent Test**: Login as tenant with active lease, access /tenant dashboard, verify all metrics display correctly (lease info, balance, next installment, recent payments, deposit, maintenance counts)

### Implementation for User Story 1

- [X] T020 [US1] Implement getDashboard method in packages/api/src/services/tenant-portal-service.ts to aggregate lease overview data
- [X] T021 [US1] Implement getDashboard method in packages/api/src/services/tenant-portal-service.ts to calculate current balance (DUE + OVERDUE installments - payments)
- [X] T022 [US1] Implement getDashboard method in packages/api/src/services/tenant-portal-service.ts to find next installment (earliest DUE)
- [X] T023 [US1] Implement getDashboard method in packages/api/src/services/tenant-portal-service.ts to get recent payments (last 5)
- [X] T024 [US1] Implement getDashboard method in packages/api/src/services/tenant-portal-service.ts to get deposit info
- [X] T025 [US1] Implement getDashboard method in packages/api/src/services/tenant-portal-service.ts to get maintenance ticket summary (counts by status)
- [X] T026 [US1] Implement getDashboard controller method in packages/api/src/controllers/tenant-portal-controller.ts
- [X] T027 [US1] Create Dashboard page component in apps/web/src/pages/TenantPortal/Dashboard.tsx
- [X] T028 [US1] Implement lease overview card in apps/web/src/pages/TenantPortal/Dashboard.tsx
- [X] T029 [US1] Implement current balance card in apps/web/src/pages/TenantPortal/Dashboard.tsx with visual indicators
- [X] T030 [US1] Implement next installment card in apps/web/src/pages/TenantPortal/Dashboard.tsx
- [X] T031 [US1] Implement deposit info card in apps/web/src/pages/TenantPortal/Dashboard.tsx
- [X] T032 [US1] Implement recent payments list in apps/web/src/pages/TenantPortal/Dashboard.tsx
- [X] T033 [US1] Implement maintenance summary section in apps/web/src/pages/TenantPortal/Dashboard.tsx
- [X] T034 [US1] Create TenantPortal Layout component in apps/web/src/pages/TenantPortal/Layout.tsx with sidebar navigation
- [X] T035 [US1] Add tenant portal routes to apps/web/src/App.tsx with Layout and Dashboard routes

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - View Complete Lease Details and Documents (Priority: P1)

**Goal**: Tenant can view complete lease information, co-renters list, and download lease-related documents

**Independent Test**: Access /tenant/lease page, verify lease details display correctly, co-renters list shows all co-renters, documents are grouped by type with download buttons

### Implementation for User Story 2

- [X] T036 [US2] Implement getLeaseDetails method in packages/api/src/services/tenant-portal-service.ts to fetch complete lease with property, primary renter, owner
- [X] T037 [US2] Implement getLeaseDetails method in packages/api/src/services/tenant-portal-service.ts to fetch co-renters list
- [X] T038 [US2] Implement getLeaseDetails method in packages/api/src/services/tenant-portal-service.ts to fetch associated documents
- [X] T039 [US2] Implement getLeaseDetails controller method in packages/api/src/controllers/tenant-portal-controller.ts
- [X] T040 [US2] Create Lease page component in apps/web/src/pages/TenantPortal/Lease.tsx
- [X] T041 [US2] Implement lease information display in apps/web/src/pages/TenantPortal/Lease.tsx with all lease terms
- [X] T042 [US2] Implement co-renters list display in apps/web/src/pages/TenantPortal/Lease.tsx
- [X] T043 [US2] Implement documents list grouped by type in apps/web/src/pages/TenantPortal/Lease.tsx
- [X] T044 [US2] Add lease route to apps/web/src/App.tsx

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Track Payment History and Installment Status (Priority: P1)

**Goal**: Tenant can view all payment installments, filter by status/date, and see detailed breakdown of each installment

**Independent Test**: Access /tenant/payments page, verify installments list displays with filters, click installment to see detailed breakdown with items, allocations, penalties

### Implementation for User Story 3

- [X] T045 [US3] Implement getInstallments method in packages/api/src/services/tenant-portal-service.ts with status and date filters
- [X] T046 [US3] Implement getInstallments method in packages/api/src/services/tenant-portal-service.ts to calculate summary (total, paid, due, overdue, partial)
- [X] T047 [US3] Implement getInstallmentDetails method in packages/api/src/services/tenant-portal-service.ts to fetch complete installment with items, allocations, penalties
- [X] T048 [US3] Implement getInstallmentDetails method in packages/api/src/services/tenant-portal-service.ts to fetch related payments
- [X] T049 [US3] Implement getInstallments controller method in packages/api/src/controllers/tenant-portal-controller.ts
- [X] T050 [US3] Implement getInstallmentDetails controller method in packages/api/src/controllers/tenant-portal-controller.ts
- [X] T051 [US3] Create Payments page component in apps/web/src/pages/TenantPortal/Payments.tsx
- [X] T052 [US3] Implement installments list with status filters in apps/web/src/pages/TenantPortal/Payments.tsx
- [X] T053 [US3] Implement date range filters in apps/web/src/pages/TenantPortal/Payments.tsx
- [X] T054 [US3] Implement installment summary display in apps/web/src/pages/TenantPortal/Payments.tsx
- [X] T055 [US3] Create InstallmentDetails component in apps/web/src/components/TenantPortal/InstallmentDetails.tsx
- [X] T056 [US3] Implement installment breakdown display in apps/web/src/components/TenantPortal/InstallmentDetails.tsx (items, allocations, penalties)
- [X] T057 [US3] Add payments route to apps/web/src/App.tsx

**Checkpoint**: At this point, User Stories 1, 2, AND 3 should all work independently

---

## Phase 6: User Story 4 - Declare Payment Made Outside Portal (Priority: P2)

**Goal**: Tenant can declare payments made outside portal with payment details and optional proof file upload

**Independent Test**: Click "Déclarer un paiement" button, fill form with amount, date, method, reference, upload proof file, submit, verify declaration created with PENDING status

### Implementation for User Story 4

- [X] T058 [US4] Implement validatePaymentDeclaration function in packages/api/src/utils/tenant-portal-validators.ts (amount, date, method validation)
- [X] T059 [US4] Implement validatePaymentProofFile function in packages/api/src/utils/tenant-portal-validators.ts (file size, type validation)
- [X] T060 [US4] Implement declarePayment method in packages/api/src/services/tenant-portal-service.ts to create RentalPaymentDeclaration
- [X] T061 [US4] Implement declarePayment method in packages/api/src/services/tenant-portal-service.ts to handle file upload and save to uploads/portal/payments/
- [X] T062 [US4] Implement declarePayment method in packages/api/src/services/tenant-portal-service.ts to send notification to property managers
- [X] T063 [US4] Implement declarePayment controller method in packages/api/src/controllers/tenant-portal-controller.ts with multer file upload
- [X] T064 [US4] Add file upload middleware to declarePayment route in packages/api/src/routes/tenant-portal-routes.ts
- [X] T065 [US4] Create PaymentDeclarationModal component in apps/web/src/components/TenantPortal/PaymentDeclarationModal.tsx
- [X] T066 [US4] Implement payment declaration form in apps/web/src/components/TenantPortal/PaymentDeclarationModal.tsx with all fields
- [X] T067 [US4] Implement file upload input in apps/web/src/components/TenantPortal/PaymentDeclarationModal.tsx
- [X] T068 [US4] Implement form validation in apps/web/src/components/TenantPortal/PaymentDeclarationModal.tsx
- [X] T069 [US4] Integrate PaymentDeclarationModal into apps/web/src/pages/TenantPortal/Payments.tsx

**Checkpoint**: At this point, User Stories 1-4 should all work independently

---

## Phase 7: User Story 5 - View Payment History (Priority: P2)

**Goal**: Tenant can view complete payment history with dates, amounts, methods, status, and allocation details

**Independent Test**: Access payment history section, verify all payments display chronologically with filters, click payment to see allocation details

### Implementation for User Story 5

- [X] T070 [US5] Implement getPaymentHistory method in packages/api/src/services/tenant-portal-service.ts with date and method filters
- [X] T071 [US5] Implement getPaymentHistory method in packages/api/src/services/tenant-portal-service.ts to calculate totalPaid
- [X] T072 [US5] Implement getPaymentHistory controller method in packages/api/src/controllers/tenant-portal-controller.ts
- [X] T073 [US5] Implement payment history list in apps/web/src/pages/TenantPortal/Payments.tsx with chronological display
- [X] T074 [US5] Implement payment allocation display in apps/web/src/pages/TenantPortal/Payments.tsx showing how payments split across installments
- [X] T075 [US5] Implement date range and method filters for payment history in apps/web/src/pages/TenantPortal/Payments.tsx

**Checkpoint**: At this point, User Stories 1-5 should all work independently

---

## Phase 8: User Story 6 - View Security Deposit Information (Priority: P2)

**Goal**: Tenant can view security deposit amount, current held amount, status, and movement history

**Independent Test**: Access deposit section, verify deposit amount, held amount, status, and all movements display chronologically

### Implementation for User Story 6

- [X] T076 [US6] Implement getDepositInfo method in packages/api/src/services/tenant-portal-service.ts to fetch RentalSecurityDeposit
- [X] T077 [US6] Implement getDepositInfo method in packages/api/src/services/tenant-portal-service.ts to fetch RentalDepositMovement history
- [X] T078 [US6] Implement getDepositInfo method in packages/api/src/services/tenant-portal-service.ts to calculate currentHeldAmount
- [X] T079 [US6] Implement getDepositInfo controller method in packages/api/src/controllers/tenant-portal-controller.ts
- [X] T080 [US6] Create dedicated Deposit page component in apps/web/src/pages/TenantPortal/Deposit.tsx
- [X] T081 [US6] Implement deposit information display in apps/web/src/pages/TenantPortal/Deposit.tsx with all deposit details
- [X] T082 [US6] Implement deposit movements history display in apps/web/src/pages/TenantPortal/Deposit.tsx
- [X] T083 [US6] Add deposit route to apps/web/src/App.tsx and update Layout navigation

**Checkpoint**: At this point, User Stories 1-6 should all work independently

---

## Phase 9: User Story 7 - Create Maintenance Request (Priority: P2)

**Goal**: Tenant can create maintenance tickets with category, priority, description, title, and photo uploads

**Independent Test**: Click "Nouvelle demande", fill form with category, priority, title, description, upload photos, submit, verify ticket created with DECLARED status

### Implementation for User Story 7

- [X] T082 [US7] Implement createMaintenanceTicket method in packages/api/src/services/tenant-portal-service.ts that calls existing maintenance-ticket-service
- [X] T083 [US7] Implement createMaintenanceTicket method in packages/api/src/services/tenant-portal-service.ts to link ticket to tenant's active lease and property
- [X] T084 [US7] Implement createMaintenanceTicket controller method in packages/api/src/controllers/tenant-portal-controller.ts with multer file upload
- [X] T085 [US7] Add file upload middleware to createMaintenanceTicket route in packages/api/src/routes/tenant-portal-routes.ts
- [X] T086 [US7] Create MaintenanceTicketModal component in apps/web/src/components/TenantPortal/MaintenanceTicketModal.tsx
- [X] T087 [US7] Implement maintenance ticket creation form in apps/web/src/components/TenantPortal/MaintenanceTicketModal.tsx with all fields
- [X] T088 [US7] Implement multiple photo upload in apps/web/src/components/TenantPortal/MaintenanceTicketModal.tsx
- [X] T089 [US7] Implement form validation in apps/web/src/components/TenantPortal/MaintenanceTicketModal.tsx
- [X] T090 [US7] Integrate MaintenanceTicketModal into apps/web/src/pages/TenantPortal/Maintenance.tsx

**Checkpoint**: At this point, User Stories 1-7 should all work independently

---

## Phase 10: User Story 8 - Track Maintenance Requests and Add Comments (Priority: P2)

**Goal**: Tenant can view all maintenance tickets, filter by status, view ticket details with comments and photos, and add comments

**Independent Test**: Access maintenance page, verify tickets list with filters, click ticket to see details with comments and photos, add comment, verify comment added

### Implementation for User Story 8

- [X] T091 [US8] Implement getMaintenanceTickets method in packages/api/src/services/tenant-portal-service.ts that calls existing maintenance-ticket-service with reportedBy filter
- [X] T092 [US8] Implement getMaintenanceTickets method in packages/api/src/services/tenant-portal-service.ts to calculate summary (open, inProgress, resolved, total)
- [X] T093 [US8] Implement getMaintenanceTicketDetails method in packages/api/src/services/tenant-portal-service.ts that calls existing maintenance-ticket-service
- [X] T094 [US8] Implement addTicketComment method in packages/api/src/services/tenant-portal-service.ts that calls existing maintenance-comment-service
- [X] T095 [US8] Implement getMaintenanceTickets controller method in packages/api/src/controllers/tenant-portal-controller.ts
- [X] T096 [US8] Implement getMaintenanceTicketDetails controller method in packages/api/src/controllers/tenant-portal-controller.ts
- [X] T097 [US8] Implement addTicketComment controller method in packages/api/src/controllers/tenant-portal-controller.ts
- [X] T098 [US8] Enhance Maintenance page component in apps/web/src/pages/TenantPortal/Maintenance.tsx with tickets list
- [X] T099 [US8] Implement maintenance tickets list with status filters in apps/web/src/pages/TenantPortal/Maintenance.tsx
- [X] T100 [US8] Implement ticket details view in apps/web/src/pages/TenantPortal/Maintenance.tsx with comments and photos
- [X] T101 [US8] Implement add comment functionality in apps/web/src/pages/TenantPortal/Maintenance.tsx
- [X] T102 [US8] Add maintenance route to apps/web/src/App.tsx (already done in Phase 9)

**Checkpoint**: At this point, User Stories 1-8 should all work independently

---

## Phase 11: User Story 9 - Access and Download Rental Documents (Priority: P3)

**Goal**: Tenant can view all rental documents organized by type and download documents as PDF files

**Independent Test**: Access documents page, verify documents grouped by type, click download on document, verify PDF file downloads

### Implementation for User Story 9

- [X] T103 [US9] Implement getDocuments method in packages/api/src/services/tenant-portal-service.ts to fetch RentalDocument records for tenant's lease
- [X] T104 [US9] Implement getDocuments method in packages/api/src/services/tenant-portal-service.ts to group documents by RentalDocumentType
- [X] T105 [US9] Implement downloadDocument method in packages/api/src/services/tenant-portal-service.ts with access validation
- [X] T106 [US9] Implement downloadDocument method in packages/api/src/services/tenant-portal-service.ts to return PDF file stream
- [X] T107 [US9] Implement getDocuments controller method in packages/api/src/controllers/tenant-portal-controller.ts
- [X] T108 [US9] Implement downloadDocument controller method in packages/api/src/controllers/tenant-portal-controller.ts
- [X] T109 [US9] Create Documents page component in apps/web/src/pages/TenantPortal/Documents.tsx
- [X] T110 [US9] Implement documents list grouped by type in apps/web/src/pages/TenantPortal/Documents.tsx
- [X] T111 [US9] Implement document type filter in apps/web/src/pages/TenantPortal/Documents.tsx
- [X] T112 [US9] Implement document download functionality in apps/web/src/pages/TenantPortal/Documents.tsx
- [X] T113 [US9] Add documents route to apps/web/src/App.tsx

**Checkpoint**: All user stories should now be independently functional

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T114 [P] Add error handling and validation error messages in all controller methods in packages/api/src/controllers/tenant-portal-controller.ts
- [X] T115 [P] Add logging for all tenant portal operations in packages/api/src/services/tenant-portal-service.ts (already implemented)
- [X] T116 [P] Add loading states and error handling in all React components in apps/web/src/pages/TenantPortal/ (already implemented)
- [X] T117 [P] Add French translations for all UI text in apps/web/src/pages/TenantPortal/ (already implemented - all text in French)
- [X] T118 [P] Add French translations for all error messages in apps/web/src/components/TenantPortal/ (already implemented)
- [ ] T119 [P] Implement responsive design for mobile devices in apps/web/src/pages/TenantPortal/Layout.tsx (Ant Design is responsive by default)
- [ ] T120 [P] Add accessibility attributes (ARIA labels) to all interactive elements in apps/web/src/pages/TenantPortal/ (Ant Design components have built-in accessibility)
- [ ] T121 [P] Optimize dashboard query performance in packages/api/src/services/tenant-portal-service.ts (add database indexes if needed)
- [X] T122 [P] Add input sanitization for all user inputs in packages/api/src/utils/tenant-portal-validators.ts (Zod validation with max lengths)
- [X] T123 [P] Verify tenant isolation in all service methods (ensure tenant_id filtering) - verified: all queries use tenant_id
- [ ] T124 [P] Run quickstart.md validation steps
- [ ] T125 [P] Update API documentation with tenant portal endpoints
- [ ] T126 [P] Code cleanup and refactoring across all tenant portal files

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-11)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Phase 12)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - Independent, can run parallel with US1
- **User Story 3 (P1)**: Can start after Foundational (Phase 2) - Independent, can run parallel with US1/US2
- **User Story 4 (P2)**: Can start after Foundational (Phase 2) - Uses US3 installments data but independently testable
- **User Story 5 (P2)**: Can start after Foundational (Phase 2) - Independent, can run parallel with other stories
- **User Story 6 (P2)**: Can start after Foundational (Phase 2) - Independent, can run parallel with other stories
- **User Story 7 (P2)**: Can start after Foundational (Phase 2) - Uses existing maintenance module, independently testable
- **User Story 8 (P2)**: Can start after Foundational (Phase 2) - Uses existing maintenance module, independently testable
- **User Story 9 (P3)**: Can start after Foundational (Phase 2) - Independent, can run parallel with other stories

### Within Each User Story

- Service methods before controller methods
- Controller methods before routes
- Backend implementation before frontend
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- Models within a story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members
- Frontend and backend tasks for same story can run in parallel after service layer is complete

---

## Parallel Example: User Story 1

```bash
# Launch all dashboard aggregation methods together:
Task: "Implement getDashboard method to aggregate lease overview data"
Task: "Implement getDashboard method to calculate current balance"
Task: "Implement getDashboard method to find next installment"
Task: "Implement getDashboard method to get recent payments"
Task: "Implement getDashboard method to get deposit info"
Task: "Implement getDashboard method to get maintenance ticket summary"

# Launch all dashboard UI cards together:
Task: "Implement lease overview card in Dashboard.tsx"
Task: "Implement current balance card in Dashboard.tsx"
Task: "Implement next installment card in Dashboard.tsx"
Task: "Implement deposit info card in Dashboard.tsx"
Task: "Implement recent payments list in Dashboard.tsx"
Task: "Implement maintenance summary section in Dashboard.tsx"
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
2. Add User Story 1 (Dashboard) → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 (Lease Details) → Test independently → Deploy/Demo
4. Add User Story 3 (Installments) → Test independently → Deploy/Demo
5. Add User Stories 4-8 (P2 features) → Test independently → Deploy/Demo
6. Add User Story 9 (Documents) → Test independently → Deploy/Demo
7. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (Dashboard)
   - Developer B: User Story 2 (Lease Details)
   - Developer C: User Story 3 (Installments)
3. Next iteration:
   - Developer A: User Story 4 (Payment Declaration)
   - Developer B: User Story 5 (Payment History)
   - Developer C: User Story 6 (Deposit Info)
4. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- All UI text must be in French (Constitution Principle I)
- Verify tenant isolation in all queries (tenant_id filtering)
- File uploads must validate size (5MB max) and type (images/PDFs only)
- Payment declarations require property manager review (out of scope for this feature)
- Maintenance tickets use existing maintenance module endpoints

---

## Task Summary

- **Total Tasks**: 126
- **Setup Tasks**: 4 (Phase 1)
- **Foundational Tasks**: 15 (Phase 2)
- **User Story 1 Tasks**: 16 (Phase 3)
- **User Story 2 Tasks**: 9 (Phase 4)
- **User Story 3 Tasks**: 13 (Phase 5)
- **User Story 4 Tasks**: 12 (Phase 6)
- **User Story 5 Tasks**: 6 (Phase 7)
- **User Story 6 Tasks**: 6 (Phase 8)
- **User Story 7 Tasks**: 9 (Phase 9)
- **User Story 8 Tasks**: 12 (Phase 10)
- **User Story 9 Tasks**: 11 (Phase 11)
- **Polish Tasks**: 13 (Phase 12)

**Parallel Opportunities**: Many tasks can run in parallel, especially within the same user story phase and across different user stories after foundational phase is complete.
