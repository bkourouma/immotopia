import { ExpenseCategory, ManagementFeeBase, ManagementFeeMode } from '@prisma/client';
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
 * - **Honoraires** : ceux figés à l'encaissement (`ManagementFee`), selon les
 *   conditions du bail, du propriétaire ou de l'agence, TVA comprise. Ce
 *   module les additionne ; il ne les calcule pas.
 * - **Retenue à la source** (lot 10) : Σ `RentWithholding.amount` du
 *   propriétaire, sur les biens du relevé, collectée dans le mois — déduite
 *   du net.
 * - **Dépôt de garantie conservé** (lot 10) : mouvements `DEPOSIT_RETAINED`
 *   du compte tiers du propriétaire, dans le mois — ajouté au net.
 *
 * Net à reverser = encaissé − honoraires − TVA − dépenses − retenue à la
 * source + dépôts de garantie conservés.
 */

export const OWNER_STATEMENT_COMPUTATION_VERSION = 3;

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

/** Retenue à la source (lot 10) : une ligne `RentWithholding`, déjà rattachée à un bien du relevé. */
export interface StatementWithholdingInput {
  propertyId: string;
  amount: number;
}

/** Dépôt de garantie conservé (lot 10) : un mouvement `DEPOSIT_RETAINED`, rattaché à un bien via son bail. */
export interface StatementDepositRetainedInput {
  propertyId: string;
  amount: number;
}

/** Honoraires figés d'un encaissement — une ligne de `management_fees`. */
export interface StatementFeeInput {
  propertyId: string;
  feeAmount: number;
  vatAmount: number;
  mode: ManagementFeeMode;
  /** En pourcentage, en mode PERCENT. */
  rate: number | null;
  feeBase: ManagementFeeBase | null;
  vatRate: number | null;
}

export interface StatementComputationInput {
  periodStart: Date;
  periodEnd: Date;
  propertyIds: string[];
  installments: StatementInstallmentInput[];
  expenses: StatementExpenseInput[];
  /** Honoraires des encaissements du mois, sur les biens du relevé. */
  fees: StatementFeeInput[];
  /** Retenue à la source (lot 10) du propriétaire, sur les biens du relevé, dans le mois. */
  withholdings?: StatementWithholdingInput[];
  /** Dépôts de garantie conservés (lot 10) du propriétaire, dans le mois. */
  depositsRetained?: StatementDepositRetainedInput[];
  /**
   * Indivision (lot 4) : quote-part du propriétaire, en pourcentage, pour
   * chaque bien en indivision. Un bien absent appartient en entier au
   * propriétaire du relevé.
   */
  shareByProperty?: Map<string, number>;
}

export type ComputedItemType =
  'RENT_COLLECTED' | 'MANAGEMENT_FEE' | 'MANAGEMENT_FEE_VAT' | 'EXPENSE_DEDUCTED' | 'OTHER';

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
  /** Retenue à la source (lot 10), déduite du net. */
  totalWithholdingTax: number;
  /** Dépôts de garantie conservés (lot 10), ajoutés au net. */
  totalDepositRetained: number;
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

/** La valeur commune à toutes les lignes, ou `null` si elles divergent. */
function uniform<T>(values: T[]): T | null {
  if (values.length === 0) return null;
  return values.every(value => value === values[0]) ? values[0] : null;
}

function feeLabel(fees: StatementFeeInput[]): string {
  if (fees.every(fee => fee.mode === ManagementFeeMode.FIXED)) return 'Honoraires de gestion (forfait)';
  const rate = fees.every(fee => fee.mode === ManagementFeeMode.PERCENT) ? uniform(fees.map(fee => fee.rate)) : null;
  return rate === null ? 'Honoraires de gestion' : `Honoraires de gestion (${formatRate(rate)})`;
}

export function computeOwnerStatement(input: StatementComputationInput): StatementComputationResult {
  const { periodStart, periodEnd } = input;

  const items: ComputedStatementItem[] = [];
  let totalRentDue = 0;
  let totalRevenue = 0;
  let totalArrears = 0;
  let totalManagementFees = 0;
  let totalManagementFeesVat = 0;
  let totalExpenses = 0;
  let totalWithholdingTax = 0;
  let totalDepositRetained = 0;

  for (const propertyId of input.propertyIds) {
    const installments = input.installments.filter(inst => inst.propertyId === propertyId);

    let rentDue = 0;
    let collected = 0;
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
        }
      }

      if (inst.countsAsDue && inst.dueDate.getTime() <= periodEnd.getTime()) {
        arrears += Math.max(0, total - paidByPeriodEnd);
      }
    }

    // Quote-part de l'indivisaire : tout ce que le bien produit ou coûte ce
    // mois-ci se lit à sa part.
    const sharePercent = input.shareByProperty?.get(propertyId);
    const factor = sharePercent === undefined ? 1 : sharePercent / 100;
    const part = (value: number) => (factor === 1 ? roundMoney(value) : roundMoneyXof(value * factor));
    const suffix = sharePercent === undefined ? '' : ` (quote-part ${formatRate(Number(sharePercent.toFixed(4)))})`;

    collected = part(collected);
    rentDue = part(rentDue);
    arrears = part(arrears);
    const propertyFees = input.fees.filter(f => f.propertyId === propertyId);
    const fee = part(propertyFees.reduce((sum, f) => sum + f.feeAmount, 0));
    const vat = part(propertyFees.reduce((sum, f) => sum + f.vatAmount, 0));
    const vatRate = uniform(propertyFees.filter(f => f.vatAmount > 0).map(f => f.vatRate));

    if (collected > 0) {
      items.push({ propertyId, label: `Loyers encaissés${suffix}`, type: 'RENT_COLLECTED', amount: collected });
    }
    if (fee > 0) {
      items.push({
        propertyId,
        label: `${feeLabel(propertyFees)}${suffix}`,
        type: 'MANAGEMENT_FEE',
        amount: fee
      });
    }
    if (vat > 0) {
      items.push({
        propertyId,
        label: `${vatRate === null ? 'TVA sur honoraires' : `TVA sur honoraires (${formatRate(vatRate)})`}${suffix}`,
        type: 'MANAGEMENT_FEE_VAT',
        amount: vat
      });
    }

    for (const expense of input.expenses) {
      if (expense.propertyId !== propertyId) continue;
      // Une dépense saisie à la main en « frais de gestion » ferait double
      // emploi avec les honoraires calculés : elle n'est reprise que si le bien
      // n'en porte aucun ce mois-ci.
      if (fee > 0 && expense.category === ExpenseCategory.MANAGEMENT_FEES) continue;
      const amount = part(expense.amount);
      if (amount <= 0) continue;
      items.push({ propertyId, label: `${expense.label}${suffix}`, type: 'EXPENSE_DEDUCTED', amount });
      totalExpenses += amount;
    }

    // Lot 10 : retenue à la source et dépôts de garantie conservés, agrégés
    // par bien en amont (queries.ts), avant application de la quote-part.
    const withholding = part(
      (input.withholdings ?? []).filter(w => w.propertyId === propertyId).reduce((sum, w) => sum + w.amount, 0)
    );
    if (withholding > 0) {
      items.push({ propertyId, label: `Retenue à la source${suffix}`, type: 'OTHER', amount: withholding });
      totalWithholdingTax += withholding;
    }

    const depositRetained = part(
      (input.depositsRetained ?? []).filter(d => d.propertyId === propertyId).reduce((sum, d) => sum + d.amount, 0)
    );
    if (depositRetained > 0) {
      items.push({
        propertyId,
        label: `Dépôt de garantie conservé${suffix}`,
        type: 'OTHER',
        amount: depositRetained
      });
      totalDepositRetained += depositRetained;
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
  totalWithholdingTax = roundMoney(totalWithholdingTax);
  totalDepositRetained = roundMoney(totalDepositRetained);

  return {
    items,
    totalRentDue,
    totalRevenue,
    totalArrears,
    totalManagementFees,
    totalManagementFeesVat,
    totalExpenses,
    totalWithholdingTax,
    totalDepositRetained,
    netAmount: roundMoney(
      totalRevenue -
        totalManagementFees -
        totalManagementFeesVat -
        totalExpenses -
        totalWithholdingTax +
        totalDepositRetained
    ),
    // Figés avec le relevé quand ils sont uniformes ; `null` s'ils divergent
    // d'un bail à l'autre, ou s'il n'y a aucun honoraire.
    appliedFeeRate: input.fees.every(f => f.mode === ManagementFeeMode.PERCENT)
      ? uniform(input.fees.map(f => f.rate))
      : null,
    appliedFeeBase: uniform(input.fees.map(f => f.feeBase)),
    appliedVatRate: uniform(input.fees.filter(f => f.vatAmount > 0).map(f => f.vatRate))
  };
}
