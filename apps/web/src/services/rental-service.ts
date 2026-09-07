import apiClient from '../utils/api-client';

// Enums matching Prisma schema
export enum RentalLeaseStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  ENDED = 'ENDED',
  CANCELED = 'CANCELED',
}

export enum RentalBillingFrequency {
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  SEMIANNUAL = 'SEMIANNUAL',
  ANNUAL = 'ANNUAL',
}

export enum RentalInstallmentStatus {
  DRAFT = 'DRAFT',
  DUE = 'DUE',
  PARTIAL = 'PARTIAL',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
}

export enum RentalPaymentMethod {
  CASH = 'CASH',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CHECK = 'CHECK',
  MOBILE_MONEY = 'MOBILE_MONEY',
  CARD = 'CARD',
  OTHER = 'OTHER',
}

export enum RentalPaymentStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  CANCELED = 'CANCELED',
  REFUNDED = 'REFUNDED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
}

export enum RentalPenaltyMode {
  PERCENT_OF_BALANCE = 'PERCENT_OF_BALANCE',
  PERCENT_OF_RENT = 'PERCENT_OF_RENT',
  FIXED_AMOUNT = 'FIXED_AMOUNT',
}

export enum RentalDocumentType {
  LEASE_CONTRACT = 'LEASE_CONTRACT',
  LEASE_ADDENDUM = 'LEASE_ADDENDUM',
  RENT_RECEIPT = 'RENT_RECEIPT',
  RENT_QUITTANCE = 'RENT_QUITTANCE',
  DEPOSIT_RECEIPT = 'DEPOSIT_RECEIPT',
  STATEMENT = 'STATEMENT',
  OTHER = 'OTHER',
}

export enum RentalDocumentStatus {
  DRAFT = 'DRAFT',
  FINAL = 'FINAL',
  VOID = 'VOID',
}

export enum RentalDepositMovementType {
  COLLECT = 'COLLECT',
  HOLD = 'HOLD',
  RELEASE = 'RELEASE',
  REFUND = 'REFUND',
  FORFEIT = 'FORFEIT',
  ADJUSTMENT = 'ADJUSTMENT',
}

export enum PaymentDeclarationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELED = 'CANCELED',
}

// Frontend types matching backend
export interface RentalLease {
  id: string;
  tenant_id: string;
  property_id: string;
  primary_renter_client_id: string;
  owner_client_id?: string | null;
  crm_deal_id?: string | null;
  lease_number: string;
  status: RentalLeaseStatus;
  start_date: string;
  end_date?: string | null;
  move_in_date?: string | null;
  move_out_date?: string | null;
  billing_frequency: RentalBillingFrequency;
  due_day_of_month: number;
  currency: string;
  rent_amount: number;
  service_charge_amount: number;
  security_deposit_amount: number;
  penalty_grace_days: number;
  penalty_mode: string;
  penalty_rate: number;
  penalty_fixed_amount: number;
  penalty_cap_amount?: number | null;
  notes?: string | null;
  terms_json?: any;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  property?: {
    id: string;
    internalReference: string;
    address: string;
    title?: string;
    price?: number;
    currency?: string;
    transactionModes?: string[];
  };
  primaryRenter?: {
    id: string;
    userId: string;
    clientType: string;
    crmContactId?: string;
    user?: {
      id: string;
      fullName: string;
      email: string;
    };
  };
  ownerClient?: {
    id: string;
    userId: string;
    clientType: string;
    crmContactId?: string;
    user?: {
      id: string;
      fullName: string;
      email: string;
    };
  };
  coRenters?: Array<{
    id: string;
    renter_client_id: string;
    renterClient?: {
      id: string;
      userId: string;
      clientType: string;
    };
  }>;
}

export interface CreateLeaseRequest {
  leaseNumber?: string; // Optional - will be auto-generated if not provided
  propertyId: string;
  primaryRenterClientId?: string;
  primaryRenterContactId?: string;
  ownerClientId?: string;
  ownerContactId?: string;
  crmDealId?: string;
  startDate: string;
  endDate?: string;
  moveInDate?: string;
  moveOutDate?: string;
  billingFrequency: RentalBillingFrequency;
  dueDayOfMonth: number;
  currency?: string;
  rentAmount: number;
  serviceChargeAmount?: number;
  securityDepositAmount?: number;
  penaltyGraceDays?: number;
  penaltyMode?: string;
  penaltyRate?: number;
  penaltyFixedAmount?: number;
  penaltyCapAmount?: number;
  notes?: string;
  termsJson?: any;
}

export interface UpdateLeaseRequest {
  endDate?: string;
  moveInDate?: string;
  moveOutDate?: string;
  rentAmount?: number;
  serviceChargeAmount?: number;
  securityDepositAmount?: number;
  billingFrequency?: RentalBillingFrequency;
  notes?: string;
}

export interface LeaseFilters {
  status?: RentalLeaseStatus;
  propertyId?: string;
  primaryRenterClientId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface LeaseListResponse {
  success: boolean;
  data: RentalLease[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface LeaseResponse {
  success: boolean;
  data: RentalLease;
}

// ==================== LEASES ====================

export async function listLeases(
  tenantId: string,
  filters?: LeaseFilters
): Promise<LeaseListResponse> {
  const response = await apiClient.get(`/tenants/${tenantId}/rental/leases`, {
    params: filters,
  });
  return response.data;
}

export async function getLease(
  tenantId: string,
  leaseId: string
): Promise<LeaseResponse> {
  const response = await apiClient.get(
    `/tenants/${tenantId}/rental/leases/${leaseId}`
  );
  return response.data;
}

export async function createLease(
  tenantId: string,
  data: CreateLeaseRequest
): Promise<LeaseResponse> {
  const response = await apiClient.post(
    `/tenants/${tenantId}/rental/leases`,
    data
  );
  return response.data;
}

export async function updateLease(
  tenantId: string,
  leaseId: string,
  data: UpdateLeaseRequest
): Promise<LeaseResponse> {
  const response = await apiClient.patch(
    `/tenants/${tenantId}/rental/leases/${leaseId}`,
    data
  );
  return response.data;
}

export async function updateLeaseStatus(
  tenantId: string,
  leaseId: string,
  status: RentalLeaseStatus
): Promise<LeaseResponse> {
  const response = await apiClient.patch(
    `/tenants/${tenantId}/rental/leases/${leaseId}/status`,
    { status }
  );
  return response.data;
}

export async function deleteLease(
  tenantId: string,
  leaseId: string
): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.delete(
    `/tenants/${tenantId}/rental/leases/${leaseId}`
  );
  return response.data;
}

export async function addCoRenter(
  tenantId: string,
  leaseId: string,
  renterClientId: string
): Promise<LeaseResponse> {
  const response = await apiClient.post(
    `/tenants/${tenantId}/rental/leases/${leaseId}/co-renters`,
    { renterClientId }
  );
  return response.data;
}

export async function removeCoRenter(
  tenantId: string,
  leaseId: string,
  renterClientId: string
): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.delete(
    `/tenants/${tenantId}/rental/leases/${leaseId}/co-renters/${renterClientId}`
  );
  return response.data;
}

export async function listCoRenters(
  tenantId: string,
  leaseId: string
): Promise<{ success: boolean; data: any[] }> {
  const response = await apiClient.get(
    `/tenants/${tenantId}/rental/leases/${leaseId}/co-renters`
  );
  return response.data;
}

// ==================== INSTALLMENTS ====================

export interface RentalInstallment {
  id: string;
  tenant_id: string;
  lease_id: string;
  period_year: number;
  period_month: number;
  due_date: string;
  status: RentalInstallmentStatus;
  currency: string;
  amount_rent: number;
  amount_service: number;
  amount_other_fees: number;
  penalty_amount: number;
  amount_paid: number;
  paid_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface InstallmentFilters {
  leaseId?: string;
  status?: RentalInstallmentStatus;
  year?: number;
  month?: number;
  overdue?: boolean;
  page?: number;
  limit?: number;
}

export interface InstallmentListResponse {
  success: boolean;
  data: RentalInstallment[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function listInstallments(
  tenantId: string,
  filters?: InstallmentFilters
): Promise<InstallmentListResponse> {
  // Use lease-specific endpoint if leaseId is provided
  if (filters?.leaseId) {
    const { leaseId, ...otherFilters } = filters;
    const response = await apiClient.get(
      `/tenants/${tenantId}/rental/leases/${leaseId}/installments`,
      {
        params: otherFilters,
      }
    );
    return response.data;
  }
  
  // Otherwise use generic endpoint
  const response = await apiClient.get(`/tenants/${tenantId}/rental/installments`, {
    params: filters,
  });
  return response.data;
}

export async function getInstallment(
  tenantId: string,
  installmentId: string
): Promise<{ success: boolean; data: RentalInstallment }> {
  const response = await apiClient.get(
    `/tenants/${tenantId}/rental/installments/${installmentId}`
  );
  return response.data;
}

export async function generateInstallments(
  tenantId: string,
  leaseId: string
): Promise<{ success: boolean; data: RentalInstallment[]; message: string }> {
  const response = await apiClient.post(
    `/tenants/${tenantId}/rental/leases/${leaseId}/installments`
  );
  return response.data;
}

export async function recalculateInstallmentStatuses(
  tenantId: string,
  leaseId: string
): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.post(
    `/tenants/${tenantId}/rental/leases/${leaseId}/installments/recalculate`
  );
  return response.data;
}

export async function deleteAllInstallments(
  tenantId: string,
  leaseId: string
): Promise<{ success: boolean; message: string; data: { deletedCount: number } }> {
  const response = await apiClient.delete(
    `/tenants/${tenantId}/rental/leases/${leaseId}/installments`
  );
  return response.data;
}

// ==================== PAYMENTS ====================

export interface RentalPaymentAllocation {
  id: string;
  payment_id: string;
  installment_id: string;
  amount: number;
  currency: string;
  created_at: string;
  installment?: RentalInstallment;
}

export interface RentalPayment {
  id: string;
  tenant_id: string;
  lease_id?: string | null;
  renter_client_id?: string | null;
  invoice_id?: string | null;
  method: RentalPaymentMethod;
  status: RentalPaymentStatus;
  currency: string;
  amount: number;
  mm_operator?: string | null;
  mm_phone?: string | null;
  idempotency_key: string;
  psp_name?: string | null;
  psp_transaction_id?: string | null;
  psp_reference?: string | null;
  initiated_at: string;
  succeeded_at?: string | null;
  failed_at?: string | null;
  canceled_at?: string | null;
  created_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
  allocations?: RentalPaymentAllocation[];
  /** Amounts allocated to deposit (e.g. collect) - used for "Alloué" = allocations + depositMovements */
  depositMovements?: { id: string; amount: number; type?: RentalDepositMovementType; created_at?: string }[];
}

export interface CreatePaymentRequest {
  leaseId?: string;
  renterClientId?: string;
  invoiceId?: string;
  method: RentalPaymentMethod;
  amount: number;
  currency?: string;
  mmOperator?: string;
  mmPhone?: string;
  pspName?: string;
  pspTransactionId?: string;
  pspReference?: string;
  idempotencyKey?: string;
}

export interface AllocatePaymentRequest {
  installmentIds: string[];
  amounts?: Record<string, number>;
}

export interface PaymentFilters {
  leaseId?: string;
  renterClientId?: string;
  status?: RentalPaymentStatus;
  method?: RentalPaymentMethod;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface PaymentListResponse {
  success: boolean;
  data: RentalPayment[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ==================== PAYMENT DECLARATIONS ====================

export interface RentalPaymentDeclaration {
  id: string;
  tenant_id: string;
  lease_id: string;
  installment_id?: string | null;
  declared_by: string;
  amount: number;
  payment_date: string;
  payment_method: RentalPaymentMethod;
  mobile_operator?: string | null;
  reference?: string | null;
  proof_file_url?: string | null;
  status: PaymentDeclarationStatus;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
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
    due_date: string;
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

export interface PaymentDeclarationFilters {
  status?: PaymentDeclarationStatus;
  leaseId?: string;
  declaredBy?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface PaymentDeclarationListResponse {
  success: boolean;
  data: RentalPaymentDeclaration[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface PaymentDeclarationResponse {
  success: boolean;
  data: RentalPaymentDeclaration;
}

export interface ApprovePaymentDeclarationRequest {
  reviewNotes?: string;
}

export interface RejectPaymentDeclarationRequest {
  reviewNotes: string;
}

export async function listPayments(
  tenantId: string,
  filters?: PaymentFilters
): Promise<PaymentListResponse> {
  const response = await apiClient.get(`/tenants/${tenantId}/rental/payments`, {
    params: filters,
  });
  return response.data;
}

export async function getPayment(
  tenantId: string,
  paymentId: string
): Promise<{ success: boolean; data: RentalPayment }> {
  const response = await apiClient.get(
    `/tenants/${tenantId}/rental/payments/${paymentId}`
  );
  return response.data;
}

export async function createPayment(
  tenantId: string,
  data: CreatePaymentRequest
): Promise<{ success: boolean; data: RentalPayment }> {
  const response = await apiClient.post(`/tenants/${tenantId}/rental/payments`, data);
  return response.data;
}

export async function allocatePayment(
  tenantId: string,
  paymentId: string,
  data: AllocatePaymentRequest
): Promise<{ success: boolean; data: any; message: string }> {
  const response = await apiClient.post(
    `/tenants/${tenantId}/rental/payments/${paymentId}/allocate`,
    data
  );
  return response.data;
}

export async function updatePaymentStatus(
  tenantId: string,
  paymentId: string,
  status: RentalPaymentStatus
): Promise<{ success: boolean; data: RentalPayment }> {
  const response = await apiClient.patch(
    `/tenants/${tenantId}/rental/payments/${paymentId}/status`,
    { status }
  );
  return response.data;
}

// ==================== PENALTIES ====================

export interface RentalPenalty {
  id: string;
  tenant_id: string;
  installment_id: string;
  rule_id?: string | null;
  amount: number;
  currency: string;
  days_late: number;
  calculated_at: string;
  adjusted_amount?: number | null;
  adjustment_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PenaltyFilters {
  leaseId?: string;
  installmentId?: string;
  page?: number;
  limit?: number;
}

export interface PenaltyListResponse {
  success: boolean;
  data: RentalPenalty[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function listPenalties(
  tenantId: string,
  filters?: PenaltyFilters
): Promise<PenaltyListResponse> {
  const response = await apiClient.get(`/tenants/${tenantId}/rental/penalties`, {
    params: filters,
  });
  return response.data;
}

export async function getPenalty(
  tenantId: string,
  penaltyId: string
): Promise<{ success: boolean; data: RentalPenalty }> {
  const response = await apiClient.get(
    `/tenants/${tenantId}/rental/penalties/${penaltyId}`
  );
  return response.data;
}

export async function calculatePenalties(
  tenantId: string,
  installmentId?: string
): Promise<{ success: boolean; data: RentalPenalty[]; message: string }> {
  const response = await apiClient.post(`/tenants/${tenantId}/rental/penalties/calculate`, {
    installmentId,
  });
  return response.data;
}

export async function updatePenalty(
  tenantId: string,
  penaltyId: string,
  adjustedAmount: number,
  adjustmentReason: string
): Promise<{ success: boolean; data: RentalPenalty }> {
  const response = await apiClient.patch(
    `/tenants/${tenantId}/rental/penalties/${penaltyId}`,
    { amount: adjustedAmount, reason: adjustmentReason }
  );
  return response.data;
}

export async function deletePenalty(
  tenantId: string,
  penaltyId: string
): Promise<{ success: boolean; message: string }> {
  const response = await apiClient.delete(
    `/tenants/${tenantId}/rental/penalties/${penaltyId}`
  );
  return response.data;
}

export async function uploadPenaltyJustification(
  tenantId: string,
  penaltyId: string,
  file: File
): Promise<{ success: boolean; data: any }> {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await apiClient.post(
    `/tenants/${tenantId}/rental/penalties/${penaltyId}/justification`,
    formData,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }
  );
  return response.data;
}

// ==================== SECURITY DEPOSITS ====================

export interface RentalSecurityDeposit {
  id: string;
  tenant_id: string;
  lease_id: string;
  target_amount: number;
  currency: string;
  current_balance: number;
  created_at: string;
  updated_at: string;
}

export interface RentalDepositMovement {
  id: string;
  tenant_id: string;
  deposit_id: string;
  type: string;
  amount: number;
  currency: string;
  payment_id?: string | null;
  installment_id?: string | null;
  note?: string | null;
  metadata?: any;
  created_by_user_id: string;
  created_at: string;
}

export interface CreateDepositMovementRequest {
  type: string;
  amount: number;
  paymentId?: string;
  installmentId?: string;
  note?: string;
  metadata?: any;
}

export async function getDeposit(
  tenantId: string,
  leaseId: string
): Promise<{ success: boolean; data: RentalSecurityDeposit }> {
  const response = await apiClient.get(
    `/tenants/${tenantId}/rental/leases/${leaseId}/deposit`
  );
  return response.data;
}

export async function createDeposit(
  tenantId: string,
  leaseId: string,
  targetAmount: number,
  currency: string
): Promise<{ success: boolean; data: RentalSecurityDeposit }> {
  const response = await apiClient.post(
    `/tenants/${tenantId}/rental/leases/${leaseId}/deposit`,
    { targetAmount, currency }
  );
  return response.data;
}

export async function createDepositMovement(
  tenantId: string,
  depositId: string,
  data: CreateDepositMovementRequest
): Promise<{ success: boolean; data: RentalDepositMovement }> {
  const response = await apiClient.post(
    `/tenants/${tenantId}/rental/deposits/${depositId}/movements`,
    data
  );
  return response.data;
}

export async function listDepositMovements(
  tenantId: string,
  depositId: string
): Promise<{ success: boolean; data: RentalDepositMovement[] }> {
  const response = await apiClient.get(
    `/tenants/${tenantId}/rental/deposits/${depositId}/movements`
  );
  return response.data;
}

// ==================== DOCUMENTS ====================

export interface RentalDocument {
  id: string;
  tenant_id: string;
  type: RentalDocumentType;
  status: RentalDocumentStatus;
  lease_id?: string | null;
  installment_id?: string | null;
  payment_id?: string | null;
  document_number: string;
  title?: string | null;
  description?: string | null;
  issued_at: string;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface GenerateDocumentRequest {
  type: RentalDocumentType;
  leaseId?: string;
  installmentId?: string;
  paymentId?: string;
  title?: string;
  description?: string;
  templateId?: string;
}

export interface DocumentFilters {
  type?: RentalDocumentType;
  status?: RentalDocumentStatus;
  leaseId?: string;
  installmentId?: string;
  paymentId?: string;
  page?: number;
  limit?: number;
}

export interface DocumentListResponse {
  success: boolean;
  data: RentalDocument[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function listDocuments(
  tenantId: string,
  filters?: DocumentFilters
): Promise<DocumentListResponse> {
  const response = await apiClient.get(`/tenants/${tenantId}/rental/documents`, {
    params: filters,
  });
  return response.data;
}

export async function getDocument(
  tenantId: string,
  documentId: string
): Promise<{ success: boolean; data: RentalDocument }> {
  const response = await apiClient.get(
    `/tenants/${tenantId}/rental/documents/${documentId}`
  );
  return response.data;
}

export async function generateDocument(
  tenantId: string,
  data: GenerateDocumentRequest
): Promise<{ success: boolean; data: RentalDocument; message: string }> {
  console.log('🔵 [rental-service] generateDocument called', {
    tenantId,
    data
  });

  // Map RentalDocumentType to DocumentType for new API
  const docTypeMap: Record<RentalDocumentType, string> = {
    LEASE_CONTRACT: 'LEASE_HABITATION', // Default to habitation, can be overridden
    LEASE_ADDENDUM: 'LEASE_HABITATION',
    RENT_RECEIPT: 'RENT_RECEIPT',
    RENT_QUITTANCE: 'RENT_RECEIPT',
    DEPOSIT_RECEIPT: 'RENT_RECEIPT',
    STATEMENT: 'RENT_STATEMENT',
    OTHER: 'RENT_RECEIPT'
  };

  const docType = docTypeMap[data.type] || 'RENT_RECEIPT';
  
  // Determine sourceKey based on document type
  const sourceKey = data.leaseId || data.paymentId || '';
  if (!sourceKey) {
    console.error('❌ [rental-service] generateDocument: Missing sourceKey', { data });
    throw new Error('leaseId or paymentId is required');
  }

  // Use new document generation API
  const requestBody: any = {
    docType,
    sourceKey,
    templateId: data.templateId,
    installmentId: data.installmentId
  };

  console.log('🔵 [rental-service] generateDocument: Sending request', {
    url: `/tenants/${tenantId}/documents/generate`,
    requestBody
  });

  try {
    const response = await apiClient.post(
      `/tenants/${tenantId}/documents/generate`,
      requestBody
    );
    
    console.log('✅ [rental-service] generateDocument: Success', {
      success: response.data.success,
      documentId: response.data.data?.id,
      documentNumber: response.data.data?.document_number
    });
    
    return response.data;
  } catch (error: any) {
    console.error('❌ [rental-service] generateDocument: Error', {
      error: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    throw error;
  }
}

export async function updateDocumentStatus(
  tenantId: string,
  documentId: string,
  status: RentalDocumentStatus
): Promise<{ success: boolean; data: RentalDocument }> {
  const response = await apiClient.patch(
    `/tenants/${tenantId}/rental/documents/${documentId}`,
    { status }
  );
  return response.data;
}

export async function regenerateDocument(
  tenantId: string,
  documentId: string,
  templateId?: string
): Promise<{ success: boolean; data: RentalDocument; message: string }> {
  const response = await apiClient.post(
    `/tenants/${tenantId}/documents/${documentId}/regenerate`,
    { templateId }
  );
  return response.data;
}

// ==================== PAYMENT DECLARATIONS ====================

export async function listPaymentDeclarations(
  tenantId: string,
  filters?: PaymentDeclarationFilters
): Promise<PaymentDeclarationListResponse> {
  const response = await apiClient.get(`/tenants/${tenantId}/rental/payment-declarations`, {
    params: filters,
  });
  return response.data;
}

export async function getPaymentDeclaration(
  tenantId: string,
  declarationId: string
): Promise<PaymentDeclarationResponse> {
  const response = await apiClient.get(
    `/tenants/${tenantId}/rental/payment-declarations/${declarationId}`
  );
  return response.data;
}

export async function approvePaymentDeclaration(
  tenantId: string,
  declarationId: string,
  data: ApprovePaymentDeclarationRequest
): Promise<PaymentDeclarationResponse> {
  const response = await apiClient.post(
    `/tenants/${tenantId}/rental/payment-declarations/${declarationId}/approve`,
    data
  );
  return response.data;
}

export async function rejectPaymentDeclaration(
  tenantId: string,
  declarationId: string,
  data: RejectPaymentDeclarationRequest
): Promise<PaymentDeclarationResponse> {
  const response = await apiClient.post(
    `/tenants/${tenantId}/rental/payment-declarations/${declarationId}/reject`,
    data
  );
  return response.data;
}
