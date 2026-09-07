# Feature Specification: Properties & Listings Module

**Feature Branch**: `005-properties-module`  
**Created**: 2025-01-27  
**Status**: Draft  
**Input**: User description: "Module Biens & Annonces (Properties Module) - Single source of truth for all real estate assets managed or published via ImmoTopia, supporting multiple property types with templates, tenant-owned and public properties, property management mandates, CRM integration, visits scheduling, and advanced features like quality scoring and workflow management"

## Clarifications

### Session 2025-01-27

- Q: How should private property owners (non-tenants) register and what access/permissions do they have? → A: Private owners register through a separate public registration flow, get a simplified account with limited permissions, and can only manage their own properties
- Q: What format should property unique internal references use? → A: Auto-generated format like PROP-{YYYYMMDD}-{tenantId/ownerId prefix}-{sequential} (e.g., PROP-20250127-T001-0001) - includes date and context
- Q: How should property matching scores be calculated? → A: Weighted scoring with explicit criteria weights (budget 30%, location 25%, size/rooms 20%, features 15%, price coherence 10%) - exact matches score higher than approximate matches
- Q: How should document expiration be handled (grace periods, warnings, auto-unpublish)? → A: 30-day warning period before expiration, 7-day grace period after expiration (property remains published but flagged), then auto-unpublish if not renewed
- Q: What operations can tenants perform when managing properties under mandate? → A: Full management rights - tenant can edit all fields, change status, publish/unpublish, upload media/documents, but cannot transfer ownership or delete property

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Property Creation with Type-Specific Templates (Priority: P1)

Real estate agents and property owners need to create property listings using templates tailored to each property type (apartment, house, office, land, etc.). Each template displays only relevant fields, ensures data completeness, and guides users through property data entry.

**Why this priority**: This is the foundation of the properties module. Without property creation, agents cannot manage their portfolio or publish listings. Type-specific templates ensure data quality and consistency, which is essential for search, matching, and presentation.

**Independent Test**: Can be fully tested by creating properties of different types (apartment, house, office, land), verifying that each type shows appropriate fields, validating required fields are enforced, and confirming properties are saved with complete information. This delivers the value of structured, high-quality property data entry.

**Acceptance Scenarios**:

1. **Given** an agent wants to create a new apartment listing, **When** they select property type "Appartement", **Then** the system displays the apartment template with fields like floor, elevator, balcony, parking, and building year, organized in functional sections (Building, Equipment, Legal, Charges, Utilities)
2. **Given** an agent creates a land property, **When** they select property type "Terrain", **Then** the system displays the land template with fields like surface area, facade, zoning, legal status (ACD, CPF, village certificate), and utilities availability
3. **Given** an agent fills a property form, **When** they submit with missing required fields, **Then** the system displays validation errors at each missing field, preventing submission until all required fields are completed
4. **Given** an agent creates a property, **When** they save it, **Then** the property is assigned a unique internal reference in format PROP-{YYYYMMDD}-{tenantId/ownerId prefix}-{sequential} (e.g., PROP-20250127-T001-0001), stored with all entered data, and visible in the property list

---

### User Story 2 - Property Ownership and Management Modes (Priority: P1)

The system must support different ownership models: properties owned and managed by tenants (agencies), properties owned by registered private owners (non-tenants) who publish publicly, and properties where private owners delegate management to tenants via mandates.

**Why this priority**: Core business requirement for multi-tenant platform supporting both professional agencies and private property owners. Without this, the system cannot distinguish between tenant-managed properties and public listings, which impacts visibility, permissions, and business workflows.

**Independent Test**: Can be fully tested by creating tenant-owned properties, creating public properties by registered private owners, assigning management mandates to tenants, and verifying visibility and access controls for each ownership type. This delivers the value of flexible property management supporting diverse business models.

**Acceptance Scenarios**:

1. **Given** an agent in Tenant A, **When** they create a property with ownership type "TENANT", **Then** the property belongs to Tenant A, is visible only within Tenant A's scope, and Tenant A has full management rights
2. **Given** a registered private owner (non-tenant user), **When** they create a property with ownership type "PUBLIC", **Then** the property is published on the public portal, the owner retains ownership, and the property is not associated with any tenant by default
3. **Given** a public property owned by a private owner, **When** the owner assigns a management mandate to Tenant B, **Then** Tenant B becomes the managing tenant with full management rights (can edit all fields, change status, publish/unpublish, upload media/documents), but the owner remains the legal owner, cannot transfer ownership or delete property, and the property remains visible on the public portal
4. **Given** properties exist with different ownership types, **When** an agent views the property list, **Then** they see only properties they have access to based on ownership type and tenant association

---

### User Story 3 - Property Media and Document Management (Priority: P1)

Agents and property owners need to upload and manage photos, videos, 360° virtual tours, and documents (title deeds, mandates, plans, tax documents) for each property to create compelling listings and maintain legal compliance.

**Why this priority**: Essential for property presentation and legal compliance. High-quality media significantly improves listing appeal and conversion rates. Document management ensures legal requirements are met before publication.

**Independent Test**: Can be fully tested by uploading photos, videos, and documents to a property, organizing media in galleries, verifying document types are validated, and confirming media is displayed correctly in property views. This delivers the value of rich property presentation and document compliance.

**Acceptance Scenarios**:

1. **Given** a property exists, **When** an agent uploads multiple photos, **Then** photos are stored, can be reordered, and one photo can be set as the primary image for listings
2. **Given** a property listing, **When** an agent uploads a video or 360° tour, **Then** the media is stored and embedded in the property detail view for visitors to view
3. **Given** a property is ready for publication, **When** an agent uploads required legal documents (title deed, mandate), **Then** the system validates document types, stores them securely, and marks the property as having required documents
4. **Given** a property has documents, **When** an agent views the property, **Then** they can download or view documents with appropriate access controls based on their role

---

### User Story 4 - Property Workflow and Status Management (Priority: P1)

Properties must follow a lifecycle workflow with statuses (Draft, Under Review, Available, Reserved, Under Offer, Rented/Sold, Archived) to track property availability and manage the sales/rental process.

**Why this priority**: Critical for operational management. Status tracking enables agents to manage inventory, prevent double-booking, and track property lifecycle. Without this, agents cannot effectively manage availability or coordinate with clients.

**Independent Test**: Can be fully tested by creating a property in draft status, moving it through workflow stages (draft → under review → available → reserved → sold), verifying status changes are recorded, and confirming properties are filtered correctly by status. This delivers the value of organized property lifecycle management.

**Acceptance Scenarios**:

1. **Given** an agent creates a new property, **When** they save it, **Then** the property is created in "Draft" status, allowing further editing before publication
2. **Given** a property in "Draft" status, **When** an agent submits it for review, **Then** the property moves to "Under Review" status, and managers can approve or request changes
3. **Given** a property in "Available" status, **When** a client makes an offer, **Then** the agent can update status to "Under Offer", and the property remains visible but marked as under negotiation
4. **Given** a property transaction is completed, **When** an agent marks it as "Sold" or "Rented", **Then** the property moves to closed status, is removed from active listings, and historical data is preserved

---

### User Story 5 - Property Search and Filtering (Priority: P1)

Agents and public users need to search and filter properties by multiple criteria (type, location, price range, size, features, transaction mode) to find relevant properties quickly.

**Why this priority**: Core functionality for property discovery. Without effective search and filtering, users cannot find properties matching their criteria, rendering the system unusable. This is essential for both internal tenant use and public portal.

**Independent Test**: Can be fully tested by searching properties with various filters (type, location, price, size), verifying results match criteria, testing combination of multiple filters, and confirming search performance is acceptable. This delivers the value of efficient property discovery.

**Acceptance Scenarios**:

1. **Given** properties exist with different types and locations, **When** an agent searches for "Appartement" in "Paris", **Then** only apartments in Paris are displayed, sorted by relevance or date
2. **Given** properties with various prices, **When** a user filters by price range €200k-€300k, **Then** only properties within that range are displayed, and the filter can be combined with other criteria
3. **Given** properties with different features, **When** an agent filters by "3 bedrooms, parking, elevator", **Then** only properties matching all specified features are displayed
4. **Given** search results are displayed, **When** a user clicks on a property, **Then** they see the full property details with all information, media, and contact options

---

### User Story 6 - Property Publication and Public Portal Visibility (Priority: P1)

Agents and property owners need to publish properties to the public portal, making them visible to potential buyers/renters, and control publication status (publish/unpublish) to manage public visibility.

**Why this priority**: Essential for generating leads and transactions. Public portal visibility is the primary channel for property discovery by potential clients. Without publication control, agents cannot manage their public presence.

**Independent Test**: Can be fully tested by publishing a property to the public portal, verifying it appears in public search, unpublishing it, confirming it's removed from public view, and checking that only published properties are visible to public users. This delivers the value of controlled public property exposure.

**Acceptance Scenarios**:

1. **Given** a property is in "Available" status with required information, **When** an agent publishes it to the public portal, **Then** the property becomes visible to public users, appears in public search results, and can be viewed by unauthenticated visitors
2. **Given** a published property, **When** an agent unpublishes it, **Then** the property is immediately removed from public portal, no longer appears in public search, but remains accessible to tenant agents
3. **Given** a property lacks required information (e.g., missing photos or incomplete address), **When** an agent attempts to publish, **Then** the system prevents publication and lists missing requirements
4. **Given** published properties exist, **When** a public user visits the portal, **Then** they can browse and search published properties without authentication, and see contact options to inquire about properties

---

### User Story 7 - Property-CRM Integration and Matching (Priority: P2)

Agents need to link properties to CRM deals, enable automatic property matching based on deal criteria, and track which properties have been proposed, visited, or selected by clients.

**Why this priority**: Enhances workflow efficiency by connecting properties to client opportunities. While agents can manually match properties, automated matching and CRM integration significantly improve productivity and ensure no suitable properties are overlooked.

**Independent Test**: Can be fully tested by linking a property to a CRM deal, running automatic matching based on deal criteria, viewing matched properties with scores, and tracking property status in the deal context. This delivers the value of integrated property-client matching.

**Acceptance Scenarios**:

1. **Given** a CRM deal exists with criteria (budget, location, size), **When** an agent triggers property matching, **Then** the system returns ranked property matches with scores (0-100) calculated using weighted criteria (budget 30%, location 25%, size/rooms 20%, features 15%, price coherence 10%), and each match shows which criteria are met with exact matches scoring higher than approximate matches
2. **Given** matched properties are displayed, **When** an agent adds properties to the deal shortlist, **Then** properties are linked to the deal, and the agent can view the shortlist in the deal detail view
3. **Given** a property is in a deal's shortlist, **When** an agent updates property status to "Proposed" (sent to client), **Then** the status change is recorded, and the agent can track proposal, visit, and selection status
4. **Given** a property is linked to a deal, **When** an agent views the property detail, **Then** they see associated deals and can navigate to deal details

---

### User Story 8 - Visit Scheduling from Properties (Priority: P2)

Agents need to schedule property visits directly from the property listing, linking visits to contacts and deals, and managing visit calendar to coordinate property viewings.

**Why this priority**: Important operational functionality for managing face-to-face interactions. While not foundational, visit scheduling significantly improves workflow efficiency and ensures property viewings are properly tracked and coordinated.

**Independent Test**: Can be fully tested by scheduling a visit from a property page, assigning it to an agent, linking it to a contact and deal, viewing visits in calendar, and marking visits as completed. This delivers the value of organized visit management.

**Acceptance Scenarios**:

1. **Given** a property exists, **When** an agent schedules a visit with date/time and assigns it to a contact, **Then** the visit is created, linked to the property and contact, and appears in the agent's calendar
2. **Given** a visit is scheduled, **When** an agent links it to a CRM deal, **Then** the visit is associated with both the property and the deal, enabling tracking of property interest
3. **Given** visits are scheduled, **When** an agent views the calendar, **Then** they see all scheduled visits with property, contact, and time information, organized by date
4. **Given** a visit is completed, **When** an agent marks it as done and adds notes, **Then** the visit status updates, notes are recorded, and the activity is logged in CRM

---

### User Story 9 - Property Quality Scoring and Suggestions (Priority: P3)

The system should automatically calculate property listing quality scores based on completeness (required fields, media, geolocation) and provide intelligent suggestions for improving listings (missing fields, description improvements, price coherence).

**Why this priority**: Enhances data quality and listing effectiveness, but is not required for core functionality. Agents can create and manage properties without scoring. This feature improves listing quality over time and helps agents optimize their listings.

**Independent Test**: Can be fully tested by creating properties with varying completeness, verifying quality scores are calculated, checking that suggestions are displayed for incomplete listings, and confirming scores update as properties are improved. This delivers the value of data quality improvement and listing optimization.

**Acceptance Scenarios**:

1. **Given** a property is created with partial information, **When** an agent views the property, **Then** they see a quality score (e.g., 65%) and a list of suggestions for missing required fields or recommended improvements
2. **Given** a property has a low quality score, **When** an agent adds missing photos and completes required fields, **Then** the quality score increases, and suggestions are updated to reflect remaining improvements
3. **Given** a property has a price significantly different from market average, **When** the system detects price anomaly, **Then** a suggestion is displayed recommending price review, with market comparison data if available
4. **Given** properties exist with different quality scores, **When** an agent views the property list, **Then** they can sort or filter by quality score to prioritize improving low-quality listings

---

### User Story 10 - Multi-Lot Property Management (Priority: P3)

The system should support container properties (buildings, new construction programs) with child lots, enabling hierarchical property management where lots inherit some information from parent properties.

**Why this priority**: Advanced feature for managing complex properties like buildings with multiple units or new construction programs. While not required for basic property management, this significantly improves efficiency for developers and property managers handling multiple related units.

**Independent Test**: Can be fully tested by creating a building property, adding child lot properties, verifying inheritance of information, viewing aggregated availability and pricing, and managing individual lot statuses. This delivers the value of efficient multi-unit property management.

**Acceptance Scenarios**:

1. **Given** an agent creates a building property, **When** they add child lot properties (apartments within the building), **Then** child lots can inherit building-level information (address, building features, management), while maintaining individual lot details (floor, size, price)
2. **Given** a building has multiple lots, **When** an agent views the building detail, **Then** they see aggregated information: total lots, available lots, price ranges, and typology distribution
3. **Given** child lots exist, **When** an agent updates building-level information (e.g., building amenities), **Then** child lots can optionally inherit the update, or maintain their own values
4. **Given** a new construction program exists with multiple lots, **When** an agent views the program, **Then** they see all lots with delivery dates, payment schedules, and reservation status

---

### Edge Cases

- **What happens when a property is deleted?** System should prevent deletion if the property has active deals, scheduled visits, or recent transactions. Alternatively, mark as "Archived" to preserve history while removing from active lists. All historical data (visits, deals, transactions) must be preserved.

- **How does the system handle duplicate properties?** System should detect potential duplicates based on address, geolocation, surface area, and owner. When duplicates are detected, agents should be notified and can choose to merge properties or confirm they are distinct. Duplicate detection should consider tenant scope - properties in different tenants are not considered duplicates.

- **What happens when a property owner revokes a management mandate?** When a mandate is revoked, the tenant loses management rights, but historical management data is preserved. The property remains on public portal if it was published, and ownership reverts to the private owner. All historical activities and transactions remain linked to the property.

- **How does the system handle concurrent updates to a property?** System should handle optimistic locking - if two users update a property simultaneously, the second update should either merge changes or notify of conflicts. Critical fields (price, status, availability) should require explicit conflict resolution.

- **What happens when a property's required documents are missing or expired?** System tracks document expiration dates and notifies agents 30 days before expiration. During the 7-day grace period after expiration, properties remain published but are flagged. After the grace period, properties are automatically unpublished if documents are not renewed. Properties with missing required documents cannot be published.

- **How does the system handle geolocation when address is incomplete?** System should allow manual geolocation entry (latitude/longitude) when address parsing fails. Geolocation is required for map display and location-based search. If geolocation cannot be determined, property may be restricted from location-based searches but can still be found by other criteria.

- **What happens when a property type template is updated?** Existing properties should retain their current field values. New fields added to templates should be optional for existing properties. Template changes should only affect new property creation, not existing properties, unless explicitly migrated.

- **How does the system handle property status transitions?** System should allow moving properties forward or backward in workflow, but backward moves should be logged for analysis. Some transitions might require permissions (e.g., marking as Sold might require manager approval). All status transitions are recorded in audit trail.

- **What happens when a public property owner's account is deactivated?** Properties owned by deactivated users should be unpublished from public portal but preserved in system. Tenant administrators should be notified. If a management mandate exists, the managing tenant may be granted temporary management rights.

- **How does the system handle property matching when no properties match exactly?** Matching should return partial matches with lower scores, clearly explaining which criteria match and which don't. Agents should be able to adjust deal criteria based on available properties. Matching should consider fuzzy matching for location and approximate matching for size/price within acceptable ranges.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support creating properties with type-specific templates for at least the following types: Appartement, Maison/Villa, Studio, Duplex/Triplex, Chambre/Colocation, Bureau, Boutique/Local commercial, Entrepôt/Industriel, Terrain, Immeuble, Parking/Box, Lot de programme neuf.

- **FR-002**: System MUST enforce template-based field validation - each property type template defines required vs optional fields, validation rules, default values, and field organization by functional sections.

- **FR-003**: System MUST support property ownership types: TENANT (owned and managed by tenant), PUBLIC (owned by registered private owner, published publicly), and CLIENT (private owner with management mandate to tenant).

- **FR-004**: System MUST allow registered private owners (non-tenants) to create and manage their own property listings on the public portal. Private owners register through a separate public registration flow, receive simplified accounts with limited permissions, and can only manage properties they own.

- **FR-005**: System MUST support management mandates where private owners delegate property management to tenants while retaining ownership. Under a mandate, tenants have full management rights (can edit all fields, change status, publish/unpublish, upload media/documents) but cannot transfer ownership or delete the property.

- **FR-006**: System MUST store common property fields for all types: title, unique internal reference (auto-generated format PROP-{YYYYMMDD}-{tenantId/ownerId prefix}-{sequential}, e.g., PROP-20250127-T001-0001), detailed description, address, location zone, geolocation (latitude/longitude), transaction modes (sale/rental/short-term), price, fees/commissions, surface areas, room counts, furnishing status, workflow status, availability, media (photos/videos/360°), documents (title deeds, mandates, plans, tax documents), and CRM contact links.

- **FR-007**: System MUST support property-specific fields per type (e.g., floor/elevator for apartments, zoning/utilities for land, ceiling height for commercial, delivery dates for new construction).

- **FR-008**: System MUST support property workflow statuses: Draft, Under Review, Available, Reserved, Under Offer, Rented/Sold, Archived.

- **FR-009**: System MUST maintain complete audit trail of all property modifications (who, when, what changed) for compliance and traceability.

- **FR-010**: System MUST allow publishing properties to public portal and controlling publication status (publish/unpublish).

- **FR-011**: System MUST enforce that properties meet minimum requirements (required fields, primary photo, geolocation) before allowing publication to public portal.

- **FR-012**: System MUST provide property search and filtering by type, location, price range, size, features, transaction mode, status, and availability.

- **FR-013**: System MUST support geolocation-based search and map display of properties.

- **FR-014**: System MUST allow uploading and managing multiple photos per property, with ability to set primary image and reorder images.

- **FR-015**: System MUST support video uploads and 360° virtual tour integration for properties.

- **FR-016**: System MUST allow uploading and managing property documents (title deeds, mandates, plans, tax documents) with document type validation and secure storage.

- **FR-017**: System MUST link properties to CRM contacts (owners, agents, interested clients) and deals.

- **FR-018**: System MUST provide property matching functionality that takes deal criteria and returns ranked property matches with scores (0-100) and explanations. Scores MUST be calculated using weighted criteria: budget 30%, location 25%, size/rooms 20%, features 15%, price coherence 10%. Exact matches MUST score higher than approximate matches within each criterion.

- **FR-019**: System MUST allow scheduling property visits directly from property listings, linking visits to contacts and deals.

- **FR-020**: System MUST calculate automatic quality scores for property listings based on completeness (required fields, media, geolocation).

- **FR-021**: System MUST provide intelligent suggestions for improving property listings (missing fields, description improvements, price coherence with market).

- **FR-022**: System MUST support container properties (buildings, programs) with child lots, enabling hierarchical property management with partial information inheritance.

- **FR-023**: System MUST provide aggregated views for container properties showing total lots, availability, price ranges, and typology distribution.

- **FR-024**: System MUST detect potential duplicate properties based on address, geolocation, surface area, and owner, and notify agents for confirmation or merging.

- **FR-025**: System MUST enforce tenant data isolation for tenant-owned properties - properties belong to specific tenants and are visible only within tenant scope.

- **FR-026**: System MUST support public properties visible to all users on public portal, regardless of tenant association.

- **FR-027**: System MUST implement role-based access control (RBAC) for property operations: PROPERTIES_VIEW, PROPERTIES_CREATE, PROPERTIES_EDIT, PROPERTIES_DELETE, PROPERTIES_PUBLISH, PROPERTIES_MATCH, PROPERTIES_VISITS_SCHEDULE.

- **FR-028**: System MUST generate property marketing materials: PDF property sheets, public sharing links, and social media optimized content (WhatsApp, social networks).

- **FR-029**: System MUST track document expiration dates and notify agents 30 days before expiration. System MUST provide a 7-day grace period after expiration during which properties remain published but are flagged. After the grace period, properties with expired documents MUST be automatically unpublished if documents are not renewed. Properties with missing required documents cannot be published.

- **FR-030**: System MUST preserve all historical data (visits, deals, transactions, status changes) when properties are archived or ownership changes.

### Key Entities *(include if feature involves data)*

- **Property**: Represents a real estate asset with type, ownership model, unique internal reference (format: PROP-{YYYYMMDD}-{tenantId/ownerId prefix}-{sequential}), complete address and geolocation, transaction modes (sale/rental), pricing, physical characteristics (size, rooms, features), status, availability, media, documents, and tenant/owner associations. Properties can be tenant-owned, publicly owned by private users, or have management mandates.

- **Property Type Template**: Defines the structure for a property type, including which fields are displayed, required vs optional fields, validation rules, default values, and field organization by functional sections (Building, Equipment, Legal, Charges, Utilities). Templates ensure data consistency and completeness.

- **Property Media**: Represents photos, videos, or 360° virtual tours associated with a property. Includes media type, file reference, display order, and primary image designation. Media is essential for property presentation.

- **Property Document**: Represents legal or reference documents (title deeds, mandates, plans, tax documents) associated with a property. Includes document type, file reference, upload date, expiration date if applicable, and access controls.

- **Property Status History**: Tracks property workflow status changes over time, including status, timestamp, actor who made the change, and optional notes. Enables audit trail and status transition analysis.

- **Property Match**: Represents a property linked to a CRM deal's shortlist with match score (0-100) calculated using weighted criteria (budget 30%, location 25%, size/rooms 20%, features 15%, price coherence 10%), match explanation (which criteria are met, with exact matches scoring higher than approximate), and status (SHORTLISTED, PROPOSED, VISITED, REJECTED, SELECTED). Connects properties to client opportunities.

- **Property Visit**: Represents a scheduled property viewing linked to a property, contact, and optionally a deal. Includes date/time, assigned agent, status (SCHEDULED, CONFIRMED, DONE, NO_SHOW, CANCELED), and notes. Enables visit coordination and tracking.

- **Property Container**: Represents a parent property (building, program) that contains child lot properties. Container properties have aggregated information (total lots, availability, price ranges) and child lots can inherit some container-level information.

- **Property Quality Score**: Represents an automatically calculated completeness and quality metric for a property listing, based on required fields completion, media presence, geolocation accuracy, and other quality factors. Includes score (0-100) and improvement suggestions.

- **Management Mandate**: Represents a delegation of property management from a private owner to a tenant. Includes mandate start/end dates, scope of management rights (full management: edit all fields, change status, publish/unpublish, upload media/documents, but cannot transfer ownership or delete), and links to property and tenant. Owner retains legal ownership while tenant manages the listing operationally.

### Assumptions

- CRM module (contacts, deals, activities) already exists and is accessible for property-CRM integration and matching functionality.

- User authentication and tenant management systems are in place to support property ownership models and access controls. A separate public registration flow exists for private property owners with simplified account creation and limited permissions.

- File storage system exists for media and document uploads - property module uses existing storage infrastructure.

- Public portal infrastructure exists for displaying published properties to unauthenticated users.

- Geolocation services (address geocoding, reverse geocoding, map display) are available or will be integrated - property module requires geolocation but implementation details are out of scope.

- Multi-language support for property descriptions is handled at application level - property module follows existing language patterns.

- Email/SMS notifications for property inquiries, visit confirmations, and status changes are optional and can be configured per tenant - not required for MVP functionality.

- AI-powered price analysis and market coherence suggestions are future enhancements (V2) - MVP includes basic price suggestion based on simple market comparison if data is available.

- Advanced analytics and reporting (property performance, conversion rates, market trends) are out of scope for MVP - basic property management and search are the focus.

- Integration with external property portals (listing syndication) is out of scope for initial implementation.

- Payment processing for property transactions is out of scope - property module manages listings and matching, not financial transactions.

- Property import from external systems (CSV, other platforms) is out of scope for initial implementation.

- Calendar integration (Google Calendar, Outlook) for visit scheduling is out of scope for MVP - basic visit scheduling within the system is sufficient.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Agents can create a new property with type-specific template and view it in their property list within 15 seconds of creation, with all entered data correctly stored and displayed.

- **SC-002**: Agents can publish a property to the public portal and it becomes visible to public users within 5 seconds of publication, appearing in public search results immediately.

- **SC-003**: Property search with multiple filters (type, location, price, size) returns results within 3 seconds for tenant organizations with up to 10,000 properties, with results accurately matching all specified criteria.

- **SC-004**: Property matching for a CRM deal with criteria returns ranked results (top 20 matches) within 5 seconds, with each match showing score (0-100) and clear explanation of matched criteria.

- **SC-005**: 100% of tenant-owned property data queries enforce tenant isolation - zero instances of cross-tenant property access in testing and production.

- **SC-006**: Agents can upload multiple photos to a property, set primary image, and reorder images, with upload completing within 10 seconds per photo and changes reflected immediately in property views.

- **SC-007**: Property quality scores are calculated automatically within 2 seconds of property creation or update, with suggestions displayed immediately for incomplete listings.

- **SC-008**: Agents can schedule a property visit from the property page, link it to a contact and deal, and view it in calendar view within 5 seconds of scheduling.

- **SC-009**: Public users can search and browse published properties on the public portal without authentication, with search results loading within 3 seconds and property detail pages displaying all information and media within 5 seconds.

- **SC-010**: Property workflow status transitions (draft → under review → available → reserved → sold) complete within 2 seconds, with status changes immediately reflected in property lists and detail views.

- **SC-011**: System detects potential duplicate properties based on address and geolocation within 5 seconds of property creation, notifying agents for confirmation when duplicates are suspected.

- **SC-012**: Container properties (buildings, programs) display aggregated information (total lots, availability, price ranges) calculated within 3 seconds, with child lot information correctly inherited and displayed.

- **SC-013**: Property documents are validated and stored securely, with document type validation completing within 1 second and documents accessible to authorized users within 2 seconds of upload.

- **SC-014**: Agents with appropriate permissions can create, edit, publish, and manage properties, with 100% of operations respecting RBAC permission checks and tenant isolation.

- **SC-015**: System supports concurrent access by multiple agents managing properties within the same tenant without data corruption or lost updates (using appropriate concurrency control mechanisms).

