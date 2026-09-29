/**
 * Échéancier mensuel d'une dette (lot 3, spec 025).
 *
 * Le calcul interne reste en flottant : l'arrondi à l'unité n'a lieu qu'à la
 * sortie (fin d'année ou `remainingAtMonth`), sinon les arrondis mensuels
 * s'accumulent sur 30 ans.
 */

import { roundMoneyXof } from '../../finance/money';

export interface AmortizationState {
  remaining: number;
}

export interface MonthResult {
  interest: number;
  principal: number;
  remaining: number;
}

/** Dette telle que l'échéancier la consomme : `monthsLeft` nul = pas d'échéance connue. */
export interface ScheduledLoan {
  remainingCapital: number;
  annualRatePercent: number;
  monthlyPayment: number;
  monthsLeft: number | null;
}

export interface LoanRuntime {
  remaining: number;
  monthsLeft: number | null;
}

/**
 * Un mois : intérêts sur le capital restant, le reste de la mensualité
 * rembourse le capital. Plancher zéro (une mensualité insuffisante ne fait pas
 * grossir la dette, elle est signalée à part) et jamais plus que le solde.
 */
export function amortizeMonth(
  state: AmortizationState,
  annualRatePercent: number,
  monthlyPayment: number
): MonthResult {
  const remaining = Math.max(0, state.remaining);
  const interest = (remaining * annualRatePercent) / 12 / 100;
  const principal = Math.min(remaining, Math.max(0, monthlyPayment - interest));
  return { interest, principal, remaining: remaining - principal };
}

/** Avance de `months` mois ; s'arrête au solde ou à l'échéance (capital éventuel conservé tel quel). */
export function advanceLoan(
  loan: LoanRuntime,
  annualRatePercent: number,
  monthlyPayment: number,
  months: number
): LoanRuntime {
  let remaining = loan.remaining;
  let monthsLeft = loan.monthsLeft;
  for (let month = 0; month < months; month += 1) {
    if (remaining <= 0 || (monthsLeft !== null && monthsLeft <= 0)) break;
    remaining = amortizeMonth({ remaining }, annualRatePercent, monthlyPayment).remaining;
    if (monthsLeft !== null) monthsLeft -= 1;
  }
  return { remaining, monthsLeft };
}

/** Capital restant dû après `months` mois, arrondi à l'unité. */
export function remainingAtMonth(loan: ScheduledLoan, months: number): number {
  const runtime = { remaining: loan.remainingCapital, monthsLeft: loan.monthsLeft };
  return roundMoneyXof(advanceLoan(runtime, loan.annualRatePercent, loan.monthlyPayment, months).remaining);
}

/** Mensualité qui ne couvre pas les intérêts du premier mois d'un capital restant. */
export function paymentTooLow(
  loan: Pick<ScheduledLoan, 'remainingCapital' | 'annualRatePercent' | 'monthlyPayment'>
): boolean {
  if (loan.remainingCapital <= 0) return false;
  const firstInterest = (loan.remainingCapital * loan.annualRatePercent) / 12 / 100;
  return loan.monthlyPayment <= firstInterest;
}

const MIN_MONTHLY_RATE = 1e-9;

/** Mensualité constante (annuité) ; taux nul : capital réparti également. Non arrondie, pour solder exactement. */
export function levelPayment(amount: number, annualRatePercent: number, termYears: number): number {
  const months = 12 * termYears;
  const monthlyRate = annualRatePercent / 12 / 100;
  // En dessous de 1e-9 par mois, 1 − (1 + r)^−n s'annule en flottant (résultat infini) : taux traité comme nul.
  if (monthlyRate < MIN_MONTHLY_RATE) return amount / months;
  return (amount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
}

/** Mois entiers de `today` à `endDate` ; `null` sans échéance, 0 si elle est passée. */
export function monthsUntil(endDate: Date | null, today: Date): number | null {
  if (endDate === null) return null;
  let months = (endDate.getUTCFullYear() - today.getUTCFullYear()) * 12 + (endDate.getUTCMonth() - today.getUTCMonth());
  if (endDate.getUTCDate() < today.getUTCDate()) months -= 1;
  return Math.max(0, months);
}
