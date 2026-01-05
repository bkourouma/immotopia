# Data Model: Properties & Listings Module

**Feature**: 005-properties-module  
**Date**: 2025-01-27  
**Purpose**: Define database schema extensions for Properties & Listings system

---

## Overview

This document extends the existing Prisma schema (`packages/api/prisma/schema.prisma`) with new entities for:
- Properties (core property entity with type-specific data)
- Property Type Templates (template definitions for property types)
- Property Media (photos, videos, 360° tours)
- Property Documents (legal documents with expiration tracking)
- Property Status History (workflow status transitions)
- Property Visits (scheduled property viewings)
- Management Mandates (delegation of property management)
- Property Containers (parent properties with child lots)
- Property Quality Scores (completeness and quality metrics)
- Property Matches (CRM deal property shortlists - extends existing CrmDealProperty)

**Dependencies**:
- Existing: User, Tenant, Membership, AuditLog, CrmDeal, CrmContact models
- Property matching uses existing CrmDealProperty model (created in CRM module)

---

## Schema Extensions

### 1. Property

**Purpose**: Core entity representing a real estate asset with type, ownership, location, pricing, and characteristics.

**Fields**:
```prisma
model Property {
  id                  String            @id @default(uuid())
  internalReference   String            @unique @map("internal_reference") // PROP-{YYYYMMDD}-{prefix}-{seq}
  propertyType        PropertyType      @map("property_type")
  ownershipType       PropertyOwnershipType @map("ownership_type")
  
  // Ownership
  tenantId            String?           @map("tenant_id")
  ownerUserId         String?           @map("owner_user_id") // Private owner (non-tenant)
  
  // Basic Information
  title               String
  description         String            @db.Text
  address             String
  locationZone        String?           @map("location_zone")
  latitude            Float?
  longitude           Float?
  
  // Transaction
  transactionModes    PropertyTransactionMode[] @map("transaction_modes")
  price               Float?            // Sale price or rental price
  fees                Float?             // Fees/commissions
  currency            String             @default("EUR")
  
  // Physical Characteristics
  surfaceArea         Float?            @map("surface_area") // m²
  surfaceUseful       Float?            @map("surface_useful") // m²
  surfaceTerrain      Float?            @map("surface_terrain") // m² (for land)
  rooms               Int?
  bedrooms            Int?
  bathrooms           Int?
  furnishingStatus    PropertyFurnishingStatus? @map("furnishing_status")
  
  // Status and Workflow
  status              PropertyStatus    @default(DRAFT)
  isPublished         Boolean           @default(false) @map("is_published")
  publishedAt         DateTime?         @map("published_at")
  availability        PropertyAvailability @default(AVAILABLE)
  
  // Quality and Scoring
  qualityScore        Int?             @map("quality_score") // 0-100
  qualityScoreUpdatedAt DateTime?      @map("quality_score_updated_at")
  
  // Type-Specific Data (JSON field for flexible schema)
  typeSpecificData    Json?             @map("type_specific_data")
  
  // Timestamps
  createdAt           DateTime          @default(now()) @map("created_at")
  updatedAt           DateTime          @updatedAt @map("updated_at")
  
  // Relationships
  tenant              Tenant?           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  owner               User?             @relation("PropertyOwner", fields: [ownerUserId], references: [id], onDelete: SetNull)
  media               PropertyMedia[]
  documents           PropertyDocument[]
  statusHistory       PropertyStatusHistory[]
  visits              PropertyVisit[]
  mandates            PropertyMandate[]
  containerParent     Property?         @relation("PropertyContainer", fields: [containerParentId], references: [id], onDelete: SetNull)
  containerParentId   String?           @map("container_parent_id")
  containerChildren   Property[]        @relation("PropertyContainer")
  qualityScores       PropertyQualityScore[]
  crmDealProperties   CrmDealProperty[] // Links to CRM deals
  
  @@index([tenantId])
  @@index([ownerUserId])
  @@index([propertyType])
  @@index([ownershipType])
  @@index([status])
  @@index([isPublished])
  @@index([latitude, longitude]) // For geolocation search
  @@index([locationZone])
  @@index([containerParentId])
  @@map("properties")
}
```

**Enums**:
```prisma
enum PropertyType {
  APPARTEMENT
  MAISON_VILLA
  STUDIO
  DUPLEX_TRIPLEX
  CHAMBRE_COLOCATION
  BUREAU
  BOUTIQUE_COMMERCIAL
  ENTREPOT_INDUSTRIEL
  TERRAIN
  IMMEUBLE
  PARKING_BOX
  LOT_PROGRAMME_NEUF
}

enum PropertyOwnershipType {
  TENANT    // Owned and managed by tenant
  PUBLIC    // Owned by registered private owner, published publicly
  CLIENT    // Private owner with management mandate to tenant
}

enum PropertyTransactionMode {
  SALE
  RENTAL
  SHORT_TERM
}

enum PropertyFurnishingStatus {
  FURNISHED
  UNFURNISHED
  PARTIALLY_FURNISHED
}

enum PropertyStatus {
  DRAFT
  UNDER_REVIEW
  AVAILABLE
  RESERVED
  UNDER_OFFER
  RENTED
  SOLD
  ARCHIVED
}

enum PropertyAvailability {
  AVAILABLE
  UNAVAILABLE
  SOON_AVAILABLE
}
```

**Validation Rules**:
- `title` is required (FR-006)
- `internalReference` is unique and auto-generated (Clarification Q2)
- `propertyType` must be one of the supported types (FR-001)
- `ownershipType` determines visibility and access (FR-003)
- `tenantId` required for TENANT ownership type
- `ownerUserId` required for PUBLIC/CLIENT ownership types
- `latitude` and `longitude` required for geolocation-based search (FR-013)
- `isPublished` can only be true if property meets minimum requirements (FR-011)

**Business Rules**:
- Properties with TENANT ownership are visible only within tenant scope (FR-025)
- Properties with PUBLIC ownership are visible on public portal (FR-026)
- Properties with CLIENT ownership have management mandates (FR-005)
- Unique reference format: PROP-{YYYYMMDD}-{prefix}-{sequential} (Clarification Q2)
- Quality score calculated on create/update (FR-020, SC-007)
- Status transitions recorded in status history (FR-009)

---

### 2. PropertyTypeTemplate

**Purpose**: Defines type-specific templates with field definitions, validation rules, and section organization.

**Fields**:
```prisma
model PropertyTypeTemplate {
  id                  String    @id @default(uuid())
  propertyType        PropertyType @unique @map("property_type")
  name                String
  description         String?   @db.Text
  
  // Template Configuration (JSON)
  fieldDefinitions    Json      @map("field_definitions") // Array of PropertyField
  sections            Json      @map("sections") // Array of PropertySection
  validationRules     Json      @map("validation_rules") // Array of ValidationRule
  
  // Versioning
  version             Int       @default(1)
  isActive            Boolean   @default(true) @map("is_active")
  
  createdAt           DateTime  @default(now()) @map("created_at")
  updatedAt           DateTime  @updatedAt @map("updated_at")
  
  @@map("property_type_templates")
}
```

**Validation Rules**:
- `propertyType` must be unique
- `fieldDefinitions` must be valid JSON array
- `sections` must be valid JSON array
- Template changes don't affect existing properties (Edge Cases)

**Business Rules**:
- Templates are versioned for tracking changes
- Only active templates are used for new property creation
- Existing properties retain their field values when templates are updated (Edge Cases)

---

### 3. PropertyMedia

**Purpose**: Represents photos, videos, or 360° virtual tours associated with a property.

**Fields**:
```prisma
model PropertyMedia {
  id                  String          @id @default(uuid())
  propertyId          String          @map("property_id")
  mediaType           PropertyMediaType @map("media_type")
  filePath            String          @map("file_path")
  fileUrl             String?         @map("file_url") // CDN URL
  fileName            String          @map("file_name")
  fileSize            Int?            @map("file_size") // bytes
  mimeType            String?         @map("mime_type")
  displayOrder        Int             @default(0) @map("display_order")
  isPrimary           Boolean         @default(false) @map("is_primary")
  metadata            Json?           // Additional metadata (dimensions, duration, etc.)
  createdAt           DateTime        @default(now()) @map("created_at")
  updatedAt           DateTime        @updatedAt @map("updated_at")
  
  property            Property        @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  
  @@index([propertyId])
  @@index([propertyId, displayOrder])
  @@index([propertyId, isPrimary])
  @@map("property_media")
}
```

**Enum**:
```prisma
enum PropertyMediaType {
  PHOTO
  VIDEO
  TOUR_360
}
```

**Validation Rules**:
- `filePath` is required
- `displayOrder` determines display sequence
- Only one media item can be `isPrimary` per property
- Supported file types: JPEG, PNG (photos), MP4, WebM (videos), embedded URLs (360° tours)

**Business Rules**:
- Media can be reordered by updating `displayOrder` (FR-014)
- Primary image is used for listings and thumbnails (FR-014)
- Media upload completes within 10 seconds per photo (SC-006)

---

### 4. PropertyDocument

**Purpose**: Represents legal or reference documents (title deeds, mandates, plans, tax documents) with expiration tracking.

**Fields**:
```prisma
model PropertyDocument {
  id                  String              @id @default(uuid())
  propertyId          String              @map("property_id")
  documentType        PropertyDocumentType @map("document_type")
  filePath            String              @map("file_path")
  fileUrl             String?             @map("file_url")
  fileName            String              @map("file_name")
  fileSize            Int?                 @map("file_size")
  mimeType            String?             @map("mime_type")
  
  // Expiration Tracking
  expirationDate      DateTime?           @map("expiration_date")
  warningSentAt      DateTime?           @map("warning_sent_at") // 30 days before expiration
  gracePeriodEndsAt  DateTime?           @map("grace_period_ends_at") // 7 days after expiration
  
  // Status
  isRequired          Boolean             @default(false) @map("is_required")
  isValid             Boolean             @default(true) @map("is_valid")
  
  createdAt           DateTime            @default(now()) @map("created_at")
  updatedAt           DateTime            @updatedAt @map("updated_at")
  
  property            Property            @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  
  @@index([propertyId])
  @@index([expirationDate])
  @@index([propertyId, documentType])
  @@map("property_documents")
}
```

**Enum**:
```prisma
enum PropertyDocumentType {
  TITLE_DEED
  MANDATE
  PLAN
  TAX_DOCUMENT
  OTHER
}
```

**Validation Rules**:
- `filePath` is required
- `documentType` must be one of the supported types
- `expirationDate` optional but tracked if provided
- Document type validation completes within 1 second (SC-013)

**Business Rules**:
- Documents with expiration dates trigger 30-day warnings (Clarification Q4, FR-029)
- 7-day grace period after expiration (Clarification Q4, FR-029)
- Properties with expired documents (past grace period) are auto-unpublished (FR-029)
- Properties with missing required documents cannot be published (FR-011)

---

### 5. PropertyStatusHistory

**Purpose**: Tracks property workflow status changes over time for audit trail and analysis.

**Fields**:
```prisma
model PropertyStatusHistory {
  id                  String          @id @default(uuid())
  propertyId          String          @map("property_id")
  previousStatus      PropertyStatus? @map("previous_status")
  newStatus           PropertyStatus  @map("new_status")
  changedByUserId     String          @map("changed_by_user_id")
  notes               String?         @db.Text
  createdAt           DateTime        @default(now()) @map("created_at")
  
  property            Property        @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  changedBy           User            @relation("PropertyStatusChangedBy", fields: [changedByUserId], references: [id])
  
  @@index([propertyId])
  @@index([propertyId, createdAt])
  @@index([changedByUserId])
  @@map("property_status_history")
}
```

**Validation Rules**:
- `newStatus` is required
- `changedByUserId` is required
- Status transitions are immutable (no updates/deletes)

**Business Rules**:
- All status transitions are recorded (FR-009)
- Backward moves (e.g., AVAILABLE → DRAFT) are logged for analysis (Edge Cases)
- Some transitions may require permissions (e.g., SOLD requires manager approval) (Edge Cases)
- Status transitions complete within 2 seconds (SC-010)

---

### 6. PropertyVisit

**Purpose**: Represents scheduled property viewings linked to properties, contacts, and deals.

**Fields**:
```prisma
model PropertyVisit {
  id                  String              @id @default(uuid())
  propertyId          String              @map("property_id")
  contactId           String?             @map("contact_id") // CRM contact
  dealId              String?             @map("deal_id") // CRM deal
  visitType           PropertyVisitType   @default(VISIT) @map("visit_type")
  scheduledAt         DateTime            @map("scheduled_at")
  duration            Int?                // minutes
  location            String?             // Property address or alternative location
  status              PropertyVisitStatus @default(SCHEDULED)
  assignedToUserId    String?             @map("assigned_to_user_id")
  notes               String?             @db.Text
  createdAt           DateTime            @default(now()) @map("created_at")
  updatedAt           DateTime            @updatedAt @map("updated_at")
  
  property            Property            @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  contact             CrmContact?        @relation(fields: [contactId], references: [id], onDelete: SetNull)
  deal                CrmDeal?           @relation(fields: [dealId], references: [id], onDelete: SetNull)
  assignedTo          User?               @relation("PropertyVisitAssignedTo", fields: [assignedToUserId], references: [id], onDelete: SetNull)
  
  @@index([propertyId])
  @@index([contactId])
  @@index([dealId])
  @@index([scheduledAt])
  @@index([assignedToUserId])
  @@index([status])
  @@map("property_visits")
}
```

**Enums**:
```prisma
enum PropertyVisitType {
  VISIT
  APPOINTMENT
}

enum PropertyVisitStatus {
  SCHEDULED
  CONFIRMED
  DONE
  NO_SHOW
  CANCELED
}
```

**Validation Rules**:
- `propertyId` is required
- `scheduledAt` must be in the future for new visits
- Visit scheduling completes within 5 seconds (SC-008)

**Business Rules**:
- Visits can be linked to CRM contacts and deals (FR-019, User Story 8)
- Visit completion automatically logs activity in CRM (User Story 8)
- Visits appear in agent calendar view (User Story 8)

---

### 7. PropertyMandate

**Purpose**: Represents delegation of property management from private owner to tenant.

**Fields**:
```prisma
model PropertyMandate {
  id                  String          @id @default(uuid())
  propertyId          String          @map("property_id")
  tenantId            String          @map("tenant_id")
  ownerUserId         String          @map("owner_user_id")
  
  // Mandate Details
  startDate           DateTime        @map("start_date")
  endDate             DateTime?       @map("end_date")
  scope               Json?           // Scope of management rights (full management per Clarification Q5)
  notes               String?         @db.Text
  
  // Status
  isActive            Boolean         @default(true) @map("is_active")
  revokedAt           DateTime?       @map("revoked_at")
  revokedByUserId     String?         @map("revoked_by_user_id")
  
  createdAt           DateTime        @default(now()) @map("created_at")
  updatedAt           DateTime        @updatedAt @map("updated_at")
  
  property            Property        @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  tenant              Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  owner               User            @relation("PropertyMandateOwner", fields: [ownerUserId], references: [id], onDelete: Cascade)
  revokedBy           User?           @relation("PropertyMandateRevokedBy", fields: [revokedByUserId], references: [id], onDelete: SetNull)
  
  @@unique([propertyId, tenantId, isActive]) // Only one active mandate per property-tenant
  @@index([propertyId])
  @@index([tenantId])
  @@index([ownerUserId])
  @@index([isActive])
  @@map("property_mandates")
}
```

**Validation Rules**:
- `propertyId`, `tenantId`, and `ownerUserId` are required
- `startDate` must be before `endDate` (if provided)
- Only one active mandate per property-tenant combination
- Mandate scope: full management rights except ownership transfer/deletion (Clarification Q5)

**Business Rules**:
- Mandates grant full management rights (edit all fields, change status, publish/unpublish, upload media/documents) (Clarification Q5)
- Mandates do not allow ownership transfer or property deletion (Clarification Q5)
- Revoked mandates preserve historical management data (Edge Cases)
- Property remains on public portal if published when mandate is revoked (Edge Cases)

---

### 8. PropertyQualityScore

**Purpose**: Tracks property quality scores and improvement suggestions over time.

**Fields**:
```prisma
model PropertyQualityScore {
  id                  String          @id @default(uuid())
  propertyId          String          @map("property_id")
  score               Int             // 0-100
  suggestions         Json            // Array of improvement suggestions
  calculatedAt        DateTime        @default(now()) @map("calculated_at")
  
  property            Property        @relation(fields: [propertyId], references: [id], onDelete: Cascade)
  
  @@index([propertyId])
  @@index([propertyId, calculatedAt])
  @@map("property_quality_scores")
}
```

**Validation Rules**:
- `score` must be between 0 and 100
- `suggestions` must be valid JSON array
- Quality scores calculated within 2 seconds (SC-007)

**Business Rules**:
- Quality score calculated on property create/update (FR-020)
- Score based on: required fields completion (40%), media presence (30%), geolocation accuracy (20%), description quality (10%) (Research)
- Suggestions include missing fields, media recommendations, price coherence warnings (FR-021)

---

## Relationships Summary

- **Tenant** → Property (one-to-many, for TENANT ownership)
- **User** → Property (one-to-many, for PUBLIC/CLIENT ownership via ownerUserId)
- **Property** → PropertyMedia (one-to-many)
- **Property** → PropertyDocument (one-to-many)
- **Property** → PropertyStatusHistory (one-to-many)
- **Property** → PropertyVisit (one-to-many)
- **Property** → PropertyMandate (one-to-many)
- **Property** → PropertyQualityScore (one-to-many)
- **Property** → Property (self-referential, container parent-child relationship)
- **Property** → CrmDealProperty (one-to-many, via existing CrmDealProperty model)
- **CrmContact** → PropertyVisit (one-to-many)
- **CrmDeal** → PropertyVisit (one-to-many)
- **User** → PropertyStatusHistory (changed by, many-to-one)
- **User** → PropertyVisit (assigned to, many-to-one)
- **User** → PropertyMandate (owner, many-to-one)

---

## Indexes and Performance

**Critical Indexes**:
- `properties.tenant_id` - Tenant isolation queries
- `properties.owner_user_id` - Private owner queries
- `properties.property_type` - Type filtering
- `properties.status` - Status filtering
- `properties.is_published` - Public portal queries
- `properties.latitude, longitude` - Geolocation search
- `properties.location_zone` - Location filtering
- `property_media.property_id, display_order` - Media ordering
- `property_documents.expiration_date` - Expiration checks
- `property_visits.scheduled_at` - Calendar queries

**Query Optimization**:
- Composite indexes for common filter combinations (type + status + location)
- Partial indexes for published properties (is_published = true)
- Indexes on foreign keys for join performance

---

## Migration Strategy

1. Create new tables in single migration
2. Seed property type templates for all 12+ types
3. Migrate existing property data (if any) with ownership type mapping
4. Create indexes after data migration for performance
5. Add constraints and validations after initial data load

---

## Notes

- Property matching uses existing `CrmDealProperty` model (created in CRM module)
- Type-specific data stored in JSON field for flexibility
- Template configuration stored as JSON for versioning and updates
- Quality score history maintained for trend analysis
- All timestamps use UTC for consistency





