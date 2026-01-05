# Tasks: Multi-Tenant SaaS Architecture with RBAC

**Input**: Design documents from `/specs/003-multi-tenant-rbac/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

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

- [x] T001 Create TypeScript type definitions in packages/api/src/types/tenant-types.ts
- [x] T002 [P] Create TypeScript type definitions in packages/api/src/types/rbac-types.ts
- [x] T003 [P] Create TypeScript type definitions in packages/api/src/types/audit-types.ts
- [x] T004 [P] Create TypeScript type definitions in packages/api/src/types/subscription-types.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Database Schema & Migrations

- [x] T005 Extend Tenant model in packages/api/prisma/schema.prisma with new fields (legalName, status, contactEmail, contactPhone, country, city, address, brandingPrimaryColor, subdomain, customDomain, lastActivityAt)
- [x] T006 [P] Add TenantStatus enum (PENDING, ACTIVE, SUSPENDED) to packages/api/prisma/schema.prisma
- [x] T007 [P] Create TenantModule model in packages/api/prisma/schema.prisma
- [x] T008 [P] Create Membership model in packages/api/prisma/schema.prisma
- [x] T009 [P] Create Role model in packages/api/prisma/schema.prisma
- [x] T010 [P] Create Permission model in packages/api/prisma/schema.prisma
- [x] T011 [P] Create RolePermission model in packages/api/prisma/schema.prisma
- [x] T012 [P] Create UserRole model in packages/api/prisma/schema.prisma
- [x] T013 [P] Create Invitation model in packages/api/prisma/schema.prisma
- [x] T014 [P] Create Subscription model in packages/api/prisma/schema.prisma
- [x] T015 [P] Create Invoice model in packages/api/prisma/schema.prisma
- [x] T016 [P] Create AuditLog model in packages/api/prisma/schema.prisma
- [x] T017 [P] Add ModuleKey enum (MODULE_AGENCY, MODULE_SYNDIC, MODULE_PROMOTER) to packages/api/prisma/schema.prisma
- [x] T018 [P] Add MembershipStatus enum (PENDING_INVITE, ACTIVE, DISABLED) to packages/api/prisma/schema.prisma
- [x] T019 [P] Add RoleScope enum (PLATFORM, TENANT) to packages/api/prisma/schema.prisma
- [x] T020 [P] Add SubscriptionPlan enum (BASIC, PRO, ELITE) to packages/api/prisma/schema.prisma
- [x] T021 [P] Add BillingCycle enum (MONTHLY, ANNUAL) to packages/api/prisma/schema.prisma
- [x] T022 [P] Add SubscriptionStatus enum (TRIALING, ACTIVE, PAST_DUE, CANCELED, SUSPENDED) to packages/api/prisma/schema.prisma
- [x] T023 [P] Add InvoiceStatus enum (DRAFT, ISSUED, PAID, FAILED, CANCELED, REFUNDED) to packages/api/prisma/schema.prisma
- [x] T024 [P] Add InvitationStatus enum (PENDING, ACCEPTED, EXPIRED, REVOKED) to packages/api/prisma/schema.prisma
- [x] T025 Extend User model in packages/api/prisma/schema.prisma with lastLoginAt field and new relationships
- [ ] T026 Create database migration in packages/api/prisma/migrations/ with name add_multi_tenant_rbac
- [x] T027 Create RBAC seed script in packages/api/prisma/seeds/rbac-seed.ts with default roles and permissions
- [ ] T028 Run database migration and seed script

### RBAC Core Services (US6 - Foundational)

- [x] T029 Implement permission-service.ts in packages/api/src/services/permission-service.ts with getUserPermissions() and in-memory cache (5-minute TTL)
- [x] T030 Implement permission cache invalidation in packages/api/src/services/permission-service.ts
- [x] T031 Create rbac-middleware.ts in packages/api/src/middleware/rbac-middleware.ts with requirePermission() function
- [x] T032 Create rbac-middleware.ts in packages/api/src/middleware/rbac-middleware.ts with requireModule() function
- [x] T033 Update authenticate middleware in packages/api/src/middleware/auth-middleware.ts to attach user context for RBAC

### Session Management

- [x] T034 Create session-invalidation.ts in packages/api/src/middleware/session-invalidation.ts with revokeTenantSessions() function

### Audit Logging Infrastructure

- [x] T035 Create audit-service.ts in packages/api/src/services/audit-service.ts with async queue implementation (see research.md)
- [x] T036 Implement audit queue flush mechanism in packages/api/src/services/audit-service.ts with batch database writes
- [x] T037 Add graceful shutdown handler for audit queue in packages/api/src/services/audit-service.ts

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Central Admin Creates and Configures Tenant (Priority: P1) 🎯 MVP

**Goal**: Platform Admin can create new tenant organizations and configure their basic settings, status, and branding

**Independent Test**: Create a new tenant with all required fields, verify it appears in tenant list, confirm tenant can be viewed in detail

### Implementation for User Story 1

- [x] T038 [US1] Implement tenant-service.ts in packages/api/src/services/tenant-service.ts with createTenant() function
- [x] T039 [US1] Implement tenant-service.ts in packages/api/src/services/tenant-service.ts with updateTenant() function
- [x] T040 [US1] Implement tenant-service.ts in packages/api/src/services/tenant-service.ts with getTenantById() function
- [x] T041 [US1] Implement tenant-service.ts in packages/api/src/services/tenant-service.ts with listTenants() function with filtering (status, type, plan, module)
- [x] T042 [US1] Implement tenant-service.ts in packages/api/src/services/tenant-service.ts with suspendTenant() function that revokes all sessions
- [x] T043 [US1] Create tenant-controller.ts in packages/api/src/controllers/tenant-controller.ts with createTenant handler
- [x] T044 [US1] Create tenant-controller.ts in packages/api/src/controllers/tenant-controller.ts with getTenant handler
- [x] T045 [US1] Create tenant-controller.ts in packages/api/src/controllers/tenant-controller.ts with updateTenant handler
- [x] T046 [US1] Create tenant-controller.ts in packages/api/src/controllers/tenant-controller.ts with listTenants handler
- [x] T047 [US1] Create admin-routes.ts in packages/api/src/routes/admin-routes.ts with GET /admin/tenants route
- [x] T048 [US1] Create admin-routes.ts in packages/api/src/routes/admin-routes.ts with POST /admin/tenants route
- [x] T049 [US1] Create admin-routes.ts in packages/api/src/routes/admin-routes.ts with GET /admin/tenants/:tenantId route
- [x] T050 [US1] Create admin-routes.ts in packages/api/src/routes/admin-routes.ts with PATCH /admin/tenants/:tenantId route
- [x] T051 [US1] Add request validation with Zod schemas in packages/api/src/controllers/tenant-controller.ts
- [x] T052 [US1] Add audit logging for tenant creation in packages/api/src/services/tenant-service.ts
- [x] T053 [US1] Add audit logging for tenant updates in packages/api/src/services/tenant-service.ts
- [ ] T054 [US1] Create tenant-service.ts API client in apps/web/src/services/tenant-service.ts with listTenants() function
- [ ] T055 [US1] Create tenant-service.ts API client in apps/web/src/services/tenant-service.ts with getTenant() function
- [ ] T056 [US1] Create tenant-service.ts API client in apps/web/src/services/tenant-service.ts with createTenant() function
- [ ] T057 [US1] Create tenant-service.ts API client in apps/web/src/services/tenant-service.ts with updateTenant() function
- [ ] T058 [US1] Create TenantsList.tsx page in apps/web/src/pages/admin/TenantsList.tsx with search and filter functionality
- [ ] T059 [US1] Create TenantDetail.tsx page in apps/web/src/pages/admin/TenantDetail.tsx with tenant overview and edit form
- [ ] T060 [US1] Create TenantCard.tsx component in apps/web/src/components/admin/TenantCard.tsx

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Central Admin Activates Modules for Tenant (Priority: P1)

**Goal**: Platform Admin can enable specific functional modules (AGENCY, SYNDIC, PROMOTER) for each tenant

**Independent Test**: Activate different module combinations for a tenant, verify only enabled modules are accessible via API, confirm disabled modules return 403 Forbidden

### Implementation for User Story 2

- [x] T061 [US2] Implement module-service.ts in packages/api/src/services/module-service.ts with getTenantModules() function
- [x] T062 [US2] Implement module-service.ts in packages/api/src/services/module-service.ts with updateTenantModules() function
- [x] T063 [US2] Implement module-service.ts in packages/api/src/services/module-service.ts with isModuleEnabled() function
- [x] T064 [US2] Create tenant-controller.ts in packages/api/src/controllers/tenant-controller.ts with getTenantModules handler
- [x] T065 [US2] Create tenant-controller.ts in packages/api/src/controllers/tenant-controller.ts with updateTenantModules handler
- [x] T066 [US2] Create admin-routes.ts in packages/api/src/routes/admin-routes.ts with GET /admin/tenants/:tenantId/modules route
- [x] T067 [US2] Create admin-routes.ts in packages/api/src/routes/admin-routes.ts with PUT /admin/tenants/:tenantId/modules route
- [x] T068 [US2] Add audit logging for module enable/disable in packages/api/src/services/module-service.ts
- [x] T069 [US2] Update requireModule middleware in packages/api/src/middleware/rbac-middleware.ts to handle immediate revocation on disable
- [ ] T070 [US2] Create tenant-service.ts API client in apps/web/src/services/tenant-service.ts with getTenantModules() function
- [ ] T071 [US2] Create tenant-service.ts API client in apps/web/src/services/tenant-service.ts with updateTenantModules() function
- [ ] T072 [US2] Create ModuleToggle.tsx component in apps/web/src/components/admin/ModuleToggle.tsx
- [ ] T073 [US2] Integrate ModuleToggle component into TenantDetail.tsx in apps/web/src/pages/admin/TenantDetail.tsx

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 6 - System Enforces Role-Based Access Control (Priority: P1)

**Goal**: System enforces permissions based on user roles and tenant context, maintaining security and data isolation

**Independent Test**: Assign different roles to users, attempt to access features with and without required permissions, verify only authorized access is granted

### Implementation for User Story 6

- [ ] T074 [US6] Integrate requirePermission middleware into admin-routes.ts in packages/api/src/routes/admin-routes.ts
- [ ] T075 [US6] Integrate requirePermission middleware into tenant-routes.ts in packages/api/src/routes/tenant-routes.ts
- [ ] T076 [US6] Update requireTenantAccess middleware in packages/api/src/middleware/tenant-middleware.ts to work with RBAC
- [ ] T077 [US6] Implement tenant isolation checks in packages/api/src/services/permission-service.ts to prevent cross-tenant access
- [ ] T078 [US6] Add permission checks to all tenant-scoped endpoints in packages/api/src/routes/tenant-routes.ts
- [ ] T079 [US6] Add permission checks to all platform admin endpoints in packages/api/src/routes/admin-routes.ts
- [ ] T080 [US6] Create integration test in packages/api/__tests__/integration/rbac-enforcement.test.ts for permission checks
- [ ] T081 [US6] Create integration test in packages/api/__tests__/integration/tenant-isolation.test.ts for cross-tenant access prevention

**Checkpoint**: RBAC enforcement should now be active across all endpoints

---

## Phase 6: User Story 3 - Tenant Admin Invites Collaborator (Priority: P2)

**Goal**: Tenant Admin can invite new collaborators by email with role assignments

**Independent Test**: Send an invitation, verify invitation token is generated and stored, send invitation email (or log failure), confirm invitee can accept and complete account setup

### Implementation for User Story 3

- [x] T082 [US3] Implement collaborator-service.ts in packages/api/src/services/collaborator-service.ts with inviteCollaborator() function
- [x] T083 [US3] Implement collaborator-service.ts in packages/api/src/services/collaborator-service.ts with generateInvitationToken() function (7-day expiration)
- [x] T084 [US3] Implement collaborator-service.ts in packages/api/src/services/collaborator-service.ts with sendInvitationEmail() function with error handling
- [x] T085 [US3] Implement collaborator-service.ts in packages/api/src/services/collaborator-service.ts with handleExistingUserEmail() function (create membership without duplicate user)
- [x] T086 [US3] Implement collaborator-service.ts in packages/api/src/services/collaborator-service.ts with preventDuplicateInvitation() function
- [x] T087 [US3] Create collaborator-controller.ts in packages/api/src/controllers/collaborator-controller.ts with inviteCollaborator handler
- [x] T088 [US3] Create invitation-routes.ts in packages/api/src/routes/invitation-routes.ts with POST /auth/invitations/accept route
- [x] T089 [US3] Create collaborator-controller.ts in packages/api/src/controllers/collaborator-controller.ts with acceptInvitation handler
- [x] T090 [US3] Implement invitation acceptance flow in packages/api/src/services/collaborator-service.ts with bindUserToTenant() function
- [x] T091 [US3] Add request validation with Zod schemas in packages/api/src/controllers/collaborator-controller.ts
- [x] T092 [US3] Add audit logging for invitation creation in packages/api/src/services/collaborator-service.ts
- [x] T093 [US3] Add audit logging for invitation acceptance in packages/api/src/services/collaborator-service.ts
- [x] T094 [US3] Create tenant-routes.ts in packages/api/src/routes/tenant-routes.ts with POST /tenants/:tenantId/users/invite route
- [ ] T095 [US3] Create collaborator-service.ts API client in apps/web/src/services/collaborator-service.ts with inviteCollaborator() function
- [ ] T096 [US3] Create InviteCollaborator.tsx page in apps/web/src/pages/tenant/InviteCollaborator.tsx with invitation form
- [ ] T097 [US3] Create InvitationStatus.tsx component in apps/web/src/components/tenant/InvitationStatus.tsx

**Checkpoint**: At this point, User Story 3 should be fully functional and testable independently

---

## Phase 7: User Story 4 - Tenant Admin Manages Collaborator Roles and Status (Priority: P2)

**Goal**: Tenant Admin can update collaborator roles, enable/disable accounts, reset passwords, and revoke sessions

**Independent Test**: Update a collaborator's roles, disable their account, verify access is revoked, re-enable and confirm access is restored

### Implementation for User Story 4

- [x] T098 [US4] Implement collaborator-service.ts in packages/api/src/services/collaborator-service.ts with listCollaborators() function with search/filter
- [x] T099 [US4] Implement collaborator-service.ts in packages/api/src/services/collaborator-service.ts with getCollaboratorById() function
- [x] T100 [US4] Implement collaborator-service.ts in packages/api/src/services/collaborator-service.ts with updateCollaboratorRoles() function
- [x] T101 [US4] Implement collaborator-service.ts in packages/api/src/services/collaborator-service.ts with disableCollaborator() function
- [x] T102 [US4] Implement collaborator-service.ts in packages/api/src/services/collaborator-service.ts with enableCollaborator() function
- [x] T103 [US4] Implement collaborator-service.ts in packages/api/src/services/collaborator-service.ts with resetCollaboratorPassword() function
- [x] T104 [US4] Implement collaborator-service.ts in packages/api/src/services/collaborator-service.ts with revokeCollaboratorSessions() function
- [x] T105 [US4] Create collaborator-controller.ts in packages/api/src/controllers/collaborator-controller.ts with listCollaborators handler
- [x] T106 [US4] Create collaborator-controller.ts in packages/api/src/controllers/collaborator-controller.ts with getCollaborator handler
- [x] T107 [US4] Create collaborator-controller.ts in packages/api/src/controllers/collaborator-controller.ts with updateCollaborator handler
- [x] T108 [US4] Create collaborator-controller.ts in packages/api/src/controllers/collaborator-controller.ts with resetPassword handler
- [x] T109 [US4] Create collaborator-controller.ts in packages/api/src/controllers/collaborator-controller.ts with revokeSessions handler
- [x] T110 [US4] Create tenant-routes.ts in packages/api/src/routes/tenant-routes.ts with GET /tenants/:tenantId/users route
- [x] T111 [US4] Create tenant-routes.ts in packages/api/src/routes/tenant-routes.ts with POST /tenants/:tenantId/users route (direct creation)
- [x] T112 [US4] Create tenant-routes.ts in packages/api/src/routes/tenant-routes.ts with GET /tenants/:tenantId/users/:userId route
- [x] T113 [US4] Create tenant-routes.ts in packages/api/src/routes/tenant-routes.ts with PATCH /tenants/:tenantId/users/:userId route
- [x] T114 [US4] Create tenant-routes.ts in packages/api/src/routes/tenant-routes.ts with POST /tenants/:tenantId/users/:userId/reset-password route
- [x] T115 [US4] Create tenant-routes.ts in packages/api/src/routes/tenant-routes.ts with POST /tenants/:tenantId/users/:userId/revoke-sessions route
- [x] T116 [US4] Add audit logging for collaborator updates in packages/api/src/services/collaborator-service.ts
- [ ] T117 [US4] Create collaborator-service.ts API client in apps/web/src/services/collaborator-service.ts with listCollaborators() function
- [ ] T118 [US4] Create collaborator-service.ts API client in apps/web/src/services/collaborator-service.ts with getCollaborator() function
- [ ] T119 [US4] Create collaborator-service.ts API client in apps/web/src/services/collaborator-service.ts with updateCollaborator() function
- [ ] T120 [US4] Create CollaboratorsList.tsx page in apps/web/src/pages/tenant/CollaboratorsList.tsx with search and filter
- [ ] T121 [US4] Create CollaboratorDetail.tsx page in apps/web/src/pages/tenant/CollaboratorDetail.tsx with role management and status controls
- [ ] T122 [US4] Create CollaboratorCard.tsx component in apps/web/src/components/tenant/CollaboratorCard.tsx
- [ ] T123 [US4] Create RoleSelector.tsx component in apps/web/src/components/tenant/RoleSelector.tsx

**Checkpoint**: At this point, User Stories 1, 2, 3, 4, and 6 should all work independently

---

## Phase 8: User Story 5 - Central Admin Manages Tenant Subscription and Billing (Priority: P3)

**Goal**: Platform Admin can assign subscription plans, track subscription status, and manage invoices

**Independent Test**: Create a subscription for a tenant, generate an invoice, mark it as paid, verify subscription status updates accordingly

### Implementation for User Story 5

- [x] T124 [US5] Implement subscription-service.ts in packages/api/src/services/subscription-service.ts with createSubscription() function
- [x] T125 [US5] Implement subscription-service.ts in packages/api/src/services/subscription-service.ts with updateSubscription() function
- [x] T126 [US5] Implement subscription-service.ts in packages/api/src/services/subscription-service.ts with getSubscriptionByTenantId() function
- [x] T127 [US5] Implement subscription-service.ts in packages/api/src/services/subscription-service.ts with checkSubscriptionAccess() function (read-only for expired/canceled)
- [x] T128 [US5] Implement subscription-service.ts in packages/api/src/services/subscription-service.ts with createInvoice() function
- [x] T129 [US5] Implement subscription-service.ts in packages/api/src/services/subscription-service.ts with markInvoicePaid() function
- [x] T130 [US5] Implement subscription-service.ts in packages/api/src/services/subscription-service.ts with listInvoices() function
- [x] T131 [US5] Create subscription-controller.ts in packages/api/src/controllers/subscription-controller.ts with getSubscription handler
- [x] T132 [US5] Create subscription-controller.ts in packages/api/src/controllers/subscription-controller.ts with updateSubscription handler
- [x] T133 [US5] Create subscription-controller.ts in packages/api/src/controllers/subscription-controller.ts with createInvoice handler
- [x] T134 [US5] Create subscription-controller.ts in packages/api/src/controllers/subscription-controller.ts with listInvoices handler
- [x] T135 [US5] Create subscription-controller.ts in packages/api/src/controllers/subscription-controller.ts with updateInvoice handler
- [x] T136 [US5] Create admin-routes.ts in packages/api/src/routes/admin-routes.ts with GET /admin/tenants/:tenantId/subscription route
- [x] T137 [US5] Create admin-routes.ts in packages/api/src/routes/admin-routes.ts with PUT /admin/tenants/:tenantId/subscription route
- [x] T138 [US5] Create admin-routes.ts in packages/api/src/routes/admin-routes.ts with GET /admin/tenants/:tenantId/invoices route
- [x] T139 [US5] Create admin-routes.ts in packages/api/src/routes/admin-routes.ts with POST /admin/tenants/:tenantId/invoices route
- [x] T140 [US5] Create admin-routes.ts in packages/api/src/routes/admin-routes.ts with PATCH /admin/invoices/:invoiceId route
- [x] T141 [US5] Add subscription access check middleware in packages/api/src/middleware/rbac-middleware.ts for read-only enforcement
- [x] T142 [US5] Add audit logging for subscription operations in packages/api/src/services/subscription-service.ts
- [x] T143 [US5] Add audit logging for invoice operations in packages/api/src/services/subscription-service.ts
- [ ] T144 [US5] Create subscription-service.ts API client in apps/web/src/services/subscription-service.ts with getSubscription() function
- [ ] T145 [US5] Create subscription-service.ts API client in apps/web/src/services/subscription-service.ts with updateSubscription() function
- [ ] T146 [US5] Create subscription-service.ts API client in apps/web/src/services/subscription-service.ts with createInvoice() function
- [ ] T147 [US5] Create subscription-service.ts API client in apps/web/src/services/subscription-service.ts with listInvoices() function
- [ ] T148 [US5] Create subscription-service.ts API client in apps/web/src/services/subscription-service.ts with updateInvoice() function
- [ ] T149 [US5] Create SubscriptionCard.tsx component in apps/web/src/components/admin/SubscriptionCard.tsx
- [ ] T150 [US5] Create InvoiceList.tsx component in apps/web/src/components/admin/InvoiceList.tsx
- [ ] T151 [US5] Integrate subscription and invoice components into TenantDetail.tsx in apps/web/src/pages/admin/TenantDetail.tsx

**Checkpoint**: At this point, User Story 5 should be fully functional and testable independently

---

## Phase 9: User Story 7 - Central Admin Views Global Tenant Statistics (Priority: P3)

**Goal**: Platform Admin can view aggregated statistics across all tenants (collaborator counts, module activations, subscription status, activity)

**Independent Test**: View tenant statistics, verify counts are accurate, check last login dates reflect recent activity, confirm subscription statuses are correctly displayed

### Implementation for User Story 7

- [x] T152 [US7] Implement tenant-service.ts in packages/api/src/services/tenant-service.ts with getTenantStats() function
- [x] T153 [US7] Implement tenant-service.ts in packages/api/src/services/tenant-service.ts with calculateCollaboratorCounts() function
- [x] T154 [US7] Implement tenant-service.ts in packages/api/src/services/tenant-service.ts with getEnabledModules() function
- [x] T155 [US7] Implement tenant-service.ts in packages/api/src/services/tenant-service.ts with getLastLoginDate() function (tenant-wide)
- [x] T156 [US7] Create tenant-controller.ts in packages/api/src/controllers/tenant-controller.ts with getTenantStats handler
- [x] T157 [US7] Create admin-routes.ts in packages/api/src/routes/admin-routes.ts with GET /admin/tenants/:tenantId/stats route
- [x] T158 [US7] Create audit-controller.ts in packages/api/src/controllers/audit-controller.ts with getAuditLogs handler
- [x] T159 [US7] Create admin-routes.ts in packages/api/src/routes/admin-routes.ts with GET /admin/audit route
- [ ] T160 [US7] Create tenant-service.ts API client in apps/web/src/services/tenant-service.ts with getTenantStats() function
- [ ] T161 [US7] Create TenantStats.tsx page in apps/web/src/pages/admin/TenantStats.tsx
- [ ] T162 [US7] Integrate statistics display into TenantDetail.tsx in apps/web/src/pages/admin/TenantDetail.tsx

**Checkpoint**: All user stories should now be independently functional

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T163 [P] Add resend invitation functionality in packages/api/src/services/collaborator-service.ts with resendInvitationEmail() function
- [ ] T164 [P] Create tenant-routes.ts in packages/api/src/routes/tenant-routes.ts with POST /tenants/:tenantId/users/invitations/:invitationId/resend route
- [ ] T165 [P] Add resend invitation to collaborator-service.ts API client in apps/web/src/services/collaborator-service.ts
- [ ] T166 [P] Add resend button to InvitationStatus.tsx component in apps/web/src/components/tenant/InvitationStatus.tsx
- [ ] T167 [P] Create integration test in packages/api/__tests__/integration/module-gating.test.ts for module access control
- [ ] T168 [P] Create unit test in packages/api/__tests__/unit/permission-service.test.ts for permission caching
- [ ] T169 [P] Create unit test in packages/api/__tests__/unit/tenant-service.test.ts for tenant CRUD and suspension
- [ ] T170 [P] Update User model lastLoginAt on login in packages/api/src/services/auth-service.ts
- [ ] T171 [P] Add error handling and validation across all controllers
- [ ] T172 [P] Add comprehensive logging across all services
- [ ] T173 [P] Update API documentation with OpenAPI spec from contracts/openapi.yaml
- [ ] T174 [P] Run quickstart.md validation checklist

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - Depends on US1 (needs tenant to exist)
- **User Story 6 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories (RBAC is foundational)
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - Depends on US1 and US6 (needs tenant and RBAC)
- **User Story 4 (P2)**: Can start after Foundational (Phase 2) - Depends on US3 (needs invitation system)
- **User Story 5 (P3)**: Can start after Foundational (Phase 2) - Depends on US1 (needs tenant)
- **User Story 7 (P3)**: Can start after Foundational (Phase 2) - Depends on US1, US2, US3, US5 (needs all entities for stats)

### Within Each User Story

- Models before services
- Services before controllers
- Controllers before routes
- Backend before frontend
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational database tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, user stories can start in parallel (if team capacity allows)
- Models within a story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members
- Frontend and backend tasks for same story can run in parallel after API contracts are defined

---

## Parallel Example: User Story 1

```bash
# Launch all type definitions together:
Task: "Create TypeScript type definitions in packages/api/src/types/tenant-types.ts"
Task: "Create TypeScript type definitions in packages/api/src/types/rbac-types.ts"
Task: "Create TypeScript type definitions in packages/api/src/types/audit-types.ts"

# Launch all service functions together (after models):
Task: "Implement tenant-service.ts with createTenant() function"
Task: "Implement tenant-service.ts with updateTenant() function"
Task: "Implement tenant-service.ts with getTenantById() function"
Task: "Implement tenant-service.ts with listTenants() function"

# Launch all controller handlers together (after services):
Task: "Create tenant-controller.ts with createTenant handler"
Task: "Create tenant-controller.ts with getTenant handler"
Task: "Create tenant-controller.ts with updateTenant handler"
Task: "Create tenant-controller.ts with listTenants handler"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 6 → Test independently → Deploy/Demo (RBAC enforcement)
5. Add User Story 3 → Test independently → Deploy/Demo
6. Add User Story 4 → Test independently → Deploy/Demo
7. Add User Story 5 → Test independently → Deploy/Demo
8. Add User Story 7 → Test independently → Deploy/Demo
9. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (Tenant Management)
   - Developer B: User Story 6 (RBAC - can work in parallel with A)
   - Developer C: User Story 2 (Module Management - after US1)
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
- RBAC (US6) is foundational but listed as separate phase for clarity - it can be implemented in parallel with US1
- All tasks include exact file paths for immediate execution

---

## Summary

**Total Tasks**: 174
- Phase 1 (Setup): 4 tasks
- Phase 2 (Foundational): 33 tasks
- Phase 3 (US1): 23 tasks
- Phase 4 (US2): 13 tasks
- Phase 5 (US6): 8 tasks
- Phase 6 (US3): 16 tasks
- Phase 7 (US4): 26 tasks
- Phase 8 (US5): 28 tasks
- Phase 9 (US7): 11 tasks
- Phase 10 (Polish): 12 tasks

**Parallel Opportunities**: 45+ tasks marked [P] can run in parallel

**Suggested MVP Scope**: Phase 1 + Phase 2 + Phase 3 (User Story 1) = 60 tasks

**Independent Test Criteria**:
- US1: Create tenant, verify in list, view details
- US2: Activate modules, verify access control
- US3: Send invitation, verify token, accept invitation
- US4: Update roles, disable account, verify access changes
- US5: Create subscription, generate invoice, mark paid
- US6: Assign roles, test permission checks, verify isolation
- US7: View statistics, verify accuracy of counts and dates

