/**
 * Types du module assurances, sinistres et carnet d'entretien (spec 032).
 * Reflet exact des DTO de l'API (`/tenants/:tenantId/patrimoine/insurance/*`
 * et `/maintenance-log`). Montants en `number`, dates en ISO 8601. Les
 * libellés, couleurs et formateurs vivent dans `components/insurance/insurance-labels.ts`.
 */

export type InsuranceCoverageType = 'MULTIRISK_HOME' | 'MULTIRISK_BUILDING' | 'OWNER_LIABILITY' | 'OTHER';
export type InsurancePolicyStatus = 'UPCOMING' | 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED';
export type InsuranceClaimCause = 'WATER_DAMAGE' | 'FIRE' | 'THEFT' | 'STRUCTURAL' | 'STORM' | 'OTHER';
export type InsuranceClaimStatus = 'DECLARED' | 'INSURER_NOTIFIED' | 'EXPERTISE' | 'SETTLED' | 'REJECTED' | 'CLOSED';
export type InsuranceClaimDocumentKind =
  'PHOTO_BEFORE' | 'PHOTO_AFTER' | 'QUOTE' | 'EXPERT_REPORT' | 'INSURER_LETTER' | 'INVOICE';
export type MaintenanceLogCategory =
  'PLUMBING' | 'ELECTRICAL' | 'AIR_CONDITIONING' | 'GENERATOR' | 'ROOF_WATERPROOFING' | 'PAINTING' | 'OTHER';

export interface InsurancePolicyDto {
  id: string;
  propertyId: string;
  propertyReference: string | null;
  insurer: string;
  policyNumber: string;
  coverageType: InsuranceCoverageType;
  startDate: string;
  endDate: string;
  annualPremium: number | null;
  currency: string;
  notes: string | null;
  documentId: string | null;
  status: InsurancePolicyStatus;
  daysToExpiry: number;
  claimsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface InsuranceClaimDto {
  id: string;
  propertyId: string;
  propertyReference: string | null;
  policyId: string;
  /** « Assureur · n° police ». */
  policyLabel: string;
  ticketId: string | null;
  ticketTitle: string | null;
  expenseId: string | null;
  occurredAt: string;
  declaredAt: string;
  cause: InsuranceClaimCause;
  description: string;
  status: InsuranceClaimStatus;
  claimedAmount: number;
  indemnifiedAmount: number | null;
  deductible: number | null;
  /** Calculé par l'API ; `null` tant que le sinistre n'est ni réglé, ni rejeté, ni clos. */
  outOfPocketAmount: number | null;
  currency: string;
  rejectionReason: string | null;
  insurerNotifiedAt: string | null;
  expertiseAt: string | null;
  settledAt: string | null;
  rejectedAt: string | null;
  closedAt: string | null;
  allowedNextStatuses: InsuranceClaimStatus[];
  documentsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface InsuranceClaimDocumentLinkDto {
  /** Identifiant de la liaison (`linkId`). */
  id: string;
  documentId: string;
  kind: InsuranceClaimDocumentKind;
  fileName: string;
  mimeType: string | null;
  createdAt: string;
}

export interface InsuranceClaimHistoryDto {
  id: string;
  fromStatus: InsuranceClaimStatus | null;
  toStatus: InsuranceClaimStatus;
  note: string | null;
  changedAt: string;
  changedByName: string | null;
}

export interface InsuranceClaimDetailDto extends InsuranceClaimDto {
  documents: InsuranceClaimDocumentLinkDto[];
  history: InsuranceClaimHistoryDto[];
}

export interface MaintenanceLogEntryDto {
  id: string;
  propertyId: string;
  category: MaintenanceLogCategory;
  performedAt: string;
  vendorId: string | null;
  vendorName: string | null;
  cost: number | null;
  currency: string;
  description: string;
  nextDueDate: string | null;
  warrantyEndDate: string | null;
  documentId: string | null;
  createdAt: string;
  updatedAt: string;
}

// --- Entrées -----------------------------------------------------------------

export interface InsurancePolicyInput {
  propertyId: string;
  insurer: string;
  policyNumber: string;
  coverageType: InsuranceCoverageType;
  startDate: string;
  endDate: string;
  annualPremium?: number | null;
  currency?: string;
  notes?: string | null;
  documentId?: string | null;
}

/** Tous les champs facultatifs, sauf `propertyId` (non modifiable). `documentId: null` délie. */
export type InsurancePolicyUpdate = Partial<Omit<InsurancePolicyInput, 'propertyId'>>;

export interface InsuranceClaimInput {
  propertyId: string;
  policyId: string;
  ticketId?: string | null;
  expenseId?: string | null;
  occurredAt: string;
  cause: InsuranceClaimCause;
  description: string;
  claimedAmount: number;
  deductible?: number | null;
}

/** `indemnifiedAmount` et `outOfPocketAmount` ne se modifient jamais par PATCH. */
export type InsuranceClaimUpdate = Partial<Omit<InsuranceClaimInput, 'propertyId' | 'policyId'>>;

export interface InsuranceClaimStatusInput {
  toStatus: InsuranceClaimStatus;
  note?: string;
  /** Obligatoire pour SETTLED (>= 0, <= montant réclamé). */
  indemnifiedAmount?: number;
  deductible?: number | null;
  /** Obligatoire pour REJECTED. */
  rejectionReason?: string;
}

export interface AttachClaimDocumentInput {
  documentId: string;
  kind: InsuranceClaimDocumentKind;
}

export interface MaintenanceLogEntryInput {
  propertyId: string;
  category: MaintenanceLogCategory;
  performedAt: string;
  description: string;
  vendorId?: string | null;
  cost?: number | null;
  currency?: string;
  nextDueDate?: string | null;
  warrantyEndDate?: string | null;
  documentId?: string | null;
}

export type MaintenanceLogEntryUpdate = Partial<Omit<MaintenanceLogEntryInput, 'propertyId'>>;
