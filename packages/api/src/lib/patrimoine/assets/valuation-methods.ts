/**
 * Suggestion de valeur par classe d'actif (lot 2, spec 024).
 *
 * Fonctions pures : rien n'est écrit, la suggestion est proposée à
 * l'utilisateur avec sa méthode et ses hypothèses. Attributs insuffisants :
 * refus avec la liste des champs manquants, jamais une valeur inventée.
 *
 * Convention de durée : une année = 365,25 jours (années bissextiles lissées),
 * les années écoulées sont fractionnaires. Montants arrondis au franc par
 * `roundMoneyXof`, uniquement au résultat final.
 */

import { roundMoneyXof } from '../../finance/money';
import type { AssetClassKey } from './asset-classes';

export type ValuationMethodKey =
  | 'MANUAL'
  | 'MARKET_ESTIMATE'
  | 'EXPERT_APPRAISAL'
  | 'DEPRECIATION_LINEAR'
  | 'DEPRECIATION_DECLINING'
  | 'EQUITY_SHARE'
  | 'UNIT_COST'
  | 'BALANCE'
  | 'ACCRUED_SAVINGS'
  | 'DISCOUNTED_CLAIM'
  | 'UNIT_VALUE';

export interface ValuationAssumption {
  key: string;
  value: string | number;
}

export interface SuggestValuationInput {
  assetClass: AssetClassKey;
  details: Record<string, unknown>;
  acquisitionCost: number | null;
  acquisitionDate: Date | null;
  lastValuation: { valuatedAt: Date; estimatedValue: number } | null;
}

export type SuggestValuationResult =
  | { ok: true; amount: number; method: ValuationMethodKey; assumptions: ValuationAssumption[] }
  | { ok: false; missing: string[] };

const DAYS_PER_YEAR = 365.25;
const MS_PER_DAY = 86_400_000;

type Computed = Extract<SuggestValuationResult, { ok: true }>;
type Missing = Extract<SuggestValuationResult, { ok: false }>;

const refuse = (...missing: string[]): Missing => ({ ok: false, missing });

/** Années fractionnaires entre deux dates (365,25 jours l'an). */
export function yearsBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_DAY / DAYS_PER_YEAR;
}

function num(details: Record<string, unknown>, key: string): number | null {
  const value = details[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function done(amount: number, method: ValuationMethodKey, assumptions: ValuationAssumption[]): Computed {
  return { ok: true, amount: roundMoneyXof(amount), method, assumptions };
}

/** Amortissement linéaire ou dégressif d'un véhicule ou équipement ; plancher = valeur résiduelle. */
function vehicleEquipment(input: SuggestValuationInput, asOf: Date): SuggestValuationResult {
  const { details, acquisitionCost: cost, acquisitionDate: date } = input;
  const declining = details.depreciationMethod === 'DECLINING';
  const life = num(details, 'usefulLifeYears');
  const rate = num(details, 'decliningRatePercent');
  const missing: string[] = [];
  if (cost === null) missing.push('acquisitionCost');
  if (date === null) missing.push('acquisitionDate');
  if (declining ? rate === null : life === null) missing.push(declining ? 'decliningRatePercent' : 'usefulLifeYears');
  if (missing.length > 0 || cost === null || date === null) return refuse(...missing);

  const residualPercent = num(details, 'residualValuePercent') ?? 0;
  const residual = (cost * residualPercent) / 100;
  const years = yearsBetween(date, asOf);
  const assumptions: ValuationAssumption[] = [
    { key: 'residualValuePercent', value: residualPercent },
    { key: 'elapsedYears', value: Math.round(years * 100) / 100 }
  ];
  if (declining) {
    const value = cost * Math.pow(1 - (rate as number) / 100, years);
    return done(Math.max(residual, value), 'DEPRECIATION_DECLINING', [
      { key: 'decliningRatePercent', value: rate as number },
      ...assumptions
    ]);
  }
  const annuity = (cost - residual) / (life as number);
  return done(Math.max(residual, cost - annuity * years), 'DEPRECIATION_LINEAR', [
    { key: 'usefulLifeYears', value: life as number },
    ...assumptions
  ]);
}

/** Quote-part : valeur de l'entreprise directe, sinon résultat net × multiple. */
function businessEquity(input: SuggestValuationInput): SuggestValuationResult {
  const { details } = input;
  const share = num(details, 'ownershipPercent');
  if (share === null) return refuse('ownershipPercent');

  const direct = num(details, 'companyValue');
  const income = num(details, 'netIncome');
  const multiple = num(details, 'earningsMultiple');
  const assumptions: ValuationAssumption[] = [{ key: 'ownershipPercent', value: share }];
  if (direct !== null) {
    return done((share / 100) * direct, 'EQUITY_SHARE', [...assumptions, { key: 'companyValue', value: direct }]);
  }
  if (income !== null && multiple !== null) {
    return done((share / 100) * income * multiple, 'EQUITY_SHARE', [
      ...assumptions,
      { key: 'netIncome', value: income },
      { key: 'earningsMultiple', value: multiple }
    ]);
  }
  return refuse('companyValue');
}

function inventory(input: SuggestValuationInput): SuggestValuationResult {
  const quantity = num(input.details, 'quantity');
  const unitCost = num(input.details, 'unitCost');
  if (quantity === null || unitCost === null) {
    return refuse(...(quantity === null ? ['quantity'] : []), ...(unitCost === null ? ['unitCost'] : []));
  }
  const writeDown = num(input.details, 'writeDownPercent') ?? 0;
  return done(quantity * unitCost * (1 - writeDown / 100), 'UNIT_COST', [
    { key: 'quantity', value: quantity },
    { key: 'unitCost', value: unitCost },
    { key: 'writeDownPercent', value: writeDown }
  ]);
}

/** Capital (dernière valorisation, sinon `principal`) capitalisé à intérêts composés annuels. */
function savings(input: SuggestValuationInput, asOf: Date): SuggestValuationResult {
  const { details, lastValuation, acquisitionDate } = input;
  const principal = lastValuation ? lastValuation.estimatedValue : num(details, 'principal');
  const rate = num(details, 'expectedRatePercent');
  const start = lastValuation ? lastValuation.valuatedAt : acquisitionDate;
  const missing: string[] = [];
  if (principal === null) missing.push('principal');
  if (rate === null) missing.push('expectedRatePercent');
  if (start === null) missing.push('acquisitionDate');
  if (missing.length > 0 || principal === null || rate === null || start === null) return refuse(...missing);

  const years = Math.max(0, yearsBetween(start, asOf));
  return done(principal * Math.pow(1 + rate / 100, years), 'ACCRUED_SAVINGS', [
    { key: 'principal', value: principal },
    { key: 'expectedRatePercent', value: rate },
    { key: 'elapsedYears', value: Math.round(years * 100) / 100 }
  ]);
}

function receivable(input: SuggestValuationInput): SuggestValuationResult {
  const principal = num(input.details, 'principal');
  const collectibility = num(input.details, 'collectibilityPercent');
  if (principal === null || collectibility === null) {
    return refuse(
      ...(principal === null ? ['principal'] : []),
      ...(collectibility === null ? ['collectibilityPercent'] : [])
    );
  }
  return done((principal * collectibility) / 100, 'DISCOUNTED_CLAIM', [
    { key: 'principal', value: principal },
    { key: 'collectibilityPercent', value: collectibility }
  ]);
}

/** Élevage et récolte : effectif × valeur unitaire ; plantation : surface × valeur unitaire. */
function agriculture(input: SuggestValuationInput): SuggestValuationResult {
  const { details } = input;
  const byArea = details.agricultureKind === 'PLANTATION';
  const quantityKey = byArea ? 'areaHectares' : 'headcount';
  const quantity = num(details, quantityKey);
  const unitValue = num(details, 'unitValue');
  if (quantity === null || unitValue === null) {
    return refuse(...(quantity === null ? [quantityKey] : []), ...(unitValue === null ? ['unitValue'] : []));
  }
  return done(quantity * unitValue, 'UNIT_VALUE', [
    { key: quantityKey, value: quantity },
    { key: 'unitValue', value: unitValue }
  ]);
}

/**
 * Suggère une valeur selon la classe. `MOVABLE`, `OTHER` et `REAL_ESTATE` n'ont
 * pas de méthode calculable (`missing: []`) ; un solde se saisit (`['balance']`).
 * Une date d'acquisition postérieure à `asOf` est refusée.
 */
export function suggestValuation(input: SuggestValuationInput, asOf: Date): SuggestValuationResult {
  if (input.acquisitionDate !== null && input.acquisitionDate.getTime() > asOf.getTime()) {
    return refuse('acquisitionDate');
  }
  switch (input.assetClass) {
    case 'VEHICLE_EQUIPMENT':
      return vehicleEquipment(input, asOf);
    case 'BUSINESS_EQUITY':
      return businessEquity(input);
    case 'INVENTORY':
      return inventory(input);
    case 'SAVINGS_INVESTMENT':
      return savings(input, asOf);
    case 'RECEIVABLE':
      return receivable(input);
    case 'AGRICULTURE':
      return agriculture(input);
    case 'CASH':
      return refuse('balance');
    default:
      return refuse();
  }
}
