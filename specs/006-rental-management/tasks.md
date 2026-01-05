# Tasks: Rental Management Module

**Input**: Design documents from `/specs/006-rental-management/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Tests are OPTIONAL - not explicitly requested in specification. Focus on implementation tasks.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Backend**: `packages/api/src/`
- **Frontend**: `apps/web/src/`
- **Database**: `packages/api/prisma/`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Install node-cron dependency for scheduled jobs in packages/api/package.json
- [x] T002 [P] Create rental types file in packages/api/src/types/rental-types.ts
- [x] T003 [P] Create rental routes file structure in packages/api/src/routes/rental-routes.ts
- [x] T004 [P] Create jobs directory structure in packages/api/src/jobs/

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Add rental enums to Prisma schema in packages/api/prisma/schema.prisma (RentalLeaseStatus, RentalBillingFrequency, RentalInstallmentStatus, RentalChargeType, RentalPaymentMethod, RentalPaymentStatus, MobileMoneyOperator, RentalPenaltyMode, RentalDepositMovementType, RentalDocumentType, RentalDocumentStatus)
- [x] T006 [P] Add RentalLease model to Prisma schema in packages/api/prisma/schema.prisma
- [x] T007 [P] Add RentalLeaseCoRenter model to Prisma schema in packages/api/prisma/schema.prisma
- [x] T008 [P] Add RentalInstallment model to Prisma schema in packages/api/prisma/schema.prisma
- [x] T009 [P] Add RentalInstallmentItem model to Prisma schema in packages/api/prisma/schema.prisma
- [x] T010 [P] Add RentalPayment model to Prisma schema in packages/api/prisma/schema.prisma
- [x] T011 [P] Add RentalPaymentAllocation model to Prisma schema in packages/api/prisma/schema.prisma
- [x] T012 [P] Add RentalRefund model to Prisma schema in packages/api/prisma/schema.prisma
- [x] T013 [P] Add RentalPenaltyRule model to Prisma schema in packages/api/prisma/schema.prisma
- [x] T014 [P] Add RentalPenalty model to Prisma schema in packages/api/prisma/schema.prisma
- [x] T015 [P] Add RentalSecurityDeposit model to Prisma schema in packages/api/prisma/schema.prisma
- [x] T016 [P] Add RentalDepositMovement model to Prisma schema in packages/api/prisma/schema.prisma
- [x] T017 [P] Add RentalDocument model to Prisma schema in packages/api/prisma/schema.prisma
- [x] T018 Add rental relationships to existing models (Tenant, Property, TenantClient, User, Invoice) in packages/api/prisma/schema.prisma
- [x] T019 Create Prisma migration for rental management module in packages/api/prisma/migrations/
- [x] T020 Run Prisma generate to update Prisma client
- [x] T021 [P] Create rental RBAC middleware in packages/api/src/middleware/rental-rbac-middleware.ts
- [x] T022 Register rental routes in packages/api/src/index.ts

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Lease Creation and Management (Priority: P1) 🎯 MVP

**Goal**: Property managers can create and manage rental leases with primary renters, co-renters, lease terms, and status tracking

**Independent Test**: Create a lease with primary renter, set lease terms (dates, amounts, billing frequency), add co-renters, update lease status, and verify tenant isolation. This delivers centralized lease management within a multi-tenant system.

### Implementation for User Story 1

- [x] T023 [US1] Implement rental-lease-service.ts in packages/api/src/services/rental-lease-service.ts with createLease, getLeaseById, updateLease, listLeases, updateLeaseStatus methods
- [x] T024 [US1] Implement lease validation logic in packages/api/src/services/rental-lease-service.ts (unique lease number per tenant, date validation, required fields)
- [x] T025 [US1] Implement co-renter management in packages/api/src/services/rental-lease-service.ts (addCoRenter, removeCoRenter, listCoRenters)
- [x] T026 [US1] Implement lease status transition logic in packages/api/src/services/rental-lease-service.ts (DRAFT → ACTIVE → SUSPENDED/ENDED/CANCELED)
- [x] T027 [US1] Implement rental-controller.ts in packages/api/src/controllers/rental-controller.ts with createLeaseHandler, getLeaseHandler, updateLeaseHandler, listLeasesHandler, updateLeaseStatusHandler, addCoRenterHandler
- [x] T028 [US1] Add lease routes to packages/api/src/routes/rental-routes.ts (GET /leases, POST /leases, GET /leases/:id, PATCH /leases/:id, PATCH /leases/:id/status, POST /leases/:id/co-renters)
- [ ] T029 [US1] Create LeaseForm component in apps/web/src/components/rental/LeaseForm.tsx with French UI text
- [ ] T030 [US1] Create Leases page in apps/web/src/pages/rental/Leases.tsx with list and detail views (French UI)
- [ ] T031 [US1] Implement rental-service.ts API client in apps/web/src/services/rental-service.ts with lease methods
- [ ] T032 [US1] Add tenant isolation checks in packages/api/src/services/rental-lease-service.ts (all queries filter by tenant_id)

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently. Property managers can create leases, manage co-renters, and update lease status.

---

## Phase 4: User Story 2 - Installment Schedule Generation and Management (Priority: P1)

**Goal**: Property managers can manually trigger installment generation for leases and view installment schedules with payment status

**Independent Test**: Generate installments for an active lease, view installment schedule, verify installments are created with correct periods, due dates, and amounts. This delivers automated payment scheduling and tracking.

### Implementation for User Story 2

- [x] T033 [US2] Implement installment generation algorithm in packages/api/src/services/rental-installment-service.ts (generateInstallments method with period calculation, due date calculation)
- [x] T034 [US2] Implement installment status update logic in packages/api/src/services/rental-installment-service.ts (DRAFT → DUE → PARTIAL → PAID, overdue detection)
- [x] T035 [US2] Implement listInstallments method in packages/api/src/services/rental-installment-service.ts with filtering by status, year, month
- [x] T036 [US2] Implement rental-installment-controller.ts in packages/api/src/controllers/rental-installment-controller.ts with generateInstallmentsHandler, listInstallmentsHandler
- [x] T037 [US2] Add installment routes to packages/api/src/routes/rental-routes.ts (GET /leases/:id/installments, POST /leases/:id/installments)
- [x] T041 [US2] Add tenant isolation checks in packages/api/src/services/rental-installment-service.ts
- [ ] T038 [US2] Create InstallmentSchedule component in apps/web/src/components/rental/InstallmentSchedule.tsx with French UI text
- [ ] T039 [US2] Create Installments page in apps/web/src/pages/rental/Installments.tsx with schedule view (French UI)
- [ ] T040 [US2] Add installment methods to rental-service.ts in apps/web/src/services/rental-service.ts
- [ ] T041 [US2] Add tenant isolation checks in packages/api/src/services/rental-installment-service.ts

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently. Property managers can create leases and generate installments.

---

## Phase 5: User Story 3 - Payment Processing and Allocation (Priority: P1)

**Goal**: Property managers can record payments (various methods including mobile money) and allocate them to installments with priority-based allocation

**Independent Test**: Create payments (various methods), allocate payments to installments, verify allocation prioritizes oldest overdue first, then earliest due date. This delivers comprehensive payment tracking and allocation.

### Implementation for User Story 3

- [x] T042 [US3] Implement payment recording logic in packages/api/src/services/rental-payment-service.ts (createPayment method with idempotency key validation)
- [x] T043 [US3] Implement payment allocation algorithm in packages/api/src/services/rental-payment-service.ts (allocatePayment method with priority: oldest overdue first, then earliest due date)
- [x] T044 [US3] Implement payment status management in packages/api/src/services/rental-payment-service.ts (updatePaymentStatus, reverseAllocations on failure/cancel)
- [x] T045 [US3] Implement mobile money payment handling in packages/api/src/services/rental-payment-service.ts (operator tracking, phone number, transaction reference)
- [x] T046 [US3] Implement currency validation in packages/api/src/services/rental-payment-service.ts (payment currency must match lease currency)
- [x] T047 [US3] Implement installment status update on payment allocation in packages/api/src/services/rental-payment-service.ts (update installment amount_paid, status transitions)
- [x] T048 [US3] Implement rental-payment-controller.ts in packages/api/src/controllers/rental-payment-controller.ts with createPaymentHandler, allocatePaymentHandler, updatePaymentStatusHandler
- [x] T049 [US3] Add payment routes to packages/api/src/routes/rental-routes.ts (POST /payments, POST /payments/:id/allocate, PATCH /payments/:id/status)
- [x] T054 [US3] Add tenant isolation checks in packages/api/src/services/rental-payment-service.ts
- [ ] T050 [US3] Create PaymentForm component in apps/web/src/components/rental/PaymentForm.tsx with French UI text (payment method selection, mobile money fields)
- [ ] T051 [US3] Create PaymentAllocation component in apps/web/src/components/rental/PaymentAllocation.tsx with French UI text (installment selection, priority display)
- [ ] T052 [US3] Create Payments page in apps/web/src/pages/rental/Payments.tsx with payment recording and allocation interface (French UI)
- [ ] T053 [US3] Add payment methods to rental-service.ts in apps/web/src/services/rental-service.ts
- [ ] T054 [US3] Add tenant isolation checks in packages/api/src/services/rental-payment-service.ts

**Checkpoint**: At this point, User Stories 1, 2, AND 3 should all work independently. Property managers can create leases, generate installments, and record/allocate payments.

---

## Phase 6: User Story 4 - Penalty Calculation and Management (Priority: P2)

**Goal**: System automatically calculates penalties for overdue installments daily, and property managers can manually trigger calculation and adjust penalties

**Independent Test**: Configure penalty rules, trigger penalty calculation for overdue installments, view calculated penalties, adjust penalties manually. This delivers automated penalty management and financial control.

### Implementation for User Story 4

- [x] T055 [US4] Implement penalty rule management in packages/api/src/services/rental-penalty-service.ts (createPenaltyRule, getDefaultPenaltyRule, updatePenaltyRule)
- [x] T056 [US4] Implement penalty calculation algorithm in packages/api/src/services/rental-penalty-service.ts (calculatePenalty method with FIXED_AMOUNT, PERCENT_OF_RENT, PERCENT_OF_BALANCE modes, cap application)
- [x] T057 [US4] Implement automatic penalty calculation for overdue installments in packages/api/src/services/rental-penalty-service.ts (calculatePenaltiesForOverdueInstallments method)
- [x] T058 [US4] Implement manual penalty adjustment in packages/api/src/services/rental-penalty-service.ts (updatePenalty method with override reason)
- [x] T059 [US4] Create penalty calculation scheduled job in packages/api/src/jobs/penalty-calculation-job.ts (daily at 2:00 AM using node-cron)
- [x] T060 [US4] Register penalty calculation job in packages/api/src/index.ts (startPenaltyCalculationJob)
- [x] T061 [US4] Implement rental-penalty-controller.ts in packages/api/src/controllers/rental-penalty-controller.ts with calculatePenaltiesHandler, updatePenaltyHandler
- [x] T062 [US4] Add penalty routes to packages/api/src/routes/rental-routes.ts (POST /penalties/calculate, PATCH /penalties/:id)
- [x] T066 [US4] Add tenant isolation checks in packages/api/src/services/rental-penalty-service.ts
- [ ] T063 [US4] Create PenaltyRules component in apps/web/src/components/rental/PenaltyRules.tsx with French UI text (rule configuration)
- [ ] T064 [US4] Create Penalties page in apps/web/src/pages/rental/Penalties.tsx with penalty management interface (French UI)
- [ ] T065 [US4] Add penalty methods to rental-service.ts in apps/web/src/services/rental-service.ts
- [ ] T066 [US4] Add tenant isolation checks in packages/api/src/services/rental-penalty-service.ts

**Checkpoint**: At this point, User Stories 1-4 should all work independently. System automatically calculates penalties daily, and property managers can manage penalties.

---

## Phase 7: User Story 5 - Security Deposit Management (Priority: P2)

**Goal**: Property managers can track security deposits for leases, including collection (single payment only), holding, release, refund, and forfeiture

**Independent Test**: Create security deposit for lease, collect deposit (verify single payment validation), track deposit movements (hold, release, refund, forfeit), view deposit balances. This delivers comprehensive deposit tracking and financial protection.

### Implementation for User Story 5

- [x] T067 [US5] Implement security deposit creation in packages/api/src/services/rental-deposit-service.ts (createDeposit method)
- [x] T068 [US5] Implement deposit collection validation in packages/api/src/services/rental-deposit-service.ts (single payment validation, amount must equal target amount)
- [x] T069 [US5] Implement deposit movement logic in packages/api/src/services/rental-deposit-service.ts (createMovement method with COLLECT, HOLD, RELEASE, REFUND, FORFEIT, ADJUSTMENT types, balance updates)
- [x] T070 [US5] Implement deposit balance tracking in packages/api/src/services/rental-deposit-service.ts (update aggregated amounts: collected, held, refunded, forfeited)
- [x] T071 [US5] Implement rental-deposit-controller.ts in packages/api/src/controllers/rental-deposit-controller.ts with getDepositHandler, createDepositHandler, createDepositMovementHandler
- [x] T072 [US5] Add deposit routes to packages/api/src/routes/rental-routes.ts (GET /leases/:id/deposit, POST /leases/:id/deposit, POST /deposits/:id/movements)
- [x] T076 [US5] Add tenant isolation checks in packages/api/src/services/rental-deposit-service.ts
- [ ] T073 [US5] Create DepositMovements component in apps/web/src/components/rental/DepositMovements.tsx with French UI text (movement tracking, balance display)
- [ ] T074 [US5] Create Deposits page in apps/web/src/pages/rental/Deposits.tsx with security deposit management interface (French UI)
- [ ] T075 [US5] Add deposit methods to rental-service.ts in apps/web/src/services/rental-service.ts
- [ ] T076 [US5] Add tenant isolation checks in packages/api/src/services/rental-deposit-service.ts

**Checkpoint**: At this point, User Stories 1-5 should all work independently. Property managers can manage security deposits with single payment collection.

---

## Phase 8: User Story 6 - Document Generation and Management (Priority: P2)

**Goal**: Property managers can generate, store, and manage rental documents (contracts, receipts, quittances) with YYYY-NNN document numbers

**Independent Test**: Generate documents (lease contract, receipt, quittance), verify document numbers in YYYY-NNN format, link documents to leases/installments/payments, update document status, retrieve documents. This delivers organized document management and legal compliance.

### Implementation for User Story 6

- [x] T077 [US6] Implement document number generation in packages/api/src/services/rental-document-service.ts (generateDocumentNumber method with YYYY-NNN format, sequential per tenant per year)
- [x] T078 [US6] Implement document generation logic in packages/api/src/services/rental-document-service.ts (generateDocument method with type-specific logic)
- [x] T079 [US6] Implement document storage integration in packages/api/src/services/rental-document-service.ts (file storage service integration, file_url, file_key, content_hash)
- [x] T080 [US6] Implement document status management in packages/api/src/services/rental-document-service.ts (updateDocumentStatus, void document)
- [x] T081 [US6] Implement document retrieval in packages/api/src/services/rental-document-service.ts (getDocumentById, listDocuments with filtering)
- [x] T082 [US6] Implement rental-document-controller.ts in packages/api/src/controllers/rental-document-controller.ts with generateDocumentHandler, getDocumentHandler, listDocumentsHandler, updateDocumentStatusHandler
- [x] T083 [US6] Add document routes to packages/api/src/routes/rental-routes.ts (GET /documents, POST /documents, GET /documents/:id, PATCH /documents/:id)
- [x] T087 [US6] Add tenant isolation checks in packages/api/src/services/rental-document-service.ts
- [ ] T084 [US6] Create DocumentGenerator component in apps/web/src/components/rental/DocumentGenerator.tsx with French UI text (document type selection, generation)
- [ ] T085 [US6] Create Documents page in apps/web/src/pages/rental/Documents.tsx with document list and generation interface (French UI)
- [ ] T086 [US6] Add document methods to rental-service.ts in apps/web/src/services/rental-service.ts
- [ ] T087 [US6] Add tenant isolation checks in packages/api/src/services/rental-document-service.ts

**Checkpoint**: At this point, all user stories (1-6) should work independently. Property managers can generate and manage rental documents.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T088 [P] Add error handling and validation for all rental endpoints in packages/api/src/controllers/rental-*.ts
- [x] T089 [P] Add logging for all rental operations in packages/api/src/services/rental-*.ts
- [x] T090 [P] Add audit logging for rental operations (lease status changes, payment allocations, penalty calculations, deposit movements, document generation) in packages/api/src/services/rental-*.ts
- [x] T091 [P] Add input validation with Zod schemas for all rental endpoints in packages/api/src/middleware/validation-middleware.ts
- [x] T092 [P] Add RBAC permission checks for all rental endpoints using rental-rbac-middleware.ts
- [ ] T093 [P] Add French UI text validation for all frontend components (verify all user-facing text is in French per Constitution) - FRONTEND TASK
- [ ] T094 [P] Add loading states and error handling in apps/web/src/components/rental/*.tsx - FRONTEND TASK
- [x] T095 [P] Add pagination support for list endpoints (leases, installments, payments, documents)
- [ ] T096 [P] Add filtering and search functionality for list views in apps/web/src/pages/rental/*.tsx - FRONTEND TASK
- [ ] T097 Run quickstart.md validation to verify all workflows work end-to-end - MANUAL TESTING TASK
- [x] T098 [P] Add unit tests for business logic algorithms (installment generation, payment allocation, penalty calculation) in packages/api/__tests__/unit/
- [x] T099 [P] Add integration tests for rental endpoints in packages/api/__tests__/integration/rental.integration.test.ts
- [x] T100 Add integration test for penalty calculation scheduled job in packages/api/__tests__/integration/penalty-calculation.integration.test.ts

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-8)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1: US1, US2, US3 → P2: US4, US5, US6)
- **Polish (Phase 9)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Depends on US1 (needs active lease to generate installments)
- **User Story 3 (P1)**: Depends on US2 (needs installments to allocate payments to)
- **User Story 4 (P2)**: Depends on US2 and US3 (needs overdue installments and payment tracking)
- **User Story 5 (P2)**: Depends on US1 and US3 (needs lease and payment for deposit collection)
- **User Story 6 (P2)**: Depends on US1, US2, US3 (needs lease, installments, payments for document generation)

### Within Each User Story

- Models before services (models already in Phase 2)
- Services before controllers
- Controllers before routes
- Backend before frontend
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational model tasks (T006-T017) can run in parallel
- Once Foundational phase completes:
  - US1 can start immediately
  - US2 can start after US1 completes
  - US3 can start after US2 completes
  - US4, US5, US6 can run in parallel after US1, US2, US3 complete
- All Polish tasks marked [P] can run in parallel
- Different components within a story marked [P] can run in parallel (e.g., different services, different frontend components)

---

## Parallel Example: User Story 1

```bash
# Launch all US1 service and controller tasks together (after models exist):
Task: "Implement rental-lease-service.ts in packages/api/src/services/rental-lease-service.ts"
Task: "Implement rental-controller.ts in packages/api/src/controllers/rental-controller.ts"
Task: "Create LeaseForm component in apps/web/src/components/rental/LeaseForm.tsx"
Task: "Create Leases page in apps/web/src/pages/rental/Leases.tsx"
```

---

## Parallel Example: Foundational Phase

```bash
# Launch all model creation tasks together:
Task: "Add RentalLease model to Prisma schema"
Task: "Add RentalLeaseCoRenter model to Prisma schema"
Task: "Add RentalInstallment model to Prisma schema"
Task: "Add RentalPayment model to Prisma schema"
# ... all other models
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (Lease Creation and Management)
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery (Recommended)

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Add User Stories 4, 5, 6 → Test independently → Deploy/Demo
6. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (Lease Management)
   - Developer B: Prepare for User Story 2 (waiting for US1)
3. Once US1 completes:
   - Developer A: User Story 2 (Installment Generation)
   - Developer B: User Story 3 (Payment Processing) - can start in parallel with US2
4. Once US2 and US3 complete:
   - Developer A: User Story 4 (Penalties)
   - Developer B: User Story 5 (Security Deposits)
   - Developer C: User Story 6 (Documents)
5. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- All UI text must be in French per Constitution Principle I
- Verify tenant isolation on all queries (filter by tenant_id)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
- Document number generation: YYYY-NNN format, sequential per tenant per year
- Security deposit: Single payment only (no partial payments)
- Payment allocation: Priority is oldest overdue first, then earliest due date
- Penalty calculation: Automatic daily job + manual trigger option

---

## Task Summary

**Total Tasks**: 100

**Tasks per Phase**:
- Phase 1 (Setup): 4 tasks
- Phase 2 (Foundational): 18 tasks
- Phase 3 (US1 - Lease Management): 10 tasks
- Phase 4 (US2 - Installment Generation): 9 tasks
- Phase 5 (US3 - Payment Processing): 13 tasks
- Phase 6 (US4 - Penalty Calculation): 12 tasks
- Phase 7 (US5 - Security Deposit): 10 tasks
- Phase 8 (US6 - Document Generation): 11 tasks
- Phase 9 (Polish): 13 tasks

**Parallel Opportunities**: 
- Foundational models (T006-T017): 12 tasks can run in parallel
- User Stories 4, 5, 6: Can run in parallel after US1, US2, US3 complete
- Polish tasks: 11 tasks marked [P] can run in parallel

**Independent Test Criteria**:
- **US1**: Create lease, add co-renter, update status, verify tenant isolation
- **US2**: Generate installments for active lease, view schedule, verify periods and due dates
- **US3**: Record payment, allocate to installments, verify priority allocation
- **US4**: Configure penalty rules, trigger calculation, view/adjust penalties
- **US5**: Create deposit, collect (single payment), track movements, view balance
- **US6**: Generate documents, verify YYYY-NNN numbers, link to lease/installment/payment, retrieve

**Suggested MVP Scope**: User Story 1 (Lease Creation and Management) - 10 tasks after foundational phase

