# Implementation Plan: Authentication & Login Module

**Branch**: `1-auth-login` | **Date**: 2025-11-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/1-auth-login/spec.md`

---

## Summary

This implementation plan establishes a complete authentication and authorization system for the ImmoTopia platform. The system enables users to register with email verification, log in securely with JWT tokens, reset passwords, and access role-based dashboards. All flows use real PostgreSQL data via Prisma ORM, with no mock data. The UI is fully in French, and the system implements security best practices including brute force protection, secure token storage, and HTTP-only cookies.

**Technical Approach**: Node.js + TypeScript backend (Express.js) with Prisma ORM for PostgreSQL, React + TypeScript frontend with Context API for state management, JWT access tokens (15min) + refresh tokens (7 days), email service integration for verification and password reset, and comprehensive security measures (bcrypt password hashing, rate limiting, CSRF protection).

---

## Technical Context

**Language/Version**: TypeScript (strict mode), Node.js >=18.x (LTS)  
**Primary Dependencies**: 
- Backend: Express.js, Prisma ORM, bcrypt, jsonwebtoken, cookie-parser, validator, zod (validation)
- Frontend: React >=18.x, TypeScript, React Router, Axios, React Context API
- Email: SendGrid/Mailgun/AWS SES (to be selected in research phase)
- Testing: Jest, Supertest, React Testing Library, Puppeteer

**Storage**: PostgreSQL >=14 (via Prisma ORM)  
**Testing**: Jest + Supertest (backend), Jest + React Testing Library + Puppeteer (frontend)  
**Target Platform**: Web application (desktop + mobile responsive)  
**Project Type**: web (frontend + backend)  
**Performance Goals**: 
- Registration: < 5 seconds (including email send)
- Login: < 3 seconds (including token generation)
- Support 100 concurrent users without performance degradation
- Email delivery: < 2 minutes

**Constraints**: 
- All UI in French (non-negotiable)
- No mock data (seeds only)
- 80% test coverage minimum
- HTTPS in production (required for Secure cookies)
- JWT access tokens: 15 minutes expiry
- Refresh tokens: 7 days expiry
- Password complexity: 8+ chars, uppercase, lowercase, number, special char
- Brute force protection: 5 failed attempts = 30 min lockout

**Scale/Scope**: 
- 4 database entities (User, RefreshToken, PasswordResetToken, EmailVerificationToken)
- 8 API endpoints (register, login, logout, refresh, verify-email, resend-verification, forgot-password, reset-password)
- 6 React pages (register, login, forgot-password, reset-password, verify-email, dashboard)
- 3 user roles (STUDENT, INSTRUCTOR, ADMIN)
- Seed data: 3 test accounts (admin, instructor, student)

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Principe I: Français Obligatoire ✅
- [x] All UI text in French (labels, buttons, error messages, placeholders)
- [x] Email templates in French
- [x] Error messages in French
- [x] Dashboard content in French
- **Status**: PASS - Specification explicitly requires all UI in French

### Principe II: Aucune Donnée Fictive ✅
- [x] No mock data in components or services
- [x] All data from PostgreSQL via Prisma
- [x] Seed data required (3 test accounts: admin, instructor, student)
- [x] Seed scripts versioned
- **Status**: PASS - Specification explicitly requires real data, seed data defined

### Principe III: Stack Technique Imposée ✅
- [x] Backend: Node.js + TypeScript + Express.js + Prisma
- [x] Frontend: React + TypeScript + Context API
- [x] Database: PostgreSQL >=14
- [x] ORM: Prisma (only ORM)
- **Status**: PASS - All stack requirements aligned with constitution

### Principe IV: Débogage Systématique ✅
- [x] Chrome DevTools for manual inspection
- [x] Puppeteer for automated e2e tests
- [x] Testing strategy includes frontend debugging
- **Status**: PASS - Specification mentions Chrome DevTools and Puppeteer for testing

### Principe V: Workflow & Qualité ✅
- [x] Git conventions: `<service>: <action> – <description>`
- [x] Branch naming: `feature/<role>-<feature>`
- [x] Test coverage: 80% minimum
- [x] Seeds versioned
- [x] OpenAPI/Swagger documentation for endpoints
- [x] JSDoc for services
- **Status**: PASS - All workflow requirements aligned with constitution

**Overall Gate Status**: ✅ **PASS** - All constitution gates pass. Ready for Phase 0 research.

---

## Project Structure

### Documentation (this feature)

```text
specs/1-auth-login/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   └── auth-api.yaml    # OpenAPI 3.0 specification
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
packages/
└── api/                    # Backend Node.js + TypeScript
    ├── src/
    │   ├── models/         # Prisma generated models
    │   ├── services/       # Business logic
    │   │   └── auth-service.ts
    │   ├── controllers/    # API routes
    │   │   └── auth-controller.ts
    │   ├── middleware/     # Auth, validation, CORS
    │   │   ├── auth-middleware.ts
    │   │   ├── validation-middleware.ts
    │   │   └── rate-limit-middleware.ts
    │   ├── utils/          # Helpers
    │   │   ├── jwt-utils.ts
    │   │   ├── email-utils.ts
    │   │   └── password-utils.ts
    │   └── types/          # TypeScript types
    │       └── auth-types.ts
    ├── prisma/
    │   ├── schema.prisma
    │   ├── migrations/
    │   └── seeds/
    │       ├── seed-users.ts
    │       └── CHANGELOG.md
    └── __tests__/
        ├── unit/
        ├── integration/
        └── e2e/

apps/
└── web/                    # Frontend React + TypeScript
    ├── src/
    │   ├── components/     # Reusable components
    │   │   ├── ProtectedRoute.tsx
    │   │   ├── AuthForm.tsx
    │   │   └── PasswordStrength.tsx
    │   ├── pages/          # Pages (routing)
    │   │   ├── Register.tsx
    │   │   ├── Login.tsx
    │   │   ├── ForgotPassword.tsx
    │   │   ├── ResetPassword.tsx
    │   │   ├── VerifyEmail.tsx
    │   │   └── Dashboard.tsx
    │   ├── services/       # API calls
    │   │   └── auth-service.ts
    │   ├── hooks/          # Custom hooks
    │   │   └── useAuth.ts
    │   ├── context/        # React Context
    │   │   └── AuthContext.tsx
    │   ├── utils/          # Helpers
    │   │   └── api-client.ts
    │   └── types/          # TypeScript types
    │       └── auth-types.ts
    └── __tests__/
        ├── unit/
        ├── integration/
        └── e2e/
```

**Structure Decision**: Web application structure with separate backend (`packages/api`) and frontend (`apps/web`) as per constitution. Backend follows service-controller-middleware pattern. Frontend uses React Context API for global auth state management. All code follows `.cursorrules` naming conventions (kebab-case for backend files, PascalCase for React components, snake_case for database fields).

---

## Complexity Tracking

> **No violations detected** - All requirements align with constitution principles. No justification needed.

---

## Next Steps

1. **Phase 0: Research** - Generate `research.md` with technology decisions (email service selection, JWT library choice, validation library choice)
2. **Phase 1: Design & Contracts** - Generate `data-model.md` (Prisma schema), `contracts/auth-api.yaml` (OpenAPI spec), `quickstart.md` (setup guide)
3. **Phase 1: Agent Context Update** - Update agent context files with new technologies
4. **Phase 2: Tasks** - Generate `tasks.md` with implementation tasks (via `/speckit.tasks` command)

---

**Plan Status**: Ready for Phase 0 research
**Last Updated**: 2025-11-12

