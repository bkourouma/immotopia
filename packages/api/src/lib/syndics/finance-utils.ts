// MONEY_PRECISION et roundMoney vivent desormais dans lib/finance/money.ts,
// partagees avec les futurs comptes de tiers (lot 1, decision D1). Re-exportees
// ici pour que les nombreux imports existants depuis finance-utils continuent
// de fonctionner sans modification, et reimportees pour l'usage local ci-dessous.
import { MONEY_PRECISION, roundMoney } from '../finance/money';
export { MONEY_PRECISION, roundMoney };

export function clampNonNegative(value: number): number {
  return value < 0 ? 0 : value;
}

export function computeChargeCallStatus(totalPaid: number, chargeAmount: number): 'PENDING' | 'PARTIAL' | 'PAID' {
  if (totalPaid <= 0) {
    return 'PENDING';
  }
  if (totalPaid < chargeAmount) {
    return 'PARTIAL';
  }
  return 'PAID';
}

export function computeOutstanding(chargeAmount: number, totalPaid: number): number {
  return roundMoney(clampNonNegative(chargeAmount - totalPaid));
}

export function allocateAmountByShares(totalAmount: number, shares: number, totalShares: number): number {
  if (totalShares <= 0) {
    return 0;
  }
  return roundMoney((totalAmount * shares) / totalShares);
}

/**
 * Une ecriture est equilibree si le total des debits egale le total des credits
 * — **sur les montants qui seront reellement stockes**.
 *
 * C'est la correction du defaut n°1 du §6.1 bis du plan. Le controle sommait
 * les valeurs brutes puis arrondissait les deux totaux, alors que
 * `createJournalEntryBySyndicate` arrondit chaque ligne au moment de
 * l'insertion. Deux demi-centimes au debit contre un centime au credit
 * passaient donc le controle (0,005 + 0,005 = 0,01) puis se stockaient
 * desequilibres (0,01 + 0,01 = 0,02 contre 0,01). Une ecriture acceptee
 * pouvait ainsi rendre la balance fausse, sans qu'aucune erreur ne le signale.
 *
 * Chaque ligne est donc arrondie **avant** d'entrer dans la somme, exactement
 * comme a l'ecriture. Le controle porte desormais sur les memes nombres que la
 * base : ce qui est accepte est equilibre, et ce qui est stocke l'est aussi.
 */
export function isJournalEntryBalanced(lines: Array<{ debit?: number | null; credit?: number | null }>): boolean {
  const totals = lines.reduce<{ debit: number; credit: number }>(
    (acc, line) => {
      acc.debit += roundMoney(Number(line.debit ?? 0));
      acc.credit += roundMoney(Number(line.credit ?? 0));
      return acc;
    },
    { debit: 0, credit: 0 }
  );

  // L'addition de valeurs deja arrondies peut encore trainer une trainee
  // binaire (0,1 + 0,2 = 0,30000000000000004) : on arrondit les totaux pour
  // comparer, sans que cela puisse rattraper un ecart d'un centime.
  return roundMoney(totals.debit) === roundMoney(totals.credit);
}
