# Quick Start Guide: Tenant Portal Module

**Feature**: 008-tenant-portal  
**Date**: 2025-01-27  
**Purpose**: Quick reference guide for developers implementing the tenant portal module

---

## Prerequisites

- Node.js >=18.x (LTS)
- PostgreSQL >=14
- Prisma CLI installed
- Existing ImmoTopia project with:
  - Authentication module (JWT)
  - Rental management module (leases, installments, payments, deposits)
  - Maintenance module (tickets, comments, attachments)
  - Document generation module (rental documents)

---

## Setup Steps

### 1. Database Migration

Add the new `RentalPaymentDeclaration` model to Prisma schema and run migration:

```bash
cd packages/api
npx prisma migrate dev --name add_payment_declarations
```

### 2. Backend Implementation

#### 2.1 Create Middleware

Create `packages/api/src/middleware/tenant-portal-access.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/database';
import { RentalLeaseStatus } from '@prisma/client';

export const requireTenantPortalAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // User must be authenticated (from authenticate middleware)
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    // Find TenantClient linked to user
    const tenantClient = await prisma.tenantClient.findFirst({
      where: {
        userId: req.user.userId
      }
    });

    if (!tenantClient) {
      res.status(403).json({ success: false, message: 'Accès portail locataire refusé.' });
      return;
    }

    // Find active lease where tenant is primary renter or co-renter
    const activeLease = await prisma.rentalLease.findFirst({
      where: {
        tenant_id: req.tenantContext?.tenantId,
        status: RentalLeaseStatus.ACTIVE,
        OR: [
          { primary_renter_client_id: tenantClient.id },
          {
            coRenters: {
              some: {
                renter_client_id: tenantClient.id
              }
            }
          }
        ]
      },
      include: {
        property: true,
        primaryRenter: true
      }
    });

    if (!activeLease) {
      res.status(403).json({ success: false, message: 'Aucun bail actif trouvé.' });
      return;
    }

    // Store portal context in request
    req.tenantPortal = {
      leaseId: activeLease.id,
      tenantClientId: tenantClient.id,
      lease: activeLease
    };

    next();
  } catch (error) {
    console.error('Tenant portal access check error:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la vérification des accès.' });
  }
};
```

#### 2.2 Create Service

Create `packages/api/src/services/tenant-portal-service.ts` with methods:
- `getDashboard(tenantClientId: string)`
- `getLeaseDetails(tenantClientId: string)`
- `getInstallments(tenantClientId: string, filters?)`
- `getInstallmentDetails(installmentId: string, tenantClientId: string)`
- `getPaymentHistory(tenantClientId: string, filters?)`
- `declarePayment(tenantClientId: string, data)`
- `getDepositInfo(tenantClientId: string)`
- `getMaintenanceTickets(tenantClientId: string, filters?)`
- `createMaintenanceTicket(tenantClientId: string, data)`
- `addTicketComment(ticketId: string, tenantClientId: string, comment)`
- `getDocuments(tenantClientId: string, filters?)`
- `downloadDocument(documentId: string, tenantClientId: string)`

#### 2.3 Create Controller

Create `packages/api/src/controllers/tenant-portal-controller.ts` with handlers for each endpoint.

#### 2.4 Create Routes

Create `packages/api/src/routes/tenant-portal-routes.ts`:

```typescript
import express from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantPortalAccess } from '../middleware/tenant-portal-access';
import { TenantPortalController } from '../controllers/tenant-portal-controller';
import multer from 'multer';

const router = express.Router();
const controller = new TenantPortalController();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// All routes require authentication and tenant portal access
router.use(authenticate);
router.use(requireTenantPortalAccess);

router.get('/dashboard', controller.getDashboard);
router.get('/lease', controller.getLeaseDetails);
router.get('/installments', controller.getInstallments);
router.get('/installments/:id', controller.getInstallmentDetails);
router.get('/payments', controller.getPaymentHistory);
router.post('/payments/declare', upload.single('proof'), controller.declarePayment);
router.get('/deposit', controller.getDepositInfo);
router.get('/maintenance', controller.getMaintenanceTickets);
router.post('/maintenance', upload.array('attachments', 10), controller.createMaintenanceTicket);
router.get('/maintenance/:id', controller.getMaintenanceTicketDetails);
router.post('/maintenance/:id/comment', controller.addTicketComment);
router.get('/documents', controller.getDocuments);
router.get('/documents/:id/download', controller.downloadDocument);

export default router;
```

#### 2.5 Register Routes

Add to `packages/api/src/index.ts`:

```typescript
import tenantPortalRoutes from './routes/tenant-portal-routes';
app.use('/api/portal/tenant', tenantPortalRoutes);
```

### 3. Frontend Implementation

#### 3.1 Create Service

Create `apps/web/src/services/tenantPortalService.ts`:

```typescript
import api from './api';

export const tenantPortalService = {
  getDashboard: () => api.get('/portal/tenant/dashboard'),
  getLeaseDetails: () => api.get('/portal/tenant/lease'),
  getInstallments: (params?) => api.get('/portal/tenant/installments', { params }),
  getInstallmentDetails: (id: string) => api.get(`/portal/tenant/installments/${id}`),
  getPaymentHistory: (params?) => api.get('/portal/tenant/payments', { params }),
  declarePayment: (data: FormData) => api.post('/portal/tenant/payments/declare', data, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getDepositInfo: () => api.get('/portal/tenant/deposit'),
  getMaintenanceTickets: (params?) => api.get('/portal/tenant/maintenance', { params }),
  createMaintenanceTicket: (data: FormData) => api.post('/portal/tenant/maintenance', data, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  addTicketComment: (ticketId: string, comment: string) =>
    api.post(`/portal/tenant/maintenance/${ticketId}/comment`, { comment }),
  getDocuments: (params?) => api.get('/portal/tenant/documents', { params }),
  downloadDocument: (documentId: string) =>
    api.get(`/portal/tenant/documents/${documentId}/download`, { responseType: 'blob' })
};
```

#### 3.2 Create Pages

Create pages in `apps/web/src/pages/TenantPortal/`:
- `Layout.tsx` - Portal layout with sidebar navigation
- `Dashboard.tsx` - Dashboard page
- `Lease.tsx` - Lease details page
- `Payments.tsx` - Payments page with declaration modal
- `Maintenance.tsx` - Maintenance page with ticket creation
- `Documents.tsx` - Documents page

#### 3.3 Add Routes

Add to `apps/web/src/App.tsx`:

```typescript
import TenantPortalLayout from './pages/TenantPortal/Layout';
import TenantDashboard from './pages/TenantPortal/Dashboard';
import TenantLease from './pages/TenantPortal/Lease';
import TenantPayments from './pages/TenantPortal/Payments';
import TenantMaintenance from './pages/TenantPortal/Maintenance';
import TenantDocuments from './pages/TenantPortal/Documents';

<Route path="/tenant" element={<TenantPortalLayout />}>
  <Route index element={<TenantDashboard />} />
  <Route path="lease" element={<TenantLease />} />
  <Route path="payments" element={<TenantPayments />} />
  <Route path="maintenance" element={<TenantMaintenance />} />
  <Route path="documents" element={<TenantDocuments />} />
</Route>
```

---

## Testing

### Backend Tests

```bash
cd packages/api
npm test -- tenant-portal
```

### Frontend Tests

```bash
cd apps/web
npm test -- TenantPortal
```

### Manual Testing

1. **Login as tenant** with active lease
2. **Access dashboard**: `/tenant` - verify all metrics display correctly
3. **View lease**: `/tenant/lease` - verify lease details and documents
4. **View installments**: `/tenant/payments` - verify installment list and filters
5. **Declare payment**: Click "Déclarer un paiement", fill form, upload proof, submit
6. **View deposit**: Verify deposit amount and movements
7. **Create maintenance ticket**: Click "Nouvelle demande", fill form, upload photos, submit
8. **View documents**: Verify documents grouped by type, download PDFs

---

## Key Implementation Notes

### Dashboard Balance Calculation

```typescript
// Current balance = Sum of DUE + OVERDUE installments - allocated payments
const dueInstallments = await prisma.rentalInstallment.findMany({
  where: {
    lease_id: leaseId,
    status: { in: [RentalInstallmentStatus.DUE, RentalInstallmentStatus.OVERDUE] }
  }
});

const totalDue = dueInstallments.reduce((sum, inst) => sum + inst.amount_rent + inst.amount_service, 0);
const totalPaid = await prisma.rentalPaymentAllocation.aggregate({
  where: {
    installment: { lease_id: leaseId },
    payment: { status: RentalPaymentStatus.SUCCESS }
  },
  _sum: { amount: true }
});

const currentBalance = totalDue - (totalPaid._sum.amount || 0);
```

### Payment Declaration File Upload

```typescript
// Save to: uploads/portal/payments/<tenantId>/<declarationId>/
const uploadDir = path.join(projectRoot, 'uploads', 'portal', 'payments', tenantId, declarationId);
await fs.mkdir(uploadDir, { recursive: true });
const filePath = path.join(uploadDir, fileName);
await fs.writeFile(filePath, file.buffer);
const fileUrl = `/uploads/portal/payments/${tenantId}/${declarationId}/${fileName}`;
```

### Maintenance Ticket Integration

```typescript
// Reuse existing maintenance service
import { createTicket } from '../services/maintenance-ticket-service';

const ticket = await createTicket({
  tenantId: lease.tenant_id,
  propertyId: lease.property_id,
  leaseId: lease.id,
  reportedBy: tenantClientId,
  category: data.category,
  priority: data.priority,
  title: data.title,
  description: data.description,
  status: MaintenanceTicketStatus.DECLARED
});
```

---

## Common Issues

### Issue: Portal access denied

**Solution**: Verify:
1. User is authenticated (JWT valid)
2. User is linked to TenantClient
3. Tenant has active lease (primary renter or co-renter)

### Issue: File upload fails

**Solution**: Check:
1. File size <= 5MB
2. File type is image (JPEG, PNG, WebP) or PDF
3. Upload directory exists and is writable

### Issue: Dashboard balance incorrect

**Solution**: Verify:
1. Installment statuses are correct (DUE, OVERDUE)
2. Payment allocations are properly linked
3. Payment status is SUCCESS for allocated payments

---

## Next Steps

1. Implement property manager review interface for payment declarations (separate feature)
2. Add email notifications for payment declaration status changes
3. Add export functionality for payment history (PDF)
4. Add advanced filters and search for installments and payments
5. Add mobile-responsive design improvements

---

## References

- [Specification](./spec.md)
- [Implementation Plan](./plan.md)
- [Data Model](./data-model.md)
- [API Contract](./contracts/openapi.yaml)
- [Research](./research.md)
