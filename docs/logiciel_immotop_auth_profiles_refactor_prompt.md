You are an AI pair-programmer working **inside an existing real-estate SaaS project (LOGICIEL IMMOTOP)**.
Your task is to **update and, if needed, refactor the project’s user/account system** to support new application profile types and modern authentication best practices.

You are allowed to **change the entire structure (schema, models, auth flow)** if it produces a cleaner, more robust and scalable architecture.
If you redesign deeply, you must:

- Provide clear **migrations/transition steps** for existing data.
- Ensure the final result is **coherent and functional** end-to-end.

---

## 1. Analyze the current implementation

1. Scan the repository and:

   - Identify the current **user/auth models** (`User`, `Role`, `Tenant`, `Agency`, etc.).
   - Identify the **auth library** used (NextAuth, custom JWT, ASP.NET Identity, etc.).
   - Identify where **RBAC and permissions** are currently implemented (middleware, guards, decorators, attributes).

2. Summarize in a short technical note (for me to review) the existing:

   - **User / tenant structure**
   - **Auth flow** (sign up / login / logout)
   - **Session management** (cookies vs JWT, refresh tokens if any, etc.)

3. Based on this analysis, **propose an improved target architecture**:

   - You may keep parts of the existing design or **fully redesign** the structure (models, relations, auth logic, RBAC) to better fit the requirements described below.
   - Explicitly explain the **trade-offs** and why the new design is better (maintainability, clarity, scalability, security).

Do not start implementing until you have written this short analysis + proposal.

---

## 2. Target domain model – profiles & relationships

Application profile types / personas:

- **Administrateur principal (SuperAdmin)**
- **Tenants** : agences immobilières, opérateurs immobiliers
- **Collaborateurs** (belong to tenants): agents, gestionnaires
- **Tenants' Clients** (belong to exactly one tenant)
  - Propriétaires
  - Locataires ✔️ (new module)
- **Visiteurs** : public visitors consulting listings

All authenticated users must be able to login using **email + password** and **Google (Gmail) OAuth**.

I want the application to support **these profile types and rules**:

- **Administrateur principal (SuperAdmin)**

  - Manages the whole platform.
  - Can see and manage all tenants (agences immobilières, opérateurs immobiliers).
  - Created manually or via seed script, **not** by public sign-up.

- **Tenants**

  - Types: **agences immobilières** and **opérateurs immobiliers**.
  - Represent an organization that owns properties and has collaborators.
  - Properties, listings, contracts and orders are always attached to a specific tenant.

- **Collaborateurs** (belong to a tenant)

  - Example: **agents** or **gestionnaires**.
  - Must belong to exactly one tenant (for their collaborator role).
  - They manage properties, leases, rental flows, tenants’ clients, incidents, etc., for their tenant.

- **Tenants' Clients** (clients d’un tenant donné)

  - These are the **clients of a specific tenant**.
  - They **belong to ONE and ONLY ONE tenant** for each client record and are **created/managed by that tenant** (directly by staff or implicitly via a transaction flow on that tenant’s properties).
  - Two sub-types (for each tenant-client record):
    - **Propriétaires** (owners)
    - **Locataires** (renters) ✔️ **new module**
  - For each tenant they are linked to, Propriétaires and Locataires should later be able to:
    - Consult their leases/contracts with that tenant
    - See the transactions and incidents for that tenant (Propriétaires)
    - Pay rent online for that tenant (Locataires)
    - Signal incidents/maintenance issues to that tenant
  - A **single User account** can be a client of **multiple tenants** by having **multiple tenant-client records** (one per tenant). 
    - Example: same User is Locataire for Tenant A and Propriétaire for Tenant B.

- **Visiteurs**

  - Public visitors can **browse property listings without an account** across all tenants.
  - As soon as they want to:
    - Buy/rent a property,
    - Submit an application / demand,
    - Or perform any transactional / personalized action (depending on UX),
      → they **must create an account** and become a **User** with an associated **tenant-client record** for the tenant owning the property.
  - The flow should:
    - Create a `User` (if it doesn’t exist yet) or reuse the existing one (based on email/OAuth).
    - Create or reuse a **tenant-client record** (`TenantClient`) for the relevant tenant.
  - The same User can repeat this flow with properties from **other tenants**, resulting in **multiple tenant-client records**, each belonging to a single tenant.

### 2.1 Target data model (you can redesign completely)

Design a **clean, type-safe model**. For example (adapt to the chosen stack and naming conventions):

- **User**

  - Base identity:
    - `id`
    - `email` (unique)
    - `name`
    - `passwordHash` (for local auth)
    - `emailVerifiedAt` / `isEmailVerified`
    - optional profile info (phone, avatar, etc.)
  - Global role info:
    - `globalRole` enum: `SUPER_ADMIN | PLATFORM_USER`
  - High-level profile info (optional helper):
    - `profileFlags` or `profileType` enum indicating if the user acts as tenant collaborator, tenant client, or both.
  - Relations to:
    - `Collaborator` records (if the user is collaborator for one or several tenants).
    - `TenantClient` records (if the user is client for one or several tenants).

- **Tenant**

  - Represents agences immobilières / opérateurs immobiliers.
  - Fields could include:
    - `id`
    - `name`
    - `type` enum: `AGENCE_IMMOBILIERE` / `OPERATEUR_IMMOBILIER`
    - `slug` / `code`
    - contact info, settings, etc.

- **Collaborator**

  - Links `User` ↔ `Tenant` for collaborator roles:
    - `id`
    - `userId`
    - `tenantId`
    - `role` enum: `TENANT_ADMIN`, `AGENT`, `GESTIONNAIRE`, etc.
  - A user can potentially be collaborator in multiple tenants (if needed and allowed by business rules).

- **TenantClient** (tenant-specific client record)

  - Represents the fact that a user is a client of **one particular tenant**:
    - `id`
    - `userId` (links back to `User`)
    - `tenantId` (links to `Tenant`)
    - `clientType` enum: `PROPRIETAIRE`, `LOCATAIRE`, or `BOTH` (for that tenant)
    - optional tenant-specific client data (local reference, billing preferences, status…)
  - **Constraints**:
    - `(userId, tenantId)` should be **unique** → one tenant-client record per user+tenant.
  - A single `User` can have **many `TenantClient` records** (one per tenant where they are a client).

- **Transactional entities** (adjust existing models or design new ones):

  - E.g. `Order`, `Contract`, `Lease`, `Reservation`, `RentPayment`, `Incident`, etc.
  - Must include at minimum:
    - `tenantId` → which tenant owns the property / contract
    - `tenantClientId` (or `tenantClientId` + `userId` if you want redundancy) → which tenant-client the transaction belongs to
    - `propertyId`
    - other business fields (amounts, dates, statuses, etc.)
  - This is where the **TenantClient ↔ Tenant** relationship is materialized and used for permissions and dashboards.

You are **free to redesign the exact table/entity structure** as long as:

- It fits the above business rules.
- It is consistent and not overly complex.
- You provide **clear migration steps** (how to get from current DB structure to the new one).

---

## 3. Authentication & login: email + Google (Gmail)

All authenticated profiles above (SuperAdmin, Collaborateurs, Tenants' Clients) must be able to authenticate using:

1. **Email + password**
2. **Google (Gmail) login** via OAuth2

Tasks:

1. Use the existing auth library (NextAuth / ASP.NET Identity / custom) or, if necessary, **replace it with a more suitable one**. If you replace it:

   - Explain **why** and how the new library improves security/maintainability.
   - Show the steps to migrate.

2. Implement / configure:

   - **Google OAuth** provider.
   - `email` as the primary unique identifier across providers.

3. Implement **account linking**:

   - If user signs up with email/password and later uses Google with the same email:
     - Link to the same `User` record.
   - If user first logs in with Google and later sets a password:
     - Allow them to set a local password and log in with email+password.

4. Ensure a **single unified user table** and session system for:

   - SuperAdmin
   - Tenant collaborators
   - Tenants' Clients (Propriétaires / Locataires)

---

## 4. Modern best practices for user creation & verification

### 4.1 Secure password handling

- Use a modern password hashing algorithm:
  - `argon2` (preferred) or high-cost `bcrypt`, depending on stack support.
- Never log passwords or tokens.
- Enforce a **password policy**:
  - Minimum length (e.g. 10–12 characters).
  - Optionally: checks against very common/weak passwords.

### 4.2 Email verification flow

- On registration with email/password:

  - Create user in **unverified** state.
  - Generate **secure, random verification token**:
    - High entropy, optionally store **hashed** token in DB.
    - With **expiry** (e.g. 24–48 hours).
  - Send verification email with link:
    - `/auth/verify-email?token=<token>`

- On click:

  - Validate token & expiry.
  - Mark user as verified (`emailVerifiedAt` or `isEmailVerified`).
  - Invalidate token (one-time use).

- For **Google login**:

  - If provider marks email as verified, mark it accordingly.

### 4.3 Reset password flow

- Implement:
  - Reset request by email → generate token + expiry.
  - Email link `/auth/reset-password?token=<token>`.
  - On visit, validate token, allow setting new password.
  - Invalidate token after use/expiry.

### 4.4 Signup / invitation logic per profile type

- **SuperAdmin**

  - No public signup.
  - Seeded or created via secure admin interface / CLI.
  - Protect this path carefully.

- **Tenants (agences/opérateurs)**

  - Created by SuperAdmin or internal onboarding.
  - Each tenant has at least one **Tenant Admin** (a collaborator).

- **Collaborateurs (agents/gestionnaires)**

  - Created by Tenant Admins:
    - Admin inputs name, email, role.
    - System sends invitation email with activation link.
    - Invitee sets password and logs in.
  - Always linked to **one tenant** (`tenantId` required in `Collaborator`).

- **Tenants' Clients (Propriétaires & Locataires)**

  - Tenant staff create/manage tenant clients from their back-office:
    - They can manually create a tenant-client record with basic info (name, email, type: Propriétaire/Locataire).
    - Optionally, trigger an invitation email so the client can activate their online access (set password or link Google account).
  - The system can also create a tenant-client record **on the fly** when a new User starts a transaction on a tenant’s property (coming from the Visiteur flow).
  - For each `(userId, tenantId)` pair, there is at most **one** `TenantClient` record; the `clientType` can be updated over time (e.g. becomes both Propriétaire and Locataire for the same tenant).

- **Visiteurs**

  - Browse listings without account across all tenants.
  - When a Visiteur starts a purchase/rental or any transactional/personalized flow for a property that belongs to Tenant X:
    - If they are not authenticated:
      - Ask them to sign up or log in using email/password or Google.
    - After authentication:
      - Create or reuse a `TenantClient` for `(userId, tenantId = X)`.
      - Continue the transaction using that `TenantClient`.
  - The same User can repeat this for properties of other tenants, resulting in multiple `TenantClient` records, each belonging to a different tenant.

---

## 5. Validation & security hardening

Implement strong validation and security on **both front-end and back-end**:

1. **Input validation**

   - Use a schema validation library appropriate to the stack (Zod / DTO validators / FluentValidation / etc.).
   - Validate:
     - Email format
     - Password rules
     - Role/profile enums
     - IDs and foreign keys (userId, tenantId, propertyId…).

2. **Uniqueness & consistency**

   - Enforce unique `email` per `User` at DB level.
   - Enforce unique `(userId, tenantId)` per `TenantClient`.
   - A user may have:
     - Zero or more `Collaborator` records (for one or multiple tenants, if design allows).
     - Zero or more `TenantClient` records (one per tenant where they are a client).
   - Ensure transactional entities **always** have consistent non-null `tenantId` and `tenantClientId`.

3. **RBAC enforcement**

   - Implement or refine middleware/guards so that:
     - **SuperAdmin**: manage tenants + global settings.
     - **Tenant Admin**: manage collaborators, tenant settings, properties, tenants' clients, and that tenant’s transactions.
     - **Collaborators**: restricted to operations allowed by their role for their tenant.
     - **Tenants' Clients**: can only access their own data (contracts, orders, incidents, payments, etc.) and only for tenant-client records where they are the `userId`.
   - Enforce RBAC at API/server level, not just in the UI.

4. **Rate limiting & brute-force protection**

   - Apply rate limits to:
     - `/auth/login`
     - `/auth/register`
     - `/auth/reset-password`
   - Optionally keep track of failed login attempts and introduce lockout/CAPTCHA after multiple failures.

5. **Session & token security**

   - If using cookies:
     - Use `HttpOnly`, `Secure`, appropriate `SameSite`.
   - If using JWT:
     - Strong secret / key, limited expiry.
     - Possibly implement refresh tokens.
   - Never log raw tokens or sensitive secrets.

---

## 6. Implementation plan

Follow this plan step by step:

1. **Analysis & proposal**

   - Analyze the current user/auth/session system.
   - Produce a concise summary + a **proposed target architecture** (including diagrams or pseudo-schema if helpful).

2. **Design the new data model**

   - Define `User`, `Tenant`, `Collaborator`, `TenantClient`, role/profile enums, and main transactional entities (or refactor the existing ones).
   - Show the proposed schema (ORM models / entity classes / Prisma/EF schema, etc.) before coding migrations.

3. **Implement database changes**

   - Implement models/entities.
   - Create and run migrations.
   - Provide migration notes: how existing data is transformed, and how to test migration locally.

4. **Refactor / implement auth**

   - Configure or replace the auth library as needed (email+password + Google OAuth).
   - Implement:
     - Email verification flow.
     - Password reset flow.
     - Account linking for Google.

5. **Implement user creation flows**

   - SuperAdmin seeding.
   - Tenant creation + initial Tenant Admin.
   - Collaborator invitation.
   - Tenant clients management (creation, invitation, activation).
   - Visitor → User → TenantClient conversion in purchase/rental flows.

6. **Implement RBAC**

   - Add guards/middleware for all relevant routes/APIs.
   - Ensure tests cover access control.

7. **Add tests**

   - Auth flows (signup, login, Google OAuth, email verification, reset password).
   - Visitor → User → TenantClient conversion.
   - User with multiple `TenantClient` records: verify they can transact with several tenants and see only their own data.
   - RBAC scenarios for SuperAdmin, Tenant Admin, Collaborator, Tenants' Clients.

8. **UI updates**

   - Login/register screens supporting email and Google.
   - Flow from browsing as visitor → signup/login → tenant-specific transaction.
   - Dynamic navigation/dashboards based on profile type (SuperAdmin, Tenant Admin, Collaborator, Tenants' Clients).

At each step, **show me the relevant code (diffs or full files when needed) and a short explanation** before moving on to the next step.

