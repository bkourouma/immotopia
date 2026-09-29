import type { InstallmentOverview } from '../types/tenant-portal-types';

/**
 * Vue d'une échéance pour le portail : `amount` est le reste dû (total moins
 * déjà payé), `totalAmount` le montant de l'échéance, `amountPaid` ce qui est
 * réglé.
 */
export function toInstallmentOverview(record: {
  id: string;
  period_year: number;
  period_month: number;
  due_date: Date;
  status: string;
  amount_rent: unknown;
  amount_service: unknown;
  amount_other_fees: unknown;
  penalty_amount?: unknown;
  amount_paid?: unknown;
}): InstallmentOverview {
  const totalAmount =
    Number(record.amount_rent) +
    Number(record.amount_service) +
    Number(record.amount_other_fees) +
    Number(record.penalty_amount || 0);
  const amountPaid = Number(record.amount_paid || 0);
  return {
    id: record.id,
    period: `${record.period_year}-${String(record.period_month).padStart(2, '0')}`,
    dueDate: record.due_date,
    amount: Math.max(totalAmount - amountPaid, 0),
    totalAmount,
    amountPaid,
    status: record.status
  };
}
