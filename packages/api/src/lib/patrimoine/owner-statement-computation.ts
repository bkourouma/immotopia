import { ExpenseCategory, ManagementFeeBase } from '@prisma/client';
import { roundMoney, roundMoneyXof } from '../finance/money';

/**
 * Calcul d'un relevé de gérance, sans accès à la base.
 *
 * Remplace le calcul d'origine, qui prenait le loyer du CONTRAT de chaque bail
 * actif et l'étiquetait « Loyer collecté » : un locataire qui n'avait rien
 * payé apparaissait comme ayant payé, et aucune commission n'était déduite.
 *
 * Quatre montants par bien, chacun avec sa propre règle de date :
 *
 * - **Appelé** : échéances dont la date d'exigibilité tombe dans le mois.
 * - **Encaissé** : affectations de règlements RÉUSSIS dont la date de
 *   règlement tombe dans le mois, quelle que soit l'échéance soldée. Un arriéré
 *   de juin payé en septembre est un encaissement de septembre ; un loyer
 *   d'octobre payé d'avance aussi.
 * - **Impayé** : pour chaque échéance exigible au plus tard le dernier jour du
 *   mois, ce qui restait dû CE JOUR-LÀ. Un paiement saisi plus tard ne réécrit
 *   pas l'impayé d'un relevé passé.
 * - **Honoraires** : taux de l'agence appliqué à l'assiette encaissée, puis TVA
 *   si l'agence y est assujettie.
 *
 * Net à reverser = encaissé − honoraires − TVA − dépenses.
 */

export const OWNER_STATEMENT_COMPUTATION_VERSION = 2;

export interface StatementInstallmentInput {
  propertyId: string;
  dueDate: Date;
  /** Faux pour une échéance encore en brouillon, pas encore appelée. */
  countsAsDue: boolean;
  amountRent: number;
  amountService: number;
  amountOtherFees: number;
  penaltyAmount: number;
  /** Affectations de règlements au statut SUCCESS uniquement. */
  allocations: Array<{ amount: number; paidAt: Date }>;
}

export interface StatementExpenseInput {
  propertyId: string;
  label: string;
  amount: number;
  category: ExpenseCategory;
}

export interface StatementFeeSettings {
  /** En pourcentage ; `null` : non paramétré. */
  managementFeeRate: number | null;
  managementFeeBase: ManagementFeeBase;
  vatRegistered: boolean;
  /** En pourcentage. */
  vatRate: number;
}

export interface StatementComputationInput {
  periodStart: Date;
  periodEnd: Date;
  propertyIds: string[];
  installments: StatementInstallmentInput[];
  expenses: StatementExpenseInput[];
  settings: StatementFeeSettings;
}

export type ComputedItemType = 'RENT_COLLECTED' | 'MANAGEMENT_FEE' | 'MANAGEMENT_FEE_VAT' | 'EXPENSE_DEDUCTED';

export interface ComputedStatementItem {
  propertyId: string;
  label: string;
  type: ComputedItemType;
  amount: number;
}

export interface StatementComputationResult {
  items: ComputedStatementItem[];
  totalRentDue: number;
  totalRevenue: number;
  totalArrears: number;
  totalManagementFees: number;
  totalManagementFeesVat: number;
  totalExpenses: number;
  netAmount: number;
  /** Paramètres effectivement appliqués, figés avec le relevé. */
  appliedFeeRate: number | null;
  appliedFeeBase: ManagementFeeBase | null;
  appliedVatRate: number | null;
}

function installmentTotal(installment: StatementInstallmentInput): number {
  return installment.amountRent + installment.amountService + installment.amountOtherFees + installment.penaltyAmount;
}

function within(date: Date, start: Date, end: Date): boolean {
  const time = date.getTime();
  return time >= start.getTime() && time <= end.getTime();
}

/** « 10 % », « 12,5 % » : le taux tel qu'on le lit sur un relevé. */
function formatRate(rate: number): string {
  return `${String(rate).replace('.', ',')} %`;
}

export function computeOwnerStatement(input: StatementComputationInput): StatementComputationResult {
  const { periodStart, periodEnd, settings } = input;
  const feeRate = settings.managementFeeRate;
  const feesApply = feeRate !== null;
  const vatApplies = feesApply && settings.vatRegistered;

  const items: ComputedStatementItem[] = [];
  let totalRentDue = 0;
  let totalRevenue = 0;
  let totalArrears = 0;
  let totalManagementFees = 0;
  let totalManagementFeesVat = 0;
  let totalExpenses = 0;

  for (const propertyId of input.propertyIds) {
    const installments = input.installments.filter(inst => inst.propertyId === propertyId);

    let rentDue = 0;
    let collected = 0;
    let feeBase = 0;
    let arrears = 0;

    for (const inst of installments) {
      const total = installmentTotal(inst);

      if (inst.countsAsDue && within(inst.dueDate, periodStart, periodEnd)) {
        rentDue += total;
      }

      let paidByPeriodEnd = 0;
      for (const allocation of inst.allocations) {
        if (allocation.paidAt.getTime() <= periodEnd.getTime()) {
          paidByPeriodEnd += allocation.amount;
        }
        if (within(allocation.paidAt, periodStart, periodEnd)) {
          collected += allocation.amount;
          // Assiette « loyer seul » : la part loyer de l'échéance soldée, au
          // prorata. Un règlement de 50 000 sur une échéance de 90 000 loyer +
          // 10 000 charges porte 45 000 d'assiette.
          if (settings.managementFeeBase === ManagementFeeBase.ALL_COLLECTED) {
            feeBase += allocation.amount;
          } else if (total > 0) {
            feeBase += (allocation.amount * inst.amountRent) / total;
          }
        }
      }

      if (inst.countsAsDue && inst.dueDate.getTime() <= periodEnd.getTime()) {
        arrears += Math.max(0, total - paidByPeriodEnd);
      }
    }

    collected = roundMoney(collected);
    const fee = feesApply ? roundMoneyXof((feeBase * (feeRate as number)) / 100) : 0;
    const vat = vatApplies ? roundMoneyXof((fee * settings.vatRate) / 100) : 0;

    if (collected > 0) {
      items.push({ propertyId, label: 'Loyers encaissés', type: 'RENT_COLLECTED', amount: collected });
    }
    if (fee > 0) {
      items.push({
        propertyId,
        label: `Honoraires de gestion (${formatRate(feeRate as number)})`,
        type: 'MANAGEMENT_FEE',
        amount: fee
      });
    }
    if (vat > 0) {
      items.push({
        propertyId,
        label: `TVA sur honoraires (${formatRate(settings.vatRate)})`,
        type: 'MANAGEMENT_FEE_VAT',
        amount: vat
      });
    }

    for (const expense of input.expenses) {
      if (expense.propertyId !== propertyId) continue;
      // Une dépense saisie à la main en « frais de gestion » ferait double
      // emploi avec les honoraires calculés : elle n'est reprise que tant que
      // l'agence n'a pas paramétré son taux.
      if (feesApply && expense.category === ExpenseCategory.MANAGEMENT_FEES) continue;
      const amount = roundMoney(expense.amount);
      items.push({ propertyId, label: expense.label, type: 'EXPENSE_DEDUCTED', amount });
      totalExpenses += amount;
    }

    totalRentDue += rentDue;
    totalRevenue += collected;
    totalArrears += arrears;
    totalManagementFees += fee;
    totalManagementFeesVat += vat;
  }

  totalRentDue = roundMoney(totalRentDue);
  totalRevenue = roundMoney(totalRevenue);
  totalArrears = roundMoney(totalArrears);
  totalExpenses = roundMoney(totalExpenses);

  return {
    items,
    totalRentDue,
    totalRevenue,
    totalArrears,
    totalManagementFees,
    totalManagementFeesVat,
    totalExpenses,
    netAmount: roundMoney(totalRevenue - totalManagementFees - totalManagementFeesVat - totalExpenses),
    appliedFeeRate: feesApply ? (feeRate as number) : null,
    appliedFeeBase: feesApply ? settings.managementFeeBase : null,
    appliedVatRate: vatApplies ? settings.vatRate : null
  };
}
