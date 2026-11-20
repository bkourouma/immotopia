import { ExpenseCategory, ManagementFeeBase, ManagementFeeMode } from '@prisma/client';
import { roundMoney, roundMoneyXof } from '../finance/money';
import { Share, splitAmount } from '../ownership/split';

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
 *
 * **Version 4 (revue locative, H1).** Le relevé s'aligne sur le compte
 * propriétaire (`owner-account/sync.ts`) :
 *
 * - l'encaissé retire, par affectation, la part qui revient à l'agence (pénalités
 *   si elles lui sont attribuées, frais de rejet de prélèvement) : le net ne
 *   dépasse plus le solde du compte ;
 * - en indivision, la part du propriétaire se calcule PIÈCE PAR PIÈCE
 *   (`splitAmount` : affectation, ligne d'honoraires, ligne de TVA, dépense), avec
 *   le reste d'arrondi au dernier indivisaire, exactement comme le compte, et non
 *   plus sur la somme par bien (écart possible de 1 FCFA).
 */

export const OWNER_STATEMENT_COMPUTATION_VERSION = 4;

export interface StatementInstallmentInput {
  propertyId: string;
  dueDate: Date;
  /** Faux pour une échéance encore en brouillon, pas encore appelée. */
  countsAsDue: boolean;
  amountRent: number;
  amountService: number;
  amountOtherFees: number;
  penaltyAmount: number;
  /**
   * Affectations de règlements au statut SUCCESS uniquement. `agencyPart` : part
   * du montant affecté qui revient à l'agence (pénalités, frais de rejet de
   * prélèvement) ; elle n'entre ni dans l'encaissé ni dans le net du propriétaire.
   */
  allocations: Array<{ amount: number; paidAt: Date; agencyPart?: number }>;
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
  /** Retenue à la source (lot 10) du propriétaire, sur les biens du relevé, dans le mois. Déjà à sa quote-part. */
  withholdings?: StatementWithholdingInput[];
  /** Dépôts de garantie conservés (lot 10) du propriétaire, dans le mois. Déjà à sa quote-part. */
  depositsRetained?: StatementDepositRetainedInput[];
  /**
   * Indivision (lot 4) : quote-part du propriétaire, en pourcentage, pour
   * chaque bien en indivision. Un bien absent appartient en entier au
   * propriétaire du relevé.
   */
  shareByProperty?: Map<string, number>;
  /**
   * Indivision, pièce par pièce (v4) : pour chaque bien en indivision, le
   * propriétaire du relevé et TOUTES les quotes-parts du bien. Prioritaire sur
   * `shareByProperty`.
   */
  indivision?: Map<string, { ownerClientId: string; shares: Share[] }>;
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
    // Encaissé du propriétaire, calculé pièce par pièce (indivision, v4).
    let collectedOwn = 0;
    let arrears = 0;

    const indiv = input.indivision?.get(propertyId);
    /** Part du propriétaire dans UNE pièce : `splitAmount` en indivision, le tout sinon. */
    const piece = (value: number) =>
      indiv ? (splitAmount(roundMoney(value), indiv.shares).get(indiv.ownerClientId) ?? 0) : roundMoney(value);

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
          const ownerAmount = roundMoney(allocation.amount - (allocation.agencyPart ?? 0));
          collected += ownerAmount;
          collectedOwn += piece(ownerAmount);
        }
      }

      if (inst.countsAsDue && inst.dueDate.getTime() <= periodEnd.getTime()) {
        arrears += Math.max(0, total - paidByPeriodEnd);
      }
    }

    // Quote-part de l'indivisaire : tout ce que le bien produit ou coûte ce
    // mois-ci se lit à sa part.
    const sharePercent = indiv
      ? (indiv.shares.find(s => s.ownerClientId === indiv.ownerClientId)?.sharePercent ?? 0)
      : input.shareByProperty?.get(propertyId);
    const factor = sharePercent === undefined ? 1 : sharePercent / 100;
    const part = (value: number) => (factor === 1 ? roundMoney(value) : roundMoneyXof(value * factor));
    const suffix = sharePercent === undefined ? '' : ` (quote-part ${formatRate(Number(sharePercent.toFixed(4)))})`;

    collected = indiv ? roundMoney(collectedOwn) : part(collected);
    rentDue = part(rentDue);
    arrears = part(arrears);
    const propertyFees = input.fees.filter(f => f.propertyId === propertyId);
    const fee = indiv
      ? roundMoney(propertyFees.reduce((sum, f) => sum + piece(f.feeAmount), 0))
      : part(propertyFees.reduce((sum, f) => sum + f.feeAmount, 0));
    const vat = indiv
      ? roundMoney(propertyFees.reduce((sum, f) => sum + piece(f.vatAmount), 0))
      : part(propertyFees.reduce((sum, f) => sum + f.vatAmount, 0));
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
      const amount = indiv ? piece(expense.amount) : part(expense.amount);
      if (amount <= 0) continue;
      items.push({ propertyId, label: `${expense.label}${suffix}`, type: 'EXPENSE_DEDUCTED', amount });
      totalExpenses += amount;
    }

    // Lot 10 : retenue à la source et dépôts de garantie conservés, agrégés
    // par bien en amont (queries.ts). Ces lignes sont DÉJÀ celles de CE
    // propriétaire (la retenue est calculée sur sa quote-part du loyer, le dépôt
    // conservé est un mouvement de son compte) : ne pas leur réappliquer la
    // quote-part, ce qui la compterait deux fois.
    const ownShare = (value: number) => roundMoney(value);
    const withholding = ownShare(
      (input.withholdings ?? []).filter(w => w.propertyId === propertyId).reduce((sum, w) => sum + w.amount, 0)
    );
    if (withholding > 0) {
      items.push({ propertyId, label: `Retenue à la source${suffix}`, type: 'OTHER', amount: withholding });
      totalWithholdingTax += withholding;
    }

    const depositRetained = ownShare(
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
