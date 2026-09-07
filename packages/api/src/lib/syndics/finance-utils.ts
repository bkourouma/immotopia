export const MONEY_PRECISION = 2;

export function roundMoney(value: number): number {
  return Number(value.toFixed(MONEY_PRECISION));
}

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
