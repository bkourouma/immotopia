// MONEY_PRECISION et roundMoney vivent desormais dans lib/finance/money.ts,
// partagees avec les futurs comptes de tiers (lot 1, decision D1). Re-exportees
// ici pour que les nombreux imports existants depuis finance-utils continuent
// de fonctionner sans modification, et reimportees pour l'usage local ci-dessous.
import { MONEY_PRECISION, roundMoney } from '../finance/money';
export { MONEY_PRECISION, roundMoney };

export function clampNonNegative(value: number): number {
  return value < 0 ? 0 : value;
}

export function computeOutstanding(chargeAmount: number, totalPaid: number): number {
  return roundMoney(clampNonNegative(chargeAmount - totalPaid));
}

export type ChargeCallStatusValue = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE';

/**
 * Statut effectif d'un appel de charges, calcule a la lecture.
 *
 * Le modele Prisma prevoit un statut `OVERDUE`, mais aucun code n'ecrit
 * jamais cette valeur en base (ni la creation, ni le paiement, ni une tache
 * planifiee) — voir docs/recette/SCENARIO_SYNDIC_MODULES.md, annexe #6 et
 * partie 8. Plutot que d'introduire une tache planifiee supplementaire (donc
 * un ecart entre la base et l'affichage tant qu'elle n'est pas repassee, et
 * un nouveau fichier `jobs/` partage avec d'autres lots en cours), le statut
 * « En retard » se derive au moment de la lecture : un appel non solde
 * (`PENDING`/`PARTIAL`) dont l'echeance est deja passee est toujours
 * effectivement en retard, sans ecriture. Un appel `PAID` ne peut jamais etre
 * en retard, quelle que soit sa date d'echeance.
 */
export function deriveChargeCallStatus(
  status: ChargeCallStatusValue,
  dueDate: Date | string,
  now: Date = new Date()
): ChargeCallStatusValue {
  if (status === 'PAID') {
    return status;
  }

  const due = dueDate instanceof Date ? dueDate : new Date(dueDate);
  if (due.getTime() < now.getTime()) {
    return 'OVERDUE';
  }

  return status;
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

/**
 * Taux mensuel maximal d'une penalite de retard (en %). Plafond de saisie : au-dela,
 * l'erreur de frappe est bien plus probable qu'une intention (BUG-053).
 */
export const MAX_MONTHLY_PENALTY_RATE = 10;

/**
 * Penalite de retard : le taux est MENSUEL et proratise au nombre de jours de
 * retard (mois de 30 jours) — reste du × taux % × jours / 30 — puis plafonnee
 * au reste du : une penalite ne depasse jamais la dette qu'elle sanctionne.
 * Au moins un jour de retard est compte. Exemple : 300 000 a 10 % pendant
 * 15 jours = 15 000.
 */
export function computeLatePenalty(outstanding: number, monthlyRatePercent: number, daysLate: number): number {
  const raw = roundMoney((outstanding * monthlyRatePercent * Math.max(daysLate, 1)) / 3000);
  return Math.min(raw, roundMoney(outstanding));
}
