/**
 * Plan de trésorerie prévisionnel (spec 030) — contrat de
 * `GET /tenants/:tenantId/patrimoine/cash-plan`.
 *
 * Les raisons, notes et sources arrivent en CODES machine : l'écran les
 * traduit (`components/patrimoine/cash-plan/cash-plan-labels.ts`).
 */

export const CASH_PLAN_CATEGORIES = [
  'RENT',
  'RENT_ARREARS',
  'LOAN',
  'WORKS',
  'RECURRING_EXPENSE',
  'PROPERTY_TAX'
] as const;
export type CashPlanCategory = (typeof CASH_PLAN_CATEGORIES)[number];

export const CASH_PLAN_SOURCE_KINDS = [
  'RENTAL_INSTALLMENT',
  'LEASE_SCHEDULE',
  'LOAN',
  'WORK_PROGRAM',
  'PROPERTY_EXPENSE',
  'TAX_ESTIMATE'
] as const;
export type CashPlanSourceKind = (typeof CASH_PLAN_SOURCE_KINDS)[number];

export const CASH_PLAN_NOTES = ['DATE_PASSED_MOVED_TO_FIRST_MONTH', 'REMAINING_AFTER_ACTUAL_COST'] as const;
export type CashPlanNote = (typeof CASH_PLAN_NOTES)[number];

export interface CashPlanLine {
  id: string;
  /** 'YYYY-MM' */
  month: string;
  category: CashPlanCategory;
  direction: 'IN' | 'OUT';
  /** Toujours positif. */
  amount: number;
  propertyId: string | null;
  propertyTitle: string | null;
  source: { kind: CashPlanSourceKind; id: string | null };
  /** Vrai : taxe estimée dont les paramètres sont à valider. */
  indicative: boolean;
  note: CashPlanNote | null;
  /** Libellé brut de la source (donnée utilisateur, jamais traduit). */
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

export const CASH_PLAN_SOURCE_KEYS = ['RENT', 'LOANS', 'WORKS', 'RECURRING_EXPENSES', 'PROPERTY_TAX'] as const;
export type CashPlanSourceKey = (typeof CASH_PLAN_SOURCE_KEYS)[number];

export const CASH_PLAN_SOURCE_REASONS = [
  'NO_ACTIVE_LEASE',
  'NO_ACTIVE_LOAN',
  'NO_PLANNED_WORK',
  'NO_RECURRING_EXPENSE',
  'TAX_DUE_DATE_NOT_SET',
  'NO_ELIGIBLE_PROPERTY',
  'TAX_NOT_ESTIMABLE',
  'TAX_COVERED_BY_RECURRING_EXPENSE',
  'TAX_NO_DUE_DATE_IN_WINDOW',
  'NO_FLOW_IN_PERIOD'
] as const;
export type CashPlanSourceReason = (typeof CASH_PLAN_SOURCE_REASONS)[number];

export const CASH_PLAN_SOURCE_STATUSES = ['INCLUDED', 'NO_DATA', 'NOT_CONFIGURED', 'PARTIAL'] as const;
export type CashPlanSourceStatusCode = (typeof CASH_PLAN_SOURCE_STATUSES)[number];

export interface CashPlanSourceStatus {
  source: CashPlanSourceKey;
  status: CashPlanSourceStatusCode;
  reason: CashPlanSourceReason | null;
  count: number | null;
  /** Taxe foncière : biens couverts par une charge récurrente, quand la raison principale est autre. */
  coveredByRecurringExpenseCount?: number;
}

export interface CashPlanShortfall {
  firstMonth: string;
  firstMonthBalance: number;
  deepestMonth: string;
  depth: number;
}

export const CASH_PLAN_EXCLUDED_REASONS = ['FOR_SALE', 'SOLD', 'ARCHIVED', 'DRAFT'] as const;
export type CashPlanExcludedReason = (typeof CASH_PLAN_EXCLUDED_REASONS)[number];

export const CASH_PLAN_WARNING_CODES = ['FOREIGN_CURRENCY_SKIPPED'] as const;
export type CashPlanWarningCode = (typeof CASH_PLAN_WARNING_CODES)[number];

export interface CashPlanData {
  currency: 'XOF';
  generatedAt: string;
  startMonth: string;
  months: 12 | 24;
  openingBalance: number;
  /** Faux : le plan est calculé SANS solde de départ. */
  openingBalanceProvided: boolean;
  propertyId: string | null;
  scope: {
    propertyCount: number;
    excluded: Array<{ propertyId: string; title: string; reason: CashPlanExcludedReason }>;
  };
  periods: CashPlanMonth[];
  totals: { inflows: number; outflows: number; net: number };
  shortfall: CashPlanShortfall | null;
  sources: CashPlanSourceStatus[];
  settings: { propertyTaxDueMonth: number | null; propertyTaxDueDay: number | null };
  warnings: Array<{ code: CashPlanWarningCode; count: number }>;
}

export interface CashPlanQuery {
  months: 12 | 24;
  openingBalance?: number;
  propertyId?: string;
}

export interface CashPlanSettingsInput {
  propertyTaxDueMonth: number | null;
  propertyTaxDueDay: number | null;
}

export interface CashPlanSettingsData extends CashPlanSettingsInput {
  updatedAt: string;
}
