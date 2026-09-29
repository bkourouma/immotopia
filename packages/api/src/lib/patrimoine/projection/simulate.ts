/**
 * Simulation d'opérations sur une projection (lot 3, spec 025).
 *
 * Ordre dans une même année : croissance et échéances, versements d'épargne,
 * puis les autres opérations dans l'ordre où elles sont fournies (par
 * `year` croissant, l'ordre d'origine départageant). L'entrée n'est jamais
 * modifiée : la simulation travaille sur une copie profonde.
 */

import { roundMoneyXof } from '../../finance/money';
import { MAX_OPERATIONS, type ResolvedAssumptions } from './assumptions';
import { levelPayment } from './loan-schedule';
import {
  CASH_POOL_ID,
  addToCash,
  buildState,
  projectNetWorth,
  runFromState,
  type ProjectionInput,
  type ProjectionResult,
  type ProjectionState,
  type SimAsset
} from './project';
import type { AssetClassKey } from '../assets';

const MONTHS_PER_YEAR = 12;

export type SimulationOperation =
  | { type: 'SELL_ASSET'; year: number; assetId: string; salePrice?: number; feesPercent?: number }
  | { type: 'BUY_ASSET'; year: number; assetClass: AssetClassKey; name: string; price: number; growthPercent?: number }
  | { type: 'TAKE_LOAN'; year: number; amount: number; annualRatePercent: number; termYears: number }
  | { type: 'PREPAY_LOAN'; year: number; loanId: string; amount: number }
  | { type: 'MONTHLY_SAVING'; fromYear: number; toYear?: number; amount: number };

export interface SimulationOptions {
  /** Vrai : une référence disparue devient un avertissement `OPERATION_NOT_APPLICABLE` au lieu d'une erreur. */
  lenientReferences?: boolean;
}

export interface SimulationDelta {
  year: number;
  netWorth: number;
}

export interface SimulationResult {
  base: ProjectionResult;
  simulated: ProjectionResult;
  delta: SimulationDelta[];
}

/** Erreur métier : les services la traduisent en ValidationError (`field` = `operations.<index>.<champ>`). */
export class ProjectionOperationError extends Error {
  readonly index: number;
  readonly field: string;

  constructor(details: { index: number; field: string; message: string }) {
    super(details.message);
    this.name = 'ProjectionOperationError';
    this.index = details.index;
    this.field = details.field;
  }
}

interface OperationContext {
  state: ProjectionState;
  index: number;
  lenient: boolean;
}

function fail(index: number, field: string, message: string): never {
  throw new ProjectionOperationError({ index, field, message });
}

function skip(
  ctx: OperationContext,
  reason: 'ASSET_NOT_FOUND' | 'ASSET_NOT_ACTIVE' | 'LOAN_NOT_FOUND',
  field: string
): void {
  if (!ctx.lenient) fail(ctx.index, field, MESSAGES[reason]);
  ctx.state.warnings.push({ code: 'OPERATION_NOT_APPLICABLE', index: ctx.index, reason });
}

const MESSAGES = {
  ASSET_NOT_FOUND: 'Actif introuvable',
  ASSET_NOT_ACTIVE: "Cet actif n'est plus actif : il ne peut pas être vendu",
  LOAN_NOT_FOUND: 'Dette introuvable'
} as const;

function cashOf(state: ProjectionState): number {
  return state.assets.find(asset => asset.id === CASH_POOL_ID)?.value ?? 0;
}

function sellAsset(op: Extract<SimulationOperation, { type: 'SELL_ASSET' }>, ctx: OperationContext): void {
  const { state } = ctx;
  if (state.soldIds.has(op.assetId)) fail(ctx.index, 'assetId', 'Cet actif est déjà vendu par une autre opération');
  const asset = state.assets.find(candidate => candidate.id === op.assetId && candidate.id !== CASH_POOL_ID);
  if (!asset) return skip(ctx, state.excluded.has(op.assetId) ? 'ASSET_NOT_ACTIVE' : 'ASSET_NOT_FOUND', 'assetId');
  if (asset.status !== 'ACTIVE') return skip(ctx, 'ASSET_NOT_ACTIVE', 'assetId');
  const price = op.salePrice ?? roundMoneyXof(asset.value);
  addToCash(state, roundMoneyXof(price * (1 - (op.feesPercent ?? 0) / 100)));
  state.assets = state.assets.filter(candidate => candidate !== asset);
  state.soldIds.add(asset.id);
}

function buyAsset(op: Extract<SimulationOperation, { type: 'BUY_ASSET' }>, ctx: OperationContext): void {
  addToCash(ctx.state, -op.price);
  const bought: SimAsset = {
    id: `sim-asset-${ctx.index}`,
    name: op.name,
    assetClass: op.assetClass,
    status: 'ACTIVE',
    value: op.price,
    growthPercent: op.growthPercent ?? null,
    plan: null
  };
  ctx.state.assets.push(bought);
}

function takeLoan(op: Extract<SimulationOperation, { type: 'TAKE_LOAN' }>, ctx: OperationContext): void {
  addToCash(ctx.state, op.amount);
  ctx.state.loans.push({
    id: `sim-loan-${ctx.index}`,
    remaining: op.amount,
    annualRatePercent: op.annualRatePercent,
    monthlyPayment: levelPayment(op.amount, op.annualRatePercent, op.termYears),
    monthsLeft: op.termYears * MONTHS_PER_YEAR
  });
}

function prepayLoan(op: Extract<SimulationOperation, { type: 'PREPAY_LOAN' }>, ctx: OperationContext): void {
  const loan = ctx.state.loans.find(candidate => candidate.id === op.loanId);
  if (!loan) return skip(ctx, 'LOAN_NOT_FOUND', 'loanId');
  if (op.amount > roundMoneyXof(loan.remaining)) {
    fail(ctx.index, 'amount', 'Le remboursement dépasse le capital restant dû projeté à cette date');
  }
  loan.remaining = Math.max(0, loan.remaining - op.amount);
  addToCash(ctx.state, -op.amount);
}

function applyOne(op: SimulationOperation, ctx: OperationContext): void {
  switch (op.type) {
    case 'SELL_ASSET':
      return sellAsset(op, ctx);
    case 'BUY_ASSET':
      return buyAsset(op, ctx);
    case 'TAKE_LOAN':
      return takeLoan(op, ctx);
    case 'PREPAY_LOAN':
      return prepayLoan(op, ctx);
    case 'MONTHLY_SAVING':
      return; // Enregistré au départ, versé par `advanceYear`.
  }
}

function checkYear(index: number, field: string, year: number, horizonYears: number): void {
  if (!Number.isInteger(year) || year < 1 || year > horizonYears) {
    fail(index, field, `L'année doit être un entier de 1 à ${horizonYears}`);
  }
}

/** Contrôles de forme communs, puis enregistrement des épargnes mensuelles dans l'état. */
function prepareOperations(operations: SimulationOperation[], state: ProjectionState, horizonYears: number): void {
  if (operations.length > MAX_OPERATIONS) {
    fail(MAX_OPERATIONS, 'operations', `Au plus ${MAX_OPERATIONS} opérations par simulation`);
  }
  operations.forEach((op, index) => {
    if (op.type !== 'MONTHLY_SAVING') return checkYear(index, 'year', op.year, horizonYears);
    checkYear(index, 'fromYear', op.fromYear, horizonYears);
    const toYear = op.toYear ?? horizonYears;
    checkYear(index, 'toYear', toYear, horizonYears);
    if (toYear < op.fromYear) fail(index, 'toYear', "L'année de fin précède l'année de début");
    state.savings.push({ fromYear: op.fromYear, toYear, amount: op.amount });
  });
}

/** Fond les comptes de trésorerie sans taux propre dans un seul pseudo-actif (leur croissance est identique). */
function poolCashAccounts(state: ProjectionState): void {
  const accounts = state.assets.filter(asset => asset.assetClass === 'CASH' && asset.growthPercent === null);
  if (accounts.length === 0) return;
  const total = accounts.reduce((sum, account) => sum + account.value, 0);
  for (const account of accounts) state.excluded.add(account.id);
  state.assets = state.assets.filter(asset => !accounts.includes(asset));
  addToCash(state, total);
}

function deepCopy(input: ProjectionInput): ProjectionInput {
  return structuredClone(input);
}

function markNegativeCash(state: ProjectionState, year: number): void {
  if (roundMoneyXof(cashOf(state)) < 0) state.warnings.push({ code: 'NEGATIVE_CASH', year });
}

/** Projection avec opérations, sur une copie profonde de l'entrée. */
export function applyOperations(
  input: ProjectionInput,
  operations: SimulationOperation[],
  assumptions: ResolvedAssumptions,
  horizonYears: number,
  options: SimulationOptions = {}
): ProjectionResult {
  const state = buildState(deepCopy(input));
  prepareOperations(operations, state, horizonYears);
  poolCashAccounts(state);
  const ordered = operations
    .map((op, index) => ({ op, index }))
    .sort((a, b) => yearOf(a.op) - yearOf(b.op) || a.index - b.index);
  return runFromState(state, assumptions, horizonYears, (current, year) => {
    for (const { op, index } of ordered) {
      if (yearOf(op) !== year) continue;
      applyOne(op, { state: current, index, lenient: options.lenientReferences === true });
    }
    markNegativeCash(current, year);
  });
}

function yearOf(op: SimulationOperation): number {
  return op.type === 'MONTHLY_SAVING' ? op.fromYear : op.year;
}

/** Base, simulation et écart (simulé − base) par année. */
export function simulateProjection(
  input: ProjectionInput,
  assumptions: ResolvedAssumptions,
  horizonYears: number,
  operations: SimulationOperation[],
  options: SimulationOptions = {}
): SimulationResult {
  const base = projectNetWorth(input, assumptions, horizonYears);
  const simulated = applyOperations(input, operations, assumptions, horizonYears, options);
  const delta = simulated.points.map((point, position) => ({
    year: point.year,
    netWorth: point.netWorth - (base.points[position]?.netWorth ?? 0)
  }));
  return { base, simulated, delta };
}
