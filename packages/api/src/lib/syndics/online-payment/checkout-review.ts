import type { SyndicOnlineCheckout } from '@prisma/client';
import { prisma } from '../../../utils/database';
import { t } from '../../../i18n';
import { AppError, BadRequestError, ErrorCode } from '../../../middleware/error-middleware';
import { logAuditEvent } from '../../../services/audit-service';
import { AuditActionKey } from '../../../types/audit-types';
import { scheduleChargeDocumentDelivery } from '../charge-receipt-delivery';
import {
  auditSyndicCheckoutConfirmed,
  documentRefsOf,
  settleSyndicCheckoutTx,
  SyndicSettleBusinessError,
  withReplayRetry
} from './checkout-settle';
import type { SettleSyndicCheckoutResult } from './checkout-settle';
import { getSyndicCheckout, toCheckoutRow } from './checkout-queries';
import type { DecideSyndicCheckoutResult } from './types';

/**
 * Décision du gestionnaire sur un paiement en `REVIEW` (spec 042, R20 à R22,
 * contracts §1.7). Deux décisions concurrentes : une seule gagne, par claim
 * atomique sur le statut `REVIEW`. Refuser ne rembourse pas le payeur.
 */

export interface DecideSyndicCheckoutParams {
  tenantId: string;
  syndicateId: string;
  checkoutId: string;
  decision: 'ACCEPT' | 'REJECT';
  /** Obligatoire (audit), 1 à 500 caractères après nettoyage. */
  note: string;
  /** `ACCEPT` seulement : date d'encaissement (défaut : maintenant). Pas dans le futur. */
  paidAt?: Date | null;
  actorUserId: string;
}

type SettledPayment = Extract<SettleSyndicCheckoutResult, { kind: 'SETTLED' }>;

const SETTLE_TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 };

function notInReview(): AppError {
  return new AppError(t("Ce paiement n'est pas (ou plus) à vérifier."), 409, ErrorCode.CHECKOUT_NOT_IN_REVIEW);
}

function notAcceptable(): AppError {
  return new AppError(
    t('Ce paiement ne peut pas être accepté : la transaction du fournisseur est déjà enregistrée.'),
    409,
    ErrorCode.REVIEW_NOT_ACCEPTABLE
  );
}

function notRejectable(): AppError {
  return new AppError(
    t("Ce paiement ne peut pas être refusé : l'encaissement est déjà enregistré."),
    409,
    ErrorCode.REVIEW_NOT_REJECTABLE
  );
}

function resolutionData(resolution: 'ACCEPTED' | 'REJECTED', note: string, actorUserId: string, now: Date) {
  return { resolution, resolutionNote: note, resolvedAt: now, resolvedByUserId: actorUserId };
}

/** Refus : aucun encaissement, la tentative passe `FAILED` avec la note. */
async function reject(checkout: SyndicOnlineCheckout, p: DecideSyndicCheckoutParams, now: Date): Promise<void> {
  // Un encaissement déjà enregistré (état contraire) ne se défait pas dans ce chantier.
  if (checkout.reviewKind === 'CONTRARY_STATE' || checkout.chargePaymentId) throw notRejectable();
  const claim = await prisma.syndicOnlineCheckout.updateMany({
    where: { id: checkout.id, tenantId: p.tenantId, syndicateId: p.syndicateId, status: 'REVIEW' },
    data: {
      ...resolutionData('REJECTED', p.note, p.actorUserId, now),
      status: 'FAILED',
      failureMessage: p.note,
      completedAt: now
    }
  });
  if (claim.count !== 1) throw notInReview();
}

/** Acceptation d'un état contraire : l'encaissement existe déjà, on clôt seulement le suivi. */
async function acceptExistingPayment(checkout: SyndicOnlineCheckout, p: DecideSyndicCheckoutParams, now: Date) {
  if (!checkout.chargePaymentId) throw notAcceptable();
  const claim = await prisma.syndicOnlineCheckout.updateMany({
    where: { id: checkout.id, tenantId: p.tenantId, syndicateId: p.syndicateId, status: 'REVIEW' },
    data: { ...resolutionData('ACCEPTED', p.note, p.actorUserId, now), status: 'SUCCESS' }
  });
  if (claim.count !== 1) throw notInReview();
}

/** Acceptation : encaissement du montant REÇU, une seule transaction (même fonction que le succès automatique). */
async function acceptAndRecord(
  checkout: SyndicOnlineCheckout,
  p: DecideSyndicCheckoutParams,
  now: Date
): Promise<SettledPayment> {
  const paidAt = p.paidAt ?? now;
  try {
    const settled = await withReplayRetry(() =>
      prisma.$transaction(
        tx =>
          settleSyndicCheckoutTx(tx, checkout, {
            paidAt,
            amount: Number(checkout.receivedAmount ?? checkout.amount),
            fromStatuses: ['REVIEW'],
            claimData: {
              ...resolutionData('ACCEPTED', p.note, p.actorUserId, now),
              status: 'SUCCESS',
              failureMessage: null,
              completedAt: now
            },
            // Les appels disparus sont écartés : le reliquat devient une avance du lot.
            tolerateMissingCalls: true,
            actorUserId: p.actorUserId
          }),
        SETTLE_TX_OPTIONS
      )
    );
    if (settled.kind === 'LOST') throw notInReview();
    return settled;
  } catch (error) {
    if (!(error instanceof SyndicSettleBusinessError)) throw error;
    if (error.kind === 'FISCAL_YEAR_CLOSED') throw error.originalError ?? error; // exercice clos : le gestionnaire choisit une autre date
    await prisma.syndicOnlineCheckout.updateMany({
      where: { id: checkout.id, tenantId: p.tenantId, status: 'REVIEW' },
      data: { reviewKind: error.kind, reviewReason: error.reason }
    });
    throw notAcceptable();
  }
}

export async function decideSyndicCheckout(p: DecideSyndicCheckoutParams): Promise<DecideSyndicCheckoutResult> {
  const note = p.note.trim();
  if (note.length < 1 || note.length > 500) {
    throw new BadRequestError(t('Une note de 1 à 500 caractères est obligatoire.'));
  }
  const params = { ...p, note };
  const now = new Date();
  if (p.paidAt && p.paidAt.getTime() > now.getTime() + 60_000) {
    throw new BadRequestError(t("La date d'encaissement ne peut pas être dans le futur."));
  }

  const checkout = await getSyndicCheckout(p.tenantId, p.syndicateId, p.checkoutId);
  if (checkout.status !== 'REVIEW') throw notInReview();

  let settled: SettledPayment | null = null;
  if (p.decision === 'REJECT') {
    await reject(checkout, params, now);
  } else if (checkout.reviewKind === 'DUPLICATE_TRANSACTION') {
    throw notAcceptable();
  } else if (checkout.reviewKind === 'CONTRARY_STATE') {
    await acceptExistingPayment(checkout, params, now);
  } else {
    settled = await acceptAndRecord(checkout, params, now);
    // Reçus et quittances : APRÈS le commit.
    scheduleChargeDocumentDelivery(p.tenantId, settled.documents);
    auditSyndicCheckoutConfirmed(checkout, settled, 'ACCEPT', p.actorUserId);
  }

  logAuditEvent({
    actorUserId: p.actorUserId,
    tenantId: p.tenantId,
    actionKey: AuditActionKey.SYNDIC_ONLINE_PAYMENT_RESOLVED,
    entityType: 'SyndicOnlineCheckout',
    entityId: checkout.id,
    payload: {
      checkoutId: checkout.id,
      codePaiement: checkout.codePaiement,
      decision: p.decision,
      reviewKind: checkout.reviewKind,
      amount: Number(checkout.receivedAmount ?? checkout.amount),
      note
    }
  });

  const updated = await prisma.syndicOnlineCheckout.findFirstOrThrow({
    where: { id: checkout.id, tenantId: p.tenantId }
  });
  return {
    checkout: await toCheckoutRow(updated),
    payment: settled
      ? {
          id: settled.paymentId,
          amount: settled.amount,
          unallocatedAmount: settled.unallocatedAmount,
          documents: documentRefsOf(settled.documents)
        }
      : null
  };
}
