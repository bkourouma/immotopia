# Implementation Plan: Properties & Listings Module

**Branch**: `005-properties-module` | **Date**: 2025-01-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-properties-module/spec.md`

## Summary

This implementation plan establishes a comprehensive Properties & Listings module for the ImmoTopia real estate platform. The system serves as the single source of truth for all real estate assets, supporting multiple property types with type-specific templates, tenant-owned and public properties, property management mandates, CRM integration, visit scheduling, quality scoring, and workflow management. The module enforces strict tenant data isolation, implements role-based access control, maintains complete audit trails, and supports both professional agencies and private property owners.

**Technical Approach**: Extend existing Node.js + TypeScript backend (Express.js) with Prisma ORM for PostgreSQL, implementing new entities for properties, property type templates, property media, property documents, property status history, property visits, management mandates, property containers, and property quality scores. Add property services for CRUD operations, type-specific template validation, ownership management, publication control, search and filtering, property matching (weighted scoring algorithm), quality scoring, duplicate detection, and document expiration management. Implement RBAC permissions for property operations, tenant-scoped data access, and audit logging. Frontend React application will include property management interface, type-specific creation forms, media/document management, search and filtering, public portal, property matching interface, and quality score dashboard.

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
- Property creation and viewing: <15 seconds (SC-001)
- Property publication: <5 seconds (SC-002)
- Property search with filters: <3 seconds for up to 10,000 properties (SC-003)
- Property matching: <5 seconds for top 20 matches (SC-004)
- Photo upload: <10 seconds per photo (SC-006)
- Quality score calculation: <2 seconds (SC-007)
- Visit scheduling: <5 seconds (SC-008)
- Public portal search: <3 seconds (SC-009)
- Status transitions: <2 seconds (SC-010)
- Duplicate detection: <5 seconds (SC-011)
- Container aggregation: <3 seconds (SC-012)
- Document validation: <1 second (SC-013)

**Constraints**: 
- Strict tenant data isolation for tenant-owned properties (100% - zero cross-tenant access) (FR-025, SC-005)
- Unique internal reference format: PROP-{YYYYMMDD}-{tenantId/ownerId prefix}-{sequential} (Clarification Q2)
- Property matching algorithm: weighted scoring (budget 30%, location 25%, size/rooms 20%, features 15%, price coherence 10%) (Clarification Q3)
- Document expiration: 30-day warning, 7-day grace period, then auto-unpublish (Clarification Q4)
- Management mandate scope: full management rights except ownership transfer/deletion (Clarification Q5)
- RBAC permission checks on all property operations (FR-027, SC-014)
- Concurrent access support without data corruption (SC-015)
- Immutable property status history (FR-009)

**Scale/Scope**: 
- Support tenant organizations with up to 10,000 properties (SC-003)
- Multiple property types (12+ types: Appartement, Maison/Villa, Studio, etc.) (FR-001)
- Multiple media items per property (photos, videos, 360° tours) (FR-014, FR-015)
- Multiple documents per property (title deeds, mandates, plans, tax documents) (FR-016)
- Property matching across tenant's property portfolio (FR-018)
- Container properties with child lots (FR-022, FR-023)
- Audit logging for all create/update/delete operations (FR-009)
- Public properties visible to all users (FR-026)

**Research Completed**: All technical unknowns resolved in `research.md`:
- ✅ Property Type Template Structure: JSON-based template configuration with field definitions, validation rules, and section organization
- ✅ Unique Reference Generation: Format PROP-{YYYYMMDD}-{prefix}-{sequential} with collision detection and retry logic
- ✅ Property Matching Algorithm: Weighted scoring implementation with exact/approximate match differentiation
- ✅ Document Expiration Management: Scheduled job for expiration checks, notification system, and auto-unpublish workflow
- ✅ Media Storage: Integration with existing file storage infrastructure, support for photos, videos, and 360° tours
- ✅ Geolocation Services: Address geocoding and reverse geocoding integration patterns
- ✅ Quality Score Calculation: Formula based on required fields completion, media presence, geolocation accuracy
- ✅ Duplicate Detection: Algorithm based on address similarity, geolocation proximity, surface area, and owner matching

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
- ✅ CRM Integration: CRM module exists and accessible for property matching
- ✅ File Storage: Existing storage infrastructure for media and documents
- ⚠️ Public Registration: Separate public registration flow for private owners (to be implemented)
- ⚠️ Geolocation Services: Address geocoding service integration (to be researched)

## Project Structure

### Documentation (this feature)

```text
specs/005-properties-module/
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
│   │   ├── property-controller.ts         # Property CRUD routes
│   │   ├── property-search-controller.ts # Search and filtering routes
│   │   ├── property-public-controller.ts  # Public portal routes (unauthenticated)
│   │   └── property-matching-controller.ts # Property matching routes
│   ├── services/
│   │   ├── property-service.ts            # Property CRUD, ownership management
│   │   ├── property-template-service.ts   # Type-specific template management
│   │   ├── property-media-service.ts      # Media upload and management
│   │   ├── property-document-service.ts   # Document upload, validation, expiration
│   │   ├── property-search-service.ts     # Search and filtering logic
│   │   ├── property-matching-service.ts   # Property matching algorithm (weighted scoring)
│   │   ├── property-quality-service.ts    # Quality score calculation
│   │   ├── property-duplicate-service.ts  # Duplicate detection
│   │   ├── property-mandate-service.ts    # Management mandate management
│   │   └── property-container-service.ts # Container properties and child lots
│   ├── middleware/
│   │   ├── property-rbac-middleware.ts    # Property permission checks
│   │   └── property-ownership-middleware.ts # Ownership and mandate validation
│   ├── routes/
│   │   ├── property-routes.ts             # Tenant-scoped property routes (/tenants/:id/properties/*)
│   │   └── property-public-routes.ts     # Public portal routes (/public/properties/*)
│   ├── types/
│   │   └── property-types.ts              # Property TypeScript types
│   └── utils/
│       ├── property-reference-generator.ts # Unique reference generation
│       └── geolocation-utils.ts           # Geolocation helpers
│   ├── prisma/
│   │   ├── schema.prisma                  # Extended with Property entities
│   │   └── migrations/                    # New migration for Property tables
│   └── __tests__/
│       ├── integration/
│       │   ├── property.integration.test.ts    # Property integration tests
│       │   └── property-matching.integration.test.ts # Matching algorithm tests
│       └── unit/
│           ├── property-matching.test.ts       # Matching algorithm unit tests
│           ├── property-quality.test.ts        # Quality score calculation tests
│           └── property-duplicate.test.ts      # Duplicate detection tests

apps/web/
├── src/
│   ├── pages/
│   │   ├── properties/
│   │   │   ├── Properties.tsx              # Property list and management
│   │   │   ├── PropertyCreate.tsx          # Property creation (type selection)
│   │   │   ├── PropertyEdit.tsx            # Property editing (type-specific form)
│   │   │   ├── PropertyDetail.tsx          # Property detail view
│   │   │   ├── PropertySearch.tsx          # Search and filtering interface
│   │   │   └── PropertyPublic.tsx          # Public portal property listing
│   ├── components/
│   │   ├── properties/
│   │   │   ├── PropertyForm.tsx            # Base property form
│   │   │   ├── PropertyTypeSelector.tsx    # Property type selection
│   │   │   ├── PropertyMediaUpload.tsx     # Media upload and management
│   │   │   ├── PropertyDocumentUpload.tsx  # Document upload and management
│   │   │   ├── PropertyStatusWorkflow.tsx  # Status workflow management
│   │   │   ├── PropertySearchFilters.tsx   # Search filter interface
│   │   │   ├── PropertyMatching.tsx        # Property matching interface
│   │   │   ├── PropertyQualityScore.tsx    # Quality score display and suggestions
│   │   │   ├── PropertyDuplicateAlert.tsx  # Duplicate detection alerts
│   │   │   └── PropertyContainerView.tsx   # Container property aggregated view
│   ├── services/
│   │   └── property-service.ts             # Property API client
│   └── types/
│       └── property-types.ts               # Frontend Property types
```

**Structure Decision**: Using existing monorepo structure (packages/api for backend, apps/web for frontend). Properties module extends existing multi-tenant RBAC infrastructure. Property routes are tenant-scoped for tenant-owned properties (/tenants/:tenantId/properties/*) and public-scoped for public portal (/public/properties/*). Services follow existing patterns (business logic in services, minimal controllers).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | No violations | All gates passed |

## Phase 0: Outline & Research

**Status**: ✅ COMPLETE

See `research.md` for detailed research findings on:
- Property type template structure and configuration
- Unique reference generation algorithm
- Property matching weighted scoring implementation
- Document expiration management workflow
- Media storage integration patterns
- Geolocation service integration
- Quality score calculation formula
- Duplicate detection algorithm

## Phase 1: Design & Contracts

**Status**: ✅ COMPLETE

See:
- `data-model.md` - Database schema extensions for Property entities
- `contracts/openapi.yaml` - API contract definitions
- `quickstart.md` - Quick start guide for developers

## Phase 2: Task Breakdown

**Status**: ⏳ PENDING (Created by `/speckit.tasks` command)

Tasks will be generated from the implementation plan and broken down into actionable development items.





