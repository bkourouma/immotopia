import type { PrismaTransactionClient } from '../../utils/database';

/**
 * Verrou commun aux deux flux qui s'excluent sur un même lot (spec 047, cas limite 9, R15) :
 * la création d'une déclaration de paiement mobile money et le démarrage d'un paiement en ligne.
 *
 * Chacun prend ce verrou dans sa transaction, PUIS relit l'état de l'autre flux : le second à
 * arriver voit donc le premier validé (lecture après verrou) et se refuse. Libéré au COMMIT.
 * Les verrous de plusieurs lots se prennent dans l'ordre trié, pour éviter tout interblocage.
 */
export async function lockLotPayment(tx: PrismaTransactionClient, lotIds: string[]): Promise<void> {
  for (const lotId of [...new Set(lotIds)].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`syndic-lot-payment:${lotId}`}, 0))`;
  }
}
