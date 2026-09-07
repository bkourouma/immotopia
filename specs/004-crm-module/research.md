# Research: CRM & Client Relationship Management

**Feature**: 004-crm-module  
**Date**: 2025-01-27  
**Purpose**: Resolve technical unknowns and research decisions for CRM implementation

---

## 1. Property Data Access

**Research Question**: How to access property/listing data for matching? Does a Property model exist, or need to be created?

**Decision**: Property model does not exist in current schema. For MVP, assume properties will be stored in a separate `Property` model that will be created as part of property management module. CRM matching service will access properties via Prisma with tenant isolation.

**Rationale**: 
- Spec assumes property data exists and is accessible (Assumptions section)
- CRM matching is V1 deterministic - doesn't require complex property relationships
- Property model will be created in future feature, CRM can reference it via foreign key
- Matching algorithm works with basic property fields (price, location, rooms, surface, type)

**Alternatives Considered**:
- Creating Property model now: Rejected - property management is separate domain, would expand scope
- Using external API for properties: Rejected - violates tenant isolation, adds complexity
- Mock property data: Rejected - matching needs real data for production value

**Implementation Notes**:
- Create `Property` model placeholder in schema with basic fields needed for matching
- CRM matching service will query `properties` table filtered by `tenant_id`
- Property fields needed: id, tenant_id, price, location (zone/city), rooms, surface, type, furnishing_status, status (available/rented/sold)
- Foreign key from `crm_deal_properties.property_id` to `properties.id`

---

## 2. Matching Algorithm Details

**Research Question**: Exact scoring weights and thresholds for property matching V1? Budget fit (0-30), Zone fit (0-25), Pièces/surface (0-25), Extras (0-20) - are these correct?

**Decision**: Use the scoring weights from specification: Budget fit (0-30), Zone fit (0-25), Pièces/surface (0-25), Extras (0-20). Total max score = 100.

**Rationale**:
- Weights align with specification document (Section F - Matching automatique V1)
- Budget is highest weight (30%) - primary filter criterion
- Zone and size (rooms/surface) equally important (25% each)
- Extras (furnishing, parking, etc.) lower weight (20%) - nice-to-have
- Simple, deterministic algorithm suitable for V1

**Scoring Rules**:
- **Budget fit (0-30)**: 
  - Perfect match (deal budget range contains property price): 30 points
  - Property within 10% of budget range: 25 points
  - Property within 20% of budget range: 20 points
  - Property within 30% of budget range: 15 points
  - Otherwise: 0 points
- **Zone fit (0-25)**:
  - Exact zone match: 25 points
  - Same city/region: 15 points
  - Same department: 10 points
  - Otherwise: 0 points
- **Pièces/surface (0-25)**:
  - Rooms match exactly: 15 points
  - Rooms within ±1: 10 points
  - Surface within ±10%: 10 points
  - Surface within ±20%: 5 points
  - Otherwise: 0 points
- **Extras (0-20)**:
  - Furnishing status match: 10 points
  - Parking available (if requested): 5 points
  - Balcony/terrace (if requested): 5 points
  - Otherwise: 0 points

**Implementation Notes**:
- Scoring function returns 0-100 integer score
- Minimum threshold for inclusion: 40 points (configurable)
- Top 10 matches returned, sorted by score descending
- Match explanation stored as JSON with breakdown of each scoring component

---

## 3. Contact Merge Strategy

**Research Question**: If duplicates exist from migration, what's the merge process? Manual merge UI vs automated merge?

**Decision**: Manual merge via UI, with automated duplicate detection and suggestion.

**Rationale**:
- Email uniqueness enforcement prevents new duplicates (FR-001a)
- Existing duplicates from migration need manual review for data quality
- Automated merge too risky - may merge different people with same email
- Agent review ensures correct data combination

**Merge Process**:
1. System detects potential duplicates (same email within tenant)
2. UI shows duplicate suggestions to agent
3. Agent reviews and initiates merge
4. Merge combines: activities, deals, roles, tags, notes
5. All historical data preserved (activities, audit logs maintain original contact_id references)
6. Primary contact keeps original ID, merged contact marked as archived

**Alternatives Considered**:
- Fully automated merge: Rejected - risk of merging different people
- No merge support: Rejected - duplicate management is business requirement
- Bulk merge tool: Deferred to future - manual merge sufficient for MVP

**Implementation Notes**:
- Duplicate detection: Same email OR same phone within tenant
- Merge API endpoint: `POST /tenants/:id/crm/contacts/:id/merge`
- Merge creates audit log entry with before/after state
- Merged contact archived but not deleted (preserves referential integrity)

---

## 4. Activity History Immutability

**Research Question**: How to handle corrections? Add correction activity or allow updates with audit trail?

**Decision**: Activities are immutable (FR-020). Corrections handled by adding new "correction" activity linked to original activity.

**Rationale**:
- FR-020 explicitly states activities cannot be deleted, only new activities added
- Immutability ensures complete audit trail and accountability
- Correction activities provide clear audit trail of changes
- Matches industry best practices for CRM systems

**Correction Process**:
1. Agent creates new activity with type "NOTE" or "CORRECTION"
2. Correction activity references original activity via metadata
3. Correction includes explanation of what was corrected
4. UI shows correction activities alongside original, clearly marked
5. Timeline view shows: original activity → correction activity (linked)

**Alternatives Considered**:
- Allow updates with version history: Rejected - violates FR-020, complicates audit trail
- Soft delete and recreate: Rejected - loses original timestamp, breaks immutability
- Status field (active/corrected): Rejected - adds complexity, correction activity clearer

**Implementation Notes**:
- Activity model has no `deleted_at` or `updated_at` (only `created_at`)
- Correction activities have `correction_of_activity_id` optional field
- UI shows correction badge/icon for correction activities
- Activity timeline groups corrections with original activity

---

## 5. Optimistic Locking Implementation

**Research Question**: Version field on deals for concurrent edit detection? Or timestamp-based?

**Decision**: Use version field (integer) on Deal model for optimistic locking.

**Rationale**:
- Version field is standard pattern for optimistic locking
- More reliable than timestamp (avoids clock skew issues)
- Clearer conflict detection logic
- Prisma supports version fields with `@@versioned` or manual increment

**Conflict Resolution**:
1. Deal has `version` integer field (starts at 1, increments on each update)
2. Update request includes `version` in body
3. Service checks `version` matches current DB value
4. If match: update deal, increment version
5. If mismatch: return 409 Conflict with current deal state
6. Frontend handles conflict by showing current state and asking user to retry

**Alternatives Considered**:
- Timestamp-based (updatedAt): Rejected - clock skew can cause false conflicts
- Pessimistic locking (SELECT FOR UPDATE): Rejected - too heavy, blocks other users unnecessarily
- Last-write-wins: Rejected - loses user changes, poor UX
- Merging changes: Rejected - complex, risk of semantic conflicts (e.g., conflicting stage transitions)

**Implementation Notes**:
- Add `version Int @default(1)` to Deal model
- Service increments version on each update: `version: { increment: 1 }`
- API response includes `version` field
- Frontend includes `version` in update requests
- 409 Conflict response includes current deal state for UI refresh

---

## Summary

All technical unknowns resolved:

1. ✅ **Property Data Access**: Reference Property model (to be created), basic fields for matching
2. ✅ **Matching Algorithm**: Scoring weights from spec (30/25/25/20), detailed scoring rules defined
3. ✅ **Contact Merge**: Manual merge with duplicate detection suggestions
4. ✅ **Activity Immutability**: Correction activities, no updates/deletes
5. ✅ **Optimistic Locking**: Version field on Deal model, 409 Conflict for mismatches

All decisions align with existing codebase patterns and specification requirements. Ready for Phase 1 design.





