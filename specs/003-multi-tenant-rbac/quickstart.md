# Quick Start Guide: Multi-Tenant RBAC Implementation

**Feature**: 003-multi-tenant-rbac  
**Date**: 2025-01-27  
**Purpose**: Developer guide for implementing multi-tenant SaaS architecture with RBAC

---

## Prerequisites

- Node.js >=18.x (LTS)
- PostgreSQL >=14
- Existing ImmoTopia codebase with authentication system
- Prisma CLI installed

---

## Step 1: Database Migration

### 1.1 Update Prisma Schema

Add the new models and enums to `packages/api/prisma/schema.prisma` based on `data-model.md`:

```bash
# Review the schema changes
cat specs/003-multi-tenant-rbac/data-model.md

# Update schema.prisma with new models:
# - Tenant (extended with new fields)
# - TenantModule
# - Membership
# - Role, Permission, RolePermission, UserRole
# - Invitation
# - Subscription, Invoice
# - AuditLog
```

### 1.2 Create Migration

```bash
cd packages/api
npx prisma migrate dev --name add_multi_tenant_rbac
```

### 1.3 Seed Default Roles and Permissions

Create seed script `packages/api/prisma/seeds/rbac-seed.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedRBAC() {
  // Create permissions
  const permissions = [
    // Platform permissions
    { key: 'PLATFORM_TENANTS_VIEW', description: 'View all tenants' },
    { key: 'PLATFORM_TENANTS_CREATE', description: 'Create tenants' },
    { key: 'PLATFORM_TENANTS_EDIT', description: 'Edit tenants' },
    { key: 'PLATFORM_MODULES_VIEW', description: 'View tenant modules' },
    { key: 'PLATFORM_MODULES_EDIT', description: 'Edit tenant modules' },
    { key: 'PLATFORM_SUBSCRIPTIONS_VIEW', description: 'View subscriptions' },
    { key: 'PLATFORM_SUBSCRIPTIONS_EDIT', description: 'Edit subscriptions' },
    { key: 'PLATFORM_INVOICES_VIEW', description: 'View invoices' },
    { key: 'PLATFORM_INVOICES_CREATE', description: 'Create invoices' },
    { key: 'PLATFORM_INVOICES_EDIT', description: 'Edit invoices' },
    
    // Tenant permissions
    { key: 'TENANT_SETTINGS_VIEW', description: 'View tenant settings' },
    { key: 'TENANT_SETTINGS_EDIT', description: 'Edit tenant settings' },
    { key: 'USERS_VIEW', description: 'View collaborators' },
    { key: 'USERS_CREATE', description: 'Create collaborators' },
    { key: 'USERS_EDIT', description: 'Edit collaborators' },
    { key: 'USERS_DISABLE', description: 'Disable collaborators' },
    { key: 'BILLING_VIEW', description: 'View billing information' },
  ];

  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: {},
      create: perm,
    });
  }

  // Create roles
  const platformSuperAdmin = await prisma.role.upsert({
    where: { key: 'PLATFORM_SUPER_ADMIN' },
    update: {},
    create: {
      key: 'PLATFORM_SUPER_ADMIN',
      name: 'Platform Super Admin',
      description: 'Full platform access',
      scope: 'PLATFORM',
    },
  });

  const tenantAdmin = await prisma.role.upsert({
    where: { key: 'TENANT_ADMIN' },
    update: {},
    create: {
      key: 'TENANT_ADMIN',
      name: 'Tenant Admin',
      description: 'Full tenant management',
      scope: 'TENANT',
    },
  });

  // Assign all permissions to PLATFORM_SUPER_ADMIN
  const allPerms = await prisma.permission.findMany();
  for (const perm of allPerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: platformSuperAdmin.id,
          permissionId: perm.id,
        },
      },
      update: {},
      create: {
        roleId: platformSuperAdmin.id,
        permissionId: perm.id,
      },
    });
  }

  // Assign tenant permissions to TENANT_ADMIN
  const tenantPerms = await prisma.permission.findMany({
    where: {
      key: {
        startsWith: 'TENANT_',
      },
    },
  });
  for (const perm of tenantPerms) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: tenantAdmin.id,
          permissionId: perm.id,
        },
      },
      update: {},
      create: {
        roleId: tenantAdmin.id,
        permissionId: perm.id,
      },
    });
  }

  console.log('✅ RBAC seed completed');
}

seedRBAC()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

Run seed:
```bash
npx ts-node prisma/seeds/rbac-seed.ts
```

---

## Step 2: Backend Implementation

### 2.1 Create Services

Create service files in `packages/api/src/services/`:

**permission-service.ts** - RBAC permission checks:
```typescript
// See research.md for caching strategy
// Implements getUserPermissions() with in-memory cache
```

**tenant-service.ts** - Tenant CRUD and module management:
```typescript
// createTenant()
// updateTenant()
// getTenantModules()
// updateTenantModules()
// suspendTenant() // Revokes all sessions
```

**collaborator-service.ts** - User invitation and management:
```typescript
// inviteCollaborator() // Creates invitation, sends email
// createCollaboratorDirect() // Direct creation with temp password
// updateCollaboratorRoles()
// disableCollaborator()
// resendInvitation()
```

**subscription-service.ts** - Subscription and billing:
```typescript
// createSubscription()
// updateSubscription()
// createInvoice()
// markInvoicePaid()
```

**audit-service.ts** - Audit logging:
```typescript
// logAuditEvent() // Async queue, see research.md
// flushAuditQueue()
```

### 2.2 Create Middleware

**rbac-middleware.ts** - Permission and module checks:
```typescript
// requirePermission(permissionKey: string)
// requireModule(moduleKey: string)
// Combines with existing authenticate and requireTenantAccess
```

**session-invalidation.ts** - Session management:
```typescript
// revokeTenantSessions(tenantId: string) // On suspension
// Revokes all RefreshTokens for tenant users
```

### 2.3 Create Controllers

**tenant-controller.ts** - Platform admin tenant management:
```typescript
// GET /admin/tenants
// POST /admin/tenants
// GET /admin/tenants/:id
// PATCH /admin/tenants/:id
// GET /admin/tenants/:id/modules
// PUT /admin/tenants/:id/modules
// GET /admin/tenants/:id/stats
```

**collaborator-controller.ts** - Tenant admin user management:
```typescript
// GET /tenants/:tenantId/users
// POST /tenants/:tenantId/users
// POST /tenants/:tenantId/users/invite
// GET /tenants/:tenantId/users/:userId
// PATCH /tenants/:tenantId/users/:userId
// POST /tenants/:tenantId/users/:userId/reset-password
// POST /tenants/:tenantId/users/:userId/revoke-sessions
```

**subscription-controller.ts** - Subscription and billing:
```typescript
// GET /admin/tenants/:id/subscription
// PUT /admin/tenants/:id/subscription
// GET /admin/tenants/:id/invoices
// POST /admin/tenants/:id/invoices
// PATCH /admin/invoices/:id
```

### 2.4 Create Routes

Update `packages/api/src/routes/`:

**admin-routes.ts** - Platform admin routes:
```typescript
router.use('/admin/tenants', authenticate, requirePermission('PLATFORM_TENANTS_VIEW'), tenantRoutes);
router.use('/admin/invoices', authenticate, requirePermission('PLATFORM_INVOICES_VIEW'), invoiceRoutes);
router.use('/admin/audit', authenticate, requirePermission('PLATFORM_TENANTS_VIEW'), auditRoutes);
```

**tenant-routes.ts** - Tenant-scoped routes:
```typescript
router.use('/tenants/:tenantId/users', authenticate, requireTenantAccess, requirePermission('USERS_VIEW'), collaboratorRoutes);
```

**invitation-routes.ts** - Invitation acceptance:
```typescript
router.post('/auth/invitations/accept', invitationController.accept);
```

---

## Step 3: Frontend Implementation

### 3.1 Create Services

**tenant-service.ts** - API client for tenant operations:
```typescript
// listTenants(filters)
// getTenant(id)
// createTenant(data)
// updateTenant(id, data)
// getTenantModules(id)
// updateTenantModules(id, modules)
// getTenantStats(id)
```

**collaborator-service.ts** - API client for collaborator operations:
```typescript
// listCollaborators(tenantId, filters)
// inviteCollaborator(tenantId, data)
// createCollaborator(tenantId, data)
// updateCollaborator(tenantId, userId, data)
// resendInvitation(tenantId, invitationId)
```

### 3.2 Create Pages

**apps/web/src/pages/admin/TenantsList.tsx**:
- List all tenants with filters (status, type, plan, module)
- Search functionality
- Link to tenant detail

**apps/web/src/pages/admin/TenantDetail.tsx**:
- Tenant overview (status, type, createdAt, lastActivity)
- Module toggles
- Subscription management
- Invoices list
- Collaborators summary
- Statistics

**apps/web/src/pages/tenant/CollaboratorsList.tsx**:
- List collaborators with search/filter
- Invite collaborator button
- Link to collaborator detail

**apps/web/src/pages/tenant/InviteCollaborator.tsx**:
- Invitation form (email, roles)
- Resend invitation for pending invites

### 3.3 Create Components

**ModuleToggle.tsx** - Toggle module enable/disable:
```typescript
// Checkbox/switch for each module
// Calls updateTenantModules API
```

**RoleSelector.tsx** - Multi-select role assignment:
```typescript
// Shows available roles for tenant
// Allows multiple selection
```

**InvitationStatus.tsx** - Display invitation status:
```typescript
// Shows pending/accepted/expired status
// Resend button for pending
```

---

## Step 4: Testing

### 4.1 Integration Tests

**tenant-isolation.test.ts**:
```typescript
// Test: User from Tenant A cannot access Tenant B data
// Test: Cross-tenant queries return 403
```

**rbac-enforcement.test.ts**:
```typescript
// Test: User without permission gets 403
// Test: User with permission gets 200
// Test: Multiple roles combine permissions
```

**module-gating.test.ts**:
```typescript
// Test: Disabled module returns 403
// Test: Enabled module allows access
// Test: Module disable revokes active operations
```

### 4.2 Unit Tests

- `permission-service.test.ts` - Permission caching
- `tenant-service.test.ts` - Tenant CRUD, suspension
- `collaborator-service.test.ts` - Invitation flow

---

## Step 5: Key Implementation Notes

### 5.1 Session Invalidation

When tenant is suspended:
```typescript
// In tenant-service.ts
async function suspendTenant(tenantId: string) {
  // Update tenant status
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { status: 'SUSPENDED' },
  });
  
  // Revoke all refresh tokens for tenant users
  await prisma.refreshToken.updateMany({
    where: {
      user: {
        memberships: {
          some: { tenantId, status: 'ACTIVE' },
        },
      },
      revoked: false,
    },
    data: {
      revoked: true,
      revokedAt: new Date(),
    },
  });
}
```

### 5.2 Permission Caching

See `research.md` for in-memory cache implementation with 5-minute TTL.

### 5.3 Module Gating

Middleware chain example:
```typescript
router.get(
  '/properties',
  authenticate,
  requireTenantAccess,
  requirePermission('PROPERTIES_VIEW'),
  requireModule('MODULE_AGENCY'),
  propertyController.list
);
```

### 5.4 Audit Logging

Async queue implementation (see `research.md`):
```typescript
// Non-blocking audit log
logAuditEvent({
  actorUserId: req.user.userId,
  tenantId: req.tenantContext?.tenantId,
  actionKey: 'TENANT_CREATED',
  entityType: 'Tenant',
  entityId: tenant.id,
  ipAddress: req.ip,
  userAgent: req.get('user-agent'),
});
```

---

## Step 6: Environment Variables

Add to `.env`:
```bash
# Email service (for invitations)
EMAIL_SERVICE_TYPE=smtp
EMAIL_SMTP_HOST=smtp.mailtrap.io
EMAIL_SMTP_PORT=2525
EMAIL_SMTP_USER=your_user
EMAIL_SMTP_PASS=your_pass
EMAIL_FROM=noreply@immotopia.com

# Frontend URL (for invitation links)
FRONTEND_URL=http://localhost:3000
```

---

## Step 7: Verification Checklist

- [ ] Database migration successful
- [ ] Default roles and permissions seeded
- [ ] Platform Admin can create tenants
- [ ] Platform Admin can enable/disable modules
- [ ] Tenant Admin can invite collaborators
- [ ] Invitation emails sent (or logged if failure)
- [ ] Invitation acceptance flow works
- [ ] Permission checks enforced on all routes
- [ ] Module gating prevents unauthorized access
- [ ] Tenant suspension revokes sessions immediately
- [ ] Subscription expiration limits to read-only
- [ ] Audit logs created for all admin actions
- [ ] Cross-tenant access prevented (isolation test passes)

---

## Troubleshooting

### Invitation emails not sending
- Check email service configuration
- Verify EMAIL_SERVICE_TYPE and SMTP credentials
- Check logs for email errors (invitation still created)

### Permission checks too slow
- Verify permission cache is working
- Check database indexes on user_roles table
- Consider reducing cache TTL if needed

### Session revocation not working
- Verify RefreshToken model has proper indexes
- Check that revoked flag is being set
- Ensure token validation checks revoked status

---

## Next Steps

1. Implement remaining roles (TENANT_MANAGER, TENANT_AGENT, TENANT_ACCOUNTANT)
2. Add more granular permissions as needed
3. Implement subscription webhooks (if payment provider added)
4. Add tenant statistics dashboard
5. Implement audit log UI for admins





