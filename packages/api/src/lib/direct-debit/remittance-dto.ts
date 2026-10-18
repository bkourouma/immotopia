import type { Prisma } from '@prisma/client';
import { toIsoDate } from './business-days';
import { resolveDebtorNames, type DbClient, type MandateStatus } from './dto';
import { maskIban } from './iban';

/**
 * Objets renvoyés par l'API des remises (data-model §7.7).
 *
 * Règle absolue : aucun de ces objets ne contient l'IBAN complet, le texte
 * chiffré ni l'adresse e-mail du débiteur. Les select ci-dessous n'ont donc
 * JAMAIS ibanEncrypted ni email.
 */

export type RemittanceStatus = 'DRAFT' | 'VALIDATED' | 'EXPORTED' | 'SUBMITTED' | 'CANCELED';
export type RemittanceLineStatus = 'PENDING' | 'CANCELED';
export type PrenotificationStatus = 'PENDING' | 'SENT' | 'NO_EMAIL' | 'DISABLED' | 'FAILED';

export interface PrenotificationSummaryDto {
  pending: number;
  sent: number;
  noEmail: number;
  disabled: number;
  failed: number;
}

export interface RemittanceSummaryDto {
  id: string;
  reference: string;
  status: RemittanceStatus;
  creditor: { id: string; label: string; creditorIdentifier: string | null };
  collectionDate: string;
  periodYear: number;
  periodMonth: number;
  prenotificationDeadline: string;
  fileFormat: 'GENERIC_CSV';
  lineCount: number;
  totalAmount: number;
  validatedAt: string | null;
  firstExportedAt: string | null;
  lastExportedAt: string | null;
  exportCount: number;
  submittedAt: string | null;
  canceledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RemittanceLineDto {
  id: string;
  lineNumber: number;
  reference: string;
  status: RemittanceLineStatus;
  mandate: {
    id: string;
    reference: string;
    status: MandateStatus;
    ibanMasked: string;
    holderName: string;
    maxAmount: number | null;
  };
  debtor: { id: string; displayName: string | null };
  lease: { id: string; leaseNumber: string };
  installment: { id: string; periodYear: number; periodMonth: number; dueDate: string };
  amount: number;
  remainingDueAtSelection: number;
  capped: boolean;
  prenotificationStatus: PrenotificationStatus;
  prenotifiedAt: string | null;
  canceledAt: string | null;
  cancellationReason: string | null;
}

export interface RemittanceDto extends RemittanceSummaryDto {
  notes: string | null;
  lines: RemittanceLineDto[];
  prenotificationSummary: PrenotificationSummaryDto;
}

export type SkipReasonDto =
  'NO_INSTALLMENT' | 'NOTHING_DUE' | 'ALREADY_IN_REMITTANCE' | 'LEASE_NOT_ACTIVE' | 'COLLECTION_DAY_LATER';

export interface SkippedMandateDto {
  mandateId: string;
  mandateReference: string;
  leaseNumber: string | null;
  debtorName: string | null;
  reason: SkipReasonDto;
}

const num = (value: Prisma.Decimal | number | null | undefined): number | null =>
  value === null || value === undefined ? null : Number(value);
const iso = (value: Date | null | undefined): string | null => (value ? value.toISOString() : null);

export const remittanceReferenceOf = (year: number, sequence: number) =>
  `PRL-${year}-${String(sequence).padStart(4, '0')}`;
export const lineReferenceOf = (year: number, sequence: number, lineNumber: number) =>
  `${remittanceReferenceOf(year, sequence)}-${String(lineNumber).padStart(3, '0')}`;
export const mandateReferenceOf = (year: number, sequence: number) =>
  `MDT-${year}-${String(sequence).padStart(4, '0')}`;

export const REMITTANCE_SUMMARY_SELECT = {
  id: true,
  year: true,
  sequence: true,
  status: true,
  collectionDate: true,
  periodYear: true,
  periodMonth: true,
  prenotificationDeadline: true,
  lineCount: true,
  totalAmount: true,
  fileFormat: true,
  creditorLabelSnapshot: true,
  creditorIdentifierSnapshot: true,
  validatedAt: true,
  firstExportedAt: true,
  lastExportedAt: true,
  exportCount: true,
  submittedAt: true,
  canceledAt: true,
  cancellationReason: true,
  createdAt: true,
  updatedAt: true,
  creditor: {
    select: { id: true, label: true, creditorIdentifier: true, fileFormat: true }
  }
} satisfies Prisma.DirectDebitRemittanceSelect;

export const REMITTANCE_SELECT = {
  ...REMITTANCE_SUMMARY_SELECT,
  notes: true,
  lines: {
    orderBy: { lineNumber: 'asc' },
    select: {
      id: true,
      lineNumber: true,
      status: true,
      amount: true,
      remainingDueAtSelection: true,
      capped: true,
      canceledAt: true,
      cancellationReason: true,
      prenotificationStatus: true,
      prenotifiedAt: true,
      // Jamais ibanEncrypted : seuls les 4 derniers caractères servent au masque.
      mandate: {
        select: {
          id: true,
          year: true,
          sequence: true,
          status: true,
          ibanLast4: true,
          holderName: true,
          maxAmount: true
        }
      },
      debtor: { select: { id: true, details: true, user: { select: { fullName: true } } } },
      lease: { select: { id: true, lease_number: true } },
      installment: { select: { id: true, period_year: true, period_month: true, due_date: true } }
    }
  }
} satisfies Prisma.DirectDebitRemittanceSelect;

type SummaryRow = Prisma.DirectDebitRemittanceGetPayload<{ select: typeof REMITTANCE_SUMMARY_SELECT }>;
type FullRow = Prisma.DirectDebitRemittanceGetPayload<{ select: typeof REMITTANCE_SELECT }>;

export function toRemittanceSummaryDto(row: SummaryRow): RemittanceSummaryDto {
  // Après validation, le créancier est celui figé ; avant, celui de la fiche.
  const frozen = row.creditorLabelSnapshot !== null;
  return {
    id: row.id,
    reference: remittanceReferenceOf(row.year, row.sequence),
    status: row.status,
    creditor: {
      id: row.creditor.id,
      label: frozen ? (row.creditorLabelSnapshot as string) : row.creditor.label,
      creditorIdentifier: frozen ? (row.creditorIdentifierSnapshot ?? null) : (row.creditor.creditorIdentifier ?? null)
    },
    collectionDate: toIsoDate(row.collectionDate),
    periodYear: row.periodYear,
    periodMonth: row.periodMonth,
    // Date limite figée en base (recalculée à l'actualisation et à la validation).
    prenotificationDeadline: toIsoDate(row.prenotificationDeadline),
    fileFormat: row.fileFormat ?? row.creditor.fileFormat,
    lineCount: row.lineCount,
    totalAmount: Number(row.totalAmount),
    validatedAt: iso(row.validatedAt),
    firstExportedAt: iso(row.firstExportedAt),
    lastExportedAt: iso(row.lastExportedAt),
    exportCount: row.exportCount,
    submittedAt: iso(row.submittedAt),
    canceledAt: iso(row.canceledAt),
    cancellationReason: row.cancellationReason ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

/** Compteurs de prénotification des lignes PENDING seulement. */
export function summarizePrenotifications(
  lines: Array<{ status: string; prenotificationStatus: string }>
): PrenotificationSummaryDto {
  const summary: PrenotificationSummaryDto = { pending: 0, sent: 0, noEmail: 0, disabled: 0, failed: 0 };
  for (const line of lines) {
    if (line.status !== 'PENDING') continue;
    switch (line.prenotificationStatus) {
      case 'SENT':
        summary.sent += 1;
        break;
      case 'NO_EMAIL':
        summary.noEmail += 1;
        break;
      case 'DISABLED':
        summary.disabled += 1;
        break;
      case 'FAILED':
        summary.failed += 1;
        break;
      default:
        summary.pending += 1;
    }
  }
  return summary;
}

export function toRemittanceDto(row: FullRow, debtorNames: Map<string, string | null>): RemittanceDto {
  const lines: RemittanceLineDto[] = row.lines.map(line => ({
    id: line.id,
    lineNumber: line.lineNumber,
    reference: lineReferenceOf(row.year, row.sequence, line.lineNumber),
    status: line.status,
    mandate: {
      id: line.mandate.id,
      reference: mandateReferenceOf(line.mandate.year, line.mandate.sequence),
      status: line.mandate.status,
      ibanMasked: maskIban(line.mandate.ibanLast4),
      holderName: line.mandate.holderName,
      maxAmount: num(line.mandate.maxAmount)
    },
    debtor: { id: line.debtor.id, displayName: debtorNames.get(line.debtor.id) ?? null },
    lease: { id: line.lease.id, leaseNumber: line.lease.lease_number },
    installment: {
      id: line.installment.id,
      periodYear: line.installment.period_year,
      periodMonth: line.installment.period_month,
      dueDate: toIsoDate(line.installment.due_date)
    },
    amount: Number(line.amount),
    remainingDueAtSelection: Number(line.remainingDueAtSelection),
    capped: line.capped,
    prenotificationStatus: line.prenotificationStatus,
    prenotifiedAt: iso(line.prenotifiedAt),
    canceledAt: iso(line.canceledAt),
    cancellationReason: line.cancellationReason ?? null
  }));
  return {
    ...toRemittanceSummaryDto(row),
    notes: row.notes ?? null,
    lines,
    prenotificationSummary: summarizePrenotifications(row.lines)
  };
}

/** Lit une remise de l'agence et la met en forme ; null si elle n'existe pas dans cette agence. */
export async function loadRemittanceDto(
  db: DbClient,
  tenantId: string,
  remittanceId: string
): Promise<RemittanceDto | null> {
  const row = await db.directDebitRemittance.findFirst({
    where: { id: remittanceId, tenantId },
    select: REMITTANCE_SELECT
  });
  if (!row) return null;
  const names = await resolveDebtorNames(
    db,
    tenantId,
    row.lines.map(line => line.debtor)
  );
  return toRemittanceDto(row, names);
}
