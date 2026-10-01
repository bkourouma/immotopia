import { Prisma } from '@prisma/client';

/**
 * Frais de régularisation et progression d'un dossier foncier (spec 033).
 *
 * Chiffre SÉPARÉ : il n'entre ni dans le coût de revient ni dans le rendement
 * (`lib/patrimoine/yield.ts` n'est pas touché par ce lot). Les montants sont
 * additionnés en `Prisma.Decimal`, jamais en flottant.
 */

type DecimalLike = Prisma.Decimal | number | string | null | undefined;

export interface FeeStep {
  costXof: DecimalLike;
}

export interface ProgressStep {
  required: boolean;
  status: string;
}

export interface RegularizationProgress {
  total: number;
  required: number;
  completed: number;
  completedRequired: number;
  percent: number;
}

function toDecimal(value: DecimalLike): Prisma.Decimal {
  if (value === null || value === undefined) return new Prisma.Decimal(0);
  return new Prisma.Decimal(value);
}

/** Somme exacte des coûts de TOUTES les étapes (une étape sans coût compte 0). */
export function totalFees(steps: readonly FeeStep[]): Prisma.Decimal {
  return steps.reduce((sum, step) => sum.plus(toDecimal(step.costXof)), new Prisma.Decimal(0));
}

/** Total des frais en nombre, arrondi au centime (la colonne est en 2 décimales). */
export function totalFeesAsNumber(steps: readonly FeeStep[]): number {
  return totalFees(steps).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

/** Avancement : percent = étapes TERMINEE / total × 100, arrondi (0 sans étape). */
export function computeProgress(steps: readonly ProgressStep[]): RegularizationProgress {
  const total = steps.length;
  const completedSteps = steps.filter(step => step.status === 'TERMINEE');
  const requiredSteps = steps.filter(step => step.required);
  const completed = completedSteps.length;
  return {
    total,
    required: requiredSteps.length,
    completed,
    completedRequired: requiredSteps.filter(step => step.status === 'TERMINEE').length,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100)
  };
}
