# Tasks: Maintenance & Rental Incidents Module

**Input**: Design documents from `/specs/007-maintenance-incidents/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are OPTIONAL - not explicitly requested in specification, so test tasks are not included. Focus on implementation tasks.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Backend**: `packages/api/src/`
- **Frontend**: `apps/web/src/`
- **Database**: `packages/api/prisma/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Create maintenance module directory structure in packages/api/src/ (controllers, services, middleware, routes, types, utils)
- [X] T002 Create maintenance module directory structure in apps/web/src/ (pages, components, services, types)
- [X] T003 [P] Review existing Multer configuration in packages/api/src/middleware/upload-middleware.ts for file upload patterns
- [X] T004 [P] Review existing Nodemailer configuration in packages/api/src/utils/email-utils.ts for notification patterns
- [X] T005 [P] Review existing tenant-scoped route patterns in packages/api/src/routes/rental-routes.ts for route structure

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T006 Add maintenance enums to Prisma schema in packages/api/prisma/schema.prisma (MaintenanceTicketCategory, MaintenanceTicketPriority, MaintenanceTicketStatus, MaintenanceTicketCommentAuthorType)
- [X] T007 Add MaintenanceTicket model to Prisma schema in packages/api/prisma/schema.prisma with all fields, relationships, and indexes
- [X] T008 Add MaintenanceTicketAttachment model to Prisma schema in packages/api/prisma/schema.prisma with all fields, relationships, and indexes
- [X] T009 Add MaintenanceTicketComment model to Prisma schema in packages/api/prisma/schema.prisma with all fields, relationships, and indexes
- [X] T010 Add MaintenanceTicketStatusHistory model to Prisma schema in packages/api/prisma/schema.prisma with all fields, relationships, and indexes
- [X] T011 Add MaintenanceVendor model to Prisma schema in packages/api/prisma/schema.prisma with all fields, relationships, and indexes
- [X] T012 Run Prisma migration: cd packages/api && npm run prisma:migrate -- --name add_maintenance_module
- [X] T013 Generate Prisma client: cd packages/api && npm run prisma:generate
- [X] T014 Create maintenance TypeScript types file in packages/api/src/types/maintenance-types.ts with Zod schemas (createTicketSchema, updateTicketSchema, createCommentSchema, createVendorSchema, updateVendorSchema)
- [X] T015 Create maintenance RBAC middleware in packages/api/src/middleware/maintenance-rbac-middleware.ts with requireMaintenanceTenantPermission and requireMaintenanceAdminPermission functions
- [X] T016 Create status workflow validator in packages/api/src/utils/maintenance-validators.ts with validateStatusTransition function implementing state machine pattern
- [X] T017 Create file upload validator in packages/api/src/utils/maintenance-validators.ts with validateFileUpload function (file type, size, count limits)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Tenant Incident Reporting (Priority: P1) 🎯 MVP

**Goal**: Enable tenants to report maintenance issues with details, photos, and comments, and track ticket status through resolution.

**Independent Test**: Can be fully tested by allowing tenants to create incident tickets with categories (plumbing, electricity, air conditioning, other), descriptions, priorities, photos, and comments. Tenants can view their ticket list, filter by status, and see ticket details with timeline. This delivers the value of structured incident communication and tenant self-service.

### Implementation for User Story 1

- [X] T018 [US1] Implement maintenance-ticket-service.ts in packages/api/src/services/maintenance-ticket-service.ts with createTicket function (validates active lease, creates ticket with DECLARED status)
- [X] T019 [US1] Implement maintenance-ticket-service.ts in packages/api/src/services/maintenance-ticket-service.ts with getTenantTickets function (filters by tenant contact/lease, supports status/property filters)
- [X] T020 [US1] Implement maintenance-ticket-service.ts in packages/api/src/services/maintenance-ticket-service.ts with getTicketById function (includes attachments, comments, status history)
- [X] T021 [US1] Implement maintenance-ticket-service.ts in packages/api/src/services/maintenance-ticket-service.ts with cancelTicket function (validates status, updates to CANCELED, records canceled_at)
- [X] T022 [US1] Implement maintenance-attachment-service.ts in packages/api/src/services/maintenance-attachment-service.ts with uploadAttachment function (validates file type/size/count, saves to uploads/maintenance/<tenantId>/<ticketId>/, creates DB record)
- [X] T023 [US1] Implement maintenance-attachment-service.ts in packages/api/src/services/maintenance-attachment-service.ts with getAttachmentById function (validates tenant access, returns file metadata)
- [X] T024 [US1] Implement maintenance-attachment-service.ts in packages/api/src/services/maintenance-attachment-service.ts with downloadAttachment function (validates permissions, streams file from filesystem)
- [X] T025 [US1] Implement maintenance-comment-service.ts in packages/api/src/services/maintenance-comment-service.ts with addComment function (creates comment with TENANT author type, links to ticket)
- [X] T026 [US1] Implement maintenance-comment-service.ts in packages/api/src/services/maintenance-comment-service.ts with getTicketComments function (returns all comments for ticket, ordered by created_at)
- [X] T027 [US1] Implement maintenance-ticket-controller.ts in packages/api/src/controllers/maintenance-ticket-controller.ts with createTicketHandler (validates request, calls service, returns ticket)
- [X] T028 [US1] Implement maintenance-ticket-controller.ts in packages/api/src/controllers/maintenance-ticket-controller.ts with listTenantTicketsHandler (handles pagination, filters, returns ticket list)
- [X] T029 [US1] Implement maintenance-ticket-controller.ts in packages/api/src/controllers/maintenance-ticket-controller.ts with getTenantTicketHandler (returns ticket with full details)
- [X] T030 [US1] Implement maintenance-ticket-controller.ts in packages/api/src/controllers/maintenance-ticket-controller.ts with cancelTicketHandler (validates tenant ownership, calls cancel service)
- [X] T031 [US1] Implement maintenance-attachment-controller.ts in packages/api/src/controllers/maintenance-attachment-controller.ts with uploadAttachmentHandler (handles multipart/form-data, validates, calls service)
- [X] T032 [US1] Implement maintenance-attachment-controller.ts in packages/api/src/controllers/maintenance-attachment-controller.ts with downloadAttachmentHandler (validates permissions, streams file)
- [X] T033 [US1] Implement maintenance-ticket-controller.ts in packages/api/src/controllers/maintenance-ticket-controller.ts with addCommentHandler (validates request, creates comment)
- [X] T034 [US1] Create maintenance-routes.ts in packages/api/src/routes/maintenance-routes.ts with tenant router setup (authenticate, requireTenantAccess, enforceTenantIsolation middleware)
- [X] T035 [US1] Add tenant ticket routes to maintenance-routes.ts: GET /tenant/tickets, POST /tenant/tickets, GET /tenant/tickets/:ticketId, PATCH /tenant/tickets/:ticketId
- [X] T036 [US1] Add tenant comment route to maintenance-routes.ts: POST /tenant/tickets/:ticketId/comments
- [X] T037 [US1] Add tenant attachment route to maintenance-routes.ts: POST /tenant/tickets/:ticketId/attachments
- [X] T038 [US1] Register maintenance routes in packages/api/src/index.ts: app.use('/api/tenants/:tenantId/maintenance', maintenanceRoutes)
- [X] T039 [US1] Create maintenance-service.ts in apps/web/src/services/maintenance-service.ts with tenantMaintenanceService object (listTickets, createTicket, getTicket, cancelTicket, addComment, uploadAttachment functions)
- [X] T040 [US1] Create maintenance types in apps/web/src/types/maintenance-types.ts with Ticket, TicketDetail, CreateTicketRequest, Comment, Attachment interfaces
- [X] T041 [US1] Create TicketList.tsx in apps/web/src/pages/tenant/maintenance/TicketList.tsx with ticket list view, status filters, property filters, pagination (all UI text in French)
- [X] T042 [US1] Create TicketDetail.tsx in apps/web/src/pages/tenant/maintenance/TicketDetail.tsx with ticket details, status badge, timeline, comments thread, attachments list (all UI text in French)
- [X] T043 [US1] Create CreateTicket.tsx in apps/web/src/pages/tenant/maintenance/CreateTicket.tsx with ticket creation form (category, priority, title, description, locationDetails, propertyId selection) (all UI text in French)
- [X] T044 [US1] Create TicketCard.tsx in apps/web/src/components/maintenance/TicketCard.tsx with ticket card component displaying title, category, priority, status, dates (all UI text in French)
- [X] T045 [US1] Create TicketStatusBadge.tsx in apps/web/src/components/maintenance/TicketStatusBadge.tsx with status badge component (colors: DECLARED gray, IN_PROGRESS blue, ASSIGNED orange, RESOLVED green, CANCELED red) (all UI text in French)
- [X] T046 [US1] Create TicketTimeline.tsx in apps/web/src/components/maintenance/TicketTimeline.tsx with vertical timeline component displaying status history (all UI text in French)
- [X] T047 [US1] Create CommentThread.tsx in apps/web/src/components/maintenance/CommentThread.tsx with comment thread component (align comments by authorType, display author info) (all UI text in French)
- [X] T048 [US1] Create FileUploader.tsx in apps/web/src/components/maintenance/FileUploader.tsx with drag & drop file uploader component (supports multiple files, preview, validation) (all UI text in French)
- [X] T049 [US1] Create AttachmentList.tsx in apps/web/src/components/maintenance/AttachmentList.tsx with attachment list component (displays file names, sizes, download links, image previews) (all UI text in French)
- [X] T050 [US1] Add maintenance routes to React Router in apps/web/src/App.tsx or router config: /tenant/maintenance, /tenant/maintenance/new, /tenant/maintenance/:ticketId (all route labels in French)

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently. Tenants can create tickets, upload files, add comments, view ticket list and details.

---

## Phase 4: User Story 2 - Property Manager Ticket Management (Priority: P1)

**Goal**: Enable property managers to view, filter, and manage all maintenance tickets, update status through workflow, assign vendors, and add resolution notes.

**Independent Test**: Can be fully tested by allowing property managers to view all tickets, filter by property/status/priority/vendor, update ticket status through workflow states, assign vendors, add resolution notes, and view ticket history. This delivers the value of centralized maintenance coordination and tracking.

### Implementation for User Story 2

- [X] T051 [US2] Implement maintenance-ticket-service.ts in packages/api/src/services/maintenance-ticket-service.ts with getAllTickets function (supports property, status, priority, vendor, date range filters, pagination)
- [X] T052 [US2] Implement maintenance-ticket-service.ts in packages/api/src/services/maintenance-ticket-service.ts with updateTicketStatus function (validates status transition, updates status and timestamps, creates status history entry)
- [X] T053 [US2] Implement maintenance-ticket-service.ts in packages/api/src/services/maintenance-ticket-service.ts with assignVendor function (validates vendor is active, updates assigned_vendor_id, transitions to ASSIGNED status)
- [X] T054 [US2] Implement maintenance-ticket-service.ts in packages/api/src/services/maintenance-ticket-service.ts with updateTicket function (updates priority, resolution notes, vendor assignment)
- [X] T055 [US2] Implement maintenance-ticket-service.ts in packages/api/src/services/maintenance-ticket-service.ts with getStatusHistory function (returns all status history entries for ticket, ordered by changed_at)
- [X] T056 [US2] Implement maintenance-comment-service.ts in packages/api/src/services/maintenance-comment-service.ts with addManagerComment function (creates comment with MANAGER author type)
- [X] T057 [US2] Implement maintenance-notification-service.ts in packages/api/src/services/maintenance-notification-service.ts with sendTicketCreatedNotification function (sends email to property managers when ticket created)
- [X] T058 [US2] Implement maintenance-notification-service.ts in packages/api/src/services/maintenance-notification-service.ts with sendStatusChangeNotification function (sends email to tenant when status changes, async/non-blocking)
- [X] T059 [US2] Implement maintenance-ticket-controller.ts in packages/api/src/controllers/maintenance-ticket-controller.ts with listAllTicketsHandler (handles all filters, pagination, returns ticket list for managers)
- [X] T060 [US2] Implement maintenance-ticket-controller.ts in packages/api/src/controllers/maintenance-ticket-controller.ts with getTicketHandler (returns full ticket details for managers)
- [X] T061 [US2] Implement maintenance-ticket-controller.ts in packages/api/src/controllers/maintenance-ticket-controller.ts with updateTicketHandler (validates request, updates ticket, triggers notifications)
- [X] T062 [US2] Implement maintenance-ticket-controller.ts in packages/api/src/controllers/maintenance-ticket-controller.ts with addManagerCommentHandler (creates manager comment)
- [X] T063 [US2] Create manager router in maintenance-routes.ts with admin router setup (authenticate, requireTenantAccess, enforceTenantIsolation, requireMaintenanceAdminPermission middleware)
- [X] T064 [US2] Add manager ticket routes to maintenance-routes.ts: GET /admin/tickets, GET /admin/tickets/:ticketId, PATCH /admin/tickets/:ticketId
- [X] T065 [US2] Add manager comment route to maintenance-routes.ts: POST /admin/tickets/:ticketId/comments
- [X] T066 [US2] Add file download route to maintenance-routes.ts: GET /files/:attachmentId (shared route, validates permissions)
- [X] T067 [US2] Create managerMaintenanceService in maintenance-service.ts in apps/web/src/services/maintenance-service.ts with listTickets, getTicket, updateTicket, addComment functions
- [X] T068 [US2] Create Tickets.tsx in apps/web/src/pages/admin/maintenance/Tickets.tsx with manager ticket list view (table with filters: property, status, priority, vendor, date range, pagination) (all UI text in French)
- [X] T069 [US2] Create TicketDetail.tsx in apps/web/src/pages/admin/maintenance/TicketDetail.tsx with manager ticket detail view (status controls, vendor assignment dropdown, resolution notes, timeline, comments, attachments) (all UI text in French)
- [X] T070 [US2] Create VendorSelect.tsx in apps/web/src/components/maintenance/VendorSelect.tsx with vendor selection dropdown component (filters active vendors, displays name and specialties) (all UI text in French)
- [X] T071 [US2] Update TicketTimeline.tsx in apps/web/src/components/maintenance/TicketTimeline.tsx to support manager view (shows who changed status, optional notes) (all UI text in French)
- [X] T072 [US2] Add manager maintenance routes to React Router: /admin/maintenance/tickets, /admin/maintenance/tickets/:ticketId (all route labels in French)
- [X] T073 [US2] Integrate status workflow validation in updateTicketStatus function (enforces DECLARED → IN_PROGRESS → ASSIGNED → RESOLVED transitions, validates vendor assignment for ASSIGNED)
- [X] T074 [US2] Integrate email notifications in ticket service (call notification service after status changes, handle failures gracefully without blocking updates)

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently. Property managers can view all tickets, update status, assign vendors, add comments, and tenants receive notifications.

---

## Phase 5: User Story 3 - Maintenance History by Property (Priority: P2)

**Goal**: Enable property managers to view complete maintenance history for each property to understand recurring issues and make informed decisions.

**Independent Test**: Can be fully tested by viewing a property's detail page, accessing the maintenance history tab, and seeing all tickets linked to that property sorted by date, with status, category, priority, assigned vendor, and resolution details. This delivers the value of comprehensive property maintenance tracking and historical analysis.

### Implementation for User Story 3

- [X] T075 [US3] Implement maintenance-ticket-service.ts in packages/api/src/services/maintenance-ticket-service.ts with getPropertyMaintenanceHistory function (filters tickets by propertyId, supports status/category filters, ordered by created_at desc)
- [X] T076 [US3] Add property maintenance history route to maintenance-routes.ts: GET /properties/:propertyId/maintenance (in admin router, validates property belongs to tenant)
- [X] T077 [US3] Implement maintenance-ticket-controller.ts in packages/api/src/controllers/maintenance-ticket-controller.ts with getPropertyMaintenanceHistoryHandler (returns ticket list for property)
- [X] T078 [US3] Create propertyMaintenanceService in maintenance-service.ts in apps/web/src/services/maintenance-service.ts with getHistory function
- [X] T079 [US3] Create PropertyMaintenanceTab.tsx in apps/web/src/components/properties/PropertyMaintenanceTab.tsx with maintenance history tab component (displays ticket list with filters, empty state message) (all UI text in French)
- [X] T080 [US3] Integrate PropertyMaintenanceTab into existing property detail page (add "Maintenance" tab to property detail tabs, display maintenance history) (all UI text in French)

**Checkpoint**: At this point, User Stories 1, 2, AND 3 should all work independently. Property managers can view maintenance history per property.

---

## Phase 6: User Story 4 - Vendor Management (Priority: P2)

**Goal**: Enable property managers to manage a directory of maintenance vendors that can be assigned to tickets.

**Independent Test**: Can be fully tested by allowing property managers to create vendors with name, contact information (phone, email, address), specialties (e.g., plumbing, electrical), and active status. Property managers can view vendor list, update vendor information, deactivate vendors, and assign vendors to tickets. This delivers the value of organized vendor directory and streamlined ticket assignment.

### Implementation for User Story 4

- [X] T081 [US4] Implement maintenance-vendor-service.ts in packages/api/src/services/maintenance-vendor-service.ts with createVendor function (validates name, creates vendor with isActive=true)
- [X] T082 [US4] Implement maintenance-vendor-service.ts in packages/api/src/services/maintenance-vendor-service.ts with listVendors function (supports isActive filter, search by name/specialty)
- [X] T083 [US4] Implement maintenance-vendor-service.ts in packages/api/src/services/maintenance-vendor-service.ts with getVendorById function (returns vendor details)
- [X] T084 [US4] Implement maintenance-vendor-service.ts in packages/api/src/services/maintenance-vendor-service.ts with updateVendor function (updates vendor information)
- [X] T085 [US4] Implement maintenance-vendor-service.ts in packages/api/src/services/maintenance-vendor-service.ts with deactivateVendor function (sets isActive=false, soft delete)
- [X] T086 [US4] Implement maintenance-vendor-service.ts in packages/api/src/services/maintenance-vendor-service.ts with getActiveVendors function (returns only active vendors for assignment)
- [X] T087 [US4] Implement maintenance-vendor-controller.ts in packages/api/src/controllers/maintenance-vendor-controller.ts with createVendorHandler (validates request, creates vendor)
- [X] T088 [US4] Implement maintenance-vendor-controller.ts in packages/api/src/controllers/maintenance-vendor-controller.ts with listVendorsHandler (handles filters, returns vendor list)
- [X] T089 [US4] Implement maintenance-vendor-controller.ts in packages/api/src/controllers/maintenance-vendor-controller.ts with getVendorHandler (returns vendor details)
- [X] T090 [US4] Implement maintenance-vendor-controller.ts in packages/api/src/controllers/maintenance-vendor-controller.ts with updateVendorHandler (validates request, updates vendor)
- [X] T091 [US4] Implement maintenance-vendor-controller.ts in packages/api/src/controllers/maintenance-vendor-controller.ts with deactivateVendorHandler (soft deletes vendor)
- [X] T092 [US4] Add vendor routes to maintenance-routes.ts in admin router: GET /admin/vendors, POST /admin/vendors, GET /admin/vendors/:vendorId, PATCH /admin/vendors/:vendorId, DELETE /admin/vendors/:vendorId
- [X] T093 [US4] Create vendorService in maintenance-service.ts in apps/web/src/services/maintenance-service.ts with listVendors, createVendor, updateVendor, deactivateVendor functions
- [X] T094 [US4] Create Vendors.tsx in apps/web/src/pages/admin/maintenance/Vendors.tsx with vendor CRUD interface (list view with search/filter, create form, edit form, deactivate action) (all UI text in French)
- [X] T095 [US4] Add vendor management route to React Router: /admin/maintenance/vendors (all route labels in French)
- [X] T096 [US4] Update VendorSelect.tsx in apps/web/src/components/maintenance/VendorSelect.tsx to fetch and display vendors from API (filters active vendors only)
- [X] T097 [US4] Integrate vendor validation in assignVendor function (prevents assignment of inactive vendors, displays warning)

**Checkpoint**: At this point, all user stories should be independently functional. Property managers can manage vendors and assign them to tickets.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T098 [P] Create seed script in packages/api/prisma/seeds/maintenance-seed.ts with sample vendor, ticket, comment, and attachment data (using real/anonymized data only per Constitution)
- [X] T099 [P] Add error handling and validation messages in all controllers (consistent error response format, French error messages for user-facing errors)
- [X] T100 [P] Add logging for maintenance operations in all services (log ticket creation, status changes, vendor assignments for audit)
- [X] T101 [P] Implement pagination helper in maintenance services (consistent pagination across all list endpoints)
- [X] T102 [P] Add file cleanup utility in maintenance-attachment-service.ts (cleanup orphaned files when tickets deleted)
- [X] T103 [P] Add email notification templates in packages/api/src/utils/email-templates.ts (ticket created, status changed templates in French)
- [X] T104 [P] Update OVERVIEW_MODULES.md with maintenance module documentation (add maintenance module section with features and endpoints)
- [ ] T105 [P] Verify all UI text is in French (review all React components, error messages, labels, tooltips)
- [ ] T106 [P] Run quickstart.md validation (test all API endpoints, verify file uploads, test status workflow, verify notifications)
- [ ] T107 [P] Performance optimization: Add database query optimization (ensure indexes are used, optimize N+1 queries with Prisma include)
- [ ] T108 [P] Security hardening: Verify tenant isolation in all queries (all services include tenantId filter, middleware validates access)
- [ ] T109 [P] Security hardening: Verify file access security (download endpoint validates ticket permissions, prevents path traversal)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - User stories can proceed sequentially in priority order (US1 → US2 → US3 → US4)
  - US1 and US2 can potentially run in parallel after foundational (both P1)
  - US3 and US4 can run in parallel after US1 and US2 (both P2)
- **Polish (Phase 7)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - Uses same models as US1 but independently testable
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - Uses ticket model from US1/US2 but independently testable
- **User Story 4 (P2)**: Can start after Foundational (Phase 2) - Independent vendor model, integrates with US2 for assignment

### Within Each User Story

- Models before services (models created in Foundational phase)
- Services before controllers
- Controllers before routes
- Backend before frontend (can be parallelized)
- Core implementation before integration

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes:
  - US1 backend and US2 backend can run in parallel (different services/controllers)
  - US1 frontend and US2 frontend can run in parallel (different pages/components)
  - US3 and US4 can run in parallel (different features)
- All tasks marked [P] within a user story can run in parallel
- Backend and frontend for same story can run in parallel (different developers)

---

## Parallel Example: User Story 1

```bash
# Launch all backend services for User Story 1 together:
Task: "Implement maintenance-ticket-service.ts with createTicket function"
Task: "Implement maintenance-attachment-service.ts with uploadAttachment function"
Task: "Implement maintenance-comment-service.ts with addComment function"

# Launch all frontend components for User Story 1 together:
Task: "Create TicketCard.tsx component"
Task: "Create TicketStatusBadge.tsx component"
Task: "Create FileUploader.tsx component"
Task: "Create AttachmentList.tsx component"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
   - Tenant can create ticket
   - Tenant can upload attachments
   - Tenant can add comments
   - Tenant can view ticket list and details
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Add User Story 4 → Test independently → Deploy/Demo
6. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 backend
   - Developer B: User Story 1 frontend (parallel with A)
   - Developer C: User Story 2 backend (parallel with A/B)
3. After US1 complete:
   - Developer A: User Story 2 frontend
   - Developer B: User Story 3 (parallel with A)
   - Developer C: User Story 4 (parallel with A/B)
4. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- All UI text must be in French (Constitution Principle I)
- All seed data must use real or anonymized data (Constitution Principle II)
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
- File paths are absolute from repository root
- Follow existing codebase patterns (see rental-routes.ts, property-media-service.ts for reference)

---

## Task Summary

- **Total Tasks**: 109
- **Phase 1 (Setup)**: 5 tasks
- **Phase 2 (Foundational)**: 12 tasks
- **Phase 3 (User Story 1)**: 33 tasks
- **Phase 4 (User Story 2)**: 24 tasks
- **Phase 5 (User Story 3)**: 6 tasks
- **Phase 6 (User Story 4)**: 17 tasks
- **Phase 7 (Polish)**: 12 tasks

**Suggested MVP Scope**: Phases 1, 2, and 3 (User Story 1) = 50 tasks total
