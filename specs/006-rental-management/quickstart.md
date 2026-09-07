# Quickstart: Rental Management Module

**Feature**: 006-rental-management  
**Date**: 2025-01-27

## Overview

This quickstart guide provides step-by-step instructions for implementing and testing the Rental Management Module. The module enables property managers to manage rental leases, generate installments, process payments, calculate penalties, track security deposits, and generate documents.

## Prerequisites

- Node.js >=18.x (LTS)
- PostgreSQL >=14
- Existing ImmoTopia codebase with:
  - Multi-tenant infrastructure
  - RBAC system
  - Properties module
  - CRM module (for TenantClient)
  - Authentication system

## Implementation Steps

### 1. Database Schema

Add rental management models to Prisma schema:

```bash
# Edit packages/api/prisma/schema.prisma
# Add rental enums and models from data-model.md
```

Run migration:

```bash
cd packages/api
npm run prisma:migrate -- --name add_rental_management
npm run prisma:generate
```

### 2. Backend Services

Create rental services in `packages/api/src/services/`:

- `rental-lease-service.ts` - Lease CRUD and status management
- `rental-installment-service.ts` - Installment generation and management
- `rental-payment-service.ts` - Payment recording and allocation
- `rental-penalty-service.ts` - Penalty calculation
- `rental-deposit-service.ts` - Security deposit management
- `rental-document-service.ts` - Document generation
- `rental-scheduler-service.ts` - Scheduled job for daily penalty calculation

### 3. Backend Controllers

Create rental controllers in `packages/api/src/controllers/`:

- `rental-controller.ts` - Lease endpoints
- `rental-installment-controller.ts` - Installment endpoints
- `rental-payment-controller.ts` - Payment endpoints
- `rental-penalty-controller.ts` - Penalty endpoints
- `rental-deposit-controller.ts` - Security deposit endpoints
- `rental-document-controller.ts` - Document endpoints

### 4. Backend Routes

Create rental routes in `packages/api/src/routes/rental-routes.ts`:

```typescript
import { Router } from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireTenantAccess } from '../middleware/tenant-middleware';
import { enforceTenantIsolation } from '../middleware/tenant-isolation-middleware';
// ... import rental handlers

const router = Router({ mergeParams: true });

// All routes are tenant-scoped: /tenants/:tenantId/rental/*
router.use(authenticate);
router.use(requireTenantAccess);
router.use(enforceTenantIsolation);

// Lease routes
router.get('/leases', listLeasesHandler);
router.post('/leases', createLeaseHandler);
router.get('/leases/:leaseId', getLeaseHandler);
router.patch('/leases/:leaseId', updateLeaseHandler);
router.patch('/leases/:leaseId/status', updateLeaseStatusHandler);
router.post('/leases/:leaseId/co-renters', addCoRenterHandler);

// Installment routes
router.get('/leases/:leaseId/installments', listInstallmentsHandler);
router.post('/leases/:leaseId/installments', generateInstallmentsHandler);

// Payment routes
router.post('/payments', createPaymentHandler);
router.post('/payments/:paymentId/allocate', allocatePaymentHandler);
router.patch('/payments/:paymentId/status', updatePaymentStatusHandler);

// Penalty routes
router.post('/penalties/calculate', calculatePenaltiesHandler);
router.patch('/penalties/:penaltyId', updatePenaltyHandler);

// Security deposit routes
router.get('/leases/:leaseId/deposit', getDepositHandler);
router.post('/leases/:leaseId/deposit', createDepositHandler);
router.post('/deposits/:depositId/movements', createDepositMovementHandler);

// Document routes
router.get('/documents', listDocumentsHandler);
router.post('/documents', generateDocumentHandler);
router.get('/documents/:documentId', getDocumentHandler);
router.patch('/documents/:documentId', updateDocumentStatusHandler);

export default router;
```

Register routes in `packages/api/src/index.ts`:

```typescript
import rentalRoutes from './routes/rental-routes';
// ...
app.use('/api/tenants/:tenantId/rental', rentalRoutes);
```

### 5. Scheduled Job

Create penalty calculation job in `packages/api/src/jobs/penalty-calculation-job.ts`:

```typescript
import cron from 'node-cron';
import { calculatePenaltiesForOverdueInstallments } from '../services/rental-penalty-service';

// Run daily at 2:00 AM
export function startPenaltyCalculationJob() {
  cron.schedule('0 2 * * *', async () => {
    try {
      await calculatePenaltiesForOverdueInstallments();
      console.log('Penalty calculation job completed');
    } catch (error) {
      console.error('Penalty calculation job failed:', error);
    }
  });
}
```

Start job in `packages/api/src/index.ts`:

```typescript
import { startPenaltyCalculationJob } from './jobs/penalty-calculation-job';
// ...
startPenaltyCalculationJob();
```

### 6. Frontend Components

Create rental pages in `apps/web/src/pages/rental/`:

- `Leases.tsx` - Lease list and detail
- `Installments.tsx` - Installment schedule
- `Payments.tsx` - Payment recording
- `Penalties.tsx` - Penalty management
- `Deposits.tsx` - Security deposit management
- `Documents.tsx` - Document list and generation

Create rental components in `apps/web/src/components/rental/`:

- `LeaseForm.tsx` - Lease create/edit form
- `InstallmentSchedule.tsx` - Installment schedule display
- `PaymentForm.tsx` - Payment recording form
- `PaymentAllocation.tsx` - Payment allocation interface
- `PenaltyRules.tsx` - Penalty rule configuration
- `DepositMovements.tsx` - Security deposit movements
- `DocumentGenerator.tsx` - Document generation

### 7. Frontend Service

Create API client in `apps/web/src/services/rental-service.ts`:

```typescript
import axios from 'axios';

const API_BASE = '/api/tenants';

export const rentalService = {
  // Leases
  listLeases: (tenantId: string, filters?: any) => 
    axios.get(`${API_BASE}/${tenantId}/rental/leases`, { params: filters }),
  
  createLease: (tenantId: string, data: any) =>
    axios.post(`${API_BASE}/${tenantId}/rental/leases`, data),
  
  // Installments
  generateInstallments: (tenantId: string, leaseId: string) =>
    axios.post(`${API_BASE}/${tenantId}/rental/leases/${leaseId}/installments`),
  
  // Payments
  createPayment: (tenantId: string, data: any) =>
    axios.post(`${API_BASE}/${tenantId}/rental/payments`, data),
  
  allocatePayment: (tenantId: string, paymentId: string, data: any) =>
    axios.post(`${API_BASE}/${tenantId}/rental/payments/${paymentId}/allocate`, data),
  
  // ... other methods
};
```

## Testing Workflow

### 1. Create a Lease

```bash
POST /api/tenants/{tenantId}/rental/leases
{
  "leaseNumber": "BAIL-2025-001",
  "propertyId": "...",
  "primaryRenterClientId": "...",
  "startDate": "2025-02-01T00:00:00Z",
  "endDate": "2026-01-31T23:59:59Z",
  "billingFrequency": "MONTHLY",
  "dueDayOfMonth": 5,
  "rentAmount": 150000,
  "serviceChargeAmount": 20000,
  "currency": "FCFA"
}
```

### 2. Activate Lease

```bash
PATCH /api/tenants/{tenantId}/rental/leases/{leaseId}/status
{
  "status": "ACTIVE"
}
```

### 3. Generate Installments

```bash
POST /api/tenants/{tenantId}/rental/leases/{leaseId}/installments
```

This creates 12 monthly installments (January 2025 - December 2025) with due dates on the 5th of each month.

### 4. Record a Payment

```bash
POST /api/tenants/{tenantId}/rental/payments
{
  "leaseId": "...",
  "renterClientId": "...",
  "method": "BANK_TRANSFER",
  "amount": 170000,
  "currency": "FCFA",
  "idempotencyKey": "payment-2025-001"
}
```

### 5. Allocate Payment to Installments

```bash
POST /api/tenants/{tenantId}/rental/payments/{paymentId}/allocate
{
  "installmentIds": ["installment-id-1", "installment-id-2"]
}
```

System automatically prioritizes oldest overdue installments first, then earliest due date.

### 6. Calculate Penalties (Manual)

```bash
POST /api/tenants/{tenantId}/rental/penalties/calculate
{
  "leaseId": "..." // Optional: calculate for specific lease
}
```

### 7. Create Security Deposit

```bash
POST /api/tenants/{tenantId}/rental/leases/{leaseId}/deposit
{
  "targetAmount": 300000
}
```

### 8. Collect Security Deposit

```bash
POST /api/tenants/{tenantId}/rental/deposits/{depositId}/movements
{
  "type": "COLLECT",
  "amount": 300000,
  "paymentId": "..." // Payment must equal targetAmount exactly
}
```

### 9. Generate Document

```bash
POST /api/tenants/{tenantId}/rental/documents
{
  "type": "RENT_RECEIPT",
  "leaseId": "...",
  "paymentId": "..."
}
```

Document number is automatically generated in format YYYY-NNN (e.g., 2025-001).

## Key Implementation Notes

### Installment Generation

- **Manual trigger**: Property manager must explicitly request installment generation
- **Algorithm**: Generates all installments for lease term (start_date to end_date)
- **Due dates**: Set based on `due_day_of_month` from lease
- **Period tracking**: Each installment has `period_year` and `period_month`

### Payment Allocation

- **Priority**: Oldest overdue installments first, then earliest due date
- **Automatic**: System suggests allocation order, property manager can override
- **Validation**: Allocation amount cannot exceed installment remaining due

### Penalty Calculation

- **Automatic**: Daily job runs at 2:00 AM (configurable)
- **Manual**: Property managers can trigger calculation on-demand
- **Rules**: Applied from lease penalty settings (grace days, mode, rate, cap)
- **Modes**: FIXED_AMOUNT, PERCENT_OF_RENT, PERCENT_OF_BALANCE

### Security Deposit

- **Single payment**: Deposit must be collected in one payment equal to target amount
- **Validation**: Reject partial payments with clear error message
- **Movements**: Track COLLECT, HOLD, RELEASE, REFUND, FORFEIT, ADJUSTMENT

### Document Numbers

- **Format**: YYYY-NNN (e.g., 2025-001, 2025-002)
- **Generation**: Sequential per tenant per year
- **Uniqueness**: Enforced at database level

## UI Text (French Only)

All user-facing text must be in French per Constitution Principle I:

- Form labels: "Numéro de bail", "Locataire principal", "Montant du loyer"
- Buttons: "Créer le bail", "Générer les échéances", "Enregistrer le paiement"
- Messages: "Bail créé avec succès", "Échéances générées", "Paiement enregistré"
- Errors: "Le montant du dépôt de garantie doit être collecté en un seul paiement"

## Testing Checklist

- [ ] Create lease in DRAFT status
- [ ] Activate lease (DRAFT → ACTIVE)
- [ ] Generate installments for active lease
- [ ] Record payment (various methods: cash, bank transfer, mobile money)
- [ ] Allocate payment to installments (verify priority: oldest overdue first)
- [ ] Verify installment status updates (DUE → PARTIAL → PAID)
- [ ] Test overdue installment status (DUE → OVERDUE)
- [ ] Trigger penalty calculation (manual and automatic)
- [ ] Create security deposit
- [ ] Collect security deposit (verify single payment validation)
- [ ] Generate documents (lease contract, receipt, quittance)
- [ ] Verify document numbers (YYYY-NNN format)
- [ ] Test tenant isolation (cross-tenant access blocked)
- [ ] Test RBAC permissions (unauthorized access blocked)

## Common Issues

### Issue: Installment generation fails

**Solution**: Ensure lease status is ACTIVE before generating installments.

### Issue: Payment allocation fails

**Solution**: Verify payment currency matches lease currency.

### Issue: Security deposit collection rejected

**Solution**: Payment amount must exactly equal deposit target amount (no partial payments).

### Issue: Document number conflict

**Solution**: Document numbers are unique per tenant per year. Check for concurrent generation.

## Next Steps

1. Implement backend services following existing patterns
2. Create frontend components with French UI text
3. Add unit tests for business logic (installment generation, payment allocation, penalty calculation)
4. Add integration tests for API endpoints
5. Set up scheduled job for daily penalty calculation
6. Test with real data (no fictional data per Constitution Principle II)

## References

- [Specification](./spec.md)
- [Data Model](./data-model.md)
- [API Contracts](./contracts/openapi.yaml)
- [Research](./research.md)





