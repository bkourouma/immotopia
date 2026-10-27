import { DocumentType, RentalDocumentStatus, RentalDocumentType, RentalPaymentStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { t } from '../../../i18n';
import { AppError, ConflictError, NotFoundError } from '../../../middleware/error-middleware';
import { generateDocument } from '../../../services/document-generation-service';
import { compteLocataireDuBailTx } from '../../../services/rental-installment-service';
import { allocatePaymentTx, updatePaymentStatusTx } from '../../../services/rental-payment-service';
import { prisma, type PrismaTransactionClient } from '../../../utils/database';
import { logger } from '../../../utils/logger';
import { withExclusiveSection } from '../../ai/advisory-lock';
import { appendThirdPartyMovementTx } from '../../finance/ledger';
import { roundMoney } from '../../finance/money';
import type { CollectorContext, CollectorLine, DirectDebitCollector, Tx } from './types';

/**
 * Encaisseur des loyers (spec 042, P3, data-model §8.6).
 *
 * Au règlement, l'encaissement suit la recette du paiement en ligne
 * (`lib/payment-gateway/checkout.ts`) : paiement créé PENDING, passé SUCCESS par
 * `updatePaymentStatusTx`, puis ventilé par `allocatePaymentTx`, le tout dans la
 * transaction du service de retour. Au rejet tardif, `updatePaymentStatusTx`
 * (FAILED) défait l'affectation et contre-passe au compte du locataire et en
 * trésorerie ; les quittances du paiement passent VOID.
 *
 * Aucune de ces fonctions ne reçoit ni ne lit d'IBAN.
 */

/** Source du mouvement de compte de tiers et clé du frais dans `RentalInstallmentItem.metadata`. */
export const REJECT_FEE_KIND = 'DIRECT_DEBIT_REJECT_FEE';

const RECEIPT_LOCK_OPTIONS = { maxWaitMs: 10_000, timeoutMs: 120_000 };

const errorNameOf = (error: unknown) => (error instanceof Error ? error.name : 'UnknownError');

/** Les services financiers attendent le client de transaction étendu du dépôt (garde multi-tenant comprise). */
const extended = (tx: Tx) => tx as unknown as PrismaTransactionClient;

export const idempotencyKeyOf = (lineId: string) => `direct-debit-line:${lineId}`;

function requireRentalLine(line: CollectorLine): { leaseId: string; installmentId: string } {
  if (!line.leaseId || !line.installmentId) {
    throw new ConflictError(t("Cette ligne de remise n'est liée à aucune échéance de loyer."));
  }
  return { leaseId: line.leaseId, installmentId: line.installmentId };
}

/** Quittance idempotente d'un encaissement : après le commit, jamais bloquante pour le constat. */
async function generateReceipt(
  tenantId: string,
  paymentId: string,
  installmentId: string,
  actorUserId: string | null
): Promise<void> {
  if (!actorUserId) {
    // Une quittance est enregistrée au nom d'un utilisateur : sans acteur, elle se génère à la main.
    logger.info('Prélèvement : quittance non générée (aucun utilisateur à l’origine du constat)', { tenantId });
    return;
  }
  await withExclusiveSection(
    `direct-debit-receipt:${tenantId}:${paymentId}`,
    async () => {
      // Entre le commit et ici, un rejet tardif a pu contre-passer l'encaissement : pas de quittance valide.
      const payment = await prisma.rentalPayment.findFirst({
        where: { id: paymentId, tenant_id: tenantId },
        select: { status: true }
      });
      if (payment?.status !== RentalPaymentStatus.SUCCESS) {
        logger.info('Prélèvement : quittance non générée (encaissement plus réussi)', { tenantId });
        return;
      }
      const existing = await prisma.rentalDocument.findFirst({
        where: {
          tenant_id: tenantId,
          type: RentalDocumentType.RENT_RECEIPT,
          status: RentalDocumentStatus.FINAL,
          payment_id: paymentId
        },
        select: { id: true }
      });
      if (existing) return;
      try {
        await generateDocument(
          tenantId,
          DocumentType.RENT_RECEIPT,
          paymentId,
          undefined,
          { installmentId },
          actorUserId
        );
      } catch (error) {
        // Typiquement : aucun modèle DOCX de quittance configuré. Le règlement, lui, est constaté.
        logger.warn('Prélèvement : quittance non générée', { tenantId, errorName: errorNameOf(error) });
      }
    },
    RECEIPT_LOCK_OPTIONS
  );
}

async function settleTx(
  tx: Tx,
  ctx: CollectorContext,
  line: CollectorLine,
  settledAt: Date
): ReturnType<DirectDebitCollector['settleTx']> {
  const { leaseId, installmentId } = requireRentalLine(line);
  const lease = await tx.rentalLease.findFirst({
    where: { id: leaseId, tenant_id: ctx.tenantId },
    select: { id: true, currency: true, primary_renter_client_id: true }
  });
  if (!lease) throw new NotFoundError(t('Bail introuvable.'));
  const installment = await tx.rentalInstallment.findFirst({
    where: { id: installmentId, tenant_id: ctx.tenantId, lease_id: leaseId },
    select: { id: true }
  });
  if (!installment) throw new NotFoundError(t('Échéance introuvable.'));

  const payment = await tx.rentalPayment.create({
    data: {
      tenant_id: ctx.tenantId,
      lease_id: lease.id,
      renter_client_id: lease.primary_renter_client_id,
      method: 'DIRECT_DEBIT',
      status: RentalPaymentStatus.PENDING,
      currency: lease.currency || 'FCFA',
      amount: new Decimal(line.amount),
      treasury_account_id: line.treasuryAccountId,
      idempotency_key: idempotencyKeyOf(line.id),
      // La référence d'opération, jamais `psp_transaction_id` (unique et réservé aux agrégateurs).
      psp_reference: line.reference,
      // `updatePaymentStatusTx` conserve cette date : le grand livre est daté de la valeur bancaire.
      succeeded_at: settledAt,
      created_by_user_id: ctx.actorUserId
    },
    select: { id: true }
  });

  await updatePaymentStatusTx(
    extended(tx),
    ctx.tenantId,
    payment.id,
    RentalPaymentStatus.SUCCESS,
    ctx.actorUserId ?? undefined
  );
  try {
    await allocatePaymentTx(
      extended(tx),
      ctx.tenantId,
      payment.id,
      { installmentIds: [installmentId], amounts: { [installmentId]: line.amount } },
      ctx.actorUserId ?? 'system'
    );
  } catch (error) {
    // Seules les erreurs applicatives disent « rien d'allouable » ; une panne de base ou un bogue remonte
    // (et fait échouer la transaction, plutôt que de la poursuivre dans un état douteux).
    if (!(error instanceof AppError)) throw error;
    // Rien d'allouable (échéance soldée entre-temps) : le montant reste en avance du locataire.
    logger.warn('Prélèvement : affectation impossible après règlement, montant conservé en avance', {
      tenantId: ctx.tenantId,
      errorName: errorNameOf(error)
    });
  }

  return {
    rentalPaymentId: payment.id,
    afterCommit: () => generateReceipt(ctx.tenantId, payment.id, installmentId, ctx.actorUserId)
  };
}

async function reverseTx(
  tx: Tx,
  ctx: CollectorContext,
  line: CollectorLine
): ReturnType<DirectDebitCollector['reverseTx']> {
  if (!line.rentalPaymentId) {
    // Une ligne réglée sans encaissement ne peut pas venir de ce flux : rien à contre-passer.
    logger.warn('Prélèvement : rejet tardif sans encaissement lié', { tenantId: ctx.tenantId });
    return {};
  }
  const payment = await tx.rentalPayment.findFirst({
    where: { id: line.rentalPaymentId, tenant_id: ctx.tenantId },
    select: { id: true, status: true }
  });
  if (!payment) throw new NotFoundError(t('Paiement introuvable'));

  if (payment.status === RentalPaymentStatus.SUCCESS) {
    await updatePaymentStatusTx(
      extended(tx),
      ctx.tenantId,
      payment.id,
      RentalPaymentStatus.FAILED,
      ctx.actorUserId ?? undefined
    );
  }
  // La quittance d'un encaissement contre-passé n'a plus de valeur.
  await tx.rentalDocument.updateMany({
    where: {
      tenant_id: ctx.tenantId,
      payment_id: payment.id,
      type: RentalDocumentType.RENT_RECEIPT,
      status: RentalDocumentStatus.FINAL
    },
    data: { status: RentalDocumentStatus.VOID }
  });
  return {};
}

async function applyRejectFeeTx(
  tx: Tx,
  ctx: CollectorContext,
  line: CollectorLine,
  fee: number
): ReturnType<DirectDebitCollector['applyRejectFeeTx']> {
  const amount = roundMoney(fee);
  if (!(amount > 0)) return { appliedAmount: 0 };
  const { leaseId, installmentId } = requireRentalLine(line);

  const installment = await tx.rentalInstallment.findFirst({
    where: { id: installmentId, tenant_id: ctx.tenantId, lease_id: leaseId },
    select: { id: true, status: true, currency: true, period_year: true, period_month: true }
  });
  if (!installment) throw new NotFoundError(t('Échéance introuvable.'));

  // Idempotent : un frais déjà ajouté pour cette ligne n'est pas compté deux fois.
  const items = await tx.rentalInstallmentItem.findMany({
    where: { tenant_id: ctx.tenantId, installment_id: installment.id, charge_type: 'OTHER' },
    select: { id: true, metadata: true }
  });
  const already = items.some(item => {
    const metadata = item.metadata as { kind?: unknown; lineId?: unknown } | null;
    return metadata?.kind === REJECT_FEE_KIND && metadata.lineId === line.id;
  });
  if (already) return { appliedAmount: amount };

  const label = t('Frais de rejet de prélèvement');
  await tx.rentalInstallmentItem.create({
    data: {
      tenant_id: ctx.tenantId,
      installment_id: installment.id,
      charge_type: 'OTHER',
      label,
      amount: new Decimal(amount),
      currency: installment.currency || 'FCFA',
      metadata: { kind: REJECT_FEE_KIND, lineId: line.id }
    }
  });
  await tx.rentalInstallment.updateMany({
    where: { id: installment.id, tenant_id: ctx.tenantId },
    data: { amount_other_fees: { increment: amount } }
  });

  // Une échéance encore brouillon n'est pas facturée : son futur mouvement `INSTALLMENT` porte déjà ce frais
  // (montant facturé = loyer + charges + autres frais), un mouvement en plus le compterait deux fois.
  if (installment.status !== 'DRAFT' && installment.status !== 'CANCELED') {
    const account = await compteLocataireDuBailTx(extended(tx), ctx.tenantId, leaseId);
    if (account) {
      await appendThirdPartyMovementTx(extended(tx), {
        accountId: account.accountId,
        tenantId: ctx.tenantId,
        type: 'ADJUSTMENT',
        billed: amount,
        label,
        sourceType: REJECT_FEE_KIND,
        sourceId: line.id,
        leaseId,
        movementDate: ctx.now
      });
    }
  }
  return { appliedAmount: amount };
}

/** Encaisseur des loyers (bail), data-model §8.6. */
export const rentalCollector: DirectDebitCollector = {
  scope: 'RENTAL_LEASE',
  keepsActiveKeyOnSettle: true,
  settleTx,
  reverseTx,
  applyRejectFeeTx
};
