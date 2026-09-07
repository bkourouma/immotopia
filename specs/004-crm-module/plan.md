# Implementation Plan: CRM & Client Relationship Management

**Branch**: `004-crm-module` | **Date**: 2025-01-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-crm-module/spec.md`

## Summary

This implementation plan establishes a comprehensive CRM (Customer Relationship Management) system for the ImmoTopia real estate platform. The system enables real estate agents within tenant organizations to manage contacts (prospects and clients), track sales opportunities through a pipeline, log all interactions, schedule appointments, match properties to deals, and convert leads to clients. The CRM enforces strict tenant data isolation, implements role-based access control for CRM features, and maintains comprehensive audit trails.

**Technical Approach**: Extend existing Node.js + TypeScript backend (Express.js) with Prisma ORM for PostgreSQL, implementing new entities for contacts, contact roles, deals, activities, appointments, property matches, tags, and notes. Add CRM services for contact management, deal pipeline, activity tracking, property matching (deterministic V1), appointment scheduling, and lead conversion. Implement RBAC permissions for CRM operations, tenant-scoped data access, and audit logging. Frontend React application will include CRM dashboard, contact management, deal pipeline (Kanban view), activity timelines, appointment calendar, and property matching interface.

## Technical Context

**Language/Version**: TypeScript 5.3 (strict mode), Node.js >=18.x (LTS)  
**Primary Dependencies**: 
- Backend: Express.js 4.18, Prisma 5.7, Zod 3.22, jsonwebtoken, bcrypt, nodemailer
- Frontend: React 18, TypeScript, React Router, Axios
- Database: PostgreSQL >=14 (via Prisma ORM)

**Storage**: PostgreSQL (via Prisma ORM)  
**Testing**: Jest 29, Supertest (backend), React Testing Library (frontend)  
**Target Platform**: Web application (Node.js server + modern web browsers)  
**Project Type**: web (monorepo with frontend + backend)  
**Performance Goals**: 
- Contact creation and viewing: <10 seconds (SC-001)
- Deal stage transitions: <3 seconds per transition (SC-002)
- Activity logging: <5 seconds (SC-003)
- Property matching: <5 seconds for top 10 matches (SC-004)
- Contact filtering: <2 seconds for up to 10,000 contacts (SC-006)
- Dashboard KPIs: <3 seconds load time (SC-007)

**Constraints**: 
- Strict tenant data isolation (100% - zero cross-tenant access) (FR-002, SC-005)
- Immutable activity history (FR-020)
- Unique email enforcement within tenant (FR-001a)
- RBAC permission checks on all CRM operations (FR-026, SC-009)
- Concurrent access support without data corruption (SC-010)

**Scale/Scope**: 
- Support tenant organizations with up to 10,000 contacts
- Multiple deals per contact
- Multiple activities per contact/deal
- Property matching across tenant's property portfolio
- Audit logging for all create/update/delete operations (FR-030)

**Research Completed**: All technical unknowns resolved in `research.md`:
- ✅ Property Data Access: Reference Property model (to be created), basic fields for matching
- ✅ Matching Algorithm: Scoring weights confirmed (30/25/25/20), detailed rules defined
- ✅ Contact Merge: Manual merge with duplicate detection suggestions
- ✅ Activity Immutability: Correction activities, no updates/deletes
- ✅ Optimistic Locking: Version field on Deal model, 409 Conflict handling

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Pre-Research Status**: ✅ PASSED  
**Post-Design Status**: ✅ PASSED

**Note**: Constitution file (`.specify/memory/constitution.md`) not found. Proceeding with standard best practices based on existing codebase patterns:
- Test-first development (Jest + Supertest for backend, React Testing Library for frontend)
- Type safety (TypeScript strict mode)
- Separation of concerns (services contain business logic, controllers minimal, middleware for cross-cutting concerns)
- Security best practices (RBAC, tenant isolation, audit logging, input validation with Zod)
- Database migrations via Prisma
- RESTful API design with tenant-scoped routes

**Gates**:
- ✅ Type safety: TypeScript strict mode
- ✅ Testing: Jest + Supertest configured
- ✅ Database: Prisma ORM with PostgreSQL
- ✅ Security: RBAC middleware exists, tenant isolation patterns established
- ✅ Validation: Zod schemas for request validation
- ⚠️ Property Model: Property/listing data model needs verification (to be resolved in research)

## Project Structure

### Documentation (this feature)

```text
specs/004-crm-module/
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
│   │   ├── crm-controller.ts         # CRM routes (contacts, deals, activities, appointments)
│   │   └── crm-matching-controller.ts # Property matching routes
│   ├── services/
│   │   ├── crm-contact-service.ts    # Contact CRUD, filtering, conversion
│   │   ├── crm-deal-service.ts       # Deal pipeline, stage management
│   │   ├── crm-activity-service.ts   # Activity logging, timeline
│   │   ├── crm-appointment-service.ts # Appointment scheduling, status management
│   │   ├── crm-matching-service.ts   # Property matching algorithm (V1)
│   │   └── crm-tag-service.ts        # Tag management
│   ├── middleware/
│   │   ├── crm-rbac-middleware.ts    # CRM permission checks
│   │   └── tenant-isolation-middleware.ts # Enhanced tenant data isolation
│   ├── routes/
│   │   └── crm-routes.ts             # Tenant-scoped CRM routes (/tenants/:id/crm/*)
│   └── types/
│       └── crm-types.ts              # CRM TypeScript types
├── prisma/
│   ├── schema.prisma                  # Extended with CRM entities
│   └── migrations/                    # New migration for CRM tables
└── __tests__/
    ├── integration/
    │   └── crm.integration.test.ts    # CRM integration tests
    └── unit/
        └── crm-matching.test.ts       # Property matching algorithm tests

apps/web/
├── src/
│   ├── pages/
│   │   ├── crm/
│   │   │   ├── Dashboard.tsx          # CRM dashboard with KPIs
│   │   │   ├── Contacts.tsx           # Contact list and detail
│   │   │   ├── Deals.tsx              # Deal pipeline (Kanban + list)
│   │   │   ├── Activities.tsx         # Activity timeline
│   │   │   └── Appointments.tsx       # Appointment calendar
│   ├── components/
│   │   ├── crm/
│   │   │   ├── ContactForm.tsx        # Contact create/edit form
│   │   │   ├── DealKanban.tsx         # Kanban board for deals
│   │   │   ├── ActivityTimeline.tsx   # Activity history display
│   │   │   ├── PropertyMatching.tsx   # Property matching interface
│   │   │   └── AppointmentCalendar.tsx # Appointment calendar view
│   ├── services/
│   │   └── crm-service.ts             # CRM API client
│   └── types/
│       └── crm-types.ts               # Frontend CRM types
```

**Structure Decision**: Using existing monorepo structure (packages/api for backend, apps/web for frontend). CRM module extends existing multi-tenant RBAC infrastructure. All CRM routes are tenant-scoped (/tenants/:tenantId/crm/*). Services follow existing patterns (business logic in services, minimal controllers).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | N/A | N/A |
