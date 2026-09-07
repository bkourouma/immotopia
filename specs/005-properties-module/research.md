# Research: Properties & Listings Module

**Feature**: 005-properties-module  
**Date**: 2025-01-27  
**Purpose**: Resolve technical unknowns and establish implementation patterns

---

## 1. Property Type Template Structure

**Decision**: JSON-based template configuration stored in database with field definitions, validation rules, default values, and section organization.

**Rationale**: 
- Templates need to be configurable without code changes (FR-001, FR-002)
- JSON structure allows flexible field definitions per property type
- Database storage enables template versioning and updates
- Supports functional section organization (Building, Equipment, Legal, Charges, Utilities)

**Alternatives Considered**:
- Hard-coded templates in TypeScript: Rejected - not flexible, requires code changes for new types
- External configuration files: Rejected - harder to version and manage, requires deployment
- Separate table per property type: Rejected - too complex, difficult to maintain consistency

**Implementation Pattern**:
```typescript
interface PropertyTemplate {
  type: string; // e.g., "APPARTEMENT"
  fields: PropertyField[];
  sections: PropertySection[];
  validationRules: ValidationRule[];
}

interface PropertyField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'date';
  required: boolean;
  defaultValue?: any;
  validation?: ValidationRule;
  section: string;
}
```

---

## 2. Unique Reference Generation

**Decision**: Format `PROP-{YYYYMMDD}-{tenantId/ownerId prefix}-{sequential}` with collision detection and retry logic.

**Rationale**:
- Human-readable format helps agents identify properties (Clarification Q2)
- Includes date for chronological organization
- Includes tenant/owner prefix for context
- Sequential number ensures uniqueness within day/prefix combination
- Collision detection handles concurrent creation scenarios

**Alternatives Considered**:
- UUID format: Rejected - not human-readable, difficult for agents to reference
- User-entered references: Rejected - risk of duplicates, requires validation overhead
- Simple sequential numbers: Rejected - lacks context, harder to identify property origin

**Implementation Pattern**:
```typescript
function generatePropertyReference(
  tenantId: string | null,
  ownerId: string | null
): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = tenantId ? `T${tenantId.slice(0, 3)}` : `O${ownerId.slice(0, 3)}`;
  const sequential = await getNextSequentialNumber(date, prefix);
  return `PROP-${date}-${prefix}-${sequential.toString().padStart(4, '0')}`;
}
```

---

## 3. Property Matching Algorithm

**Decision**: Weighted scoring algorithm with explicit criteria weights: budget 30%, location 25%, size/rooms 20%, features 15%, price coherence 10%. Exact matches score higher than approximate matches.

**Rationale**:
- Weighted scoring provides transparent, explainable matching (Clarification Q3, FR-018)
- Explicit weights allow tuning based on business priorities
- Exact vs approximate differentiation ensures quality matches rank higher
- Scores (0-100) provide clear ranking for agents

**Alternatives Considered**:
- Binary matching (match/no match): Rejected - too simplistic, doesn't rank results
- Machine learning-based: Rejected - requires training data, less explainable, V2 enhancement
- Equal weight scoring: Rejected - doesn't reflect business priorities (budget and location are more important)

**Implementation Pattern**:
```typescript
interface MatchCriteria {
  budgetMin: number;
  budgetMax: number;
  location: string;
  sizeMin?: number;
  roomsMin?: number;
  features: string[];
}

function calculateMatchScore(
  property: Property,
  criteria: MatchCriteria
): number {
  let score = 0;
  
  // Budget match (30%)
  const budgetMatch = matchBudget(property.price, criteria.budgetMin, criteria.budgetMax);
  score += budgetMatch * 0.30;
  
  // Location match (25%)
  const locationMatch = matchLocation(property.locationZone, criteria.location);
  score += locationMatch * 0.25;
  
  // Size/rooms match (20%)
  const sizeMatch = matchSize(property, criteria);
  score += sizeMatch * 0.20;
  
  // Features match (15%)
  const featuresMatch = matchFeatures(property.features, criteria.features);
  score += featuresMatch * 0.15;
  
  // Price coherence (10%)
  const priceCoherence = calculatePriceCoherence(property);
  score += priceCoherence * 0.10;
  
  return Math.round(score);
}
```

---

## 4. Document Expiration Management

**Decision**: Scheduled job runs daily to check document expiration dates. System notifies agents 30 days before expiration, provides 7-day grace period after expiration (property remains published but flagged), then auto-unpublishes if documents not renewed.

**Rationale**:
- Scheduled job ensures timely expiration checks (Clarification Q4, FR-029)
- 30-day warning gives agents time to renew documents
- 7-day grace period provides operational flexibility
- Auto-unpublish ensures compliance after grace period

**Alternatives Considered**:
- No grace period (immediate unpublish): Rejected - too strict, causes operational disruption
- Manual review only: Rejected - risk of non-compliance, requires constant monitoring
- Longer grace periods: Rejected - increases compliance risk

**Implementation Pattern**:
```typescript
async function checkDocumentExpiration() {
  const today = new Date();
  const warningDate = addDays(today, 30);
  const graceEndDate = addDays(today, -7);
  
  // Properties with documents expiring in 30 days
  const warningProperties = await findPropertiesWithExpiringDocuments(warningDate);
  await notifyAgents(warningProperties);
  
  // Properties past grace period
  const expiredProperties = await findPropertiesWithExpiredDocuments(graceEndDate);
  await unpublishProperties(expiredProperties);
  
  // Properties in grace period (flag but don't unpublish)
  const graceProperties = await findPropertiesInGracePeriod(today, graceEndDate);
  await flagProperties(graceProperties);
}
```

---

## 5. Media Storage Integration

**Decision**: Integrate with existing file storage infrastructure. Support photos (JPEG, PNG), videos (MP4, WebM), and 360° tours (embedded URLs or file references). Store file references in database, actual files in storage system.

**Rationale**:
- Reuses existing storage infrastructure (Assumptions)
- Database stores metadata (file path, type, order, primary flag)
- Storage system handles actual file storage and CDN distribution
- Supports multiple media types as specified (FR-014, FR-015)

**Alternatives Considered**:
- Store files directly in database: Rejected - inefficient, database bloat
- External media service (S3, Cloudinary): Considered for V2, but existing infrastructure sufficient for MVP

**Implementation Pattern**:
```typescript
interface PropertyMedia {
  id: string;
  propertyId: string;
  type: 'PHOTO' | 'VIDEO' | 'TOUR_360';
  filePath: string;
  displayOrder: number;
  isPrimary: boolean;
  createdAt: Date;
}

async function uploadPropertyMedia(
  propertyId: string,
  file: File,
  type: MediaType
): Promise<PropertyMedia> {
  // Upload to storage system
  const filePath = await storageService.upload(file);
  
  // Store metadata in database
  return await prisma.propertyMedia.create({
    data: {
      propertyId,
      type,
      filePath,
      displayOrder: await getNextDisplayOrder(propertyId),
      isPrimary: false
    }
  });
}
```

---

## 6. Geolocation Services

**Decision**: Integrate with geocoding service (Google Maps API, Mapbox, or similar) for address geocoding and reverse geocoding. Store latitude/longitude in database. Allow manual geolocation entry if address parsing fails.

**Rationale**:
- Geolocation required for map display and location-based search (FR-013, FR-006)
- Address geocoding converts addresses to coordinates
- Reverse geocoding validates coordinates
- Manual entry provides fallback for incomplete addresses (Edge Cases)

**Alternatives Considered**:
- No geolocation: Rejected - required for map display and location search
- Manual entry only: Rejected - too time-consuming for agents
- Multiple geocoding services: Considered for V2 redundancy, single service sufficient for MVP

**Implementation Pattern**:
```typescript
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const result = await geocodingService.geocode(address);
    return { lat: result.latitude, lng: result.longitude };
  } catch (error) {
    logger.warn('Geocoding failed', { address, error });
    return null; // Allow manual entry
  }
}

async function validateGeolocation(lat: number, lng: number): Promise<boolean> {
  try {
    const result = await geocodingService.reverseGeocode(lat, lng);
    return result !== null;
  } catch (error) {
    return false;
  }
}
```

---

## 7. Quality Score Calculation

**Decision**: Formula based on required fields completion (40%), media presence (30%), geolocation accuracy (20%), and description quality (10%). Score range 0-100.

**Rationale**:
- Automatic quality scoring helps agents improve listings (FR-020, User Story 9)
- Weighted formula prioritizes data completeness
- Provides actionable suggestions for improvement
- Calculated on property creation/update (SC-007)

**Alternatives Considered**:
- Simple binary (complete/incomplete): Rejected - doesn't provide granular feedback
- Complex ML-based scoring: Rejected - V2 enhancement, deterministic formula sufficient for MVP

**Implementation Pattern**:
```typescript
function calculateQualityScore(property: Property): number {
  let score = 0;
  
  // Required fields completion (40%)
  const requiredFieldsComplete = getRequiredFieldsCompletion(property);
  score += requiredFieldsComplete * 0.40;
  
  // Media presence (30%)
  const mediaScore = calculateMediaScore(property.media);
  score += mediaScore * 0.30;
  
  // Geolocation accuracy (20%)
  const geolocationScore = property.latitude && property.longitude ? 1 : 0;
  score += geolocationScore * 0.20;
  
  // Description quality (10%)
  const descriptionScore = calculateDescriptionQuality(property.description);
  score += descriptionScore * 0.10;
  
  return Math.round(score * 100);
}

function getQualitySuggestions(property: Property): string[] {
  const suggestions: string[] = [];
  
  if (!property.primaryPhoto) {
    suggestions.push('Add a primary photo');
  }
  
  if (!property.latitude || !property.longitude) {
    suggestions.push('Add geolocation for map display');
  }
  
  const missingFields = getMissingRequiredFields(property);
  if (missingFields.length > 0) {
    suggestions.push(`Complete required fields: ${missingFields.join(', ')}`);
  }
  
  return suggestions;
}
```

---

## 8. Duplicate Detection Algorithm

**Decision**: Algorithm based on address similarity (fuzzy string matching), geolocation proximity (within 100m), surface area similarity (within 10%), and owner matching. Notify agents for confirmation when duplicates detected.

**Rationale**:
- Prevents duplicate property listings (FR-024, Edge Cases)
- Multiple criteria reduce false positives
- Agent confirmation ensures accuracy
- Considers tenant scope (properties in different tenants not duplicates)

**Alternatives Considered**:
- Exact address match only: Rejected - misses variations (e.g., "123 Main St" vs "123 Main Street")
- Manual duplicate checking: Rejected - too time-consuming, error-prone
- Automatic merge: Rejected - risk of merging distinct properties

**Implementation Pattern**:
```typescript
interface DuplicateCheckResult {
  isDuplicate: boolean;
  confidence: number; // 0-100
  matchedProperty?: Property;
  reasons: string[];
}

async function checkDuplicateProperty(
  property: Property
): Promise<DuplicateCheckResult> {
  const checks: CheckResult[] = [];
  
  // Address similarity (fuzzy matching)
  const addressMatches = await findSimilarAddresses(property.address);
  checks.push({ type: 'address', matches: addressMatches });
  
  // Geolocation proximity (within 100m)
  if (property.latitude && property.longitude) {
    const proximityMatches = await findNearbyProperties(
      property.latitude,
      property.longitude,
      100 // meters
    );
    checks.push({ type: 'geolocation', matches: proximityMatches });
  }
  
  // Surface area similarity (within 10%)
  const areaMatches = await findSimilarAreaProperties(
    property.surfaceArea,
    0.10 // 10% tolerance
  );
  checks.push({ type: 'area', matches: areaMatches });
  
  // Owner matching
  const ownerMatches = await findPropertiesByOwner(property.ownerId);
  checks.push({ type: 'owner', matches: ownerMatches });
  
  // Calculate confidence score
  const confidence = calculateConfidence(checks);
  
  return {
    isDuplicate: confidence > 70, // Threshold
    confidence,
    matchedProperty: getBestMatch(checks),
    reasons: getMatchReasons(checks)
  };
}
```

---

## Summary

All technical unknowns have been resolved with clear implementation patterns. The research establishes:
- ✅ Template structure and configuration approach
- ✅ Reference generation algorithm
- ✅ Matching scoring implementation
- ✅ Document expiration workflow
- ✅ Media storage integration
- ✅ Geolocation service patterns
- ✅ Quality score calculation
- ✅ Duplicate detection algorithm

These decisions provide a solid foundation for Phase 1 design and implementation.





