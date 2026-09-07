# Quick Start Guide: Owner Portal Module

**Feature**: 009-owner-portal  
**Date**: 2025-01-27  
**Purpose**: Quick reference guide for developers implementing the owner portal module

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
  - Property module (properties with ownership)

---

## Setup Steps

### 1. Database Migration

Add owner portal tracking fields to TenantClient model:

```prisma
model TenantClient {
  // ... existing fields
  ownerPortalEnabled     Boolean  @default(false)
  ownerPortalLastAccess  DateTime?
}
```

Run migration:

```bash
cd packages/api
npx prisma migrate dev --name add_owner_portal_fields
```

### 2. Backend Implementation

#### 2.1 Create Middleware

Create `packages/api/src/middleware/owner-portal-access.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/database';
import { ClientType } from '@prisma/client';

export const requireOwnerPortalAccess = async (
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
      res.status(403).json({ success: false, message: 'Accès portail propriétaire refusé.' });
      return;
    }

    // Verify PROPRIETAIRE role
    if (tenantClient.clientType !== ClientType.PROPRIETAIRE) {
      res.status(403).json({ success: false, message: 'Vous devez être propriétaire.' });
      return;
    }

    // Resolve owned properties
    // Method 1: Direct ownership via Property.ownerUserId
    const directOwnedProperties = await prisma.property.findMany({
      where: { ownerUserId: tenantClient.userId },
      select: { id: true }
    });

    // Method 2: Ownership via RentalLease.ownerClient
    const leaseOwnedProperties = await prisma.rentalLease.findMany({
      where: { ownerClientId: tenantClient.id },
      select: { propertyId: true },
      distinct: ['propertyId']
    });

    const propertyIds = [
      ...directOwnedProperties.map(p => p.id),
      ...leaseOwnedProperties.map(l => l.propertyId)
    ];

    if (propertyIds.length === 0) {
      res.status(403).json({ success: false, message: 'Aucune propriété trouvée.' });
      return;
    }

    // Store portal context in request
    req.ownerPortal = {
      tenantClientId: tenantClient.id,
      tenantId: tenantClient.tenantId,
      propertyIds
    };

    next();
  } catch (error) {
    console.error('Owner portal access check error:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la vérification des accès.' });
  }
};

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      ownerPortal?: {
        tenantClientId: string;
        tenantId: string;
        propertyIds: string[];
      };
    }
  }
}
```

#### 2.2 Create Service

Create `packages/api/src/services/owner-portal-service.ts`:

```typescript
import { prisma } from '../utils/database';
import { startOfMonth, addMonths, startOfYear, endOfYear } from 'date-fns';

export class OwnerPortalService {
  async getDashboard(propertyIds: string[]) {
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

    const portfolioSummary = {
      total: properties.length,
      rented: properties.filter(p => p.rentalLeases.length > 0).length,
      available: properties.filter(p => p.rentalLeases.length === 0 && p.status === 'AVAILABLE').length,
      inMaintenance: properties.filter(p => p.status === 'UNDER_MAINTENANCE').length
    };

    // Revenue metrics
    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const currentMonthEnd = addMonths(currentMonthStart, 1);
    const lastMonthStart = addMonths(currentMonthStart, -1);
    const currentYearStart = startOfYear(now);
    const lastYearStart = addMonths(currentYearStart, -12);

    const currentMonthRevenue = await prisma.rentalPayment.aggregate({
      where: {
        lease: { propertyId: { in: propertyIds } },
        status: 'SUCCESS',
        date: { gte: currentMonthStart, lt: currentMonthEnd }
      },
      _sum: { amount: true }
    });

    const lastMonthRevenue = await prisma.rentalPayment.aggregate({
      where: {
        lease: { propertyId: { in: propertyIds } },
        status: 'SUCCESS',
        date: { gte: lastMonthStart, lt: currentMonthStart }
      },
      _sum: { amount: true }
    });

    const currentYearRevenue = await prisma.rentalPayment.aggregate({
      where: {
        lease: { propertyId: { in: propertyIds } },
        status: 'SUCCESS',
        date: { gte: currentYearStart }
      },
      _sum: { amount: true }
    });

    const lastYearRevenue = await prisma.rentalPayment.aggregate({
      where: {
        lease: { propertyId: { in: propertyIds } },
        status: 'SUCCESS',
        date: { gte: lastYearStart, lt: currentYearStart }
      },
      _sum: { amount: true }
    });

    // Occupancy rate
    const occupancyRate = portfolioSummary.total > 0
      ? (portfolioSummary.rented / portfolioSummary.total) * 100
      : 0;

    // Upcoming payments (next 5 installments with status DUE)
    const upcomingPayments = await prisma.rentalInstallment.findMany({
      where: {
        lease: { propertyId: { in: propertyIds } },
        status: 'DUE',
        dueDate: { gte: now }
      },
      orderBy: { dueDate: 'asc' },
      take: 5,
      include: {
        lease: {
          include: {
            property: true,
            primaryRenter: true
          }
        }
      }
    });

    // Recent activity
    const recentPayments = await prisma.rentalPayment.findMany({
      where: {
        lease: { propertyId: { in: propertyIds } },
        status: 'SUCCESS'
      },
      orderBy: { date: 'desc' },
      take: 5,
      include: {
        lease: {
          include: {
            property: true,
            primaryRenter: true
          }
        }
      }
    });

    const recentTickets = await prisma.maintenanceTicket.findMany({
      where: {
        propertyId: { in: propertyIds }
      },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    return {
      properties: portfolioSummary,
      revenues: {
        currentMonth: Number(currentMonthRevenue._sum.amount || 0),
        currentYear: Number(currentYearRevenue._sum.amount || 0),
        lastMonth: Number(lastMonthRevenue._sum.amount || 0),
        lastYear: Number(lastYearRevenue._sum.amount || 0)
      },
      occupancy: {
        rate: occupancyRate,
        rentedUnits: portfolioSummary.rented,
        totalUnits: portfolioSummary.total
      },
      upcomingPayments: {
        count: upcomingPayments.length,
        totalAmount: upcomingPayments.reduce((sum, inst) => sum + Number(inst.amountRent), 0),
        installments: upcomingPayments
      },
      recentActivity: {
        recentPayments,
        recentTickets
      }
    };
  }

  async getProperties(propertyIds: string[], filters?: any) {
    const where: any = { id: { in: propertyIds } };
    
    if (filters?.status) where.status = filters.status;
    if (filters?.propertyType) where.propertyType = filters.propertyType;
    if (filters?.transactionMode) where.transactionModes = { has: filters.transactionMode };

    const properties = await prisma.property.findMany({
      where,
      include: {
        media: {
          where: { isPrimary: true },
          take: 1
        },
        rentalLeases: {
          where: { status: 'ACTIVE' },
          take: 1,
          include: {
            primaryRenter: true
          }
        }
      }
    });

    const summary = {
      total: properties.length,
      available: properties.filter(p => p.rentalLeases.length === 0 && p.status === 'AVAILABLE').length,
      rented: properties.filter(p => p.rentalLeases.length > 0).length,
      underMaintenance: properties.filter(p => p.status === 'UNDER_MAINTENANCE').length
    };

    return { properties, summary };
  }

  // Add other service methods (getPropertyDetails, getLeases, getRevenues, etc.)
  // See spec.md for complete list of required methods
}
```

#### 2.3 Create Controller

Create `packages/api/src/controllers/owner-portal-controller.ts`:

```typescript
import { Request, Response } from 'express';
import { OwnerPortalService } from '../services/owner-portal-service';

const ownerPortalService = new OwnerPortalService();

export class OwnerPortalController {
  async getDashboard(req: Request, res: Response) {
    try {
      const { propertyIds } = req.ownerPortal!;
      const dashboard = await ownerPortalService.getDashboard(propertyIds);
      res.json({ success: true, data: dashboard });
    } catch (error) {
      console.error('Dashboard error:', error);
      res.status(500).json({ success: false, message: 'Erreur lors du chargement du tableau de bord.' });
    }
  }

  async getProperties(req: Request, res: Response) {
    try {
      const { propertyIds } = req.ownerPortal!;
      const filters = req.query;
      const properties = await ownerPortalService.getProperties(propertyIds, filters);
      res.json({ success: true, data: properties });
    } catch (error) {
      console.error('Properties error:', error);
      res.status(500).json({ success: false, message: 'Erreur lors du chargement des propriétés.' });
    }
  }

  // Add other controller methods
  // See spec.md and contracts/openapi.yaml for complete API
}
```

#### 2.4 Create Routes

Create `packages/api/src/routes/owner-portal-routes.ts`:

```typescript
import express from 'express';
import { authenticate } from '../middleware/auth-middleware';
import { requireOwnerPortalAccess } from '../middleware/owner-portal-access';
import { OwnerPortalController } from '../controllers/owner-portal-controller';

const router = express.Router();
const controller = new OwnerPortalController();

// All routes require authentication and owner portal access
router.use(authenticate);
router.use(requireOwnerPortalAccess);

router.get('/dashboard', controller.getDashboard);
router.get('/properties', controller.getProperties);
router.get('/properties/:id', controller.getPropertyDetails);
router.get('/leases', controller.getLeases);
router.get('/leases/:id', controller.getLeaseDetails);
router.get('/revenues', controller.getRevenues);
router.get('/revenues/summary', controller.getRevenueSummary);
router.get('/revenues/by-property', controller.getRevenuesByProperty);
router.get('/revenues/by-month', controller.getRevenuesByMonth);
router.get('/installments', controller.getInstallments);
router.get('/payments', controller.getPayments);
router.get('/payments/:id', controller.getPaymentDetails);
router.get('/deposits', controller.getDeposits);
router.get('/deposits/:id/movements', controller.getDepositMovements);
router.get('/maintenance', controller.getMaintenanceTickets);
router.get('/maintenance/:id', controller.getMaintenanceTicketDetails);
router.get('/documents', controller.getDocuments);
router.get('/documents/:id/download', controller.downloadDocument);
router.get('/reports/revenues', controller.generateRevenueReport);
router.get('/reports/occupancy', controller.generateOccupancyReport);
router.post('/reports/export', controller.exportData);

export default router;
```

#### 2.5 Register Routes

Add to `packages/api/src/index.ts`:

```typescript
import ownerPortalRoutes from './routes/owner-portal-routes';

// ... existing code

app.use('/api/portal/owner', ownerPortalRoutes);
```

### 3. Frontend Implementation

#### 3.1 Create Service

Create `apps/web/src/services/ownerPortalService.ts`:

```typescript
import api from './api';

export const ownerPortalService = {
  getDashboard: () => api.get('/portal/owner/dashboard'),
  getProperties: (params?: any) => api.get('/portal/owner/properties', { params }),
  getPropertyDetails: (id: string) => api.get(`/portal/owner/properties/${id}`),
  getLeases: (params?: any) => api.get('/portal/owner/leases', { params }),
  getLeaseDetails: (id: string) => api.get(`/portal/owner/leases/${id}`),
  getRevenues: (params?: any) => api.get('/portal/owner/revenues', { params }),
  getRevenueSummary: () => api.get('/portal/owner/revenues/summary'),
  getRevenuesByProperty: (params?: any) => api.get('/portal/owner/revenues/by-property', { params }),
  getRevenuesByMonth: (year: number) => api.get('/portal/owner/revenues/by-month', { params: { year } }),
  getInstallments: (params?: any) => api.get('/portal/owner/installments', { params }),
  getPayments: (params?: any) => api.get('/portal/owner/payments', { params }),
  getPaymentDetails: (id: string) => api.get(`/portal/owner/payments/${id}`),
  getDeposits: () => api.get('/portal/owner/deposits'),
  getDepositMovements: (depositId: string) => api.get(`/portal/owner/deposits/${depositId}/movements`),
  getMaintenanceTickets: (params?: any) => api.get('/portal/owner/maintenance', { params }),
  getMaintenanceTicketDetails: (id: string) => api.get(`/portal/owner/maintenance/${id}`),
  getDocuments: (params?: any) => api.get('/portal/owner/documents', { params }),
  downloadDocument: (documentId: string) => api.get(`/portal/owner/documents/${documentId}/download`, { responseType: 'blob' }),
  generateRevenueReport: (params: any) => api.get('/portal/owner/reports/revenues', { params, responseType: 'blob' }),
  generateOccupancyReport: (params: any) => api.get('/portal/owner/reports/occupancy', { params, responseType: 'blob' }),
  exportData: (data: any) => api.post('/portal/owner/reports/export', data, { responseType: 'blob' })
};
```

#### 3.2 Create Layout

Create `apps/web/src/pages/OwnerPortal/Layout.tsx`:

```typescript
import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Building2, FileText, TrendingUp, CreditCard, Wrench, Download, BarChart3 } from 'lucide-react';

const OwnerPortalLayout = () => {
  const location = useLocation();
  
  const navItems = [
    { path: '/owner', icon: LayoutDashboard, label: 'Tableau de bord' },
    { path: '/owner/properties', icon: Building2, label: 'Mes Propriétés' },
    { path: '/owner/leases', icon: FileText, label: 'Baux Actifs' },
    { path: '/owner/revenues', icon: TrendingUp, label: 'Revenus' },
    { path: '/owner/payments', icon: CreditCard, label: 'Paiements' },
    { path: '/owner/maintenance', icon: Wrench, label: 'Maintenance' },
    { path: '/owner/documents', icon: Download, label: 'Documents' },
    { path: '/owner/reports', icon: BarChart3, label: 'Rapports' }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Portail Propriétaire</h1>
        </div>
      </header>

      <div className="flex">
        <aside className="w-64 bg-white shadow-sm min-h-screen">
          <nav className="p-4 space-y-2">
            {navItems.map(item => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                  location.pathname === item.path
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
        </aside>

        <main className="flex-1 p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default OwnerPortalLayout;
```

#### 3.3 Create Dashboard Page

Create `apps/web/src/pages/OwnerPortal/Dashboard.tsx`:

```typescript
import React, { useEffect, useState } from 'react';
import { ownerPortalService } from '../../services/ownerPortalService';
import { Building2, TrendingUp, Calendar, Percent } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const OwnerDashboard = () => {
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const { data } = await ownerPortalService.getDashboard();
      setDashboard(data);
    } catch (error) {
      console.error('Erreur chargement dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Chargement...</div>;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Tableau de bord</h2>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center gap-3 mb-3">
            <Building2 className="w-8 h-8 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Propriétés</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">{dashboard.properties.total}</p>
          <div className="text-sm text-gray-500 mt-2 space-y-1">
            <p>Louées : {dashboard.properties.rented}</p>
            <p>Disponibles : {dashboard.properties.available}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center gap-3 mb-3">
            <TrendingUp className="w-8 h-8 text-green-600" />
            <h3 className="font-semibold text-gray-900">Revenus Mois</h3>
          </div>
          <p className="text-3xl font-bold text-green-600">
            {dashboard.revenues.currentMonth.toLocaleString()} FCFA
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center gap-3 mb-3">
            <Percent className="w-8 h-8 text-purple-600" />
            <h3 className="font-semibold text-gray-900">Taux d'Occupation</h3>
          </div>
          <p className="text-3xl font-bold text-purple-600">
            {dashboard.occupancy.rate.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Add more dashboard sections */}
    </div>
  );
};

export default OwnerDashboard;
```

#### 3.4 Add Routes

Update `apps/web/src/App.tsx`:

```typescript
import OwnerPortalLayout from './pages/OwnerPortal/Layout';
import OwnerDashboard from './pages/OwnerPortal/Dashboard';
// ... import other pages

// In routes:
<Route path="/owner" element={<OwnerPortalLayout />}>
  <Route index element={<OwnerDashboard />} />
  <Route path="properties" element={<OwnerProperties />} />
  <Route path="properties/:id" element={<OwnerPropertyDetails />} />
  {/* ... other routes */}
</Route>
```

### 4. Install Dependencies

```bash
# Backend
cd packages/api
npm install date-fns pdf-lib exceljs csv-writer

# Frontend
cd apps/web
npm install recharts
```

### 5. Testing

1. **Test Middleware**: Verify owner portal access is restricted to PROPRIETAIRE role
2. **Test Property Ownership**: Verify owners can only access their own properties
3. **Test Dashboard**: Verify dashboard loads with correct data
4. **Test Revenue Analytics**: Verify revenue calculations are accurate
5. **Test Reports**: Verify report generation works for all formats

---

## Key Implementation Notes

1. **Property Ownership**: Always filter by `propertyIds` array from middleware
2. **Revenue Calculations**: Use Prisma aggregations for efficiency
3. **Date Handling**: Use `date-fns` for consistent date calculations
4. **Report Generation**: Store generated reports temporarily, cleanup old files
5. **UI Language**: All UI text must be in French (Constitution requirement)
6. **Security**: Never trust client-side property IDs, always use middleware-resolved `propertyIds`

---

## Next Steps

1. Implement remaining service methods (see spec.md)
2. Create all frontend pages (Properties, Leases, Revenues, etc.)
3. Add chart visualizations using Recharts
4. Implement report generation
5. Add comprehensive tests
6. Update documentation
