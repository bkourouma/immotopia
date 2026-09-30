/**
 * Règle unique et pure du statut d'une échéance de loyer à une date donnée.
 *
 * Machine d'états : DRAFT (générée, pas encore émise) -> DUE (« À payer »)
 * -> PARTIAL / PAID / OVERDUE. Une échéance dont la date est passée et qui
 * n'est pas soldée est OVERDUE, qu'elle ait été émise ou non : c'est le
 * retard qui compte, pas l'émission. Une échéance partiellement payée reste
 * PARTIAL (le solde en retard porte des pénalités, comme les autres).
 *
 * Utilisée par le job quotidien, le calcul des pénalités, le tableau de bord
 * et les listes, pour que l'écran ne dépende pas de l'exécution du job.
 */
import { RentalInstallmentStatus } from '@prisma/client';

export interface InstallmentForStatus {
  status: RentalInstallmentStatus;
  due_date: Date | string;
  amount_rent: unknown;
  amount_service: unknown;
  amount_other_fees: unknown;
  penalty_amount: unknown;
  amount_paid: unknown;
}

/** Minuit local du jour de `date` : une échéance est en retard dès le lendemain. */
export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * @param emitDraft - vrai : une échéance à venir non soldée passe « À payer »
 *   (émission) ; faux : un Brouillon à venir reste Brouillon.
 */
export function computeInstallmentStatus(
  installment: InstallmentForStatus,
  now: Date,
  opts: { emitDraft: boolean } = { emitDraft: false }
): RentalInstallmentStatus {
  if (installment.status === RentalInstallmentStatus.CANCELED) {
    return RentalInstallmentStatus.CANCELED;
  }

  const totalDue =
    Number(installment.amount_rent) +
    Number(installment.amount_service) +
    Number(installment.amount_other_fees) +
    Number(installment.penalty_amount);
  const paid = Number(installment.amount_paid);

  if (paid >= totalDue && totalDue > 0) {
    return RentalInstallmentStatus.PAID;
  }
  if (paid > 0) {
    return RentalInstallmentStatus.PARTIAL;
  }
  if (startOfDay(new Date(installment.due_date)) < startOfDay(now)) {
    return RentalInstallmentStatus.OVERDUE;
  }
  if (installment.status === RentalInstallmentStatus.DRAFT && !opts.emitDraft) {
    return RentalInstallmentStatus.DRAFT;
  }
  return RentalInstallmentStatus.DUE;
}

/**
 * Montant d'une échéance DÛ au relevé à la date `now` : zéro tant que
 * l'échéance n'est pas exigible (date d'échéance future), puis loyer + charges
 * + autres frais + pénalités. Règle unique du relevé DOCX, alignée sur le grand
 * livre (un mouvement de créance est daté de l'échéance ; le relevé du portail,
 * l'écran du compte et la balance clients ne comptent que les mouvements datés
 * au plus tard `now`).
 */
export function amountDueAt(
  installment: Pick<InstallmentForStatus, 'due_date' | 'amount_rent' | 'amount_service' | 'amount_other_fees'> & {
    penalty_amount?: unknown;
  },
  now: Date
): number {
  if (new Date(installment.due_date) > now) return 0;
  return (
    Number(installment.amount_rent) +
    Number(installment.amount_service) +
    Number(installment.amount_other_fees) +
    Number(installment.penalty_amount || 0)
  );
}
