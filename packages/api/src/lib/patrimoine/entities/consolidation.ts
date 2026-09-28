import { grossYield, netYield, netNetYield, latentCapitalGain, type YieldInput } from '../yield';

/**
 * Consolidation patrimoniale d'une entité détentrice — agrégation PURE,
 * pondérée par les quotes-parts (lot P4, territoire A2). Contrat : section 3
 * de `p4-contrat.md`.
 *
 * Ce fichier ne dépend d'aucune donnée Prisma : `consolidation-service.ts`
 * charge les `YieldInput` (via `yield-input-adapter.ts`, seul point d'appel
 * de `buildPropertyYieldInput`) et la dette de chaque bien, puis appelle
 * `consolidateHoldings`.
 */

export interface ConsolidationHoldingInput {
  propertyId: string;
  title: string;
  internalReference: string;
  /** En pourcentage : 50 pour 50 %. */
  sharePercent: number;
  /** Rattachement à `effectiveFrom` futur : exclu des totaux. */
  pending: boolean;
  /** Chiffres du bien à 100 % de détention. */
  yieldInput: YieldInput;
  /** Capital restant dû des prêts ACTIFS du bien, à 100 % de détention. */
  outstandingDebt: number;
}

export interface ConsolidationPropertyResult {
  propertyId: string;
  title: string;
  internalReference: string;
  sharePercent: number;
  pending: boolean;
  estimatedValue: number;
  outstandingDebt: number;
  annualRent: number;
  annualExpenses: number;
  annualLoanPayments: number;
  annualCashFlow: number;
  grossYield: number;
  netYield: number;
}

export interface ConsolidationTotals {
  propertiesCount: number;
  estimatedValue: number;
  outstandingDebt: number;
  netEquity: number;
  annualRent: number;
  annualExpenses: number;
  annualLoanPayments: number;
  annualCashFlow: number;
  grossYield: number;
  netYield: number;
  netNetYield: number | null;
  latentCapitalGain: number | null;
  costBasisIncomplete: boolean;
}

export interface ConsolidationResult {
  totals: ConsolidationTotals;
  properties: ConsolidationPropertyResult[];
}

/** Part d'une valeur à 100 % ramenée à la quote-part détenue. */
function shareOf(value: number, sharePercent: number): number {
  return value * (sharePercent / 100);
}

function hasKnownCostBasis(input: YieldInput): boolean {
  return Number.isFinite(input.costBasis) && input.costBasis > 0;
}

/**
 * Agrège les rattachements d'une entité. Les rattachements `pending` (date
 * d'effet future) figurent dans `properties` mais sont exclus de `totals`.
 * `costBasisIncomplete` est vrai dès qu'un rattachement compté dans les
 * totaux porte un coût de revient inconnu (0) : `netNetYield` et
 * `latentCapitalGain` agrégés valent alors `null`, comme au niveau d'un bien
 * seul (`lib/patrimoine/yield.ts`).
 */
export function consolidateHoldings(holdings: ConsolidationHoldingInput[]): ConsolidationResult {
  const properties: ConsolidationPropertyResult[] = holdings.map(holding => {
    const { yieldInput, sharePercent } = holding;
    const annualRent = shareOf(yieldInput.annualRent, sharePercent);
    const annualExpenses = shareOf(yieldInput.annualExpenses, sharePercent);
    const annualLoanPayments = shareOf(yieldInput.annualLoanPayments, sharePercent);

    return {
      propertyId: holding.propertyId,
      title: holding.title,
      internalReference: holding.internalReference,
      sharePercent,
      pending: holding.pending,
      estimatedValue: shareOf(yieldInput.currentValue, sharePercent),
      outstandingDebt: shareOf(holding.outstandingDebt, sharePercent),
      annualRent,
      annualExpenses,
      annualLoanPayments,
      annualCashFlow: annualRent - annualExpenses - annualLoanPayments,
      // Un rendement est un ratio (loyer / valeur) : la quote-part
      // s'applique aux deux termes et s'annule, il se lit donc directement
      // sur le YieldInput du bien à 100 %.
      grossYield: grossYield(yieldInput),
      netYield: netYield(yieldInput)
    };
  });

  const counted = properties.filter(p => !p.pending);
  const countedHoldings = holdings.filter(h => !h.pending);

  const totalEstimatedValue = counted.reduce((sum, p) => sum + p.estimatedValue, 0);
  const totalOutstandingDebt = counted.reduce((sum, p) => sum + p.outstandingDebt, 0);
  const totalAnnualRent = counted.reduce((sum, p) => sum + p.annualRent, 0);
  const totalAnnualExpenses = counted.reduce((sum, p) => sum + p.annualExpenses, 0);
  const totalAnnualLoanPayments = counted.reduce((sum, p) => sum + p.annualLoanPayments, 0);
  const totalAnnualCashFlow = totalAnnualRent - totalAnnualExpenses - totalAnnualLoanPayments;

  const costBasisIncomplete = countedHoldings.some(h => !hasKnownCostBasis(h.yieldInput));
  const totalCostBasis = costBasisIncomplete
    ? 0
    : countedHoldings.reduce((sum, h) => sum + shareOf(h.yieldInput.costBasis, h.sharePercent), 0);

  const aggregated: YieldInput = {
    annualRent: totalAnnualRent,
    currentValue: totalEstimatedValue,
    costBasis: totalCostBasis,
    annualExpenses: totalAnnualExpenses,
    annualLoanPayments: totalAnnualLoanPayments
  };

  const totals: ConsolidationTotals = {
    propertiesCount: counted.length,
    estimatedValue: totalEstimatedValue,
    outstandingDebt: totalOutstandingDebt,
    netEquity: totalEstimatedValue - totalOutstandingDebt,
    annualRent: totalAnnualRent,
    annualExpenses: totalAnnualExpenses,
    annualLoanPayments: totalAnnualLoanPayments,
    annualCashFlow: totalAnnualCashFlow,
    grossYield: grossYield(aggregated),
    netYield: netYield(aggregated),
    netNetYield: netNetYield(aggregated),
    latentCapitalGain: latentCapitalGain(aggregated),
    costBasisIncomplete
  };

  return { totals, properties };
}
