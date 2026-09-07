# Feature Specification: Maintenance & Rental Incidents Module

**Feature Branch**: `007-maintenance-incidents`  
**Created**: 2025-01-28  
**Status**: Draft  
**Input**: User description: "PROMPT CURSOR — AJOUT MODULE 'MAINTENANCE & INCIDENTS LOCATIFS' (ImmoTopia) - Complete maintenance and incident management system for rental properties, allowing tenants to report maintenance issues, property managers to track and assign tickets to vendors, and maintain complete history of interventions per property"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tenant Incident Reporting (Priority: P1)

Tenants need to report maintenance issues and incidents affecting their rental property. They can create incident tickets with details (category, description, location in property, priority), attach photos or documents, add comments for updates, and track the status of their reported issues through resolution.

**Why this priority**: This is the foundation of maintenance management. Without incident reporting, tenants cannot communicate property issues, and property managers cannot track or address maintenance needs. It provides immediate value by replacing phone calls and emails with structured incident tracking, enabling faster response times and better record-keeping.

**Independent Test**: Can be fully tested by allowing tenants to create incident tickets with categories (plumbing, electricity, air conditioning, other), descriptions, priorities, photos, and comments. Tenants can view their ticket list, filter by status, and see ticket details with timeline. This delivers the value of structured incident communication and tenant self-service.

**Acceptance Scenarios**:

1. **Given** a tenant is logged in and has an active lease, **When** they create a new incident ticket with category (plumbing/electricity/air conditioning/other), title, description, location in property (e.g., "Bathroom"), and priority (low/medium/high/urgent), **Then** the ticket is created with status DECLARED, linked to their lease and property, and visible only to them and property managers. If required fields (category, title, description) are missing, **Then** validation errors are displayed.
2. **Given** a ticket exists in DECLARED status, **When** a tenant uploads photos or documents (up to 10 files), **Then** the files are attached to the ticket, stored securely, and visible in the ticket's attachments section. If file size exceeds limit or file type is not supported, **Then** validation errors are displayed.
3. **Given** a ticket exists, **When** a tenant adds a comment to the ticket, **Then** the comment is added to the ticket's comment thread, timestamped, and marked as from the tenant. Property managers can see the comment and respond.
4. **Given** multiple tickets exist for a tenant, **When** they view their ticket list, **Then** they see all their tickets with status badges (declared, in progress, assigned, resolved, canceled), sorted by most recent first, and can filter by status or property.
5. **Given** a ticket exists in DECLARED status, **When** a tenant cancels the ticket (e.g., issue resolved itself), **Then** the ticket status changes to CANCELED, and property managers are notified of the cancellation.

---

### User Story 2 - Property Manager Ticket Management (Priority: P1)

Property managers need to view, filter, and manage all maintenance tickets for their properties. They can see tickets from all tenants, filter by property, status, priority, date, or assigned vendor, update ticket status through the workflow (declared → in progress → assigned → resolved), assign vendors to tickets, and add resolution notes.

**Why this priority**: Essential for operational management. Property managers must track all maintenance issues, prioritize urgent problems, assign work to vendors, and ensure timely resolution. Without this, property managers cannot coordinate maintenance work, track vendor performance, or ensure tenant satisfaction.

**Independent Test**: Can be fully tested by allowing property managers to view all tickets, filter by property/status/priority/vendor, update ticket status through workflow states, assign vendors, add resolution notes, and view ticket history. This delivers the value of centralized maintenance coordination and tracking.

**Acceptance Scenarios**:

1. **Given** multiple tickets exist across different properties, **When** a property manager views the ticket list, **Then** they see all tickets with filters for property, status (declared/in progress/assigned/resolved/canceled), priority (low/medium/high/urgent), date range, and assigned vendor. Tickets are sorted by most recent first, and urgent tickets are highlighted.
2. **Given** a ticket exists in DECLARED status, **When** a property manager changes the status to IN_PROGRESS, **Then** the status updates, the in_progress_at timestamp is recorded, a status history entry is created, and the tenant is notified of the status change.
3. **Given** a ticket exists in IN_PROGRESS status, **When** a property manager assigns a vendor to the ticket, **Then** the ticket status changes to ASSIGNED, the assigned_at timestamp is recorded, the vendor is linked to the ticket, a status history entry is created, and the tenant is notified that a vendor has been assigned.
4. **Given** a ticket exists in ASSIGNED status, **When** a property manager marks the ticket as RESOLVED and adds resolution notes (optional), **Then** the ticket status changes to RESOLVED, the resolved_at timestamp is recorded, resolution notes are saved, a status history entry is created, and the tenant is notified that the issue is resolved.
5. **Given** a ticket exists, **When** a property manager adds a comment or note, **Then** the comment is added to the ticket's comment thread, marked as from the manager, timestamped, and visible to both the tenant and other property managers.

---

### User Story 3 - Maintenance History by Property (Priority: P2)

Property managers need to view the complete maintenance history for each property to understand recurring issues, track intervention costs, and make informed decisions about property maintenance and improvements.

**Why this priority**: Important for property management and decision-making. Maintenance history helps property managers identify patterns (e.g., recurring plumbing issues), assess property condition, plan preventive maintenance, and make informed decisions about property improvements or vendor selection. While not foundational like ticket creation and management, it significantly improves property oversight and strategic planning.

**Independent Test**: Can be fully tested by viewing a property's detail page, accessing the maintenance history tab, and seeing all tickets linked to that property sorted by date, with status, category, priority, assigned vendor, and resolution details. This delivers the value of comprehensive property maintenance tracking and historical analysis.

**Acceptance Scenarios**:

1. **Given** a property exists with multiple maintenance tickets (some resolved, some in progress), **When** a property manager views the property detail page and opens the "Maintenance" tab, **Then** they see all tickets linked to that property, sorted by most recent first, with ticket details (category, status, priority, dates, vendor, resolution notes).
2. **Given** a property has tickets with different statuses, **When** a property manager filters the maintenance history by status (e.g., "RESOLVED"), **Then** only resolved tickets are displayed, allowing them to see completed interventions.
3. **Given** a property has tickets across different categories, **When** a property manager views the maintenance history, **Then** they can see patterns (e.g., multiple plumbing issues in the same location) and make informed decisions about property improvements or preventive maintenance.

---

### User Story 4 - Vendor Management (Priority: P2)

Property managers need to manage a list of maintenance vendors (contractors, service providers) that can be assigned to tickets. They can create, view, update, and deactivate vendors with contact information and specialties.

**Why this priority**: Important for operational efficiency. Vendor management enables property managers to maintain a directory of trusted service providers, assign appropriate vendors based on ticket category, and track which vendors handle which types of work. While not foundational like ticket management, it streamlines the assignment process and improves vendor relationship management.

**Independent Test**: Can be fully tested by allowing property managers to create vendors with name, contact information (phone, email, address), specialties (e.g., plumbing, electrical), and active status. Property managers can view vendor list, update vendor information, deactivate vendors, and assign vendors to tickets. This delivers the value of organized vendor directory and streamlined ticket assignment.

**Acceptance Scenarios**:

1. **Given** a property manager needs to add a new vendor, **When** they create a vendor with name, phone (optional), email (optional), address (optional), and specialties (optional list), **Then** the vendor is created, marked as active, and available for assignment to tickets.
2. **Given** multiple vendors exist, **When** a property manager views the vendor list, **Then** they see all active vendors with contact information and specialties, and can filter or search by name or specialty.
3. **Given** a vendor exists, **When** a property manager updates vendor information (e.g., phone number, specialties), **Then** the vendor information is updated, and the changes are reflected in future ticket assignments.
4. **Given** a vendor exists but is no longer used, **When** a property manager deactivates the vendor, **Then** the vendor is marked as inactive, no longer appears in active vendor lists, but remains in historical records for tickets that were previously assigned to them.

---

### Edge Cases

- What happens when a tenant reports an incident for a property they don't have an active lease for? → System should validate that the tenant has an active lease for the property and reject the ticket creation if no active lease exists.
- How does the system handle ticket status changes when a vendor is not assigned? → System should allow status progression from DECLARED to IN_PROGRESS without vendor assignment, but require vendor assignment before moving to ASSIGNED status.
- What happens when a tenant uploads more than 10 files to a ticket? → System should reject additional file uploads and display an error message indicating the maximum file limit.
- How does the system handle file uploads that exceed size limits? → System should reject oversized files and display an error message with the maximum allowed file size.
- What happens when a property manager tries to assign an inactive vendor to a ticket? → System should prevent assignment of inactive vendors and display a warning, requiring selection of an active vendor.
- How does the system handle ticket cancellation after work has started? → System should allow cancellation of tickets in DECLARED or IN_PROGRESS status, but prevent cancellation of tickets that are already ASSIGNED or RESOLVED (or require special permission).
- What happens when a tenant tries to view tickets from another tenant's lease? → System should enforce tenant isolation and only show tickets for leases associated with the logged-in tenant's account.
- How does the system handle notifications when email delivery fails? → System should log notification failures but not block ticket status updates; notifications are informational, not required for workflow progression.
- What happens when a property manager assigns a vendor but the vendor contact information is missing? → System should allow vendor assignment even if contact information is incomplete, but warn property managers that incomplete vendor information may delay communication.
- How does the system handle maintenance history for properties with no tickets? → System should display an empty state message indicating no maintenance history, rather than showing an error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow tenants to create maintenance incident tickets with category (plumbing, electricity, air conditioning, other), title, description, location in property, and priority (low, medium, high, urgent).
- **FR-002**: System MUST validate that tenants can only create tickets for properties where they have an active lease.
- **FR-003**: System MUST support ticket status workflow: DECLARED → IN_PROGRESS → ASSIGNED → RESOLVED, with optional CANCELED status for tickets not yet in progress or assigned.
- **FR-004**: System MUST allow tenants to upload photos or documents (up to 10 files per ticket) and attach them to tickets.
- **FR-005**: System MUST enforce file size limits and file type restrictions (images and PDFs) for ticket attachments.
- **FR-006**: System MUST allow tenants to add comments to their tickets, creating a comment thread visible to both tenant and property managers.
- **FR-007**: System MUST allow tenants to view their ticket list, filter by status or property, and see ticket details with status, timeline, comments, and attachments.
- **FR-008**: System MUST allow tenants to cancel tickets in DECLARED status (and optionally IN_PROGRESS status if not yet assigned).
- **FR-009**: System MUST allow property managers to view all tickets for their tenant organization, with filters for property, status, priority, date range, and assigned vendor.
- **FR-010**: System MUST allow property managers to update ticket status through the workflow (DECLARED → IN_PROGRESS → ASSIGNED → RESOLVED), with automatic timestamp recording (in_progress_at, assigned_at, resolved_at).
- **FR-011**: System MUST require vendor assignment (or internal user assignment) before a ticket can move to ASSIGNED status.
- **FR-012**: System MUST allow property managers to add resolution notes when marking a ticket as RESOLVED (resolution notes are optional but recommended).
- **FR-013**: System MUST track complete status history for each ticket, recording status changes with timestamps, user who made the change, and optional notes.
- **FR-014**: System MUST notify tenants via email when ticket status changes (declared → in progress, in progress → assigned, assigned → resolved, or any cancellation).
- **FR-015**: System MUST notify property managers via email (or in-app notification if notification system exists) when a new ticket is created.
- **FR-016**: System MUST allow property managers to add comments to tickets, visible to tenants and other property managers.
- **FR-017**: System MUST allow property managers to view maintenance history for each property, showing all tickets linked to that property sorted by date.
- **FR-018**: System MUST allow property managers to filter property maintenance history by status, category, or date range.
- **FR-019**: System MUST allow property managers to create, view, update, and deactivate maintenance vendors with name, contact information (phone, email, address), and specialties.
- **FR-020**: System MUST prevent assignment of inactive vendors to tickets.
- **FR-021**: System MUST enforce tenant isolation: all tickets, attachments, comments, and vendor data must be scoped to tenant and not accessible across tenants.
- **FR-022**: System MUST link tickets to properties and leases from existing property and rental management modules.
- **FR-023**: System MUST link tickets to tenant contacts (renters) from existing CRM module, supporting both user accounts and contact-only tenants.
- **FR-024**: System MUST track created_by_user_id or created_by_contact_id and timestamps (created_at, updated_at) for all maintenance entities for audit purposes.
- **FR-025**: System MUST validate that required ticket fields (category, title, description) are provided when creating tickets.
- **FR-026**: System MUST validate that ticket status transitions follow the workflow rules (e.g., cannot skip from DECLARED directly to RESOLVED without going through IN_PROGRESS and ASSIGNED).
- **FR-027**: System MUST store ticket attachments securely with file metadata (file name, mime type, size, upload date, uploader).
- **FR-028**: System MUST provide secure access to ticket attachments, ensuring only authorized users (tenant who created ticket, property managers) can view or download attachments.
- **FR-029**: System MUST support ticket priority levels (low, medium, high, urgent) and allow filtering and sorting by priority.
- **FR-030**: System MUST display ticket status with visual indicators (badges, colors) to quickly identify ticket state.

### Key Entities *(include if feature involves data)*

- **MaintenanceTicket (Incident Ticket)**: Represents a maintenance issue or incident reported by a tenant. Key attributes: title, category (plumbing, electricity, air conditioning, other), priority (low, medium, high, urgent), description, location in property, status (declared, in progress, assigned, resolved, canceled), timestamps for status changes (declared_at, in_progress_at, assigned_at, resolved_at, canceled_at), resolution notes, optional vendor assignment, optional internal user assignment. Relationships: belongs to tenant, property, lease, tenant contact (renter), optional vendor, optional assigned user, created by user/contact; has many attachments, comments, status history entries.

- **MaintenanceTicketAttachment (Ticket Attachment)**: Represents a file (photo, document) attached to a ticket. Key attributes: file URL/path, file name, mime type, file size, upload date, uploader (user or contact). Relationships: belongs to tenant, ticket, optional uploader user/contact.

- **MaintenanceTicketComment (Ticket Comment)**: Represents a comment in the ticket's discussion thread. Key attributes: content, author type (tenant, manager, system), timestamp. Relationships: belongs to tenant, ticket, optional author user/contact.

- **MaintenanceTicketStatusHistory (Status History)**: Represents a record of status change for a ticket. Key attributes: from status, to status, changed at timestamp, optional note, user who made the change. Relationships: belongs to tenant, ticket, optional changed by user.

- **MaintenanceVendor (Vendor/Service Provider)**: Represents a maintenance contractor or service provider that can be assigned to tickets. Key attributes: name, phone (optional), email (optional), address (optional), specialties (list of service types), active status. Relationships: belongs to tenant; has many assigned tickets.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Tenants can create a complete incident ticket (with category, description, priority, and at least one photo) in under 2 minutes from ticket creation form to saved ticket.
- **SC-002**: Property managers can view all tickets for their organization with filters applied in under 1 second.
- **SC-003**: Property managers can update ticket status and assign a vendor in under 30 seconds.
- **SC-004**: System displays ticket details (with status, timeline, comments, attachments) in under 1 second.
- **SC-005**: System supports 500 active tickets per tenant organization without performance degradation.
- **SC-006**: 95% of ticket status updates are accurately recorded with correct timestamps and history entries on first attempt.
- **SC-007**: Tenants receive email notifications for status changes within 1 minute of the status update.
- **SC-008**: Property managers can view complete maintenance history for a property (all tickets with details) in under 2 seconds.
- **SC-009**: System maintains 100% tenant data isolation: zero cross-tenant ticket access incidents in production.
- **SC-010**: Property managers can create a vendor and assign it to a ticket in under 1 minute.
- **SC-011**: File uploads (photos, documents) complete successfully 98% of the time for files within size limits.
- **SC-012**: Tenants can view their ticket list with status filters applied in under 1 second, even with 50+ tickets.

## Assumptions

- Property, lease, and tenant contact (renter) entities already exist in the system from previous modules (Properties module, Rental Management module, CRM module).
- Tenants have user accounts or can access the system through a tenant portal linked to their contact/lease information.
- Email notification service (Nodemailer or equivalent) is available for sending status change notifications to tenants and property managers.
- File storage service is available for storing ticket attachments (photos, documents) with secure access controls.
- Multi-tenant architecture is already established with tenant isolation mechanisms in place.
- Users have appropriate permissions (RBAC) to access maintenance features based on their roles (tenant, property manager, admin).
- Property managers have access to property and lease information to link tickets appropriately.
- Ticket categories (plumbing, electricity, air conditioning, other) cover the primary maintenance needs; additional categories can be added in future iterations.
- Vendor management is internal to property managers; vendors do not have direct portal access in this MVP (notifications to vendors are sent via email if vendor email is provided).
- Ticket priority levels (low, medium, high, urgent) are sufficient for initial prioritization; more granular priority systems can be added later.
- Maintenance history is primarily for viewing and analysis; advanced reporting and analytics are out of scope for MVP.

## Dependencies

- **Properties Module**: Requires Property entity to link tickets to properties.
- **Rental Management Module**: Requires RentalLease entity to link tickets to leases and validate tenant access.
- **CRM Module**: Requires CrmContact entity to link tickets to tenant contacts (renters) and support both user accounts and contact-only tenants.
- **User Management & RBAC**: Requires User entity and permission system for access control (tenant vs. property manager permissions).
- **Multi-Tenant Infrastructure**: Requires Tenant entity and tenant isolation mechanisms.
- **File Storage Service**: Requires document/file storage service for storing ticket attachments (photos, documents) with secure access.
- **Email Notification Service**: Requires email service (Nodemailer or equivalent) for sending status change notifications to tenants and property managers.
- **Notification System** (if exists): Optional integration with in-app notification system for property manager alerts when new tickets are created.

## Out of Scope

- Vendor portal or self-service access for vendors to view assigned tickets (vendors are managed internally by property managers; notifications sent via email if vendor email provided).
- Automated scheduling or calendar integration for vendor assignments.
- Cost tracking or invoicing for maintenance work (financial aspects of vendor payments are handled separately).
- Preventive maintenance scheduling or recurring maintenance tasks (this module focuses on reactive incident reporting and resolution).
- Property inspection and condition reporting (handled by other modules).
- Insurance claim management related to maintenance incidents.
- Advanced analytics and reporting dashboards (basic maintenance history viewing is included, but advanced analytics are out of scope).
- Mobile app for tenants or property managers (web interface is the primary interface; mobile responsiveness is assumed but native apps are out of scope).
- Real-time chat or messaging between tenants and property managers (comment thread is asynchronous, not real-time chat).
- Integration with external maintenance service marketplaces or vendor directories (vendor management is internal to each tenant organization).
