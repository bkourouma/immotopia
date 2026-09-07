# Quickstart: Maintenance & Rental Incidents Module

**Feature**: 007-maintenance-incidents  
**Date**: 2025-01-28

## Overview

This quickstart guide provides step-by-step instructions for implementing and testing the Maintenance & Rental Incidents Module. The module enables tenants to report maintenance issues, property managers to track and manage tickets, assign vendors, and maintain complete maintenance history per property.

## Prerequisites

- Node.js >=18.x (LTS)
- PostgreSQL >=14
- Existing ImmoTopia codebase with:
  - Multi-tenant infrastructure
  - RBAC system
  - Properties module
  - Rental Management module (for lease validation)
  - CRM module (for tenant contacts)
  - Authentication system
  - File upload infrastructure (Multer)

## Implementation Steps

### 1. Database Schema

Add maintenance models to Prisma schema:

```bash
# Edit packages/api/prisma/schema.prisma
# Add maintenance enums and models from data-model.md
```

Run migration:

```bash
cd packages/api
npm run prisma:migrate -- --name add_maintenance_module
npm run prisma:generate
```

### 2. Backend Services

Create maintenance services in `packages/api/src/services/`:

- `maintenance-ticket-service.ts` - Ticket CRUD, status workflow, validation
- `maintenance-vendor-service.ts` - Vendor CRUD, active/inactive management
- `maintenance-attachment-service.ts` - File upload, storage, access control
- `maintenance-comment-service.ts` - Comment thread management
- `maintenance-notification-service.ts` - Email notifications for status changes

### 3. Backend Controllers

Create maintenance controllers in `packages/api/src/controllers/`:

- `maintenance-ticket-controller.ts` - Ticket endpoints (tenant + manager)
- `maintenance-vendor-controller.ts` - Vendor CRUD endpoints
- `maintenance-attachment-controller.ts` - File upload/download endpoints

### 4. Backend Routes

Create maintenance routes in `packages/api/src/routes/maintenance-routes.ts`:

```typescript
import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { enforceTenantIsolation } from '../middleware/tenant-isolation-middleware';
// ... import maintenance handlers

const router = Router({ mergeParams: true });

// All routes are tenant-scoped: /api/tenants/:tenantId/maintenance/*

// Tenant routes
const tenantRouter = Router({ mergeParams: true });
tenantRouter.use(authenticate);
tenantRouter.use(requireTenantAccess);
tenantRouter.use(enforceTenantIsolation);

tenantRouter.get('/tickets', listTenantTicketsHandler);
tenantRouter.post('/tickets', createTicketHandler);
tenantRouter.get('/tickets/:ticketId', getTenantTicketHandler);
tenantRouter.patch('/tickets/:ticketId', cancelTicketHandler);
tenantRouter.post('/tickets/:ticketId/comments', addCommentHandler);
tenantRouter.post('/tickets/:ticketId/attachments', uploadAttachmentHandler);

router.use('/tenant', tenantRouter);

// Manager routes
const adminRouter = Router({ mergeParams: true });
adminRouter.use(authenticate);
adminRouter.use(requireTenantAccess);
adminRouter.use(enforceTenantIsolation);
adminRouter.use(requireMaintenanceAdminPermission); // RBAC middleware

adminRouter.get('/tickets', listAllTicketsHandler);
adminRouter.get('/tickets/:ticketId', getTicketHandler);
adminRouter.patch('/tickets/:ticketId', updateTicketHandler);
adminRouter.post('/tickets/:ticketId/comments', addManagerCommentHandler);

// Vendor routes
adminRouter.get('/vendors', listVendorsHandler);
adminRouter.post('/vendors', createVendorHandler);
adminRouter.get('/vendors/:vendorId', getVendorHandler);
adminRouter.patch('/vendors/:vendorId', updateVendorHandler);
adminRouter.delete('/vendors/:vendorId', deactivateVendorHandler);

router.use('/admin', adminRouter);

// File download (shared)
router.get('/files/:attachmentId', authenticate, requireTenantAccess, downloadAttachmentHandler);

export default router;
```

Register routes in `packages/api/src/index.ts`:

```typescript
import maintenanceRoutes from './routes/maintenance-routes';
app.use('/api/tenants/:tenantId/maintenance', maintenanceRoutes);
```

### 5. Backend Middleware

Create RBAC middleware in `packages/api/src/middleware/maintenance-rbac-middleware.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';
import { requirePermission } from './rbac-middleware';

// Tenant permission: can create/view their own tickets
export const requireMaintenanceTenantPermission = requirePermission('MAINTENANCE_TENANT');

// Manager permission: can view/manage all tickets
export const requireMaintenanceAdminPermission = requirePermission('MAINTENANCE_ADMIN');
```

### 6. Backend Types & Validation

Create Zod schemas in `packages/api/src/types/maintenance-types.ts`:

```typescript
import { z } from 'zod';

export const createTicketSchema = z.object({
  title: z.string().min(3).max(200),
  category: z.enum(['PLUMBING', 'ELECTRICITY', 'AC', 'OTHER']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
  description: z.string().min(10).max(5000),
  locationDetails: z.string().max(500).optional(),
  propertyId: z.string().uuid(),
  leaseId: z.string().uuid().optional(),
});

export const updateTicketSchema = z.object({
  status: z.enum(['IN_PROGRESS', 'ASSIGNED', 'RESOLVED', 'CANCELED']).optional(),
  assignedVendorId: z.string().uuid().optional(),
  assignedToUserId: z.string().uuid().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  resolutionNotes: z.string().max(1000).optional(),
});

export const createCommentSchema = z.object({
  content: z.string().min(1).max(5000),
});

export const createVendorSchema = z.object({
  name: z.string().min(2).max(200),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  address: z.string().max(1000).optional(),
  specialties: z.array(z.string()).optional(),
});
```

### 7. Frontend Services

Create maintenance service in `apps/web/src/services/maintenance-service.ts`:

```typescript
import axios from 'axios';
import { getApiUrl } from './api-config';

const API_BASE = (tenantId: string) => `${getApiUrl()}/tenants/${tenantId}/maintenance`;

// Tenant ticket operations
export const tenantMaintenanceService = {
  listTickets: (tenantId: string, filters?: { status?: string; propertyId?: string }) => {
    return axios.get(`${API_BASE(tenantId)}/tenant/tickets`, { params: filters });
  },
  
  createTicket: (tenantId: string, data: CreateTicketRequest) => {
    return axios.post(`${API_BASE(tenantId)}/tenant/tickets`, data);
  },
  
  getTicket: (tenantId: string, ticketId: string) => {
    return axios.get(`${API_BASE(tenantId)}/tenant/tickets/${ticketId}`);
  },
  
  cancelTicket: (tenantId: string, ticketId: string) => {
    return axios.patch(`${API_BASE(tenantId)}/tenant/tickets/${ticketId}`, { status: 'CANCELED' });
  },
  
  addComment: (tenantId: string, ticketId: string, content: string) => {
    return axios.post(`${API_BASE(tenantId)}/tenant/tickets/${ticketId}/comments`, { content });
  },
  
  uploadAttachment: (tenantId: string, ticketId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return axios.post(`${API_BASE(tenantId)}/tenant/tickets/${ticketId}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Manager ticket operations
export const managerMaintenanceService = {
  listTickets: (tenantId: string, filters?: TicketFilters) => {
    return axios.get(`${API_BASE(tenantId)}/admin/tickets`, { params: filters });
  },
  
  getTicket: (tenantId: string, ticketId: string) => {
    return axios.get(`${API_BASE(tenantId)}/admin/tickets/${ticketId}`);
  },
  
  updateTicket: (tenantId: string, ticketId: string, data: UpdateTicketRequest) => {
    return axios.patch(`${API_BASE(tenantId)}/admin/tickets/${ticketId}`, data);
  },
  
  addComment: (tenantId: string, ticketId: string, content: string) => {
    return axios.post(`${API_BASE(tenantId)}/admin/tickets/${ticketId}/comments`, { content });
  },
};

// Vendor operations
export const vendorService = {
  listVendors: (tenantId: string, filters?: { isActive?: boolean; search?: string }) => {
    return axios.get(`${API_BASE(tenantId)}/admin/vendors`, { params: filters });
  },
  
  createVendor: (tenantId: string, data: CreateVendorRequest) => {
    return axios.post(`${API_BASE(tenantId)}/admin/vendors`, data);
  },
  
  updateVendor: (tenantId: string, vendorId: string, data: UpdateVendorRequest) => {
    return axios.patch(`${API_BASE(tenantId)}/admin/vendors/${vendorId}`, data);
  },
  
  deactivateVendor: (tenantId: string, vendorId: string) => {
    return axios.delete(`${API_BASE(tenantId)}/admin/vendors/${vendorId}`);
  },
};

// Property maintenance history
export const propertyMaintenanceService = {
  getHistory: (tenantId: string, propertyId: string, filters?: { status?: string; category?: string }) => {
    return axios.get(`${getApiUrl()}/tenants/${tenantId}/properties/${propertyId}/maintenance`, { params: filters });
  },
};
```

### 8. Frontend Pages

Create tenant pages in `apps/web/src/pages/tenant/maintenance/`:

- `TicketList.tsx` - List of tenant tickets with filters
- `TicketDetail.tsx` - Ticket detail with timeline, comments, attachments
- `CreateTicket.tsx` - Ticket creation form with file upload

Create manager pages in `apps/web/src/pages/admin/maintenance/`:

- `Tickets.tsx` - Manager ticket list with advanced filters
- `TicketDetail.tsx` - Manager ticket detail with status controls
- `Vendors.tsx` - Vendor CRUD interface

### 9. Frontend Components

Create reusable components in `apps/web/src/components/maintenance/`:

- `TicketCard.tsx` - Ticket card component
- `TicketStatusBadge.tsx` - Status badge with colors
- `TicketTimeline.tsx` - Status history timeline
- `CommentThread.tsx` - Comment thread component
- `FileUploader.tsx` - Drag & drop file uploader
- `AttachmentList.tsx` - Attachment list with preview
- `VendorSelect.tsx` - Vendor selection dropdown

### 10. Property Maintenance Tab

Add maintenance history tab to property detail page:

```typescript
// In apps/web/src/pages/admin/properties/PropertyDetail.tsx
import { PropertyMaintenanceTab } from '@/components/properties/PropertyMaintenanceTab';

// Add tab to property detail tabs
<Tabs>
  <TabsList>
    <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
    <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
    {/* ... other tabs */}
  </TabsList>
  
  <TabsContent value="maintenance">
    <PropertyMaintenanceTab propertyId={propertyId} tenantId={tenantId} />
  </TabsContent>
</Tabs>
```

## Testing

### Unit Tests

Create unit tests in `packages/api/__tests__/unit/`:

- `status-workflow.test.ts` - Status transition validation
- `file-upload.test.ts` - File upload validation
- `tenant-access.test.ts` - Tenant access validation

### Integration Tests

Create integration tests in `packages/api/__tests__/integration/`:

- `maintenance-ticket.integration.test.ts` - Ticket workflow end-to-end
- `maintenance-vendor.integration.test.ts` - Vendor management end-to-end

Example test:

```typescript
describe('Maintenance Ticket Workflow', () => {
  it('should create ticket, update status, assign vendor, and resolve', async () => {
    // 1. Create ticket as tenant
    const ticket = await createTicket({
      title: 'Leak in bathroom',
      category: 'PLUMBING',
      priority: 'HIGH',
      description: 'Water leaking from pipe',
      propertyId: testPropertyId,
    });
    
    expect(ticket.status).toBe('DECLARED');
    
    // 2. Manager updates to IN_PROGRESS
    const inProgress = await updateTicketStatus(ticket.id, 'IN_PROGRESS');
    expect(inProgress.status).toBe('IN_PROGRESS');
    expect(inProgress.inProgressAt).toBeDefined();
    
    // 3. Manager assigns vendor
    const vendor = await createVendor({ name: 'Plumber Co' });
    const assigned = await updateTicket(ticket.id, {
      status: 'ASSIGNED',
      assignedVendorId: vendor.id,
    });
    expect(assigned.status).toBe('ASSIGNED');
    expect(assigned.assignedVendorId).toBe(vendor.id);
    
    // 4. Manager resolves ticket
    const resolved = await updateTicket(ticket.id, {
      status: 'RESOLVED',
      resolutionNotes: 'Fixed leak, replaced pipe',
    });
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.resolutionNotes).toBe('Fixed leak, replaced pipe');
  });
});
```

## Seed Data

Create seed script in `packages/api/prisma/seeds/maintenance-seed.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function seedMaintenance(tenantId: string, propertyId: string, leaseId: string) {
  // Create vendor
  const vendor = await prisma.maintenanceVendor.create({
    data: {
      tenantId,
      name: 'Plomberie Express',
      phone: '+225 07 12 34 56 78',
      email: 'contact@plomberie-express.ci',
      specialties: ['plumbing', 'water heater'],
      isActive: true,
    },
  });
  
  // Create ticket
  const ticket = await prisma.maintenanceTicket.create({
    data: {
      tenantId,
      propertyId,
      leaseId,
      title: 'Fuite d\'eau dans la salle de bain',
      category: 'PLUMBING',
      priority: 'HIGH',
      description: 'Fuite importante sous l\'évier de la salle de bain principale',
      locationDetails: 'Salle de bain principale, sous l\'évier',
      status: 'ASSIGNED',
      assignedVendorId: vendor.id,
      declaredAt: new Date(),
      inProgressAt: new Date(Date.now() - 86400000), // 1 day ago
      assignedAt: new Date(Date.now() - 43200000), // 12 hours ago
    },
  });
  
  // Add comment
  await prisma.maintenanceTicketComment.create({
    data: {
      tenantId,
      ticketId: ticket.id,
      authorType: 'TENANT',
      content: 'La fuite s\'est aggravée, besoin d\'intervention urgente',
    },
  });
  
  return { vendor, ticket };
}
```

## API Examples

### Create Ticket (Tenant)

```bash
POST /api/tenants/{tenantId}/maintenance/tenant/tickets
Authorization: Bearer {token}
Content-Type: application/json

{
  "title": "Fuite d'eau dans la salle de bain",
  "category": "PLUMBING",
  "priority": "HIGH",
  "description": "Fuite importante sous l'évier",
  "locationDetails": "Salle de bain principale",
  "propertyId": "uuid",
  "leaseId": "uuid"
}
```

### Update Ticket Status (Manager)

```bash
PATCH /api/tenants/{tenantId}/maintenance/admin/tickets/{ticketId}
Authorization: Bearer {token}
Content-Type: application/json

{
  "status": "ASSIGNED",
  "assignedVendorId": "vendor-uuid"
}
```

### Upload Attachment

```bash
POST /api/tenants/{tenantId}/maintenance/tenant/tickets/{ticketId}/attachments
Authorization: Bearer {token}
Content-Type: multipart/form-data

file: [binary]
```

### Get Property Maintenance History

```bash
GET /api/tenants/{tenantId}/properties/{propertyId}/maintenance?status=RESOLVED
Authorization: Bearer {token}
```

## Common Issues & Solutions

### Issue: File upload fails with "File too large"

**Solution**: Check file size limit (5MB) and validate in both multer middleware and service layer.

### Issue: Status transition validation fails

**Solution**: Ensure status transitions follow workflow rules. Use status transition validator function.

### Issue: Tenant cannot create ticket

**Solution**: Verify tenant has active lease for the property. Check lease status is ACTIVE.

### Issue: Email notifications not sending

**Solution**: Check Nodemailer configuration. Notifications are async and failures don't block operations.

## Next Steps

1. Implement frontend UI components
2. Add property maintenance history tab
3. Create seed data for testing
4. Write integration tests
5. Add email notification templates
6. Implement file download security
7. Add pagination for ticket lists
8. Create vendor assignment UI

## References

- [Data Model](./data-model.md) - Complete Prisma schema
- [API Contract](./contracts/openapi.yaml) - OpenAPI specification
- [Research](./research.md) - Technology decisions and rationale
- [Specification](./spec.md) - Feature requirements
