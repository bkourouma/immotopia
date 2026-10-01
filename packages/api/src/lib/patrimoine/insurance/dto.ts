import { allowedNextStatuses, type ClaimStatus } from './claim-status';
import { outOfPocketForStatus } from './claim-amounts';
import { daysToExpiry, derivePolicyStatus, type PolicyStatus } from './policy-status';

/**
 * Formes de réponse HTTP du lot assurances (contrat 032, section 2).
 * `Decimal` -> `number`, dates en ISO 8601, aucun chemin disque.
 */

type DecimalLike = { toNumber(): number } | number | string;

export function toNumber(value: DecimalLike): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return value.toNumber();
}

const toNumberOrNull = (value: DecimalLike | null | undefined): number | null =>
  value === null || value === undefined ? null : toNumber(value);
const iso = (date: Date): string => date.toISOString();
const isoOrNull = (date: Date | null | undefined): string | null => (date ? date.toISOString() : null);

export interface InsurancePolicyDto {
  id: string;
  propertyId: string;
  propertyReference: string | null;
  insurer: string;
  policyNumber: string;
  coverageType: string;
  startDate: string;
  endDate: string;
  annualPremium: number | null;
  currency: string;
  notes: string | null;
  documentId: string | null;
  status: PolicyStatus;
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
  policyLabel: string;
  ticketId: string | null;
  ticketTitle: string | null;
  expenseId: string | null;
  occurredAt: string;
  declaredAt: string;
  cause: string;
  description: string;
  status: ClaimStatus;
  claimedAmount: number;
  indemnifiedAmount: number | null;
  deductible: number | null;
  outOfPocketAmount: number | null;
  currency: string;
  rejectionReason: string | null;
  insurerNotifiedAt: string | null;
  expertiseAt: string | null;
  settledAt: string | null;
  rejectedAt: string | null;
  closedAt: string | null;
  allowedNextStatuses: ClaimStatus[];
  documentsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClaimDocumentDto {
  id: string;
  documentId: string;
  kind: string;
  fileName: string;
  mimeType: string | null;
  createdAt: string;
}

export interface ClaimHistoryDto {
  id: string;
  fromStatus: ClaimStatus | null;
  toStatus: ClaimStatus;
  note: string | null;
  changedAt: string;
  changedByName: string | null;
}

export interface InsuranceClaimDetailDto extends InsuranceClaimDto {
  documents: ClaimDocumentDto[];
  history: ClaimHistoryDto[];
}

/** Forme minimale lue en base pour une police (avec `include` du bien et du compte de sinistres). */
export interface PolicyRow {
  id: string;
  propertyId: string;
  insurer: string;
  policyNumber: string;
  coverageType: string;
  startDate: Date;
  endDate: Date;
  annualPremium: DecimalLike | null;
  currency: string;
  notes: string | null;
  documentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  property?: { internalReference: string } | null;
  _count?: { claims: number };
}

export function toPolicyDto(row: PolicyRow, now: Date): InsurancePolicyDto {
  return {
    id: row.id,
    propertyId: row.propertyId,
    propertyReference: row.property?.internalReference ?? null,
    insurer: row.insurer,
    policyNumber: row.policyNumber,
    coverageType: row.coverageType,
    startDate: iso(row.startDate),
    endDate: iso(row.endDate),
    annualPremium: toNumberOrNull(row.annualPremium),
    currency: row.currency,
    notes: row.notes,
    documentId: row.documentId,
    status: derivePolicyStatus(row, now),
    daysToExpiry: daysToExpiry(row, now),
    claimsCount: row._count?.claims ?? 0,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt)
  };
}

export interface ClaimRow {
  id: string;
  propertyId: string;
  policyId: string;
  ticketId: string | null;
  expenseId: string | null;
  occurredAt: Date;
  declaredAt: Date;
  cause: string;
  description: string;
  status: ClaimStatus;
  claimedAmount: DecimalLike;
  indemnifiedAmount: DecimalLike | null;
  deductible: DecimalLike | null;
  currency: string;
  rejectionReason: string | null;
  insurerNotifiedAt: Date | null;
  expertiseAt: Date | null;
  settledAt: Date | null;
  rejectedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  property?: { internalReference: string } | null;
  policy?: { insurer: string; policyNumber: string } | null;
  ticket?: { title: string } | null;
  _count?: { documents: number };
}

export function toClaimDto(row: ClaimRow): InsuranceClaimDto {
  const claimed = toNumber(row.claimedAmount);
  const indemnified = toNumberOrNull(row.indemnifiedAmount);
  return {
    id: row.id,
    propertyId: row.propertyId,
    propertyReference: row.property?.internalReference ?? null,
    policyId: row.policyId,
    policyLabel: row.policy ? `${row.policy.insurer} · n° ${row.policy.policyNumber}` : '',
    ticketId: row.ticketId,
    ticketTitle: row.ticket?.title ?? null,
    expenseId: row.expenseId,
    occurredAt: iso(row.occurredAt),
    declaredAt: iso(row.declaredAt),
    cause: row.cause,
    description: row.description,
    status: row.status,
    claimedAmount: claimed,
    indemnifiedAmount: indemnified,
    deductible: toNumberOrNull(row.deductible),
    outOfPocketAmount: outOfPocketForStatus(row.status, claimed, indemnified),
    currency: row.currency,
    rejectionReason: row.rejectionReason,
    insurerNotifiedAt: isoOrNull(row.insurerNotifiedAt),
    expertiseAt: isoOrNull(row.expertiseAt),
    settledAt: isoOrNull(row.settledAt),
    rejectedAt: isoOrNull(row.rejectedAt),
    closedAt: isoOrNull(row.closedAt),
    allowedNextStatuses: allowedNextStatuses(row.status),
    documentsCount: row._count?.documents ?? 0,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt)
  };
}

export interface ClaimDocumentRow {
  id: string;
  documentId: string;
  kind: string;
  createdAt: Date;
  document: { fileName: string; mimeType: string | null };
}

export function toClaimDocumentDto(row: ClaimDocumentRow): ClaimDocumentDto {
  return {
    id: row.id,
    documentId: row.documentId,
    kind: row.kind,
    fileName: row.document.fileName,
    mimeType: row.document.mimeType,
    createdAt: iso(row.createdAt)
  };
}

export interface ClaimHistoryRow {
  id: string;
  fromStatus: ClaimStatus | null;
  toStatus: ClaimStatus;
  note: string | null;
  changedAt: Date;
  changedByUserId: string | null;
}

export function toHistoryDto(row: ClaimHistoryRow, userNames: Map<string, string | null>): ClaimHistoryDto {
  return {
    id: row.id,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    note: row.note,
    changedAt: iso(row.changedAt),
    changedByName: row.changedByUserId ? (userNames.get(row.changedByUserId) ?? null) : null
  };
}
