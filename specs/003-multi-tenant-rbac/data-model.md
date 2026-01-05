# Data Model: Multi-Tenant SaaS Architecture with RBAC

**Feature**: 003-multi-tenant-rbac  
**Date**: 2025-01-27  
**Purpose**: Define database schema extensions for multi-tenant RBAC system

---

## Overview

This document extends the existing Prisma schema (`packages/api/prisma/schema.prisma`) with new entities for:
- Enhanced Tenant management (status, branding, contact info)
- Tenant Module activation
- Membership (user-tenant relationships)
- RBAC (Roles, Permissions, User Roles)
- Invitations
- Subscriptions & Invoices
- Audit Logs

---

## Schema Extensions

### 1. Tenant (Extended)

**Purpose**: Extend existing Tenant model with additional fields for multi-tenant SaaS.

**New Fields**:
```prisma
model Tenant {
  // ... existing fields (id, name, slug, type, logoUrl, website, isActive, createdAt, updatedAt)
  
  // New fields
  legalName        String?   @map("legal_name")
  status           TenantStatus @default(PENDING) // PENDING, ACTIVE, SUSPENDED
  contactEmail     String?   @map("contact_email")
  contactPhone     String?   @map("contact_phone")
  country          String?
  city             String?
  address          String?
  brandingPrimaryColor String? @map("branding_primary_color")
  subdomain        String?   @unique
  customDomain     String?   @map("custom_domain")
  lastActivityAt   DateTime? @map("last_activity_at")
  
  // Relationships
  modules          TenantModule[]
  memberships      Membership[]
  subscription     Subscription?
  invoices         Invoice[]
  auditLogs        AuditLog[]
  
  @@index([status])
  @@index([contactEmail])
}
```

**Enum**:
```prisma
enum TenantStatus {
  PENDING
  ACTIVE
  SUSPENDED
}
```

**Validation Rules**:
- `status` must be one of: PENDING, ACTIVE, SUSPENDED
- `contactEmail` must be valid email format (if provided)
- `subdomain` must be unique (if provided)
- `customDomain` must be valid domain format (if provided)

**Business Rules**:
- New tenants default to PENDING status
- Only ACTIVE tenants allow user access
- SUSPENDED tenants immediately invalidate all user sessions
- `lastActivityAt` updated when any tenant user logs in

---

### 2. TenantModule

**Purpose**: Track which functional modules are enabled for each tenant.

**Fields**:
```prisma
model TenantModule {
  id          String   @id @default(uuid())
  tenantId    String   @map("tenant_id")
  moduleKey   String   @map("module_key") // MODULE_AGENCY, MODULE_SYNDIC, MODULE_PROMOTER
  enabled     Boolean  @default(false)
  enabledAt   DateTime? @map("enabled_at")
  enabledBy   String?   @map("enabled_by") // userId of Platform Admin who enabled it
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")
  
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  @@unique([tenantId, moduleKey])
  @@index([tenantId])
  @@index([moduleKey])
  @@map("tenant_modules")
}
```

**Enum**:
```prisma
enum ModuleKey {
  MODULE_AGENCY
  MODULE_SYNDIC
  MODULE_PROMOTER
  // Future: MODULE_RENTAL, MODULE_CRM, MODULE_LISTINGS
}
```

**Validation Rules**:
- `moduleKey` must be valid enum value
- `tenantId` + `moduleKey` must be unique
- `enabledBy` must reference valid User (if provided)

**Business Rules**:
- Modules default to disabled
- Only Platform Admins can enable/disable modules
- Disabling a module immediately revokes access to that module's features
- `enabledAt` and `enabledBy` set when module is first enabled

---

### 3. Membership

**Purpose**: Represents the relationship between a User and a Tenant (replaces/enhances Collaborator model).

**Fields**:
```prisma
model Membership {
  id              String            @id @default(uuid())
  userId          String            @map("user_id")
  tenantId        String            @map("tenant_id")
  status          MembershipStatus  @default(PENDING_INVITE)
  invitedAt       DateTime?         @map("invited_at")
  invitedBy       String?           @map("invited_by") // userId
  acceptedAt      DateTime?         @map("accepted_at")
  createdAt       DateTime          @default(now()) @map("created_at")
  updatedAt       DateTime          @updatedAt @map("updated_at")
  
  user            User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  tenant          Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  userRoles       UserRole[]        // Roles assigned in this tenant context
  
  @@unique([userId, tenantId])
  @@index([userId])
  @@index([tenantId])
  @@index([status])
  @@map("memberships")
}
```

**Enum**:
```prisma
enum MembershipStatus {
  PENDING_INVITE
  ACTIVE
  DISABLED
}
```

**Validation Rules**:
- `userId` + `tenantId` must be unique
- `invitedBy` must reference valid User (if provided)
- `acceptedAt` must be after `invitedAt` (if both provided)

**Business Rules**:
- New memberships default to PENDING_INVITE
- Status changes to ACTIVE when invitation is accepted
- DISABLED memberships prevent user access to that tenant
- User can have multiple memberships (multiple tenants)

**Migration Note**: Existing `Collaborator` model can be migrated to `Membership` with `status: ACTIVE` and `acceptedAt: createdAt`.

---

### 4. Role

**Purpose**: Define roles with scope (platform or tenant) and associated permissions.

**Fields**:
```prisma
model Role {
  id          String    @id @default(uuid())
  key         String    @unique // PLATFORM_SUPER_ADMIN, TENANT_ADMIN, etc.
  name        String    // Display name
  description String?   @db.Text
  scope       RoleScope // PLATFORM or TENANT
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")
  
  permissions RolePermission[]
  userRoles   UserRole[]
  
  @@index([scope])
  @@index([key])
  @@map("roles")
}
```

**Enum**:
```prisma
enum RoleScope {
  PLATFORM
  TENANT
}
```

**Validation Rules**:
- `key` must be unique
- `scope` must be PLATFORM or TENANT
- `name` is required

**Business Rules**:
- Platform roles have no tenant restriction
- Tenant roles require tenant context
- Roles are seeded on initial migration
- Default roles: PLATFORM_SUPER_ADMIN, TENANT_ADMIN, TENANT_MANAGER, TENANT_AGENT, TENANT_ACCOUNTANT

---

### 5. Permission

**Purpose**: Granular access rights that can be assigned to roles.

**Fields**:
```prisma
model Permission {
  id          String    @id @default(uuid())
  key         String    @unique // TENANT_SETTINGS_VIEW, USERS_CREATE, etc.
  description String?   @db.Text
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")
  
  roles       RolePermission[]
  
  @@index([key])
  @@map("permissions")
}
```

**Validation Rules**:
- `key` must be unique
- `key` format: `{RESOURCE}_{ACTION}` (e.g., `TENANT_SETTINGS_VIEW`)

**Business Rules**:
- Permissions are granular and reusable
- Permissions are assigned to roles, not directly to users
- Permission keys follow naming convention: `{SCOPE}_{RESOURCE}_{ACTION}`

**Example Permissions**:
- `TENANT_SETTINGS_VIEW`, `TENANT_SETTINGS_EDIT`
- `USERS_VIEW`, `USERS_CREATE`, `USERS_EDIT`, `USERS_DISABLE`
- `BILLING_VIEW`, `BILLING_ADMIN`
- `MODULES_VIEW`, `MODULES_EDIT` (platform only)

---

### 6. RolePermission

**Purpose**: Many-to-many relationship between Roles and Permissions.

**Fields**:
```prisma
model RolePermission {
  id           String     @id @default(uuid())
  roleId       String     @map("role_id")
  permissionId String     @map("permission_id")
  createdAt    DateTime   @default(now()) @map("created_at")
  
  role         Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission   Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)
  
  @@unique([roleId, permissionId])
  @@index([roleId])
  @@index([permissionId])
  @@map("role_permissions")
}
```

**Validation Rules**:
- `roleId` + `permissionId` must be unique
- Both `roleId` and `permissionId` must reference valid entities

**Business Rules**:
- Roles can have multiple permissions
- Permissions can belong to multiple roles
- Removing a role removes all its permission assignments

---

### 7. UserRole

**Purpose**: Assign roles to users, optionally scoped to a tenant.

**Fields**:
```prisma
model UserRole {
  id          String    @id @default(uuid())
  userId      String    @map("user_id")
  roleId      String    @map("role_id")
  tenantId    String?   @map("tenant_id") // Required for TENANT roles, null for PLATFORM roles
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")
  
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  role        Role      @relation(fields: [roleId], references: [id], onDelete: Cascade)
  membership  Membership? @relation(fields: [userId, tenantId], references: [userId, tenantId], onDelete: Cascade)
  
  @@unique([userId, roleId, tenantId])
  @@index([userId])
  @@index([roleId])
  @@index([tenantId])
  @@map("user_roles")
}
```

**Validation Rules**:
- If `role.scope = PLATFORM`, then `tenantId` MUST be NULL
- If `role.scope = TENANT`, then `tenantId` MUST be NOT NULL
- `tenantId` must match a membership `tenantId` for that user (if provided)
- `userId` + `roleId` + `tenantId` must be unique

**Business Rules**:
- Users can have multiple roles (permissions are combined)
- Platform roles apply globally (no tenant restriction)
- Tenant roles apply only within the specified tenant context
- Role assignments are scoped to membership (user must be member of tenant to have tenant roles)

---

### 8. Invitation

**Purpose**: Track pending invitations for users to join tenants.

**Fields**:
```prisma
model Invitation {
  id          String           @id @default(uuid())
  tenantId    String           @map("tenant_id")
  email       String
  tokenHash   String           @unique @map("token_hash") // Hashed invitation token
  expiresAt   DateTime         @map("expires_at")
  status      InvitationStatus @default(PENDING)
  invitedBy   String           @map("invited_by") // userId
  acceptedBy  String?          @map("accepted_by") // userId (if email matches existing user)
  acceptedAt  DateTime?         @map("accepted_at")
  revokedAt   DateTime?         @map("revoked_at")
  createdAt   DateTime          @default(now()) @map("created_at")
  updatedAt   DateTime          @updatedAt @map("updated_at")
  
  tenant      Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  @@index([tenantId])
  @@index([email])
  @@index([tokenHash])
  @@index([status])
  @@index([expiresAt])
  @@map("invitations")
}
```

**Enum**:
```prisma
enum InvitationStatus {
  PENDING
  ACCEPTED
  EXPIRED
  REVOKED
}
```

**Validation Rules**:
- `email` must be valid email format
- `tokenHash` must be unique
- `expiresAt` must be in the future when created
- `expiresAt` defaults to 7 days from creation
- `invitedBy` must reference valid User

**Business Rules**:
- Invitations expire after 7 days
- Expired invitations cannot be accepted
- Revoked invitations cannot be accepted
- If email matches existing user, create membership directly (no duplicate user)
- If email is new, create user account during acceptance
- `acceptedBy` set when invitation is accepted

---

### 9. Subscription

**Purpose**: Track tenant subscription plans and billing cycles.

**Fields**:
```prisma
model Subscription {
  id                  String              @id @default(uuid())
  tenantId            String              @unique @map("tenant_id")
  planKey             SubscriptionPlan    @map("plan_key")
  billingCycle        BillingCycle
  status              SubscriptionStatus  @default(TRIALING)
  startAt             DateTime            @map("start_at")
  currentPeriodStart  DateTime            @map("current_period_start")
  currentPeriodEnd    DateTime            @map("current_period_end")
  cancelAt            DateTime?           @map("cancel_at")
  canceledAt          DateTime?           @map("canceled_at")
  metadata            Json?               // Flexible metadata for plan features
  createdAt           DateTime            @default(now()) @map("created_at")
  updatedAt           DateTime            @updatedAt @map("updated_at")
  
  tenant              Tenant              @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  invoices            Invoice[]
  
  @@index([status])
  @@index([planKey])
  @@map("subscriptions")
}
```

**Enums**:
```prisma
enum SubscriptionPlan {
  BASIC
  PRO
  ELITE
}

enum BillingCycle {
  MONTHLY
  ANNUAL
}

enum SubscriptionStatus {
  TRIALING
  ACTIVE
  PAST_DUE
  CANCELED
  SUSPENDED
}
```

**Validation Rules**:
- `tenantId` must be unique (one subscription per tenant)
- `currentPeriodEnd` must be after `currentPeriodStart`
- `cancelAt` must be in the future (if provided)

**Business Rules**:
- New subscriptions default to TRIALING status
- ACTIVE subscriptions allow full access
- PAST_DUE, CANCELED, SUSPENDED limit access to read-only
- Billing cycle determines `currentPeriodEnd` calculation
- `cancelAt` set when subscription is scheduled for cancellation

---

### 10. Invoice

**Purpose**: Track billing invoices for tenant subscriptions.

**Fields**:
```prisma
model Invoice {
  id              String          @id @default(uuid())
  tenantId        String          @map("tenant_id")
  subscriptionId  String?         @map("subscription_id")
  invoiceNumber   String          @unique @map("invoice_number")
  issueDate       DateTime        @map("issue_date")
  dueDate         DateTime        @map("due_date")
  currency        String          @default("FCFA")
  amountTotal     Decimal         @db.Decimal(10, 2) @map("amount_total")
  status          InvoiceStatus   @default(DRAFT)
  paidAt          DateTime?       @map("paid_at")
  notes           String?         @db.Text
  createdAt       DateTime        @default(now()) @map("created_at")
  updatedAt       DateTime        @updatedAt @map("updated_at")
  
  tenant          Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  subscription    Subscription?   @relation(fields: [subscriptionId], references: [id], onDelete: SetNull)
  
  @@index([tenantId])
  @@index([subscriptionId])
  @@index([invoiceNumber])
  @@index([status])
  @@index([dueDate])
  @@map("invoices")
}
```

**Enum**:
```prisma
enum InvoiceStatus {
  DRAFT
  ISSUED
  PAID
  FAILED
  CANCELED
  REFUNDED
}
```

**Validation Rules**:
- `invoiceNumber` must be unique
- `dueDate` must be after `issueDate`
- `amountTotal` must be positive
- `currency` defaults to "FCFA"

**Business Rules**:
- Invoices can be created manually by Platform Admins
- Invoices can be linked to subscriptions (optional)
- `paidAt` set when invoice is marked as paid
- Status transitions: DRAFT → ISSUED → PAID/FAILED/CANCELED

---

### 11. AuditLog

**Purpose**: Record all admin actions for compliance and debugging.

**Fields**:
```prisma
model AuditLog {
  id          String    @id @default(uuid())
  actorUserId String?   @map("actor_user_id") // Null for system actions
  tenantId    String?   @map("tenant_id") // Null for platform-only actions
  actionKey   String    @map("action_key") // TENANT_CREATED, MODULE_ENABLED, etc.
  entityType  String    @map("entity_type") // "Tenant", "User", "Subscription", etc.
  entityId    String    @map("entity_id")
  ipAddress   String?   @map("ip_address")
  userAgent   String?   @map("user_agent")
  payload     Json?     // Additional context data
  createdAt   DateTime  @default(now()) @map("created_at")
  
  actor       User?     @relation(fields: [actorUserId], references: [id], onDelete: SetNull)
  tenant      Tenant?   @relation(fields: [tenantId], references: [id], onDelete: SetNull)
  
  @@index([actorUserId])
  @@index([tenantId])
  @@index([actionKey])
  @@index([entityType, entityId])
  @@index([createdAt])
  @@map("audit_logs")
}
```

**Validation Rules**:
- `actionKey` follows pattern: `{ENTITY}_{ACTION}` (e.g., `TENANT_CREATED`)
- `entityType` and `entityId` together identify the affected entity
- `actorUserId` can be null (system actions)

**Business Rules**:
- All admin actions must create audit log entries (FR-023)
- System actions have null `actorUserId`
- Platform actions have null `tenantId`
- Audit logs are immutable (never updated or deleted)
- High-volume writes handled via async queue (see research.md)

**Example Action Keys**:
- `TENANT_CREATED`, `TENANT_UPDATED`, `TENANT_SUSPENDED`
- `MODULE_ENABLED`, `MODULE_DISABLED`
- `USER_INVITED`, `USER_DISABLED`, `ROLE_ASSIGNED`
- `SUBSCRIPTION_CREATED`, `SUBSCRIPTION_CANCELED`
- `INVOICE_CREATED`, `INVOICE_MARKED_PAID`

---

## User Model Extensions

**Existing User model** needs one new field:

```prisma
model User {
  // ... existing fields
  
  // New field
  lastLoginAt  DateTime? @map("last_login_at")
  
  // New relationships
  memberships  Membership[]
  userRoles    UserRole[]
  invitations  Invitation[] @relation("InvitedBy")
  acceptedInvitations Invitation[] @relation("AcceptedBy")
  auditLogs    AuditLog[]
  
  // ... rest of existing relationships
}
```

**Business Rules**:
- `lastLoginAt` updated on successful login
- Used for tenant statistics (most recent login per tenant)

---

## Relationships Summary

```
Tenant (1) ──< (N) TenantModule
Tenant (1) ──< (N) Membership
Tenant (1) ──< (1) Subscription
Tenant (1) ──< (N) Invoice
Tenant (1) ──< (N) AuditLog
Tenant (1) ──< (N) Invitation

User (1) ──< (N) Membership
User (1) ──< (N) UserRole
User (1) ──< (N) Invitation (as inviter)
User (1) ──< (N) Invitation (as accepter)
User (1) ──< (N) AuditLog

Membership (1) ──< (N) UserRole

Role (1) ──< (N) RolePermission
Role (1) ──< (N) UserRole

Permission (1) ──< (N) RolePermission

Subscription (1) ──< (N) Invoice
```

---

## Migration Strategy

1. **Add new enums**: TenantStatus, ModuleKey, MembershipStatus, RoleScope, SubscriptionPlan, BillingCycle, SubscriptionStatus, InvoiceStatus, InvitationStatus
2. **Extend Tenant model**: Add new fields, keep existing fields
3. **Create new models**: TenantModule, Membership, Role, Permission, RolePermission, UserRole, Invitation, Subscription, Invoice, AuditLog
4. **Extend User model**: Add lastLoginAt, new relationships
5. **Migrate Collaborator to Membership**: 
   - Create Membership records from existing Collaborator records
   - Set status=ACTIVE, acceptedAt=createdAt
   - Keep Collaborator model temporarily for backward compatibility
6. **Seed data**: Create default roles and permissions

---

## Indexes for Performance

**Critical indexes** (already included in schema above):
- Tenant: `status`, `contactEmail`
- TenantModule: `tenantId`, `moduleKey`, `[tenantId, moduleKey]` (unique)
- Membership: `userId`, `tenantId`, `status`, `[userId, tenantId]` (unique)
- Role: `scope`, `key`
- Permission: `key`
- UserRole: `userId`, `roleId`, `tenantId`, `[userId, roleId, tenantId]` (unique)
- Invitation: `tenantId`, `email`, `tokenHash`, `status`, `expiresAt`
- Subscription: `status`, `planKey`
- Invoice: `tenantId`, `invoiceNumber`, `status`, `dueDate`
- AuditLog: `actorUserId`, `tenantId`, `actionKey`, `[entityType, entityId]`, `createdAt`

These indexes support:
- Fast permission lookups (UserRole by userId + tenantId)
- Fast module checks (TenantModule by tenantId + moduleKey)
- Fast tenant statistics queries (Membership counts, lastLoginAt)
- Fast audit log queries (by tenant, action, date range)





