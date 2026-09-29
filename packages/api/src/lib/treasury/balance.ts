import type { PrismaTransactionClient } from '../../utils/database';
import { badRequest } from '../errors';
import { roundMoney } from '../finance/money';

/**
 * Contrôle de solde d'un compte de trésorerie avant une SORTIE d'argent.
 *
 * Recette du 29 septembre 2026 (BUG-2026-09-29-003) : un virement depuis un
 * portefeuille Mobile Money vide était accepté (-20 000) et la caisse
 * principale a fini à -216 000 sans qu'aucun contrôle ne s'y oppose. Un compte
 * de caisse, de banque ou de Mobile Money ne peut pas être créditeur : on ne
 * sort pas de l'argent qu'on n'a pas.
 *
 * **Règle retenue : refus systématique.** Aucun paramètre d'agence n'autorise
 * le découvert (`TreasuryAccount` n'en porte pas) ; tant qu'il n'existe pas,
 * toute sortie qui rendrait le solde négatif est refusée (400), quelle que
 * soit la nature du compte.
 *
 * **Concurrence.** Deux sorties simultanées lisant chacune un solde suffisant
 * l'écraseraient ensemble. Le contrôle prend donc un verrou consultatif de
 * transaction, propre au compte du plan, avant de lire le solde : la seconde
 * transaction attend la fin de la première (verrou relâché au commit) et lit
 * alors un solde qui compte déjà la première sortie. Le verrou et la lecture
 * doivent donc se faire DANS la transaction qui poste l'écriture, jamais avant.
 *
 * Le solde est calculé comme celui affiché par l'écran Trésorerie : somme des
 * débits moins somme des crédits des lignes du compte du plan.
 */

const formatXof = (value: number) => `${roundMoney(value).toLocaleString('fr-FR')} FCFA`;

/** Solde courant (débit − crédit) du compte du plan d'un compte de trésorerie. */
export async function treasuryBalanceTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  chartOfAccountId: string
): Promise<number> {
  const sums = await tx.journalEntryLine.aggregate({
    where: { accountId: chartOfAccountId, account: { tenantId } },
    _sum: { debit: true, credit: true }
  });
  return roundMoney(Number(sums._sum.debit ?? 0) - Number(sums._sum.credit ?? 0));
}

/**
 * Refuse (400) une sortie de `amount` qui rendrait négatif le solde du compte.
 * À appeler dans la transaction d'écriture, juste avant de poster l'écriture.
 */
export async function assertTreasuryCanPayTx(
  tx: PrismaTransactionClient,
  tenantId: string,
  treasury: { chartOfAccountId: string; label: string },
  amount: number
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`treasury-balance:${treasury.chartOfAccountId}`}))`;
  const balance = await treasuryBalanceTx(tx, tenantId, treasury.chartOfAccountId);
  const requested = roundMoney(amount);
  if (roundMoney(balance - requested) < 0) {
    throw badRequest(
      `Solde insuffisant sur « ${treasury.label} » : ${formatXof(balance)} disponibles, ${formatXof(requested)} demandés. ` +
        `Approvisionnez d'abord ce compte (virement ou encaissement), ou choisissez un autre compte.`
    );
  }
}
