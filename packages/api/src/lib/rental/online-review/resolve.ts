import { RentalPaymentStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { z } from 'zod';
import { prisma } from '../../../utils/database';
import { logger } from '../../../utils/logger';
import { t } from '../../../i18n';
import {
  AppError,
  BadRequestError,
  ConflictError,
  ErrorCode,
  NotFoundError
} from '../../../middleware/error-middleware';
import { logAuditEvent } from '../../../services/audit-service';
import { AuditActionKey } from '../../../types/audit-types';
import {
  allocatePaymentTx,
  montantDisponibleTx,
  updatePaymentStatusTx
} from '../../../services/rental-payment-service';
import { resteDuEcheance } from '../../payment-gateway/checkout';
import { operatorFromServiceName } from '../../payment-gateway/status-mapping';
import { getOnlinePaymentRow } from './queries';
import type { ResolveOnlinePaymentResultDto } from './types';

/**
 * Décision d'un paiement en ligne locatif en REVIEW (contrat 049 §2.5).
 *
 * Seule voie qui encaisse (ou refuse) une tentative en REVIEW : la vérification
 * automatique (bouton, IPN, retour portail, tâche) ne fait que du suivi. Une seule
 * transaction : claim atomique `REVIEW -> SUCCESS|FAILED` (deux décisions concurrentes :
 * un seul vainqueur, l'autre reçoit 409), puis encaissement ou refus du `RentalPayment`.
 */

const resolveBodySchema = z
  .object({
    decision: z.enum(['ACCEPT', 'REJECT']),
    note: z.string().trim().min(1).max(500).optional(),
    paidAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
  })
  .strict();

function notInReview(): AppError {
  return new AppError(
    t("Ce paiement n'est pas (ou plus) à vérifier."),
    409,
    ErrorCode.RENTAL_ONLINE_PAYMENT_NOT_IN_REVIEW
  );
}

/** Date de règlement : jour choisi, à midi UTC ; jamais dans le futur. */
function parsePaidAt(value: string | undefined, now: Date): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new AppError(t('Date de paiement invalide.'), 400, ErrorCode.VALIDATION_ERROR);
  }
  const todayKey = now.toISOString().slice(0, 10);
  if (value > todayKey) {
    throw new AppError(t('La date de paiement ne peut pas être dans le futur.'), 400, ErrorCode.VALIDATION_ERROR);
  }
  return value === todayKey ? null : date;
}

export async function resolveOnlinePayment(
  tenantId: string,
  userId: string,
  checkoutId: string,
  rawBody: unknown
): Promise<ResolveOnlinePaymentResultDto> {
  const body = resolveBodySchema.parse(rawBody);
  if (body.decision === 'REJECT') {
    if (!body.note) {
      throw new AppError(
        t('Une note est obligatoire pour refuser un paiement.'),
        400,
        ErrorCode.RENTAL_ONLINE_PAYMENT_NOTE_REQUIRED
      );
    }
    if (body.paidAt) {
      throw new AppError(t('La date de paiement ne s’applique qu’à une acceptation.'), 400, ErrorCode.VALIDATION_ERROR);
    }
  }
  const now = new Date();
  const paidAt = body.decision === 'ACCEPT' ? parsePaidAt(body.paidAt, now) : null;

  const outcome = await prisma.$transaction(async tx => {
    const checkout = await tx.onlinePaymentCheckout.findFirst({ where: { id: checkoutId, tenantId } });
    if (!checkout) throw new NotFoundError(t('Paiement en ligne introuvable.'));
    if (checkout.status !== 'REVIEW') throw notInReview();

    const payment = await tx.rentalPayment.findFirst({
      where: { id: checkout.paymentId, tenant_id: tenantId },
      select: { id: true, status: true, amount: true, currency: true }
    });
    if (!payment) throw new NotFoundError(t('Paiement introuvable'));
    const collected = payment.status === RentalPaymentStatus.SUCCESS;
    const kind = checkout.reviewKind;

    // Matrice par motif (contrat 049 §2.5).
    if (body.decision === 'ACCEPT' && kind === 'DUPLICATE_TRANSACTION') {
      throw new AppError(
        t('Cette transaction est déjà enregistrée sur un autre paiement : elle ne peut pas être acceptée.'),
        409,
        ErrorCode.REVIEW_NOT_ACCEPTABLE
      );
    }
    if (body.decision === 'REJECT' && collected) {
      throw new AppError(
        t("L'argent est déjà encaissé : ce paiement ne peut pas être refusé."),
        409,
        ErrorCode.REVIEW_NOT_REJECTABLE
      );
    }

    // Claim atomique : un seul vainqueur.
    const claim = await tx.onlinePaymentCheckout.updateMany({
      where: { id: checkout.id, tenantId, status: 'REVIEW' },
      data: {
        status: body.decision === 'ACCEPT' ? 'SUCCESS' : 'FAILED',
        resolution: body.decision,
        resolvedByUserId: userId,
        resolvedAt: now,
        resolutionNote: body.note ?? null,
        completedAt: now,
        ...(body.decision === 'REJECT' ? { failureMessage: body.note } : {})
      }
    });
    if (claim.count !== 1) throw notInReview();

    if (body.decision === 'REJECT') {
      if (payment.status !== RentalPaymentStatus.FAILED && payment.status !== RentalPaymentStatus.CANCELED) {
        await updatePaymentStatusTx(tx, tenantId, payment.id, RentalPaymentStatus.FAILED, userId);
      }
      return { checkout, collectedNow: null };
    }

    // ACCEPT. Déjà encaissé (CONTRARY_STATE) : aucun nouvel encaissement, la tentative est close en SUCCESS.
    if (collected) return { checkout, collectedNow: null };

    const received = checkout.receivedAmount !== null ? Number(checkout.receivedAmount) : Number(checkout.amount);
    await tx.rentalPayment.update({
      where: { id: payment.id, tenant_id: tenantId },
      data: {
        ...(Number(payment.amount) !== received ? { amount: new Decimal(received) } : {}),
        ...(paidAt ? { succeeded_at: paidAt } : {}),
        // Comme le succès automatique : moyen réel et référence de l'agrégateur reportés sur le paiement.
        mm_operator: operatorFromServiceName(checkout.providerServiceName),
        ...(checkout.providerTransactionId ? { psp_transaction_id: checkout.providerTransactionId } : {})
      }
    });
    await updatePaymentStatusTx(tx, tenantId, payment.id, RentalPaymentStatus.SUCCESS, userId);

    // Échéances encore ouvertes parmi celles visées ; aucune ouverte => paiement enregistré non alloué.
    const installments = await tx.rentalInstallment.findMany({
      where: { id: { in: checkout.installmentIds }, tenant_id: tenantId, lease_id: checkout.leaseId },
      select: {
        id: true,
        status: true,
        amount_rent: true,
        amount_service: true,
        amount_other_fees: true,
        penalty_amount: true,
        amount_paid: true,
        payments: { select: { amount: true, payment: { select: { status: true } } } }
      }
    });
    const openIds = installments
      .filter(row => row.status !== 'CANCELED' && resteDuEcheance(row) > 0)
      .map(row => row.id);
    if (openIds.length > 0) {
      try {
        await allocatePaymentTx(tx, tenantId, payment.id, { installmentIds: openIds }, userId);
      } catch (error) {
        // NB : le service d'allocation lève une BadRequestError sans code propre (fichier hors du
        // territoire de ce lot) : on la reconnaît donc encore à son message. À remplacer par un code
        // d'erreur dédié dès que le service en porte un.
        // Seule « rien à allouer » laisse le paiement non alloué ; toute autre erreur
        // (exercice clos…) annule la décision entière.
        const nothingToAllocate =
          error instanceof NotFoundError ||
          error instanceof ConflictError ||
          (error instanceof BadRequestError && error.message === t('Aucune allocation possible'));
        if (!nothingToAllocate) throw error;
        logger.warn('resolveOnlinePayment: allocation impossible, paiement conservé non alloué', {
          checkoutId: checkout.id,
          error: (error as Error)?.message
        });
      }
    }

    const allocations = await tx.rentalPaymentAllocation.findMany({
      where: { payment_id: payment.id, tenant_id: tenantId },
      select: { installment_id: true }
    });
    const updatedPayment = await tx.rentalPayment.findFirstOrThrow({
      where: { id: payment.id, tenant_id: tenantId },
      select: { id: true, amount: true }
    });
    const unallocated = await montantDisponibleTx(tx, tenantId, updatedPayment);
    return {
      checkout,
      collectedNow: {
        id: payment.id,
        amount: Number(updatedPayment.amount),
        unallocatedAmount: Math.max(0, unallocated),
        allocatedInstallmentIds: [...new Set(allocations.map(row => row.installment_id))],
        receiptNumber: null as string | null
      }
    };
  });

  logAuditEvent({
    actorUserId: userId,
    tenantId,
    actionKey: AuditActionKey.RENTAL_ONLINE_PAYMENT_RESOLVED,
    entityType: 'OnlinePaymentCheckout',
    entityId: outcome.checkout.id,
    // Ni jeton ni URL de paiement.
    payload: {
      checkoutId: outcome.checkout.id,
      codePaiement: outcome.checkout.codePaiement,
      decision: body.decision,
      reviewKind: outcome.checkout.reviewKind,
      amount: Number(outcome.checkout.amount),
      note: body.note ?? null
    }
  });

  return { checkout: await getOnlinePaymentRow(tenantId, checkoutId), payment: outcome.collectedNow };
}
