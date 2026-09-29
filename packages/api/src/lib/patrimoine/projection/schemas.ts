/**
 * Schémas zod des corps de requête projections et scénarios (contrat :
 * `specs/025-patrimoine-projections-simulations/contracts/api.md`).
 * `.strict()` partout : un champ inattendu est rejeté. Les contrôles qui
 * croisent plusieurs champs (`year` ≤ `horizonYears`, `toYear` ≥ `fromYear`)
 * reportent l'erreur sur le champ fautif (`operations.<i>.year`).
 */

import { z } from 'zod';
import { ASSET_CLASSES } from '../assets';
import { GROWTH_MAX, GROWTH_MIN, INFLATION_MAX, INFLATION_MIN, MAX_HORIZON_YEARS, MAX_OPERATIONS } from './assumptions';

const MAX_AMOUNT = 999_999_999_999.99;
const NAME_MAX = 200;
const SCENARIO_NAME_MAX = 120;
const ID_MAX = 100;

const amount = z.number().finite().gt(0).max(MAX_AMOUNT);
const percent = z.number().finite().min(0).max(100);
const growth = z.number().finite().min(GROWTH_MIN).max(GROWTH_MAX);
const yearIndex = z.number().int().min(1).max(MAX_HORIZON_YEARS);
const identifier = z.string().min(1).max(ID_MAX);

export const SCENARIO_KEYS = ['PRUDENT', 'CENTRAL', 'OPTIMISTIC'] as const;

const growthByClassShape = Object.fromEntries(
  ASSET_CLASSES.map(assetClass => [assetClass, growth.optional()])
) as Record<(typeof ASSET_CLASSES)[number], z.ZodOptional<z.ZodNumber>>;

export const projectionAssumptionsSchema = z
  .object({
    growthPercentByClass: z.object(growthByClassShape).strict().optional(),
    inflationPercent: z.number().finite().min(INFLATION_MIN).max(INFLATION_MAX).optional()
  })
  .strict();

export const simulationOperationSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('SELL_ASSET'),
      year: yearIndex,
      assetId: identifier,
      salePrice: amount.optional(),
      feesPercent: percent.optional()
    })
    .strict(),
  z
    .object({
      type: z.literal('BUY_ASSET'),
      year: yearIndex,
      assetClass: z.enum(ASSET_CLASSES),
      name: z.string().trim().min(1).max(NAME_MAX),
      price: amount,
      growthPercent: growth.optional()
    })
    .strict(),
  z
    .object({
      type: z.literal('TAKE_LOAN'),
      year: yearIndex,
      amount,
      annualRatePercent: percent,
      termYears: z.number().int().min(1).max(MAX_HORIZON_YEARS)
    })
    .strict(),
  z.object({ type: z.literal('PREPAY_LOAN'), year: yearIndex, loanId: identifier, amount }).strict(),
  z
    .object({
      type: z.literal('MONTHLY_SAVING'),
      fromYear: yearIndex,
      toYear: yearIndex.optional(),
      amount
    })
    .strict()
]);

type Operation = z.infer<typeof simulationOperationSchema>;

interface WithOperations {
  horizonYears?: number;
  operations?: Operation[];
}

function addYearIssue(ctx: z.RefinementCtx, path: (string | number)[], message: string): void {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
}

/** `year`, `fromYear` et `toYear` doivent tenir dans l'horizon ; `toYear` ne précède pas `fromYear`. */
function refineOperations(value: WithOperations, ctx: z.RefinementCtx): void {
  const { horizonYears, operations } = value;
  if (horizonYears === undefined || !operations) return;
  const outside = `L'année doit être comprise entre 1 et ${horizonYears}`;
  operations.forEach((op, index) => {
    const path = ['operations', index];
    if (op.type !== 'MONTHLY_SAVING') {
      if (op.year > horizonYears) addYearIssue(ctx, [...path, 'year'], outside);
      return;
    }
    if (op.fromYear > horizonYears) addYearIssue(ctx, [...path, 'fromYear'], outside);
    if (op.toYear === undefined) return;
    if (op.toYear > horizonYears) addYearIssue(ctx, [...path, 'toYear'], outside);
    if (op.toYear < op.fromYear) addYearIssue(ctx, [...path, 'toYear'], "L'année de fin précède l'année de début");
  });
}

const horizonYears = z.number().int().min(1).max(MAX_HORIZON_YEARS);
const scenarioKey = z.enum(SCENARIO_KEYS);
const operations = z.array(simulationOperationSchema).max(MAX_OPERATIONS);

export const projectionRequestSchema = z
  .object({
    horizonYears,
    baseScenario: scenarioKey,
    assumptions: projectionAssumptionsSchema.optional(),
    operations: operations.optional(),
    compareScenarios: z.boolean().optional()
  })
  .strict()
  .superRefine(refineOperations);

const scenarioObject = z
  .object({
    name: z.string().trim().min(1).max(SCENARIO_NAME_MAX),
    horizonYears,
    baseScenario: scenarioKey,
    assumptions: projectionAssumptionsSchema.optional(),
    operations: operations.optional()
  })
  .strict();

export const scenarioBodySchema = scenarioObject.superRefine(refineOperations);

/** PATCH : champs facultatifs ; les années ne se croisent avec l'horizon que si les deux sont fournis. */
export const scenarioUpdateSchema = scenarioObject.partial().superRefine(refineOperations);

export type ProjectionRequestBody = z.infer<typeof projectionRequestSchema>;
export type ScenarioBody = z.infer<typeof scenarioBodySchema>;
export type ScenarioUpdateBody = z.infer<typeof scenarioUpdateSchema>;
