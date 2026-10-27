import { t } from '../../../i18n';
import { ConflictError } from '../../../middleware/error-middleware';
import type { PrismaTransactionClient } from '../../../utils/database';
import { recordLotPaymentTx } from '../../syndics/charge-allocation';
import { scheduleChargeDocumentDelivery } from '../../syndics/charge-receipt-delivery';
import { issueReceiptsForPaymentTx } from '../../syndics/charge-receipts';
import type { DirectDebitCollector } from './types';

/**
 * Encaisseur SYNDIC_LOT (spec 042 §9.3).
 *
 * - `settleTx` enregistre le règlement des appels de charges figés sur la ligne
 *   (`recordLotPaymentTx`, méthode et origine `DIRECT_DEBIT`, clé d'idempotence
 *   par ligne : un rejeu ne crée jamais deux encaissements), puis émet reçu et
 *   quittances (`issueReceiptsForPaymentTx`) dans LA MÊME transaction. Un seul
 *   `recordLotPaymentTx` par transaction. L'envoi des documents au
 *   copropriétaire part après le commit (`afterCommit`).
 * - L'erreur d'un exercice comptable clos (409) remonte telle quelle : le
 *   constat n'est pas enregistré.
 * - Aucune contre-passation d'un `ChargePayment` n'existe : `reverseTx` refuse.
 * - Aucun frais de rejet n'est refacturé en copropriété.
 */

export const syndicCollector: DirectDebitCollector = {
  scope: 'SYNDIC_LOT',
  // Le lot redevient prélevable pour ses appels suivants une fois la ligne réglée.
  keepsActiveKeyOnSettle: false,

  async settleTx(rawTx, ctx, line, settledAt) {
    if (!line.lotId || !line.syndicateId) {
      throw new ConflictError(t("Cette ligne n'est rattachée à aucun lot de copropriété."));
    }
    // Le contrat des encaisseurs type la transaction en `Prisma.TransactionClient` ; les services de
    // copropriété attendent le client étendu (garde d'agence) : c'est la même transaction.
    const tx = rawTx as unknown as PrismaTransactionClient;
    const recorded = await recordLotPaymentTx(tx, {
      tenantId: ctx.tenantId,
      syndicateId: line.syndicateId,
      lotId: line.lotId,
      amount: line.amount,
      paidAt: settledAt,
      method: 'DIRECT_DEBIT',
      reference: line.reference,
      chargeCallIds: line.chargeCallIds,
      actorUserId: ctx.actorUserId,
      idempotencyKey: `direct-debit-line:${line.id}`,
      origin: 'DIRECT_DEBIT'
    });
    const documents = await issueReceiptsForPaymentTx(tx, {
      tenantId: ctx.tenantId,
      syndicateId: line.syndicateId,
      lotId: line.lotId,
      paymentId: recorded.record.id,
      result: recorded.result,
      actorUserId: ctx.actorUserId
    });
    return {
      chargePaymentId: recorded.record.id,
      afterCommit: async () => scheduleChargeDocumentDelivery(ctx.tenantId, documents)
    };
  },

  async reverseTx() {
    throw new ConflictError(
      t(
        "Le rejet d'un prélèvement de charges déjà réglé n'est pas pris en charge : régularisez dans la comptabilité de la copropriété."
      )
    );
  },

  async applyRejectFeeTx() {
    return { appliedAmount: 0 };
  }
};
