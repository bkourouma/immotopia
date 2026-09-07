# Research: Owner Portal Module

**Feature**: 009-owner-portal  
**Date**: 2025-01-27  
**Purpose**: Document technology decisions and rationale for owner portal implementation

---

## Technology Decisions

### 1. Owner Portal Access Middleware

**Decision**: Create new middleware `requireOwnerPortalAccess` that verifies JWT authentication, checks user is linked to TenantClient, verifies user has PROPRIETAIRE role in TenantClient, and resolves all properties owned by the user.

**Rationale**:
- **JWT Authentication**: Existing `authenticate` middleware handles JWT validation, so new middleware runs after authentication
- **TenantClient Link**: Users must be linked to TenantClient records to access portal (property owners, not property managers)
- **PROPRIETAIRE Role Check**: Portal access requires TenantClient with `clientType = PROPRIETAIRE`
- **Property Ownership Resolution**: Must find all properties owned by the user through two methods:
  1. Direct ownership: `Property.ownerUserId = TenantClient.userId`
  2. Lease ownership: Properties where `RentalLease.ownerClient = TenantClient.id`
- **Context Storage**: Store `tenantClientId`, `tenantId`, and `propertyIds` array in `req.ownerPortal` for use in controllers/services

**Alternatives Considered**:
- **RBAC Permission Check**: Could use existing permission system, but owner portal is a special case requiring PROPRIETAIRE role validation
- **Separate Route Group**: Portal routes are already grouped under `/api/portal/owner/*`, middleware provides additional security layer
- **Property-by-Property Validation**: Could validate property access per request, but pre-resolving all property IDs is more efficient for filtering queries

**Implementation**:
```typescript
// Middleware checks:
// 1. req.user exists (from authenticate middleware)
// 2. Find TenantClient where userId = req.user.userId
// 3. Verify clientType = PROPRIETAIRE
// 4. Find all properties where:
//    - Property.ownerUserId = TenantClient.userId OR
//    - Property.id IN (SELECT property_id FROM rental_leases WHERE owner_client_id = TenantClient.id)
// 5. Store in req.ownerPortal = { tenantClientId, tenantId, propertyIds: string[] }
```

**References**:
- Existing authentication: `packages/api/src/middleware/auth-middleware.ts`
- Existing tenant portal access: `packages/api/src/middleware/tenant-portal-access.ts` (similar pattern)
- TenantClient model: `packages/api/prisma/schema.prisma` (TenantClient with clientType)
- Property model: `packages/api/prisma/schema.prisma` (Property with ownerUserId)
- RentalLease model: `packages/api/prisma/schema.prisma` (RentalLease with ownerClient)

---

### 2. Property Ownership Resolution

**Decision**: Properties are owned by a property owner through two mechanisms:
1. **Direct Ownership**: `Property.ownerUserId` matches `TenantClient.userId`
2. **Lease Ownership**: Property has a `RentalLease` where `RentalLease.ownerClient` matches `TenantClient.id`

**Rationale**:
- **Direct Ownership**: Some properties are directly owned by users (Property.ownerUserId set)
- **Lease Ownership**: Properties can be owned through rental leases where the owner is specified as the lease owner
- **Comprehensive Coverage**: Both methods ensure all properties owned by a user are identified
- **Query Efficiency**: Resolve all property IDs once in middleware, then use for filtering in all queries

**Alternatives Considered**:
- **Single Ownership Method**: Using only Property.ownerUserId would miss properties owned through leases
- **Per-Request Validation**: Validating ownership per request is less efficient than pre-resolving all property IDs

**Implementation**:
```typescript
// In middleware, resolve owned properties:
const directOwnedProperties = await prisma.property.findMany({
  where: { ownerUserId: tenantClient.userId },
  select: { id: true }
});

const leaseOwnedProperties = await prisma.rentalLease.findMany({
  where: { ownerClientId: tenantClient.id },
  select: { propertyId: true },
  distinct: ['propertyId']
});

const propertyIds = [
  ...directOwnedProperties.map(p => p.id),
  ...leaseOwnedProperties.map(l => l.propertyId)
];
```

**References**:
- Property model: `packages/api/prisma/schema.prisma` (Property.ownerUserId)
- RentalLease model: `packages/api/prisma/schema.prisma` (RentalLease.ownerClient)

---

### 3. Revenue Analytics and Aggregation

**Decision**: Use Prisma aggregation queries with efficient filtering by property IDs and date ranges to calculate revenue metrics, breakdowns by property, and breakdowns by month.

**Rationale**:
- **Prisma Aggregations**: Prisma provides efficient aggregation functions (`_sum`, `_count`, `_avg`) that work well with filtered queries
- **Property ID Filtering**: All revenue queries filter by `propertyIds` array from middleware to ensure data isolation
- **Date Range Filtering**: Support flexible date range filtering for revenue analysis
- **Grouping Support**: Support grouping by month, year, or property for different analytics views
- **Performance**: Aggregation queries are more efficient than fetching all records and calculating in application code

**Alternatives Considered**:
- **Raw SQL Queries**: Could use raw SQL for complex aggregations, but Prisma aggregations are type-safe and maintainable
- **Application-Level Aggregation**: Fetching all payments and aggregating in code is less efficient and doesn't scale

**Implementation**:
```typescript
// Revenue summary example:
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

// Revenue by property example:
const revenueByProperty = await prisma.rentalPayment.groupBy({
  by: ['lease.propertyId'],
  where: {
    lease: { propertyId: { in: propertyIds } },
    status: 'SUCCESS',
    date: { gte: startDate, lte: endDate }
  },
  _sum: { amount: true },
  _count: { id: true }
});
```

**References**:
- Prisma aggregation: https://www.prisma.io/docs/concepts/components/prisma-client/aggregation-grouping-summarizing
- date-fns library: For date calculations (startOfMonth, addMonths, etc.)

---

### 4. Dashboard Aggregation

**Decision**: Calculate dashboard metrics using Prisma aggregation queries and efficient data fetching, aggregating data across all owner's properties.

**Rationale**:
- **Portfolio Summary**: Count properties by status (total, rented, available, under maintenance) using filtered queries
- **Revenue Metrics**: Calculate current month, current year, last month, last year revenue using aggregation queries
- **Occupancy Rate**: Calculate as (rented properties / total properties) * 100
- **Upcoming Payments**: Find next 5 installments with status DUE, sorted by due date
- **Recent Activity**: Fetch last 5 payments and last 5 maintenance tickets, sorted by date
- **Performance**: Use efficient queries with proper indexes and limit results to avoid loading too much data

**Alternatives Considered**:
- **Single Large Query**: Fetching all data in one query would be inefficient and slow
- **Multiple Small Queries**: Using multiple focused queries is more efficient and allows parallel execution

**Implementation**:
```typescript
// Portfolio summary:
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

// Upcoming payments:
const upcomingPayments = await prisma.rentalInstallment.findMany({
  where: {
    lease: { propertyId: { in: propertyIds } },
    status: 'DUE',
    dueDate: { gte: new Date() }
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
```

**References**:
- Prisma queries: https://www.prisma.io/docs/concepts/components/prisma-client/relation-queries
- Existing dashboard patterns: `packages/api/src/services/tenant-portal-service.ts` (similar aggregation patterns)

---

### 5. Report Generation Libraries

**Decision**: Use the following libraries for report generation:
- **PDF**: `pdf-lib` or `pdfkit` for PDF report generation
- **Excel**: `exceljs` for Excel report generation
- **CSV**: `csv-writer` or native Node.js `fs` with manual CSV formatting

**Rationale**:
- **PDF Generation**: `pdf-lib` is modern, TypeScript-friendly, and supports complex layouts. `pdfkit` is more mature but has less TypeScript support
- **Excel Generation**: `exceljs` is the standard library for Excel generation in Node.js, supports formatting, charts, and large files
- **CSV Generation**: Simple format, can use `csv-writer` for structured approach or manual formatting for simple cases
- **File Storage**: Generated reports stored in `reports/owner/<ownerId>/<reportId>.<ext>` with cleanup job for old reports

**Alternatives Considered**:
- **Puppeteer for PDF**: Could use Puppeteer to render HTML to PDF, but more resource-intensive and slower
- **xlsx for Excel**: Alternative to exceljs, but exceljs has better TypeScript support and more features
- **Template Engines**: Could use template engines (Handlebars, EJS) for report templates, but adds complexity

**Implementation**:
```typescript
// PDF generation example (using pdf-lib):
import { PDFDocument, rgb } from 'pdf-lib';

async function generateRevenueReportPDF(data: RevenueReportData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // Letter size
  
  // Add content
  page.drawText('Revenue Report', { x: 50, y: 750, size: 20 });
  // ... add report content
  
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

// Excel generation example (using exceljs):
import ExcelJS from 'exceljs';

async function generateRevenueReportExcel(data: RevenueReportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Revenue Report');
  
  // Add headers and data
  worksheet.columns = [
    { header: 'Property', key: 'property' },
    { header: 'Revenue', key: 'revenue' }
  ];
  // ... add data rows
  
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
```

**References**:
- pdf-lib: https://pdf-lib.js.org/
- exceljs: https://github.com/exceljs/exceljs
- csv-writer: https://www.npmjs.com/package/csv-writer

---

### 6. Chart Library for Frontend

**Decision**: Use `Recharts` library for revenue visualization (line charts, bar charts) in the frontend.

**Rationale**:
- **React Integration**: Recharts is built specifically for React and integrates seamlessly
- **Chart Types**: Supports line charts (for revenue trends over time) and bar charts (for revenue by property)
- **Responsive**: Charts are responsive and work well on different screen sizes
- **Customization**: Highly customizable for styling and formatting
- **TypeScript Support**: Good TypeScript support with type definitions
- **Performance**: Efficient rendering for moderate data volumes (up to 100 properties)

**Alternatives Considered**:
- **Chart.js with react-chartjs-2**: Popular alternative, but Recharts is more React-native
- **Victory**: Another React charting library, but Recharts has better documentation and community
- **D3.js**: Most powerful but requires more code and is overkill for simple charts

**Implementation**:
```typescript
// Revenue line chart example:
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

<ResponsiveContainer width="100%" height={300}>
  <LineChart data={monthlyRevenueData}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="monthName" />
    <YAxis />
    <Tooltip formatter={(value) => `${value.toLocaleString()} FCFA`} />
    <Line type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2} />
  </LineChart>
</ResponsiveContainer>
```

**References**:
- Recharts: https://recharts.org/
- Recharts documentation: https://recharts.org/en-US/api

---

## Summary

All technical decisions have been made and documented. The implementation will:
1. Use middleware pattern similar to tenant portal for access control
2. Resolve property ownership through Property.ownerUserId and RentalLease.ownerClient
3. Use Prisma aggregations for efficient revenue calculations
4. Use pdf-lib/exceljs/csv-writer for report generation
5. Use Recharts for frontend chart visualization

All decisions align with existing codebase patterns and Constitution requirements.
