/**
 * Tenant Portal Types
 * TypeScript interfaces and types for tenant portal module
 */

import {
  RentalLease,
  RentalInstallment,
  RentalPayment,
  RentalSecurityDeposit,
  RentalDocument,
  MaintenanceTicket,
  TenantClient,
  Property
} from '@prisma/client';

// Dashboard Types
export interface DashboardData {
  lease: LeaseOverview;
  currentBalance: number;
  overdueInstallmentsCount: number;
  nextInstallment: InstallmentOverview | null;
  recentPayments: PaymentOverview[];
  depositInfo: DepositOverview;
  maintenanceTickets: MaintenanceSummary;
}

export interface LeaseOverview {
  id: string;
  propertyAddress: string;
  startDate: Date;
  endDate: Date | null;
  monthlyRent: number;
  serviceCharges: number;
  status: string;
}

export interface InstallmentOverview {
  id: string;
  period: string; // Format: "YYYY-MM"
  dueDate: Date;
  amount: number;
  status: string;
}

export interface PaymentOverview {
  id: string;
  amount: number;
  date: Date;
  method: string;
}

export interface DepositOverview {
  amount: number;
  status: string;
  heldAmount: number;
  /** Montant effectivement collecté (versé par le locataire) */
  collectedAmount: number;
}

export interface MaintenanceSummary {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
}

// Lease Details Types
export interface LeaseDetailsData {
  lease: RentalLease & {
    property: Property;
    primaryRenter: TenantClient;
    ownerClient?: TenantClient | null;
  };
  coRenters: TenantClient[];
  documents: RentalDocument[];
}

// Installments Types
export interface InstallmentsListData {
  installments: InstallmentListItem[];
  summary: InstallmentSummary;
}

export interface InstallmentListItem {
  id: string;
  period: string;
  dueDate: Date;
  amount: number;
  status: string;
}

export interface InstallmentSummary {
  total: number;
  paid: number;
  due: number;
  overdue: number;
  partial: number;
}

export interface InstallmentDetailsData {
  installment: RentalInstallment & {
    items: any[];
    allocations: any[];
    penalties: any[];
  };
  relatedPayments: RentalPayment[];
}

// Payment History Types
export interface PaymentHistoryData {
  payments: PaymentHistoryItem[];
  totalPaid: number;
}

export interface PaymentHistoryItem {
  id: string;
  amount: number;
  date: Date;
  method: string;
  status: string;
  allocations: any[];
}

// Payment Declaration Types
export interface PaymentDeclarationData {
  id: string;
  leaseId: string;
  installmentId: string | null;
  amount: number;
  paymentDate: Date;
  paymentMethod: string;
  mobileOperator: string | null;
  reference: string | null;
  proofFileUrl: string | null;
  status: string;
  createdAt: Date;
}

export interface DeclarePaymentRequest {
  amount: number;
  paymentDate: string; // ISO date string
  paymentMethod: string;
  mobileOperator?: string;
  reference?: string;
  installmentId?: string;
  notes?: string;
}

// Deposit Types
export interface DepositInfoData {
  deposit: RentalSecurityDeposit;
  movements: any[];
  currentHeldAmount: number;
}

// Maintenance Types
export interface MaintenanceTicketsListData {
  tickets: MaintenanceTicketListItem[];
  summary: MaintenanceSummary;
}

export interface MaintenanceTicketListItem {
  id: string;
  category: string;
  priority: string;
  title: string;
  status: string;
  createdAt: Date;
}

export interface MaintenanceTicketDetailData {
  ticket: MaintenanceTicket & {
    comments: any[];
    attachments: any[];
  };
}

// Documents Types
export interface DocumentsListData {
  documents: RentalDocument[];
  groupedByType: Record<string, RentalDocument[]>;
}
