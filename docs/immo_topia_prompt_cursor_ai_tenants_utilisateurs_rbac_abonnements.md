# Prompt Cursor AI — ImmoTopia (Tenants + Utilisateurs + RBAC + Abonnements)

You are Cursor AI working inside the existing ImmoTopia codebase. Basic authentication already exists (email + Google). Now implement the missing functional modules for: (1) Central Admin tenant management, (2) Tenant-level user management, and (3) Hierarchical roles/permissions in a SaaS multi-tenant architecture, as specified in the requirements: authentication + multi-roles + multi-tenant SaaS; tenant creation/configuration; module activation per tenant (agence/syndic/promoteur); SaaS subscriptions & invoicing; global tenant statistics; creation/management of tenant collaborators.

Work step-by-step, implement, and keep changes consistent with the current app behavior.

---

## A) TARGET USER TYPES & SCOPE

### 1) Platform (Central) Admin

- Can manage ALL tenants
- Can manage subscription/billing settings at tenant level
- Can view global tenant statistics
- Not tied to a tenant for permissions (but may optionally belong to an internal “Platform” tenant if the codebase already enforces a tenantId everywhere)

### 2) Tenant Admin (per tenant)

- Manages collaborators (employees of the tenant: agents, managers, accountants, etc.)
- Manages tenant settings (within allowed scope)
- Cannot access other tenants

### 3) Tenant Collaborator (per tenant)

- Has permissions depending on role (Agent, Manager, Comptable, etc.)
- Always scoped to exactly one tenant context at a time

**NOTE:** Keep support for clients (propriétaire/locataire/copropriétaire/acquéreur) out of scope for now, except ensuring the RBAC system can support them later.

---

## B) MODULES TO IMPLEMENT (FUNCTIONAL)

### B1) Central Admin – Tenant Management

**Required features:**

1. **Tenant creation and configuration**

- Create tenant with:
  - tenantName, legalName (optional), tenantType (agence | syndic | promoteur | amenageur)
  - contact email/phone, address, country/city (optional)
  - status: Active / Suspended / Pending
  - branding: logo, primaryColor, subdomain/custom domain fields (optional placeholders)

2. **Module activation per tenant**

- Activate features by module flags:
  - MODULE\_AGENCY
  - MODULE\_SYNDIC
  - MODULE\_PROMOTER
  - (optional future: MODULE\_RENTAL, MODULE\_CRM, MODULE\_LISTINGS, etc.)
- Ensure module flags gate navigation + API access (**permission + module both required**)

3. **SaaS subscription & billing management (admin-operated)**

- Define tenant plan: Basic / Pro / Elite (or existing plans in codebase)
- Track subscription status: trialing, active, past\_due, canceled, suspended
- Billing period: monthly/annual
- Store invoices and payment status (paid/unpaid/failed/refunded)
- This can be “manual billing” first (admin marks invoices paid) if no payment provider exists yet

4. **Global statistics by tenant**
   At minimum:

-
  # of collaborators (active vs disabled)
- Activated modules count/list
- Subscription status + current plan
- Last login date (tenant-wide: most recent user login)
- Optional: # of listings/properties later (just design placeholders)

**UX screens (Central Admin):**

- **Tenants List:** search/filter by status/type/plan/module
- **Tenant Detail:**
  - Overview (status, type, createdAt, lastActivity)
  - Modules toggles
  - Subscription (plan, cycle, status, dates)
  - Billing: invoices list + “create invoice” + “mark as paid”
  - Users summary (count, last login)
  - Audit log (tenant-level)

---

### B2) Tenant – User Management (Collaborators)

**Required features:**

1. **Invite/Create collaborator**

- Tenant Admin can create collaborator accounts by:
  - email (required), full name
  - optional phone
  - assign one or more roles
  - choose status: Active / Disabled
- Two onboarding modes:
  - **A) Invite flow:** send invitation link (token) -> user sets password or completes Google sign-in binding
  - **B) Direct create:** creates user with temporary password + force reset (or “set password” link)

2. **Update collaborator**

- Change roles
- Enable/disable account
- Reset password (admin triggers a reset email/link)
- Revoke sessions (force logout)

3. **List collaborators**

- Search by name/email
- Filter by role/status

**UX screens (Tenant Admin):**

- Collaborators List
- Create Collaborator / Invite Collaborator
- Collaborator Detail drawer/page (profile, roles, status, audit events)

---

### B3) Hierarchical Roles & Permissions (RBAC)

**Required features:**

- Permissions are granular strings like:
  - TENANT\_SETTINGS\_VIEW / TENANT\_SETTINGS\_EDIT
  - USERS\_VIEW / USERS\_CREATE / USERS\_EDIT / USERS\_DISABLE
  - BILLING\_VIEW (tenant-side) / BILLING\_ADMIN (platform)
  - MODULES\_VIEW / MODULES\_EDIT (platform only)
- Roles are collections of permissions
- Users can have multiple roles
- Scoping:
  - Platform permissions are global (no tenant restriction)
  - Tenant permissions are restricted to a tenant context (must match tenantId)

**Default roles to seed:**

Platform:

- PLATFORM\_SUPER\_ADMIN (all platform permissions)

Tenant:

- TENANT\_ADMIN (manage users + tenant settings + module-visible areas)
- TENANT\_MANAGER (some management permissions, no billing edit by default)
- TENANT\_AGENT (limited: view/create listings, view clients, etc. placeholders ok)
- TENANT\_ACCOUNTANT (billing/accounting permissions placeholders)

**Enforcement rules:**

- Every request must resolve:
  1. user identity (already exists)
  2. tenant context (required for tenant routes)
  3. authorization = permission check AND module enabled (if feature belongs to a module)
- Provide clear “403 Forbidden” errors and audit them.

---

## C) DATABASE SCHEMA (PROPOSED TABLES)

Implement these entities (adapt to existing schema naming conventions):

### 1) tenants

- id (UUID)
- name
- legal\_name (nullable)
- tenant\_type (enum: agence/syndic/promoteur/amenageur)
- status (enum: pending/active/suspended)
- contact\_email, contact\_phone (nullable)
- country, city, address (nullable)
- branding\_logo\_url, branding\_primary\_color (nullable)
- created\_at, updated\_at

### 2) tenant\_modules

- id
- tenant\_id (FK tenants.id)
- module\_key (enum or string: AGENCY, SYNDIC, PROMOTER, etc.)
- enabled (bool)
- enabled\_at, enabled\_by (userId)
- UNIQUE(tenant\_id, module\_key)

### 3) users (if already exists, extend it)

- id
- email (unique)
- full\_name
- phone (nullable)
- auth\_provider bindings already present (google/email)
- status: active/disabled
- last\_login\_at
- created\_at, updated\_at

### 4) memberships (user ↔ tenant)

- id
- user\_id (FK users.id)
- tenant\_id (FK tenants.id)
- membership\_status (active/disabled/pending\_invite)
- invited\_at, invited\_by, accepted\_at
- UNIQUE(user\_id, tenant\_id)

(If your product guarantees a user belongs to exactly one tenant, you may still model it as membership for future-proofing.)

### 5) roles

- id
- scope (enum: platform/tenant)
- key (unique string: PLATFORM\_SUPER\_ADMIN, TENANT\_ADMIN…)
- name (display)
- description (nullable)

### 6) permissions

- id
- key (unique string)
- description (nullable)

### 7) role\_permissions

- role\_id
- permission\_id
- UNIQUE(role\_id, permission\_id)

### 8) user\_roles

- id
- user\_id
- role\_id
- tenant\_id (nullable)

Rules:

- If role.scope = platform => tenant\_id MUST be NULL
- If role.scope = tenant => tenant\_id MUST be NOT NULL (and match membership tenant\_id)

### 9) invitations

- id
- tenant\_id
- email
- token\_hash
- expires\_at
- invited\_by
- accepted\_by (nullable)
- accepted\_at (nullable)
- status (pending/accepted/expired/revoked)

### 10) subscriptions

- id
- tenant\_id
- plan\_key (Basic/Pro/Elite or existing)
- billing\_cycle (monthly/annual)
- status (trialing/active/past\_due/canceled/suspended)
- start\_at, current\_period\_start, current\_period\_end
- cancel\_at (nullable)
- metadata\_json (nullable)

### 11) invoices

- id
- tenant\_id
- subscription\_id (nullable)
- invoice\_number (unique)
- issue\_date, due\_date
- currency (FCFA default)
- amount\_total
- status (draft/issued/paid/failed/canceled/refunded)
- paid\_at (nullable)
- notes (nullable)

### 12) audit\_logs

- id
- actor\_user\_id (nullable for system)
- tenant\_id (nullable for platform-only actions)
- action\_key (TENANT\_CREATED, MODULE\_ENABLED, USER\_INVITED, USER\_DISABLED, ROLE\_ASSIGNED, INVOICE\_MARKED\_PAID…)
- entity\_type, entity\_id
- ip\_address (nullable), user\_agent (nullable)
- payload\_json (nullable)
- created\_at

---

## D) API / ROUTES (FUNCTIONAL CONTRACT)

Define or align endpoints with existing routing:

### Platform Admin (protected by PLATFORM\_SUPER\_ADMIN)

- GET /admin/tenants
- POST /admin/tenants
- GET /admin/tenants/\:tenantId
- PATCH /admin/tenants/\:tenantId (status/config)
- GET /admin/tenants/\:tenantId/modules
- PUT /admin/tenants/\:tenantId/modules (toggle list)
- GET /admin/tenants/\:tenantId/subscription
- PUT /admin/tenants/\:tenantId/subscription (plan/status/cycle)
- GET /admin/tenants/\:tenantId/invoices
- POST /admin/tenants/\:tenantId/invoices
- PATCH /admin/invoices/\:invoiceId (mark paid, cancel, etc.)
- GET /admin/tenants/\:tenantId/stats
- GET /admin/audit?tenantId=...

### Tenant (requires tenant context + permissions)

- GET /tenants/\:tenantId/users
- POST /tenants/\:tenantId/users (create direct)
- POST /tenants/\:tenantId/users/invite
- GET /tenants/\:tenantId/users/\:userId
- PATCH /tenants/\:tenantId/users/\:userId (roles/status)
- POST /tenants/\:tenantId/users/\:userId/reset-password
- POST /tenants/\:tenantId/users/\:userId/revoke-sessions

### Invitation acceptance

- POST /auth/invitations/accept (token) -> binds user to tenant membership + roles

---

## E) BUSINESS RULES & EDGE CASES

1. **Tenant isolation**

- A tenant user must never read/write data of another tenant
- Enforce at query layer + route guards

2. **Module gating**

- If module not enabled for tenant, routes and UI entries of that module must be blocked/hidden
- Attempting API access returns 403 “Module disabled”

3. **User creation with existing email**

- If invited email already exists as user:
  - Create membership + roles for that tenant
  - Do NOT create duplicate user
  - If already a member of that tenant: prevent duplicate invitation and show friendly error

4. **Disabling a user**

- Disabling membership vs disabling global user:
  - Prefer disabling membership for tenant-scoped disabling
  - Global disable only for platform security incidents

5. **Audit logging**

- Every admin action affecting tenant/users/billing must create an audit log entry

6. **Statistics**

- Provide simple aggregated queries; do not build heavy analytics yet

---

## F) DELIVERABLES (WHAT YOU MUST COMMIT)

1. Database migrations for the new tables/fields

2. Seed data:

- Default roles + permissions
- PLATFORM\_SUPER\_ADMIN role
- Default tenant roles

3. UI pages (or admin screens) for:

- Central Admin: tenant list + tenant detail + module toggles + subscription + invoices + stats
- Tenant Admin: collaborator list + invite/create + role assignment + disable/reset password

4. Authorization middleware/service:

- permission checks
- module checks
- tenant context resolution

5. Invitation flow:

- generate token, store hash, expiry
- accept invite and bind account

6. Audit logging integrated into all admin/user/billing actions

7. Minimal automated tests or test checklist:

- Tenant isolation
- Permission enforcement
- Module gating
- Invite acceptance
- Duplicate email handling

---

## Start by

1. Inspecting the existing auth/user tables and route patterns
2. Implementing DB schema + seed roles/permissions
3. Adding central tenant CRUD + module toggles
4. Adding tenant collaborator management + invitation acceptance
5. Adding subscription/invoice models + basic screens
6. Adding global tenant statistics

