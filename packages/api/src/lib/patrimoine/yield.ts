/**
 * Rendements d'un bien detenu (module Patrimoine).
 *
 * Definitions retenues (inchangees, seulement documentees ici) :
 *
 * - **Rendement brut** = loyers annuels / valeur actuelle estimee.
 * - **Rendement net** = (loyers annuels - charges annuelles) / valeur
 *   actuelle estimee.
 * - **Rendement net-net** = (loyers annuels - charges annuelles - mensualites
 *   de pret des 12 prochains mois) / cout de revient.
 * - **Plus-value latente** = valeur actuelle estimee - cout de revient.
 *
 * Les pourcentages sont exprimes en points (8.5 = 8,5 %).
 *
 * Le **cout de revient** (`costBasis`) = cout d'acquisition + depenses
 * capitalisees. Tant qu'aucun cout d'acquisition n'est connu, il vaut 0 et
 * signifie « inconnu » : le net-net et la plus-value latente sont alors `null`
 * plutot qu'un chiffre trompeur (une plus-value egale a toute la valeur du
 * bien, un rendement divise par zero ramene a 0).
 */

export type RentBillingFrequency = 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';

const PERIODS_PER_YEAR: Record<RentBillingFrequency, number> = {
  MONTHLY: 12,
  QUARTERLY: 4,
  SEMIANNUAL: 2,
  ANNUAL: 1
};

/**
 * Loyer annualise d'un bail : `rent_amount` est le montant d'UNE periode de
 * facturation. Une periodicite absente ou inconnue est traitee comme mensuelle,
 * valeur par defaut du modele `RentalLease`.
 */
export function annualizeRent(rentAmount: number, billingFrequency: RentBillingFrequency | string | null | undefined) {
  const periods = PERIODS_PER_YEAR[(billingFrequency ?? 'MONTHLY') as RentBillingFrequency] ?? 12;
  return rentAmount * periods;
}

/** Echeancier simplifie d'un pret : mensualite et nombre de mensualites restantes. */
export interface LoanSchedule {
  monthlyPayment: number;
  remainingMonths: number;
}

/**
 * Nombre de mensualites restant a payer a partir de `now`.
 *
 * La date de fin du pret fait foi ; faute de date exploitable, la duree est
 * deduite du capital restant et de la mensualite (borne haute : les interets
 * sont ignores, la duree reelle est au moins celle-ci).
 */
export function remainingLoanMonths(
  loan: { endDate?: Date | string | null; remainingCapital?: number; monthlyPayment: number },
  now: Date = new Date()
): number {
  const end = loan.endDate ? new Date(loan.endDate) : null;
  if (end && !Number.isNaN(end.getTime())) {
    if (end.getTime() <= now.getTime()) return 0;
    const months =
      (end.getUTCFullYear() - now.getUTCFullYear()) * 12 +
      (end.getUTCMonth() - now.getUTCMonth()) -
      (end.getUTCDate() < now.getUTCDate() ? 1 : 0);
    return Math.max(0, months);
  }
  if (loan.monthlyPayment > 0 && typeof loan.remainingCapital === 'number' && loan.remainingCapital > 0) {
    return Math.ceil(loan.remainingCapital / loan.monthlyPayment);
  }
  return 0;
}

export interface YieldInput {
  /** Somme des loyers annualises de tous les baux actifs du bien. */
  annualRent: number;
  /** Derniere valeur estimee (0 si aucune valorisation). */
  currentValue: number;
  /** Cout d'acquisition + depenses capitalisees ; 0 = inconnu. */
  costBasis: number;
  /** Depenses non capitalisees payees sur les 12 derniers mois glissants. */
  annualExpenses: number;
  /** Mensualites dues sur les 12 prochains mois (prets termines exclus). */
  annualLoanPayments: number;
  /**
   * Echeanciers des prets actifs. Absent : `annualLoanPayments` est repete
   * chaque annee de la projection.
   */
  loans?: LoanSchedule[];
}

export interface YieldProjection {
  year: number;
  estimatedValue: number;
  cumulativeRent: number;
  cumulativeExpenses: number;
  cumulativeLoanPayments: number;
  netResult: number;
}

export interface YieldProjectedSummary {
  year: number;
  grossYield: number;
  netYield: number;
  netNetYield: number | null;
  latentCapitalGain: number | null;
}

export interface ProjectionAssumptions {
  valueGrowthRate: number;
  rentGrowthRate: number;
  expenseGrowthRate: number;
  vacancyRate: number;
}

function safePercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return (numerator / denominator) * 100;
}

function hasCostBasis(input: YieldInput): boolean {
  return Number.isFinite(input.costBasis) && input.costBasis > 0;
}

/**
 * Mensualites dues pendant l'annee `year` de la projection (1 = les 12
 * prochains mois) : un pret cesse d'etre deduit apres sa derniere mensualite.
 */
export function loanPaymentsForYear(input: YieldInput, year: number): number {
  if (!input.loans) return input.annualLoanPayments;
  const monthsBefore = (year - 1) * 12;
  return input.loans.reduce((sum, loan) => {
    const monthsInYear = Math.min(12, Math.max(0, loan.remainingMonths - monthsBefore));
    return sum + loan.monthlyPayment * monthsInYear;
  }, 0);
}

export function grossYield(input: YieldInput): number {
  return safePercent(input.annualRent, input.currentValue);
}

export function netYield(input: YieldInput): number {
  return safePercent(input.annualRent - input.annualExpenses, input.currentValue);
}

export function netNetYield(input: YieldInput): number | null {
  if (!hasCostBasis(input)) return null;
  return safePercent(input.annualRent - input.annualExpenses - input.annualLoanPayments, input.costBasis);
}

export function latentCapitalGain(input: YieldInput): number | null {
  if (!hasCostBasis(input)) return null;
  return input.currentValue - input.costBasis;
}

export function projectYield(input: YieldInput, years: number, assumptions: ProjectionAssumptions): YieldProjection[] {
  const projections: YieldProjection[] = [];
  let value = input.currentValue;
  let annualRent = input.annualRent;
  let annualExpenses = input.annualExpenses;
  let cumulativeRent = 0;
  let cumulativeExpenses = 0;
  let cumulativeLoanPayments = 0;

  for (let year = 1; year <= years; year += 1) {
    value *= 1 + assumptions.valueGrowthRate;
    annualRent *= 1 + assumptions.rentGrowthRate;
    annualExpenses *= 1 + assumptions.expenseGrowthRate;

    const effectiveRent = annualRent * (1 - assumptions.vacancyRate);
    cumulativeRent += effectiveRent;
    cumulativeExpenses += annualExpenses;
    cumulativeLoanPayments += loanPaymentsForYear(input, year);

    projections.push({
      year,
      estimatedValue: value,
      cumulativeRent,
      cumulativeExpenses,
      cumulativeLoanPayments,
      netResult: cumulativeRent - cumulativeExpenses - cumulativeLoanPayments
    });
  }

  return projections;
}

export function projectedYieldAtHorizon(
  input: YieldInput,
  years: number,
  assumptions: ProjectionAssumptions
): YieldProjectedSummary {
  const value = input.currentValue * (1 + assumptions.valueGrowthRate) ** years;
  const annualRent = input.annualRent * (1 + assumptions.rentGrowthRate) ** years * (1 - assumptions.vacancyRate);
  const annualExpenses = input.annualExpenses * (1 + assumptions.expenseGrowthRate) ** years;
  const loanPayments = loanPaymentsForYear(input, years);
  const known = hasCostBasis(input);

  return {
    year: years,
    grossYield: safePercent(annualRent, value),
    netYield: safePercent(annualRent - annualExpenses, value),
    netNetYield: known ? safePercent(annualRent - annualExpenses - loanPayments, input.costBasis) : null,
    latentCapitalGain: known ? value - input.costBasis : null
  };
}
