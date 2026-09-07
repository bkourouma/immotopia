/**
 * Owner Portal Types
 * TypeScript interfaces and types for owner portal module
 */

import {
  Property,
  RentalLease,
  RentalPayment,
  RentalInstallment,
  RentalSecurityDeposit,
  RentalDocument,
  MaintenanceTicket,
  TenantClient
} from '@prisma/client';

// Dashboard Types
export interface DashboardData {
  portfolioSummary: PortfolioSummary;
  revenueMetrics: RevenueMetrics;
  occupancyRate: number;
  upcomingPayments: UpcomingPayment[];
  recentPayments: RecentPayment[];
  recentTickets: RecentTicket[];
}

export interface PortfolioSummary {
  total: number;
  rented: number;
  available: number;
  inMaintenance: number;
}

export interface RevenueMetrics {
  currentMonth: number;
  currentYear: number;
  lastMonth: number;
  lastYear: number;
}

export interface UpcomingPayment {
  id: string;
  propertyAddress: string;
  tenantName: string;
  period: string;
  dueDate: Date;
  amount: number;
  status: string;
}

export interface RecentPayment {
  id: string;
  propertyAddress: string;
  tenantName: string;
  amount: number;
  date: Date;
  method: string;
}

export interface RecentTicket {
  id: string;
  propertyAddress: string;
  title: string;
  status: string;
  createdAt: Date;
}

// Property Types
export interface PropertiesListData {
  properties: PropertyListItem[];
  summary: PortfolioSummary;
}

export interface PropertyListItem {
  id: string;
  address: string;
  propertyType: string;
  status: string;
  transactionModes: string[];
  currentLease?: LeaseOverview | null;
}

export interface LeaseOverview {
  id: string;
  tenantName: string;
  startDate: Date;
  endDate: Date | null;
  monthlyRent: number;
  status: string;
}

export interface PropertyDetailsData {
  property: Property & {
    media: any[];
    documents: any[];
  };
  currentLease?:
    | (RentalLease & {
        primaryRenter: TenantClient;
        coRenters: TenantClient[];
      })
    | null;
  leaseHistory: (RentalLease & {
    primaryRenter: TenantClient;
  })[];
  revenueStats: PropertyRevenueStats;
  maintenanceHistory: MaintenanceTicket[];
}

export interface PropertyRevenueStats {
  totalReceived: number;
  currentMonth: number;
  averageMonthly: number;
}

// Lease Types
export interface LeasesListData {
  leases: LeaseListItem[];
  summary: LeaseSummary;
}

export interface LeaseListItem {
  id: string;
  propertyAddress: string;
  tenantName: string;
  startDate: Date;
  endDate: Date | null;
  monthlyRent: number;
  status: string;
}

export interface LeaseSummary {
  active: number;
  ended: number;
  suspended: number;
}

export interface LeaseDetailsData {
  lease: RentalLease & {
    property: Property;
    primaryRenter: TenantClient;
    ownerClient?: TenantClient | null;
    coRenters: TenantClient[];
  };
  installments: RentalInstallment[];
  paymentHistory: RentalPayment[];
  balance: LeaseBalance;
  deposit: RentalSecurityDeposit & {
    movements: any[];
  };
}

export interface LeaseBalance {
  totalDue: number;
  totalPaid: number;
  remaining: number;
}

// Revenue Types
export interface RevenueSummaryData {
  currentMonth: number;
  lastMonth: number;
  currentYear: number;
  lastYear: number;
  allTime: number;
  averageMonthly: number;
}

export interface RevenueByPropertyData {
  propertyId: string;
  propertyAddress: string;
  revenue: number;
  paymentCount: number;
}

export interface RevenueByMonthData {
  month: string; // Format: "YYYY-MM"
  monthName: string; // Format: "January 2024"
  revenue: number;
  paymentCount: number;
}

// Installment Types
export interface InstallmentsListData {
  installments: InstallmentListItem[];
  summary: InstallmentSummary;
}

export interface InstallmentListItem {
  id: string;
  propertyAddress: string;
  tenantName: string;
  period: string;
  dueDate: Date;
  penaltyAmount: number;
  paidAmount: number;
  amount: number;
  status: string;
}

export interface InstallmentSummary {
  total: number;
  due: number;
  overdue: number;
  paid: number;
  totalAmount: number;
  dueAmount: number;
}

// Payment Types
export interface PaymentsListData {
  payments: PaymentListItem[];
  summary: PaymentSummary;
}

export interface PaymentListItem {
  id: string;
  propertyAddress: string;
  tenantName: string;
  amount: number;
  date: Date;
  method: string;
  status: string;
}

export interface PaymentSummary {
  total: number;
  totalAmount: number;
  thisMonth: number;
  thisYear: number;
}

export interface PaymentDetailsData {
  payment: RentalPayment & {
    lease: RentalLease & {
      property: Property;
      primaryRenter: TenantClient;
    };
    allocations: any[];
  };
}

// Deposit Types
export interface DepositsListData {
  deposits: DepositListItem[];
  summary: DepositSummary;
}

export interface DepositListItem {
  id: string;
  propertyAddress: string;
  tenantName: string;
  depositAmount: number;
  currentHeldAmount: number;
  status: string;
}

export interface DepositSummary {
  total: number;
  totalHeld: number;
  totalReleased: number;
}

export interface DepositMovementsData {
  movements: any[];
}

// Maintenance Types
export interface MaintenanceTicketsListData {
  tickets: MaintenanceTicketListItem[];
  summary: MaintenanceTicketSummary;
}

export interface MaintenanceTicketListItem {
  id: string;
  propertyAddress: string;
  category: string;
  priority: string;
  title: string;
  status: string;
  createdAt: Date;
}

export interface MaintenanceTicketSummary {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  totalCost: number;
}

export interface MaintenanceTicketDetailsData {
  ticket: MaintenanceTicket & {
    property: Property;
    lease?: RentalLease | null;
    attachments: any[];
    comments: any[];
    statusHistory: any[];
  };
}

// Document Types
export interface DocumentsListData {
  documents: RentalDocument[];
  groupedByType: Record<string, RentalDocument[]>;
}

// Report Types
export interface RevenueReportParams {
  startDate: Date;
  endDate: Date;
  propertyId?: string;
}

export interface OccupancyReportParams {
  asOfDate: Date;
}

export interface ExportDataParams {
  entityType: 'payments' | 'installments' | 'leases';
  startDate?: Date;
  endDate?: Date;
  propertyId?: string;
}
