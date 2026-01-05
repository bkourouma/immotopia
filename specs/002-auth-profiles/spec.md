# Feature Specification: User Authentication & Profiles Refactor

**Feature Branch**: `002-auth-profiles`
**Created**: 2025-12-09
**Status**: Draft
**Input**: User provided prompt: `logiciel_immotop_auth_profiles_refactor_prompt.md`

## Clarifications

### Session 2025-12-09

- Q: How should the system identify which Tenant is currently active for a User? → A: **URL-based** (e.g., `/app/{tenantSlug}/...`).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Visitor Registration to Tenant Client (Priority: P1)

A public visitor exploring properties managed by a specific Tenant (agency) decides to initiate a transaction (e.g., make an offer or request). They must authenticate, which automatically registers them as a client of that specific Tenant.

**Why this priority**: Core revenue flow. Visitors must convert to identified users to interact with properties.

**Independent Test**: Simulate a visitor flow on a property page, trigger signup/login, and verify `TenantClient` record creation.

**Acceptance Scenarios**:

1. **Given** a visitor browsing Tenant A's property, **When** they click "Rent/Buy" and sign up with a new email, **Then** a global `User` is created, and a `TenantClient` linked to Tenant A is created.
2. **Given** an existing User (client of Tenant B), **When** they login on Tenant A's property, **Then** a new `TenantClient` record for Tenant A is added to their existing User account.

---

### User Story 2 - Authentication & Security Flows (Priority: P1)

Users must be able to log in securely using Email/Password or Google OAuth, with verification steps to ensure identity and data integrity.

**Why this priority**: Security foundation. Prevents unauthorized access and ensures valid contact info.

**Independent Test**: Test login provider switching, email verification links, and password reset tokens.

**Acceptance Scenarios**:

1. **Given** a new user, **When** they register with email/password, **Then** they receive a verification email and cannot access full features until verified.
2. **Given** a user with a Google account, **When** they log in via Google, **Then** the account is automatically marked verified and linked to any existing account with the same email.
3. **Given** a user who forgot their password, **When** they request a reset, **Then** they receive a secure, time-limited token to set a new password.

---

### User Story 3 - Tenant Collaborator Management (Priority: P1)

Tenant Admins need to manage their staff (Agents, Managers) by inviting them to the platform.

**Why this priority**: Operational necessity for Agencies/Operators to function.

**Independent Test**: Admin invites a user; user accepts and gains specific permissions.

**Acceptance Scenarios**:

1. **Given** a Tenant Admin, **When** they invite `agent@example.com` with role `AGENT`, **Then** an invitation email is sent.
2. **Given** an invited user, **When** they click the link and set a password, **Then** they gain access to the Tenant's dashboard with `AGENT` permissions.

---

### User Story 4 - Multi-Tenant Data Isolation (Priority: P2)

A single user identity may interact with multiple Tenants (e.g., renting from Agency A, owning via Agency B). Data must be strictly isolated.

**Why this priority**: Privacy and data security compliance.

**Independent Test**: User with dual roles accesses API endpoints for both tenants.

**Acceptance Scenarios**:

1. **Given** a User logged in context of Tenant A, **When** they request transaction history, **Then** they see ONLY transactions related to Tenant A.
2. **Given** a User, **When** they attempt to access an object belonging to Tenant B while in Tenant A context, **Then** the system returns 403 Forbidden.

---

### Edge Cases

- **Duplicate Account**: User tries to register email/password when Google account exists. System should prompt to login or link.
- **Tenant Removal**: If a Tenant is archived, their Collaborators and Clients lose access to that Tenant's scope but keep their User account.
- **Unverified Access**: Unverified email users specific restrictions (e.g., can browse but not commit to contracts).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support authentication via Email/Password and Google OAuth2.
- **FR-002**: System MUST enforce a unified `User` identity where `email` is unique across the platform.
- **FR-003**: System MUST support `Tenant` entities (e.g., Real Estate Agencies, Operators).
- **FR-004**: System MUST link Users to Tenants via `TenantClient` (for customers) and `Collaborator` (for staff) records.
- **FR-005**: System MUST ensure a User can have at most one `TenantClient` record per Tenant.
- **FR-006**: System MUST implement Role-Based Access Control (RBAC) enabling SuperAdmin, TenantAdmin, Collaborator, and TenantClient permissions.
- **FR-007**: System MUST implement secure Email Verification flow for password-based registration.
- **FR-008**: System MUST implement Password Reset flow with expiring tokens.
- **FR-009**: System MUST allow users to set a local password even if they initially signed up via Google.
- **FR-010**: System MUST enforce password complexity (min length, etc.) and use strong hashing (Argon2 or Bcrypt).
- **FR-011**: System MUST automatically link Google logins to existing email accounts if the email matches.
- **FR-012**: APIs MUST enforce data isolation based on the current `tenantId` context.
- **FR-013**: System MUST use URL-based tenant context (e.g., `/app/{tenantSlug}/...`) to identify the active Tenant for the session.

### Key Entities *(include if feature involves data)*

- **User**: The central identity (id, email, passwordHash, globalRole).
- **Tenant**: The organization entity (id, name, type).
- **Collaborator**: Link table `User <-> Tenant` with `Role` (Admin, Agent).
- **TenantClient**: Link table `User <-> Tenant` with `ClientType` (Owner, Renter).

### Assumptions

- Google OAuth credentials (Client ID/Secret) will be configured/available.
- Existing user data will be migrated using a separate migration strategy (details in Implementation Plan).
- Email delivery service is available for sending verification/reset emails.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of authenticated users have a valid, unique email address (verified if local auth).
- **SC-002**: Users can complete a "Visitor to Tenant Client" registration flow in under 2 minutes.
- **SC-003**: A User with access to two Tenants CANNOT access data from Tenant B when operating in Tenant A context (0% data leak).
- **SC-004**: Support for 100% of defined personas (SuperAdmin, Tenant Admin, Collaborator, Owner, Renter).
