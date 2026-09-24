/**
 * Contrat des réponses de l'API des ventes (lot 9).
 *
 * Ce fichier fait foi : le frontend recopie ces formes dans
 * `apps/web/src/services/sales-service.ts`. Montants en `number` (FCFA),
 * dates en chaîne ISO. Voir `docs/ventes/PRD-lot-9-ventes.md`.
 */

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
  /** MV-AAAA-NNNN */
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
  /** Calculé : ACTIVE et endDate passée. */
  isExpired: boolean;
  revokedAt: string | null;
  revokeReason: string | null;
  notes: string | null;
  /** Offres SUBMITTED ou COUNTERED non expirées. */
  openOffersCount: number;
  offersCount: number;
  /** Compromis vivant (DRAFT, SIGNED ou COMPLETED), s'il existe. */
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
  /** OA-AAAA-NNNN */
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
  /** Prix convenu si l'offre est acceptée : counterAmount ?? amount. */
  agreedPrice: number | null;
  decidedAt: string | null;
  decidedByName: string | null;
  decisionReason: string | null;
  /** Compromis issu de cette offre, s'il existe (y compris annulé). */
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
  /** CV-AAAA-NNNN */
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
  /** RC-AAAA-NNNN */
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
  /** HT-AAAA-NNNN */
  number: string;
  agreementId: string;
  agreementNumber: string;
  mandateId: string;
  propertyLabel: string;
  payer: SaleCommissionPayer;
  /** Vendeur ou acquéreur selon `payer`. */
  payerName: string;
  baseAmount: number;
  amountExclTax: number;
  vatRate: number;
  vatAmount: number;
  amountInclTax: number;
  /** Somme des règlements POSTED. */
  paidAmount: number;
  remainingAmount: number;
  status: SaleCommissionStatus;
  agentUserId: string | null;
  agentName: string | null;
  agentSharePercent: number | null;
  /** Part du négociateur sur le HT encaissé : paidAmount × HT/TTC × part / 100, arrondi. */
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
  /** Tous les compromis du mandat, le plus récent d'abord (un annulé peut précéder un vivant). */
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
  /** Actes signés dans le mois civil courant. */
  salesThisMonth: number;
  salesThisMonthValue: number;
  commissionsDue: number;
  commissionsCollectedThisMonth: number;
}

// ---------------------------------------------------------------------------
// Corps des requêtes (validés côté API par zod ; dates en AAAA-MM-JJ ou ISO)
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

/** Tous les champs de création sauf propertyId et sellerClientId, tous optionnels. */
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
  /** Requis pour COUNTER. */
  counterAmount?: number | null;
  /** Requis pour REJECT et WITHDRAW. */
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
