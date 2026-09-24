import apiClient from '../utils/api-client';

/**
 * Frontière réseau du lot 9 — gestion des ventes immobilières.
 *
 * Types recopiés tels quels depuis `packages/api/src/lib/sales/types.ts`, qui
 * fait foi (voir `docs/ventes/PRD-lot-9-ventes.md`). Une fonction par route du
 * PRD §4, préfixe `/tenants/:tenantId/sales`. Construit sur le modèle de
 * `services/cash-sessions-service.ts` et `services/owner-accounts-service.ts` :
 * enveloppe `{ success, data }`, une fonction = une route, aucune logique
 * métier ici.
 *
 * L'API de ce lot est écrite en parallèle par un autre agent : ce fichier est
 * codé contre le contrat de `types.ts`, sans attendre qu'elle existe. Les
 * tests (`__tests__/sales/`) mockent ce module.
 */

type ApiResponse<T> = { success: boolean; data: T };

// ---------------------------------------------------------------------------
// Types — recopiés de packages/api/src/lib/sales/types.ts
// ---------------------------------------------------------------------------

export type SaleMandateType = 'SIMPLE' | 'EXCLUSIVE';
export type SaleMandateStatus = 'ACTIVE' | 'REVOKED' | 'COMPLETED';
export type SaleCommissionMode = 'PERCENT' | 'FIXED';
export type SaleCommissionPayer = 'SELLER' | 'BUYER';
export type SaleFinancing = 'CASH' | 'LOAN' | 'MIXED';
export type SaleOfferStatus = 'SUBMITTED' | 'COUNTERED' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';
export type SaleOfferAction = 'COUNTER' | 'ACCEPT' | 'REJECT' | 'WITHDRAW';
export type SaleDepositHolder = 'NOTARY' | 'SELLER';
export type SaleAgreementStatus = 'DRAFT' | 'SIGNED' | 'COMPLETED' | 'CANCELLED';
export type SaleConditionStatus = 'PENDING' | 'MET' | 'FAILED' | 'WAIVED';
export type SaleCommissionStatus = 'DUE' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';
export type SaleCommissionPaymentStatus = 'POSTED' | 'VOIDED';

export interface SaleMandateDto {
  id: string;
  number: string;
  propertyId: string;
  propertyLabel: string;
  propertyStatus: string;
  sellerClientId: string;
  sellerName: string;
  mandateType: SaleMandateType;
  askingPrice: number;
  minimumPrice: number | null;
  commissionMode: SaleCommissionMode;
  commissionRate: number | null;
  commissionFixedAmount: number | null;
  commissionPayer: SaleCommissionPayer;
  agentUserId: string | null;
  agentName: string | null;
  agentSharePercent: number | null;
  startDate: string;
  endDate: string | null;
  status: SaleMandateStatus;
  isExpired: boolean;
  revokedAt: string | null;
  revokeReason: string | null;
  notes: string | null;
  openOffersCount: number;
  offersCount: number;
  agreementId: string | null;
  agreementStatus: SaleAgreementStatus | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaleCoSellerDto {
  clientId: string;
  name: string;
  sharePercent: number;
}

export interface SaleOfferDto {
  id: string;
  number: string;
  mandateId: string;
  buyerContactId: string;
  buyerName: string;
  dealId: string | null;
  amount: number;
  financing: SaleFinancing;
  conditions: string | null;
  validUntil: string | null;
  isExpired: boolean;
  status: SaleOfferStatus;
  counterAmount: number | null;
  agreedPrice: number | null;
  decidedAt: string | null;
  decidedByName: string | null;
  decisionReason: string | null;
  agreementId: string | null;
  createdAt: string;
}

export interface SaleConditionDto {
  id: string;
  label: string;
  dueDate: string | null;
  status: SaleConditionStatus;
  resolvedAt: string | null;
}

export interface SaleMilestoneDto {
  id: string;
  label: string;
  dueDate: string | null;
  amount: number;
  paidAt: string | null;
  sortOrder: number;
}

export interface SaleAgreementDto {
  id: string;
  number: string;
  offerId: string;
  mandateId: string;
  mandateNumber: string;
  propertyId: string;
  propertyLabel: string;
  sellerName: string;
  buyerContactId: string;
  buyerName: string;
  price: number;
  depositAmount: number | null;
  depositHolder: SaleDepositHolder | null;
  notaryName: string | null;
  signedAt: string | null;
  expectedDeedDate: string | null;
  deedDate: string | null;
  status: SaleAgreementStatus;
  cancelledAt: string | null;
  cancelReason: string | null;
  pendingConditionsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SaleCommissionPaymentDto {
  id: string;
  number: string;
  amount: number;
  paidAt: string;
  paymentMethod: string;
  treasuryAccountId: string;
  treasuryAccountLabel: string;
  reference: string | null;
  status: SaleCommissionPaymentStatus;
  voidReason: string | null;
  voidedAt: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface SaleCommissionDto {
  id: string;
  number: string;
  agreementId: string;
  agreementNumber: string;
  mandateId: string;
  propertyLabel: string;
  payer: SaleCommissionPayer;
  payerName: string;
  baseAmount: number;
  amountExclTax: number;
  vatRate: number;
  vatAmount: number;
  amountInclTax: number;
  paidAmount: number;
  remainingAmount: number;
  status: SaleCommissionStatus;
  agentUserId: string | null;
  agentName: string | null;
  agentSharePercent: number | null;
  agentShareEarned: number;
  issuedAt: string;
}

export interface SaleCommissionDetailDto extends SaleCommissionDto {
  payments: SaleCommissionPaymentDto[];
}

export interface SaleAgreementDetailDto extends SaleAgreementDto {
  conditions: SaleConditionDto[];
  milestones: SaleMilestoneDto[];
  commission: SaleCommissionDto | null;
}

export interface SaleMandateDetailDto extends SaleMandateDto {
  coSellers: SaleCoSellerDto[];
  offers: SaleOfferDto[];
  agreements: SaleAgreementDto[];
  commission: SaleCommissionDto | null;
}

export interface SaleCommissionListDto {
  items: SaleCommissionDto[];
  totals: { amountInclTax: number; paidAmount: number; remainingAmount: number };
}

export interface SalesPipelineDto {
  activeMandates: number;
  activeMandatesValue: number;
  expiredMandates: number;
  openOffers: number;
  signedAgreements: number;
  signedAgreementsValue: number;
  salesThisMonth: number;
  salesThisMonthValue: number;
  commissionsDue: number;
  commissionsCollectedThisMonth: number;
}

// ---------------------------------------------------------------------------
// Corps des requêtes
// ---------------------------------------------------------------------------

export interface CreateSaleMandateInput {
  propertyId: string;
  sellerClientId: string;
  mandateType: SaleMandateType;
  askingPrice: number;
  minimumPrice?: number | null;
  commissionMode: SaleCommissionMode;
  commissionRate?: number | null;
  commissionFixedAmount?: number | null;
  commissionPayer: SaleCommissionPayer;
  agentUserId?: string | null;
  agentSharePercent?: number | null;
  startDate: string;
  endDate?: string | null;
  notes?: string | null;
}

export type UpdateSaleMandateInput = Partial<Omit<CreateSaleMandateInput, 'propertyId' | 'sellerClientId'>>;

export interface CreateSaleOfferInput {
  buyerContactId: string;
  dealId?: string | null;
  amount: number;
  financing: SaleFinancing;
  conditions?: string | null;
  validUntil?: string | null;
}

export interface SaleOfferDecisionInput {
  action: SaleOfferAction;
  counterAmount?: number | null;
  reason?: string | null;
}

export interface CreateSaleAgreementInput {
  price?: number | null;
  depositAmount?: number | null;
  depositHolder?: SaleDepositHolder | null;
  notaryName?: string | null;
  expectedDeedDate?: string | null;
}

export type UpdateSaleAgreementInput = CreateSaleAgreementInput;

export interface SaleConditionInput {
  label: string;
  dueDate?: string | null;
  status?: SaleConditionStatus;
}

export interface SaleMilestoneInput {
  label: string;
  dueDate?: string | null;
  amount: number;
  paidAt?: string | null;
}

export interface CreateSaleCommissionPaymentInput {
  amount: number;
  paidAt: string;
  paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'MOBILE_MONEY' | 'CHECK' | 'CARD' | 'OTHER';
  treasuryAccountId: string;
  reference?: string | null;
}

// ---------------------------------------------------------------------------
// Filtres de liste
// ---------------------------------------------------------------------------

export interface ListSaleMandatesFilters {
  status?: SaleMandateStatus;
  propertyId?: string;
  search?: string;
}

export interface ListSaleAgreementsFilters {
  status?: SaleAgreementStatus;
}

export interface ListSaleCommissionsFilters {
  status?: SaleCommissionStatus;
}

function base(tenantId: string): string {
  return `/tenants/${tenantId}/sales`;
}

// ---------------------------------------------------------------------------
// Mandats
// ---------------------------------------------------------------------------

export async function listSaleMandates(
  tenantId: string,
  filters: ListSaleMandatesFilters = {}
): Promise<SaleMandateDto[]> {
  const response = await apiClient.get<ApiResponse<SaleMandateDto[]>>(`${base(tenantId)}/mandates`, {
    params: {
      status: filters.status || undefined,
      propertyId: filters.propertyId || undefined,
      search: filters.search || undefined
    }
  });
  return response.data.data;
}

export async function createSaleMandate(tenantId: string, input: CreateSaleMandateInput): Promise<SaleMandateDto> {
  const response = await apiClient.post<ApiResponse<SaleMandateDto>>(`${base(tenantId)}/mandates`, input);
  return response.data.data;
}

export async function getSaleMandate(tenantId: string, id: string): Promise<SaleMandateDetailDto> {
  const response = await apiClient.get<ApiResponse<SaleMandateDetailDto>>(`${base(tenantId)}/mandates/${id}`);
  return response.data.data;
}

export async function updateSaleMandate(
  tenantId: string,
  id: string,
  input: UpdateSaleMandateInput
): Promise<SaleMandateDto> {
  const response = await apiClient.patch<ApiResponse<SaleMandateDto>>(`${base(tenantId)}/mandates/${id}`, input);
  return response.data.data;
}

export async function revokeSaleMandate(tenantId: string, id: string, reason: string): Promise<SaleMandateDto> {
  const response = await apiClient.post<ApiResponse<SaleMandateDto>>(`${base(tenantId)}/mandates/${id}/revoke`, {
    reason
  });
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Offres
// ---------------------------------------------------------------------------

export async function createSaleOffer(
  tenantId: string,
  mandateId: string,
  input: CreateSaleOfferInput
): Promise<SaleOfferDto> {
  const response = await apiClient.post<ApiResponse<SaleOfferDto>>(
    `${base(tenantId)}/mandates/${mandateId}/offers`,
    input
  );
  return response.data.data;
}

export async function decideSaleOffer(
  tenantId: string,
  offerId: string,
  input: SaleOfferDecisionInput
): Promise<SaleOfferDto> {
  const response = await apiClient.post<ApiResponse<SaleOfferDto>>(
    `${base(tenantId)}/offers/${offerId}/decision`,
    input
  );
  return response.data.data;
}

export async function createSaleAgreementFromOffer(
  tenantId: string,
  offerId: string,
  input: CreateSaleAgreementInput = {}
): Promise<SaleAgreementDto> {
  const response = await apiClient.post<ApiResponse<SaleAgreementDto>>(
    `${base(tenantId)}/offers/${offerId}/agreement`,
    input
  );
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Compromis
// ---------------------------------------------------------------------------

export async function listSaleAgreements(
  tenantId: string,
  filters: ListSaleAgreementsFilters = {}
): Promise<SaleAgreementDto[]> {
  const response = await apiClient.get<ApiResponse<SaleAgreementDto[]>>(`${base(tenantId)}/agreements`, {
    params: { status: filters.status || undefined }
  });
  return response.data.data;
}

export async function getSaleAgreement(tenantId: string, id: string): Promise<SaleAgreementDetailDto> {
  const response = await apiClient.get<ApiResponse<SaleAgreementDetailDto>>(`${base(tenantId)}/agreements/${id}`);
  return response.data.data;
}

export async function updateSaleAgreement(
  tenantId: string,
  id: string,
  input: UpdateSaleAgreementInput
): Promise<SaleAgreementDto> {
  const response = await apiClient.patch<ApiResponse<SaleAgreementDto>>(`${base(tenantId)}/agreements/${id}`, input);
  return response.data.data;
}

export async function signSaleAgreement(tenantId: string, id: string, signedAt: string): Promise<SaleAgreementDto> {
  const response = await apiClient.post<ApiResponse<SaleAgreementDto>>(`${base(tenantId)}/agreements/${id}/sign`, {
    signedAt
  });
  return response.data.data;
}

export async function completeSaleAgreement(tenantId: string, id: string, deedDate: string): Promise<SaleAgreementDto> {
  const response = await apiClient.post<ApiResponse<SaleAgreementDto>>(`${base(tenantId)}/agreements/${id}/complete`, {
    deedDate
  });
  return response.data.data;
}

export async function cancelSaleAgreement(tenantId: string, id: string, reason: string): Promise<SaleAgreementDto> {
  const response = await apiClient.post<ApiResponse<SaleAgreementDto>>(`${base(tenantId)}/agreements/${id}/cancel`, {
    reason
  });
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Conditions suspensives
// ---------------------------------------------------------------------------

export async function addSaleCondition(
  tenantId: string,
  agreementId: string,
  input: SaleConditionInput
): Promise<SaleConditionDto> {
  const response = await apiClient.post<ApiResponse<SaleConditionDto>>(
    `${base(tenantId)}/agreements/${agreementId}/conditions`,
    input
  );
  return response.data.data;
}

export async function updateSaleCondition(
  tenantId: string,
  conditionId: string,
  input: Partial<SaleConditionInput>
): Promise<SaleConditionDto> {
  const response = await apiClient.patch<ApiResponse<SaleConditionDto>>(
    `${base(tenantId)}/conditions/${conditionId}`,
    input
  );
  return response.data.data;
}

export async function deleteSaleCondition(tenantId: string, conditionId: string): Promise<void> {
  await apiClient.delete(`${base(tenantId)}/conditions/${conditionId}`);
}

// ---------------------------------------------------------------------------
// Échéancier de l'acquéreur
// ---------------------------------------------------------------------------

export async function replaceSaleMilestones(
  tenantId: string,
  agreementId: string,
  milestones: SaleMilestoneInput[]
): Promise<SaleMilestoneDto[]> {
  const response = await apiClient.put<ApiResponse<SaleMilestoneDto[]>>(
    `${base(tenantId)}/agreements/${agreementId}/milestones`,
    milestones
  );
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Commissions
// ---------------------------------------------------------------------------

export async function listSaleCommissions(
  tenantId: string,
  filters: ListSaleCommissionsFilters = {}
): Promise<SaleCommissionListDto> {
  const response = await apiClient.get<ApiResponse<SaleCommissionListDto>>(`${base(tenantId)}/commissions`, {
    params: { status: filters.status || undefined }
  });
  return response.data.data;
}

export async function getSaleCommission(tenantId: string, id: string): Promise<SaleCommissionDetailDto> {
  const response = await apiClient.get<ApiResponse<SaleCommissionDetailDto>>(`${base(tenantId)}/commissions/${id}`);
  return response.data.data;
}

export async function createSaleCommissionPayment(
  tenantId: string,
  commissionId: string,
  input: CreateSaleCommissionPaymentInput
): Promise<SaleCommissionPaymentDto> {
  const response = await apiClient.post<ApiResponse<SaleCommissionPaymentDto>>(
    `${base(tenantId)}/commissions/${commissionId}/payments`,
    input
  );
  return response.data.data;
}

export async function voidSaleCommissionPayment(
  tenantId: string,
  paymentId: string,
  reason: string
): Promise<SaleCommissionPaymentDto> {
  const response = await apiClient.post<ApiResponse<SaleCommissionPaymentDto>>(
    `${base(tenantId)}/commission-payments/${paymentId}/void`,
    { reason }
  );
  return response.data.data;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export async function getSalesPipeline(tenantId: string): Promise<SalesPipelineDto> {
  const response = await apiClient.get<ApiResponse<SalesPipelineDto>>(`${base(tenantId)}/pipeline`);
  return response.data.data;
}
