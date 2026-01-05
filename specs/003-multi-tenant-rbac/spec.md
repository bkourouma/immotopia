# Feature Specification: Multi-Tenant SaaS Architecture with RBAC

**Feature Branch**: `003-multi-tenant-rbac`  
**Created**: 2025-01-27  
**Status**: Draft  
**Input**: User description: "Implement multi-tenant SaaS architecture with Central Admin tenant management, tenant-level user management (collaborators), hierarchical roles/permissions (RBAC), and SaaS subscriptions & invoicing"

## Clarifications

### Session 2025-01-27

- Q: What should be the expiration period for collaborator invitation tokens? → A: 7 days
- Q: What should happen when the system cannot send an invitation email? → A: Create invitation, log failure, allow retry - Invitation is created and stored, email failure is logged, admin can resend email later
- Q: When a tenant is suspended, should active user sessions be terminated immediately or on the next request? → A: Terminate immediately - All active sessions invalidated instantly, users logged out immediately
- Q: When a tenant's subscription expires or is canceled, should the tenant be suspended (no access) or limited to read-only access? → A: Limited to read-only access - Users can view data but cannot create, edit, or delete anything
- Q: When a module is disabled while users are actively using it, how should access be revoked? → A: Revoke immediately - All active operations in that module are terminated instantly, users see error message

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Central Admin Creates and Configures Tenant (Priority: P1)

A Platform Admin needs to create new tenant organizations (agencies, property managers, developers) and configure their basic settings, status, and branding so that new customers can be onboarded into the system.

**Why this priority**: This is the foundational capability that enables all other tenant operations. Without tenant creation, the multi-tenant system cannot function.

**Independent Test**: Can be fully tested by creating a new tenant with all required fields, verifying it appears in the tenant list, and confirming the tenant can be viewed in detail. This delivers the core value of enabling new customer onboarding.

**Acceptance Scenarios**:

1. **Given** a Platform Admin is logged in, **When** they create a new tenant with name, type (agence/syndic/promoteur), contact email, and status, **Then** the tenant is created and appears in the tenant list with the correct information
2. **Given** a Platform Admin is viewing a tenant, **When** they update tenant status to Suspended, **Then** the tenant status changes, all active user sessions are immediately invalidated and terminated, and all tenant users are logged out and prevented from accessing the system
3. **Given** a Platform Admin is creating a tenant, **When** they provide optional branding information (logo, primary color), **Then** this information is stored and can be retrieved for tenant customization

---

### User Story 2 - Central Admin Activates Modules for Tenant (Priority: P1)

A Platform Admin needs to enable specific functional modules (AGENCY, SYNDIC, PROMOTER) for each tenant so that tenants only see and access features relevant to their business type.

**Why this priority**: Module activation gates access to features and is required before tenants can use the system effectively. This must work in conjunction with tenant creation.

**Independent Test**: Can be fully tested by activating different module combinations for a tenant, verifying that only enabled modules are accessible via API and UI, and confirming disabled modules return appropriate access denied responses. This delivers the value of feature gating and customization per tenant.

**Acceptance Scenarios**:

1. **Given** a Platform Admin is viewing a tenant detail page, **When** they toggle the AGENCY module to enabled, **Then** the module is activated and tenant users can access agency-related features
2. **Given** a tenant has only SYNDIC module enabled, **When** a tenant user attempts to access a PROMOTER-only feature, **Then** they receive a 403 Forbidden error with "Module disabled" message
3. **Given** a Platform Admin enables multiple modules for a tenant, **When** they view the tenant statistics, **Then** all enabled modules are listed in the activated modules count

---

### User Story 3 - Tenant Admin Invites Collaborator (Priority: P2)

A Tenant Admin needs to invite new collaborators (employees) to their tenant organization by email so that team members can join and access the system with appropriate roles.

**Why this priority**: This enables tenant organizations to onboard their team members. While tenant creation is foundational, user management is the next critical capability for tenants to actually use the system.

**Independent Test**: Can be fully tested by sending an invitation, verifying the invitation token is generated and stored, sending the invitation email, and confirming the invitee can accept and complete account setup. This delivers the value of team member onboarding.

**Acceptance Scenarios**:

1. **Given** a Tenant Admin is logged into their tenant context, **When** they invite a collaborator by email with assigned roles, **Then** an invitation is created with a secure token, an email is sent (or failure is logged if email cannot be sent), and the invitation appears in pending status
2. **Given** a user receives an invitation email, **When** they click the invitation link and complete account setup (password or Google sign-in), **Then** they are bound to the tenant membership with the assigned roles and can access the system
3. **Given** a Tenant Admin invites a collaborator with an email that already exists in the system, **When** the invitation is accepted, **Then** a new membership is created for the existing user to that tenant without creating a duplicate user account

---

### User Story 4 - Tenant Admin Manages Collaborator Roles and Status (Priority: P2)

A Tenant Admin needs to update collaborator roles, enable/disable accounts, and reset passwords so that they can manage their team's access and permissions as organizational needs change.

**Why this priority**: This provides ongoing user management capabilities that are essential for tenant operations. It complements the invitation flow by allowing updates after initial onboarding.

**Independent Test**: Can be fully tested by updating a collaborator's roles, disabling their account, verifying access is revoked, then re-enabling and confirming access is restored. This delivers the value of ongoing team management.

**Acceptance Scenarios**:

1. **Given** a Tenant Admin is viewing a collaborator's profile, **When** they assign additional roles to the collaborator, **Then** the roles are updated and the collaborator immediately has access to features associated with those roles
2. **Given** a Tenant Admin disables a collaborator account, **When** that collaborator attempts to log in, **Then** they receive an error message indicating their account is disabled
3. **Given** a Tenant Admin triggers a password reset for a collaborator, **When** the collaborator receives the reset email and sets a new password, **Then** they can log in with the new password and all their existing sessions are invalidated

---

### User Story 5 - Central Admin Manages Tenant Subscription and Billing (Priority: P3)

A Platform Admin needs to assign subscription plans (Basic/Pro/Elite), track subscription status, and manage invoices so that tenant billing and subscription lifecycle can be managed.

**Why this priority**: While important for SaaS operations, billing can initially be managed manually. This enables revenue tracking and subscription management but is not required for core tenant functionality.

**Independent Test**: Can be fully tested by creating a subscription for a tenant, generating an invoice, marking it as paid, and verifying subscription status updates accordingly. This delivers the value of subscription and billing management.

**Acceptance Scenarios**:

1. **Given** a Platform Admin is viewing a tenant, **When** they assign a Pro plan with monthly billing cycle, **Then** the subscription is created with active status and billing period dates are set
2. **Given** a Platform Admin creates an invoice for a tenant subscription, **When** they mark the invoice as paid, **Then** the invoice status updates to paid, payment date is recorded, and subscription status reflects active payment
3. **Given** a tenant subscription is past due, **When** a Platform Admin views tenant statistics, **Then** the subscription status shows as past_due and this is clearly indicated in the tenant overview

---

### User Story 6 - System Enforces Role-Based Access Control (Priority: P1)

The system needs to enforce permissions based on user roles and tenant context so that users can only access features and data they are authorized to see, maintaining security and data isolation.

**Why this priority**: This is a foundational security requirement that must work correctly from the start. Without proper RBAC enforcement, the multi-tenant system cannot guarantee data isolation and security.

**Independent Test**: Can be fully tested by assigning different roles to users, attempting to access features with and without required permissions, and verifying that only authorized access is granted. This delivers the value of security and proper access control.

**Acceptance Scenarios**:

1. **Given** a user has only TENANT_AGENT role with limited permissions, **When** they attempt to access a feature requiring TENANT_ADMIN permissions, **Then** they receive a 403 Forbidden error and the action is logged in audit logs
2. **Given** a user belongs to Tenant A, **When** they attempt to access data from Tenant B (even with correct permissions), **Then** they receive a 403 Forbidden error and tenant isolation is maintained
3. **Given** a Platform Admin with PLATFORM_SUPER_ADMIN role, **When** they access platform-level features, **Then** they have full access regardless of tenant context, and their actions are logged

---

### User Story 7 - Central Admin Views Global Tenant Statistics (Priority: P3)

A Platform Admin needs to view aggregated statistics across all tenants (collaborator counts, module activations, subscription status, activity) so that they can monitor platform health and tenant engagement.

**Why this priority**: This provides valuable insights but is not required for core operations. It enhances admin capabilities for monitoring and decision-making.

**Independent Test**: Can be fully tested by viewing tenant statistics, verifying counts are accurate, checking that last login dates reflect recent activity, and confirming subscription statuses are correctly displayed. This delivers the value of platform visibility and monitoring.

**Acceptance Scenarios**:

1. **Given** a Platform Admin views the tenant list, **When** they access statistics for a specific tenant, **Then** they see accurate counts of active/disabled collaborators, list of enabled modules, current subscription plan and status, and most recent login date
2. **Given** multiple tenants exist with various subscription statuses, **When** a Platform Admin filters tenants by subscription status, **Then** only tenants matching that status are displayed
3. **Given** a tenant has no recent user activity, **When** a Platform Admin views tenant statistics, **Then** the last login date clearly indicates no recent activity or shows the actual last login timestamp

---

### Edge Cases

- What happens when a user is invited to a tenant but their email already has a membership to that tenant? (System should prevent duplicate invitation and show friendly error)
- How does the system handle invitation token expiration? (Invitation tokens expire after 7 days. Expired invitations should be clearly marked and require re-invitation)
- What happens when a tenant is suspended while users are actively using the system? (All active sessions are immediately invalidated and terminated, users are logged out instantly, and new logins are prevented)
- How does the system handle a user who belongs to multiple tenants? (User should be able to switch tenant context, and permissions should be scoped to the active tenant)
- What happens when a module is disabled while users are actively using features in that module? (All active operations in that module are terminated immediately, users see an error message indicating the module has been disabled, and subsequent requests to that module return 403 Forbidden)
- How does the system handle role assignment conflicts? (Multiple roles should combine permissions, with most permissive access granted)
- What happens when a subscription expires or is canceled? (Tenant access is limited to read-only - users can view data but cannot create, edit, or delete anything. Full access is restored when subscription is reactivated)
- How does the system handle audit logging when actions are performed by system processes? (System actions should be logged with null actor_user_id but include action details)
- What happens when email sending fails during invitation? (Invitation is still created and stored, email failure is logged, and Tenant Admin can resend the invitation email later)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow Platform Admins to create tenant organizations with required information (name, type, contact email, status)
- **FR-002**: System MUST support tenant types: agence, syndic, promoteur, amenageur
- **FR-003**: System MUST allow Platform Admins to set tenant status (Active, Suspended, Pending) and enforce access restrictions based on status. When a tenant is suspended, all active user sessions MUST be immediately invalidated and terminated
- **FR-004**: System MUST store optional tenant branding information (logo URL, primary color, subdomain/custom domain placeholders)
- **FR-005**: System MUST allow Platform Admins to activate/deactivate functional modules (MODULE_AGENCY, MODULE_SYNDIC, MODULE_PROMOTER) per tenant
- **FR-006**: System MUST enforce module gating so that features are only accessible when both the required permission AND the module are enabled. When a module is disabled, all active operations in that module MUST be terminated immediately and users MUST see an error message
- **FR-007**: System MUST allow Tenant Admins to invite collaborators by email with role assignments. If email sending fails, the invitation MUST still be created and stored, the failure MUST be logged, and the admin MUST be able to resend the email later
- **FR-008**: System MUST generate secure invitation tokens with expiration dates for collaborator invitations (tokens expire after 7 days)
- **FR-009**: System MUST support two onboarding modes: invitation flow (token-based) and direct creation (with temporary password and forced reset)
- **FR-010**: System MUST allow Tenant Admins to update collaborator roles, enable/disable accounts, reset passwords, and revoke sessions
- **FR-011**: System MUST allow Tenant Admins to search and filter collaborators by name, email, role, and status
- **FR-012**: System MUST support hierarchical role-based access control (RBAC) with granular permissions
- **FR-013**: System MUST allow users to have multiple roles simultaneously, with permissions combined from all assigned roles
- **FR-014**: System MUST enforce permission checks on every request, requiring both permission AND module enablement (if applicable)
- **FR-015**: System MUST maintain strict tenant isolation - users from one tenant must never access data from another tenant
- **FR-016**: System MUST support platform-scoped roles (no tenant restriction) and tenant-scoped roles (require tenant context)
- **FR-017**: System MUST seed default roles: PLATFORM_SUPER_ADMIN, TENANT_ADMIN, TENANT_MANAGER, TENANT_AGENT, TENANT_ACCOUNTANT
- **FR-018**: System MUST allow Platform Admins to assign subscription plans (Basic, Pro, Elite) to tenants
- **FR-019**: System MUST track subscription status (trialing, active, past_due, canceled, suspended) and billing cycle (monthly, annual). When subscription expires or is canceled, tenant access MUST be limited to read-only (view only, no create/edit/delete operations)
- **FR-020**: System MUST allow Platform Admins to create invoices, track payment status (draft, issued, paid, failed, canceled, refunded), and mark invoices as paid manually
- **FR-021**: System MUST provide tenant statistics including: collaborator counts (active vs disabled), activated modules list, subscription status and plan, last login date (tenant-wide)
- **FR-022**: System MUST allow Platform Admins to search and filter tenants by status, type, plan, and module
- **FR-023**: System MUST create audit log entries for all admin actions affecting tenants, users, billing, roles, and permissions
- **FR-024**: System MUST handle existing user emails during invitation - create membership and roles without creating duplicate user accounts
- **FR-025**: System MUST prevent duplicate invitations when a user is already a member of the target tenant
- **FR-026**: System MUST provide clear 403 Forbidden errors with descriptive messages when access is denied due to permissions or module restrictions
- **FR-027**: System MUST support invitation acceptance flow that binds user accounts to tenant memberships and assigned roles
- **FR-028**: System MUST allow Tenant Admins to resend invitation emails for pending invitations

### Key Entities *(include if feature involves data)*

- **Tenant**: Represents an organization (agency, property manager, developer) using the platform. Key attributes: name, legal name, type, status, contact information, branding, creation date. Relationships: has many memberships, has many modules, has one subscription, has many invoices.

- **Tenant Module**: Represents activation of a functional module for a tenant. Key attributes: module key (AGENCY, SYNDIC, PROMOTER), enabled status, enabled date, enabled by user. Relationships: belongs to one tenant.

- **User**: Represents a person using the system. Key attributes: email (unique), full name, phone, authentication provider bindings, status, last login date. Relationships: has many memberships, has many user roles.

- **Membership**: Represents the relationship between a user and a tenant. Key attributes: membership status (active, disabled, pending_invite), invitation details, acceptance date. Relationships: belongs to one user, belongs to one tenant. Enforces uniqueness of user-tenant pairs.

- **Role**: Represents a collection of permissions with a scope (platform or tenant). Key attributes: scope, key (unique identifier), name, description. Relationships: has many role permissions, has many user roles.

- **Permission**: Represents a granular access right. Key attributes: key (unique identifier), description. Relationships: belongs to many roles through role_permissions.

- **User Role**: Represents assignment of a role to a user, optionally scoped to a tenant. Key attributes: tenant_id (nullable - required for tenant roles, null for platform roles). Relationships: belongs to one user, belongs to one role, optionally belongs to one tenant.

- **Invitation**: Represents a pending invitation for a user to join a tenant. Key attributes: email, token hash, expiration date, status, acceptance details. Relationships: belongs to one tenant, created by one user, optionally accepted by one user.

- **Subscription**: Represents a tenant's subscription plan and billing cycle. Key attributes: plan key, billing cycle, status, period dates, cancellation date. Relationships: belongs to one tenant, has many invoices.

- **Invoice**: Represents a billing invoice for a tenant. Key attributes: invoice number (unique), issue date, due date, currency, total amount, status, payment date. Relationships: belongs to one tenant, optionally belongs to one subscription.

- **Audit Log**: Represents a record of system actions for compliance and debugging. Key attributes: actor user (nullable for system actions), tenant (nullable for platform actions), action key, entity type and ID, IP address, user agent, payload. Relationships: optionally belongs to one user, optionally belongs to one tenant.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Platform Admins can create and configure a new tenant with all required information in under 5 minutes
- **SC-002**: System maintains 100% tenant data isolation - zero instances of cross-tenant data access in production
- **SC-003**: Permission checks complete in under 50ms for 95% of requests, ensuring authorization does not significantly impact response times
- **SC-004**: 95% of collaborator invitations are successfully accepted and completed within 48 hours of sending
- **SC-005**: System supports at least 1000 concurrent tenant organizations without performance degradation
- **SC-006**: All admin actions (tenant creation, user management, billing operations) are logged in audit trail with 100% coverage
- **SC-007**: Module gating prevents unauthorized feature access with zero false positives (legitimate access denied) and zero false negatives (unauthorized access granted)
- **SC-008**: Tenant Admins can search and filter their collaborator list and find any user within 2 seconds for tenants with up to 500 collaborators
- **SC-009**: System handles subscription status changes and billing updates without data inconsistency - 100% of subscription state transitions are correctly recorded
- **SC-010**: Platform Admins can view comprehensive tenant statistics for any tenant, with all metrics loading within 3 seconds
