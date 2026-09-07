# Prisma Database Setup

## Prerequisites

Before running migrations and generating the Prisma client, ensure you have:

1. PostgreSQL >= 14 installed and running
2. Database created (e.g., `immotopia`)
3. `DATABASE_URL` configured in `.env` file

## Setup Steps

### 1. Configure Environment Variables

Copy `env.example` to `.env` and update the `DATABASE_URL`:

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/immotopia?schema=public"
```

### 2. Generate Prisma Client

```bash
npm run prisma:generate
```

Or manually:
```bash
npx prisma generate
```

### 3. Create Initial Migration

```bash
npm run prisma:migrate
```

Or manually:
```bash
npx prisma migrate dev --name init_auth_schema
```

This will:
- Create the migration file in `prisma/migrations/`
- Apply the migration to your database
- Generate the Prisma client

### 4. Seed Database

Order matters: the RBAC seed must run **before** the main seed, which looks up
`TENANT_ADMIN` / `TENANT_AGENT` to attach the demo accounts to their tenant.

```bash
npm run db:seed:rbac
ALLOW_DESTRUCTIVE_SEED=1 npm run db:seed
npm run db:seed:geographic
npm run db:seed:property-templates
npm run db:seed:document-templates
npm run db:seed:super-admin
```

On Windows, `setup-database.bat` (repo root) runs all of the above in order.

> `db:seed` **deletes every user, tenant and all cascading data** on the database
> pointed to by `DATABASE_URL`. It refuses to run unless `ALLOW_DESTRUCTIVE_SEED=1`
> is set, and always refuses when `NODE_ENV=production`.
>
> PowerShell: `$env:ALLOW_DESTRUCTIVE_SEED="1"; npm run db:seed`
> cmd.exe: `set ALLOW_DESTRUCTIVE_SEED=1 && npm run db:seed`

Optional demo data (needs the steps above first):

```bash
npm run db:seed:comprehensive    # properties, leases, payments, CRM contacts
npm run db:seed:tenant-members   # extra managers/agents on a tenant (arg: slug or id)
npm run db:seed:maintenance      # maintenance vendors and tickets
npm run db:seed:crm              # CRM contacts, deals and activities
```

Repair utility for databases seeded before roles existed — assigns a role to any
active membership that has none:

```bash
npm run db:assign:rbac -- --dry-run
npm run db:assign:rbac -- --role=TENANT_ADMIN --tenant=agence-mali
```

## Seed Accounts

After seeding, you can use these test accounts (password `Test@123456`):

- `admin1@agence-mali.com` — TENANT_ADMIN @ Agence Immobilière du Mali
- `admin2@bamako-immo.com` — TENANT_ADMIN @ Bamako Immobilier
- `agent@agence-mali.com` — TENANT_AGENT @ Agence Immobilière du Mali
- `proprietaire@gmail.com` — client OWNER @ Agence Immobilière du Mali
- `locataire@gmail.com` — client RENTER @ Bamako Immobilier
- `visitor@immobillier.com` — user without any tenant

Plus the platform account created by `db:seed:super-admin`:

- `admin@immobillier.com` / `Admin@123456` — SUPER_ADMIN
  (override with `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`)

## Troubleshooting

### Database Connection Error

If you get a connection error:
1. Verify PostgreSQL is running: `pg_isready`
2. Check `DATABASE_URL` format in `.env`
3. Verify database exists: `psql -l`

### Migration Issues

If migrations fail:
1. Check database permissions
2. Verify schema doesn't already exist
3. Use `npx prisma migrate reset` to reset (⚠️ deletes all data)

### Prisma Client Not Generated

If TypeScript errors about missing Prisma types:
1. Run `npx prisma generate`
2. Restart TypeScript server in your IDE
3. Verify `node_modules/.prisma/client` exists

