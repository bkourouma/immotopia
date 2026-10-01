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
 * Ratios bancaires (spec 029, `computeBankRatios`) -- tous calcules avec la
 * **vacance des hypotheses appliquees** : loyers effectifs = loyers annuels x
 * (1 - vacance). Un ratio indeterminable vaut `{ value: null, reason }` (code,
 * jamais de texte) : jamais 0 ni une valeur inventee.
 *
 * - **DSCR** = (loyers effectifs - charges annuelles) / mensualites des 12
 *   prochains mois. Ratio brut (1.25 = 1,25x). Sans pret actif : null.
 * - **LTV** = capital restant du des prets actifs / valeur actuelle x 100.
 * - **Cash-on-cash** = (loyers effectifs - charges - mensualites 12 mois) /
 *   fonds propres x 100, fonds propres = cout de revient - capital initial des
 *   prets actifs (sans pret actif : le cout de revient).
 * - **TRI** (taux de rentabilite interne) du bien **avant financement** : les
 *   mensualites et le capital emprunte n'entrent pas dans les flux. Flux 0 =
 *   -cout de revient ; flux de l'annee k = loyer effectif projete - charges
 *   projetees ; a l'annee de l'horizon s'ajoute la valeur terminale (valeur
 *   projetee). Resolution numerique bornee (Newton + repli bissection sur
 *   [-0.99 ; 10], 200 iterations max) ; pas de changement de signe ou
 *   non-convergence : null / NOT_CONVERGENT. Resultat en points de %.
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
  /** Somme des capitaux restants dus des prets ACTIFS (ratios bancaires). */
  loanRemainingCapital?: number;
  /** Somme des `capitalAmount` des prets ACTIFS (fonds propres). */
  loanInitialCapital?: number;
  /** Au moins un pret actif. Absent : deduit de `loans` / `annualLoanPayments`. */
  hasActiveLoan?: boolean;
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

/**
 * Base du net-net projeté = le plus élevé du coût de revient et de la valeur
 * projetée. Le brut et le net se rapportent à la valeur projetée ; diviser le
 * net-net par le seul coût de revient (fixe) alors que la valeur a grandi
 * donnait un net-net supérieur au net (BUG-070 : 14,12 % contre 7,78 %). Avec
 * cette base, brut ≥ net ≥ net-net à tout horizon (charges et mensualités ≥ 0).
 */
function projectedNetNetBase(input: YieldInput, projectedValue: number): number {
  return Math.max(input.costBasis, projectedValue);
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
    netNetYield: known
      ? safePercent(annualRent - annualExpenses - loanPayments, projectedNetNetBase(input, value))
      : null,
    latentCapitalGain: known ? value - input.costBasis : null
  };
}

// ---------------------------------------------------------------------------
// Ratios bancaires
// ---------------------------------------------------------------------------

export type RatioReason =
  'NO_ACTIVE_LOAN' | 'NO_DEBT_SERVICE' | 'NO_VALUE' | 'NO_COST_BASIS' | 'NO_EQUITY' | 'NOT_CONVERGENT';

export interface RatioResult {
  value: number | null;
  reason: RatioReason | null;
}

export interface BankRatios {
  dscr: RatioResult;
  ltv: RatioResult;
  cashOnCash: RatioResult;
  irr: RatioResult;
}

export interface BankRatioAssumptions extends ProjectionAssumptions {
  years: number;
}

const fail = (reason: RatioReason): RatioResult => ({ value: null, reason });
/**
 * Garde-fou : un resultat non fini ne sort jamais comme valeur. Pour DSCR, LTV et
 * cash-on-cash c'est impossible avec des entrees finies (les diviseurs sont
 * verifies avant) ; la garde reste pour ne jamais exposer NaN/Infinity, avec
 * `NO_VALUE`. Seul le TRI passe `NOT_CONVERGENT` (resolution numerique).
 */
const ok = (value: number, nonFinite: RatioReason = 'NO_VALUE'): RatioResult =>
  Number.isFinite(value) ? { value, reason: null } : fail(nonFinite);

function activeLoan(input: YieldInput): boolean {
  if (typeof input.hasActiveLoan === 'boolean') return input.hasActiveLoan;
  return (input.loans?.length ?? 0) > 0 || input.annualLoanPayments > 0;
}

function effectiveRent(input: YieldInput, assumptions: ProjectionAssumptions): number {
  return input.annualRent * (1 - assumptions.vacancyRate);
}

export function debtServiceCoverageRatio(input: YieldInput, assumptions: ProjectionAssumptions): RatioResult {
  if (!activeLoan(input)) return fail('NO_ACTIVE_LOAN');
  // Pret actif mais aucune mensualite sur les 12 prochains mois (pret en fin d'echeance).
  if (!(input.annualLoanPayments > 0)) return fail('NO_DEBT_SERVICE');
  return ok((effectiveRent(input, assumptions) - input.annualExpenses) / input.annualLoanPayments);
}

export function loanToValue(input: YieldInput): RatioResult {
  if (!activeLoan(input) || typeof input.loanRemainingCapital !== 'number') return fail('NO_ACTIVE_LOAN');
  if (!(input.currentValue > 0)) return fail('NO_VALUE');
  return ok((input.loanRemainingCapital / input.currentValue) * 100);
}

export function cashOnCash(input: YieldInput, assumptions: ProjectionAssumptions): RatioResult {
  if (!hasCostBasis(input)) return fail('NO_COST_BASIS');
  const borrowed = activeLoan(input) ? (input.loanInitialCapital ?? 0) : 0;
  const equity = input.costBasis - borrowed;
  if (!(equity > 0)) return fail('NO_EQUITY');
  const cashFlow = effectiveRent(input, assumptions) - input.annualExpenses - input.annualLoanPayments;
  return ok((cashFlow / equity) * 100);
}

const IRR_LOWER = -0.99;
const IRR_UPPER = 10;
const IRR_MAX_ITERATIONS = 200;
const IRR_TOLERANCE = 1e-10;

function npv(flows: number[], rate: number): number {
  let total = 0;
  for (let k = 0; k < flows.length; k += 1) total += flows[k] / (1 + rate) ** k;
  return total;
}

function npvDerivative(flows: number[], rate: number): number {
  let total = 0;
  for (let k = 1; k < flows.length; k += 1) total -= (k * flows[k]) / (1 + rate) ** (k + 1);
  return total;
}

/**
 * Taux annuel (fraction) annulant la VAN, ou null : Newton borne, repli
 * bissection. Arret sur une VAN proche de zero (tolerance RELATIVE au flux
 * initial, pour des montants en XOF ~1e8) ou sur la largeur de l'intervalle.
 * Si plusieurs racines existent, la racine renvoyee est celle trouvee dans
 * l'intervalle borne [-0.99 ; 10].
 */
export function solveIrr(flows: number[]): number | null {
  if (flows.some(flow => !Number.isFinite(flow))) return null;
  let low = IRR_LOWER;
  let high = IRR_UPPER;
  const fLow = npv(flows, low);
  const fHigh = npv(flows, high);
  if (!Number.isFinite(fLow) || !Number.isFinite(fHigh)) return null;
  if (fLow === 0) return low;
  if (fHigh === 0) return high;
  if (Math.sign(fLow) === Math.sign(fHigh)) return null;

  const npvTolerance = IRR_TOLERANCE * Math.max(Math.abs(flows[0]), 1);
  let rate = (low + high) / 2;
  for (let i = 0; i < IRR_MAX_ITERATIONS; i += 1) {
    const value = npv(flows, rate);
    if (Math.abs(value) < npvTolerance) return rate;
    if (Math.sign(value) === Math.sign(fLow)) low = rate;
    else high = rate;
    if (high - low < IRR_TOLERANCE) return rate;
    const newton = rate - value / npvDerivative(flows, rate);
    // Newton seulement s'il reste strictement dans l'intervalle ; sinon bissection.
    rate = Number.isFinite(newton) && newton > low && newton < high ? newton : (low + high) / 2;
  }
  return null;
}

export function internalRateOfReturn(input: YieldInput, assumptions: BankRatioAssumptions): RatioResult {
  if (!hasCostBasis(input)) return fail('NO_COST_BASIS');
  if (!(input.currentValue > 0)) return fail('NO_VALUE');
  if (!Number.isInteger(assumptions.years) || assumptions.years < 1) return fail('NOT_CONVERGENT');

  const projection = projectYield(input, assumptions.years, assumptions);
  const flows = [-input.costBasis];
  let previousRent = 0;
  let previousExpenses = 0;
  for (const row of projection) {
    flows.push(row.cumulativeRent - previousRent - (row.cumulativeExpenses - previousExpenses));
    previousRent = row.cumulativeRent;
    previousExpenses = row.cumulativeExpenses;
  }
  flows[flows.length - 1] += projection[projection.length - 1].estimatedValue;

  const rate = solveIrr(flows);
  return rate === null ? fail('NOT_CONVERGENT') : ok(rate * 100, 'NOT_CONVERGENT');
}

export function computeBankRatios(input: YieldInput, assumptions: BankRatioAssumptions): BankRatios {
  return {
    dscr: debtServiceCoverageRatio(input, assumptions),
    ltv: loanToValue(input),
    cashOnCash: cashOnCash(input, assumptions),
    irr: internalRateOfReturn(input, assumptions)
  };
}
