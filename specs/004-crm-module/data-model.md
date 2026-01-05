# Data Model: CRM & Client Relationship Management

**Feature**: 004-crm-module  
**Date**: 2025-01-27  
**Purpose**: Define database schema extensions for CRM system

---

## Overview

This document extends the existing Prisma schema (`packages/api/prisma/schema.prisma`) with new entities for:
- CRM Contacts (prospects and clients)
- Contact Roles (business roles: Propriétaire, Locataire, Copropriétaire, Acquéreur)
- CRM Deals (sales opportunities/pipeline)
- CRM Activities (interactions: calls, emails, notes, etc.)
- CRM Appointments (scheduled meetings and visits)
- CRM Deal Property Matches (property shortlists for deals)
- CRM Tags (contact categorization)
- CRM Notes (internal documentation)

**Dependencies**:
- Existing: User, Tenant, Membership, AuditLog models
- Future: Property model (referenced but to be created in property management module)

---

## Schema Extensions

### 1. CrmContact

**Purpose**: Represents a person (prospect or client) in the CRM system.

**Fields**:
```prisma
model CrmContact {
  id                String        @id @default(uuid())
  tenantId          String        @map("tenant_id")
  firstName         String        @map("first_name")
  lastName          String        @map("last_name")
  email             String
  phone             String?
  source            String?       // referral, website, call, social, walk-in, etc.
  status            CrmContactStatus @default(LEAD)
  assignedToUserId  String?       @map("assigned_to_user_id")
  lastInteractionAt DateTime?     @map("last_interaction_at")
  createdAt         DateTime      @default(now()) @map("created_at")
  updatedAt         DateTime      @updatedAt @map("updated_at")

  tenant            Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  assignedTo        User?         @relation(fields: [assignedToUserId], references: [id], onDelete: SetNull)
  roles             CrmContactRole[]
  deals             CrmDeal[]
  activities        CrmActivity[]
  appointments      CrmAppointment[]
  tags              CrmContactTag[]
  notes             CrmNote[]

  @@unique([tenantId, email])
  @@index([tenantId])
  @@index([tenantId, status])
  @@index([assignedToUserId])
  @@index([lastInteractionAt])
  @@index([email])
  @@map("crm_contacts")
}
```

**Enum**:
```prisma
enum CrmContactStatus {
  LEAD          // Prospect/lead
  ACTIVE_CLIENT // Converted client
  ARCHIVED      // Archived contact
}
```

**Validation Rules**:
- `firstName` and `lastName` are required (FR-001b)
- `email` is required and must be unique within tenant (FR-001a, FR-001b)
- `phone` is optional
- `tenantId` must reference existing Tenant
- `assignedToUserId` must reference existing User (if provided)

**Business Rules**:
- New contacts default to `LEAD` status
- Email must be unique within tenant (FR-001a)
- `lastInteractionAt` updated when activity is created for this contact
- Contact cannot be deleted if it has active deals or recent activities (Edge Case)
- Converting lead to client updates status to `ACTIVE_CLIENT` and activates roles (FR-018)

---

### 2. CrmContactRole

**Purpose**: Represents business roles assigned to contacts (multi-role support).

**Fields**:
```prisma
model CrmContactRole {
  id          String           @id @default(uuid())
  tenantId    String           @map("tenant_id")
  contactId   String           @map("contact_id")
  role        CrmContactRoleType
  active      Boolean          @default(true)
  startedAt   DateTime         @map("started_at")
  endedAt     DateTime?        @map("ended_at")
  metadata    Json?            // Optional metadata for role-specific data
  createdAt   DateTime         @default(now()) @map("created_at")
  updatedAt   DateTime         @updatedAt @map("updated_at")

  tenant      Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  contact     CrmContact       @relation(fields: [contactId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([contactId])
  @@index([tenantId, contactId, active])
  @@map("crm_contact_roles")
}
```

**Enum**:
```prisma
enum CrmContactRoleType {
  PROPRIETAIRE    // Property owner
  LOCATAIRE       // Renter
  COPROPRIETAIRE  // Co-owner
  ACQUEREUR       // Buyer
}
```

**Validation Rules**:
- `role` must be valid enum value
- `startedAt` is required
- `endedAt` must be after `startedAt` (if provided)
- `active` defaults to true

**Business Rules**:
- Multiple roles can be active simultaneously (FR-004, Edge Case)
- Roles are additive, not exclusive (Edge Case)
- Setting `endedAt` deactivates role (`active = false`)
- Role history preserved (startedAt/endedAt track lifecycle)

---

### 3. CrmDeal

**Purpose**: Represents a sales opportunity (deal) in the pipeline.

**Fields**:
```prisma
model CrmDeal {
  id                String        @id @default(uuid())
  tenantId          String        @map("tenant_id")
  contactId         String        @map("contact_id")
  type              CrmDealType
  stage             CrmDealStage  @default(NEW)
  budgetMin         Decimal?      @map("budget_min") @db.Decimal(12, 2)
  budgetMax         Decimal?      @map("budget_max") @db.Decimal(12, 2)
  locationZone      String?       @map("location_zone")
  criteriaJson      Json?         @map("criteria_json") // rooms, surface, furnishing, etc.
  expectedValue     Decimal?      @map("expected_value") @db.Decimal(12, 2)
  probability       Float?        // 0.0 to 1.0
  assignedToUserId  String?       @map("assigned_to_user_id")
  closedReason      String?       @map("closed_reason")
  closedAt          DateTime?     @map("closed_at")
  version           Int           @default(1) // Optimistic locking (research.md)
  createdAt         DateTime      @default(now()) @map("created_at")
  updatedAt         DateTime      @updatedAt @map("updated_at")

  tenant            Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  contact           CrmContact    @relation(fields: [contactId], references: [id], onDelete: Cascade)
  assignedTo        User?         @relation(fields: [assignedToUserId], references: [id], onDelete: SetNull)
  activities        CrmActivity[]
  appointments      CrmAppointment[]
  propertyMatches   CrmDealProperty[]
  notes             CrmNote[]

  @@index([tenantId])
  @@index([tenantId, contactId])
  @@index([tenantId, stage])
  @@index([assignedToUserId])
  @@index([createdAt])
  @@map("crm_deals")
}
```

**Enums**:
```prisma
enum CrmDealType {
  ACHAT     // Purchase
  LOCATION  // Rental
}

enum CrmDealStage {
  NEW          // New opportunity
  QUALIFIED    // Qualified lead
  APPOINTMENT  // Appointment scheduled
  VISIT        // Property visit scheduled
  NEGOTIATION  // In negotiation
  WON          // Deal closed successfully
  LOST         // Deal lost
}
```

**Validation Rules**:
- `type` must be ACHAT or LOCATION
- `stage` must be valid enum value
- `budgetMax` must be >= `budgetMin` (if both provided)
- `probability` must be between 0.0 and 1.0 (if provided)
- `version` increments on each update (optimistic locking)

**Business Rules**:
- New deals default to `NEW` stage
- `closedAt` and `closedReason` set when stage changes to `WON` or `LOST`
- Stage transitions logged in audit trail (FR-030, Edge Case)
- Version field used for optimistic locking (research.md)
- `version` increments on each update to detect concurrent modifications

---

### 4. CrmActivity

**Purpose**: Represents an interaction or action (immutable activity log).

**Fields**:
```prisma
model CrmActivity {
  id                String           @id @default(uuid())
  tenantId          String           @map("tenant_id")
  contactId         String?          @map("contact_id")
  dealId            String?          @map("deal_id")
  activityType      CrmActivityType  @map("activity_type")
  direction         CrmActivityDirection?
  subject           String?
  content           String           @db.Text
  outcome           String?
  occurredAt        DateTime         @map("occurred_at")
  createdByUserId   String           @map("created_by_user_id")
  nextActionAt      DateTime?        @map("next_action_at")
  nextActionType    String?          @map("next_action_type")
  correctionOfId    String?          @map("correction_of_id") // Reference to activity being corrected
  createdAt         DateTime         @default(now()) @map("created_at")

  tenant            Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  contact           CrmContact?      @relation(fields: [contactId], references: [id], onDelete: Cascade)
  deal              CrmDeal?         @relation(fields: [dealId], references: [id], onDelete: Cascade)
  createdBy         User             @relation(fields: [createdByUserId], references: [id], onDelete: Cascade)
  correctionOf      CrmActivity?     @relation("ActivityCorrection", fields: [correctionOfId], references: [id], onDelete: SetNull)
  corrections       CrmActivity[]    @relation("ActivityCorrection")

  @@index([tenantId])
  @@index([tenantId, contactId])
  @@index([tenantId, dealId])
  @@index([createdByUserId])
  @@index([occurredAt])
  @@index([nextActionAt])
  @@map("crm_activities")
}
```

**Enums**:
```prisma
enum CrmActivityType {
  CALL
  EMAIL
  SMS
  WHATSAPP
  VISIT
  MEETING
  NOTE
  TASK
  CORRECTION
}

enum CrmActivityDirection {
  IN       // Incoming
  OUT      // Outgoing
  INTERNAL // Internal note/task
}
```

**Validation Rules**:
- `content` is required
- `occurredAt` is required (defaults to `createdAt` if not provided)
- `createdByUserId` is required
- Either `contactId` or `dealId` (or both) must be provided
- `correctionOfId` can only reference existing activity

**Business Rules**:
- Activities are immutable - no updates or deletes (FR-020)
- Corrections handled by creating new activity with `correctionOfId` (research.md)
- `occurredAt` tracks when activity actually occurred (may differ from `createdAt`)
- `nextActionAt` triggers follow-up reminders (FR-013)
- Activity creation updates contact's `lastInteractionAt`

---

### 5. CrmAppointment

**Purpose**: Represents scheduled meetings and property visits.

**Fields**:
```prisma
model CrmAppointment {
  id                String              @id @default(uuid())
  tenantId          String              @map("tenant_id")
  contactId         String              @map("contact_id")
  dealId            String?             @map("deal_id")
  appointmentType   CrmAppointmentType  @map("appointment_type")
  startAt           DateTime            @map("start_at")
  endAt             DateTime            @map("end_at")
  location          String?
  status            CrmAppointmentStatus @default(SCHEDULED)
  createdByUserId   String              @map("created_by_user_id")
  assignedToUserId  String?             @map("assigned_to_user_id")
  createdAt         DateTime            @default(now()) @map("created_at")
  updatedAt         DateTime            @updatedAt @map("updated_at")

  tenant            Tenant              @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  contact           CrmContact          @relation(fields: [contactId], references: [id], onDelete: Cascade)
  deal              CrmDeal?            @relation(fields: [dealId], references: [id], onDelete: Cascade)
  createdBy         User                @relation(fields: [createdByUserId], references: [id], onDelete: Cascade)
  assignedTo        User?               @relation(fields: [assignedToUserId], references: [id], onDelete: SetNull)

  @@index([tenantId])
  @@index([tenantId, contactId])
  @@index([tenantId, dealId])
  @@index([assignedToUserId])
  @@index([startAt])
  @@index([status])
  @@map("crm_appointments")
}
```

**Enums**:
```prisma
enum CrmAppointmentType {
  RDV    // General appointment
  VISITE // Property visit
}

enum CrmAppointmentStatus {
  SCHEDULED
  CONFIRMED
  DONE
  NO_SHOW
  CANCELED
}
```

**Validation Rules**:
- `startAt` and `endAt` are required
- `endAt` must be after `startAt`
- `contactId` is required
- `status` must be valid enum value

**Business Rules**:
- New appointments default to `SCHEDULED` status
- Status transitions: SCHEDULED → CONFIRMED → DONE/NO_SHOW/CANCELED
- When appointment marked DONE, activity automatically created (FR-014, User Story 4)
- Appointments visible in agent calendar view

---

### 6. CrmDealProperty

**Purpose**: Links properties to deals (shortlist with match scores).

**Fields**:
```prisma
model CrmDealProperty {
  id                  String                  @id @default(uuid())
  tenantId            String                  @map("tenant_id")
  dealId              String                  @map("deal_id")
  propertyId          String                  @map("property_id") // FK to Property model (to be created)
  sourceOwnerContactId String?                @map("source_owner_contact_id") // If property belongs to client
  matchScore          Int?                    @map("match_score") // 0-100
  matchExplanationJson Json?                  @map("match_explanation_json") // Scoring breakdown
  status              CrmDealPropertyStatus   @default(SHORTLISTED)
  createdAt           DateTime                @default(now()) @map("created_at")

  tenant              Tenant                  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  deal                CrmDeal                 @relation(fields: [dealId], references: [id], onDelete: Cascade)
  sourceOwner         CrmContact?             @relation(fields: [sourceOwnerContactId], references: [id], onDelete: SetNull)

  @@unique([tenantId, dealId, propertyId])
  @@index([tenantId])
  @@index([tenantId, dealId])
  @@index([propertyId])
  @@index([matchScore])
  @@map("crm_deal_properties")
}
```

**Enum**:
```prisma
enum CrmDealPropertyStatus {
  SHORTLISTED  // Added to shortlist
  PROPOSED     // Sent to client
  VISITED      // Client visited property
  REJECTED     // Client rejected
  SELECTED     // Client selected property
}
```

**Validation Rules**:
- `matchScore` must be between 0 and 100 (if provided)
- `propertyId` must reference existing Property (to be created)
- Unique constraint: one property can only be added once per deal

**Business Rules**:
- Properties added via matching algorithm have `matchScore` and `matchExplanationJson`
- Properties can be manually added (no score)
- Status tracks client interaction (SHORTLISTED → PROPOSED → VISITED → SELECTED/REJECTED)
- Match explanation stored as JSON with scoring breakdown (research.md)

---

### 7. CrmTag

**Purpose**: Categorization labels for contacts (tenant-scoped).

**Fields**:
```prisma
model CrmTag {
  id        String   @id @default(uuid())
  tenantId  String   @map("tenant_id")
  name      String
  color     String?  // Optional color for UI display
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  contacts  CrmContactTag[]

  @@unique([tenantId, name])
  @@index([tenantId])
  @@map("crm_tags")
}
```

**Validation Rules**:
- `name` is required
- `name` must be unique within tenant
- `color` is optional (hex color code format)

**Business Rules**:
- Tags are tenant-scoped (FR-027)
- Tags can be assigned to multiple contacts
- Tags enable filtering and categorization

---

### 8. CrmContactTag

**Purpose**: Many-to-many relationship between contacts and tags.

**Fields**:
```prisma
model CrmContactTag {
  id        String   @id @default(uuid())
  contactId String   @map("contact_id")
  tagId     String   @map("tag_id")
  createdAt DateTime @default(now()) @map("created_at")

  contact   CrmContact @relation(fields: [contactId], references: [id], onDelete: Cascade)
  tag       CrmTag     @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@unique([contactId, tagId])
  @@index([contactId])
  @@index([tagId])
  @@map("crm_contact_tags")
}
```

---

### 9. CrmNote

**Purpose**: Internal documentation attached to contacts, deals, or properties.

**Fields**:
```prisma
model CrmNote {
  id          String       @id @default(uuid())
  tenantId    String       @map("tenant_id")
  entityType  CrmEntityType @map("entity_type")
  entityId    String       @map("entity_id")
  content     String       @db.Text
  createdByUserId String   @map("created_by_user_id")
  createdAt   DateTime     @default(now()) @map("created_at")

  tenant      Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  createdBy   User         @relation(fields: [createdByUserId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([tenantId, entityType, entityId])
  @@index([createdByUserId])
  @@map("crm_notes")
}
```

**Enum**:
```prisma
enum CrmEntityType {
  CONTACT
  DEAL
  PROPERTY
}
```

**Validation Rules**:
- `content` is required
- `entityType` and `entityId` must be provided
- `createdByUserId` is required

**Business Rules**:
- Notes are immutable (no updates/deletes) - add new note to update
- Notes attached to contacts, deals, or properties for internal documentation

---

## Relationships Summary

- **Tenant** → CrmContact (one-to-many)
- **CrmContact** → CrmContactRole (one-to-many, multiple active roles)
- **CrmContact** → CrmDeal (one-to-many)
- **CrmContact** → CrmActivity (one-to-many)
- **CrmContact** → CrmAppointment (one-to-many)
- **CrmContact** → CrmTag (many-to-many via CrmContactTag)
- **CrmDeal** → CrmActivity (one-to-many)
- **CrmDeal** → CrmAppointment (one-to-many)
- **CrmDeal** → CrmDealProperty (one-to-many, shortlist)
- **CrmDealProperty** → Property (many-to-one, FK to Property model - to be created)
- **User** → CrmContact (assigned to, many-to-one)
- **User** → CrmDeal (assigned to, many-to-one)
- **User** → CrmActivity (created by, many-to-one)
- **User** → CrmAppointment (assigned to, many-to-one)

---

## Indexes

All tables include:
- `tenantId` index for tenant isolation queries
- Composite indexes for common query patterns (tenantId + status, tenantId + contactId, etc.)
- Foreign key indexes for joins
- Unique constraints where needed (tenantId + email for contacts, tenantId + dealId + propertyId for deal properties)

---

## Tenant Isolation

All CRM tables include `tenantId` field and enforce tenant isolation:
- All queries MUST filter by `tenantId` (FR-002)
- Foreign key relationships ensure cascade deletes within tenant scope
- Unique constraints are tenant-scoped (e.g., email uniqueness per tenant)
- Cross-tenant access returns 403 Forbidden (FR-002, SC-005)

---

## Audit Trail Integration

All create/update/delete operations on CRM entities are logged in `AuditLog` table (FR-030):
- Actor (user who performed operation)
- Timestamp
- Operation type (create/update/delete)
- Entity type (contact/deal/activity)
- Entity ID
- Changed fields (field name + new value for updates)

See existing `AuditLog` model in schema for structure.





