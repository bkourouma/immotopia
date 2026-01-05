# Implementation Plan: Multi-Tenant SaaS Architecture with RBAC

**Branch**: `003-multi-tenant-rbac` | **Date**: 2025-01-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-multi-tenant-rbac/spec.md`

---

## Summary

This implementation plan establishes a comprehensive multi-tenant SaaS architecture with hierarchical role-based access control (RBAC) for the ImmoTopia platform. The system enables Platform Admins to manage tenant organizations, activate modules per tenant, manage subscriptions and billing, while Tenant Admins can invite and manage collaborators with granular permissions. The architecture enforces strict tenant data isolation, module-based feature gating, and comprehensive audit logging.

**Technical Approach**: Extend existing Node.js + TypeScript backend (Express.js) with Prisma ORM for PostgreSQL, implementing new entities for tenants, memberships, roles, permissions, subscriptions, invoices, and audit logs. Add RBAC middleware for permission and module checks, invitation system with email integration, and session management for tenant suspension. Frontend React application will include admin dashboards for tenant and user management.

---

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
- Permission checks: <50ms for 95% of requests (SC-003)
- Tenant statistics: <3 seconds load time (SC-010)
- Search/filter operations: <2 seconds for up to 500 collaborators (SC-008)
- Support 1000+ concurrent tenant organizations (SC-005)

**Constraints**: 
- Strict tenant data isolation (100% - zero cross-tenant access) (SC-002)
- Immediate session termination on tenant suspension (FR-003)
- Immediate module access revocation on disable (FR-006)
- Read-only access when subscription expired/canceled (FR-019)
- Permission checks on every request (FR-014)

**Scale/Scope**: 
- 1000+ concurrent tenant organizations
- Multiple users per tenant (collaborators)
- Multiple roles per user with combined permissions
- Multiple modules per tenant (AGENCY, SYNDIC, PROMOTER)
- Comprehensive audit logging for all admin actions

**Unknowns**:
- **Session Invalidation Strategy**: [NEEDS CLARIFICATION: Best approach for immediate session invalidation on tenant suspension? Redis-based session store vs JWT blacklist vs database token revocation?]
- **Permission Caching Strategy**: [NEEDS CLARIFICATION: How to cache user permissions for <50ms checks while maintaining real-time updates when roles change? Redis cache with TTL vs in-memory cache?]
- **Module Gating Implementation**: [NEEDS CLARIFICATION: Best pattern for module-based feature gating in Express middleware? Route-level decorators vs middleware chain vs route groups?]
- **Audit Log Performance**: [NEEDS CLARIFICATION: How to handle high-volume audit logging without impacting request performance? Async queue vs direct DB write vs external service?]

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Note**: Constitution file (`.specify/memory/constitution.md`) appears to be a template. No specific constitution gates identified. Proceeding with standard best practices:
- Test-first development (Jest + Supertest)
- Type safety (TypeScript strict mode)
- Separation of concerns (services, controllers, middleware)
- Security best practices (RBAC, tenant isolation, audit logging)

## Project Structure

### Documentation (this feature)

```text
specs/003-multi-tenant-rbac/
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
│   │   ├── tenant-controller.ts      # Platform admin tenant management
│   │   ├── collaborator-controller.ts # Tenant admin user management
│   │   ├── subscription-controller.ts # Subscription & billing management
│   │   └── audit-controller.ts       # Audit log queries
│   ├── services/
│   │   ├── tenant-service.ts         # Tenant CRUD, module management
│   │   ├── collaborator-service.ts   # User invitation, role management
│   │   ├── subscription-service.ts   # Subscription lifecycle, billing
│   │   ├── permission-service.ts     # RBAC permission checks
│   │   ├── module-service.ts         # Module activation/deactivation
│   │   └── audit-service.ts          # Audit log creation
│   ├── middleware/
│   │   ├── rbac-middleware.ts        # Permission & module checks
│   │   ├── tenant-context.ts         # Tenant context resolution
│   │   └── session-invalidation.ts   # Session management
│   ├── routes/
│   │   ├── admin-routes.ts           # Platform admin routes (/admin/*)
│   │   ├── tenant-routes.ts          # Tenant-scoped routes (/tenants/:id/*)
│   │   └── invitation-routes.ts      # Invitation acceptance (/auth/invitations/*)
│   └── types/
│       ├── tenant-types.ts           # Tenant, module, subscription types
│       ├── rbac-types.ts             # Role, permission types
│       └── audit-types.ts            # Audit log types
├── prisma/
│   ├── schema.prisma                  # Extended with new entities
│   └── migrations/                   # Database migrations
└── __tests__/
    ├── integration/
    │   ├── tenant-isolation.test.ts  # Cross-tenant access prevention
    │   ├── rbac-enforcement.test.ts  # Permission checks
    │   └── module-gating.test.ts     # Module access control
    └── unit/
        ├── permission-service.test.ts
        └── tenant-service.test.ts

apps/web/
├── src/
│   ├── pages/
│   │   ├── admin/
│   │   │   ├── TenantsList.tsx       # Platform admin tenant list
│   │   │   ├── TenantDetail.tsx      # Tenant configuration
│   │   │   └── TenantStats.tsx       # Tenant statistics
│   │   └── tenant/
│   │       ├── CollaboratorsList.tsx # Tenant admin user list
│   │       ├── InviteCollaborator.tsx # Invitation form
│   │       └── CollaboratorDetail.tsx # User management
│   ├── components/
│   │   ├── admin/
│   │   │   ├── TenantCard.tsx
│   │   │   ├── ModuleToggle.tsx
│   │   │   ├── SubscriptionCard.tsx
│   │   │   └── InvoiceList.tsx
│   │   └── tenant/
│   │       ├── CollaboratorCard.tsx
│   │       ├── RoleSelector.tsx
│   │       └── InvitationStatus.tsx
│   ├── services/
│   │   ├── tenant-service.ts         # Tenant API client
│   │   ├── collaborator-service.ts   # Collaborator API client
│   │   └── subscription-service.ts   # Subscription API client
│   └── context/
│       └── TenantContext.tsx         # Active tenant context
└── public/
```

**Structure Decision**: Monorepo with separated Frontend (React in `apps/web`) and Backend (Express API in `packages/api`). Extends existing structure with new controllers, services, middleware, and UI components for multi-tenant RBAC functionality.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | N/A | N/A |
