/**
 * Moteur fiscal patrimoine — calcul pur des impôts fonciers et sur les
 * revenus fonciers (lot P4, territoire A1).
 *
 * Contrat : section 2 de `p4-contrat.md`. Fonctions pures ; le seul import
 * externe autorisé est `roundMoneyXof`.
 */

import { roundMoneyXof } from '../../finance/money';
import { pickParametersYear, resolveBrackets, resolveParameter, resolveSurcharges } from './parameters';
import type {
  TaxBaseKind,
  TaxComputation,
  TaxContext,
  TaxEngineInput,
  TaxKind,
  TaxLine,
  TaxLineCode,
  TaxParameterRow,
  TaxReason,
  TaxWarning
} from './types';

function lineFromParam(
  code: TaxLineCode,
  param: TaxParameterRow,
  base: number | null,
  rate: number | null,
  amount: number
): TaxLine {
  return {
    code,
    label: param.label,
    base,
    rate,
    amount,
    parameterId: param.id,
    parameterKey: param.key,
    source: param.source,
    status: param.status
  };
}

function allValidated(usedParams: TaxParameterRow[]): boolean {
  if (usedParams.length === 0) return true;
  return usedParams.every(param => param.status === 'VALIDE');
}

function finalize(args: {
  taxKind: TaxKind;
  applicable: boolean;
  reason: TaxReason | null;
  parametersYear: number | null;
  parametersFallback: boolean;
  baseKind: TaxBaseKind | null;
  totalUnrounded: number;
  lines: TaxLine[];
  warnings: TaxWarning[];
  usedParams: TaxParameterRow[];
}): TaxComputation {
  const {
    taxKind,
    applicable,
    reason,
    parametersYear,
    parametersFallback,
    baseKind,
    totalUnrounded,
    lines,
    usedParams
  } = args;

  const warnings = new Set(args.warnings);
  const validated = allValidated(usedParams);
  if (!validated) {
    warnings.add('PARAMETERS_NOT_VALIDATED');
  }

  return {
    taxKind,
    applicable,
    reason,
    parametersYear,
    parametersFallback,
    baseKind,
    amountFull: roundMoneyXof(totalUnrounded),
    lines,
    warnings: Array.from(warnings),
    allParametersValidated: validated
  };
}

/**
 * Calcule un impôt (foncier ou sur les revenus fonciers) pour un bien et un
 * exercice donnés. `rows` porte toutes les lignes de paramètres du pays,
 * toutes années ≤ `fiscalYear` et tous impôts confondus ; le moteur choisit
 * lui-même l'année et l'impôt.
 */
export function computeTax(taxKind: TaxKind, input: TaxEngineInput, rows: TaxParameterRow[]): TaxComputation {
  const ctx: TaxContext = { propertyKind: input.propertyKind, occupancy: input.occupancy, ownerKind: input.ownerKind };
  const warnings: TaxWarning[] = [];

  if (!input.country) {
    return finalize({
      taxKind,
      applicable: false,
      reason: 'UNSUPPORTED_COUNTRY',
      parametersYear: null,
      parametersFallback: false,
      baseKind: null,
      totalUnrounded: 0,
      lines: [],
      warnings: [],
      usedParams: []
    });
  }

  const { year, fallback, rows: yearRows } = pickParametersYear(rows, input.country, taxKind, input.fiscalYear);
  if (year === null) {
    return finalize({
      taxKind,
      applicable: false,
      reason: 'NO_PARAMETERS',
      parametersYear: null,
      parametersFallback: false,
      baseKind: null,
      totalUnrounded: 0,
      lines: [],
      warnings: [],
      usedParams: []
    });
  }
  if (fallback) warnings.push('PARAMETERS_FALLBACK');

  const usedParams: TaxParameterRow[] = [];

  // Étape 2 : applicabilité et exemption permanente.
  const applicableParam = resolveParameter(yearRows, 'applicable', ctx);
  if (applicableParam) {
    usedParams.push(applicableParam);
    if (applicableParam.value === 0) {
      return finalize({
        taxKind,
        applicable: false,
        reason: 'NOT_APPLICABLE',
        parametersYear: year,
        parametersFallback: fallback,
        baseKind: null,
        totalUnrounded: 0,
        lines: [],
        warnings,
        usedParams
      });
    }
  }

  const exemptParam = resolveParameter(yearRows, 'exempt', ctx);
  if (exemptParam) {
    usedParams.push(exemptParam);
    if (exemptParam.value === 1) {
      const exemptionLine = lineFromParam('EXEMPTION', exemptParam, null, null, 0);
      return finalize({
        taxKind,
        applicable: false,
        reason: 'EXEMPT',
        parametersYear: year,
        parametersFallback: fallback,
        baseKind: null,
        totalUnrounded: 0,
        lines: [exemptionLine],
        warnings,
        usedParams
      });
    }
  }

  // Étape 3 : exonération temporaire.
  if (input.exemptUntilYear !== null && input.exemptUntilYear >= input.fiscalYear) {
    return finalize({
      taxKind,
      applicable: false,
      reason: 'TEMPORARY_EXEMPTION',
      parametersYear: year,
      parametersFallback: fallback,
      baseKind: null,
      totalUnrounded: 0,
      lines: [],
      warnings,
      usedParams
    });
  }

  // Étape 4 : base.
  const baseParam = resolveParameter(yearRows, 'base', ctx);
  if (!baseParam) {
    return finalize({
      taxKind,
      applicable: false,
      reason: 'NO_PARAMETERS',
      parametersYear: year,
      parametersFallback: fallback,
      baseKind: null,
      totalUnrounded: 0,
      lines: [],
      warnings,
      usedParams
    });
  }
  usedParams.push(baseParam);

  const baseKindCode = baseParam.valueText;
  let baseKind: TaxBaseKind | null = null;
  let baseValue: number | null = null;

  if (baseKindCode === 'RENTAL_VALUE') {
    baseKind = 'RENTAL_VALUE';
    if (input.declaredRentalValue !== null && input.declaredRentalValue > 0) {
      baseValue = input.declaredRentalValue;
    } else if (input.annualRent > 0) {
      baseValue = input.annualRent;
    } else if (input.marketValue !== null && input.marketValue > 0) {
      const ratioParam = resolveParameter(yearRows, 'rental_value_ratio', ctx);
      if (ratioParam && ratioParam.value !== null) {
        usedParams.push(ratioParam);
        baseValue = input.marketValue * (ratioParam.value / 100);
        warnings.push('RENTAL_VALUE_ESTIMATED');
      }
    }
  } else if (baseKindCode === 'MARKET_VALUE') {
    baseKind = 'MARKET_VALUE';
    if (input.marketValue !== null && input.marketValue > 0) {
      baseValue = input.marketValue;
    } else {
      warnings.push('NO_MARKET_VALUE');
    }
  } else if (baseKindCode === 'GROSS_RENT') {
    baseKind = 'GROSS_RENT';
    baseValue = input.annualRent > 0 ? input.annualRent : null;
  } else {
    warnings.push('UNKNOWN_BASE_KIND');
  }

  if (baseValue === null || baseValue <= 0) {
    return finalize({
      taxKind,
      applicable: true,
      reason: 'NO_BASE',
      parametersYear: year,
      parametersFallback: fallback,
      baseKind,
      totalUnrounded: 0,
      lines: [],
      warnings,
      usedParams
    });
  }

  const lines: TaxLine[] = [lineFromParam('BASE', baseParam, baseValue, null, baseValue)];

  // Étape 5 : abattement et base imposable.
  let taxableBase = baseValue;
  const abatementParam = resolveParameter(yearRows, 'abatement_rate', ctx);
  if (abatementParam && abatementParam.value !== null) {
    usedParams.push(abatementParam);
    if (abatementParam.value > 0) {
      const abatementAmount = baseValue * (abatementParam.value / 100);
      taxableBase = baseValue - abatementAmount;
      lines.push(lineFromParam('ABATEMENT', abatementParam, baseValue, abatementParam.value, -abatementAmount));
    }
  }

  const roundingParam = resolveParameter(yearRows, 'base_rounding_down', ctx);
  if (roundingParam && roundingParam.value !== null && roundingParam.value > 0) {
    usedParams.push(roundingParam);
    taxableBase = Math.floor(taxableBase / roundingParam.value) * roundingParam.value;
  }

  lines.push({
    code: 'TAXABLE_BASE',
    label: 'Base imposable',
    base: taxableBase,
    rate: null,
    amount: taxableBase,
    parameterId: roundingParam?.id ?? null,
    parameterKey: roundingParam?.key ?? null,
    source: roundingParam?.source ?? null,
    status: roundingParam?.status ?? null
  });

  // Étape 6 : tranches ou taux unique.
  let principal = 0;
  const brackets = resolveBrackets(yearRows, ctx);
  if (brackets.length > 0) {
    for (const bracket of brackets) {
      const lower = bracket.lowerBound ?? 0;
      const upper = bracket.upperBound ?? Infinity;
      if (taxableBase <= lower) continue;
      const portion = Math.min(taxableBase, upper) - lower;
      if (portion <= 0) continue;
      usedParams.push(bracket);
      const rate = bracket.value ?? 0;
      const amount = portion * (rate / 100);
      principal += amount;
      lines.push(lineFromParam('BRACKET', bracket, portion, rate, amount));
    }
  } else {
    const rateParam = resolveParameter(yearRows, 'rate', ctx);
    if (!rateParam || rateParam.value === null) {
      warnings.push('MISSING_RATE');
      return finalize({
        taxKind,
        applicable: false,
        reason: 'NO_PARAMETERS',
        parametersYear: year,
        parametersFallback: fallback,
        baseKind,
        totalUnrounded: 0,
        lines,
        warnings,
        usedParams
      });
    }
    usedParams.push(rateParam);
    principal = taxableBase * (rateParam.value / 100);
    lines.push(lineFromParam('PRINCIPAL', rateParam, taxableBase, rateParam.value, principal));
  }

  // Étape 7 : minimum.
  const minimumParam = resolveParameter(yearRows, 'minimum_amount', ctx);
  if (minimumParam && minimumParam.value !== null) {
    usedParams.push(minimumParam);
    if (minimumParam.value > principal) {
      lines.push(lineFromParam('MINIMUM', minimumParam, null, null, minimumParam.value - principal));
      principal = minimumParam.value;
    }
  }

  // Étape 8 : surtaxes.
  let total = principal;
  const surchargesOnTax = resolveSurcharges(yearRows, 'surcharge_on_tax_rate', ctx);
  for (const surcharge of surchargesOnTax) {
    if (surcharge.value === null) continue;
    usedParams.push(surcharge);
    const amount = principal * (surcharge.value / 100);
    total += amount;
    lines.push(lineFromParam('SURCHARGE', surcharge, principal, surcharge.value, amount));
  }

  const surchargesOnBase = resolveSurcharges(yearRows, 'surcharge_on_base_rate', ctx);
  for (const surcharge of surchargesOnBase) {
    if (surcharge.value === null) continue;
    usedParams.push(surcharge);
    const amount = taxableBase * (surcharge.value / 100);
    total += amount;
    lines.push(lineFromParam('SURCHARGE', surcharge, taxableBase, surcharge.value, amount));
  }

  return finalize({
    taxKind,
    applicable: true,
    reason: null,
    parametersYear: year,
    parametersFallback: fallback,
    baseKind,
    totalUnrounded: total,
    lines,
    warnings,
    usedParams
  });
}

/**
 * Calcule les deux impôts patrimoniaux pour un bien : `[PROPERTY_TAX,
 * RENTAL_INCOME_TAX]`.
 */
export function computePropertyTaxes(input: TaxEngineInput, rows: TaxParameterRow[]): TaxComputation[] {
  return [computeTax('PROPERTY_TAX', input, rows), computeTax('RENTAL_INCOME_TAX', input, rows)];
}

/**
 * Applique une quote-part de détention aux montants calculés, arrondis au
 * franc CFA. Une part de 0 donne 0, une part de 100 donne le montant entier.
 */
export function applyShare(
  computations: TaxComputation[],
  sharePercent: number
): { amountShareByKind: Record<TaxKind, number>; totalShare: number } {
  const amountShareByKind: Record<TaxKind, number> = {
    PROPERTY_TAX: 0,
    RENTAL_INCOME_TAX: 0
  };

  for (const computation of computations) {
    amountShareByKind[computation.taxKind] = roundMoneyXof(computation.amountFull * (sharePercent / 100));
  }

  const totalShare = amountShareByKind.PROPERTY_TAX + amountShareByKind.RENTAL_INCOME_TAX;

  return { amountShareByKind, totalShare };
}
