/**
 * Projection de la valeur nette (lot 3, spec 025) : fonctions pures, sans
 * Prisma ni horloge implicite (la date du jour arrive en paramètre).
 *
 * Calendrier : année 0 = aujourd'hui, année t = fin de la t-ième année.
 * Chaque année : croissance composée des actifs, 12 mensualités des dettes,
 * versements d'épargne ; les opérations de simulation s'appliquent ensuite.
 *
 * Clés de `details` lues pour un véhicule, DÉRIVÉES PAR LA COUCHE SERVICE à
 * partir des `details` du lot 2 (le domaine ne les calcule pas) :
 * - `annuityXof` : annuité d'amortissement linéaire constante ;
 * - `residualValueXof` : valeur plancher explicite.
 * Sans elles, repli sur `usefulLifeYears` / `residualValuePercent` du lot 2,
 * appliqués à la valeur courante.
 */

import { roundMoneyXof } from '../../finance/money';
import { ASSET_CLASSES, type AssetClassKey } from '../assets';
import type { ResolvedAssumptions } from './assumptions';
import { advanceLoan, monthsUntil, paymentTooLow } from './loan-schedule';

export interface ProjectionAssetInput {
  id: string;
  name: string;
  assetClass: AssetClassKey;
  status: 'ACTIVE' | 'DISPOSED' | 'ARCHIVED';
  valueXof: number | null;
  details: Record<string, unknown>;
  lastValuedAt: Date | null;
  growthPercentOverride?: number;
}

export interface ProjectionLoanInput {
  id: string;
  assetId: string | null;
  remainingCapital: number;
  annualRatePercent: number;
  monthlyPayment: number;
  endDate: Date | null;
  status: 'ACTIVE' | 'CLOSED' | 'DEFAULTED';
}

export interface ProjectionInput {
  today: Date;
  assets: ProjectionAssetInput[];
  loans: ProjectionLoanInput[];
}

export interface ProjectionPoint {
  year: number;
  assets: number;
  debts: number;
  netWorth: number;
  realNetWorth: number;
  byClass: { assetClass: AssetClassKey; value: number }[];
}

export type ProjectionWarning =
  | { code: 'ASSET_WITHOUT_VALUE'; assetId: string }
  | { code: 'LOAN_PAYMENT_TOO_LOW'; loanId: string }
  | { code: 'NEGATIVE_CASH'; year: number }
  | { code: 'LOW_RELIABILITY_START'; sharePercent: number }
  | {
      code: 'OPERATION_NOT_APPLICABLE';
      index: number;
      reason: 'ASSET_NOT_FOUND' | 'ASSET_NOT_ACTIVE' | 'LOAN_NOT_FOUND';
    };

export interface ProjectionResult {
  points: ProjectionPoint[];
  warnings: ProjectionWarning[];
}

/** Amortissement d'un véhicule ; `floor` = valeur plancher. */
export type DepreciationPlan =
  { kind: 'LINEAR'; annuity: number; floor: number } | { kind: 'DECLINING'; ratePercent: number; floor: number };

export interface SimAsset {
  id: string;
  name: string;
  assetClass: AssetClassKey;
  status: 'ACTIVE' | 'DISPOSED';
  value: number;
  /** Taux propre à l'actif (surcharge ou taux d'épargne) ; `null` : taux de la classe. */
  growthPercent: number | null;
  plan: DepreciationPlan | null;
}

export interface SimLoan {
  id: string;
  remaining: number;
  annualRatePercent: number;
  monthlyPayment: number;
  monthsLeft: number | null;
}

export interface SavingPlan {
  fromYear: number;
  toYear: number;
  amount: number;
}

/** État mutable interne d'une projection ; il est toujours construit à neuf depuis l'entrée. */
export interface ProjectionState {
  assets: SimAsset[];
  loans: SimLoan[];
  savings: SavingPlan[];
  /** Actifs connus mais hors projection (archivés, sans valeur, fondus dans la trésorerie). */
  excluded: Set<string>;
  soldIds: Set<string>;
  warnings: ProjectionWarning[];
}

const MONTHS_PER_YEAR = 12;

function numberDetail(details: Record<string, unknown>, key: string): number | null {
  const value = details[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Plancher : valeur explicite, sinon pourcentage résiduel de la valeur courante, sinon 0. */
function residualFloor(details: Record<string, unknown>, value: number): number {
  const explicit = numberDetail(details, 'residualValueXof');
  const percent = numberDetail(details, 'residualValuePercent');
  const floor = explicit ?? (percent === null ? 0 : (value * percent) / 100);
  return Math.min(value, Math.max(0, floor));
}

/** Priorité : dégressif (méthode + taux), puis annuité fournie, puis annuité déduite de la durée d'utilité. */
function depreciationPlan(details: Record<string, unknown>, value: number): DepreciationPlan | null {
  const floor = residualFloor(details, value);
  const declining = numberDetail(details, 'decliningRatePercent');
  if (details.depreciationMethod === 'DECLINING' && declining !== null) {
    return { kind: 'DECLINING', ratePercent: declining, floor };
  }
  const annuity = numberDetail(details, 'annuityXof');
  if (annuity !== null && annuity >= 0) return { kind: 'LINEAR', annuity, floor };
  const life = numberDetail(details, 'usefulLifeYears');
  if (life !== null && life > 0) return { kind: 'LINEAR', annuity: (value - floor) / life, floor };
  return null;
}

function ownGrowth(asset: ProjectionAssetInput): number | null {
  if (asset.growthPercentOverride !== undefined) return asset.growthPercentOverride;
  if (asset.assetClass === 'SAVINGS_INVESTMENT') return numberDetail(asset.details, 'expectedRatePercent');
  return null;
}

function buildAsset(asset: ProjectionAssetInput, value: number): SimAsset {
  const growthPercent = ownGrowth(asset);
  const usePlan = asset.assetClass === 'VEHICLE_EQUIPMENT' && asset.growthPercentOverride === undefined;
  return {
    id: asset.id,
    name: asset.name,
    assetClass: asset.assetClass,
    status: asset.status === 'DISPOSED' ? 'DISPOSED' : 'ACTIVE',
    value,
    growthPercent,
    plan: usePlan ? depreciationPlan(asset.details, value) : null
  };
}

/** Construit l'état de départ : actifs valorisés, dettes ACTIVE, avertissements de départ. */
export function buildState(input: ProjectionInput): ProjectionState {
  const state: ProjectionState = {
    assets: [],
    loans: [],
    savings: [],
    excluded: new Set(),
    soldIds: new Set(),
    warnings: []
  };
  for (const asset of input.assets) {
    if (asset.status === 'ARCHIVED') {
      state.excluded.add(asset.id);
    } else if (asset.valueXof === null) {
      state.excluded.add(asset.id);
      state.warnings.push({ code: 'ASSET_WITHOUT_VALUE', assetId: asset.id });
    } else {
      state.assets.push(buildAsset(asset, asset.valueXof));
    }
  }
  for (const loan of input.loans) {
    if (loan.status !== 'ACTIVE') continue;
    if (paymentTooLow(loan)) state.warnings.push({ code: 'LOAN_PAYMENT_TOO_LOW', loanId: loan.id });
    state.loans.push({
      id: loan.id,
      remaining: loan.remainingCapital,
      annualRatePercent: loan.annualRatePercent,
      monthlyPayment: loan.monthlyPayment,
      monthsLeft: monthsUntil(loan.endDate, input.today)
    });
  }
  return state;
}

function nextAssetValue(asset: SimAsset, assumptions: ResolvedAssumptions): number {
  const { plan } = asset;
  if (plan?.kind === 'LINEAR') return Math.max(plan.floor, asset.value - plan.annuity);
  if (plan?.kind === 'DECLINING') return Math.max(plan.floor, asset.value * (1 - plan.ratePercent / 100));
  const rate = asset.growthPercent ?? assumptions.growthPercentByClass[asset.assetClass];
  return asset.value * (1 + rate / 100);
}

/** Une année : croissance des actifs, 12 mensualités, puis versements d'épargne (sans intérêt l'année du versement). */
export function advanceYear(state: ProjectionState, assumptions: ResolvedAssumptions, year: number): void {
  for (const asset of state.assets) asset.value = nextAssetValue(asset, assumptions);
  for (const loan of state.loans) {
    const next = advanceLoan(loan, loan.annualRatePercent, loan.monthlyPayment, MONTHS_PER_YEAR);
    loan.remaining = next.remaining;
    loan.monthsLeft = next.monthsLeft;
  }
  const saved = state.savings
    .filter(plan => year >= plan.fromYear && year <= plan.toYear)
    .reduce((sum, plan) => sum + plan.amount * MONTHS_PER_YEAR, 0);
  if (saved !== 0) addToCash(state, saved);
}

export const CASH_POOL_ID = '__cash__';

/** Trésorerie simulée : pseudo-actif CASH créé à la demande, jamais à l'insu d'une projection sans opération. */
export function addToCash(state: ProjectionState, amount: number): void {
  let pool = state.assets.find(asset => asset.id === CASH_POOL_ID);
  if (!pool) {
    pool = {
      id: CASH_POOL_ID,
      name: 'Trésorerie',
      assetClass: 'CASH',
      status: 'ACTIVE',
      value: 0,
      growthPercent: null,
      plan: null
    };
    state.assets.push(pool);
  }
  pool.value += amount;
}

export function snapshot(state: ProjectionState, year: number, assumptions: ResolvedAssumptions): ProjectionPoint {
  const totals = new Map<AssetClassKey, number>();
  for (const asset of state.assets) {
    totals.set(asset.assetClass, (totals.get(asset.assetClass) ?? 0) + roundMoneyXof(asset.value));
  }
  const byClass = ASSET_CLASSES.filter(assetClass => totals.has(assetClass))
    .map(assetClass => ({ assetClass, value: totals.get(assetClass) ?? 0 }))
    .sort((a, b) => b.value - a.value);
  const assets = byClass.reduce((sum, entry) => sum + entry.value, 0);
  const debts = state.loans.reduce((sum, loan) => sum + roundMoneyXof(loan.remaining), 0);
  const netWorth = assets - debts;
  const deflator = Math.pow(1 + assumptions.inflationPercent / 100, year);
  return { year, assets, debts, netWorth, realNetWorth: roundMoneyXof(netWorth / deflator), byClass };
}

/** Boucle commune à la projection de base et à la simulation ; `afterYear` reçoit l'état de fin d'année. */
export function runFromState(
  state: ProjectionState,
  assumptions: ResolvedAssumptions,
  horizonYears: number,
  afterYear?: (state: ProjectionState, year: number) => void
): ProjectionResult {
  const points = [snapshot(state, 0, assumptions)];
  for (let year = 1; year <= horizonYears; year += 1) {
    advanceYear(state, assumptions, year);
    afterYear?.(state, year);
    points.push(snapshot(state, year, assumptions));
  }
  return { points, warnings: state.warnings };
}

/** Projection sans opération : N + 1 points, année 0 comprise. */
export function projectNetWorth(
  input: ProjectionInput,
  assumptions: ResolvedAssumptions,
  horizonYears: number
): ProjectionResult {
  return runFromState(buildState(input), assumptions, horizonYears);
}
