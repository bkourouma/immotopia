import { buildInstallmentForPeriod, type LeaseForInstallmentBuilding } from '../finance/installment-builder';

/**
 * Plan de trésorerie prévisionnel (spec 030, lot A2) — calcul PUR.
 *
 * Aucun accès Prisma, aucun appel réseau, aucune lecture de l'horloge : la date
 * du jour (`today`) est injectée. Tout le calcul est mensuel, en UTC (il ne
 * dépend pas du fuseau du serveur) et en francs CFA. Le service
 * (`cash-plan-service.ts`) charge les données et les passe ici.
 *
 * Contrat : les types exportés ci-dessous sont ceux de la réponse de
 * `GET /tenants/:tenantId/patrimoine/cash-plan`.
 */

// ---------------------------------------------------------------------------
// Types du contrat (réponse)
// ---------------------------------------------------------------------------

export type CashPlanCategory = 'RENT' | 'RENT_ARREARS' | 'LOAN' | 'WORKS' | 'RECURRING_EXPENSE' | 'PROPERTY_TAX';
export type CashPlanSourceKind =
  'RENTAL_INSTALLMENT' | 'LEASE_SCHEDULE' | 'LOAN' | 'WORK_PROGRAM' | 'PROPERTY_EXPENSE' | 'TAX_ESTIMATE';

export interface CashPlanLine {
  id: string;
  month: string;
  category: CashPlanCategory;
  direction: 'IN' | 'OUT';
  amount: number;
  propertyId: string | null;
  propertyTitle: string | null;
  source: { kind: CashPlanSourceKind; id: string | null };
  indicative: boolean;
  note: 'DATE_PASSED_MOVED_TO_FIRST_MONTH' | 'REMAINING_AFTER_ACTUAL_COST' | null;
  label: string | null;
}

export interface CashPlanMonth {
  month: string;
  inflows: number;
  outflows: number;
  net: number;
  cumulative: number;
  byCategory: Record<CashPlanCategory, number>;
  lines: CashPlanLine[];
}

export type CashPlanSourceKey = 'RENT' | 'LOANS' | 'WORKS' | 'RECURRING_EXPENSES' | 'PROPERTY_TAX';
export type CashPlanSourceReason =
  | 'NO_ACTIVE_LEASE'
  | 'NO_ACTIVE_LOAN'
  | 'NO_PLANNED_WORK'
  | 'NO_RECURRING_EXPENSE'
  | 'TAX_DUE_DATE_NOT_SET'
  | 'NO_ELIGIBLE_PROPERTY'
  | 'TAX_NOT_ESTIMABLE'
  | 'TAX_COVERED_BY_RECURRING_EXPENSE'
  | 'TAX_NO_DUE_DATE_IN_WINDOW'
  /** Des enregistrements existent pour la source, mais aucun flux n'entre dans la fenêtre (dates passées, terminé, montant nul, devise écartée). */
  | 'NO_FLOW_IN_PERIOD';

export interface CashPlanSourceStatus {
  source: CashPlanSourceKey;
  status: 'INCLUDED' | 'NO_DATA' | 'NOT_CONFIGURED' | 'PARTIAL';
  reason: CashPlanSourceReason | null;
  count: number | null;
}

export interface CashPlanShortfall {
  firstMonth: string;
  firstMonthBalance: number;
  deepestMonth: string;
  depth: number;
}

export interface CashPlanData {
  currency: 'XOF';
  generatedAt: string;
  startMonth: string;
  months: 12 | 24;
  openingBalance: number;
  openingBalanceProvided: boolean;
  propertyId: string | null;
  scope: {
    propertyCount: number;
    excluded: Array<{ propertyId: string; title: string; reason: 'FOR_SALE' | 'SOLD' | 'ARCHIVED' | 'DRAFT' }>;
  };
  periods: CashPlanMonth[];
  totals: { inflows: number; outflows: number; net: number };
  shortfall: CashPlanShortfall | null;
  sources: CashPlanSourceStatus[];
  settings: { propertyTaxDueMonth: number | null; propertyTaxDueDay: number | null };
  warnings: Array<{ code: 'FOREIGN_CURRENCY_SKIPPED'; count: number }>;
}

// ---------------------------------------------------------------------------
// Entrées (déjà chargées par le service ; montants en nombres)
// ---------------------------------------------------------------------------

export interface CashPlanPropertyInput {
  id: string;
  title: string;
  /** `PropertyStatus` : DRAFT, SOLD, ARCHIVED excluent ; les autres retiennent. */
  status: string;
  /** `PropertyTransactionMode[]` : « en vente » = SALE sans RENTAL ni SHORT_TERM. */
  transactionModes: string[];
}

export interface CashPlanInstallmentInput {
  id: string;
  leaseId: string;
  propertyId: string;
  periodYear: number;
  periodMonth: number;
  dueDate: Date;
  /** `RentalInstallmentStatus`. */
  status: string;
  currency: string;
  amountRent: number;
  amountService: number;
  amountOtherFees: number;
  penaltyAmount: number;
  amountPaid: number;
}

export interface CashPlanLeaseInput {
  id: string;
  tenantId: string;
  propertyId: string;
  startDate: Date;
  endDate: Date | null;
  /** `RentalBillingFrequency`. */
  billingFrequency: 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';
  dueDayOfMonth: number;
  currency: string;
  rentAmount: number;
  serviceChargeAmount: number;
}

export interface CashPlanLoanInput {
  id: string;
  propertyId: string;
  lender: string;
  monthlyPayment: number;
  currency: string;
  startDate: Date;
  endDate: Date;
  /** `LoanStatus` : seuls les prêts ACTIVE entrent dans le plan. */
  status: string;
}

export interface CashPlanWorkInput {
  id: string;
  propertyId: string;
  title: string;
  estimatedCost: number;
  actualCost: number | null;
  currency: string;
  plannedDate: Date;
  /** `WorkProgramStatus` : PLANNED et IN_PROGRESS entrent dans le plan. */
  status: string;
}

export interface CashPlanExpenseInput {
  id: string;
  propertyId: string;
  /** `ExpenseCategory`. */
  category: string;
  label: string;
  amount: number;
  currency: string;
  paidAt: Date;
  recurrence: 'ONE_OFF' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  recurrenceEndDate: Date | null;
}

/** Estimation de la taxe foncière d'un bien pour une année, calculée par le service (moteur fiscal). */
export interface CashPlanTaxEstimateInput {
  propertyId: string;
  year: number;
  /** Total des taxes foncières applicables (parts de tous les détenteurs) ; 0 : rien d'estimable. */
  amount: number;
  allParametersValidated: boolean;
}

export interface CashPlanInput {
  today: Date;
  months: 12 | 24;
  openingBalance?: number | null;
  /** Filtre `propertyId` de la requête (restreint le plan à ce bien). */
  propertyId?: string | null;
  properties: CashPlanPropertyInput[];
  installments: CashPlanInstallmentInput[];
  leases: CashPlanLeaseInput[];
  loans: CashPlanLoanInput[];
  works: CashPlanWorkInput[];
  expenses: CashPlanExpenseInput[];
  settings: { propertyTaxDueMonth: number | null; propertyTaxDueDay: number | null };
  taxEstimates: CashPlanTaxEstimateInput[];
}

// ---------------------------------------------------------------------------
// Dates (UTC uniquement)
// ---------------------------------------------------------------------------

const CATEGORIES: CashPlanCategory[] = ['RENT', 'RENT_ARREARS', 'LOAN', 'WORKS', 'RECURRING_EXPENSE', 'PROPERTY_TAX'];
const EXCLUDED_STATUSES = ['DRAFT', 'SOLD', 'ARCHIVED'] as const;
const EXPENSE_STEP_MONTHS: Record<'MONTHLY' | 'QUARTERLY' | 'ANNUAL', number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  ANNUAL: 12
};

/** Index absolu d'un mois : année × 12 + mois (0-11), en UTC. */
function monthIndexOf(date: Date): number {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

function monthKey(index: number): string {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Date d'une occurrence mensuelle : le jour d'ancrage, ramené au dernier jour du
 * mois cible s'il n'y existe pas. Calculée depuis l'ancrage (k mois plus tard),
 * jamais en cumulé : le 31 janvier + 1 mois = 28 février, mais + 2 mois = 31 mars.
 */
function addMonthsClamped(anchor: Date, months: number): number {
  const target = monthIndexOf(anchor) + months;
  const year = Math.floor(target / 12);
  const month0 = target % 12;
  const day = Math.min(anchor.getUTCDate(), daysInMonth(year, month0));
  return Date.UTC(year, month0, day);
}

/** Même monnaie : « FCFA », « XOF » (et « CFA ») sont équivalents ; le reste n'est pas converti. */
function isXof(currency: string | null | undefined): boolean {
  const value = (currency ?? 'XOF').trim().toUpperCase();
  return value === 'XOF' || value === 'FCFA' || value === 'CFA';
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function roundUnit(cents: number): number {
  return Math.round(cents / 100);
}

// ---------------------------------------------------------------------------
// Fenêtre et classement des biens
// ---------------------------------------------------------------------------

interface PlanWindow {
  startIndex: number;
  months: number;
  /** Début de la journée de `today`, UTC. */
  todayStart: number;
  /** Premier instant après le dernier mois du plan. */
  endExclusive: number;
}

function buildWindow(today: Date, months: number): PlanWindow {
  const startIndex = monthIndexOf(today);
  const endIndex = startIndex + months;
  return {
    startIndex,
    months,
    todayStart: utcDay(today),
    endExclusive: Date.UTC(Math.floor(endIndex / 12), endIndex % 12, 1)
  };
}

function isForSale(modes: string[]): boolean {
  return modes.includes('SALE') && !modes.includes('RENTAL') && !modes.includes('SHORT_TERM');
}

type ExcludedReason = 'FOR_SALE' | 'SOLD' | 'ARCHIVED' | 'DRAFT';

export function classifyProperties(
  properties: CashPlanPropertyInput[],
  propertyId?: string | null
): {
  retained: CashPlanPropertyInput[];
  excluded: Array<{ propertyId: string; title: string; reason: ExcludedReason }>;
} {
  const retained: CashPlanPropertyInput[] = [];
  const excluded: Array<{ propertyId: string; title: string; reason: ExcludedReason }> = [];
  for (const property of properties) {
    if (propertyId && property.id !== propertyId) continue;
    const blocking = EXCLUDED_STATUSES.find(status => status === property.status);
    if (blocking) {
      excluded.push({ propertyId: property.id, title: property.title, reason: blocking });
    } else if (isForSale(property.transactionModes)) {
      excluded.push({ propertyId: property.id, title: property.title, reason: 'FOR_SALE' });
    } else {
      retained.push(property);
    }
  }
  return { retained, excluded };
}

// ---------------------------------------------------------------------------
// Taxe foncière : échéances et demandes d'estimation (utilisées par le service)
// ---------------------------------------------------------------------------

export interface TaxDueDate {
  year: number;
  /** Index absolu du mois (voir `monthKey`). */
  monthIndex: number;
  timestamp: number;
}

/** Échéances annuelles de la taxe foncière dans la fenêtre, à partir d'aujourd'hui. Vide si la date n'est pas renseignée. */
export function listTaxDueDates(
  settings: { propertyTaxDueMonth: number | null; propertyTaxDueDay: number | null },
  today: Date,
  months: number
): TaxDueDate[] {
  const { propertyTaxDueMonth: month, propertyTaxDueDay: day } = settings;
  if (month === null || day === null) return [];
  const win = buildWindow(today, months);
  const firstYear = Math.floor(win.startIndex / 12);
  const lastYear = Math.floor((win.startIndex + months - 1) / 12);
  const result: TaxDueDate[] = [];
  for (let year = firstYear; year <= lastYear; year += 1) {
    const timestamp = Date.UTC(year, month - 1, Math.min(day, daysInMonth(year, month - 1)));
    if (timestamp >= win.todayStart && timestamp < win.endExclusive) {
      result.push({ year, monthIndex: year * 12 + (month - 1), timestamp });
    }
  }
  return result;
}

/**
 * Biens couverts par une dépense périodique de catégorie taxe foncière (pas de doublon avec l'estimation) :
 * seulement si cette dépense produit au moins une occurrence en XOF, de montant > 0, dans la fenêtre.
 * Une dépense qui ne produit rien (terminée, devise étrangère, montant nul) ne couvre pas le bien.
 */
export function propertiesCoveredByTaxExpense(
  expenses: CashPlanExpenseInput[],
  today: Date,
  months: number
): Set<string> {
  const win = buildWindow(today, months);
  const covered = new Set<string>();
  for (const expense of expenses) {
    if (expense.category !== 'PROPERTY_TAX' || expense.recurrence === 'ONE_OFF') continue;
    if (!(expense.amount > 0) || !isXof(expense.currency)) continue;
    if (expenseOccurrences(expense, win).length > 0) covered.add(expense.propertyId);
  }
  return covered;
}

/** Couples (bien, année) dont le service doit demander une estimation ; vide sans date d'exigibilité. */
export function taxEstimateRequests(input: {
  today: Date;
  months: number;
  propertyId?: string | null;
  properties: CashPlanPropertyInput[];
  expenses: CashPlanExpenseInput[];
  settings: CashPlanInput['settings'];
}): Array<{ propertyId: string; year: number }> {
  const dueDates = listTaxDueDates(input.settings, input.today, input.months);
  if (dueDates.length === 0) return [];
  const covered = propertiesCoveredByTaxExpense(input.expenses, input.today, input.months);
  const { retained } = classifyProperties(input.properties, input.propertyId);
  const requests: Array<{ propertyId: string; year: number }> = [];
  for (const property of retained) {
    if (covered.has(property.id)) continue;
    for (const due of dueDates) requests.push({ propertyId: property.id, year: due.year });
  }
  return requests;
}

// ---------------------------------------------------------------------------
// Construction des lignes
// ---------------------------------------------------------------------------

/** Ligne interne : montant en centimes, mois en index absolu. */
interface RawLine extends Omit<CashPlanLine, 'amount' | 'month'> {
  cents: number;
  monthIndex: number;
}

interface Context {
  win: PlanWindow;
  titles: Map<string, string>;
  retainedIds: Set<string>;
  skippedForeign: number;
}

function placeIndex(ctx: Context, monthIndex: number): number | null {
  if (monthIndex >= ctx.win.startIndex + ctx.win.months) return null;
  return monthIndex;
}

function makeLine(
  ctx: Context,
  fields: {
    id: string;
    monthIndex: number;
    category: CashPlanCategory;
    direction: 'IN' | 'OUT';
    amount: number;
    propertyId: string;
    kind: CashPlanSourceKind;
    sourceId: string | null;
    indicative?: boolean;
    note?: CashPlanLine['note'];
    label?: string | null;
  }
): RawLine {
  return {
    id: fields.id,
    monthIndex: fields.monthIndex,
    category: fields.category,
    direction: fields.direction,
    cents: toCents(fields.amount),
    propertyId: fields.propertyId,
    propertyTitle: ctx.titles.get(fields.propertyId) ?? null,
    source: { kind: fields.kind, id: fields.sourceId },
    indicative: fields.indicative ?? false,
    note: fields.note ?? null,
    label: fields.label ?? null
  };
}

/**
 * Le builder d'échéances lit les dates avec des getters LOCAUX. On lui passe des
 * dates « calendaires locales » reconstruites depuis les composantes UTC pour
 * que le résultat ne dépende pas du fuseau du serveur.
 */
function localCalendarDate(date: Date): Date {
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function installmentRemaining(row: CashPlanInstallmentInput): number {
  return row.amountRent + row.amountService + row.amountOtherFees + row.penaltyAmount - row.amountPaid;
}

function buildRentLines(ctx: Context, input: CashPlanInput): RawLine[] {
  const lines: RawLine[] = [];
  const covered = new Set<string>();

  for (const row of input.installments) {
    if (!ctx.retainedIds.has(row.propertyId)) continue;
    covered.add(`${row.leaseId}:${row.periodYear}:${row.periodMonth}`);
    if (row.status === 'PAID' || row.status === 'CANCELED') continue;
    const remaining = installmentRemaining(row);
    if (!(remaining > 0)) continue;
    if (!isXof(row.currency)) {
      ctx.skippedForeign += 1;
      continue;
    }
    // Mois de la période (indépendant du fuseau), non de la date d'échéance.
    const dueIndex = row.periodYear * 12 + (row.periodMonth - 1);
    const arrears = dueIndex < ctx.win.startIndex;
    const monthIndex = arrears ? ctx.win.startIndex : dueIndex;
    if (placeIndex(ctx, monthIndex) === null) continue;
    lines.push(
      makeLine(ctx, {
        id: `RENTAL_INSTALLMENT:${row.id}`,
        monthIndex,
        category: arrears ? 'RENT_ARREARS' : 'RENT',
        direction: 'IN',
        amount: remaining,
        propertyId: row.propertyId,
        kind: 'RENTAL_INSTALLMENT',
        sourceId: row.id
      })
    );
  }

  for (const lease of input.leases) {
    if (!ctx.retainedIds.has(lease.propertyId) || !(lease.rentAmount > 0)) continue;
    if (!isXof(lease.currency)) {
      ctx.skippedForeign += 1;
      continue;
    }
    const builderLease = {
      id: lease.id,
      tenant_id: lease.tenantId,
      start_date: localCalendarDate(lease.startDate),
      end_date: lease.endDate ? localCalendarDate(lease.endDate) : null,
      billing_frequency: lease.billingFrequency,
      due_day_of_month: lease.dueDayOfMonth,
      currency: lease.currency,
      rent_amount: lease.rentAmount,
      service_charge_amount: lease.serviceChargeAmount
    } as unknown as LeaseForInstallmentBuilding;

    for (let i = 0; i < ctx.win.months; i += 1) {
      const monthIndex = ctx.win.startIndex + i;
      const year = Math.floor(monthIndex / 12);
      const month = (monthIndex % 12) + 1;
      if (covered.has(`${lease.id}:${year}:${month}`)) continue;
      const built = buildInstallmentForPeriod(builderLease, year, month);
      if (!built.included) continue;
      const amount = Number(built.data.amount_rent) + Number(built.data.amount_service);
      if (!(amount > 0)) continue;
      lines.push(
        makeLine(ctx, {
          id: `LEASE_SCHEDULE:${lease.id}:${monthKey(monthIndex)}`,
          monthIndex,
          category: 'RENT',
          direction: 'IN',
          amount,
          propertyId: lease.propertyId,
          kind: 'LEASE_SCHEDULE',
          sourceId: lease.id
        })
      );
    }
  }
  return lines;
}

function buildLoanLines(ctx: Context, input: CashPlanInput): RawLine[] {
  const lines: RawLine[] = [];
  for (const loan of input.loans) {
    if (loan.status !== 'ACTIVE' || !ctx.retainedIds.has(loan.propertyId) || !(loan.monthlyPayment > 0)) continue;
    if (!isXof(loan.currency)) {
      ctx.skippedForeign += 1;
      continue;
    }
    const lastMonthIndex = monthIndexOf(loan.endDate);
    // Première mensualité un mois après le début ; la dernière tombe au plus tard
    // dans le mois de `endDate` (jamais au-delà).
    // On saute directement au premier mois utile : une date de début très ancienne
    // ne doit pas faire parcourir des milliers de mois écoulés.
    const firstK = Math.max(1, ctx.win.startIndex - monthIndexOf(loan.startDate));
    for (let k = firstK; ; k += 1) {
      const date = addMonthsClamped(loan.startDate, k);
      const monthIndex = monthIndexOf(new Date(date));
      if (monthIndex > lastMonthIndex || date >= ctx.win.endExclusive) break;
      if (date < ctx.win.todayStart) continue;
      lines.push(
        makeLine(ctx, {
          id: `LOAN:${loan.id}:${monthKey(monthIndex)}`,
          monthIndex,
          category: 'LOAN',
          direction: 'OUT',
          amount: loan.monthlyPayment,
          propertyId: loan.propertyId,
          kind: 'LOAN',
          sourceId: loan.id,
          label: loan.lender
        })
      );
    }
  }
  return lines;
}

function buildWorkLines(ctx: Context, input: CashPlanInput): RawLine[] {
  const lines: RawLine[] = [];
  for (const work of input.works) {
    if (!['PLANNED', 'IN_PROGRESS'].includes(work.status) || !ctx.retainedIds.has(work.propertyId)) continue;
    if (!isXof(work.currency)) {
      ctx.skippedForeign += 1;
      continue;
    }
    let amount = work.estimatedCost;
    let note: CashPlanLine['note'] = null;
    if (work.status === 'IN_PROGRESS' && work.actualCost !== null) {
      amount = Math.max(0, work.estimatedCost - work.actualCost);
      note = 'REMAINING_AFTER_ACTUAL_COST';
    }
    if (!(amount > 0)) continue;
    let monthIndex = monthIndexOf(work.plannedDate);
    if (monthIndex < ctx.win.startIndex) {
      monthIndex = ctx.win.startIndex;
      // Les deux particularités peuvent coexister : la date dépassée prime sur l'affichage.
      note = 'DATE_PASSED_MOVED_TO_FIRST_MONTH';
    }
    if (placeIndex(ctx, monthIndex) === null) continue;
    lines.push(
      makeLine(ctx, {
        id: `WORK_PROGRAM:${work.id}`,
        monthIndex,
        category: 'WORKS',
        direction: 'OUT',
        amount,
        propertyId: work.propertyId,
        kind: 'WORK_PROGRAM',
        sourceId: work.id,
        note,
        label: work.title
      })
    );
  }
  return lines;
}

/** Dates (timestamps UTC) des occurrences d'une dépense périodique retenues dans la fenêtre : ≥ aujourd'hui, ≤ fin éventuelle. */
function expenseOccurrences(expense: CashPlanExpenseInput, win: PlanWindow): number[] {
  if (expense.recurrence === 'ONE_OFF') return [];
  const step = EXPENSE_STEP_MONTHS[expense.recurrence];
  const endDay = expense.recurrenceEndDate ? utcDay(expense.recurrenceEndDate) : null;
  const dates: number[] = [];
  // Saut direct au premier mois utile : jamais de parcours depuis une ancre très ancienne.
  const firstK = Math.max(0, Math.ceil((win.startIndex - monthIndexOf(expense.paidAt)) / step));
  for (let k = firstK; ; k += 1) {
    const date = addMonthsClamped(expense.paidAt, k * step);
    if (date >= win.endExclusive || (endDay !== null && date > endDay)) break;
    if (date >= win.todayStart) dates.push(date);
  }
  return dates;
}

function buildExpenseLines(ctx: Context, input: CashPlanInput): RawLine[] {
  const lines: RawLine[] = [];
  for (const expense of input.expenses) {
    if (expense.recurrence === 'ONE_OFF' || !ctx.retainedIds.has(expense.propertyId)) continue;
    if (!(expense.amount > 0)) continue;
    if (!isXof(expense.currency)) {
      ctx.skippedForeign += 1;
      continue;
    }
    for (const date of expenseOccurrences(expense, ctx.win)) {
      const monthIndex = monthIndexOf(new Date(date));
      lines.push(
        makeLine(ctx, {
          id: `PROPERTY_EXPENSE:${expense.id}:${monthKey(monthIndex)}`,
          monthIndex,
          category: 'RECURRING_EXPENSE',
          direction: 'OUT',
          amount: expense.amount,
          propertyId: expense.propertyId,
          kind: 'PROPERTY_EXPENSE',
          sourceId: expense.id,
          label: expense.label
        })
      );
    }
  }
  return lines;
}

interface TaxOutcome {
  lines: RawLine[];
  notEstimable: number;
  covered: number;
  /** Date d'exigibilité renseignée, mais aucune échéance dans la fenêtre (ex. échéance de ce mois déjà passée sur 12 mois). */
  noDueDateInWindow: boolean;
}

function buildTaxLines(ctx: Context, input: CashPlanInput, retained: CashPlanPropertyInput[]): TaxOutcome {
  const outcome: TaxOutcome = { lines: [], notEstimable: 0, covered: 0, noDueDateInWindow: false };
  const dueDates = listTaxDueDates(input.settings, input.today, ctx.win.months);
  if (dueDates.length === 0) {
    outcome.noDueDateInWindow = true;
    return outcome;
  }
  const covered = propertiesCoveredByTaxExpense(input.expenses, input.today, ctx.win.months);
  const estimates = new Map(input.taxEstimates.map(e => [`${e.propertyId}:${e.year}`, e]));

  for (const property of retained) {
    if (covered.has(property.id)) {
      outcome.covered += 1;
      continue;
    }
    let missing = false;
    for (const due of dueDates) {
      const estimate = estimates.get(`${property.id}:${due.year}`);
      if (!estimate || !(estimate.amount > 0)) {
        missing = true;
        continue;
      }
      outcome.lines.push(
        makeLine(ctx, {
          id: `TAX_ESTIMATE:${property.id}:${monthKey(due.monthIndex)}`,
          monthIndex: due.monthIndex,
          category: 'PROPERTY_TAX',
          direction: 'OUT',
          amount: estimate.amount,
          propertyId: property.id,
          kind: 'TAX_ESTIMATE',
          sourceId: null,
          indicative: !estimate.allParametersValidated
        })
      );
    }
    if (missing) outcome.notEstimable += 1;
  }
  return outcome;
}

// ---------------------------------------------------------------------------
// Sources déclarées
// ---------------------------------------------------------------------------

function simpleSource(
  source: CashPlanSourceKey,
  hasLines: boolean,
  hasRecords: boolean,
  noPropertyAtAll: boolean,
  emptyReason: CashPlanSourceReason
): CashPlanSourceStatus {
  if (hasLines) return { source, status: 'INCLUDED', reason: null, count: null };
  if (noPropertyAtAll) return { source, status: 'NO_DATA', reason: 'NO_ELIGIBLE_PROPERTY', count: null };
  // Des enregistrements existent mais rien n'entre dans le plan : « rien dans la période », pas « rien du tout ».
  return { source, status: 'NO_DATA', reason: hasRecords ? 'NO_FLOW_IN_PERIOD' : emptyReason, count: null };
}

function taxSource(
  configured: boolean,
  noPropertyAtAll: boolean,
  hasLines: boolean,
  outcome: TaxOutcome
): CashPlanSourceStatus {
  const source: CashPlanSourceKey = 'PROPERTY_TAX';
  if (!configured) return { source, status: 'NOT_CONFIGURED', reason: 'TAX_DUE_DATE_NOT_SET', count: null };
  if (noPropertyAtAll) return { source, status: 'NO_DATA', reason: 'NO_ELIGIBLE_PROPERTY', count: null };
  if (outcome.noDueDateInWindow) return { source, status: 'NO_DATA', reason: 'TAX_NO_DUE_DATE_IN_WINDOW', count: null };
  // Une seule raison par source : une taxe manquante au plan (non estimable) prime sur une taxe déjà portée
  // par une dépense périodique, qui, elle, figure dans le plan.
  const reason: CashPlanSourceReason | null =
    outcome.notEstimable > 0 ? 'TAX_NOT_ESTIMABLE' : outcome.covered > 0 ? 'TAX_COVERED_BY_RECURRING_EXPENSE' : null;
  const count = reason === 'TAX_NOT_ESTIMABLE' ? outcome.notEstimable : reason ? outcome.covered : null;
  if (hasLines) return { source, status: reason ? 'PARTIAL' : 'INCLUDED', reason, count };
  return { source, status: 'NO_DATA', reason, count };
}

// ---------------------------------------------------------------------------
// Assemblage
// ---------------------------------------------------------------------------

function emptyByCategory(): Record<CashPlanCategory, number> {
  return { RENT: 0, RENT_ARREARS: 0, LOAN: 0, WORKS: 0, RECURRING_EXPENSE: 0, PROPERTY_TAX: 0 };
}

function compareLines(a: RawLine, b: RawLine): number {
  const byCategory = CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category);
  if (byCategory !== 0) return byCategory;
  const byTitle = (a.propertyTitle ?? '').localeCompare(b.propertyTitle ?? '');
  return byTitle !== 0 ? byTitle : a.id.localeCompare(b.id);
}

function buildPeriods(win: PlanWindow, rawLines: RawLine[], openingBalance: number): CashPlanMonth[] {
  const periods: CashPlanMonth[] = [];
  let cumulative = openingBalance;
  for (let i = 0; i < win.months; i += 1) {
    const monthIndex = win.startIndex + i;
    const monthLines = rawLines.filter(line => line.monthIndex === monthIndex).sort(compareLines);
    const byCents = emptyByCategory();
    let inCents = 0;
    let outCents = 0;
    for (const line of monthLines) {
      byCents[line.category] += line.cents;
      if (line.direction === 'IN') inCents += line.cents;
      else outCents += line.cents;
    }
    const byCategory = emptyByCategory();
    for (const category of CATEGORIES) byCategory[category] = roundUnit(byCents[category]);
    const inflows = roundUnit(inCents);
    const outflows = roundUnit(outCents);
    const net = inflows - outflows;
    cumulative += net;
    periods.push({
      month: monthKey(monthIndex),
      inflows,
      outflows,
      net,
      cumulative,
      byCategory,
      lines: monthLines.map(({ cents, monthIndex: index, ...line }) => ({
        ...line,
        month: monthKey(index),
        amount: roundUnit(cents)
      }))
    });
  }
  return periods;
}

function detectShortfall(periods: CashPlanMonth[]): CashPlanShortfall | null {
  const negative = periods.filter(period => period.cumulative < 0);
  if (negative.length === 0) return null;
  const deepest = negative.reduce((low, period) => (period.cumulative < low.cumulative ? period : low));
  return {
    firstMonth: negative[0].month,
    firstMonthBalance: negative[0].cumulative,
    deepestMonth: deepest.month,
    depth: -deepest.cumulative
  };
}

export function buildCashPlan(input: CashPlanInput): CashPlanData {
  const win = buildWindow(input.today, input.months);
  const { retained, excluded } = classifyProperties(input.properties, input.propertyId);
  const ctx: Context = {
    win,
    titles: new Map(retained.map(property => [property.id, property.title])),
    retainedIds: new Set(retained.map(property => property.id)),
    skippedForeign: 0
  };

  const rent = buildRentLines(ctx, input);
  const loans = buildLoanLines(ctx, input);
  const works = buildWorkLines(ctx, input);
  const expenses = buildExpenseLines(ctx, input);
  const tax = buildTaxLines(ctx, input, retained);
  const rawLines = [...rent, ...loans, ...works, ...expenses, ...tax.lines];

  const openingBalanceProvided = typeof input.openingBalance === 'number' && Number.isFinite(input.openingBalance);
  const openingBalance = openingBalanceProvided ? Math.round(input.openingBalance as number) : 0;
  const periods = buildPeriods(win, rawLines, openingBalance);

  const totals = periods.reduce(
    (sum, period) => ({
      inflows: sum.inflows + period.inflows,
      outflows: sum.outflows + period.outflows,
      net: sum.net + period.net
    }),
    { inflows: 0, outflows: 0, net: 0 }
  );

  const noProperty = retained.length === 0;
  const configured = input.settings.propertyTaxDueMonth !== null && input.settings.propertyTaxDueDay !== null;

  return {
    currency: 'XOF',
    generatedAt: input.today.toISOString(),
    startMonth: monthKey(win.startIndex),
    months: input.months,
    openingBalance,
    openingBalanceProvided,
    propertyId: input.propertyId ?? null,
    scope: { propertyCount: retained.length, excluded },
    periods,
    totals,
    shortfall: detectShortfall(periods),
    sources: [
      simpleSource(
        'RENT',
        rent.length > 0,
        input.leases.some(item => ctx.retainedIds.has(item.propertyId)),
        noProperty,
        'NO_ACTIVE_LEASE'
      ),
      simpleSource(
        'LOANS',
        loans.length > 0,
        input.loans.some(item => item.status === 'ACTIVE' && ctx.retainedIds.has(item.propertyId)),
        noProperty,
        'NO_ACTIVE_LOAN'
      ),
      simpleSource(
        'WORKS',
        works.length > 0,
        input.works.some(
          item => ['PLANNED', 'IN_PROGRESS'].includes(item.status) && ctx.retainedIds.has(item.propertyId)
        ),
        noProperty,
        'NO_PLANNED_WORK'
      ),
      simpleSource(
        'RECURRING_EXPENSES',
        expenses.length > 0,
        input.expenses.some(item => item.recurrence !== 'ONE_OFF' && ctx.retainedIds.has(item.propertyId)),
        noProperty,
        'NO_RECURRING_EXPENSE'
      ),
      taxSource(configured, noProperty, tax.lines.length > 0, tax)
    ],
    settings: {
      propertyTaxDueMonth: input.settings.propertyTaxDueMonth,
      propertyTaxDueDay: input.settings.propertyTaxDueDay
    },
    warnings: ctx.skippedForeign > 0 ? [{ code: 'FOREIGN_CURRENCY_SKIPPED', count: ctx.skippedForeign }] : []
  };
}
