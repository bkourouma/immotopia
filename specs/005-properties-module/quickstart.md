# Quick Start Guide: Properties & Listings Module

**Feature**: 005-properties-module  
**Date**: 2025-01-27  
**Purpose**: Developer guide for implementing and using the Properties module

---

## Overview

The Properties & Listings Module is the single source of truth for all real estate assets in ImmoTopia. It supports multiple property types with type-specific templates, tenant-owned and public properties, management mandates, CRM integration, and advanced features like quality scoring and workflow management.

---

## Prerequisites

- Node.js >=18.x (LTS)
- PostgreSQL >=14
- Existing ImmoTopia backend with:
  - Multi-tenant RBAC system (003-multi-tenant-rbac)
  - CRM module (004-crm-module)
  - User authentication
  - File storage infrastructure

---

## Database Setup

### 1. Run Migration

```bash
cd packages/api
npm run prisma:migrate
```

This creates all Property-related tables:
- `properties`
- `property_type_templates`
- `property_media`
- `property_documents`
- `property_status_history`
- `property_visits`
- `property_mandates`
- `property_quality_scores`

### 2. Seed Property Type Templates

```bash
npm run prisma:seed:property-templates
```

This seeds templates for all 12+ property types (Appartement, Maison/Villa, Studio, etc.).

---

## Backend Implementation

### 1. Service Layer

Create property services following existing patterns:

```typescript
// packages/api/src/services/property-service.ts
import { prisma } from '../utils/database';
import { generatePropertyReference } from '../utils/property-reference-generator';

export async function createProperty(
  tenantId: string,
  data: CreatePropertyRequest,
  actorUserId: string
) {
  // Generate unique reference
  const internalReference = await generatePropertyReference(tenantId, null);
  
  // Validate against template
  const template = await getPropertyTemplate(data.propertyType);
  await validatePropertyData(data, template);
  
  // Create property
  const property = await prisma.property.create({
    data: {
      ...data,
      tenantId,
      internalReference,
      status: 'DRAFT',
      createdAt: new Date(),
    },
  });
  
  // Calculate quality score
  await calculateAndStoreQualityScore(property.id);
  
  // Audit log
  await logAuditEvent(/* ... */);
  
  return property;
}
```

### 2. Controller Layer

```typescript
// packages/api/src/controllers/property-controller.ts
import { Request, Response } from 'express';
import { createProperty } from '../services/property-service';
import { requirePermission } from '../middleware/rbac-middleware';

export const propertyController = {
  create: [
    requirePermission('PROPERTIES_CREATE'),
    async (req: Request, res: Response) => {
      const tenantId = req.tenantContext?.tenantId;
      const userId = req.user?.userId;
      
      const property = await createProperty(tenantId!, req.body, userId!);
      res.status(201).json(property);
    },
  ],
  // ... other endpoints
};
```

### 3. Routes

```typescript
// packages/api/src/routes/property-routes.ts
import { Router } from 'express';
import { propertyController } from '../controllers/property-controller';
import { requireAuth } from '../middleware/auth-middleware';
import { requireTenantContext } from '../middleware/tenant-middleware';

const router = Router();

router.use(requireAuth);
router.use(requireTenantContext);

router.get('/tenants/:tenantId/properties', propertyController.list);
router.post('/tenants/:tenantId/properties', propertyController.create);
router.get('/tenants/:tenantId/properties/:id', propertyController.get);
router.put('/tenants/:tenantId/properties/:id', propertyController.update);
router.post('/tenants/:tenantId/properties/:id/publish', propertyController.publish);
// ... more routes
```

---

## Frontend Implementation

### 1. Property Service

```typescript
// apps/web/src/services/property-service.ts
import axios from 'axios';
import { API_BASE_URL } from '../config';

export const propertyService = {
  async list(tenantId: string, filters?: PropertyFilters) {
    const response = await axios.get(
      `${API_BASE_URL}/tenants/${tenantId}/properties`,
      { params: filters }
    );
    return response.data;
  },
  
  async create(tenantId: string, data: CreatePropertyData) {
    const response = await axios.post(
      `${API_BASE_URL}/tenants/${tenantId}/properties`,
      data
    );
    return response.data;
  },
  
  // ... more methods
};
```

### 2. Property Form Component

```typescript
// apps/web/src/components/properties/PropertyForm.tsx
import { useState, useEffect } from 'react';
import { propertyService } from '../../services/property-service';

export function PropertyForm({ propertyType, onSubmit }) {
  const [template, setTemplate] = useState(null);
  const [formData, setFormData] = useState({});
  
  useEffect(() => {
    // Load template for property type
    propertyService.getTemplate(propertyType).then(setTemplate);
  }, [propertyType]);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    await onSubmit(formData);
  };
  
  // Render form based on template
  return (
    <form onSubmit={handleSubmit}>
      {/* Render fields from template */}
    </form>
  );
}
```

---

## Key Features Implementation

### 1. Property Matching

```typescript
// packages/api/src/services/property-matching-service.ts
export async function matchPropertiesForDeal(
  dealId: string,
  tenantId: string
): Promise<PropertyMatch[]> {
  const deal = await getCrmDeal(dealId);
  const criteria = extractCriteriaFromDeal(deal);
  
  // Get available properties
  const properties = await getAvailableProperties(tenantId);
  
  // Calculate match scores
  const matches = properties.map(property => ({
    property,
    matchScore: calculateMatchScore(property, criteria),
    matchExplanation: generateExplanation(property, criteria),
    matchedCriteria: getMatchedCriteria(property, criteria),
  }));
  
  // Sort by score (descending)
  return matches.sort((a, b) => b.matchScore - a.matchScore);
}

function calculateMatchScore(
  property: Property,
  criteria: MatchCriteria
): number {
  let score = 0;
  
  // Budget match (30%)
  const budgetMatch = matchBudget(property.price, criteria);
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

### 2. Quality Score Calculation

```typescript
// packages/api/src/services/property-quality-service.ts
export async function calculateQualityScore(
  propertyId: string
): Promise<number> {
  const property = await getProperty(propertyId);
  
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
  
  const finalScore = Math.round(score * 100);
  
  // Store score
  await prisma.propertyQualityScore.create({
    data: {
      propertyId,
      score: finalScore,
      suggestions: generateSuggestions(property, finalScore),
    },
  });
  
  return finalScore;
}
```

### 3. Document Expiration Management

```typescript
// packages/api/src/services/property-document-service.ts
// Scheduled job (run daily)
export async function checkDocumentExpiration() {
  const today = new Date();
  const warningDate = addDays(today, 30);
  const graceEndDate = addDays(today, -7);
  
  // Properties with documents expiring in 30 days
  const warningProperties = await prisma.property.findMany({
    where: {
      documents: {
        some: {
          expirationDate: {
            lte: warningDate,
            gte: today,
          },
          warningSentAt: null,
        },
      },
    },
  });
  
  // Send warnings
  for (const property of warningProperties) {
    await notifyAgents(property);
    await updateDocumentWarningSent(property.id);
  }
  
  // Properties past grace period
  const expiredProperties = await prisma.property.findMany({
    where: {
      documents: {
        some: {
          expirationDate: {
            lt: graceEndDate,
          },
        },
      },
      isPublished: true,
    },
  });
  
  // Auto-unpublish
  for (const property of expiredProperties) {
    await unpublishProperty(property.id);
  }
}
```

---

## Testing

### Unit Tests

```typescript
// packages/api/__tests__/unit/property-matching.test.ts
import { calculateMatchScore } from '../../src/services/property-matching-service';

describe('Property Matching', () => {
  it('should calculate match score correctly', () => {
    const property = {
      price: 250000,
      locationZone: 'Paris',
      surfaceArea: 80,
      rooms: 3,
    };
    
    const criteria = {
      budgetMin: 200000,
      budgetMax: 300000,
      location: 'Paris',
      sizeMin: 70,
      roomsMin: 3,
    };
    
    const score = calculateMatchScore(property, criteria);
    expect(score).toBeGreaterThan(80); // High match
  });
});
```

### Integration Tests

```typescript
// packages/api/__tests__/integration/property.integration.test.ts
import request from 'supertest';
import { app } from '../../src/index';

describe('Property API', () => {
  it('should create property', async () => {
    const response = await request(app)
      .post('/api/tenants/test-tenant-id/properties')
      .set('Authorization', `Bearer ${token}`)
      .send({
        propertyType: 'APPARTEMENT',
        ownershipType: 'TENANT',
        title: 'Beautiful Apartment',
        address: '123 Main St, Paris',
      });
    
    expect(response.status).toBe(201);
    expect(response.body.internalReference).toMatch(/^PROP-/);
  });
});
```

---

## Common Tasks

### Creating a Property

1. Select property type (triggers template load)
2. Fill required fields based on template
3. Upload primary photo
4. Add geolocation (automatic or manual)
5. Save (creates in DRAFT status)
6. Publish (if meets requirements)

### Matching Properties to Deals

1. Open CRM deal
2. Click "Match Properties"
3. System calculates scores using weighted algorithm
4. Review ranked matches
5. Add to shortlist
6. Update status (PROPOSED, VISITED, SELECTED)

### Managing Document Expiration

1. System checks daily for expiring documents
2. Sends warning 30 days before expiration
3. Grace period: 7 days after expiration (property flagged)
4. Auto-unpublish after grace period if not renewed

---

## Performance Considerations

- **Search**: Use indexes on `property_type`, `status`, `location_zone`, `latitude/longitude`
- **Matching**: Cache property data, limit results to top 20 matches
- **Media Upload**: Use async upload with progress tracking
- **Quality Score**: Calculate on create/update, cache results

---

## Next Steps

1. Implement property CRUD operations
2. Add type-specific template validation
3. Implement media upload
4. Add search and filtering
5. Integrate with CRM matching
6. Add quality scoring
7. Implement document expiration management
8. Create public portal interface

---

## Resources

- [Specification](./spec.md)
- [Data Model](./data-model.md)
- [API Contracts](./contracts/openapi.yaml)
- [Research Findings](./research.md)





