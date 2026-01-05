# Data Model: Authentication & Login Module

**Feature**: 1-auth-login  
**Date**: 2025-11-12  
**Database**: PostgreSQL >=14  
**ORM**: Prisma

---

## Overview

This document defines the database schema for the authentication and login module. The schema includes four main entities: User, RefreshToken, PasswordResetToken, and EmailVerificationToken. All entities follow snake_case naming convention for database fields, and use UUID for primary keys.

---

## Prisma Schema

```prisma
// Prisma schema for authentication module
// File: packages/api/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// User role enumeration
enum UserRole {
  STUDENT
  INSTRUCTOR
  ADMIN
}

// User entity
model User {
  id                    String    @id @default(uuid())
  email                 String    @unique
  password_hash         String
  full_name             String
  role                  UserRole  @default(STUDENT)
  email_verified        Boolean   @default(false)
  is_active             Boolean   @default(true)
  created_at            DateTime  @default(now())
  updated_at            DateTime  @updatedAt
  last_login            DateTime?
  failed_login_attempts Int       @default(0)
  locked_until          DateTime?

  // Relationships
  refresh_tokens         RefreshToken[]
  password_reset_tokens  PasswordResetToken[]
  email_verification_tokens EmailVerificationToken[]

  @@index([email])
  @@index([role])
  @@index([email_verified])
  @@map("users")
}

// Refresh token entity
model RefreshToken {
  id          String   @id @default(uuid())
  token       String   @unique
  user_id     String
  expires_at  DateTime
  created_at  DateTime @default(now())
  revoked     Boolean  @default(false)
  revoked_at  DateTime?
  device_info String?

  // Relationships
  user User @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@index([user_id])
  @@index([token])
  @@index([expires_at])
  @@index([revoked])
  @@map("refresh_tokens")
}

// Password reset token entity
model PasswordResetToken {
  id         String   @id @default(uuid())
  token      String   @unique
  user_id    String
  expires_at DateTime
  created_at DateTime @default(now())
  used       Boolean  @default(false)

  // Relationships
  user User @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@index([user_id])
  @@index([token])
  @@index([expires_at])
  @@index([used])
  @@map("password_reset_tokens")
}

// Email verification token entity
model EmailVerificationToken {
  id         String   @id @default(uuid())
  token      String   @unique
  user_id    String
  expires_at DateTime
  created_at DateTime @default(now())
  used       Boolean  @default(false)

  // Relationships
  user User @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@index([user_id])
  @@index([token])
  @@index([expires_at])
  @@index([used])
  @@map("email_verification_tokens")
}
```

---

## Entity Descriptions

### 1. User

**Purpose**: Represents a user of the platform with authentication and authorization information.

**Fields**:
- `id` (UUID): Primary key, unique identifier
- `email` (String, unique): User email address (unique, indexed)
- `password_hash` (String): Bcrypt hash of user password (never stored in plaintext)
- `full_name` (String): User full name
- `role` (UserRole enum): User role (STUDENT, INSTRUCTOR, ADMIN), default: STUDENT
- `email_verified` (Boolean): Email verification status, default: false
- `is_active` (Boolean): Account active status, default: true
- `created_at` (DateTime): Account creation timestamp
- `updated_at` (DateTime): Last update timestamp (auto-updated)
- `last_login` (DateTime, nullable): Last successful login timestamp
- `failed_login_attempts` (Int): Number of failed login attempts, default: 0
- `locked_until` (DateTime, nullable): Account lockout expiration timestamp

**Relationships**:
- One-to-many with `RefreshToken` (a user can have multiple refresh tokens)
- One-to-many with `PasswordResetToken` (a user can have multiple password reset tokens)
- One-to-many with `EmailVerificationToken` (a user can have multiple email verification tokens)

**Indexes**:
- `email` (unique index for fast lookups)
- `role` (index for role-based queries)
- `email_verified` (index for filtering verified users)

**Validation Rules**:
- Email must be unique
- Email must be valid format (validated by Zod)
- Password hash must be bcrypt format (validated by bcrypt)
- Role must be one of: STUDENT, INSTRUCTOR, ADMIN
- Full name must be non-empty (validated by Zod)

**Business Rules**:
- New users are created with `email_verified: false`
- Users cannot log in until `email_verified: true`
- Accounts are locked after 5 failed login attempts (30 minutes)
- Failed login attempts reset after successful login
- Accounts can be deactivated (`is_active: false`) by admin

---

### 2. RefreshToken

**Purpose**: Stores refresh tokens for JWT token refresh mechanism.

**Fields**:
- `id` (UUID): Primary key, unique identifier
- `token` (String, unique): Refresh token (hashed before storage)
- `user_id` (UUID): Foreign key to User
- `expires_at` (DateTime): Token expiration timestamp (7 days from creation)
- `created_at` (DateTime): Token creation timestamp
- `revoked` (Boolean): Token revocation status, default: false
- `revoked_at` (DateTime, nullable): Token revocation timestamp
- `device_info` (String, nullable): Device information (user-agent, IP address)

**Relationships**:
- Many-to-one with `User` (a refresh token belongs to one user)

**Indexes**:
- `user_id` (index for user-based queries)
- `token` (unique index for fast lookups)
- `expires_at` (index for expiration queries)
- `revoked` (index for filtering revoked tokens)

**Validation Rules**:
- Token must be unique
- Token must be hashed before storage (SHA-256 or bcrypt)
- Expires_at must be in the future
- User_id must reference valid user

**Business Rules**:
- Refresh tokens expire after 7 days
- Refresh tokens can be revoked (logout, security breach)
- Revoked tokens cannot be used to refresh access tokens
- Multiple refresh tokens per user (multiple devices/sessions)
- Device info is optional but recommended for security auditing

**Security Considerations**:
- Token is hashed before storage (never stored in plaintext)
- Token is transmitted via HTTP-only cookie (XSS protection)
- Token is validated on every refresh request
- Expired tokens are automatically invalidated

---

### 3. PasswordResetToken

**Purpose**: Stores temporary tokens for password reset functionality.

**Fields**:
- `id` (UUID): Primary key, unique identifier
- `token` (String, unique): Password reset token (UUID or JWT)
- `user_id` (UUID): Foreign key to User
- `expires_at` (DateTime): Token expiration timestamp (1 hour from creation)
- `created_at` (DateTime): Token creation timestamp
- `used` (Boolean): Token usage status, default: false

**Relationships**:
- Many-to-one with `User` (a password reset token belongs to one user)

**Indexes**:
- `user_id` (index for user-based queries)
- `token` (unique index for fast lookups)
- `expires_at` (index for expiration queries)
- `used` (index for filtering used tokens)

**Validation Rules**:
- Token must be unique
- Token must be UUID or JWT format
- Expires_at must be in the future
- User_id must reference valid user

**Business Rules**:
- Password reset tokens expire after 1 hour
- Tokens can only be used once (`used: true` after use)
- Used tokens cannot be reused
- Multiple tokens per user (user can request multiple resets)
- Tokens are invalidated after successful password reset

**Security Considerations**:
- Token is transmitted via URL parameter (email link)
- Token is validated on every reset request
- Expired tokens are automatically invalidated
- Used tokens are marked as used (cannot be reused)

---

### 4. EmailVerificationToken

**Purpose**: Stores temporary tokens for email verification functionality.

**Fields**:
- `id` (UUID): Primary key, unique identifier
- `token` (String, unique): Email verification token (UUID or JWT)
- `user_id` (UUID): Foreign key to User
- `expires_at` (DateTime): Token expiration timestamp (24 hours from creation)
- `created_at` (DateTime): Token creation timestamp
- `used` (Boolean): Token usage status, default: false

**Relationships**:
- Many-to-one with `User` (an email verification token belongs to one user)

**Indexes**:
- `user_id` (index for user-based queries)
- `token` (unique index for fast lookups)
- `expires_at` (index for expiration queries)
- `used` (index for filtering used tokens)

**Validation Rules**:
- Token must be unique
- Token must be UUID or JWT format
- Expires_at must be in the future
- User_id must reference valid user

**Business Rules**:
- Email verification tokens expire after 24 hours
- Tokens can only be used once (`used: true` after use)
- Used tokens cannot be reused
- Multiple tokens per user (user can request multiple verifications)
- Tokens are invalidated after successful email verification

**Security Considerations**:
- Token is transmitted via URL parameter (email link)
- Token is validated on every verification request
- Expired tokens are automatically invalidated
- Used tokens are marked as used (cannot be reused)

---

## Database Migrations

### Migration 1: Initial Schema

**File**: `packages/api/prisma/migrations/YYYYMMDDHHMMSS_init_auth_schema/migration.sql`

```sql
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('STUDENT', 'INSTRUCTOR', 'ADMIN');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'STUDENT',
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_login" TIMESTAMP(3),
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "revoked_at" TIMESTAMP(3),
    "device_info" TEXT,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_email_verified_idx" ON "users"("email_verified");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_idx" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "refresh_tokens_revoked_idx" ON "refresh_tokens"("revoked");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "password_reset_tokens_token_idx" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "password_reset_tokens_used_idx" ON "password_reset_tokens"("used");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_token_key" ON "email_verification_tokens"("token");

-- CreateIndex
CREATE INDEX "email_verification_tokens_user_id_idx" ON "email_verification_tokens"("user_id");

-- CreateIndex
CREATE INDEX "email_verification_tokens_token_idx" ON "email_verification_tokens"("token");

-- CreateIndex
CREATE INDEX "email_verification_tokens_expires_at_idx" ON "email_verification_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "email_verification_tokens_used_idx" ON "email_verification_tokens"("used");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

---

## Seed Data

### Seed Script

**File**: `packages/api/prisma/seeds/seed-users.ts`

```typescript
import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const saltRounds = 12;

  // Admin account
  const adminPassword = await bcrypt.hash('Admin@123456', saltRounds);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@immotopia.com' },
    update: {},
    create: {
      email: 'admin@immotopia.com',
      password_hash: adminPassword,
      full_name: 'Administrateur Principal',
      role: UserRole.ADMIN,
      email_verified: true,
      is_active: true,
    },
  });

  // Instructor account
  const instructorPassword = await bcrypt.hash('Instructor@123456', saltRounds);
  const instructor = await prisma.user.upsert({
    where: { email: 'instructeur@immotopia.com' },
    update: {},
    create: {
      email: 'instructeur@immotopia.com',
      password_hash: instructorPassword,
      full_name: 'Jean Dupont',
      role: UserRole.INSTRUCTOR,
      email_verified: true,
      is_active: true,
    },
  });

  // Student account
  const studentPassword = await bcrypt.hash('Student@123456', saltRounds);
  const student = await prisma.user.upsert({
    where: { email: 'etudiant@immotopia.com' },
    update: {},
    create: {
      email: 'etudiant@immotopia.com',
      password_hash: studentPassword,
      full_name: 'Marie Martin',
      role: UserRole.STUDENT,
      email_verified: true,
      is_active: true,
    },
  });

  console.log('Seed data created:', { admin, instructor, student });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

---

## Validation Rules

### User Validation

**Email**:
- Must be unique
- Must be valid email format (RFC 5322)
- Must be lowercase (normalized)

**Password**:
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character
- Must be hashed with bcrypt (salt factor 12)

**Full Name**:
- Must be non-empty
- Maximum 100 characters
- Trimmed (no leading/trailing whitespace)

**Role**:
- Must be one of: STUDENT, INSTRUCTOR, ADMIN
- Default: STUDENT
- ADMIN role cannot be assigned during registration

### Token Validation

**Refresh Token**:
- Must be unique
- Must be hashed before storage (SHA-256)
- Expires after 7 days
- Can be revoked

**Password Reset Token**:
- Must be unique
- Must be UUID or JWT format
- Expires after 1 hour
- Can only be used once

**Email Verification Token**:
- Must be unique
- Must be UUID or JWT format
- Expires after 24 hours
- Can only be used once

---

## Query Patterns

### Common Queries

**Find user by email**:
```typescript
const user = await prisma.user.findUnique({
  where: { email: 'user@example.com' },
});
```

**Find user with refresh tokens**:
```typescript
const user = await prisma.user.findUnique({
  where: { email: 'user@example.com' },
  include: { refresh_tokens: true },
});
```

**Find active refresh token**:
```typescript
const refreshToken = await prisma.refreshToken.findFirst({
  where: {
    token: hashedToken,
    revoked: false,
    expires_at: { gt: new Date() },
  },
});
```

**Find valid password reset token**:
```typescript
const resetToken = await prisma.passwordResetToken.findFirst({
  where: {
    token: token,
    used: false,
    expires_at: { gt: new Date() },
  },
  include: { user: true },
});
```

**Find valid email verification token**:
```typescript
const verificationToken = await prisma.emailVerificationToken.findFirst({
  where: {
    token: token,
    used: false,
    expires_at: { gt: new Date() },
  },
  include: { user: true },
});
```

---

## Performance Considerations

### Indexes

All foreign keys and frequently queried fields are indexed:
- `users.email` (unique index)
- `users.role` (index for role-based queries)
- `users.email_verified` (index for filtering verified users)
- `refresh_tokens.token` (unique index)
- `refresh_tokens.user_id` (index for user-based queries)
- `refresh_tokens.expires_at` (index for expiration queries)
- `password_reset_tokens.token` (unique index)
- `email_verification_tokens.token` (unique index)

### Query Optimization

- Use `findUnique` for primary key and unique field lookups
- Use `findFirst` with `where` clause for filtered queries
- Use `include` to fetch related data in single query
- Use `select` to fetch only required fields
- Use pagination for list queries (future enhancement)

---

## Security Considerations

### Data Protection

- Passwords are never stored in plaintext (bcrypt hashed)
- Refresh tokens are hashed before storage (SHA-256)
- Sensitive data is not logged
- Database connections use SSL/TLS in production

### Access Control

- User data is protected by authentication middleware
- Role-based access control (RBAC) enforced at API level
- Database queries use Prisma (prevents SQL injection)
- Input validation using Zod schemas

---

**Data Model Status**: ✅ Complete - Prisma schema defined  
**Last Updated**: 2025-11-12

