import type { Prisma } from '@prisma/client';
import { toIsoDate } from './business-days';
import { contactDisplayName, resolveDebtorNames, type DbClient, type MandateStatus } from './dto';
import { maskIban } from './iban';
import { maskEmail, resolveDebtorRecipients, type DebtorRecipient, type RecipientSource } from './recipient';
import { resolveContactRecipients } from './syndic/recipients';
import { RENTAL_CTX, scopeWhere, type DirectDebitScopeCtx } from './syndic/scope';

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
  scope: 'RENTAL_LEASE' | 'SYNDIC_LOT';
  /** Syndicat de la remise (SYNDIC_LOT), nul en RENTAL_LEASE. */
  syndicate: { id: string; name: string } | null;
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
  debtor: { id: string; displayName: string | null; kind: 'CLIENT' | 'CONTACT' };
  /** Nuls en SYNDIC_LOT. */
  lease: { id: string; leaseNumber: string } | null;
  installment: { id: string; periodYear: number; periodMonth: number; dueDate: string } | null;
  /** SYNDIC_LOT. */
  lot: { id: string; lotNumber: string } | null;
  /** Appels de charges couverts (SYNDIC_LOT), plus ancien d'abord ; vide en RENTAL_LEASE. */
  chargeCalls: ChargeCallBriefDto[];
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
}

export interface ChargeCallBriefDto {
  id: string;
  period: string;
  dueDate: string;
  amount: number;
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
  /** Numéro du lot (SYNDIC_LOT) ; absent en RENTAL_LEASE. */
  lotNumber?: string | null;
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
  scope: true,
  syndicate: { select: { id: true, name: true } },
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
      chargePaymentId: true,
      chargeCallIds: true,
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
      debtorContact: { select: { id: true, contactType: true, firstName: true, lastName: true, legalName: true } },
      lot: { select: { id: true, lotNumber: true } },
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
    scope: row.scope,
    syndicate: row.syndicate ? { id: row.syndicate.id, name: row.syndicate.name } : null,
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
  const debtorKey = line.debtor?.id ?? line.debtorContact?.id;
  const recipient = debtorKey ? (planned.get(debtorKey) ?? null) : null;
  return recipient ? { masked: maskEmail(recipient.email), source: recipient.source } : null;
}

export function toRemittanceDto(
  row: FullRow,
  debtorNames: Map<string, string | null>,
  plannedRecipients: Map<string, DebtorRecipient | null> = new Map(),
  chargeCallsById: Map<string, ChargeCallBriefDto> = new Map()
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
    debtor: line.debtor
      ? { id: line.debtor.id, displayName: debtorNames.get(line.debtor.id) ?? null, kind: 'CLIENT' }
      : {
          id: line.debtorContact?.id ?? '',
          displayName: line.debtorContact ? contactDisplayName(line.debtorContact) : null,
          kind: 'CONTACT'
        },
    lease: line.lease ? { id: line.lease.id, leaseNumber: line.lease.lease_number } : null,
    installment: line.installment
      ? {
          id: line.installment.id,
          periodYear: line.installment.period_year,
          periodMonth: line.installment.period_month,
          dueDate: toIsoDate(line.installment.due_date)
        }
      : null,
    lot: line.lot ? { id: line.lot.id, lotNumber: line.lot.lotNumber } : null,
    chargeCalls: line.chargeCallIds.flatMap(id => {
      const call = chargeCallsById.get(id);
      return call ? [call] : [];
    }),
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
    // RentalPayment (RENTAL_LEASE) ou ChargePayment (SYNDIC_LOT).
    paymentId: line.rentalPaymentId ?? line.chargePaymentId ?? null
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

/** Appels de charges couverts par les lignes (SYNDIC_LOT), filtrés par agence. */
async function loadChargeCalls(
  db: DbClient,
  tenantId: string,
  lines: Array<{ chargeCallIds: string[] }>
): Promise<Map<string, ChargeCallBriefDto>> {
  const ids = [...new Set(lines.flatMap(line => line.chargeCallIds))];
  const byId = new Map<string, ChargeCallBriefDto>();
  if (ids.length === 0) return byId;
  const calls = await db.chargeCall.findMany({
    where: { id: { in: ids }, syndicate: { tenantId } },
    select: { id: true, period: true, dueDate: true, amount: true }
  });
  for (const call of calls) {
    byId.set(call.id, {
      id: call.id,
      period: call.period,
      dueDate: toIsoDate(call.dueDate),
      amount: Number(call.amount)
    });
  }
  return byId;
}

/** Lit une remise de l'agence et la met en forme ; null si elle n'existe pas dans cette agence. */
export async function loadRemittanceDto(
  db: DbClient,
  tenantId: string,
  remittanceId: string,
  ctx: DirectDebitScopeCtx = RENTAL_CTX
): Promise<RemittanceDto | null> {
  const row = await db.directDebitRemittance.findFirst({
    where: { id: remittanceId, tenantId, ...scopeWhere(ctx) },
    select: REMITTANCE_SELECT
  });
  if (!row) return null;
  const names = await resolveDebtorNames(
    db,
    tenantId,
    row.lines.map(line => line.debtor)
  );
  // Adresse prévue des lignes PENDING dont l'avis n'est pas encore parti (rien n'est stocké avant l'envoi).
  const unsent = row.lines.filter(line => line.status === 'PENDING' && !line.prenotificationRecipientMasked);
  const toPlan = unsent.flatMap(line => (line.debtor ? [line.debtor.id] : []));
  const planned = await resolveDebtorRecipients(db, tenantId, toPlan);
  // Copropriété : l'adresse prévue est celle du contact débiteur.
  const contactsToPlan = unsent.flatMap(line => (line.debtorContact ? [line.debtorContact.id] : []));
  if (contactsToPlan.length > 0) {
    for (const [id, recipient] of await resolveContactRecipients(db, tenantId, contactsToPlan)) {
      planned.set(id, recipient);
    }
  }
  return toRemittanceDto(row, names, planned, await loadChargeCalls(db, tenantId, row.lines));
}
