import { roundMoney, roundMoneyXof } from '../finance/money';

/**
 * Parts d'un montant affecté à une échéance qui reviennent à l'agence et non au
 * propriétaire. Source unique : le compte propriétaire (`sync.ts`) ET le relevé
 * (`patrimoine/queries.ts`) les retirent avec ces mêmes fonctions, pour que le
 * net du relevé ne dépasse jamais le solde du compte.
 */

/** Part des pénalités dans un montant affecté à une échéance, au prorata. */
export function penaltyPart(
  amount: number,
  installment: { amount_rent: unknown; amount_service: unknown; amount_other_fees: unknown; penalty_amount: unknown }
) {
  const penalty = Number(installment.penalty_amount ?? 0);
  if (penalty <= 0) return 0;
  const total =
    Number(installment.amount_rent) +
    Number(installment.amount_service ?? 0) +
    Number(installment.amount_other_fees ?? 0) +
    penalty;
  return total > 0 ? roundMoneyXof((amount * penalty) / total) : 0;
}

/** Nature d'un article d'échéance qui porte des frais de rejet de prélèvement refacturés (spec 042, P3). */
export const DIRECT_DEBIT_REJECT_FEE_KIND = 'DIRECT_DEBIT_REJECT_FEE';

/**
 * Part des frais de rejet de prélèvement dans un montant affecté à une
 * échéance, au prorata (comme les pénalités). Ces frais remboursent l'agence qui
 * a supporté les frais bancaires : ils sont exclus des sommes dues au propriétaire.
 */
export function rejectFeePart(
  amount: number,
  installment: {
    amount_rent: unknown;
    amount_service: unknown;
    amount_other_fees: unknown;
    penalty_amount: unknown;
    items?: Array<{ amount: unknown; metadata: unknown }>;
  }
) {
  const fee = (installment.items ?? []).reduce((sum, item) => {
    const kind = (item.metadata as { kind?: unknown } | null)?.kind;
    return kind === DIRECT_DEBIT_REJECT_FEE_KIND ? sum + Number(item.amount ?? 0) : sum;
  }, 0);
  if (fee <= 0) return 0;
  const total =
    Number(installment.amount_rent) +
    Number(installment.amount_service ?? 0) +
    Number(installment.amount_other_fees ?? 0) +
    Number(installment.penalty_amount ?? 0);
  return total > 0 ? Math.min(roundMoneyXof((amount * fee) / total), roundMoney(amount)) : 0;
}

/**
 * Part de l'agence dans UN montant affecté : pénalités (si elles lui reviennent)
 * plus frais de rejet. Même arrondi que le compte propriétaire.
 */
export function agencyPartOfAllocation(
  amount: number,
  installment: Parameters<typeof rejectFeePart>[1],
  penaltyToAgency: boolean
) {
  const full = roundMoney(amount);
  const agencyPenalty = penaltyToAgency ? penaltyPart(full, installment) : 0;
  const agencyRejectFee = rejectFeePart(full, installment);
  return roundMoney(agencyPenalty + agencyRejectFee);
}
