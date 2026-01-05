# Implementation Plan: Rental Management Module

**Branch**: `006-rental-management` | **Date**: 2025-01-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-rental-management/spec.md`

## Summary

This implementation plan establishes a comprehensive Rental Management Module (Module Gestion Locative) for the ImmoTopia real estate platform. The system enables property managers within tenant organizations to manage rental leases, generate payment installments, process payments (including mobile money), calculate penalties for overdue installments, track security deposits, and generate rental documents. The module enforces strict tenant data isolation, implements role-based access control, and maintains comprehensive audit trails.

**Technical Approach**: Extend existing Node.js + TypeScript backend (Express.js) with Prisma ORM for PostgreSQL, implementing new entities for rental leases, installments, payments, penalties, security deposits, and documents. Add rental services for lease management, installment generation, payment processing and allocation, penalty calculation (daily automated job with manual override), security deposit tracking, and document generation. Implement scheduled jobs for automatic penalty calculation. Frontend React application will include lease management, installment schedules, payment recording and allocation, penalty management, security deposit tracking, and document generation interfaces. All UI text must be in French per Constitution.

## Technical Context

**Language/Version**: TypeScript 5.3 (strict mode), Node.js >=18.x (LTS)  
**Primary Dependencies**: 
- Backend: Express.js 4.18, Prisma 5.7, Zod 3.22, node-cron (for scheduled jobs), jsonwebtoken, bcrypt
- Frontend: React 18, TypeScript, React Router, Axios
- Database: PostgreSQL >=14 (via Prisma ORM)

**Storage**: PostgreSQL (via Prisma ORM)  
**Testing**: Jest 29, Supertest (backend), React Testing Library (frontend)  
**Target Platform**: Web application (Node.js server + modern web browsers)  
**Project Type**: web (monorepo with frontend + backend)  
**Performance Goals**: 
- Lease creation: <3 minutes (SC-001)
- Installment generation for 12-month lease: <2 seconds (SC-002)
- Payment recording and allocation: <1 minute (SC-003)
- Penalty calculation: <1 second per installment (SC-004)
- Installment list view: <1 second (SC-005)
- Support 1,000 active leases per tenant (SC-006)
- Process 100 payment allocations per minute (SC-007)
- 95% payment allocation accuracy (SC-008)
- Document generation: <5 seconds (SC-009)
- Payment history view: <2 seconds (SC-011)

**Constraints**: 
- Strict tenant data isolation (100% - zero cross-tenant access) (FR-026, SC-010)
- Manual installment generation trigger (FR-005)
- Automatic daily penalty calculation with manual override (FR-014)
- Payment allocation priority: oldest overdue first, then earliest due (FR-010)
- Security deposit single payment only (FR-018)
- Document numbers in format YYYY-NNN (FR-022)
- All UI text in French (Constitution Principle I)
- Unique lease numbers per tenant (FR-002)
- Unique document numbers per tenant per year (FR-022)
- Unique installment per lease per period (FR-036)

**Scale/Scope**: 
- Support tenant organizations with up to 1,000 active leases
- Multiple installments per lease (monthly, quarterly, semiannual, annual)
- Multiple payments per installment (partial payments)
- Multiple payment allocations per payment
- Security deposit movements per lease
- Document generation and storage per lease/installment/payment
- Scheduled job for daily penalty calculation
- Audit logging for all create/update/delete operations (FR-030)

**Research Completed**: All technical unknowns resolved in `research.md`:
- ✅ Scheduled Job Implementation: node-cron for daily penalty calculation
- ✅ Installment Generation Algorithm: Manual trigger with period calculation
- ✅ Payment Allocation Algorithm: Priority-based allocation (oldest overdue first)
- ✅ Document Number Generation: Year-prefixed sequential numbering per tenant
- ✅ Security Deposit Validation: Single payment validation logic
- ✅ Currency Handling: Currency validation and consistency checks

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Pre-Research Status**: ✅ PASSED  
**Post-Design Status**: ✅ PASSED

**Constitution Compliance**:
- ✅ **Principle I (Français Obligatoire)**: All UI components, messages, labels, and user-facing text will be in French. Code comments and technical documentation may use English.
- ✅ **Principle II (Aucune Donnée Fictive)**: Seed scripts will use real or anonymized data only.
- ✅ **Principle III (Stack Technique)**: Using Node.js + TypeScript, Express.js, React + TypeScript, PostgreSQL + Prisma ORM, Git.
- ✅ **Principle IV (Débogage Systématique)**: Frontend debugging with Chrome DevTools and Puppeteer.
- ✅ **Principle V (Workflow & Qualité)**: Git commit format `<service>: <action> – <description>`, 80% test coverage, versioned seeds.

**Gates**:
- ✅ Type safety: TypeScript strict mode
- ✅ Testing: Jest + Supertest configured
- ✅ Database: Prisma ORM with PostgreSQL
- ✅ Security: RBAC middleware exists, tenant isolation patterns established
- ✅ Validation: Zod schemas for request validation
- ✅ Scheduled Jobs: node-cron for automated tasks
- ✅ File Storage: Document storage service available (assumed from dependencies)

## Project Structure

### Documentation (this feature)

```text
specs/006-rental-management/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   └── openapi.yaml     # API contract definitions
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
packages/api/
├── src/
│   ├── controllers/
│   │   ├── rental-controller.ts          # Rental lease routes (CRUD, status management)
│   │   ├── rental-installment-controller.ts # Installment generation and management
│   │   ├── rental-payment-controller.ts  # Payment recording and allocation
│   │   ├── rental-penalty-controller.ts  # Penalty calculation and management
│   │   ├── rental-deposit-controller.ts  # Security deposit management
│   │   └── rental-document-controller.ts # Document generation and retrieval
│   ├── services/
│   │   ├── rental-lease-service.ts      # Lease CRUD, status transitions, co-renter management
│   │   ├── rental-installment-service.ts # Installment generation, status updates
│   │   ├── rental-payment-service.ts     # Payment recording, allocation, status management
│   │   ├── rental-penalty-service.ts    # Penalty calculation, rule management
│   │   ├── rental-deposit-service.ts    # Security deposit movements, balance tracking
│   │   ├── rental-document-service.ts   # Document generation, storage, retrieval
│   │   └── rental-scheduler-service.ts   # Scheduled job for daily penalty calculation
│   ├── middleware/
│   │   ├── rental-rbac-middleware.ts    # Rental permission checks
│   │   └── tenant-isolation-middleware.ts # Enhanced tenant data isolation (existing)
│   ├── routes/
│   │   └── rental-routes.ts             # Tenant-scoped rental routes (/tenants/:id/rental/*)
│   ├── jobs/
│   │   └── penalty-calculation-job.ts   # Daily penalty calculation scheduled job
│   └── types/
│       └── rental-types.ts              # Rental TypeScript types
├── prisma/
│   ├── schema.prisma                    # Extended with rental entities
│   └── migrations/                      # New migration for rental tables
└── __tests__/
    ├── integration/
    │   ├── rental.integration.test.ts   # Rental integration tests
    │   └── penalty-calculation.integration.test.ts # Penalty calculation job tests
    └── unit/
        ├── installment-generation.test.ts # Installment generation algorithm tests
        ├── payment-allocation.test.ts    # Payment allocation priority tests
        └── penalty-calculation.test.ts   # Penalty calculation algorithm tests

apps/web/
├── src/
│   ├── pages/
│   │   ├── rental/
│   │   │   ├── Leases.tsx               # Lease list and detail
│   │   │   ├── Installments.tsx         # Installment schedule view
│   │   │   ├── Payments.tsx             # Payment recording and allocation
│   │   │   ├── Penalties.tsx            # Penalty management
│   │   │   ├── Deposits.tsx             # Security deposit management
│   │   │   └── Documents.tsx            # Document list and generation
│   ├── components/
│   │   ├── rental/
│   │   │   ├── LeaseForm.tsx            # Lease create/edit form
│   │   │   ├── InstallmentSchedule.tsx  # Installment schedule display
│   │   │   ├── PaymentForm.tsx          # Payment recording form
│   │   │   ├── PaymentAllocation.tsx    # Payment allocation interface
│   │   │   ├── PenaltyRules.tsx         # Penalty rule configuration
│   │   │   ├── DepositMovements.tsx     # Security deposit movement tracking
│   │   │   └── DocumentGenerator.tsx    # Document generation interface
│   ├── services/
│   │   └── rental-service.ts            # Rental API client
│   └── types/
│       └── rental-types.ts              # Frontend rental types
```

**Structure Decision**: Using existing monorepo structure (packages/api for backend, apps/web for frontend). Rental module extends existing multi-tenant RBAC infrastructure. All rental routes are tenant-scoped (/tenants/:tenantId/rental/*). Services follow existing patterns (business logic in services, minimal controllers). Scheduled jobs implemented using node-cron for daily penalty calculation. Document storage uses existing file storage service.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations detected. All requirements align with Constitution principles.
