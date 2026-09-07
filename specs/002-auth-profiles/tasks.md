# Implementation Tasks: User Authentication & Profiles Refactor

**Feature**: `User Authentication & Profiles Refactor`
**Spec**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)

## Success Metrics & Progress

- [ ] Total Tasks: 31
- [ ] Phase 1: Setup (3)
- [ ] Phase 2: Foundational (5)
- [ ] Phase 3: Auth & Security (10)
- [ ] Phase 4: Visitor Registration (5)
- [ ] Phase 5: Collaborator Management (5)
- [ ] Phase 6: Data Isolation (3)

## Phase 1: Setup

> **Goal**: Prepare the repository for feature development.

- [x] T001 Install auth dependencies (passport, jsonwebtoken, google-auth-library) in `packages/api/package.json`
- [ ] T002 Update `apps/web/package.json` with necessary UI libraries if needed
- [x] T003 Configure environment variables for Google OAuth and JWT secrets in `.env.example`

## Phase 2: Foundational (Blocking)

> **Goal**: Establish the data model and core infrastructure required for all user stories.

- [x] T004 Define `User`, `Tenant`, `Collaborator`, `TenantClient` models in `packages/api/prisma/schema.prisma`
- [x] T005 Run Prisma migration to apply schema changes
- [x] T006 [P] Implement `EmailService` stub in `packages/api/src/services/email-service.ts`
- [x] T007 [P] Implement basic JWT utility functions in `packages/api/src/utils/jwt-utils.ts`
- [x] T008 Implement base `authMiddleware` to extract user from token in `packages/api/src/middleware/auth-middleware.ts`

## Phase 3: User Story 2 - Authentication & Security Flows (P1)

> **Goal**: Users must be able to log in securely using Email/Password or Google OAuth.

- [x] T009 [US2] Implement `signup` service logic (hash password, create User) in `packages/api/src/services/auth-service.ts`
- [x] T010 [US2] Implement `login` service logic (verify password, issue token) in `packages/api/src/services/auth-service.ts`
- [x] T011 [US2] Create Auth Controller with `/signup` and `/login` endpoints in `packages/api/src/controllers/auth-controller.ts`
- [x] T012 [P] [US2] Implement Google OAuth strategy configuration in `packages/api/src/config/passport.ts`
- [x] T013 [US2] Add `/auth/google` and callback endpoints in `packages/api/src/routes/auth-routes.ts`
- [x] T014 [US2] Implement `verifyEmail` logic and endpoint in `packages/api/src/controllers/auth-controller.ts`
- [x] T015 [US2] Implement password reset request/confirm logic in `packages/api/src/services/auth-service.ts`
- [x] T016 [US2] Create Login page UI in `apps/web/src/pages/Login.tsx`
- [x] T017 [US2] Create Registration page UI in `apps/web/src/pages/Register.tsx`
- [x] T018 [US2] Create Password Reset flow UI in `apps/web/src/pages/ResetPassword.tsx`

## Phase 4: User Story 1 - Visitor Registration to Tenant Client (P1)

> **Goal**: Visitors convert to identified users and link to a Tenant.

- [x] T019 [US1] Implement `registerTenantClient` service method in `packages/api/src/services/tenant-service.ts`
- [x] T020 [US1] Create API endpoint `/tenants/:tenantId/register` in `packages/api/src/controllers/tenant-controller.ts`
- [ ] T021 [US1] Update `authMiddleware` to handle simultaneous User creation and Tenant linking
- [x] T022 [US1] Create Tenant-specific Registration Component in `apps/web/src/components/tenant/TenantRegisterForm.tsx`
- [x] T023 [P] [US1] Verify `TenantClient` creation on registration in `tests/integration/visitor-flow.test.ts`

## Phase 5: User Story 3 - Tenant Collaborator Management (P1)

> **Goal**: Tenant Admins manage their staff via invites.

- [x] T024 [US3] Implement `inviteCollaborator` service logic in `packages/api/src/services/collaborator-service.ts`
- [x] T025 [US3] Implement `acceptInvite` logic (set password, confirm role) in `packages/api/src/services/collaborator-service.ts`
- [x] T026 [US3] Create API endpoints for invite management in `packages/api/src/controllers/collaborator-controller.ts`
- [x] T027 [US3] Build Admin Team Management UI in `apps/web/src/pages/admin/TeamPage.tsx`
- [x] T028 [US3] Build Invite Acceptance Page in `apps/web/src/pages/auth/AcceptInvitePage.tsx`

## Phase 6: User Story 4 - Multi-Tenant Data Isolation (P2)

> **Goal**: Ensure Strict Data Isolation and RBAC.

- [x] T029 [US4] Implement `requireTenantAccess` middleware in `packages/api/src/middleware/tenant-middleware.ts`
- [ ] T030 [US4] Update existing services to enforce `tenantId` in Prisma queries (where clause injection)
- [x] T031 [P] [US4] Add integration tests for data isolation (ensure 403 on cross-tenant access) in `tests/integration/isolation.test.ts`

## Implementation Strategy

1. **Foundations First**: Focus on the generic `User` and `Tenant` schema to unblock all other tasks.
2. **Auth Core**: Get the basic Email/Pass and Google Auth working so we can log in.
3. **Tenant Context**: Once identified, implement the linking logic for Visitors and Collaborators.
4. **Hardening**: Finally, ensure the isolation middleware covers all access paths.
