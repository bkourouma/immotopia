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

### 4. Seed Database (Optional)

After migrations are applied, seed the database with test accounts:

```bash
npm run prisma:seed
```

Or manually:
```bash
ts-node prisma/seeds/seed-users.ts
```

## Seed Accounts

After seeding, you can use these test accounts:

- **Admin**: `admin@immotopia.com` / `Admin@123456`
- **Instructor**: `instructeur@immotopia.com` / `Instructor@123456`
- **Student**: `etudiant@immotopia.com` / `Student@123456`

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

