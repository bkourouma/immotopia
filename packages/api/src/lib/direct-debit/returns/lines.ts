import { t } from '../../../i18n';
import { getEmailNotificationConfig } from '../../../services/email-notification-config-service';
import { emailService } from '../../../services/email-service';
import { recordAuditEvent } from '../../../services/audit-service';
import { AuditActionKey } from '../../../types/audit-types';
import { prisma } from '../../../utils/database';
import { logger } from '../../../utils/logger';
import { formatFrenchDate, toIsoDate } from '../business-days';
import { getCollector } from '../collectors';
import type { CollectorContext, CollectorLine, DirectDebitCollector, Tx as CollectorTx } from '../collectors/types';
import { resolveDebtorNames } from '../dto';
import { maskIban } from '../iban';
import { lineReferenceOf, mandateReferenceOf, remittanceReferenceOf } from '../remittance-dto';
import { resolveDebtorRecipients } from '../recipient';
import {
  LINE_TRANSACTION_OPTIONS,
  checkReturnDate,
  errorNameOf,
  lineJustProcessed,
  loadReturnLine,
  lockReturnRemittance,
  promoteToSubmitted,
  type ReturnLine,
  type ReturnRemittance
} from './shared';
import type { ReturnScope } from './types';

/**
 * Constat de règlement et de rejet d'une ligne de remise (spec 042, P3,
 * data-model §8.3 et §8.4). Une transaction par ligne ; la réservation de la
 * ligne est un `updateMany` conditionnel sur le statut LU : un constat
 * concurrent, ou un fichier rejoué, obtient 0 ligne et une ConflictError.
 *
 * Ce module ne lit, ne renvoie et ne journalise jamais d'IBAN (seulement le
 * masque) ni d'adresse e-mail complète.
 */

export type ReturnSource = 'MANUAL' | 'IMPORT';

export interface ReturnOrigin {
  source: ReturnSource;
  importId: string | null;
  actorUserId: string | null;
}

const money = (amount: number) => `${new Intl.NumberFormat('fr-FR').format(amount)} FCFA`;

function toCollectorLine(remittance: ReturnRemittance, line: ReturnLine): CollectorLine {
  return {
    id: line.id,
    tenantId: line.tenantId,
    remittanceId: line.remittanceId,
    reference: lineReferenceOf(remittance.year, remittance.sequence, line.lineNumber),
    mandateId: line.mandateId,
    amount: Number(line.amount),
    scope: remittance.scope,
    leaseId: line.leaseId,
    installmentId: line.installmentId,
    // P4 (SYNDIC_LOT) : l'encaisseur des charges lira ces champs sur sa propre ligne.
    lotId: null,
    chargeCallIds: [],
    syndicateId: null,
    rentalPaymentId: line.rentalPaymentId,
    chargePaymentId: null,
    treasuryAccountId: remittance.creditor.treasuryAccountId
  };
}

async function runAfterCommit(tenantId: string, afterCommit: (() => Promise<void>) | undefined) {
  if (!afterCommit) return;
  try {
    await afterCommit();
  } catch (error) {
    // Après commit : le constat est acquis, l'échec (quittance…) est seulement journalisé.
    logger.warn('Prélèvement : traitement après constat échoué', { tenantId, errorName: errorNameOf(error) });
  }
}

// ---------------------------------------------------------------------------
// Règlement
// ---------------------------------------------------------------------------

export async function settleLine(
  tenantId: string,
  scope: ReturnScope,
  remittanceId: string,
  lineId: string,
  settledAtIso: string,
  origin: ReturnOrigin,
  now: Date
): Promise<void> {
  let afterCommit: (() => Promise<void>) | undefined;

  await prisma.$transaction(async tx => {
    const remittance = await lockReturnRemittance(tx, tenantId, scope, remittanceId, now);
    const settledAt = checkReturnDate(settledAtIso, remittance.collectionDate, now);
    const line = await loadReturnLine(tx, tenantId, remittanceId, lineId);
    if (line.status !== 'PENDING') throw lineJustProcessed();

    const collector: DirectDebitCollector = getCollector(remittance.scope);
    const ctx: CollectorContext = { tenantId, actorUserId: origin.actorUserId, now };

    // 1. Réservation : la ligne ne bouge que si elle est encore PENDING.
    const reserved = await tx.directDebitRemittanceLine.updateMany({
      where: { id: line.id, tenantId, remittanceId, status: 'PENDING' },
      data: {
        status: 'SETTLED',
        settledAt,
        returnSource: origin.source,
        returnImportId: origin.importId,
        returnRecordedAt: now,
        returnRecordedByUserId: origin.actorUserId,
        // L'échéance reste occupée (ADR-007 §6) si l'encaisseur le demande : le loyer est payé.
        ...(collector.keepsActiveKeyOnSettle ? {} : { activeKey: null })
      }
    });
    if (reserved.count === 0) throw lineJustProcessed();

    await promoteToSubmitted(tx, tenantId, remittance, origin.actorUserId, now);

    // 2. Encaissement par l'encaisseur du périmètre.
    const result = await collector.settleTx(
      tx as unknown as CollectorTx,
      ctx,
      toCollectorLine(remittance, line),
      settledAt
    );
    afterCommit = result.afterCommit;
    if (result.rentalPaymentId) {
      await tx.directDebitRemittanceLine.updateMany({
        where: { id: line.id, tenantId },
        data: { rentalPaymentId: result.rentalPaymentId }
      });
    }

    // 4. Un prélèvement réglé remet le compteur de rejets consécutifs à zéro (D5).
    await tx.directDebitMandate.updateMany({
      where: { id: line.mandateId, tenantId },
      data: { consecutiveRejects: 0 }
    });

    await recordAuditEvent(tx, {
      actorUserId: origin.actorUserId,
      tenantId,
      actionKey: AuditActionKey.DIRECT_DEBIT_LINE_SETTLED,
      entityType: 'DirectDebitRemittanceLine',
      entityId: line.id,
      payload: {
        reference: lineReferenceOf(remittance.year, remittance.sequence, line.lineNumber),
        remittanceReference: remittanceReferenceOf(remittance.year, remittance.sequence),
        amount: Number(line.amount),
        settledAt: toIsoDate(settledAt),
        source: origin.source,
        paymentId: result.rentalPaymentId ?? result.chargePaymentId ?? null
      }
    });
  }, LINE_TRANSACTION_OPTIONS);

  await runAfterCommit(tenantId, afterCommit);
}

// ---------------------------------------------------------------------------
// Rejet
// ---------------------------------------------------------------------------

export interface RejectDetails {
  code: string | null;
  reason: string | null;
}

interface RejectOutcome {
  fee: number;
  suspended: boolean;
  wasSettled: boolean;
  consecutiveRejects: number;
  amount: number;
  collectionDate: Date;
  mandate: ReturnLine['mandate'];
  debtorClientId: string;
  agencyName: string | null;
}

export async function rejectLine(
  tenantId: string,
  scope: ReturnScope,
  remittanceId: string,
  lineId: string,
  rejectedAtIso: string,
  details: RejectDetails,
  origin: ReturnOrigin,
  now: Date
): Promise<void> {
  let afterCommit: (() => Promise<void>) | undefined;
  let outcome: RejectOutcome | undefined;

  await prisma.$transaction(async tx => {
    const remittance = await lockReturnRemittance(tx, tenantId, scope, remittanceId, now);
    const rejectedAt = checkReturnDate(rejectedAtIso, remittance.collectionDate, now);
    const line = await loadReturnLine(tx, tenantId, remittanceId, lineId);
    if (line.status !== 'PENDING' && line.status !== 'SETTLED') throw lineJustProcessed();
    const wasSettled = line.status === 'SETTLED';

    const collector: DirectDebitCollector = getCollector(remittance.scope);
    const ctx: CollectorContext = { tenantId, actorUserId: origin.actorUserId, now };
    const collectorLine = toCollectorLine(remittance, line);
    const lineReference = collectorLine.reference;

    // 1. Réservation sur le statut lu : un règlement concurrent n'est pas écrasé sans être contre-passé.
    const reserved = await tx.directDebitRemittanceLine.updateMany({
      where: { id: line.id, tenantId, remittanceId, status: line.status },
      data: {
        status: 'REJECTED',
        rejectedAt,
        rejectionCode: details.code,
        rejectionReason: details.reason,
        // L'échéance peut être représentée dans une nouvelle remise.
        activeKey: null,
        returnSource: origin.source,
        returnImportId: origin.importId,
        returnRecordedAt: now,
        returnRecordedByUserId: origin.actorUserId
      }
    });
    if (reserved.count === 0) throw lineJustProcessed();

    await promoteToSubmitted(tx, tenantId, remittance, origin.actorUserId, now);

    // 2. Rejet tardif : contre-passation de l'encaissement (un encaisseur qui ne sait pas le faire lève une erreur).
    if (wasSettled) {
      const reversed = await collector.reverseTx(tx as unknown as CollectorTx, ctx, collectorLine);
      afterCommit = reversed.afterCommit;
    }

    // 3. Frais de rejet (D4) : seulement ce que l'encaisseur refacture réellement.
    const configuredFee = Number(remittance.creditor.rejectFeeAmount);
    let fee = 0;
    if (configuredFee > 0) {
      fee = (await collector.applyRejectFeeTx(tx as unknown as CollectorTx, ctx, collectorLine, configuredFee))
        .appliedAmount;
    }
    await tx.directDebitRemittanceLine.updateMany({
      where: { id: line.id, tenantId },
      data: { rejectFeeAmount: fee }
    });

    // 5. Compteur de rejets consécutifs et suspension automatique au seuil (D5).
    await tx.directDebitMandate.updateMany({
      where: { id: line.mandateId, tenantId },
      data: { consecutiveRejects: { increment: 1 } }
    });
    const mandate = await tx.directDebitMandate.findFirst({
      where: { id: line.mandateId, tenantId },
      select: { status: true, consecutiveRejects: true }
    });
    const threshold = remittance.creditor.maxConsecutiveRejects;
    let suspended = false;
    if (mandate && threshold > 0 && mandate.consecutiveRejects >= threshold && mandate.status === 'ACTIVE') {
      const result = await tx.directDebitMandate.updateMany({
        where: { id: line.mandateId, tenantId, status: 'ACTIVE' },
        data: {
          status: 'SUSPENDED',
          suspendedAt: now,
          suspensionReason: t('Suspendu automatiquement après {{count}} rejets consécutifs.', { count: threshold })
        }
      });
      suspended = result.count === 1;
      if (suspended) {
        await recordAuditEvent(tx, {
          actorUserId: origin.actorUserId,
          tenantId,
          actionKey: AuditActionKey.DIRECT_DEBIT_MANDATE_AUTO_SUSPENDED,
          entityType: 'DirectDebitMandate',
          entityId: line.mandateId,
          payload: {
            reference: mandateReferenceOf(line.mandate.year, line.mandate.sequence),
            consecutiveRejects: mandate.consecutiveRejects,
            threshold,
            lineReference
          }
        });
      }
    }

    await recordAuditEvent(tx, {
      actorUserId: origin.actorUserId,
      tenantId,
      actionKey: AuditActionKey.DIRECT_DEBIT_LINE_REJECTED,
      entityType: 'DirectDebitRemittanceLine',
      entityId: line.id,
      payload: {
        reference: lineReference,
        remittanceReference: remittanceReferenceOf(remittance.year, remittance.sequence),
        amount: Number(line.amount),
        rejectedAt: toIsoDate(rejectedAt),
        source: origin.source,
        code: details.code,
        reason: details.reason,
        wasSettled,
        rejectFee: fee,
        mandateSuspended: suspended
      }
    });

    outcome = {
      fee,
      suspended,
      wasSettled,
      consecutiveRejects: mandate?.consecutiveRejects ?? 0,
      amount: Number(line.amount),
      collectionDate: remittance.collectionDate,
      mandate: line.mandate,
      debtorClientId: line.debtorClientId,
      agencyName: remittance.tenant?.name ?? null
    };
  }, LINE_TRANSACTION_OPTIONS);

  await runAfterCommit(tenantId, afterCommit);
  if (outcome) await notifyRejection(tenantId, outcome, details);
}

/**
 * E-mail `DIRECT_DEBIT_REJECTED` au débiteur (§8.8), après la transaction : IBAN
 * masqué, adresse masquée dans les journaux (`redactRecipient`), échec isolé.
 */
async function notifyRejection(tenantId: string, outcome: RejectOutcome, details: RejectDetails): Promise<void> {
  try {
    const config = await getEmailNotificationConfig(tenantId, 'DIRECT_DEBIT_REJECTED');
    if (!config.enabled) return;
    const recipients = await resolveDebtorRecipients(prisma, tenantId, [outcome.debtorClientId]);
    const to = recipients.get(outcome.debtorClientId)?.email;
    if (!to) return;
    const debtor = await prisma.tenantClient.findFirst({
      where: { id: outcome.debtorClientId, tenantId },
      select: { id: true, details: true, user: { select: { fullName: true } } }
    });
    const names = debtor ? await resolveDebtorNames(prisma, tenantId, [debtor]) : new Map<string, string | null>();

    await emailService.sendDirectDebitRejected(
      to,
      {
        debtorName: names.get(outcome.debtorClientId) ?? t('Locataire'),
        agencyName: outcome.agencyName ?? t('Votre agence'),
        mandateReference: mandateReferenceOf(outcome.mandate.year, outcome.mandate.sequence),
        ibanMasked: maskIban(outcome.mandate.ibanLast4),
        amount: money(outcome.amount),
        collectionDate: formatFrenchDate(outcome.collectionDate),
        reason: details.reason || details.code || t('Non précisé par la banque'),
        rejectFee:
          outcome.fee > 0
            ? t('Des frais de rejet de {{amount}} vous sont refacturés.', { amount: money(outcome.fee) })
            : '',
        suspensionNotice: outcome.suspended
          ? t('Votre autorisation de prélèvement a été suspendue après {{count}} rejets consécutifs.', {
              count: outcome.consecutiveRejects
            })
          : ''
      },
      {
        tenantId,
        templateOverrides:
          config.subjectOverride || config.bodyHtmlOverride
            ? { subject: config.subjectOverride, bodyHtml: config.bodyHtmlOverride }
            : undefined
      }
    );
  } catch (error) {
    // Jamais l'adresse ni le message du transport : seulement le type d'erreur.
    logger.warn('Prélèvement : e-mail de rejet non envoyé', { tenantId, errorName: errorNameOf(error) });
  }
}
