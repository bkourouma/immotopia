# Implementation Plan: Maintenance & Rental Incidents Module

**Branch**: `007-maintenance-incidents` | **Date**: 2025-01-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-maintenance-incidents/spec.md`

## Summary

This implementation plan establishes a comprehensive Maintenance & Rental Incidents Module for the ImmoTopia real estate platform. The system enables tenants to report maintenance issues and incidents affecting their rental properties, property managers to track and manage tickets, assign vendors to tickets, and maintain complete maintenance history per property. The module enforces strict tenant data isolation, implements role-based access control for tenant vs. property manager access, and maintains comprehensive status history tracking.

**Technical Approach**: Extend existing Node.js + TypeScript backend (Express.js) with Prisma ORM for PostgreSQL, implementing new entities for maintenance tickets, ticket attachments, ticket comments, status history, and vendors. Add maintenance services for ticket creation, status workflow management, file upload handling, vendor management, and email notifications. Frontend React application will include tenant ticket reporting interface, property manager ticket management dashboard, vendor CRUD interface, and maintenance history tab in property detail pages. All UI text must be in French per Constitution.

## Technical Context

**Language/Version**: TypeScript 5.3 (strict mode), Node.js >=18.x (LTS)  
**Primary Dependencies**: 
- Backend: Express.js 4.18, Prisma 5.7, Zod 3.22, Multer (file uploads), Nodemailer (email notifications), jsonwebtoken, bcrypt
- Frontend: React 18, TypeScript, React Router v6, Tailwind CSS, Radix UI, Axios
- Database: PostgreSQL >=14 (via Prisma ORM)

**Storage**: PostgreSQL (via Prisma ORM) for data, local filesystem (`uploads/maintenance/<tenantId>/<ticketId>/`) for ticket attachments  
**Testing**: Jest 29, Supertest (backend), React Testing Library (frontend)  
**Target Platform**: Web application (Node.js server + modern web browsers)  
**Project Type**: web (monorepo with frontend + backend)  
**Performance Goals**: 
- Ticket creation: <2 minutes (SC-001)
- Ticket list view with filters: <1 second (SC-002)
- Ticket status update and vendor assignment: <30 seconds (SC-003)
- Ticket detail view: <1 second (SC-004)
- Support 500 active tickets per tenant (SC-005)
- 95% status update accuracy (SC-006)
- Email notification delivery: <1 minute (SC-007)
- Property maintenance history view: <2 seconds (SC-008)
- Vendor creation and assignment: <1 minute (SC-010)
- File upload success rate: 98% (SC-011)
- Tenant ticket list with filters: <1 second (SC-012)

**Constraints**: 
- Strict tenant data isolation (100% - zero cross-tenant access) (FR-021, SC-009)
- File upload limits: 10 files per ticket, 5MB per file (FR-004, FR-005)
- File types: images (JPEG, PNG, WebP) and PDFs only (FR-005)
- Status workflow: DECLARED → IN_PROGRESS → ASSIGNED → RESOLVED (FR-003, FR-026)
- Vendor assignment required before ASSIGNED status (FR-011)
- Tenant can only create tickets for properties with active lease (FR-002)
- All UI text in French (Constitution Principle I)
- Secure file access: only authorized users can view/download attachments (FR-028)

**Scale/Scope**: 
- Support tenant organizations with up to 500 active tickets
- Multiple attachments per ticket (up to 10 files)
- Multiple comments per ticket (unlimited)
- Complete status history tracking per ticket
- Vendor management per tenant organization
- Email notifications for status changes
- Maintenance history per property

**Research Completed**: All technical unknowns resolved:
- ✅ File Upload Implementation: Multer with memory storage, save to `uploads/maintenance/<tenantId>/<ticketId>/` directory structure
- ✅ File Size Limits: 5MB per file, 10 files per ticket maximum
- ✅ File Type Validation: Images (JPEG, PNG, WebP) and PDFs only
- ✅ Email Notification Service: Nodemailer integration for status change notifications
- ✅ Status Workflow Validation: State machine pattern for status transitions
- ✅ Tenant Access Validation: Verify active lease exists for property before ticket creation

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
- ✅ Security: RBAC middleware exists, tenant isolation patterns established
- ✅ Validation: Zod schemas for request validation
- ✅ File Upload: Multer configured and used in existing modules (properties, documents)
- ✅ Email Service: Nodemailer configured and used for notifications
- ✅ File Storage: Local filesystem storage pattern established (`uploads/` directory structure)

## Project Structure

### Documentation (this feature)

```text
specs/007-maintenance-incidents/
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
│   │   ├── maintenance-ticket-controller.ts    # Ticket CRUD, status updates, comments
│   │   ├── maintenance-vendor-controller.ts    # Vendor CRUD operations
│   │   └── maintenance-attachment-controller.ts # File upload/download endpoints
│   ├── services/
│   │   ├── maintenance-ticket-service.ts       # Ticket creation, status workflow, validation
│   │   ├── maintenance-vendor-service.ts      # Vendor CRUD, active/inactive management
│   │   ├── maintenance-attachment-service.ts  # File upload, storage, access control
│   │   ├── maintenance-comment-service.ts     # Comment thread management
│   │   └── maintenance-notification-service.ts # Email notifications for status changes
│   ├── middleware/
│   │   ├── maintenance-rbac-middleware.ts     # Maintenance permission checks (tenant vs. manager)
│   │   └── tenant-isolation-middleware.ts     # Enhanced tenant data isolation (existing)
│   ├── routes/
│   │   └── maintenance-routes.ts             # Tenant-scoped maintenance routes (/api/tenants/:tenantId/maintenance/*)
│   ├── types/
│   │   └── maintenance-types.ts              # Maintenance TypeScript types and Zod schemas
│   └── utils/
│       └── maintenance-validators.ts          # Status workflow validation, file validation
│   ├── prisma/
│   │   ├── schema.prisma                     # Extended with maintenance entities
│   │   └── migrations/                       # New migration for maintenance tables
│   └── __tests__/
│       ├── integration/
│       │   ├── maintenance-ticket.integration.test.ts # Ticket workflow integration tests
│       │   └── maintenance-vendor.integration.test.ts # Vendor management integration tests
│       └── unit/
│           ├── status-workflow.test.ts        # Status transition validation tests
│           ├── file-upload.test.ts            # File upload validation tests
│           └── tenant-access.test.ts         # Tenant access validation tests

apps/web/
├── src/
│   ├── pages/
│   │   ├── tenant/
│   │   │   └── maintenance/
│   │   │       ├── TicketList.tsx            # Tenant ticket list with filters
│   │   │       ├── TicketDetail.tsx           # Ticket detail with timeline, comments, attachments
│   │   │       └── CreateTicket.tsx           # Ticket creation form with file upload
│   │   └── admin/
│   │       └── maintenance/
│   │           ├── Tickets.tsx                # Manager ticket list with filters
│   │           ├── TicketDetail.tsx            # Manager ticket detail with status controls
│   │           └── Vendors.tsx                # Vendor CRUD interface
│   ├── components/
│   │   ├── maintenance/
│   │   │   ├── TicketCard.tsx                 # Ticket card component
│   │   │   ├── TicketStatusBadge.tsx          # Status badge with colors
│   │   │   ├── TicketTimeline.tsx             # Status history timeline
│   │   │   ├── CommentThread.tsx              # Comment thread component
│   │   │   ├── FileUploader.tsx               # Drag & drop file uploader
│   │   │   ├── AttachmentList.tsx             # Attachment list with preview
│   │   │   └── VendorSelect.tsx               # Vendor selection dropdown
│   │   └── properties/
│   │       └── PropertyMaintenanceTab.tsx     # Maintenance history tab for property detail
│   ├── services/
│   │   └── maintenance-service.ts             # Axios service for maintenance API calls
│   └── types/
│       └── maintenance-types.ts               # Frontend TypeScript types
```

**Structure Decision**: Following existing monorepo structure with `packages/api` for backend and `apps/web` for frontend. Maintenance routes follow tenant-scoped pattern `/api/tenants/:tenantId/maintenance/*` similar to rental and CRM modules. File storage uses existing `uploads/` directory structure with tenant and ticket-specific subdirectories.

## Complexity Tracking

> **No violations identified - all gates passed**
