# Data Model: Owner Portal Module

**Feature**: 009-owner-portal  
**Date**: 2025-01-27  
**Purpose**: Document data model usage and relationships for owner portal module

---

## Overview

The Owner Portal Module uses existing database entities without adding new models. This document describes how existing entities are used, their relationships, and any extensions needed for owner portal functionality.

---

## Entity Usage

### TenantClient

Represents a property owner user who can access the owner portal. Property owners are identified by `clientType = PROPRIETAIRE`.

**Table**: `tenant_clients` (existing)

**Key Fields for Owner Portal**:
- `id` (UUID, PK): Unique identifier
- `userId` (UUID, FK → users.id): User account linked to owner
- `tenantId` (UUID, FK → tenants.id): Tenant organization
- `clientType` (ClientType): Must be `PROPRIETAIRE` for portal access

**Extended Fields** (to be added):
- `ownerPortalEnabled` (Boolean, default: false): Whether owner has portal access enabled
- `ownerPortalLastAccess` (DateTime?): Last time owner accessed the portal

**Relationships Used**:
- `user` → User (belongs to, for authentication)
- `tenant` → Tenant (belongs to, for tenant isolation)
- `ownerLeases` → RentalLease[] (has many, leases where owner is the lease owner)

**Business Rules**:
- Only TenantClient records with `clientType = PROPRIETAIRE` can access owner portal
- Owner portal access requires active TenantClient link to authenticated user
- Property ownership determined through Property.ownerUserId or RentalLease.ownerClient

---

### Property

Represents a real estate property owned by a property owner. Properties are linked to owners through direct ownership or lease ownership.

**Table**: `properties` (existing)

**Key Fields for Owner Portal**:
- `id` (UUID, PK): Unique identifier
- `ownerUserId` (UUID?, FK → users.id): Direct owner user ID (if ownershipType = PUBLIC or CLIENT)
- `ownershipType` (PropertyOwnershipType): TENANT, PUBLIC, or CLIENT
- `status` (PropertyStatus): Property status (DRAFT, AVAILABLE, RENTED, UNDER_MAINTENANCE, etc.)
- `propertyType` (PropertyType): Type of property (APPARTEMENT, MAISON_VILLA, etc.)
- `address` (String): Property address
- `transactionModes` (PropertyTransactionMode[]): Transaction modes (SALE, RENTAL, SHORT_TERM)

**Relationships Used**:
- `owner` → User? (belongs to, if ownerUserId is set)
- `rentalLeases` → RentalLease[] (has many, leases for this property)
- `media` → PropertyMedia[] (has many, property images)
- `documents` → PropertyDocument[] (has many, property documents)
- `maintenanceTickets` → MaintenanceTicket[] (has many, maintenance requests)

**Business Rules**:
- Property is owned by owner if `Property.ownerUserId = TenantClient.userId`
- Property is also owned if it has a RentalLease where `RentalLease.ownerClient = TenantClient.id`
- Owner can only access properties they own (enforced by middleware)
- Property status determines if it appears as "rented", "available", or "under maintenance"

---

### RentalLease

Represents a rental agreement between property owner and tenant. Leases link properties to owners and tenants.

**Table**: `rental_leases` (existing)

**Key Fields for Owner Portal**:
- `id` (UUID, PK): Unique identifier
- `propertyId` (UUID, FK → properties.id): Property being leased
- `ownerClientId` (UUID?, FK → tenant_clients.id): Owner client (if specified)
- `primaryRenterClientId` (UUID, FK → tenant_clients.id): Primary renter
- `status` (RentalLeaseStatus): ACTIVE, SUSPENDED, ENDED, CANCELED
- `startDate` (DateTime): Lease start date
- `endDate` (DateTime?): Lease end date
- `rentAmount` (Decimal(12,2)): Monthly rent amount
- `serviceChargeAmount` (Decimal(12,2)): Service charges
- `securityDepositAmount` (Decimal(12,2)): Security deposit amount

**Relationships Used**:
- `property` → Property (belongs to)
- `ownerClient` → TenantClient? (belongs to, owner of the lease)
- `primaryRenter` → TenantClient (belongs to, primary tenant)
- `coRenters` → RentalLeaseCoRenter[] (has many, co-renters)
- `installments` → RentalInstallment[] (has many, payment installments)
- `deposit` → RentalSecurityDeposit? (has one, security deposit)
- `payments` → RentalPayment[] (has many, received payments)
- `documents` → RentalDocument[] (has many, lease documents)

**Business Rules**:
- Lease ownership: If `RentalLease.ownerClient` is set, that TenantClient owns the property for this lease
- Owner can view all leases for their properties
- Lease status determines if property appears as "rented"
- Active leases (status = ACTIVE) are shown in owner's lease list

---

### RentalPayment

Represents a received rental payment. Payments are linked to leases and allocated to installments.

**Table**: `rental_payments` (existing)

**Key Fields for Owner Portal**:
- `id` (UUID, PK): Unique identifier
- `leaseId` (UUID, FK → rental_leases.id): Lease associated with payment
- `amount` (Decimal(12,2)): Payment amount
- `date` (DateTime): Payment date
- `method` (RentalPaymentMethod): Payment method (CASH, BANK_TRANSFER, MOBILE_MONEY, etc.)
- `status` (RentalPaymentStatus): SUCCESS, PENDING, FAILED, CANCELED, REFUNDED
- `mobileOperator` (MobileMoneyOperator?): Mobile money operator (if applicable)
- `reference` (String?): Payment reference

**Relationships Used**:
- `lease` → RentalLease (belongs to, includes property)
- `allocations` → RentalPaymentAllocation[] (has many, installment allocations)

**Business Rules**:
- Owner can view all payments for their properties (via lease.propertyId)
- Payments are filtered by propertyIds array from middleware
- Revenue calculations use payments with status = SUCCESS
- Payment date determines which month/year revenue is counted

---

### RentalInstallment

Represents a scheduled payment obligation. Installments track what tenants owe and what has been paid.

**Table**: `rental_installments` (existing)

**Key Fields for Owner Portal**:
- `id` (UUID, PK): Unique identifier
- `leaseId` (UUID, FK → rental_leases.id): Lease associated with installment
- `periodYear` (Int): Year of installment period
- `periodMonth` (Int): Month of installment period
- `dueDate` (DateTime): Due date for payment
- `status` (RentalInstallmentStatus): DRAFT, DUE, PAID, OVERDUE, PARTIAL
- `amountRent` (Decimal(12,2)): Rent amount
- `amountService` (Decimal(12,2)): Service charge amount
- `amountOtherFees` (Decimal(12,2)): Other fees
- `penaltyAmount` (Decimal(12,2)): Penalty amount (if overdue)
- `amountPaid` (Decimal(12,2)): Amount paid so far
- `paidAt` (DateTime?): When installment was fully paid

**Relationships Used**:
- `lease` → RentalLease (belongs to, includes property and primaryRenter)

**Business Rules**:
- Owner can view all installments for their properties
- Installments with status DUE and future dueDate are "upcoming payments"
- Installments with status OVERDUE are overdue payments
- Installment status determines payment tracking

---

### RentalSecurityDeposit

Represents a security deposit held for a lease. Tracks deposit amount, held amount, and movements.

**Table**: `rental_security_deposits` (existing)

**Key Fields for Owner Portal**:
- `id` (UUID, PK): Unique identifier
- `leaseId` (UUID, FK → rental_leases.id): Lease associated with deposit
- `amount` (Decimal(12,2)): Original deposit amount
- `currentHeldAmount` (Decimal(12,2)): Currently held amount
- `status` (DepositStatus): HELD, RELEASED, REFUNDED, FORFEITED

**Relationships Used**:
- `lease` → RentalLease (belongs to, includes property and primaryRenter)
- `movements` → RentalDepositMovement[] (has many, deposit movement history)

**Business Rules**:
- Owner can view all deposits for their properties
- Deposit movements track collections, holds, releases, refunds, forfeitures, adjustments
- Current held amount reflects all movements

---

### MaintenanceTicket

Represents a maintenance request or issue for a property. Tracks maintenance status, costs, and history.

**Table**: `maintenance_tickets` (existing)

**Key Fields for Owner Portal**:
- `id` (UUID, PK): Unique identifier
- `propertyId` (UUID, FK → properties.id): Property with maintenance issue
- `leaseId` (UUID?, FK → rental_leases.id): Optional lease association
- `category` (MaintenanceCategory): Category of maintenance issue
- `priority` (MaintenancePriority): Priority level (LOW, MEDIUM, HIGH, URGENT)
- `status` (MaintenanceTicketStatus): DECLARED, IN_PROGRESS, ASSIGNED, RESOLVED, CLOSED
- `title` (String): Ticket title
- `description` (Text): Ticket description
- `totalCost` (Decimal(12,2)?): Total maintenance cost

**Relationships Used**:
- `property` → Property (belongs to)
- `lease` → RentalLease? (optional, belongs to)
- `attachments` → MaintenanceTicketAttachment[] (has many, photos/files)
- `comments` → MaintenanceTicketComment[] (has many, comments)
- `statusHistory` → MaintenanceTicketStatusHistory[] (has many, status changes)

**Business Rules**:
- Owner can view all maintenance tickets for their properties
- Tickets filtered by propertyIds array from middleware
- Ticket status determines if it appears as "open", "in progress", or "resolved"

---

### RentalDocument

Represents an official rental document (contract, receipt, quittance, statement). Documents are linked to leases.

**Table**: `rental_documents` (existing)

**Key Fields for Owner Portal**:
- `id` (UUID, PK): Unique identifier
- `leaseId` (UUID, FK → rental_leases.id): Lease associated with document
- `documentType` (RentalDocumentType): Type of document (LEASE_CONTRACT, RENT_RECEIPT, RENT_QUITTANCE, STATEMENT, etc.)
- `documentNumber` (String): Document number
- `fileUrl` (String): URL to document file
- `generatedAt` (DateTime): When document was generated

**Relationships Used**:
- `lease` → RentalLease (belongs to, includes property)

**Business Rules**:
- Owner can view all documents for their properties (via lease.propertyId)
- Documents grouped by type for easy access
- Documents downloadable as files

---

## Data Access Patterns

### Property Ownership Resolution

Properties are owned by a property owner through two mechanisms:

1. **Direct Ownership**: `Property.ownerUserId = TenantClient.userId`
2. **Lease Ownership**: Property has `RentalLease` where `RentalLease.ownerClient = TenantClient.id`

**Query Pattern**:
```typescript
// Resolve all owned property IDs
const directOwned = await prisma.property.findMany({
  where: { ownerUserId: tenantClient.userId },
  select: { id: true }
});

const leaseOwned = await prisma.rentalLease.findMany({
  where: { ownerClientId: tenantClient.id },
  select: { propertyId: true },
  distinct: ['propertyId']
});

const propertyIds = [
  ...directOwned.map(p => p.id),
  ...leaseOwned.map(l => l.propertyId)
];
```

### Revenue Aggregation

Revenue calculations filter by propertyIds and use Prisma aggregations:

```typescript
// Current month revenue
const currentMonthRevenue = await prisma.rentalPayment.aggregate({
  where: {
    lease: { propertyId: { in: propertyIds } },
    status: 'SUCCESS',
    date: {
      gte: startOfMonth(new Date()),
      lt: startOfMonth(addMonths(new Date(), 1))
    }
  },
  _sum: { amount: true }
});
```

### Dashboard Aggregation

Dashboard metrics aggregate across all owner's properties:

```typescript
// Portfolio summary
const properties = await prisma.property.findMany({
  where: { id: { in: propertyIds } },
  include: {
    rentalLeases: {
      where: { status: 'ACTIVE' },
      take: 1
    }
  }
});
```

---

## Indexes

Existing indexes support owner portal queries:

- `properties.owner_user_id`: For direct ownership queries
- `rental_leases.owner_client_id`: For lease ownership queries
- `rental_leases.property_id`: For property-lease joins
- `rental_payments.lease_id`: For payment-lease joins
- `rental_installments.lease_id`: For installment-lease joins
- `rental_installments.due_date`: For upcoming payments queries
- `rental_installments.status`: For installment status filtering
- `maintenance_tickets.property_id`: For property-maintenance joins

---

## Data Isolation

Owner portal enforces strict data isolation:

1. **Middleware Level**: `requireOwnerPortalAccess` middleware resolves all propertyIds owned by the user
2. **Service Level**: All service methods filter by propertyIds array
3. **Query Level**: All Prisma queries include `propertyId: { in: propertyIds }` filter

This ensures owners can only access data for properties they own, with 100% security enforcement (SC-010).

---

## Summary

The Owner Portal Module uses existing database entities without adding new models. Key entities are:
- **TenantClient**: Property owner identification (PROPRIETAIRE role)
- **Property**: Properties owned by owner
- **RentalLease**: Leases linking properties to tenants
- **RentalPayment**: Revenue tracking
- **RentalInstallment**: Payment obligations
- **RentalSecurityDeposit**: Deposit tracking
- **MaintenanceTicket**: Maintenance issue tracking
- **RentalDocument**: Document access

All queries filter by propertyIds array resolved in middleware to ensure data isolation and security.
