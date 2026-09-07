# Implementation Plan: Owner Portal Module

**Branch**: `009-owner-portal` | **Date**: 2025-01-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-owner-portal/spec.md`

## Summary

This implementation plan establishes a comprehensive Owner Portal Module for the ImmoTopia real estate platform. The system enables property owners to access a self-service web portal where they can view their property portfolio, track rental income and revenue analytics, monitor active leases and tenant payments, view security deposits, track maintenance requests, access rental documents, and generate revenue and occupancy reports. The module enforces strict owner access control (only users with PROPRIETAIRE role in TenantClient can access), implements property ownership validation (owners can only access their own properties), and provides comprehensive dashboard and analytics views of their rental business.

**Technical Approach**: Extend existing Node.js + TypeScript backend (Express.js) with Prisma ORM for PostgreSQL, implementing new middleware for owner portal access validation, new service layer for owner portal operations with complex revenue analytics and aggregation, and new API endpoints under `/api/portal/owner/*`. Frontend React application will include owner portal layout with navigation, dashboard page with KPIs and charts, properties page with filtering, leases page, revenues page with analytics, payments page, maintenance page, documents page, and reports page. All UI text must be in French per Constitution.

## Technical Context

**Language/Version**: TypeScript 5.3 (strict mode), Node.js >=18.x (LTS)  
**Primary Dependencies**: 
- Backend: Express.js 4.18, Prisma 5.7, Zod 3.22, jsonwebtoken, date-fns (date calculations), pdf-lib or pdfkit (report generation), exceljs (Excel export), csv-writer (CSV export)
- Frontend: React 18, TypeScript, React Router v6, Tailwind CSS, Axios, Lucide React (icons), Recharts (charts and graphs)
- Database: PostgreSQL >=14 (via Prisma ORM)

**Storage**: PostgreSQL (via Prisma ORM) for data, local filesystem for generated reports (`reports/owner/<ownerId>/<reportId>.pdf`)  
**Testing**: Jest 29, Supertest (backend), React Testing Library (frontend)  
**Target Platform**: Web application (Node.js server + modern web browsers)  
**Project Type**: web (monorepo with frontend + backend)  
**Performance Goals**: 
- Dashboard load: <3 seconds (SC-001)
- Property list view: <2 seconds per property (SC-002)
- Revenue analytics view: <2 seconds (SC-003)
- Report generation: <10 seconds (SC-004)
- Payment history filtering: <2 seconds (SC-005)
- Support up to 100 properties per owner without degradation (SC-006)
- Document download success rate: 100% (SC-007)
- Data accuracy: 100% match with system data (SC-008)
- Primary task completion rate: 95% on first attempt (SC-009)
- Security enforcement: 100% prevention of unauthorized property access (SC-010)
- Maintenance ticket view: <2 seconds (SC-011)
- Revenue charts render correctly for all time periods (SC-012)

**Constraints**: 
- Strict owner access control: only users with PROPRIETAIRE role in TenantClient can access portal (FR-001)
- Property owners can only access properties they own (FR-002)
- Property ownership determined by: Property.ownerUserId matching TenantClient.userId OR RentalLease.ownerClient matching TenantClient.id
- All revenue calculations must be accurate and reflect actual payment data
- Revenue analytics must support filtering by date range, property, and grouping (month/year/property)
- Report generation must support PDF, CSV, and Excel formats (FR-026)
- All UI text in French (Constitution Principle I)
- Multi-tenant data isolation enforced at all layers
- Pagination required for owners with large property portfolios (FR-030)
- Efficient data loading and caching for dashboard aggregations

**Scale/Scope**: 
- Support property owners with up to 100 properties
- Dashboard aggregating data across all owner's properties (portfolio summary, revenue metrics, occupancy rate, upcoming payments, recent activity)
- Property portfolio management with filtering and detailed property views
- Lease management across multiple properties
- Revenue analytics with multiple breakdown views (by property, by month, by date range)
- Payment and installment tracking across all properties
- Security deposit monitoring across all leases
- Maintenance ticket tracking across all properties
- Document access for all rental documents
- Report generation (revenue reports, occupancy reports) with export functionality

**Research Completed**: All technical unknowns resolved:
- ✅ Owner Portal Access Middleware: Verify JWT auth, check TenantClient link, verify PROPRIETAIRE role, find owned properties (via Property.ownerUserId or RentalLease.ownerClient)
- ✅ Property Ownership Resolution: Properties owned by owner through Property.ownerUserId = TenantClient.userId OR through RentalLease.ownerClient = TenantClient.id
- ✅ Revenue Analytics: Aggregate payments by date range, property, month with efficient queries using Prisma aggregations
- ✅ Dashboard Aggregation: Calculate portfolio metrics, revenue summaries, occupancy rates, upcoming installments, recent activity across all properties
- ✅ Report Generation: Use pdf-lib/pdfkit for PDF, exceljs for Excel, csv-writer for CSV exports
- ✅ Chart Library: Use Recharts for revenue trend visualization (line charts, bar charts)

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
- ✅ Rental Management Module: Complete rental lease, installment, payment, deposit data available
- ✅ Maintenance Module: Maintenance ticket system functional for ticket viewing and status tracking
- ✅ Document Generation Module: Rental documents (contracts, receipts, quittances) generated and stored
- ✅ Property Module: Property data with ownership information available
- ✅ Chart Library: Recharts available for frontend visualization
- ✅ Report Generation Libraries: pdf-lib/pdfkit, exceljs, csv-writer available for report exports

## Project Structure

### Documentation (this feature)

```text
specs/009-owner-portal/
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
│   │   └── owner-portal-controller.ts    # Owner portal API endpoints (dashboard, properties, leases, revenues, payments, maintenance, documents, reports)
│   ├── services/
│   │   └── owner-portal-service.ts       # Owner portal business logic (dashboard aggregation, revenue analytics, property ownership resolution, report generation)
│   ├── middleware/
│   │   └── owner-portal-access.ts         # Middleware to verify owner has PROPRIETAIRE role and grant portal access
│   ├── routes/
│   │   └── owner-portal-routes.ts         # Owner portal routes (/api/portal/owner/*)
│   ├── types/
│   │   └── owner-portal-types.ts          # Owner portal TypeScript types and Zod schemas
│   ├── utils/
│   │   ├── owner-portal-validators.ts     # Request validation for filters, date ranges, report parameters
│   │   └── report-generator.ts            # Report generation utilities (PDF, CSV, Excel)
│   └── prisma/
│       └── schema.prisma                  # No new models needed (uses existing Property, RentalLease, RentalPayment, etc.)

apps/web/
├── src/
│   ├── pages/
│   │   └── OwnerPortal/
│   │       ├── Layout.tsx                 # Portal layout with sidebar navigation
│   │       ├── Dashboard.tsx              # Dashboard page (portfolio summary, revenue KPIs, occupancy rate, upcoming payments, recent activity, revenue chart)
│   │       ├── Properties.tsx              # Properties page (property list with filters, property cards)
│   │       ├── PropertyDetails.tsx         # Property details page (property info, current lease, lease history, revenue stats, maintenance history)
│   │       ├── Leases.tsx                 # Leases page (active leases list with filters, lease cards)
│   │       ├── LeaseDetails.tsx           # Lease details page (lease info, renters, installments, payments, balance, deposit)
│   │       ├── Revenues.tsx               # Revenues page (revenue summary cards, revenue by month chart, revenue by property chart, property revenue table)
│   │       ├── Payments.tsx               # Payments page (payment history table with filters, payment details modal)
│   │       ├── Maintenance.tsx            # Maintenance page (maintenance tickets list with filters, ticket details)
│   │       ├── Documents.tsx             # Documents page (documents grouped by type, download functionality)
│   │       └── Reports.tsx                # Reports page (report generation interface, download generated reports)
│   ├── components/
│   │   └── OwnerPortal/
│   │       ├── StatCard.tsx               # Reusable stat card component (KPI cards)
│   │       ├── PropertyCard.tsx           # Property card component
│   │       ├── RevenueChart.tsx           # Revenue chart component (line chart, bar chart)
│   │       ├── PaymentDetailsModal.tsx    # Modal for viewing payment details
│   │       └── ReportGenerator.tsx        # Report generation component
│   ├── services/
│   │   └── ownerPortalService.ts          # API service for owner portal endpoints
│   └── App.tsx                            # Updated with owner portal routes
```

**Structure Decision**: This feature extends the existing monorepo structure with new backend services, controllers, routes, and middleware following the established Service-Controller-Route pattern. Frontend adds new pages under `OwnerPortal/` directory with shared layout component. The structure follows existing patterns from tenant portal, rental management, and maintenance modules. Report generation utilities are added to backend utils for PDF, CSV, and Excel export functionality.

## Complexity Tracking

> **No Constitution violations - all gates passed**

---

## Phase Completion Status

### Phase 0: Outline & Research ✅ COMPLETE

- ✅ Research document created: `research.md`
- ✅ Technical decisions documented
- ✅ All NEEDS CLARIFICATION markers resolved
- ✅ Technology choices aligned with existing patterns

### Phase 1: Design & Contracts ✅ COMPLETE

- ✅ Data model documented: `data-model.md`
- ✅ API contracts created: `contracts/openapi.yaml`
- ✅ Quick start guide created: `quickstart.md`
- ✅ Agent context updated: `.cursor/rules/specify-rules.mdc`

### Phase 2: Task Breakdown ⏳ PENDING

- ⏳ Task breakdown will be created by `/speckit.tasks` command
- ⏳ Implementation tasks will be generated from this plan

---

**Generated Artifacts**:
- `specs/009-owner-portal/research.md` - Technology decisions and rationale
- `specs/009-owner-portal/data-model.md` - Data model usage and relationships
- `specs/009-owner-portal/contracts/openapi.yaml` - Complete API contract
- `specs/009-owner-portal/quickstart.md` - Developer quick start guide

### Phase 2: Task Breakdown ⏳ PENDING

- ⏳ Task breakdown will be created by `/speckit.tasks` command
- ⏳ Implementation tasks will be generated from this plan

---

## Next Steps

1. **Update Agent Context**: Run agent context update script
2. **Review generated artifacts**: Review all Phase 0 and Phase 1 outputs
3. **Run task breakdown**: Execute `/speckit.tasks` to generate implementation tasks
4. **Begin implementation**: Follow tasks in order, starting with backend middleware and service layer
