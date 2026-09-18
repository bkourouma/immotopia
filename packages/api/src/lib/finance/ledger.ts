/**
 * Grand livre a solde courant, partage entre la copropriete (`OwnerAccount`)
 * et les futurs comptes de tiers du lot 1 (`ThirdPartyAccount`).
 *
 * Extrait de `lib/syndics/queries.ts` (decision D1 du plan de mise en
 * oeuvre) : le calcul de `balanceAfter` existait deja, enfoui dans la
 * comptabilite de copropriete. Le lot 1 en a besoin pour le compte de tiers
 * locataire, sans dupliquer ce calcul ni migrer la table `OwnerAccount`. Ce
 * fichier est un refactoring a comportement identique : aucune regle n'y est
 * corrigee, y compris les defauts connus (voir `docs/finance/PLAN-mise-en-oeuvre.md`
 * §6.1 bis), qui seront traites au lot 2 en meme temps que leurs tests.
 */

import type { PrismaTransactionClient } from '../../utils/database';
import { roundMoney } from './money';

export type OwnerAccountTxClient = PrismaTransactionClient;

/**
 * Un client de transaction Prisma restreint aux tests (voir les mocks de
 * caracterisation) peut ne pas exposer les modeles du compte de lot : on le
 * detecte plutot que de laisser echouer un appel Prisma sur un modele absent.
 */
export function supportsOwnerAccount(tx: any): tx is OwnerAccountTxClient {
  return Boolean(tx?.ownerAccount && tx?.ownerAccountTransaction && tx?.syndicateLot);
}

export interface LedgerMovementComputation {
  debit: number;
  credit: number;
  balanceAfter: number;
}

/**
 * Calcule le solde apres mouvement, sans Prisma ni effet de bord.
 *
 * Reproduit exactement le calcul historique (meme arrondis, meme ordre) :
 * chaque grandeur est arrondie au centime avant d'entrer dans l'addition, un
 * debit augmente le solde, un credit le diminue. Ce sens est verifie par les
 * tests de caracterisation et n'est pas negociable ici — la generalisation du
 * lot 2 pourra le faire evoluer, pas ce refactoring.
 */
export function computeBalanceAfterMovement(
  currentBalance: number,
  debit: number | undefined | null,
  credit: number | undefined | null
): LedgerMovementComputation {
  const roundedDebit = roundMoney(debit ?? 0);
  const roundedCredit = roundMoney(credit ?? 0);
  const roundedCurrentBalance = roundMoney(Number(currentBalance ?? 0));
  const balanceAfter = roundMoney(roundedCurrentBalance + roundedDebit - roundedCredit);

  return { debit: roundedDebit, credit: roundedCredit, balanceAfter };
}

/**
 * Ajoute un mouvement au grand livre d'un compte de lot et met a jour son
 * solde courant, dans la meme transaction Prisma que l'appelant.
 *
 * Tolerances conservees a l'identique (defauts connus, non corriges ici) :
 * - renvoie `null` si `tx` n'expose pas les modeles necessaires ;
 * - renvoie `null` si le compte est introuvable (recharge par id, pas
 *   reutilise depuis l'appelant, au cas ou il aurait disparu entre-temps) ;
 * - un montant nul laisse `debit`/`credit` a `undefined` plutot qu'a 0.
 */
export async function appendOwnerAccountTransactionTx(
  tx: OwnerAccountTxClient,
  params: {
    accountId: string;
    type: 'CHARGE_CALL' | 'PAYMENT' | 'PENALTY' | 'WAIVER' | 'ADJUSTMENT' | 'FUND_TRANSFER';
    debit?: number;
    credit?: number;
    label: string;
    reference?: string | null;
    sourceId?: string | null;
    transactionDate?: Date;
  }
) {
  if (!supportsOwnerAccount(tx)) {
    return null;
  }

  const account = await tx.ownerAccount.findUnique({
    where: { id: params.accountId },
    select: { id: true, balance: true }
  });

  if (!account) {
    return null;
  }

  const { debit, credit, balanceAfter } = computeBalanceAfterMovement(
    Number(account.balance ?? 0),
    params.debit,
    params.credit
  );

  const transaction = await tx.ownerAccountTransaction.create({
    data: {
      accountId: params.accountId,
      transactionDate: params.transactionDate ?? new Date(),
      type: params.type as any,
      debit: debit > 0 ? debit : undefined,
      credit: credit > 0 ? credit : undefined,
      balanceAfter,
      label: params.label,
      reference: params.reference ?? undefined,
      sourceId: params.sourceId ?? undefined
    }
  });

  await tx.ownerAccount.update({
    where: { id: params.accountId },
    data: { balance: balanceAfter }
  });

  return transaction;
}
