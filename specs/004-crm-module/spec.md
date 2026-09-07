# Feature Specification: CRM & Client Relationship Management

**Feature Branch**: `004-crm-module`  
**Created**: 2025-01-27  
**Status**: Draft  
**Input**: User description: "CRM & Relation Client (Prospects/Clients + Interactions + Matching + IA) - Multi-tenant CRM system for real estate agents with contact management, pipeline deals, activity tracking, property matching, and AI recommendations"

## Clarifications

### Session 2025-01-27

- Q: What should happen when a new contact is created with an email or phone number that already exists in the same tenant? → A: Enforce unique email within tenant; prevent creating contact if email already exists
- Q: When creating a contact, which fields are required, and how should validation errors be presented to users? → A: First name AND last name required; email required; phone optional; validation errors shown inline with field-level messages
- Q: What CRM operations should be logged in an audit trail, and what information should each audit log entry contain? → A: Log all create/update/delete operations on contacts, deals, and activities with actor, timestamp, entity type, entity ID, and changed fields (field name + new value)
- Q: The dashboard mentions "hot leads" as a KPI. How should the system determine which leads are "hot"? → A: Lead with at least one deal in stages QUALIFIED, APPOINTMENT, VISIT, or NEGOTIATION

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Contact and Lead Management (Priority: P1)

Real estate agents need to centralize and manage their prospects and clients within their tenant organization. They can create contacts, track their status (lead vs client), assign contacts to team members, and view contact details including interactions history.

**Why this priority**: This is the foundation of CRM functionality. Without contact management, agents cannot organize their client base or track relationships. It provides immediate value by replacing manual spreadsheets or external tools.

**Independent Test**: Can be fully tested by creating contacts, viewing contact lists, filtering by status/source/assigned agent, updating contact information, and verifying tenant isolation. This delivers the value of centralized contact management within a multi-tenant system.

**Acceptance Scenarios**:

1. **Given** an agent in Tenant A, **When** they create a new contact with first name, last name, and email (phone optional), **Then** the contact is saved and visible only within Tenant A, and the contact is marked as a "lead" by default. If required fields (first name, last name, email) are missing, **Then** validation errors are displayed inline at each field.
2. **Given** a contact exists, **When** an agent updates the contact's assigned agent, **Then** the contact is visible to the newly assigned agent in their contact list, and previous assignments are preserved in history
3. **Given** multiple contacts exist with different sources, **When** an agent filters contacts by source (e.g., "website", "referral"), **Then** only contacts matching that source are displayed
4. **Given** a contact has multiple roles over time, **When** an agent views the contact profile, **Then** they see all current and historical roles (Prospect → Acquéreur → Propriétaire), with clear active/inactive status

---

### User Story 2 - Pipeline Deal Management (Priority: P1)

Real estate agents need to organize deals (opportunities) through a sales pipeline, tracking deals from initial contact through to closing (won/lost). Agents can create deals linked to contacts, update deal stages, set budgets and criteria, and view deals in a Kanban board or list view.

**Why this priority**: Core revenue tracking functionality. The pipeline enables agents to forecast deals, prioritize work, and manage the sales process from qualification to closing. Without this, agents cannot effectively manage their active opportunities.

**Independent Test**: Can be fully tested by creating deals, moving deals through pipeline stages, filtering deals by type/stage/assigned agent, updating deal criteria and budget, and marking deals as won/lost. This delivers the value of organized opportunity management and sales forecasting.

**Acceptance Scenarios**:

1. **Given** a contact exists, **When** an agent creates a new deal linked to that contact with type (ACHAT or LOCATION), budget range, and location zone, **Then** the deal is created in "NEW" stage, visible in the pipeline, and associated with the contact
2. **Given** a deal exists in "QUALIFIED" stage, **When** an agent updates the deal stage to "APPOINTMENT", **Then** the stage change is recorded, the deal moves to the appointment column in Kanban view, and the last update timestamp is refreshed
3. **Given** multiple deals exist with different stages, **When** an agent filters deals by stage "NEGOTIATION", **Then** only deals in negotiation stage are displayed
4. **Given** a deal in "VISIT" stage, **When** an agent marks the deal as "WON" with a closing reason, **Then** the deal moves to closed deals, the close date is recorded, and the linked contact's status can be updated to active client

---

### User Story 3 - Activity Tracking and Interaction History (Priority: P1)

Agents need to track all interactions with contacts and deals (calls, emails, SMS/WhatsApp, visits, meetings, notes) so they have a complete history of communications and can follow up appropriately.

**Why this priority**: Essential for maintaining relationship continuity. Without activity tracking, agents lose context of previous conversations, cannot track follow-up tasks, and risk missing important interactions. This is critical for customer service and deal progression.

**Independent Test**: Can be fully tested by creating activities (calls, emails, notes) linked to contacts or deals, viewing activity timelines, filtering activities by type/date, and verifying that activities are immutable once created. This delivers the value of comprehensive interaction history and accountability.

**Acceptance Scenarios**:

1. **Given** a contact exists, **When** an agent logs a call activity with outcome "interested" and sets a next action "follow up in 3 days", **Then** the activity is recorded with timestamp, creator, and outcome, and a follow-up task is created
2. **Given** a deal exists, **When** an agent logs an email activity sent to the contact, **Then** the email is recorded with subject, content, direction "OUT", and linked to both the deal and contact
3. **Given** activities exist for a contact, **When** an agent views the contact's activity timeline, **Then** they see all activities in chronological order with type, date, outcome, and creator information
4. **Given** an activity with a next action date, **When** that date arrives, **Then** the agent sees a reminder/task to perform the next action

---

### User Story 4 - Appointment and Visit Management (Priority: P2)

Agents need to schedule and manage appointments and property visits, including scheduling, confirmation, tracking attendance, and linking visits to deals.

**Why this priority**: Important operational functionality for managing face-to-face interactions and property viewings. While not foundational like contacts and deals, it significantly improves workflow efficiency and ensures visits are properly tracked and followed up.

**Independent Test**: Can be fully tested by creating appointments/visits, assigning them to agents, confirming/canceling appointments, marking visits as completed/no-show, and viewing appointments in calendar view. This delivers the value of organized scheduling and visit tracking.

**Acceptance Scenarios**:

1. **Given** a deal exists, **When** an agent schedules a property visit with date/time, location, and assigned agent, **Then** the appointment is created with status "SCHEDULED", linked to the deal and contact, and visible in the agent's calendar
2. **Given** a scheduled visit, **When** the agent confirms the visit with the contact, **Then** the appointment status updates to "CONFIRMED", and both agent and contact receive optional notifications
3. **Given** a visit appointment, **When** the visit is completed, **Then** the agent marks it as "DONE", can add notes about the visit, and the visit activity is automatically recorded in the activity timeline
4. **Given** appointments exist for today, **When** an agent views the dashboard, **Then** they see upcoming appointments for the day with contact and deal information

---

### User Story 5 - Property Matching for Deals (Priority: P2)

Agents need to match properties from their portfolio to deals based on deal criteria (budget, location, size, features). The system should provide ranked property matches with scores and explanations, allowing agents to propose properties to clients.

**Why this priority**: Value-added functionality that accelerates the matching process and helps agents identify suitable properties faster. While agents can manually match properties, automated matching significantly improves efficiency and ensures no suitable properties are overlooked.

**Independent Test**: Can be fully tested by running matching on a deal with criteria, viewing ranked property matches with scores, adding matched properties to deal shortlist, updating property status (proposed, visited, selected, rejected). This delivers the value of intelligent property matching and time savings.

**Acceptance Scenarios**:

1. **Given** a deal exists with criteria (budget €200k-300k, 3 bedrooms, Paris area), **When** an agent triggers property matching, **Then** the system returns a ranked list of available properties matching the criteria, each with a match score (0-100) and explanation of matched criteria
2. **Given** matched properties are displayed, **When** an agent selects properties to add to the deal's shortlist, **Then** those properties are linked to the deal with status "SHORTLISTED", and the agent can view the shortlist in the deal detail view
3. **Given** a property is in a deal's shortlist, **When** an agent updates the property status to "PROPOSED" (sent to client), **Then** the status change is recorded, and the agent can track which properties have been proposed vs visited vs selected
4. **Given** a deal has multiple properties in shortlist, **When** the client selects a property, **Then** the agent marks it as "SELECTED", and other properties can be marked as "REJECTED" or remain in shortlist

---

### User Story 6 - Lead to Client Conversion (Priority: P2)

Agents need to convert prospects (leads) into active clients by assigning business roles (Propriétaire, Locataire, Copropriétaire, Acquéreur). The system should preserve the contact's history while updating their status and roles.

**Why this priority**: Supports the business process of relationship evolution. While not strictly required for MVP, conversion tracking is important for understanding the sales funnel and maintaining accurate client status. It enables proper categorization and reporting.

**Independent Test**: Can be fully tested by converting a lead contact to client with a role, verifying the contact status changes, confirming historical activities are preserved, and verifying the contact appears in client lists. This delivers the value of proper lead lifecycle management.

**Acceptance Scenarios**:

1. **Given** a contact exists with status "lead", **When** an agent converts the contact to client with role "ACQUEREUR", **Then** the contact status updates to "active_client", the role is activated, and all previous activities and deals remain linked to the contact
2. **Given** a contact has role "ACQUEREUR" active, **When** they complete a purchase and become a property owner, **Then** the agent can add a new role "PROPRIETAIRE" with start date, and both roles can be active simultaneously
3. **Given** a contact was converted to client, **When** an agent views the contact profile, **Then** they see the conversion date, current active roles, and can view historical role changes with start/end dates

---

### User Story 7 - CRM Dashboard and KPIs (Priority: P3)

Agents and managers need a dashboard view showing key performance indicators (new leads, hot leads, upcoming appointments, deals in negotiation) and "next best actions" (overdue follow-ups, visits to confirm) to prioritize daily work.

**Why this priority**: Enhances productivity and provides visibility, but is not required for core functionality. Agents can access contacts, deals, and activities directly. The dashboard aggregates information for efficiency but is a "nice to have" rather than essential.

**Independent Test**: Can be fully tested by viewing the dashboard, verifying KPI counts are accurate, checking that "next actions" reflect actual due tasks and appointments, and confirming that data is scoped to the current tenant. This delivers the value of at-a-glance visibility and task prioritization.

**Acceptance Scenarios**:

1. **Given** the CRM system has contacts, deals, and activities, **When** an agent views the CRM dashboard, **Then** they see KPIs for new leads (last 7 days), hot leads (contacts with status "lead" having at least one deal in QUALIFIED/APPOINTMENT/VISIT/NEGOTIATION stages), upcoming appointments (next 7 days), and deals in negotiation stage
2. **Given** activities exist with next action dates in the past, **When** an agent views the dashboard, **Then** they see a "Next Best Actions" section listing overdue follow-ups with contact and deal information
3. **Given** appointments exist for tomorrow, **When** an agent views the dashboard, **Then** they see upcoming appointments requiring confirmation, with links to confirm or reschedule

---

### Edge Cases

- **What happens when a contact is deleted?** System should prevent deletion if the contact has active deals or recent activities. Alternatively, mark as "archived" to preserve history while removing from active lists.

- **How does the system handle duplicate contacts?** System enforces unique email addresses within each tenant - creation of a contact with an existing email is prevented with an error. Phone numbers are not unique-constrained. If duplicate contacts exist (e.g., from data migration), agents can manually merge them, combining activities, deals, and roles while preserving all historical data.

- **What happens when a deal budget doesn't match any available properties?** Matching should still return properties closest to criteria, even if outside budget range, clearly indicating why they don't match perfectly. Agent can manually adjust criteria and re-match.

- **How does the system handle concurrent updates to a deal?** System should handle optimistic locking - if two users update a deal simultaneously, the second update should either merge changes or notify of conflicts.

- **What happens when an assigned agent leaves the tenant organization?** Contacts and deals assigned to that agent should be automatically reassigned to a manager or unassigned, with notification to tenant admin. All reassignment operations are recorded in the audit trail with the system or admin user as the actor.

- **How does the system handle property matching when no properties match exactly?** System should return partial matches with lower scores, clearly explaining which criteria match and which don't. Agent should be able to adjust deal criteria based on available properties.

- **What happens when a contact has conflicting roles?** System should allow multiple active roles (e.g., someone can be both Propriétaire and Locataire simultaneously - owning one property while renting another). Roles are additive, not exclusive.

- **How does the system handle tenant data isolation?** All CRM data queries MUST include tenant_id filter. Attempting to access CRM data from another tenant should return empty results or 403 Forbidden. No cross-tenant data leakage under any circumstances.

- **What happens when an activity's next action date is in the past?** System should clearly mark overdue actions in dashboard and activity lists. Agents should be able to reschedule or mark as completed.

- **How does the system handle deal stage transitions?** System should allow moving deals forward or backward in pipeline, but backward moves should be logged for analysis. All stage transitions are recorded in the audit trail with the actor, timestamp, previous stage, and new stage. Some transitions might require permissions (e.g., marking as WON might require manager approval).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow agents to create and manage contacts (prospects and clients) within their tenant organization.

- **FR-001a**: System MUST enforce unique email addresses within each tenant - if a contact with the same email already exists in the tenant, system MUST prevent duplicate creation and return an appropriate error.

- **FR-001b**: System MUST require first name, last name, and email address when creating a contact. Phone number is optional. Validation errors MUST be displayed inline at the field level with clear error messages.

- **FR-002**: System MUST enforce strict tenant data isolation - all CRM data MUST be scoped to the tenant context, and cross-tenant access MUST be prevented.

- **FR-003**: System MUST support contact status: lead (prospect), active_client, and archived.

- **FR-004**: System MUST allow contacts to have multiple business roles (Propriétaire, Locataire, Copropriétaire, Acquéreur) that can be active simultaneously or over time.

- **FR-005**: System MUST allow contacts to be assigned to specific agents within the tenant.

- **FR-006**: System MUST track contact source (referral, website, call, social media, walk-in, etc.) for analytics.

- **FR-007**: System MUST support creating deals (opportunities) linked to contacts with type ACHAT or LOCATION.

- **FR-008**: System MUST support deal pipeline stages: NEW, QUALIFIED, APPOINTMENT, VISIT, NEGOTIATION, WON, LOST.

- **FR-009**: System MUST allow deals to have budget range (min/max), location zone, and search criteria (rooms, surface, furnishing, etc.).

- **FR-010**: System MUST allow deals to be assigned to specific agents.

- **FR-011**: System MUST record all activities (calls, emails, SMS/WhatsApp, visits, meetings, notes, tasks) linked to contacts and/or deals.

- **FR-012**: System MUST track activity direction (IN, OUT, INTERNAL) for communications.

- **FR-013**: System MUST allow activities to have outcomes and next action dates for follow-up tracking.

- **FR-014**: System MUST support scheduling appointments and visits with date/time, location, and assigned agent.

- **FR-015**: System MUST support appointment status: SCHEDULED, CONFIRMED, DONE, NO_SHOW, CANCELED.

- **FR-016**: System MUST provide property matching functionality that takes deal criteria and returns ranked property matches with scores (0-100) and explanations.

- **FR-017**: System MUST allow matched properties to be added to deal shortlists with status tracking (SHORTLISTED, PROPOSED, VISITED, REJECTED, SELECTED).

- **FR-018**: System MUST allow converting a lead contact to active client by assigning business roles.

- **FR-019**: System MUST preserve all contact history (activities, deals, roles) when converting lead to client - no data duplication.

- **FR-020**: System MUST maintain immutable activity history - activities cannot be deleted, only new activities can be added to correct errors.

- **FR-021**: System MUST support filtering and searching contacts by status, source, assigned agent, tags, and last interaction date.

- **FR-022**: System MUST support filtering and searching deals by type, stage, assigned agent, budget range, and creation date.

- **FR-023**: System MUST support Kanban board view for deals organized by pipeline stage.

- **FR-024**: System MUST provide dashboard view showing KPIs (new leads, hot leads, upcoming appointments, deals in negotiation). A "hot lead" is defined as a contact with status "lead" that has at least one deal in stages QUALIFIED, APPOINTMENT, VISIT, or NEGOTIATION.

- **FR-025**: System MUST display "next best actions" on dashboard (overdue follow-ups, appointments requiring confirmation).

- **FR-026**: System MUST implement role-based access control (RBAC) for CRM features: CRM_CONTACTS_VIEW, CRM_CONTACTS_CREATE, CRM_CONTACTS_EDIT, CRM_CONTACTS_ARCHIVE, CRM_DEALS_VIEW, CRM_DEALS_CREATE, CRM_DEALS_EDIT, CRM_DEALS_STAGE_CHANGE, CRM_ACTIVITIES_VIEW, CRM_ACTIVITIES_CREATE, CRM_APPOINTMENTS_VIEW, CRM_APPOINTMENTS_CREATE, CRM_APPOINTMENTS_EDIT, CRM_MATCHING_RUN, CRM_MATCHING_VIEW.

- **FR-027**: System MUST support contact tagging for categorization and filtering.

- **FR-028**: System MUST track last interaction date for contacts to enable sorting and filtering by recency.

- **FR-029**: System MUST allow notes to be added to contacts, deals, or properties for internal documentation.

- **FR-030**: System MUST maintain an audit trail logging all create, update, and delete operations on contacts, deals, and activities. Each audit log entry MUST contain: actor (user who performed the operation), timestamp, operation type (create/update/delete), entity type (contact/deal/activity), entity ID, and changed fields (field name + new value for updates).

### Key Entities *(include if feature involves data)*

- **Contact**: Represents a person (prospect or client) with identity information (first name and last name required, email required, phone optional), status (lead/active_client/archived), source, assigned agent, and tenant association. A contact can have multiple business roles over time.

- **Contact Role**: Represents a business role assigned to a contact (Propriétaire, Locataire, Copropriétaire, Acquéreur) with active status, start/end dates, and optional metadata. Multiple roles can be active simultaneously.

- **Deal (Opportunity)**: Represents a sales opportunity linked to a contact, with type (ACHAT/LOCATION), pipeline stage, budget range, location criteria, search criteria, expected value, probability, and assigned agent. Tracks progress from initial contact to closing.

- **Activity**: Represents an interaction or action (call, email, SMS/WhatsApp, visit, meeting, note, task) linked to a contact and/or deal. Includes type, direction (IN/OUT/INTERNAL), content, outcome, timestamp, creator, and optional next action date.

- **Appointment**: Represents a scheduled meeting or property visit with type (RDV/VISITE), date/time range, location, status (SCHEDULED/CONFIRMED/DONE/NO_SHOW/CANCELED), linked to contact and optionally to a deal, with assigned agent.

- **Deal Property Match**: Represents a property linked to a deal's shortlist with match score, match explanation, and status (SHORTLISTED/PROPOSED/VISITED/REJECTED/SELECTED). Connects deals to available properties in the system.

- **Tag**: Represents a label for categorizing contacts, enabling filtering and organization. Tags are scoped to tenant.

- **Note**: Represents internal documentation attached to contacts, deals, or properties with content and creator information.

### Assumptions

- Property data (properties/listings) already exists in the system and is accessible for matching functionality.

- Email notifications for appointments are optional and can be configured per tenant - not required for MVP functionality.

- AI recommendations (lead scoring, next best action suggestions, enhanced matching) are future enhancements (V2) and not included in initial implementation - only deterministic matching (V1) is required.

- WhatsApp/SMS integration for activity logging may require external service integration - basic activity logging is sufficient for MVP, full integration is out of scope.

- Multi-language support is handled at application level - CRM module follows existing language patterns.

- Contact data import from external systems (CSV, other CRM tools) is out of scope for initial implementation.

- Analytics and reporting beyond basic KPIs (detailed reports, charts, exports) are out of scope for MVP.

- Integration with calendar systems (Google Calendar, Outlook) for appointments is out of scope for MVP.

- Automated activity logging (e.g., logging emails automatically from email provider) is out of scope - activities are manually logged by agents.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Agents can create a new contact and view it in their contact list within 10 seconds of creation.

- **SC-002**: Agents can create a deal linked to a contact and move it through pipeline stages (NEW → QUALIFIED → APPOINTMENT → VISIT → NEGOTIATION) with each stage transition completing in under 3 seconds.

- **SC-003**: Agents can log an activity (call, email, note) and view it in the contact's activity timeline within 5 seconds of logging.

- **SC-004**: Property matching for a deal with criteria returns ranked results (top 10 matches) within 5 seconds, with each match showing score and explanation.

- **SC-005**: 100% of CRM data queries enforce tenant isolation - zero instances of cross-tenant data access in testing and production.

- **SC-006**: Agents can filter contacts by status, source, and assigned agent, with filtered results displayed within 2 seconds for tenant organizations with up to 10,000 contacts.

- **SC-007**: Dashboard KPIs (new leads, upcoming appointments, deals in negotiation) load within 3 seconds and display accurate counts based on current tenant data.

- **SC-008**: Lead to client conversion preserves 100% of historical data (all activities, deals, previous roles remain linked and visible after conversion).

- **SC-009**: Agents with appropriate permissions can create, edit, and manage deals, with 100% of operations respecting RBAC permission checks.

- **SC-010**: System supports concurrent access by multiple agents within the same tenant without data corruption or lost updates (using appropriate concurrency control mechanisms).
