import {
  RentalLease,
  RentalLeaseCoRenter,
  RentalInstallment,
  RentalInstallmentItem,
  RentalPayment,
  RentalPaymentAllocation,
  RentalRefund,
  RentalPenaltyRule,
  RentalPenalty,
  RentalSecurityDeposit,
  RentalDepositMovement,
  RentalDocument,
  RentalPaymentDeclaration,
  RentalLeaseStatus,
  RentalBillingFrequency,
  RentalInstallmentStatus,
  RentalChargeType,
  RentalPaymentMethod,
  RentalPaymentStatus,
  PaymentDeclarationStatus,
  MobileMoneyOperator,
  RentalPenaltyMode,
  RentalDepositMovementType,
  RentalDocumentType,
  RentalDocumentStatus
} from '@prisma/client';

// Re-export Prisma types
export type {
  RentalLease,
  RentalLeaseCoRenter,
  RentalInstallment,
  RentalInstallmentItem,
  RentalPayment,
  RentalPaymentAllocation,
  RentalRefund,
  RentalPenaltyRule,
  RentalPenalty,
  RentalSecurityDeposit,
  RentalDepositMovement,
  RentalDocument,
  RentalPaymentDeclaration,
  RentalLeaseStatus,
  RentalBillingFrequency,
  RentalInstallmentStatus,
  RentalChargeType,
  RentalPaymentMethod,
  RentalPaymentStatus,
  PaymentDeclarationStatus,
  MobileMoneyOperator,
  RentalPenaltyMode,
  RentalDepositMovementType,
  RentalDocumentType,
  RentalDocumentStatus
};

// Extended Lease with relationships
export interface LeaseDetail extends RentalLease {
  property?: {
    id: string;
    reference: string;
    address?: string;
  };
  primaryRenter?: {
    id: string;
    userId: string;
    clientType: string;
    details?: any;
    crmContactId?: string;
    user?: {
      id: string;
      fullName: string | null;
      email: string;
    };
  };
  ownerClient?: {
    id: string;
    userId: string;
    clientType: string;
    details?: any;
    crmContactId?: string;
    user?: {
      id: string;
      fullName: string | null;
      email: string;
    };
  };
  coRenters?: RentalLeaseCoRenter[];
  installments?: RentalInstallment[];
  deposit?: RentalSecurityDeposit;
  documents?: RentalDocument[];
}

// Extended Installment with relationships
export interface InstallmentDetail extends RentalInstallment {
  lease?: {
    id: string;
    leaseNumber: string;
  };
  items?: RentalInstallmentItem[];
  payments?: RentalPaymentAllocation[];
  penalties?: RentalPenalty[];
}

// Extended Payment with relationships
export interface PaymentDetail extends RentalPayment {
  lease?: {
    id: string;
    leaseNumber: string;
  };
  renterClient?: {
    id: string;
    userId: string;
  };
  allocations?: RentalPaymentAllocation[];
  refunds?: RentalRefund[];
}

// Extended Security Deposit with relationships
export interface SecurityDepositDetail extends RentalSecurityDeposit {
  lease?: {
    id: string;
    leaseNumber: string;
  };
  movements?: RentalDepositMovement[];
}

// Request/Response types
export interface CreateLeaseRequest {
  leaseNumber?: string; // Optional - will be auto-generated if not provided
  propertyId: string;
  // Support both CRM contact IDs and TenantClient IDs
  // If contactId is provided, a TenantClient will be auto-created
  primaryRenterClientId?: string;
  primaryRenterContactId?: string;
  ownerClientId?: string;
  ownerContactId?: string;
  startDate: Date;
  endDate?: Date;
  billingFrequency: RentalBillingFrequency;
  dueDayOfMonth: number;
  currency?: string;
  rentAmount: number;
  serviceChargeAmount?: number;
  securityDepositAmount?: number;
  penaltyGraceDays?: number;
  penaltyMode?: RentalPenaltyMode;
  penaltyRate?: number;
  penaltyFixedAmount?: number;
  penaltyCapAmount?: number;
  notes?: string;
  termsJson?: Record<string, any>;
  // Champs deja ecrits par `createLease` mais absents de ce contrat : le
  // service les lisait sans que le type les declare (backlog AUDIT_CODE.md
  // §3.7). Ajout du declaratif, aucun changement de comportement.
  crmDealId?: string;
  moveInDate?: Date;
  moveOutDate?: Date;
}

export interface UpdateLeaseRequest {
  endDate?: Date;
  moveInDate?: Date;
  moveOutDate?: Date;
  rentAmount?: number;
  serviceChargeAmount?: number;
  securityDepositAmount?: number;
  billingFrequency?: RentalBillingFrequency;
  notes?: string;
}

export interface CreatePaymentRequest {
  leaseId?: string;
  renterClientId?: string;
  invoiceId?: string;
  method: RentalPaymentMethod;
  amount: number;
  currency?: string;
  mmOperator?: MobileMoneyOperator;
  mmPhone?: string;
  pspName?: string;
  pspTransactionId?: string;
  pspReference?: string;
  /** Date du règlement, `YYYY-MM-DD`. Absente : maintenant. */
  paidAt?: string;
  idempotencyKey: string;
}

export interface AllocatePaymentRequest {
  installmentIds: string[];
  amounts?: Record<string, number>;
}

export interface GenerateInstallmentsRequest {
  leaseId: string;
}

export interface CalculatePenaltiesRequest {
  leaseId?: string;
  installmentId?: string;
}

export interface CreateDepositMovementRequest {
  type: RentalDepositMovementType;
  amount: number;
  paymentId?: string;
  installmentId?: string;
  note?: string;
  metadata?: Record<string, any>;
}

export interface GenerateDocumentRequest {
  type: RentalDocumentType;
  leaseId?: string;
  installmentId?: string;
  paymentId?: string;
  title?: string;
  description?: string;
}

// Payment Declaration types
export interface ApprovePaymentDeclarationRequest {
  reviewNotes?: string;
}

export interface RejectPaymentDeclarationRequest {
  reviewNotes: string;
}

export interface PaymentDeclarationFilters {
  status?: PaymentDeclarationStatus;
  leaseId?: string;
  declaredBy?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface PaymentDeclarationDetail extends RentalPaymentDeclaration {
  lease?: {
    id: string;
    lease_number: string;
    property?: {
      id: string;
      address: string;
    };
  };
  installment?: {
    id: string;
    period_year: number;
    period_month: number;
    due_date: Date;
  };
  declarer?: {
    id: string;
    user?: {
      fullName: string | null;
      email: string;
    };
  };
  reviewer?: {
    id: string;
    fullName: string | null;
    email: string;
  };
}
