# Tasks: Properties & Listings Module

**Input**: Design documents from `/specs/005-properties-module/`
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

- [x] T001 Create TypeScript type definitions in packages/api/src/types/property-types.ts with Property, PropertyTypeTemplate, PropertyMedia, PropertyDocument, PropertyStatusHistory, PropertyVisit, PropertyMandate, PropertyQualityScore types
- [x] T002 [P] Create frontend TypeScript types in apps/web/src/types/property-types.ts matching backend types
- [x] T003 [P] Create property permissions seed script in packages/api/prisma/seeds/property-permissions-seed.ts with all 7 property permissions (PROPERTIES_VIEW, PROPERTIES_CREATE, PROPERTIES_EDIT, PROPERTIES_DELETE, PROPERTIES_PUBLISH, PROPERTIES_MATCH, PROPERTIES_VISITS_SCHEDULE)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Database Schema & Migrations

- [x] T004 Add PropertyType enum (APPARTEMENT, MAISON_VILLA, STUDIO, DUPLEX_TRIPLEX, CHAMBRE_COLOCATION, BUREAU, BOUTIQUE_COMMERCIAL, ENTREPOT_INDUSTRIEL, TERRAIN, IMMEUBLE, PARKING_BOX, LOT_PROGRAMME_NEUF) to packages/api/prisma/schema.prisma
- [x] T005 [P] Add PropertyOwnershipType enum (TENANT, PUBLIC, CLIENT) to packages/api/prisma/schema.prisma
- [x] T006 [P] Add PropertyTransactionMode enum (SALE, RENTAL, SHORT_TERM) to packages/api/prisma/schema.prisma
- [x] T007 [P] Add PropertyFurnishingStatus enum (FURNISHED, UNFURNISHED, PARTIALLY_FURNISHED) to packages/api/prisma/schema.prisma
- [x] T008 [P] Add PropertyStatus enum (DRAFT, UNDER_REVIEW, AVAILABLE, RESERVED, UNDER_OFFER, RENTED, SOLD, ARCHIVED) to packages/api/prisma/schema.prisma
- [x] T009 [P] Add PropertyAvailability enum (AVAILABLE, UNAVAILABLE, SOON_AVAILABLE) to packages/api/prisma/schema.prisma
- [x] T010 [P] Add PropertyMediaType enum (PHOTO, VIDEO, TOUR_360) to packages/api/prisma/schema.prisma
- [x] T011 [P] Add PropertyDocumentType enum (TITLE_DEED, MANDATE, PLAN, TAX_DOCUMENT, OTHER) to packages/api/prisma/schema.prisma
- [x] T012 [P] Add PropertyVisitType enum (VISIT, APPOINTMENT) to packages/api/prisma/schema.prisma
- [x] T013 [P] Add PropertyVisitStatus enum (SCHEDULED, CONFIRMED, DONE, NO_SHOW, CANCELED) to packages/api/prisma/schema.prisma
- [x] T014 Create Property model in packages/api/prisma/schema.prisma with all fields, relationships, and indexes per data-model.md
- [x] T015 [P] Create PropertyTypeTemplate model in packages/api/prisma/schema.prisma with all fields and JSON configuration
- [x] T016 [P] Create PropertyMedia model in packages/api/prisma/schema.prisma with all fields and relationships
- [x] T017 [P] Create PropertyDocument model in packages/api/prisma/schema.prisma with expiration tracking fields
- [x] T018 [P] Create PropertyStatusHistory model in packages/api/prisma/schema.prisma with all fields and relationships
- [x] T019 [P] Create PropertyVisit model in packages/api/prisma/schema.prisma with all fields and relationships to Property, CrmContact, CrmDeal
- [x] T020 [P] Create PropertyMandate model in packages/api/prisma/schema.prisma with all fields and relationships
- [x] T021 [P] Create PropertyQualityScore model in packages/api/prisma/schema.prisma with all fields and relationships
- [x] T022 Add Tenant relation to Property model in packages/api/prisma/schema.prisma
- [x] T023 Add User relation to Property model (PropertyOwner) in packages/api/prisma/schema.prisma
- [x] T024 Add User relation to PropertyStatusHistory (PropertyStatusChangedBy) in packages/api/prisma/schema.prisma
- [x] T025 Add User relation to PropertyVisit (PropertyVisitAssignedTo) in packages/api/prisma/schema.prisma
- [x] T026 Add User relation to PropertyMandate (PropertyMandateOwner, PropertyMandateRevokedBy) in packages/api/prisma/schema.prisma
- [x] T027 Add Property relation to CrmDealProperty (existing model) in packages/api/prisma/schema.prisma
- [x] T028 Create database migration in packages/api/prisma/migrations/ with name add_properties_module
- [x] T029 Run database migration and verify all tables created correctly

### RBAC & Middleware Infrastructure

- [x] T030 Create property-rbac-middleware.ts in packages/api/src/middleware/property-rbac-middleware.ts with requirePropertyPermission() function
- [x] T031 [P] Create property-ownership-middleware.ts in packages/api/src/middleware/property-ownership-middleware.ts to validate ownership and mandate access
- [x] T032 [P] Enhance tenant-isolation-middleware.ts in packages/api/src/middleware/tenant-isolation-middleware.ts to enforce tenantId on tenant-owned property queries
- [x] T033 [P] Update audit-service.ts in packages/api/src/services/audit-service.ts to support PROPERTY entity type

### Utility Functions

- [x] T034 Create property-reference-generator.ts in packages/api/src/utils/property-reference-generator.ts with generatePropertyReference() function implementing PROP-{YYYYMMDD}-{prefix}-{sequential} format
- [x] T035 [P] Create geolocation-utils.ts in packages/api/src/utils/geolocation-utils.ts with geocodeAddress() and validateGeolocation() functions

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Property Creation with Type-Specific Templates (Priority: P1) 🎯 MVP

**Goal**: Real estate agents and property owners can create property listings using templates tailored to each property type

**Independent Test**: Create properties of different types (apartment, house, office, land), verify each type shows appropriate fields, validate required fields are enforced, confirm properties are saved with complete information

### Database & Models

- [x] T036 [US1] Verify Property model supports all required fields (title, address, propertyType, ownershipType) in packages/api/prisma/schema.prisma
- [x] T037 [US1] Verify PropertyTypeTemplate model supports JSON field definitions and sections in packages/api/prisma/schema.prisma

### Backend Services

- [x] T038 [US1] Implement property-template-service.ts in packages/api/src/services/property-template-service.ts with getTemplateByType() function loading template configuration
- [x] T039 [US1] Implement property-template-service.ts in packages/api/src/services/property-template-service.ts with validatePropertyData() function enforcing template validation rules
- [x] T040 [US1] Implement property-service.ts in packages/api/src/services/property-service.ts with createProperty() function generating unique reference and validating against template
- [x] T041 [US1] Implement property-service.ts in packages/api/src/services/property-service.ts with getPropertyById() function with ownership and tenant isolation checks
- [x] T042 [US1] Implement property-service.ts in packages/api/src/services/property-service.ts with updateProperty() function with template validation
- [x] T043 [US1] Implement property-service.ts in packages/api/src/services/property-service.ts with listProperties() function with tenant isolation and basic filtering

### Backend Controllers & Routes

- [x] T044 [US1] Create property-controller.ts in packages/api/src/controllers/property-controller.ts with createProperty() handler
- [x] T045 [US1] Create property-controller.ts in packages/api/src/controllers/property-controller.ts with getProperty() handler returning property with template structure
- [x] T046 [US1] Create property-controller.ts in packages/api/src/controllers/property-controller.ts with updateProperty() handler
- [x] T047 [US1] Create property-controller.ts in packages/api/src/controllers/property-controller.ts with listProperties() handler
- [x] T048 [US1] Create property-routes.ts in packages/api/src/routes/property-routes.ts with POST /tenants/:tenantId/properties route
- [x] T049 [US1] Create property-routes.ts in packages/api/src/routes/property-routes.ts with GET /tenants/:tenantId/properties/:id route
- [x] T050 [US1] Create property-routes.ts in packages/api/src/routes/property-routes.ts with PUT /tenants/:tenantId/properties/:id route
- [x] T051 [US1] Create property-routes.ts in packages/api/src/routes/property-routes.ts with GET /tenants/:tenantId/properties route
- [x] T052 [US1] Create property-template routes in packages/api/src/routes/property-routes.ts with GET /property-templates and GET /property-templates/:type routes

### Frontend Components

- [x] T053 [US1] Create PropertyTypeSelector.tsx in apps/web/src/components/properties/PropertyTypeSelector.tsx for property type selection
- [x] T054 [US1] Create PropertyForm.tsx in apps/web/src/components/properties/PropertyForm.tsx with dynamic field rendering based on template
- [x] T055 [US1] Create PropertyCreate.tsx in apps/web/src/pages/properties/PropertyCreate.tsx page with type selection and form
- [x] T056 [US1] Create PropertyEdit.tsx in apps/web/src/pages/properties/PropertyEdit.tsx page with template-based editing
- [x] T057 [US1] Create property-service.ts in apps/web/src/services/property-service.ts with createProperty(), getProperty(), updateProperty(), listProperties(), getTemplate() functions

### Seed Data

- [x] T058 [US1] Create property-templates-seed.ts in packages/api/prisma/seeds/property-templates-seed.ts seeding templates for all 12+ property types with field definitions and sections

---

## Phase 4: User Story 2 - Property Ownership and Management Modes (Priority: P1)

**Goal**: System supports different ownership models (tenant-owned, public owner, management mandates)

**Independent Test**: Create tenant-owned properties, create public properties by registered private owners, assign management mandates to tenants, verify visibility and access controls

### Backend Services

- [x] T059 [US2] Implement property-service.ts in packages/api/src/services/property-service.ts with createTenantProperty() function enforcing tenant ownership
- [x] T060 [US2] Implement property-service.ts in packages/api/src/services/property-service.ts with createPublicProperty() function for private owners
- [x] T061 [US2] Implement property-mandate-service.ts in packages/api/src/services/property-mandate-service.ts with createMandate() function assigning management to tenant
- [x] T062 [US2] Implement property-mandate-service.ts in packages/api/src/services/property-mandate-service.ts with revokeMandate() function preserving historical data
- [x] T063 [US2] Implement property-service.ts in packages/api/src/services/property-service.ts with getAccessibleProperties() function filtering by ownership type and tenant association
- [x] T064 [US2] Enhance property-ownership-middleware.ts in packages/api/src/middleware/property-ownership-middleware.ts to validate mandate access for CLIENT ownership type

### Backend Controllers & Routes

- [x] T065 [US2] Enhance property-controller.ts in packages/api/src/controllers/property-controller.ts with ownership type handling in createProperty()
- [x] T066 [US2] Create property-mandate-controller.ts in packages/api/src/controllers/property-mandate-controller.ts with createMandate() and revokeMandate() handlers
- [x] T067 [US2] Create property-mandate routes in packages/api/src/routes/property-routes.ts with POST /tenants/:tenantId/properties/:id/mandates route

### Frontend Components

- [x] T068 [US2] Enhance PropertyForm.tsx in apps/web/src/components/properties/PropertyForm.tsx with ownership type selection
- [x] T069 [US2] Create PropertyMandateForm.tsx in apps/web/src/components/properties/PropertyMandateForm.tsx for mandate creation
- [x] T070 [US2] Enhance property-service.ts in apps/web/src/services/property-service.ts with createMandate() and revokeMandate() functions

---

## Phase 5: User Story 3 - Property Media and Document Management (Priority: P1)

**Goal**: Agents and property owners can upload and manage photos, videos, 360° tours, and documents

**Independent Test**: Upload photos, videos, and documents to a property, organize media in galleries, verify document types are validated, confirm media is displayed correctly

### Backend Services

- [x] T071 [US3] Implement property-media-service.ts in packages/api/src/services/property-media-service.ts with uploadMedia() function handling file upload and storage
- [x] T072 [US3] Implement property-media-service.ts in packages/api/src/services/property-media-service.ts with reorderMedia() function updating displayOrder
- [x] T073 [US3] Implement property-media-service.ts in packages/api/src/services/property-media-service.ts with setPrimaryMedia() function ensuring only one primary image
- [x] T074 [US3] Implement property-media-service.ts in packages/api/src/services/property-media-service.ts with deleteMedia() function
- [x] T075 [US3] Implement property-document-service.ts in packages/api/src/services/property-document-service.ts with uploadDocument() function with type validation
- [x] T076 [US3] Implement property-document-service.ts in packages/api/src/services/property-document-service.ts with validateDocumentType() function
- [x] T077 [US3] Implement property-document-service.ts in packages/api/src/services/property-document-service.ts with getDocuments() function with access control

### Backend Controllers & Routes

- [x] T078 [US3] Create property-media-controller.ts in packages/api/src/controllers/property-media-controller.ts with uploadMedia() handler
- [x] T079 [US3] Create property-media-controller.ts in packages/api/src/controllers/property-media-controller.ts with listMedia() handler
- [x] T080 [US3] Create property-media-controller.ts in packages/api/src/controllers/property-media-controller.ts with reorderMedia() handler
- [x] T081 [US3] Create property-media-controller.ts in packages/api/src/controllers/property-media-controller.ts with deleteMedia() handler
- [x] T082 [US3] Create property-document-controller.ts in packages/api/src/controllers/property-document-controller.ts with uploadDocument() handler
- [x] T083 [US3] Create property-document-controller.ts in packages/api/src/controllers/property-document-controller.ts with listDocuments() handler
- [x] T084 [US3] Create property-media routes in packages/api/src/routes/property-routes.ts with POST /tenants/:tenantId/properties/:id/media route
- [x] T085 [US3] Create property-media routes in packages/api/src/routes/property-routes.ts with GET /tenants/:tenantId/properties/:id/media route
- [x] T086 [US3] Create property-media routes in packages/api/src/routes/property-routes.ts with POST /tenants/:tenantId/properties/:id/media/reorder route
- [x] T087 [US3] Create property-document routes in packages/api/src/routes/property-routes.ts with POST /tenants/:tenantId/properties/:id/documents route

### Frontend Components

- [x] T088 [US3] Create PropertyMediaUpload.tsx in apps/web/src/components/properties/PropertyMediaUpload.tsx with drag-and-drop upload
- [x] T089 [US3] Create PropertyMediaGallery.tsx in apps/web/src/components/properties/PropertyMediaGallery.tsx with reordering and primary image selection
- [x] T090 [US3] Create PropertyDocumentUpload.tsx in apps/web/src/components/properties/PropertyDocumentUpload.tsx with type selection and validation
- [x] T091 [US3] Enhance property-service.ts in apps/web/src/services/property-service.ts with uploadMedia(), reorderMedia(), uploadDocument() functions

---

## Phase 6: User Story 4 - Property Workflow and Status Management (Priority: P1)

**Goal**: Properties follow a lifecycle workflow with statuses to track availability and manage sales/rental process

**Independent Test**: Create property in draft status, move through workflow stages, verify status changes are recorded, confirm properties are filtered correctly by status

### Backend Services

- [x] T092 [US4] Implement property-service.ts in packages/api/src/services/property-service.ts with updatePropertyStatus() function with transition validation
- [x] T093 [US4] Implement property-service.ts in packages/api/src/services/property-service.ts with recordStatusHistory() function creating immutable status history entries
- [x] T094 [US4] Implement property-service.ts in packages/api/src/services/property-service.ts with validateStatusTransition() function checking allowed transitions and permissions
- [x] T095 [US4] Implement property-service.ts in packages/api/src/services/property-service.ts with getStatusHistory() function returning all status changes

### Backend Controllers & Routes

- [x] T096 [US4] Create property-controller.ts in packages/api/src/controllers/property-controller.ts with updateStatus() handler
- [x] T097 [US4] Create property-controller.ts in packages/api/src/controllers/property-controller.ts with getStatusHistory() handler
- [x] T098 [US4] Create property-status routes in packages/api/src/routes/property-routes.ts with POST /tenants/:tenantId/properties/:id/status route

### Frontend Components

- [x] T099 [US4] Create PropertyStatusWorkflow.tsx in apps/web/src/components/properties/PropertyStatusWorkflow.tsx with status transition UI
- [x] T100 [US4] Create PropertyStatusHistory.tsx in apps/web/src/components/properties/PropertyStatusHistory.tsx displaying status timeline
- [x] T101 [US4] Enhance property-service.ts in apps/web/src/services/property-service.ts with updateStatus() and getStatusHistory() functions

---

## Phase 7: User Story 5 - Property Search and Filtering (Priority: P1)

**Goal**: Agents and public users can search and filter properties by multiple criteria to find relevant properties quickly

**Independent Test**: Search properties with various filters (type, location, price, size), verify results match criteria, test combination of multiple filters, confirm search performance

### Backend Services

- [x] T102 [US5] Implement property-search-service.ts in packages/api/src/services/property-search-service.ts with searchProperties() function with multi-criteria filtering
- [x] T103 [US5] Implement property-search-service.ts in packages/api/src/services/property-search-service.ts with buildSearchQuery() function constructing Prisma query with filters
- [x] T104 [US5] Implement property-search-service.ts in packages/api/src/services/property-search-service.ts with geolocationSearch() function for location-based search
- [x] T105 [US5] Implement property-search-service.ts in packages/api/src/services/property-search-service.ts with paginateResults() function for performance

### Backend Controllers & Routes

- [x] T106 [US5] Create property-search-controller.ts in packages/api/src/controllers/property-search-controller.ts with searchProperties() handler
- [x] T107 [US5] Create property-search routes in packages/api/src/routes/property-routes.ts with POST /tenants/:tenantId/properties/search route

### Frontend Components

- [x] T108 [US5] Create PropertySearchFilters.tsx in apps/web/src/components/properties/PropertySearchFilters.tsx with filter UI (type, location, price, size, features)
- [x] T109 [US5] Create PropertySearchResults.tsx in apps/web/src/components/properties/PropertySearchResults.tsx displaying search results
- [x] T110 [US5] Create PropertySearch.tsx in apps/web/src/pages/properties/PropertySearch.tsx page with search interface
- [x] T111 [US5] Enhance property-service.ts in apps/web/src/services/property-service.ts with searchProperties() function

---

## Phase 8: User Story 6 - Property Publication and Public Portal Visibility (Priority: P1)

**Goal**: Agents and property owners can publish properties to public portal and control publication status

**Independent Test**: Publish property to public portal, verify it appears in public search, unpublish it, confirm it's removed from public view, check only published properties are visible to public users

### Backend Services

- [x] T112 [US6] Implement property-service.ts in packages/api/src/services/property-service.ts with validatePublicationRequirements() function checking required fields, primary photo, geolocation
- [x] T113 [US6] Implement property-service.ts in packages/api/src/services/property-service.ts with publishProperty() function setting isPublished flag and publishedAt timestamp
- [x] T114 [US6] Implement property-service.ts in packages/api/src/services/property-service.ts with unpublishProperty() function removing from public portal
- [x] T115 [US6] Implement property-public-service.ts in packages/api/src/services/property-public-service.ts with getPublishedProperties() function for unauthenticated access
- [x] T116 [US6] Implement property-public-service.ts in packages/api/src/services/property-public-service.ts with searchPublishedProperties() function with public-safe filtering

### Backend Controllers & Routes

- [x] T117 [US6] Create property-controller.ts in packages/api/src/controllers/property-controller.ts with publishProperty() handler
- [x] T118 [US6] Create property-controller.ts in packages/api/src/controllers/property-controller.ts with unpublishProperty() handler
- [x] T119 [US6] Create property-public-controller.ts in packages/api/src/controllers/property-public-controller.ts with getPublishedProperties() handler (unauthenticated)
- [x] T120 [US6] Create property-public-controller.ts in packages/api/src/controllers/property-public-controller.ts with getPublishedProperty() handler (unauthenticated)
- [x] T121 [US6] Create property-public routes in packages/api/src/routes/property-public-routes.ts with GET /public/properties route
- [x] T122 [US6] Create property-public routes in packages/api/src/routes/property-public-routes.ts with GET /public/properties/:id route
- [x] T123 [US6] Create property-public routes in packages/api/src/routes/property-routes.ts with POST /tenants/:tenantId/properties/:id/publish route
- [x] T124 [US6] Create property-public routes in packages/api/src/routes/property-routes.ts with POST /tenants/:tenantId/properties/:id/unpublish route

### Frontend Components

- [x] T125 [US6] Create PropertyPublic.tsx in apps/web/src/pages/properties/PropertyPublic.tsx page for public portal property listing
- [x] T126 [US6] Create PropertyPublicDetail.tsx in apps/web/src/pages/properties/PropertyPublicDetail.tsx page for public property detail view
- [x] T127 [US6] Enhance PropertyDetail.tsx in apps/web/src/pages/properties/PropertyDetail.tsx with publish/unpublish controls
- [x] T128 [US6] Enhance property-service.ts in apps/web/src/services/property-service.ts with publishProperty(), unpublishProperty() functions
- [x] T129 [US6] Create property-public-service.ts in apps/web/src/services/property-public-service.ts with getPublishedProperties() function (no auth)

---

## Phase 9: User Story 7 - Property-CRM Integration and Matching (Priority: P2)

**Goal**: Agents can link properties to CRM deals, enable automatic property matching, and track property status in deal context

**Independent Test**: Link property to CRM deal, run automatic matching based on deal criteria, view matched properties with scores, track property status in deal context

### Backend Services

- [x] T130 [US7] Implement property-matching-service.ts in packages/api/src/services/property-matching-service.ts with matchPropertiesForDeal() function with weighted scoring algorithm
- [x] T131 [US7] Implement property-matching-service.ts in packages/api/src/services/property-matching-service.ts with calculateMatchScore() function using weights (budget 30%, location 25%, size/rooms 20%, features 15%, price coherence 10%)
- [x] T132 [US7] Implement property-matching-service.ts in packages/api/src/services/property-matching-service.ts with matchBudget() function for budget criteria matching
- [x] T133 [US7] Implement property-matching-service.ts in packages/api/src/services/property-matching-service.ts with matchLocation() function for location criteria matching
- [x] T134 [US7] Implement property-matching-service.ts in packages/api/src/services/property-matching-service.ts with matchSize() function for size/rooms criteria matching
- [x] T135 [US7] Implement property-matching-service.ts in packages/api/src/services/property-matching-service.ts with matchFeatures() function for features criteria matching
- [x] T136 [US7] Implement property-matching-service.ts in packages/api/src/services/property-matching-service.ts with calculatePriceCoherence() function for price coherence scoring
- [x] T137 [US7] Implement property-matching-service.ts in packages/api/src/services/property-matching-service.ts with generateMatchExplanation() function explaining matched criteria
- [x] T138 [US7] Implement property-matching-service.ts in packages/api/src/services/property-matching-service.ts with addToShortlist() function linking property to deal via CrmDealProperty
- [x] T139 [US7] Implement property-matching-service.ts in packages/api/src/services/property-matching-service.ts with updatePropertyMatchStatus() function updating CrmDealProperty status

### Backend Controllers & Routes

- [x] T140 [US7] Create property-matching-controller.ts in packages/api/src/controllers/property-matching-controller.ts with matchProperties() handler
- [x] T141 [US7] Create property-matching routes in packages/api/src/routes/property-routes.ts with POST /tenants/:tenantId/crm/deals/:dealId/properties/match route

### Frontend Components

- [x] T142 [US7] Create PropertyMatching.tsx in apps/web/src/components/properties/PropertyMatching.tsx with match results display and scoring
- [x] T143 [US7] Enhance CRM deal detail page to include property matching interface
- [x] T144 [US7] Enhance property-service.ts in apps/web/src/services/property-service.ts with matchPropertiesForDeal() function

---

## Phase 10: User Story 8 - Visit Scheduling from Properties (Priority: P2)

**Goal**: Agents can schedule property visits directly from property listing, linking visits to contacts and deals

**Independent Test**: Schedule visit from property page, assign to agent, link to contact and deal, view visits in calendar, mark visits as completed

### Backend Services

- [x] T145 [US8] Implement property-visit-service.ts in packages/api/src/services/property-visit-service.ts with scheduleVisit() function creating PropertyVisit linked to property, contact, and deal
- [x] T146 [US8] Implement property-visit-service.ts in packages/api/src/services/property-visit-service.ts with updateVisitStatus() function updating visit status
- [x] T147 [US8] Implement property-visit-service.ts in packages/api/src/services/property-visit-service.ts with getPropertyVisits() function returning all visits for a property
- [x] T148 [US8] Implement property-visit-service.ts in packages/api/src/services/property-visit-service.ts with getCalendarVisits() function returning visits organized by date
- [x] T149 [US8] Implement property-visit-service.ts in packages/api/src/services/property-visit-service.ts with completeVisit() function updating status and logging CRM activity

### Backend Controllers & Routes

- [x] T150 [US8] Create property-visit-controller.ts in packages/api/src/controllers/property-visit-controller.ts with scheduleVisit() handler
- [x] T151 [US8] Create property-visit-controller.ts in packages/api/src/controllers/property-visit-controller.ts with updateVisitStatus() handler
- [x] T152 [US8] Create property-visit-controller.ts in packages/api/src/controllers/property-visit-controller.ts with getPropertyVisits() handler
- [x] T153 [US8] Create property-visit routes in packages/api/src/routes/property-routes.ts with POST /tenants/:tenantId/properties/:id/visits route
- [x] T154 [US8] Create property-visit routes in packages/api/src/routes/property-routes.ts with GET /tenants/:tenantId/properties/:id/visits route

### Frontend Components

- [x] T155 [US8] Create PropertyVisitScheduler.tsx in apps/web/src/components/properties/PropertyVisitScheduler.tsx with visit scheduling form
- [x] T156 [US8] Create PropertyVisitCalendar.tsx in apps/web/src/components/properties/PropertyVisitCalendar.tsx displaying visits by date
- [x] T157 [US8] Enhance PropertyDetail.tsx in apps/web/src/pages/properties/PropertyDetail.tsx with visit scheduling interface
- [x] T158 [US8] Enhance property-service.ts in apps/web/src/services/property-service.ts with scheduleVisit(), getPropertyVisits() functions

---

## Phase 11: User Story 9 - Property Quality Scoring and Suggestions (Priority: P3)

**Goal**: System automatically calculates property listing quality scores and provides intelligent suggestions for improvement

**Independent Test**: Create properties with varying completeness, verify quality scores are calculated, check suggestions are displayed, confirm scores update as properties are improved

### Backend Services

- [x] T159 [US9] Implement property-quality-service.ts in packages/api/src/services/property-quality-service.ts with calculateQualityScore() function using formula (required fields 40%, media 30%, geolocation 20%, description 10%)
- [x] T160 [US9] Implement property-quality-service.ts in packages/api/src/services/property-quality-service.ts with getRequiredFieldsCompletion() function calculating completion percentage
- [x] T161 [US9] Implement property-quality-service.ts in packages/api/src/services/property-quality-service.ts with calculateMediaScore() function based on media presence
- [x] T162 [US9] Implement property-quality-service.ts in packages/api/src/services/property-quality-service.ts with calculateDescriptionQuality() function analyzing description completeness
- [x] T163 [US9] Implement property-quality-service.ts in packages/api/src/services/property-quality-service.ts with generateSuggestions() function creating improvement recommendations
- [x] T164 [US9] Implement property-quality-service.ts in packages/api/src/services/property-quality-service.ts with storeQualityScore() function saving to PropertyQualityScore model
- [x] T165 [US9] Enhance property-service.ts in packages/api/src/services/property-service.ts to call calculateQualityScore() on property create/update

### Backend Controllers & Routes

- [x] T166 [US9] Create property-controller.ts in packages/api/src/controllers/property-controller.ts with getQualityScore() handler
- [x] T167 [US9] Create property-quality routes in packages/api/src/routes/property-routes.ts with GET /tenants/:tenantId/properties/:id/quality route

### Frontend Components

- [x] T168 [US9] Create PropertyQualityScore.tsx in apps/web/src/components/properties/PropertyQualityScore.tsx displaying score and suggestions
- [x] T169 [US9] Enhance PropertyDetail.tsx in apps/web/src/pages/properties/PropertyDetail.tsx with quality score display
- [x] T170 [US9] Enhance property-service.ts in apps/web/src/services/property-service.ts with getQualityScore() function

---

## Phase 12: User Story 10 - Multi-Lot Property Management (Priority: P3)

**Goal**: System supports container properties (buildings, programs) with child lots, enabling hierarchical property management

**Independent Test**: Create building property, add child lot properties, verify inheritance of information, view aggregated availability and pricing, manage individual lot statuses

### Backend Services

- [ ] T171 [US10] Implement property-container-service.ts in packages/api/src/services/property-container-service.ts with createContainerProperty() function
- [ ] T172 [US10] Implement property-container-service.ts in packages/api/src/services/property-container-service.ts with addChildLot() function with partial information inheritance
- [ ] T173 [US10] Implement property-container-service.ts in packages/api/src/services/property-container-service.ts with getAggregatedInfo() function calculating total lots, availability, price ranges, typology distribution
- [ ] T174 [US10] Implement property-container-service.ts in packages/api/src/services/property-container-service.ts with updateContainerInfo() function with optional inheritance to child lots
- [ ] T175 [US10] Implement property-container-service.ts in packages/api/src/services/property-container-service.ts with getChildLots() function returning all child properties

### Backend Controllers & Routes

- [ ] T176 [US10] Create property-container-controller.ts in packages/api/src/controllers/property-container-controller.ts with getAggregatedInfo() handler
- [ ] T177 [US10] Create property-container-controller.ts in packages/api/src/controllers/property-container-controller.ts with addChildLot() handler
- [ ] T178 [US10] Create property-container routes in packages/api/src/routes/property-routes.ts with GET /tenants/:tenantId/properties/:id/aggregated route
- [ ] T179 [US10] Create property-container routes in packages/api/src/routes/property-routes.ts with POST /tenants/:tenantId/properties/:id/children route

### Frontend Components

- [ ] T180 [US10] Create PropertyContainerView.tsx in apps/web/src/components/properties/PropertyContainerView.tsx displaying aggregated information
- [ ] T181 [US10] Create PropertyChildLotManager.tsx in apps/web/src/components/properties/PropertyChildLotManager.tsx for managing child lots
- [ ] T182 [US10] Enhance property-service.ts in apps/web/src/services/property-service.ts with getAggregatedInfo(), addChildLot() functions

---

## Phase 13: Polish & Cross-Cutting Concerns

**Purpose**: Final polish, edge cases, performance optimization, and cross-cutting features

### Document Expiration Management

- [ ] T183 Implement scheduled job in packages/api/src/jobs/document-expiration-job.ts checking document expiration daily
- [ ] T184 Implement document-expiration-job.ts in packages/api/src/jobs/document-expiration-job.ts with sendWarnings() function for 30-day warnings
- [ ] T185 Implement document-expiration-job.ts in packages/api/src/jobs/document-expiration-job.ts with flagGracePeriod() function for 7-day grace period
- [ ] T186 Implement document-expiration-job.ts in packages/api/src/jobs/document-expiration-job.ts with autoUnpublish() function after grace period
- [ ] T187 Configure scheduled job in packages/api/src/index.ts to run daily

### Duplicate Detection

- [ ] T188 Implement property-duplicate-service.ts in packages/api/src/services/property-duplicate-service.ts with checkDuplicateProperty() function
- [ ] T189 Implement property-duplicate-service.ts in packages/api/src/services/property-duplicate-service.ts with addressSimilarity() function using fuzzy matching
- [ ] T190 Implement property-duplicate-service.ts in packages/api/src/services/property-duplicate-service.ts with geolocationProximity() function checking within 100m
- [ ] T191 Implement property-duplicate-service.ts in packages/api/src/services/property-duplicate-service.ts with surfaceAreaSimilarity() function checking within 10%
- [ ] T192 Enhance property-service.ts in packages/api/src/services/property-service.ts to call checkDuplicateProperty() on property creation
- [ ] T193 Create PropertyDuplicateAlert.tsx in apps/web/src/components/properties/PropertyDuplicateAlert.tsx displaying duplicate warnings

### Optimistic Locking & Concurrency

- [ ] T194 Add version field to Property model in packages/api/prisma/schema.prisma for optimistic locking
- [ ] T195 Enhance property-service.ts in packages/api/src/services/property-service.ts with checkConcurrentUpdate() function
- [ ] T196 Enhance property-controller.ts in packages/api/src/controllers/property-controller.ts to return 409 Conflict on concurrent update

### Performance Optimization

- [ ] T197 Add composite indexes to Property model in packages/api/prisma/schema.prisma for common filter combinations (type + status + location)
- [ ] T198 Add partial index on Property model in packages/api/prisma/schema.prisma for published properties (is_published = true)
- [ ] T199 Implement caching for property templates in packages/api/src/services/property-template-service.ts
- [ ] T200 Implement pagination optimization in packages/api/src/services/property-search-service.ts

### Audit Logging

- [ ] T201 Enhance audit-service.ts in packages/api/src/services/audit-service.ts to log all property create/update/delete operations
- [ ] T202 Ensure all property service functions call logAuditEvent() with appropriate action keys

### Error Handling & Validation

- [ ] T203 Create property validation schemas in packages/api/src/types/property-types.ts using Zod
- [ ] T204 Add comprehensive error handling to all property controllers
- [ ] T205 Add input validation middleware for all property routes

### Testing

- [ ] T206 Create property.integration.test.ts in packages/api/__tests__/integration/property.integration.test.ts with end-to-end property creation flow
- [ ] T207 Create property-matching.integration.test.ts in packages/api/__tests__/integration/property-matching.integration.test.ts with matching algorithm tests
- [ ] T208 Create property-matching.test.ts in packages/api/__tests__/unit/property-matching.test.ts with unit tests for scoring algorithm
- [ ] T209 Create property-quality.test.ts in packages/api/__tests__/unit/property-quality.test.ts with unit tests for quality score calculation
- [ ] T210 Create property-duplicate.test.ts in packages/api/__tests__/unit/property-duplicate.test.ts with unit tests for duplicate detection

---

## Dependencies & Story Completion Order

**Foundation First** (Phase 1-2):
- Setup and foundational tasks must complete before any user story work

**P1 Stories Can Run in Parallel** (Phase 3-8):
- US1 (Property Creation) - Foundation for all other stories
- US2 (Ownership) - Can start after US1 database model
- US3 (Media/Documents) - Can start after US1
- US4 (Workflow) - Can start after US1
- US5 (Search) - Can start after US1
- US6 (Publication) - Requires US1, US3 (for publication requirements)

**P2 Stories Depend on P1** (Phase 9-10):
- US7 (CRM Matching) - Requires US1, US5 (search), CRM module
- US8 (Visits) - Requires US1, CRM module

**P3 Stories Depend on P1** (Phase 11-12):
- US9 (Quality Scoring) - Requires US1, US3 (media)
- US10 (Multi-Lot) - Requires US1

**Polish Phase** (Phase 13):
- Can start after all user stories complete
- Document expiration, duplicate detection, performance, testing

## Parallel Execution Examples

**After Phase 2 Complete**:
- T038-T043 (US1 services) can run in parallel
- T044-T052 (US1 controllers/routes) can run in parallel with services
- T053-T057 (US1 frontend) can run in parallel with backend

**Within US3**:
- T071-T074 (media services) can run in parallel
- T075-T077 (document services) can run in parallel with media
- T078-T087 (controllers/routes) can run in parallel with services

**Within US7**:
- T131-T137 (matching algorithm functions) can run in parallel
- T140-T141 (controller/routes) can run in parallel with services

## Implementation Strategy

**MVP Scope**: Phase 3 (US1) only
- Property creation with type-specific templates
- Basic CRUD operations
- Template validation
- Unique reference generation

**Incremental Delivery**:
1. **MVP**: US1 (Property Creation)
2. **V1.1**: US2 (Ownership) + US3 (Media/Documents)
3. **V1.2**: US4 (Workflow) + US5 (Search) + US6 (Publication)
4. **V1.3**: US7 (CRM Matching) + US8 (Visits)
5. **V1.4**: US9 (Quality Scoring) + US10 (Multi-Lot)
6. **V1.5**: Polish phase (document expiration, duplicate detection, performance)

**Independent Test Criteria per Story**:
- **US1**: Create properties of different types, verify templates, validate required fields
- **US2**: Create tenant/public properties, assign mandates, verify access controls
- **US3**: Upload media/documents, reorder media, set primary image, validate documents
- **US4**: Create property, move through status workflow, verify history
- **US5**: Search with filters, verify results match criteria, test performance
- **US6**: Publish property, verify public visibility, unpublish, verify removal
- **US7**: Match properties to deal, verify scores, add to shortlist, track status
- **US8**: Schedule visit, link to contact/deal, view calendar, complete visit
- **US9**: Create incomplete property, verify score, add missing data, verify score increase
- **US10**: Create container property, add child lots, verify inheritance, view aggregated info

---

## Summary

- **Total Tasks**: 210
- **Phase 1 (Setup)**: 3 tasks
- **Phase 2 (Foundational)**: 32 tasks
- **Phase 3 (US1 - MVP)**: 23 tasks
- **Phase 4 (US2)**: 12 tasks
- **Phase 5 (US3)**: 21 tasks
- **Phase 6 (US4)**: 10 tasks
- **Phase 7 (US5)**: 10 tasks
- **Phase 8 (US6)**: 18 tasks
- **Phase 9 (US7)**: 15 tasks
- **Phase 10 (US8)**: 14 tasks
- **Phase 11 (US9)**: 12 tasks
- **Phase 12 (US10)**: 12 tasks
- **Phase 13 (Polish)**: 28 tasks

**Parallel Opportunities**: Many tasks within each phase can run in parallel, especially service implementations, controller/routes, and frontend components.

**Suggested MVP**: Phase 3 (US1) - Property Creation with Type-Specific Templates (23 tasks)

