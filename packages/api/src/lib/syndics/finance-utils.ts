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

export function isJournalEntryBalanced(lines: Array<{ debit?: number | null; credit?: number | null }>): boolean {
  const totals = lines.reduce<{ debit: number; credit: number }>(
    (acc, line) => {
      acc.debit += Number(line.debit ?? 0);
      acc.credit += Number(line.credit ?? 0);
      return acc;
    },
    { debit: 0, credit: 0 }
  );

  return roundMoney(totals.debit) === roundMoney(totals.credit);
}
