import type { Prisma } from '@prisma/client';
import { toIsoDate } from './business-days';
import { resolveDebtorNames, type DbClient, type MandateStatus } from './dto';
import { maskIban } from './iban';
import { maskEmail, resolveDebtorRecipients, type DebtorRecipient, type RecipientSource } from './recipient';

/**
 * Objets renvoyés par l'API des remises (data-model §7.7).
 *
 * Règle absolue : aucun de ces objets ne contient l'IBAN complet, le texte
 * chiffré ni l'adresse e-mail du débiteur. Les select ci-dessous n'ont donc
 * JAMAIS ibanEncrypted ni email.
 */

export type RemittanceStatus = 'DRAFT' | 'VALIDATED' | 'EXPORTED' | 'SUBMITTED' | 'CANCELED';
export type RemittanceLineStatus = 'PENDING' | 'CANCELED' | 'SETTLED' | 'REJECTED';
export type ReturnSourceDto = 'MANUAL' | 'IMPORT';
export type ReturnStateDto = 'NOT_APPLICABLE' | 'AWAITING' | 'PARTIAL' | 'COMPLETE';
export type PrenotificationStatus = 'PENDING' | 'SENT' | 'NO_EMAIL' | 'DISABLED' | 'FAILED';

export interface PrenotificationSummaryDto {
  pending: number;
  sent: number;
  noEmail: number;
  disabled: number;
  failed: number;
  /** Lignes PENDING de la remise, selon l'adresse où part (ou est partie) l'avis. */
  recipients: { account: number; contact: number; none: number };
}

/** Adresse masquée de l'avis : jamais l'adresse complète. */
export interface PrenotificationRecipientDto {
  masked: string;
  source: RecipientSource;
}

export interface ReturnSummaryDto {
  pending: number;
  settled: number;
  rejected: number;
  settledAmount: number;
  rejectedAmount: number;
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
  /** Avancement du retour banque, calculé sur les lignes non annulées (spec 042 §8.7). */
  returnSummary: ReturnSummaryDto;
  /** NOT_APPLICABLE avant dépôt ; AWAITING : aucun constat ; PARTIAL ; COMPLETE : plus aucune ligne PENDING. */
  returnState: ReturnStateDto;
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
  /** Valeurs stockées à l'envoi (SENT/FAILED), sinon adresse prévue (ligne PENDING) ; null sans adresse. */
  prenotificationRecipient: PrenotificationRecipientDto | null;
  canceledAt: string | null;
  cancellationReason: string | null;
  settledAt: string | null;
  rejectedAt: string | null;
  rejectionCode: string | null;
  rejectionReason: string | null;
  rejectFeeAmount: number | null;
  returnSource: ReturnSourceDto | null;
  /** RentalPayment (P3) ou ChargePayment (P4). */
  paymentId: string | null;
  /**
   * Conséquence d'un rejet constaté maintenant, pour la confirmation de l'écran : renseigné pour une ligne
   * PENDING ou SETTLED d'une remise EXPORTED/SUBMITTED, `null` sinon.
   */
  rejectionImpact: RejectionImpactDto | null;
}

export interface RejectionImpactDto {
  /** Frais refacturés au débiteur si la ligne était rejetée maintenant (0 si l'encaisseur ne refacture pas). */
  fee: number;
  /** Le mandat est ACTIVE et ce rejet atteindrait le seuil de rejets consécutifs du créancier. */
  willSuspend: boolean;
}

export interface RemittanceDto extends RemittanceSummaryDto {
  notes: string | null;
  lines: RemittanceLineDto[];
  prenotificationSummary: PrenotificationSummaryDto;
  /** Mandats du créancier non retenus, recalculés en lecture seule ; présent seulement en DRAFT. */
  skipped?: SkippedMandateDto[];
}

export type SkipReasonDto =
  | 'NO_INSTALLMENT'
  | 'NOTHING_DUE'
  | 'ALREADY_IN_REMITTANCE'
  | 'LEASE_NOT_ACTIVE'
  | 'COLLECTION_DAY_LATER'
  | 'MANDATE_NOT_ACTIVE';

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
  },
  // Pour l'avancement du retour banque (returnSummary) : statut et montant seulement.
  lines: { select: { status: true, amount: true } }
} satisfies Prisma.DirectDebitRemittanceSelect;

export const REMITTANCE_SELECT = {
  ...REMITTANCE_SUMMARY_SELECT,
  notes: true,
  scope: true,
  creditor: {
    select: {
      id: true,
      label: true,
      creditorIdentifier: true,
      fileFormat: true,
      rejectFeeAmount: true,
      maxConsecutiveRejects: true
    }
  },
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
      prenotificationRecipientMasked: true,
      prenotificationRecipientSource: true,
      settledAt: true,
      rejectedAt: true,
      rejectionCode: true,
      rejectionReason: true,
      rejectFeeAmount: true,
      returnSource: true,
      rentalPaymentId: true,
      // Jamais ibanEncrypted : seuls les 4 derniers caractères servent au masque.
      mandate: {
        select: {
          id: true,
          year: true,
          sequence: true,
          status: true,
          ibanLast4: true,
          holderName: true,
          maxAmount: true,
          consecutiveRejects: true
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

/**
 * Avancement du retour banque, sur les lignes non annulées. `lineCount` et
 * `totalAmount` restent ceux de la remise déposée (spec 042 §8.7).
 */
export function summarizeReturn(
  status: RemittanceStatus,
  lines: Array<{ status: string; amount: Prisma.Decimal | number }>
): { returnSummary: ReturnSummaryDto; returnState: ReturnStateDto } {
  const returnSummary: ReturnSummaryDto = { pending: 0, settled: 0, rejected: 0, settledAmount: 0, rejectedAmount: 0 };
  for (const line of lines) {
    const amount = Number(line.amount);
    if (line.status === 'PENDING') returnSummary.pending += 1;
    else if (line.status === 'SETTLED') {
      returnSummary.settled += 1;
      returnSummary.settledAmount += amount;
    } else if (line.status === 'REJECTED') {
      returnSummary.rejected += 1;
      returnSummary.rejectedAmount += amount;
    }
  }
  returnSummary.settledAmount = Math.round(returnSummary.settledAmount * 100) / 100;
  returnSummary.rejectedAmount = Math.round(returnSummary.rejectedAmount * 100) / 100;
  let returnState: ReturnStateDto = 'NOT_APPLICABLE';
  if (status === 'EXPORTED' || status === 'SUBMITTED') {
    const recorded = returnSummary.settled + returnSummary.rejected;
    if (recorded === 0) returnState = 'AWAITING';
    else returnState = returnSummary.pending === 0 ? 'COMPLETE' : 'PARTIAL';
  }
  return { returnSummary, returnState };
}

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
    ...summarizeReturn(row.status, row.lines),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

/** Compteurs de prénotification des lignes PENDING seulement. */
export function summarizePrenotifications(
  lines: Array<{
    status: string;
    prenotificationStatus: string;
    prenotificationRecipient?: PrenotificationRecipientDto | null;
  }>
): PrenotificationSummaryDto {
  const summary: PrenotificationSummaryDto = {
    pending: 0,
    sent: 0,
    noEmail: 0,
    disabled: 0,
    failed: 0,
    recipients: { account: 0, contact: 0, none: 0 }
  };
  for (const line of lines) {
    if (line.status !== 'PENDING') continue;
    const recipient = line.prenotificationRecipient;
    if (!recipient) summary.recipients.none += 1;
    else if (recipient.source === 'ACCOUNT') summary.recipients.account += 1;
    else summary.recipients.contact += 1;
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

/** Adresse affichée d'une ligne : celle gardée à l'envoi, sinon l'adresse prévue d'une ligne PENDING. */
function recipientOf(
  line: FullRow['lines'][number],
  planned: Map<string, DebtorRecipient | null>
): PrenotificationRecipientDto | null {
  if (line.prenotificationRecipientMasked && line.prenotificationRecipientSource) {
    return { masked: line.prenotificationRecipientMasked, source: line.prenotificationRecipientSource };
  }
  if (line.status !== 'PENDING') return null;
  const recipient = planned.get(line.debtor.id) ?? null;
  return recipient ? { masked: maskEmail(recipient.email), source: recipient.source } : null;
}

/**
 * Conséquence d'un rejet immédiat. Seul l'encaisseur des loyers refacture les frais (voir
 * `collectors/rental.ts#applyRejectFeeTx`) ; les autres périmètres donnent 0.
 */
function rejectionImpactOf(row: FullRow, line: FullRow['lines'][number]): RejectionImpactDto | null {
  if (row.status !== 'EXPORTED' && row.status !== 'SUBMITTED') return null;
  if (line.status !== 'PENDING' && line.status !== 'SETTLED') return null;
  const configuredFee = Number(row.creditor.rejectFeeAmount ?? 0);
  const threshold = row.creditor.maxConsecutiveRejects ?? 0;
  return {
    fee: row.scope === 'RENTAL_LEASE' && configuredFee > 0 ? configuredFee : 0,
    willSuspend:
      line.mandate.status === 'ACTIVE' && threshold > 0 && (line.mandate.consecutiveRejects ?? 0) + 1 >= threshold
  };
}

export function toRemittanceDto(
  row: FullRow,
  debtorNames: Map<string, string | null>,
  plannedRecipients: Map<string, DebtorRecipient | null> = new Map()
): RemittanceDto {
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
    prenotificationRecipient: recipientOf(line, plannedRecipients),
    canceledAt: iso(line.canceledAt),
    cancellationReason: line.cancellationReason ?? null,
    settledAt: line.settledAt ? toIsoDate(line.settledAt) : null,
    rejectedAt: line.rejectedAt ? toIsoDate(line.rejectedAt) : null,
    rejectionCode: line.rejectionCode ?? null,
    rejectionReason: line.rejectionReason ?? null,
    rejectFeeAmount: num(line.rejectFeeAmount),
    returnSource: line.returnSource ?? null,
    // P3 : l'encaissement locatif ; P4 y ajoutera le paiement de charges.
    paymentId: line.rentalPaymentId ?? null,
    rejectionImpact: rejectionImpactOf(row, line)
  }));
  return {
    ...toRemittanceSummaryDto(row),
    notes: row.notes ?? null,
    lines,
    prenotificationSummary: summarizePrenotifications(
      lines.map(line => ({
        status: line.status,
        prenotificationStatus: line.prenotificationStatus,
        prenotificationRecipient: line.prenotificationRecipient
      }))
    )
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
  // Adresse prévue des lignes PENDING dont l'avis n'est pas encore parti (rien n'est stocké avant l'envoi).
  const toPlan = row.lines
    .filter(line => line.status === 'PENDING' && !line.prenotificationRecipientMasked)
    .map(line => line.debtor.id);
  const planned = await resolveDebtorRecipients(db, tenantId, toPlan);
  return toRemittanceDto(row, names, planned);
}
