# Feature Specification: Newsletter and Mailing System

**Feature Branch**: `012-newsletter-mailing`  
**Created**: February 11, 2026  
**Status**: Draft  
**Input**: User description: "Newsletter/Mailing system (MailChimp-like) integrated with existing communication module"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Agency Creates and Sends Manual Newsletter (Priority: P1)

An agency administrator wants to send a newsletter to a manually curated list of prospects who have subscribed via the website or been imported from external sources.

**Why this priority**: This is the core value proposition - enabling agencies to communicate with their subscriber base. Without this, the feature has no purpose.

**Independent Test**: Can be fully tested by creating a manual list, importing subscribers, creating a campaign with HTML content, sending it immediately, and verifying recipients receive the email with proper unsubscribe links.

**Acceptance Scenarios**:

1. **Given** an agency administrator is authenticated, **When** they create a new manual mailing list with a name, **Then** the list is saved and appears in their lists dashboard
2. **Given** a manual list exists, **When** the admin imports a CSV file with email addresses (and optional names), **Then** valid emails are added as subscribers with ACTIVE status and duplicates within the same list are rejected
3. **Given** a list with active subscribers exists, **When** the admin creates a campaign by selecting the list, entering a subject and HTML body with variables ({{prenom}}, {{lien_desinscription}}), and sends it immediately, **Then** all active subscribers receive the email with personalized content and a functional unsubscribe link
4. **Given** a campaign has been sent, **When** the admin views campaign statistics, **Then** they see total sent count, failure count with reasons, and unsubscribe count

---

### User Story 2 - Public Subscriber Opts In via Website Form (Priority: P1)

A website visitor wants to subscribe to an agency's newsletter by entering their email in a public subscription form, then confirms their subscription by clicking a link in their email.

**Why this priority**: Double opt-in is critical for GDPR compliance and anti-spam regulations. This ensures legitimate consent.

**Independent Test**: Can be fully tested by submitting an email to a public subscription endpoint, receiving a confirmation email with a unique token, clicking the confirmation link, and verifying the subscriber status changes from PENDING_CONFIRMATION to ACTIVE.

**Acceptance Scenarios**:

1. **Given** a public subscription form for a specific list, **When** a visitor submits their email address, **Then** a subscriber record is created with status PENDING_CONFIRMATION and a confirmation email with a unique token link is sent
2. **Given** a pending subscription exists, **When** the visitor clicks the confirmation link with the valid token, **Then** the subscriber status changes to ACTIVE, the confirmed_at timestamp is recorded, and a success message is displayed
3. **Given** a pending subscription exists, **When** 7 days pass without confirmation, **Then** the subscriber record remains PENDING_CONFIRMATION but is excluded from campaign sends
4. **Given** an invalid or expired confirmation token is used, **When** the confirmation link is accessed, **Then** an error message is displayed and the subscriber status remains unchanged

---

### User Story 3 - Recipient Unsubscribes from Newsletter (Priority: P1)

A newsletter recipient wants to stop receiving emails by clicking the unsubscribe link in any campaign email.

**Why this priority**: Mandatory for legal compliance (GDPR, CAN-SPAM). Without this, agencies risk legal issues and deliverability problems.

**Independent Test**: Can be fully tested by sending a campaign, extracting the unsubscribe link from a received email, clicking it, and verifying the subscriber status changes to UNSUBSCRIBED and they no longer receive future campaigns.

**Acceptance Scenarios**:

1. **Given** a subscriber has received a campaign email, **When** they click the unique unsubscribe link, **Then** their status changes to UNSUBSCRIBED, the unsubscribed_at timestamp is recorded, and a confirmation page is displayed
2. **Given** a subscriber is UNSUBSCRIBED, **When** a new campaign is sent to their list, **Then** they are excluded from recipients
3. **Given** an unsubscribe page is displayed, **When** the subscriber chooses to unsubscribe from all lists of the agency, **Then** all their subscriptions for that tenant are marked UNSUBSCRIBED
4. **Given** an invalid or already-used unsubscribe token is accessed, **When** the page loads, **Then** an appropriate message is displayed without errors

---

### User Story 4 - Agency Sends Newsletter to Property Owners (Priority: P2)

An agency administrator wants to send a newsletter to all property owners who have consented to receiving marketing communications.

**Why this priority**: Leveraging existing data (owners) for marketing is a key feature that differentiates this from standalone newsletter tools. However, basic manual lists (P1) must work first.

**Independent Test**: Can be fully tested by ensuring at least one owner has newsletter consent enabled, creating a FROM_OWNERS list, creating and sending a campaign to that list, and verifying only owners with consent receive the email.

**Acceptance Scenarios**:

1. **Given** an agency has property owners in the system, **When** the admin creates a list of type FROM_OWNERS, **Then** the list is created and shows the count of owners with newsletter consent
2. **Given** a FROM_OWNERS list exists, **When** a campaign is sent to this list, **Then** only owners with newsletter consent = true receive the email, and each owner's personalized data (name) is used in the email
3. **Given** an owner initially had newsletter consent, **When** they revoke consent via their preferences, **Then** they are automatically excluded from future FROM_OWNERS campaign sends
4. **Given** a FROM_OWNERS list is selected, **When** the admin attempts to import a CSV, **Then** the import is blocked with a message that derived lists cannot be manually modified

---

### User Story 5 - Agency Schedules Newsletter for Future Send (Priority: P2)

An agency administrator wants to create a newsletter campaign and schedule it to be sent at a specific date and time in the future, with the ability to cancel it before it sends.

**Why this priority**: Scheduling is a standard feature for campaign management that provides flexibility, but immediate sends (P1) are sufficient for MVP.

**Independent Test**: Can be fully tested by creating a campaign, setting a future send time (e.g., 10 minutes from now), verifying the status is SCHEDULED, waiting for the scheduled time, and confirming the campaign sends automatically at the correct time.

**Acceptance Scenarios**:

1. **Given** a campaign is being created, **When** the admin selects a future date/time and saves, **Then** the campaign status is set to SCHEDULED and the scheduled_at field is recorded
2. **Given** a scheduled campaign exists, **When** the scheduled time arrives, **Then** a background job processes the campaign, resolves recipients, sends emails, updates status to SENDING then SENT, and records sent_at timestamp
3. **Given** a campaign is SCHEDULED, **When** the admin cancels it before the scheduled time, **Then** the status changes to CANCELLED and the campaign is not sent
4. **Given** a campaign is SCHEDULED, **When** the scheduled time has already passed, **Then** the cancel action is blocked with an error message
5. **Given** multiple campaigns are scheduled for the same time, **When** the background job runs, **Then** all campaigns are processed without interfering with each other

---

### User Story 6 - Agency Creates Reusable Newsletter Templates (Priority: P3)

An agency administrator wants to create reusable HTML email templates with placeholders for content, so they can maintain consistent branding across campaigns without recreating layouts each time.

**Why this priority**: Templates improve efficiency and consistency but are not essential for MVP. Agencies can paste HTML directly into campaigns initially.

**Independent Test**: Can be fully tested by creating a newsletter template with header/footer and a {{contenu}} placeholder, then creating a campaign that uses this template, filling in the content section, and verifying the sent email combines template layout with campaign content.

**Acceptance Scenarios**:

1. **Given** an agency administrator is authenticated, **When** they create a new newsletter template with a name and HTML structure including {{contenu}} placeholder, **Then** the template is saved and appears in the templates library
2. **Given** templates exist, **When** the admin creates a campaign and selects a template, **Then** the template HTML is loaded and the {{contenu}} variable area is editable for campaign-specific content
3. **Given** a template is being used by existing campaigns, **When** the admin updates the template, **Then** only future campaigns use the updated version (existing sent campaigns are unaffected)
4. **Given** a template includes standard variables ({{prenom}}, {{lien_desinscription}}), **When** a campaign using that template is sent, **Then** all variables are properly replaced with recipient-specific data

---

### User Story 7 - Agency Sends Newsletter to CRM Contacts and Renters (Priority: P3)

An agency administrator wants to send newsletters to their CRM contacts or current renters who have opted into marketing communications.

**Why this priority**: Similar to FROM_OWNERS (P2), but CRM contacts and renters are typically smaller audiences or less critical for initial marketing campaigns.

**Independent Test**: Can be fully tested by creating FROM_CRM_CONTACTS and FROM_RENTERS lists, ensuring at least one contact/renter has newsletter consent, sending campaigns to these lists, and verifying only consenting individuals receive emails.

**Acceptance Scenarios**:

1. **Given** an agency has CRM contacts with newsletter consent, **When** the admin creates a list of type FROM_CRM_CONTACTS, **Then** the list shows the count of contacts with consent
2. **Given** an agency has renters with active leases, **When** the admin creates a list of type FROM_RENTERS, **Then** the list shows the count of renters with newsletter consent
3. **Given** a FROM_CRM_CONTACTS or FROM_RENTERS campaign is sent, **When** recipients are resolved at send time, **Then** only individuals with current consent receive emails
4. **Given** a renter's lease ends, **When** their consent remains active, **Then** they continue to receive newsletters (unless they unsubscribe or their consent is tied to lease status)

---

### User Story 8 - Agency Exports Subscriber List (Priority: P3)

An agency administrator wants to export all subscribers from a mailing list to a CSV file for backup, analysis, or use in external tools.

**Why this priority**: Export is a convenience feature that's nice to have but not critical for core newsletter functionality.

**Independent Test**: Can be fully tested by creating a list with multiple subscribers in different statuses, clicking export, and verifying the downloaded CSV contains all subscribers with columns: email, name, status, subscribed_at, confirmed_at, unsubscribed_at.

**Acceptance Scenarios**:

1. **Given** a mailing list with subscribers exists, **When** the admin clicks "Export" on the list detail page, **Then** a CSV file is downloaded containing all subscriber data (email, name, status, dates)
2. **Given** a list has no subscribers, **When** export is attempted, **Then** an empty CSV with headers is provided or a message indicating no data to export
3. **Given** a FROM_OWNERS or other derived list is exported, **When** the export processes, **Then** the CSV contains the resolved subscribers at the time of export (not the source entity data)

---

### Edge Cases

- What happens when a subscriber tries to confirm their subscription after already being confirmed (token reuse)?
  - System should display a friendly message indicating they're already subscribed, without errors
  
- What happens when duplicate emails are imported into the same manual list?
  - System should reject duplicates within the same list and report the count of rejected duplicates
  
- What happens when duplicate emails exist across different lists?
  - This is allowed - the same email can be subscribed to multiple lists independently
  
- What happens when a campaign is scheduled but the list is deleted before send time?
  - Campaign should fail gracefully with status FAILED and log the error reason
  
- What happens when a campaign is sent to a list with zero ACTIVE subscribers?
  - Campaign should complete with status SENT but sent count = 0, no error
  
- What happens when the email provider (SMTP/SendGrid) returns errors for some recipients?
  - Each recipient's send status (SENT/FAILED) and failure reason should be recorded in the campaign recipients table for reporting
  
- What happens when a subscriber unsubscribes, then later tries to resubscribe via the public form?
  - System should allow resubscription by creating a new PENDING_CONFIRMATION record (or reusing existing record and resetting status), requiring confirmation again
  
- What happens when an owner/renter/contact revokes newsletter consent?
  - They are automatically excluded from future campaign sends to derived lists, but remain in the underlying system (owners/renters/contacts tables)
  
- What happens when a campaign includes variables like {{prenom}} but the subscriber has no name?
  - System should handle gracefully by either omitting the variable (empty string) or using a default like "Cher abonné"
  
- What happens when a public subscription form is accessed for a deleted list?
  - System should return an error or message indicating the list is no longer available
  
- What happens when someone tries to unsubscribe using an expired or invalid token?
  - System should display an error message but allow the user to manually unsubscribe by entering their email address

## Requirements *(mandatory)*

### Functional Requirements

#### Mailing Lists Management

- **FR-001**: System MUST allow agency administrators to create mailing lists scoped to their tenant with a unique name and type (MANUAL, FROM_OWNERS, FROM_RENTERS, FROM_CRM_CONTACTS)
- **FR-002**: System MUST prevent duplicate list names within the same tenant
- **FR-003**: System MUST allow administrators to update list name and settings (double opt-in enabled/disabled) for existing lists
- **FR-004**: System MUST allow administrators to delete mailing lists and all associated subscribers (with confirmation prompt)
- **FR-005**: System MUST display a list dashboard showing all lists with subscriber counts (total, active, unsubscribed)

#### Subscriber Management

- **FR-006**: System MUST allow administrators to manually add individual subscribers to MANUAL lists by entering email and optional name
- **FR-007**: System MUST allow administrators to import subscribers to MANUAL lists via CSV file containing email (required) and name (optional) columns
- **FR-008**: System MUST validate all imported email addresses and reject invalid formats, providing a summary of accepted/rejected emails
- **FR-009**: System MUST prevent duplicate email addresses within the same list during import or manual addition
- **FR-010**: System MUST allow the same email address to exist across multiple different lists
- **FR-011**: System MUST allow administrators to manually remove subscribers from MANUAL lists
- **FR-012**: System MUST allow administrators to view all subscribers for a list with their status (PENDING_CONFIRMATION, ACTIVE, UNSUBSCRIBED) and subscription dates
- **FR-013**: System MUST allow administrators to export list subscribers to CSV format including email, name, status, subscribed_at, confirmed_at, unsubscribed_at
- **FR-014**: System MUST block administrators from importing or manually adding subscribers to derived lists (FROM_OWNERS, FROM_RENTERS, FROM_CRM_CONTACTS)
- **FR-015**: System MUST automatically resolve derived list subscribers at campaign send time by querying owners/renters/CRM contacts who have newsletter consent enabled

#### Double Opt-In (Public Subscription)

- **FR-016**: System MUST provide a public (unauthenticated) subscription endpoint that accepts email address and list identifier
- **FR-017**: System MUST create subscriber records with status PENDING_CONFIRMATION when subscriptions are submitted via public form
- **FR-018**: System MUST generate a unique confirmation token for each pending subscription
- **FR-019**: System MUST send a confirmation email containing a unique confirmation link with the token to the submitted email address
- **FR-020**: System MUST provide a public confirmation endpoint that validates tokens and updates subscriber status to ACTIVE
- **FR-021**: System MUST record confirmed_at timestamp when a subscription is confirmed
- **FR-022**: System MUST display a success message/page after successful confirmation
- **FR-023**: System MUST handle invalid or expired confirmation tokens gracefully with appropriate error messages
- **FR-024**: System MUST allow lists to have double opt-in disabled for internal/manual subscriptions while maintaining it for public forms

#### Unsubscribe and Preferences

- **FR-025**: System MUST generate a unique unsubscribe link for each recipient in every campaign email
- **FR-026**: System MUST provide a public unsubscribe page accessible via the unique link without authentication
- **FR-027**: System MUST update subscriber status to UNSUBSCRIBED when the unsubscribe link is accessed
- **FR-028**: System MUST record unsubscribed_at timestamp when a subscriber unsubscribes
- **FR-029**: System MUST display a confirmation message after successful unsubscription
- **FR-030**: System MUST offer an option on the unsubscribe page to unsubscribe from all lists belonging to the same agency (tenant)
- **FR-031**: System MUST exclude UNSUBSCRIBED subscribers from all future campaign sends to their lists
- **FR-032**: System MUST handle invalid or already-used unsubscribe tokens gracefully without errors

#### Campaign Creation and Management

- **FR-033**: System MUST allow administrators to create newsletter campaigns by selecting a target list, entering a subject, and composing HTML body content
- **FR-034**: System MUST support variable placeholders in campaign subject and body including {{prenom}}, {{nom}}, {{email}}, {{lien_desinscription}}, {{contenu}}
- **FR-035**: System MUST allow campaigns to be saved as DRAFT status for later completion
- **FR-036**: System MUST allow administrators to send campaigns immediately (status changes from DRAFT to SENDING to SENT)
- **FR-037**: System MUST allow administrators to schedule campaigns for future send by specifying a scheduled_at date/time (status set to SCHEDULED)
- **FR-038**: System MUST allow administrators to cancel SCHEDULED campaigns before their scheduled send time (status changes to CANCELLED)
- **FR-039**: System MUST prevent cancellation of campaigns that are SENDING or SENT
- **FR-040**: System MUST provide a campaign preview function showing how the email will appear with sample data
- **FR-041**: System MUST validate that campaigns include the required {{lien_desinscription}} variable before sending

#### Campaign Sending and Processing

- **FR-042**: System MUST process scheduled campaigns at their scheduled_at time using a background job
- **FR-043**: System MUST resolve campaign recipients at send time by querying the target list for all ACTIVE subscribers
- **FR-044**: System MUST exclude UNSUBSCRIBED and PENDING_CONFIRMATION subscribers from campaign sends
- **FR-045**: System MUST replace all variable placeholders with actual subscriber data for each recipient
- **FR-046**: System MUST send emails using the existing email provider infrastructure (EmailService, SMTP/SendGrid)
- **FR-047**: System MUST handle missing subscriber data (e.g., no name) gracefully by using empty strings or default values in variables
- **FR-048**: System MUST record each email send attempt with recipient email, status (SENT or FAILED), sent_at timestamp, and failure_reason if applicable
- **FR-049**: System MUST update campaign status from SENDING to SENT after all recipients have been processed
- **FR-050**: System MUST record the sent_at timestamp when a campaign completes sending

#### Newsletter Templates

- **FR-051**: System MUST allow administrators to create reusable newsletter templates with a name and HTML structure
- **FR-052**: System MUST support variable placeholders in templates including {{contenu}} for campaign-specific content
- **FR-053**: System MUST allow administrators to select a template when creating a campaign
- **FR-054**: System MUST allow administrators to edit the {{contenu}} section when using a template in a campaign
- **FR-055**: System MUST allow administrators to update existing templates
- **FR-056**: System MUST allow administrators to delete templates that are not currently in use by SCHEDULED campaigns
- **FR-057**: System MUST store the final rendered HTML (template + content) with each sent campaign for historical accuracy

#### Statistics and Reporting

- **FR-058**: System MUST display per-campaign statistics including total emails sent, total failed, and failure reasons
- **FR-059**: System MUST display count of unsubscribes that occurred after campaign send (within a reasonable time window)
- **FR-060**: System MUST provide a campaign history view showing all campaigns with their status, send date, list name, and basic statistics
- **FR-061**: System MUST allow filtering campaign history by status (DRAFT, SCHEDULED, SENT, CANCELLED, FAILED) and date range
- **FR-062**: System MUST maintain a detailed recipient log for each campaign showing individual send outcomes for compliance and troubleshooting

#### Compliance and Security

- **FR-063**: System MUST require explicit consent (newsletter preference/checkbox) before including owners, renters, or CRM contacts in derived lists
- **FR-064**: System MUST maintain audit trail of subscription events including subscribed_at, confirmed_at, unsubscribed_at timestamps
- **FR-065**: System MUST include unsubscribe link in every campaign email sent (validated before send)
- **FR-066**: System MUST apply rate limiting to public subscription endpoints to prevent abuse
- **FR-067**: System MUST apply rate limiting to campaign sends to avoid overwhelming email providers
- **FR-068**: System MUST isolate all data by tenant_id with no cross-tenant access
- **FR-069**: System MUST validate RBAC permissions for all back-office operations (agency administrators only)
- **FR-070**: System MUST sanitize HTML content in campaigns to prevent XSS attacks while preserving safe formatting

### Key Entities

- **NewsletterList**: Represents a mailing list/audience for a tenant. Key attributes include name, type (MANUAL/FROM_OWNERS/FROM_RENTERS/FROM_CRM_CONTACTS), double_opt_in flag, public_subscribe_token for public forms, tenant association, timestamps

- **NewsletterSubscriber**: Represents an individual subscriber to a specific list. Key attributes include email address, optional name, status (PENDING_CONFIRMATION/ACTIVE/UNSUBSCRIBED), source entity reference for derived lists, subscription/confirmation/unsubscription timestamps, confirmation token, relationships to list and tenant

- **NewsletterCampaign**: Represents an email campaign sent to a list. Key attributes include subject, HTML body content, status (DRAFT/SCHEDULED/SENDING/SENT/CANCELLED/FAILED), scheduled send time, actual sent time, relationships to list, optional template, creator, and tenant

- **NewsletterCampaignRecipient**: Represents the send outcome for each individual recipient of a campaign. Key attributes include recipient email, send status (SENT/FAILED), sent timestamp, failure reason if applicable, relationship to campaign

- **NewsletterTemplate**: Represents a reusable HTML email template. Key attributes include name, HTML structure with variable placeholders, tenant association, timestamps

- **Owner/Renter/CRMContact**: Existing entities in the system that serve as sources for derived lists. Must include a newsletter consent preference field (boolean or part of communication preferences)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Agency administrators can create a mailing list, import subscribers, create a campaign, and send it successfully within 5 minutes
- **SC-002**: Public subscribers can complete the subscription and confirmation process (from form submission to confirmed status) within 2 minutes
- **SC-003**: System successfully delivers campaigns to lists with up to 5,000 active subscribers within 30 minutes
- **SC-004**: Unsubscribe links in campaign emails remain functional for at least 1 year after send date
- **SC-005**: 100% of campaign emails include a functional unsubscribe link (validated before send)
- **SC-006**: Scheduled campaigns are sent within 1 minute of their scheduled time 95% of the time
- **SC-007**: Campaign recipient logs provide sufficient detail to resolve delivery issues for 90% of support inquiries
- **SC-008**: Zero cross-tenant data leakage (all subscribers, lists, and campaigns are properly isolated by tenant_id)
- **SC-009**: Public subscription endpoints handle rate limiting gracefully without service degradation when receiving 100+ requests per minute
- **SC-010**: Administrators can identify and exclude unsubscribed contacts from future campaigns with 100% accuracy (no unsubscribed recipient receives emails)
- **SC-011**: Import process provides clear feedback on accepted/rejected emails, allowing administrators to correct issues on first attempt 80% of the time
- **SC-012**: Campaign statistics are available immediately after send completion, showing sent/failed counts and basic metrics
