# Database Migration Commands

## Prerequisites
- Ensure PostgreSQL database is running and accessible
- Verify `DATABASE_URL` is set in `.env` file
- Backup your database before running migrations (recommended)

## Step 1: Create the Migration

Navigate to the API package directory and create the migration:

```powershell
cd packages/api
npx prisma migrate dev --name add_multi_tenant_rbac --create-only
```

**Note**: This will prompt for confirmation. Type `y` and press Enter when asked.

If you encounter the warning about unique constraint on `subdomain`, this is expected for new tenants. Existing tenants may need their subdomain values updated manually if there are duplicates.

## Step 2: Review the Migration

After creation, review the generated migration file:
- Location: `packages/api/prisma/migrations/[timestamp]_add_multi_tenant_rbac/migration.sql`
- Verify all new tables, enums, and fields are included

## Step 3: Apply the Migration

Apply the migration to your database:

```powershell
npx prisma migrate deploy
```

Or if you want to apply and mark as applied in development:

```powershell
npx prisma migrate dev
```

## Step 4: Generate Prisma Client

After migration, regenerate the Prisma client to include new types:

```powershell
npx prisma generate
```

## Step 5: Seed RBAC Data

Run the RBAC seed script to populate default roles and permissions:

```powershell
npx ts-node prisma/seeds/rbac-seed.ts
```

Or use the npm script:

```powershell
npm run db:seed
```

## Alternative: All-in-One Command

If you want to create and apply the migration in one step (development only):

```powershell
cd packages/api
npx prisma migrate dev --name add_multi_tenant_rbac
npx prisma generate
npx ts-node prisma/seeds/rbac-seed.ts
```

## Verification

After migration, verify the schema:

```powershell
npx prisma studio
```

This will open Prisma Studio where you can browse the database and verify:
- New enums are created (TenantStatus, ModuleKey, MembershipStatus, etc.)
- New tables are created (tenant_modules, memberships, roles, permissions, etc.)
- Existing tables have new fields (tenants.status, users.last_login_at, etc.)

## Troubleshooting

### If migration fails due to existing data:
1. Check for duplicate `subdomain` values in existing tenants
2. Update or remove duplicates before running migration
3. Or modify the migration SQL to handle existing data

### If enum values conflict:
- The migration will add new enum values
- Existing data should remain compatible

### Rollback (if needed):
```powershell
npx prisma migrate resolve --rolled-back [migration_name]
```

## Expected Migration Contents

The migration should include:
- New enums: TenantStatus, ModuleKey, MembershipStatus, RoleScope, SubscriptionPlan, BillingCycle, SubscriptionStatus, InvoiceStatus, InvitationStatus
- New tables: tenant_modules, memberships, roles, permissions, role_permissions, user_roles, invitations, subscriptions, invoices, audit_logs
- Extended tables: tenants (new fields), users (last_login_at, new relationships)





