# Tasks: CRM & Client Relationship Management

**Input**: Design documents from `/specs/004-crm-module/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Backend**: `packages/api/src/`
- **Frontend**: `apps/web/src/`
- **Database**: `packages/api/prisma/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Create TypeScript type definitions in packages/api/src/types/crm-types.ts with Contact, Deal, Activity, Appointment, PropertyMatch, Tag, Note types
- [x] T002 [P] Create frontend TypeScript types in apps/web/src/types/crm-types.ts matching backend types
- [x] T003 [P] Create CRM permissions seed script in packages/api/prisma/seeds/crm-permissions-seed.ts with all 15 CRM permissions (CRM_CONTACTS_VIEW, CRM_CONTACTS_CREATE, etc.)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Database Schema & Migrations

- [x] T004 Add CrmContactStatus enum (LEAD, ACTIVE_CLIENT, ARCHIVED) to packages/api/prisma/schema.prisma
- [x] T005 [P] Add CrmContactRoleType enum (PROPRIETAIRE, LOCATAIRE, COPROPRIETAIRE, ACQUEREUR) to packages/api/prisma/schema.prisma
- [x] T006 [P] Add CrmDealType enum (ACHAT, LOCATION) to packages/api/prisma/schema.prisma
- [x] T007 [P] Add CrmDealStage enum (NEW, QUALIFIED, APPOINTMENT, VISIT, NEGOTIATION, WON, LOST) to packages/api/prisma/schema.prisma
- [x] T008 [P] Add CrmActivityType enum (CALL, EMAIL, SMS, WHATSAPP, VISIT, MEETING, NOTE, TASK, CORRECTION) to packages/api/prisma/schema.prisma
- [x] T009 [P] Add CrmActivityDirection enum (IN, OUT, INTERNAL) to packages/api/prisma/schema.prisma
- [x] T010 [P] Add CrmAppointmentType enum (RDV, VISITE) to packages/api/prisma/schema.prisma
- [x] T011 [P] Add CrmAppointmentStatus enum (SCHEDULED, CONFIRMED, DONE, NO_SHOW, CANCELED) to packages/api/prisma/schema.prisma
- [x] T012 [P] Add CrmDealPropertyStatus enum (SHORTLISTED, PROPOSED, VISITED, REJECTED, SELECTED) to packages/api/prisma/schema.prisma
- [x] T013 [P] Add CrmEntityType enum (CONTACT, DEAL, PROPERTY) to packages/api/prisma/schema.prisma
- [x] T014 Create CrmContact model in packages/api/prisma/schema.prisma with all fields, relationships, and indexes per data-model.md
- [x] T015 [P] Create CrmContactRole model in packages/api/prisma/schema.prisma with all fields and relationships
- [x] T016 [P] Create CrmDeal model in packages/api/prisma/schema.prisma with all fields including version field for optimistic locking
- [x] T017 [P] Create CrmActivity model in packages/api/prisma/schema.prisma with all fields and correction relationship
- [x] T018 [P] Create CrmAppointment model in packages/api/prisma/schema.prisma with all fields and relationships
- [x] T019 [P] Create CrmDealProperty model in packages/api/prisma/schema.prisma with all fields and relationships
- [x] T020 [P] Create CrmTag model in packages/api/prisma/schema.prisma with tenant-scoped uniqueness
- [x] T021 [P] Create CrmContactTag model in packages/api/prisma/schema.prisma for many-to-many relationship
- [x] T022 [P] Create CrmNote model in packages/api/prisma/schema.prisma with entity type and ID fields
- [x] T023 Add Tenant relation to all CRM models in packages/api/prisma/schema.prisma (crmContacts, crmDeals, etc.)
- [x] T024 Add User relation to CRM models in packages/api/prisma/schema.prisma (assignedTo, createdBy, etc.)
- [x] T025 Create database migration in packages/api/prisma/migrations/ with name add_crm_module
- [ ] T026 Run database migration and verify all tables created correctly

### RBAC & Middleware Infrastructure

- [x] T027 Create crm-rbac-middleware.ts in packages/api/src/middleware/crm-rbac-middleware.ts with requireCrmPermission() function
- [x] T028 [P] Enhance tenant-isolation-middleware.ts in packages/api/src/middleware/tenant-isolation-middleware.ts to enforce tenantId on all CRM queries
- [x] T029 [P] Update audit-service.ts in packages/api/src/services/audit-service.ts to support CRM entity types (CONTACT, DEAL, ACTIVITY)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Contact and Lead Management (Priority: P1) 🎯 MVP

**Goal**: Real estate agents can centralize and manage their prospects and clients within their tenant organization

**Independent Test**: Create a contact, view contact list, filter by status/source/assigned agent, update contact information, verify tenant isolation

### Database & Models

- [ ] T030 [US1] Verify CrmContact model supports all required fields (firstName, lastName, email required; phone optional) in packages/api/prisma/schema.prisma
- [ ] T031 [US1] Verify unique constraint on tenantId + email in CrmContact model in packages/api/prisma/schema.prisma

### Backend Services

- [x] T032 [US1] Implement crm-contact-service.ts in packages/api/src/services/crm-contact-service.ts with createContact() function enforcing email uniqueness within tenant
- [x] T033 [US1] Implement crm-contact-service.ts in packages/api/src/services/crm-contact-service.ts with getContactById() function with tenant isolation check
- [x] T034 [US1] Implement crm-contact-service.ts in packages/api/src/services/crm-contact-service.ts with listContacts() function with filtering (status, source, assignedTo, tag, search) and pagination
- [x] T035 [US1] Implement crm-contact-service.ts in packages/api/src/services/crm-contact-service.ts with updateContact() function with tenant isolation and email uniqueness validation
- [x] T036 [US1] Implement crm-contact-service.ts in packages/api/src/services/crm-contact-service.ts with updateLastInteractionAt() function called when activities are created
- [x] T037 [US1] Implement crm-tag-service.ts in packages/api/src/services/crm-tag-service.ts with createTag(), assignTagToContact(), and removeTagFromContact() functions
- [x] T038 [US1] Implement crm-tag-service.ts in packages/api/src/services/crm-tag-service.ts with getContactTags() function

### Backend Controllers & Routes

- [x] T039 [US1] Create crm-controller.ts in packages/api/src/controllers/crm-controller.ts with createContact() handler
- [x] T040 [US1] Create crm-controller.ts in packages/api/src/controllers/crm-controller.ts with getContact() handler returning contact with roles, deals, activities
- [x] T041 [US1] Create crm-controller.ts in packages/api/src/controllers/crm-controller.ts with listContacts() handler with query parameter filtering
- [x] T042 [US1] Create crm-controller.ts in packages/api/src/controllers/crm-controller.ts with updateContact() handler
- [x] T043 [US1] Create Zod validation schemas in packages/api/src/types/crm-types.ts for CreateContactRequest and UpdateContactRequest
- [x] T044 [US1] Create crm-routes.ts in packages/api/src/routes/crm-routes.ts with /tenants/:tenantId/crm/contacts routes (GET, POST, GET /:id, PATCH /:id)
- [x] T045 [US1] Register crm-routes.ts in main router in packages/api/src/index.ts with RBAC middleware checks

### Audit Logging

- [x] T046 [US1] Add audit logging in crm-contact-service.ts for createContact() operation
- [x] T047 [US1] Add audit logging in crm-contact-service.ts for updateContact() operation with changed fields tracking

### Frontend Services

- [ ] T048 [US1] Create crm-service.ts in apps/web/src/services/crm-service.ts with createContact(), getContact(), listContacts(), updateContact() API client functions
- [ ] T049 [US1] Create crm-service.ts in apps/web/src/services/crm-service.ts with getContactTags(), assignTag(), removeTag() functions

### Frontend Components

- [ ] T050 [US1] Create ContactForm.tsx in apps/web/src/components/crm/ContactForm.tsx with form fields (firstName, lastName, email, phone, source, assignedTo) and inline validation error display
- [ ] T051 [US1] Create Contacts.tsx in apps/web/src/pages/crm/Contacts.tsx with contact list view, filtering controls (status, source, assignedTo, tag, search), and pagination
- [ ] T052 [US1] Create ContactDetail.tsx in apps/web/src/components/crm/ContactDetail.tsx showing contact info, roles, deals, activities, tags
- [ ] T053 [US1] Add routing for /crm/contacts in apps/web/src/App.tsx or router configuration

**Story Completion Checkpoint**: US1 complete when contacts can be created, listed, filtered, updated, and viewed with full tenant isolation

---

## Phase 4: User Story 2 - Pipeline Deal Management (Priority: P1) 🎯 MVP

**Goal**: Real estate agents can organize deals through a sales pipeline, tracking from initial contact to closing

**Independent Test**: Create a deal linked to contact, move deal through stages, filter deals by type/stage/assigned agent, update deal criteria and budget, mark as won/lost

### Backend Services

- [x] T054 [US2] Implement crm-deal-service.ts in packages/api/src/services/crm-deal-service.ts with createDeal() function with default NEW stage
- [x] T055 [US2] Implement crm-deal-service.ts in packages/api/src/services/crm-deal-service.ts with getDealById() function with tenant isolation
- [x] T056 [US2] Implement crm-deal-service.ts in packages/api/src/services/crm-deal-service.ts with listDeals() function with filtering (type, stage, assignedTo, contactId) and pagination
- [x] T057 [US2] Implement crm-deal-service.ts in packages/api/src/services/crm-deal-service.ts with updateDeal() function with optimistic locking (version check, increment on update)
- [x] T058 [US2] Implement crm-deal-service.ts in packages/api/src/services/crm-deal-service.ts with updateDealStage() function that logs stage transitions in audit trail
- [x] T059 [US2] Implement crm-deal-service.ts in packages/api/src/services/crm-deal-service.ts with closeDeal() function that sets closedAt and closedReason when stage is WON or LOST

### Backend Controllers & Routes

- [x] T060 [US2] Create crm-controller.ts handlers in packages/api/src/controllers/crm-controller.ts with createDeal(), getDeal(), listDeals(), updateDeal() functions
- [x] T061 [US2] Create Zod validation schemas in packages/api/src/types/crm-types.ts for CreateDealRequest and UpdateDealRequest including version field
- [x] T062 [US2] Add /tenants/:tenantId/crm/deals routes (GET, POST, GET /:id, PATCH /:id) to crm-routes.ts in packages/api/src/routes/crm-routes.ts
- [x] T063 [US2] Implement 409 Conflict response in crm-controller.ts when version mismatch detected in updateDeal()

### Audit Logging

- [x] T064 [US2] Add audit logging in crm-deal-service.ts for createDeal(), updateDeal(), and updateDealStage() operations with changed fields

### Frontend Services

- [ ] T065 [US2] Create crm-service.ts functions in apps/web/src/services/crm-service.ts with createDeal(), getDeal(), listDeals(), updateDeal() API client functions

### Frontend Components

- [ ] T066 [US2] Create DealForm.tsx in apps/web/src/components/crm/DealForm.tsx with fields (type, contactId, budgetMin, budgetMax, locationZone, criteriaJson, assignedTo)
- [ ] T067 [US2] Create Deals.tsx in apps/web/src/pages/crm/Deals.tsx with list view and filtering controls
- [ ] T068 [US2] Create DealKanban.tsx in apps/web/src/components/crm/DealKanban.tsx with Kanban board organized by pipeline stage (NEW, QUALIFIED, APPOINTMENT, VISIT, NEGOTIATION, WON, LOST)
- [ ] T069 [US2] Create DealDetail.tsx in apps/web/src/components/crm/DealDetail.tsx showing deal info, activities, property matches, notes
- [ ] T070 [US2] Add routing for /crm/deals in apps/web/src/App.tsx or router configuration

**Story Completion Checkpoint**: US2 complete when deals can be created, moved through pipeline stages, filtered, updated with optimistic locking, and viewed in Kanban board

---

## Phase 5: User Story 3 - Activity Tracking and Interaction History (Priority: P1) 🎯 MVP

**Goal**: Agents can track all interactions with contacts and deals for complete history and follow-up

**Independent Test**: Create activities (calls, emails, notes) linked to contacts/deals, view activity timelines, filter by type/date, verify immutability

### Backend Services

- [ ] T071 [US3] Implement crm-activity-service.ts in packages/api/src/services/crm-activity-service.ts with createActivity() function (immutable - no update/delete methods)
- [ ] T072 [US3] Implement crm-activity-service.ts in packages/api/src/services/crm-activity-service.ts with listActivities() function with filtering (contactId, dealId, type) and pagination
- [ ] T073 [US3] Implement crm-activity-service.ts in packages/api/src/services/crm-activity-service.ts with getActivityTimeline() function returning activities in chronological order
- [ ] T074 [US3] Implement crm-activity-service.ts in packages/api/src/services/crm-activity-service.ts with createCorrectionActivity() function that links to original activity via correctionOfId
- [ ] T075 [US3] Update crm-contact-service.ts in packages/api/src/services/crm-contact-service.ts to call updateLastInteractionAt() when activity is created for contact

### Backend Controllers & Routes

- [ ] T076 [US3] Create crm-controller.ts handlers in packages/api/src/controllers/crm-controller.ts with createActivity() and listActivities() functions
- [ ] T077 [US3] Create Zod validation schemas in packages/api/src/types/crm-types.ts for CreateActivityRequest
- [ ] T078 [US3] Add /tenants/:tenantId/crm/activities routes (GET, POST) to crm-routes.ts in packages/api/src/routes/crm-routes.ts

### Audit Logging

- [ ] T079 [US3] Add audit logging in crm-activity-service.ts for createActivity() operation

### Frontend Services

- [ ] T080 [US3] Create crm-service.ts functions in apps/web/src/services/crm-service.ts with createActivity() and listActivities() API client functions

### Frontend Components

- [ ] T081 [US3] Create ActivityForm.tsx in apps/web/src/components/crm/ActivityForm.tsx with fields (activityType, direction, subject, content, outcome, occurredAt, nextActionAt, nextActionType)
- [ ] T082 [US3] Create ActivityTimeline.tsx in apps/web/src/components/crm/ActivityTimeline.tsx displaying activities in chronological order with type, date, outcome, creator, and correction indicators
- [ ] T083 [US3] Integrate ActivityTimeline component into ContactDetail.tsx and DealDetail.tsx in apps/web/src/components/crm/
- [ ] T084 [US3] Create Activities.tsx in apps/web/src/pages/crm/Activities.tsx with activity list view and filtering

**Story Completion Checkpoint**: US3 complete when activities can be created, viewed in timelines, filtered, and corrections can be added (no updates/deletes)

---

## Phase 6: User Story 4 - Appointment and Visit Management (Priority: P2)

**Goal**: Agents can schedule and manage appointments and property visits

**Independent Test**: Create appointments/visits, assign to agents, confirm/cancel, mark as done/no-show, view in calendar

### Backend Services

- [x] T0 [US4] Implement crm-appointment-service.ts in packages/api/src/services/crm-appointment-service.ts with createAppointment() function with default SCHEDULED status
- [x] T0 [US4] Implement crm-appointment-service.ts in packages/api/src/services/crm-appointment-service.ts with listAppointments() function with filtering (contactId, dealId, assignedTo, status, date range) and pagination
- [x] T0 [US4] Implement crm-appointment-service.ts in packages/api/src/services/crm-appointment-service.ts with updateAppointmentStatus() function for status transitions
- [x] T0 [US4] Implement crm-appointment-service.ts in packages/api/src/services/crm-appointment-service.ts with markAppointmentDone() function that automatically creates activity in timeline
- [x] T0 [US4] Implement crm-appointment-service.ts in packages/api/src/services/crm-appointment-service.ts with getUpcomingAppointments() function for dashboard

### Backend Controllers & Routes

- [x] T0 [US4] Create crm-controller.ts handlers in packages/api/src/controllers/crm-controller.ts with createAppointment(), listAppointments(), updateAppointment() functions
- [x] T0 [US4] Create Zod validation schemas in packages/api/src/types/crm-types.ts for CreateAppointmentRequest and UpdateAppointmentRequest
- [x] T0 [US4] Add /tenants/:tenantId/crm/appointments routes (GET, POST, PATCH /:id) to crm-routes.ts in packages/api/src/routes/crm-routes.ts

### Audit Logging

- [x] T0 [US4] Add audit logging in crm-appointment-service.ts for createAppointment() and updateAppointmentStatus() operations

### Frontend Services

- [ ] T094 [US4] Create crm-service.ts functions in apps/web/src/services/crm-service.ts with createAppointment(), listAppointments(), updateAppointment() API client functions

### Frontend Components

- [ ] T095 [US4] Create AppointmentForm.tsx in apps/web/src/components/crm/AppointmentForm.tsx with fields (appointmentType, contactId, dealId, startAt, endAt, location, assignedTo)
- [ ] T096 [US4] Create AppointmentCalendar.tsx in apps/web/src/components/crm/AppointmentCalendar.tsx with calendar view showing appointments by date
- [ ] T097 [US4] Create Appointments.tsx in apps/web/src/pages/crm/Appointments.tsx with appointment list and calendar views
- [ ] T098 [US4] Add routing for /crm/appointments in apps/web/src/App.tsx or router configuration

**Story Completion Checkpoint**: US4 complete when appointments can be created, scheduled, confirmed, marked done, and viewed in calendar

---

## Phase 7: User Story 5 - Property Matching for Deals (Priority: P2)

**Goal**: Agents can match properties from portfolio to deals based on criteria with ranked scores

**Independent Test**: Run matching on deal, view ranked property matches with scores, add to shortlist, update property status (proposed, visited, selected, rejected)

### Backend Services

- [x] T [US5] Create placeholder Property model in packages/api/prisma/schema.prisma with fields needed for matching (id, tenantId, price, location, rooms, surface, type, furnishingStatus, status) if not exists
- [x] T [US5] Implement crm-matching-service.ts in packages/api/src/services/crm-matching-service.ts with calculateMatchScore() function implementing scoring algorithm (Budget 0-30, Zone 0-25, Size 0-25, Extras 0-20)
- [x] T [US5] Implement crm-matching-service.ts in packages/api/src/services/crm-matching-service.ts with matchPropertiesForDeal() function that queries properties, scores them, filters by threshold (40 points), returns top 10
- [x] T [US5] Implement crm-matching-service.ts in packages/api/src/services/crm-matching-service.ts with getMatchExplanation() function returning JSON breakdown of scoring components
- [x] T [US5] Implement crm-matching-service.ts in packages/api/src/services/crm-matching-service.ts with addPropertyToShortlist() function creating CrmDealProperty record
- [x] T [US5] Implement crm-matching-service.ts in packages/api/src/services/crm-matching-service.ts with updatePropertyMatchStatus() function updating status (SHORTLISTED, PROPOSED, VISITED, REJECTED, SELECTED)
- [x] T [US5] Implement crm-matching-service.ts in packages/api/src/services/crm-matching-service.ts with getDealPropertyMatches() function returning shortlist for a deal

### Backend Controllers & Routes

- [x] T [US5] Create crm-matching-controller.ts in packages/api/src/controllers/crm-matching-controller.ts with matchProperties() handler
- [x] T [US5] Create crm-matching-controller.ts in packages/api/src/controllers/crm-matching-controller.ts with getMatches() and updatePropertyStatus() handlers
- [x] T [US5] Add /tenants/:tenantId/crm/deals/:dealId/match route (POST) to crm-routes.ts in packages/api/src/routes/crm-routes.ts
- [x] T [US5] Add /tenants/:tenantId/crm/deals/:dealId/matches route (GET) to crm-routes.ts in packages/api/src/routes/crm-routes.ts
- [x] T [US5] Add /tenants/:tenantId/crm/deals/:dealId/properties/:propertyId route (POST) to crm-routes.ts in packages/api/src/routes/crm-routes.ts

### Frontend Services

- [x] T [US5] Create crm-service.ts functions in apps/web/src/services/crm-service.ts with matchProperties(), getMatches(), updatePropertyStatus() API client functions

### Frontend Components

- [x] T [US5] Create PropertyMatching.tsx in apps/web/src/components/crm/PropertyMatching.tsx with ranked property list showing match scores and explanations
- [x] T [US5] Create PropertyMatchCard.tsx in apps/web/src/components/crm/PropertyMatchCard.tsx displaying property details, score breakdown, and action buttons
- [x] T [US5] Integrate PropertyMatching component into DealDetail.tsx in apps/web/src/components/crm/DealDetail.tsx
- [x] T [US5] Add property status update UI in PropertyMatching.tsx for changing status (SHORTLISTED, PROPOSED, VISITED, REJECTED, SELECTED)

**Story Completion Checkpoint**: US5 complete when property matching returns ranked results with scores, properties can be added to shortlist, and status can be updated

---

## Phase 8: User Story 6 - Lead to Client Conversion (Priority: P2)

**Goal**: Agents can convert prospects to active clients by assigning business roles while preserving history

**Independent Test**: Convert lead contact to client with role, verify status changes, confirm historical activities/deals preserved, verify contact appears in client lists

### Backend Services

- [x] T [US6] Implement crm-contact-service.ts function in packages/api/src/services/crm-contact-service.ts with convertLeadToClient() function that updates status to ACTIVE_CLIENT and creates CrmContactRole records
- [x] T [US6] Implement crm-contact-service.ts function in packages/api/src/services/crm-contact-service.ts with addContactRole() function for adding additional roles to existing client
- [x] T [US6] Implement crm-contact-service.ts function in packages/api/src/services/crm-contact-service.ts with getContactRoles() function returning all roles with active status and start/end dates

### Backend Controllers & Routes

- [x] T [US6] Create crm-controller.ts handler in packages/api/src/controllers/crm-controller.ts with convertContact() function
- [x] T [US6] Create Zod validation schemas in packages/api/src/types/crm-types.ts for ConvertContactRequest with roles array
- [x] T [US6] Add /tenants/:tenantId/crm/contacts/:contactId/convert route (POST) to crm-routes.ts in packages/api/src/routes/crm-routes.ts

### Audit Logging

- [x] T [US6] Add audit logging in crm-contact-service.ts for convertLeadToClient() operation with before/after state

### Frontend Services

- [x] T [US6] Create crm-service.ts function in apps/web/src/services/crm-service.ts with convertContact() API client function

### Frontend Components

- [x] T [US6] Create ConvertContactDialog.tsx in apps/web/src/components/crm/ConvertContactDialog.tsx with role selection (PROPRIETAIRE, LOCATAIRE, COPROPRIETAIRE, ACQUEREUR)
- [x] T [US6] Integrate ConvertContactDialog into ContactDetail.tsx in apps/web/src/components/crm/ContactDetail.tsx
- [x] T [US6] Update ContactDetail.tsx in apps/web/src/components/crm/ContactDetail.tsx to display contact roles with active/inactive status and historical role changes

**Story Completion Checkpoint**: US6 complete when leads can be converted to clients with roles, history is preserved, and roles can be viewed with lifecycle

---

## Phase 9: User Story 7 - CRM Dashboard and KPIs (Priority: P3)

**Goal**: Agents and managers can view KPIs and next best actions on dashboard

**Independent Test**: View dashboard, verify KPI counts are accurate, check next actions reflect actual due tasks/appointments, confirm data scoped to current tenant

### Backend Services

- [x] T [US7] Implement crm-dashboard-service.ts in packages/api/src/services/crm-dashboard-service.ts with getDashboardKPIs() function calculating new leads (last 7 days), hot leads, upcoming appointments (next 7 days), deals in negotiation
- [x] T [US7] Implement crm-dashboard-service.ts in packages/api/src/services/crm-dashboard-service.ts with getHotLeads() function finding contacts with status LEAD having deals in QUALIFIED/APPOINTMENT/VISIT/NEGOTIATION stages
- [x] T [US7] Implement crm-dashboard-service.ts in packages/api/src/services/crm-dashboard-service.ts with getNextBestActions() function returning overdue follow-ups (activities with nextActionAt in past) and appointments requiring confirmation

### Backend Controllers & Routes

- [x] T [US7] Create crm-controller.ts handler in packages/api/src/controllers/crm-controller.ts with getDashboard() function
- [x] T [US7] Add /tenants/:tenantId/crm/dashboard route (GET) to crm-routes.ts in packages/api/src/routes/crm-routes.ts

### Frontend Services

- [ ] T132 [US7] Create crm-service.ts function in apps/web/src/services/crm-service.ts with getDashboard() API client function

### Frontend Components

- [ ] T133 [US7] Create Dashboard.tsx in apps/web/src/pages/crm/Dashboard.tsx with KPI cards (new leads, hot leads, upcoming appointments, deals in negotiation)
- [ ] T134 [US7] Create NextActionsList.tsx in apps/web/src/components/crm/NextActionsList.tsx displaying overdue follow-ups and appointments requiring confirmation
- [ ] T135 [US7] Add routing for /crm/dashboard in apps/web/src/App.tsx or router configuration

**Story Completion Checkpoint**: US7 complete when dashboard displays accurate KPIs and next best actions scoped to tenant

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Final polish, edge cases, performance optimization, and cross-cutting features

### Edge Cases & Error Handling

- [ ] T136 Implement contact deletion prevention in crm-contact-service.ts in packages/api/src/services/crm-contact-service.ts if contact has active deals or recent activities (return error or mark as archived)
- [ ] T137 Implement duplicate contact detection in crm-contact-service.ts in packages/api/src/services/crm-contact-service.ts suggesting potential duplicates based on email/phone
- [ ] T138 Implement contact merge functionality in crm-contact-service.ts in packages/api/src/services/crm-contact-service.ts with mergeContacts() function combining activities, deals, roles, tags
- [ ] T139 Implement agent reassignment logic in crm-contact-service.ts and crm-deal-service.ts when assigned agent leaves tenant (auto-reassign to manager or unassign)
- [ ] T140 Implement overdue action detection in crm-activity-service.ts in packages/api/src/services/crm-activity-service.ts marking activities with nextActionAt in past as overdue

### Notes Feature

- [ ] T141 Implement crm-note-service.ts in packages/api/src/services/crm-note-service.ts with createNote(), listNotes() functions for contacts, deals, properties
- [ ] T142 Add note creation UI in ContactDetail.tsx, DealDetail.tsx in apps/web/src/components/crm/

### Performance Optimization

- [ ] T143 Add database indexes verification in packages/api/prisma/schema.prisma ensuring all tenantId, foreign keys, and filter fields are indexed
- [ ] T144 Implement pagination helper in packages/api/src/utils/pagination.ts for consistent pagination across all list endpoints
- [ ] T145 Add caching strategy for dashboard KPIs in crm-dashboard-service.ts with 5-minute TTL

### Integration Tests

- [ ] T146 Create crm.integration.test.ts in packages/api/__tests__/integration/crm.integration.test.ts testing tenant isolation, permission checks, contact conversion, deal stage transitions
- [ ] T147 Create crm-matching.test.ts in packages/api/__tests__/unit/crm-matching.test.ts testing matching algorithm scoring logic

### Documentation

- [ ] T148 Update API documentation with CRM endpoints in packages/api/API.md
- [ ] T149 Create CRM module README in packages/api/src/services/README-CRM.md with service usage examples

---

## Dependencies & Story Completion Order

**Foundation First**: Phase 1 (Setup) → Phase 2 (Foundational) must complete before any user stories

**User Story Dependencies**:
- **US1 (Contact Management)**: Independent - can start immediately after Phase 2
- **US2 (Deal Pipeline)**: Depends on US1 (deals require contacts)
- **US3 (Activities)**: Depends on US1 (activities require contacts, optionally deals)
- **US4 (Appointments)**: Depends on US1 and US2 (appointments require contacts, optionally deals)
- **US5 (Property Matching)**: Depends on US2 (matching requires deals)
- **US6 (Lead Conversion)**: Depends on US1 (conversion operates on contacts)
- **US7 (Dashboard)**: Depends on US1, US2, US3, US4 (dashboard aggregates all CRM data)

**Parallel Execution Opportunities**:
- Within US1: T032-T038 (services) can run in parallel with T039-T045 (controllers/routes)
- Within US2: T054-T059 (services) can run in parallel with T060-T063 (controllers/routes)
- Within US3: T071-T075 (services) can run in parallel with T076-T078 (controllers/routes)
- US1 and US2 can partially overlap (US2 can start once contact model exists)
- US3 can start once contact model exists (doesn't need deals)

**Suggested MVP Scope**: 
- **Phase 1**: Setup
- **Phase 2**: Foundational
- **Phase 3**: US1 (Contact Management) - Core foundation
- **Phase 4**: US2 (Deal Pipeline) - Core revenue tracking
- **Phase 5**: US3 (Activity Tracking) - Essential for relationship continuity

This MVP provides complete contact management, deal pipeline, and activity tracking - the three P1 priorities.

---

## Implementation Strategy

**MVP First**: Implement US1, US2, US3 (all P1 priorities) for initial release
**Incremental Delivery**: Add US4, US5, US6 (P2) in subsequent iterations
**Enhancement**: Add US7 (P3) and polish features in final iteration

**Testing Strategy**: 
- Unit tests for services (business logic)
- Integration tests for tenant isolation and RBAC
- E2E tests for complete user flows

**Deployment Strategy**:
- Deploy database migration first
- Deploy backend services
- Deploy frontend components
- Enable CRM module per tenant via TenantModule activation

---

## Task Summary

- **Total Tasks**: 149
- **Setup Tasks**: 3 (Phase 1)
- **Foundational Tasks**: 26 (Phase 2)
- **US1 Tasks**: 24 (Phase 3)
- **US2 Tasks**: 17 (Phase 4)
- **US3 Tasks**: 14 (Phase 5)
- **US4 Tasks**: 14 (Phase 6)
- **US5 Tasks**: 17 (Phase 7)
- **US6 Tasks**: 11 (Phase 8)
- **US7 Tasks**: 9 (Phase 9)
- **Polish Tasks**: 14 (Phase 10)

**Parallel Opportunities**: Multiple tasks within each phase can run in parallel (marked with [P])

**Independent Test Criteria**: Each user story has clear independent test criteria enabling standalone validation

