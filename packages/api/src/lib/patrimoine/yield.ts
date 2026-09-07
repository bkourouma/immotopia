export interface YieldInput {
  annualRent: number;
  currentValue: number;
  acquisitionCost: number;
  annualExpenses: number;
  annualLoanPayments: number;
}

export interface YieldProjection {
  year: number;
  estimatedValue: number;
  cumulativeRent: number;
  cumulativeExpenses: number;
  netResult: number;
}

export interface YieldProjectedSummary {
  year: number;
  grossYield: number;
  netYield: number;
  netNetYield: number;
  latentCapitalGain: number;
}

function safePercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return (numerator / denominator) * 100;
}

export function grossYield(input: YieldInput): number {
  return safePercent(input.annualRent, input.currentValue);
}

export function netYield(input: YieldInput): number {
  return safePercent(input.annualRent - input.annualExpenses, input.currentValue);
}

export function netNetYield(input: YieldInput): number {
  return safePercent(input.annualRent - input.annualExpenses - input.annualLoanPayments, input.acquisitionCost);
}

export function latentCapitalGain(input: YieldInput): number {
  return input.currentValue - input.acquisitionCost;
}

export function projectYield(
  input: YieldInput,
  years: number,
  assumptions: {
    valueGrowthRate: number;
    rentGrowthRate: number;
    expenseGrowthRate: number;
    vacancyRate: number;
  }
): YieldProjection[] {
  const projections: YieldProjection[] = [];
  let value = input.currentValue;
  let annualRent = input.annualRent;
  let annualExpenses = input.annualExpenses;
  let cumulativeRent = 0;
  let cumulativeExpenses = 0;

  for (let year = 1; year <= years; year += 1) {
    value *= 1 + assumptions.valueGrowthRate;
    annualRent *= 1 + assumptions.rentGrowthRate;
    annualExpenses *= 1 + assumptions.expenseGrowthRate;

    const effectiveRent = annualRent * (1 - assumptions.vacancyRate);
    cumulativeRent += effectiveRent;
    cumulativeExpenses += annualExpenses;

    projections.push({
      year,
      estimatedValue: value,
      cumulativeRent,
      cumulativeExpenses,
      netResult: cumulativeRent - cumulativeExpenses - input.annualLoanPayments * year
    });
  }

  return projections;
}

export function projectedYieldAtHorizon(
  input: YieldInput,
  years: number,
  assumptions: {
    valueGrowthRate: number;
    rentGrowthRate: number;
    expenseGrowthRate: number;
    vacancyRate: number;
  }
): YieldProjectedSummary {
  const value = input.currentValue * (1 + assumptions.valueGrowthRate) ** years;
  const annualRent = input.annualRent * (1 + assumptions.rentGrowthRate) ** years * (1 - assumptions.vacancyRate);
  const annualExpenses = input.annualExpenses * (1 + assumptions.expenseGrowthRate) ** years;

  return {
    year: years,
    grossYield: safePercent(annualRent, value),
    netYield: safePercent(annualRent - annualExpenses, value),
    netNetYield: safePercent(annualRent - annualExpenses - input.annualLoanPayments, input.acquisitionCost),
    latentCapitalGain: value - input.acquisitionCost
  };
}
