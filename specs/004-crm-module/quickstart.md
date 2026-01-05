# Quick Start Guide: CRM & Client Relationship Management

**Feature**: 004-crm-module  
**Date**: 2025-01-27  
**Purpose**: Quick reference guide for implementing and testing the CRM module

---

## Overview

This guide provides a quick start for implementing the CRM module, including:
- Database schema setup
- API endpoints overview
- Key implementation patterns
- Testing checklist

---

## Prerequisites

- Multi-tenant RBAC infrastructure already implemented (003-multi-tenant-rbac)
- Tenant, User, Membership, Role, Permission models exist
- RBAC middleware and permission system in place
- Audit logging service available

---

## Database Setup

### 1. Create Migration

Run Prisma migration to add CRM tables:

```bash
cd packages/api
npm run prisma:migrate dev --name add_crm_module
```

This will create:
- `crm_contacts`
- `crm_contact_roles`
- `crm_deals`
- `crm_activities`
- `crm_appointments`
- `crm_deal_properties`
- `crm_tags`
- `crm_contact_tags`
- `crm_notes`

### 2. Seed CRM Permissions

Add CRM permissions to Permission table (via seed script or migration):

```sql
INSERT INTO permissions (key, description) VALUES
('CRM_CONTACTS_VIEW', 'View contacts'),
('CRM_CONTACTS_CREATE', 'Create contacts'),
('CRM_CONTACTS_EDIT', 'Edit contacts'),
('CRM_CONTACTS_ARCHIVE', 'Archive contacts'),
('CRM_DEALS_VIEW', 'View deals'),
('CRM_DEALS_CREATE', 'Create deals'),
('CRM_DEALS_EDIT', 'Edit deals'),
('CRM_DEALS_STAGE_CHANGE', 'Change deal stage'),
('CRM_ACTIVITIES_VIEW', 'View activities'),
('CRM_ACTIVITIES_CREATE', 'Create activities'),
('CRM_APPOINTMENTS_VIEW', 'View appointments'),
('CRM_APPOINTMENTS_CREATE', 'Create appointments'),
('CRM_APPOINTMENTS_EDIT', 'Edit appointments'),
('CRM_MATCHING_RUN', 'Run property matching'),
('CRM_MATCHING_VIEW', 'View property matches');
```

Assign permissions to appropriate roles (e.g., AGENT, MANAGER, ADMIN).

---

## Implementation Steps

### Phase 1: Core Entities and Services

1. **Create Prisma Schema Extensions**
   - Add CRM models to `packages/api/prisma/schema.prisma`
   - Reference data-model.md for complete schema
   - Run migration

2. **Create Service Layer**
   - `crm-contact-service.ts` - Contact CRUD, filtering, conversion
   - `crm-deal-service.ts` - Deal pipeline, stage management
   - `crm-activity-service.ts` - Activity logging
   - `crm-appointment-service.ts` - Appointment scheduling
   - `crm-matching-service.ts` - Property matching algorithm
   - `crm-tag-service.ts` - Tag management

3. **Create Controller Layer**
   - `crm-controller.ts` - Main CRM routes handler
   - Implement all endpoints from openapi.yaml

4. **Add Routes**
   - Create `crm-routes.ts` with tenant-scoped routes
   - Register in main router: `/tenants/:tenantId/crm/*`

### Phase 2: RBAC Integration

1. **Add CRM Permissions Check Middleware**
   - Create `crm-rbac-middleware.ts`
   - Check permissions before each CRM operation
   - Use existing permission service

2. **Enforce Tenant Isolation**
   - All service methods MUST accept `tenantId` parameter
   - All queries MUST filter by `tenantId`
   - Return 403 Forbidden on cross-tenant access attempts

3. **Audit Logging**
   - Log all create/update/delete operations
   - Use existing audit-service.ts
   - Include: actor, timestamp, operation type, entity type, entity ID, changed fields

### Phase 3: Property Matching (V1)

1. **Implement Matching Algorithm**
   - Scoring function: Budget (0-30), Zone (0-25), Size (0-25), Extras (0-20)
   - Minimum threshold: 40 points
   - Return top 10 matches sorted by score
   - Store match score and explanation in `crm_deal_properties`

2. **Property Model Dependency**
   - Property model should exist (or create placeholder)
   - Required fields: id, tenant_id, price, location, rooms, surface, type, status
   - Foreign key: `crm_deal_properties.property_id` → `properties.id`

---

## Key Implementation Patterns

### Tenant Isolation Pattern

```typescript
// Service method example
async function getContact(tenantId: string, contactId: string, userId: string) {
  // 1. Check permission
  await checkPermission(userId, tenantId, 'CRM_CONTACTS_VIEW');
  
  // 2. Query with tenant filter
  const contact = await prisma.crmContact.findFirst({
    where: {
      id: contactId,
      tenantId, // CRITICAL: Always filter by tenantId
    },
  });
  
  // 3. Return 404 if not found (tenant isolation)
  if (!contact) {
    throw new NotFoundError('Contact not found');
  }
  
  return contact;
}
```

### Optimistic Locking Pattern

```typescript
// Update deal with version check
async function updateDeal(tenantId: string, dealId: string, data: UpdateDealData, userId: string) {
  const deal = await prisma.crmDeal.findFirst({
    where: { id: dealId, tenantId },
  });
  
  // Check version match
  if (deal.version !== data.version) {
    throw new ConflictError('Deal was modified by another user', { currentVersion: deal.version });
  }
  
  // Update with version increment
  return await prisma.crmDeal.update({
    where: { id: dealId },
    data: {
      ...data,
      version: { increment: 1 },
    },
  });
}
```

### Activity Immutability Pattern

```typescript
// Activities cannot be updated or deleted
async function createActivity(tenantId: string, data: CreateActivityData, userId: string) {
  // Create activity (no update/delete methods)
  const activity = await prisma.crmActivity.create({
    data: {
      ...data,
      tenantId,
      createdByUserId: userId,
      occurredAt: data.occurredAt || new Date(),
    },
  });
  
  // Update contact's lastInteractionAt
  if (data.contactId) {
    await prisma.crmContact.update({
      where: { id: data.contactId },
      data: { lastInteractionAt: activity.occurredAt },
    });
  }
  
  // Log audit
  await auditService.log({
    actorUserId: userId,
    tenantId,
    actionKey: 'CRM_ACTIVITY_CREATE',
    entityType: 'ACTIVITY',
    entityId: activity.id,
  });
  
  return activity;
}
```

### Property Matching Pattern

```typescript
// Matching algorithm (V1 deterministic)
async function matchProperties(dealId: string, tenantId: string) {
  const deal = await getDeal(dealId, tenantId);
  
  // Get available properties for tenant
  const properties = await prisma.property.findMany({
    where: {
      tenantId,
      status: 'AVAILABLE',
    },
  });
  
  // Score each property
  const matches = properties.map(property => {
    const score = calculateMatchScore(deal, property);
    return { property, score, explanation: getScoreExplanation(deal, property) };
  });
  
  // Filter and sort
  const topMatches = matches
    .filter(m => m.score >= 40) // Minimum threshold
    .sort((a, b) => b.score - a.score)
    .slice(0, 10); // Top 10
  
  // Store in deal_properties
  for (const match of topMatches) {
    await prisma.crmDealProperty.upsert({
      where: {
        tenantId_dealId_propertyId: {
          tenantId,
          dealId,
          propertyId: match.property.id,
        },
      },
      create: {
        tenantId,
        dealId,
        propertyId: match.property.id,
        matchScore: match.score,
        matchExplanationJson: match.explanation,
        status: 'SHORTLISTED',
      },
      update: {
        matchScore: match.score,
        matchExplanationJson: match.explanation,
      },
    });
  }
  
  return topMatches;
}

function calculateMatchScore(deal: Deal, property: Property): number {
  let score = 0;
  
  // Budget fit (0-30)
  if (deal.budgetMin && deal.budgetMax && property.price) {
    if (property.price >= deal.budgetMin && property.price <= deal.budgetMax) {
      score += 30;
    } else {
      const diff = Math.abs(property.price - (deal.budgetMin + deal.budgetMax) / 2);
      const range = deal.budgetMax - deal.budgetMin;
      const percentage = (diff / range) * 100;
      if (percentage <= 10) score += 25;
      else if (percentage <= 20) score += 20;
      else if (percentage <= 30) score += 15;
    }
  }
  
  // Zone fit (0-25)
  if (deal.locationZone && property.location) {
    if (property.location === deal.locationZone) {
      score += 25;
    } else if (property.city === deal.locationZone) {
      score += 15;
    }
  }
  
  // Size fit (0-25)
  const criteria = deal.criteriaJson as any;
  if (criteria?.rooms && property.rooms === criteria.rooms) score += 15;
  if (criteria?.rooms && Math.abs(property.rooms - criteria.rooms) === 1) score += 10;
  if (criteria?.surface && property.surface) {
    const diff = Math.abs(property.surface - criteria.surface) / criteria.surface;
    if (diff <= 0.1) score += 10;
    else if (diff <= 0.2) score += 5;
  }
  
  // Extras (0-20)
  if (criteria?.furnishing === property.furnishingStatus) score += 10;
  if (criteria?.parking && property.parking) score += 5;
  if (criteria?.balcony && property.balcony) score += 5;
  
  return Math.min(100, score);
}
```

---

## Testing Checklist

### Unit Tests

- [ ] Contact service: create, read, update, list, filter
- [ ] Deal service: create, update stage, optimistic locking
- [ ] Activity service: create, list, immutability
- [ ] Matching service: scoring algorithm, threshold filtering
- [ ] Tag service: create, assign, filter

### Integration Tests

- [ ] Tenant isolation: cannot access other tenant's data
- [ ] Permission checks: operations fail without required permissions
- [ ] Email uniqueness: duplicate email within tenant rejected
- [ ] Contact conversion: lead to client preserves history
- [ ] Deal stage transitions: audit logged correctly
- [ ] Optimistic locking: concurrent updates return 409 Conflict
- [ ] Activity immutability: no update/delete operations
- [ ] Property matching: scores calculated correctly

### E2E Tests

- [ ] Create contact → view contact → update contact
- [ ] Create deal → move through stages → mark won
- [ ] Log activity → view timeline → create correction activity
- [ ] Schedule appointment → confirm → mark done
- [ ] Match properties → add to shortlist → update status
- [ ] Dashboard: KPIs load correctly

---

## Performance Considerations

- **Indexes**: Ensure all tenantId, foreign keys, and filter fields are indexed
- **Pagination**: All list endpoints use pagination (default 20 items)
- **Query Optimization**: Use `findFirst` with tenant filter instead of `findUnique` when tenant isolation needed
- **Matching**: Consider caching match results, re-run on deal criteria update
- **Dashboard**: Cache KPI calculations, refresh every 5 minutes

---

## Next Steps

1. Implement frontend components (React)
2. Add property model if not exists
3. Implement AI recommendations (V2) - future enhancement
4. Add calendar integration (Google Calendar, Outlook) - future enhancement
5. Add email/SMS integration for activity logging - future enhancement

---

## References

- **Specification**: `spec.md`
- **Data Model**: `data-model.md`
- **API Contracts**: `contracts/openapi.yaml`
- **Research**: `research.md`
- **Implementation Plan**: `plan.md`





