// Subscription plan enum
export enum SubscriptionPlan {
  BASIC = 'BASIC',
  PRO = 'PRO',
  ELITE = 'ELITE'
}

// Billing cycle enum
export enum BillingCycle {
  MONTHLY = 'MONTHLY',
  ANNUAL = 'ANNUAL'
}

// Subscription status enum
export enum SubscriptionStatus {
  TRIALING = 'TRIALING',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  CANCELED = 'CANCELED',
  SUSPENDED = 'SUSPENDED'
}

// Invoice status enum
export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  ISSUED = 'ISSUED',
  PAID = 'PAID',
  FAILED = 'FAILED',
  CANCELED = 'CANCELED',
  REFUNDED = 'REFUNDED'
}

// Create subscription request
export interface CreateSubscriptionRequest {
  tenantId: string;
  planKey: SubscriptionPlan;
  billingCycle: BillingCycle;
  status?: SubscriptionStatus;
  startAt?: Date;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  metadata?: Record<string, unknown>;
}

// Update subscription request
export interface UpdateSubscriptionRequest {
  planKey?: SubscriptionPlan;
  billingCycle?: BillingCycle;
  status?: SubscriptionStatus;
  cancelAt?: Date | null;
  metadata?: Record<string, unknown>;
}

// Create invoice request
export interface CreateInvoiceRequest {
  tenantId: string;
  subscriptionId?: string;
  amountTotal: number;
  currency?: string;
  dueDate: Date;
  issueDate?: Date;
  notes?: string;
}

// Update invoice request
export interface UpdateInvoiceRequest {
  status?: InvoiceStatus;
  paidAt?: Date | null;
  notes?: string;
}

// Subscription with related data
export interface SubscriptionDetail {
  id: string;
  tenantId: string;
  planKey: SubscriptionPlan;
  billingCycle: BillingCycle;
  status: SubscriptionStatus;
  startAt: Date;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAt: Date | null;
  canceledAt: Date | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  invoices?: Array<{
    id: string;
    invoiceNumber: string;
    amountTotal: number;
    status: InvoiceStatus;
    issueDate: Date;
    dueDate: Date;
    paidAt: Date | null;
  }>;
}

// Invoice detail
export interface InvoiceDetail {
  id: string;
  tenantId: string;
  subscriptionId: string | null;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;
  currency: string;
  amountTotal: number;
  status: InvoiceStatus;
  paidAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}




