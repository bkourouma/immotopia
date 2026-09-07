# Implementation Plan: Tenant Portal Module

**Branch**: `008-tenant-portal` | **Date**: 2025-01-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-tenant-portal/spec.md`

## Summary

This implementation plan establishes a comprehensive Tenant Portal Module for the ImmoTopia real estate platform. The system enables tenants to access a self-service web portal where they can view their lease details, track payment installments and history, declare payments made outside the portal, view security deposit information, create and track maintenance requests, and download rental documents. The module enforces strict tenant access control (only tenants with active leases can access), implements role-based access restrictions (tenants can only access their own data), and provides a complete dashboard view of their rental situation.

**Technical Approach**: Extend existing Node.js + TypeScript backend (Express.js) with Prisma ORM for PostgreSQL, implementing new middleware for tenant portal access validation, new service layer for tenant portal operations, and new API endpoints under `/api/portal/tenant/*`. Add new Prisma model for `RentalPaymentDeclaration` to track tenant-declared payments. Frontend React application will include tenant portal layout with navigation, dashboard page, lease details page, payments page with declaration modal, maintenance page with ticket creation, and documents page. All UI text must be in French per Constitution.

## Technical Context

**Language/Version**: TypeScript 5.3 (strict mode), Node.js >=18.x (LTS)  
**Primary Dependencies**: 
- Backend: Express.js 4.18, Prisma 5.7, Zod 3.22, Multer (file uploads), Nodemailer (email notifications), jsonwebtoken
- Frontend: React 18, TypeScript, React Router v6, Tailwind CSS, Axios, Lucide React (icons)
- Database: PostgreSQL >=14 (via Prisma ORM)

**Storage**: PostgreSQL (via Prisma ORM) for data, local filesystem (`uploads/portal/payments/<tenantId>/<declarationId>/` and `uploads/maintenance/<tenantId>/<ticketId>/` for existing maintenance module) for file uploads  
**Testing**: Jest 29, Supertest (backend), React Testing Library (frontend)  
**Target Platform**: Web application (Node.js server + modern web browsers)  
**Project Type**: web (monorepo with frontend + backend)  
**Performance Goals**: 
- Dashboard load: <2 seconds (SC-001)
- Payment declaration submission: <1 minute (SC-002)
- Maintenance ticket creation: <2 minutes (SC-003)
- Document download success rate: 95% (SC-004)
- Support 500 concurrent tenant portal users (SC-005)
- Payment declaration visibility to property managers: <30 seconds (SC-006)
- Maintenance ticket visibility to property managers: <30 seconds (SC-007)
- Payment history view (up to 100 payments): <1 second (SC-008)
- Portal access denial for unauthorized users: <1 second (SC-009)
- Primary task completion rate: 90% on first attempt (SC-010)

**Constraints**: 
- Strict tenant access control: only tenants with active leases can access portal (FR-001, FR-002, FR-003)
- Tenants can only access their own lease data, payments, tickets, and documents (FR-023)
- Payment declaration file upload limits: 5MB per file, proof files only (FR-024)
- Payment declaration validation: required fields, valid amounts, valid dates (FR-010)
- Maintenance ticket creation uses existing maintenance module (FR-013, FR-014, FR-015)
- All UI text in French (Constitution Principle I)
- File uploads must validate file size and type (FR-024)
- Multi-tenant data isolation enforced at all layers (FR-023)

**Scale/Scope**: 
- Support tenants with active leases across all tenant organizations
- Dashboard aggregating lease, payment, deposit, and maintenance data
- Payment declarations with optional proof file uploads
- Integration with existing maintenance module for ticket creation
- Document access for all rental documents associated with tenant's lease
- Payment history tracking for up to 100 payments per lease

**Research Completed**: All technical unknowns resolved:
- ✅ Tenant Portal Access Middleware: Verify JWT auth, check TenantClient link, verify active lease (primary renter or co-renter)
- ✅ Payment Declaration Model: New Prisma model `RentalPaymentDeclaration` with status workflow (PENDING → APPROVED/REJECTED)
- ✅ File Upload for Payment Proof: Use existing Multer pattern, save to `uploads/portal/payments/<tenantId>/<declarationId>/`
- ✅ Maintenance Ticket Integration: Reuse existing maintenance module endpoints and services
- ✅ Document Access: Use existing rental document service with access validation
- ✅ Dashboard Aggregation: Calculate balance, find next installment, aggregate recent payments and maintenance tickets

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Pre-Research Status**: ✅ PASSED  
**Post-Design Status**: ✅ PASSED

**Constitution Compliance**:
- ✅ **Principle I (Français Obligatoire)**: All UI components, messages, labels, error messages, notifications, and user-facing text will be in French. Code comments and technical documentation may use English.
- ✅ **Principle II (Aucune Donnée Fictive)**: Seed scripts will use real or anonymized data only.
- ✅ **Principle III (Stack Technique)**: Using Node.js + TypeScript, Express.js, React + TypeScript, PostgreSQL + Prisma ORM, Git.
- ✅ **Principle IV (Débogage Systématique)**: Frontend debugging with Chrome DevTools and Puppeteer.
- ✅ **Principle V (Workflow & Qualité)**: Git commit format `<service>: <action> – <description>`, 80% test coverage, versioned seeds.

**Gates**:
- ✅ Type safety: TypeScript strict mode
- ✅ Testing: Jest + Supertest configured
- ✅ Database: Prisma ORM with PostgreSQL
- ✅ Security: JWT authentication middleware exists (`authenticate`), tenant isolation patterns established
- ✅ Validation: Zod schemas for request validation
- ✅ File Upload: Multer configured and used in existing modules (properties, documents, maintenance)
- ✅ Email Service: Nodemailer configured and used for notifications
- ✅ File Storage: Local filesystem storage pattern established (`uploads/` directory structure)
- ✅ Rental Management Module: Complete rental lease, installment, payment, deposit data available
- ✅ Maintenance Module: Maintenance ticket system functional for ticket creation and status tracking
- ✅ Document Generation Module: Rental documents (contracts, receipts, quittances) generated and stored

## Project Structure

### Documentation (this feature)

```text
specs/008-tenant-portal/
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
│   │   └── tenant-portal-controller.ts    # Tenant portal API endpoints (dashboard, lease, payments, maintenance, documents)
│   ├── services/
│   │   └── tenant-portal-service.ts       # Tenant portal business logic (dashboard aggregation, payment declarations, data access)
│   ├── middleware/
│   │   └── tenant-portal-access.ts         # Middleware to verify tenant has active lease and grant portal access
│   ├── routes/
│   │   └── tenant-portal-routes.ts         # Tenant portal routes (/api/portal/tenant/*)
│   ├── types/
│   │   └── tenant-portal-types.ts          # Tenant portal TypeScript types and Zod schemas
│   └── utils/
│       └── tenant-portal-validators.ts     # Payment declaration validation, file upload validation
│   └── prisma/
│       ├── schema.prisma                  # Extended with RentalPaymentDeclaration model
│       └── migrations/                    # New migration for payment declarations table

apps/web/
├── src/
│   ├── pages/
│   │   └── TenantPortal/
│   │       ├── Layout.tsx                 # Portal layout with sidebar navigation
│   │       ├── Dashboard.tsx              # Dashboard page (lease overview, balance, next payment, recent payments, maintenance summary)
│   │       ├── Lease.tsx                  # Lease details page (lease info, co-renters, documents)
│   │       ├── Payments.tsx               # Payments page (installments list, payment history, payment declaration modal)
│   │       ├── Maintenance.tsx            # Maintenance page (ticket list, ticket creation modal, ticket details)
│   │       └── Documents.tsx              # Documents page (documents grouped by type, download functionality)
│   ├── components/
│   │   └── TenantPortal/
│   │       ├── PaymentDeclarationModal.tsx # Modal for declaring payments
│   │       ├── MaintenanceTicketModal.tsx  # Modal for creating maintenance tickets
│   │       └── InstallmentDetails.tsx     # Component for viewing installment breakdown
│   ├── services/
│   │   └── tenantPortalService.ts         # API service for tenant portal endpoints
│   └── App.tsx                            # Updated with tenant portal routes
```

**Structure Decision**: This feature extends the existing monorepo structure with new backend services, controllers, routes, and middleware following the established Service-Controller-Route pattern. Frontend adds new pages under `TenantPortal/` directory with shared layout component. The structure follows existing patterns from rental management and maintenance modules.

## Complexity Tracking

> **No Constitution violations - all gates passed**

---

## Phase Completion Status

### Phase 0: Outline & Research ✅ COMPLETE

- ✅ Research document created: `research.md`
- ✅ All technical decisions documented
- ✅ All NEEDS CLARIFICATION markers resolved
- ✅ Technology choices aligned with existing patterns

### Phase 1: Design & Contracts ✅ COMPLETE

- ✅ Data model documented: `data-model.md`
- ✅ API contracts created: `contracts/openapi.yaml`
- ✅ Quick start guide created: `quickstart.md`
- ✅ Agent context updated: `.cursor/rules/specify-rules.mdc`

**Generated Artifacts**:
- `specs/008-tenant-portal/research.md` - Technology decisions and rationale
- `specs/008-tenant-portal/data-model.md` - Data model with RentalPaymentDeclaration
- `specs/008-tenant-portal/contracts/openapi.yaml` - Complete API contract
- `specs/008-tenant-portal/quickstart.md` - Developer quick start guide

### Phase 2: Task Breakdown ⏳ PENDING

- ⏳ Task breakdown will be created by `/speckit.tasks` command
- ⏳ Implementation tasks will be generated from this plan

---

## Next Steps

1. **Review generated artifacts**: Review `research.md`, `data-model.md`, `contracts/openapi.yaml`, and `quickstart.md`
2. **Run task breakdown**: Execute `/speckit.tasks` to generate implementation tasks
3. **Begin implementation**: Follow tasks in order, starting with backend middleware and service layer
4. **Test incrementally**: Test each component as it's implemented
5. **Update documentation**: Keep documentation in sync with implementation
