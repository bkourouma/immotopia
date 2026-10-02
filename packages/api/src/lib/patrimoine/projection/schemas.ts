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

const NUMBER_ERRORS = { invalid_type_error: 'Un nombre est attendu', required_error: 'Champ obligatoire' };
const finiteNumber = () => z.number(NUMBER_ERRORS).finite('Un nombre fini est attendu');

const amount = finiteNumber()
  .gt(0, 'Le montant doit être supérieur à 0')
  .max(MAX_AMOUNT, 'Le montant est trop élevé (999 999 999 999,99 au plus)');
const percent = finiteNumber()
  .min(0, 'Le taux doit être compris entre 0 et 100')
  .max(100, 'Le taux doit être compris entre 0 et 100');
const growth = finiteNumber()
  .min(GROWTH_MIN, `La croissance doit être comprise entre ${GROWTH_MIN} et ${GROWTH_MAX} %`)
  .max(GROWTH_MAX, `La croissance doit être comprise entre ${GROWTH_MIN} et ${GROWTH_MAX} %`);
const inflation = finiteNumber()
  .min(INFLATION_MIN, `L'inflation doit être comprise entre ${INFLATION_MIN} et ${INFLATION_MAX} %`)
  .max(INFLATION_MAX, `L'inflation doit être comprise entre ${INFLATION_MIN} et ${INFLATION_MAX} %`);
const YEAR_ERROR = `L'année doit être un entier de 1 à ${MAX_HORIZON_YEARS}`;
const yearIndex = z.number(NUMBER_ERRORS).int(YEAR_ERROR).min(1, YEAR_ERROR).max(MAX_HORIZON_YEARS, YEAR_ERROR);
const identifier = z.string(NUMBER_ERRORS).min(1, 'Identifiant obligatoire').max(ID_MAX, 'Identifiant trop long');

const TERM_ERROR = `La durée doit être un entier de 1 à ${MAX_HORIZON_YEARS} ans`;
const FORBIDDEN_CHARACTER = 'Caractère interdit';

/** Nom saisi : rogné, non vide, borné, sans caractère nul (Postgres refuse `\u0000` dans un texte). */
function nameField(max: number) {
  return z
    .string({ invalid_type_error: 'Un texte est attendu', required_error: 'Champ obligatoire' })
    .trim()
    .min(1, 'Le nom est obligatoire')
    .max(max, `Le nom ne peut pas dépasser ${max} caractères`)
    .refine(value => !value.includes('\u0000'), FORBIDDEN_CHARACTER);
}

export const SCENARIO_KEYS = ['PRUDENT', 'CENTRAL', 'OPTIMISTIC'] as const;

const growthByClassShape = Object.fromEntries(
  ASSET_CLASSES.map(assetClass => [assetClass, growth.optional()])
) as Record<(typeof ASSET_CLASSES)[number], z.ZodOptional<z.ZodNumber>>;

export const projectionAssumptionsSchema = z
  .object({
    growthPercentByClass: z.object(growthByClassShape).strict().optional(),
    inflationPercent: inflation.optional()
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
      name: nameField(NAME_MAX),
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
      termYears: z.number(NUMBER_ERRORS).int(TERM_ERROR).min(1, TERM_ERROR).max(MAX_HORIZON_YEARS, TERM_ERROR)
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

const HORIZON_ERROR = `L'horizon doit être un entier de 1 à ${MAX_HORIZON_YEARS} ans`;
const horizonYears = z
  .number(NUMBER_ERRORS)
  .int(HORIZON_ERROR)
  .min(1, HORIZON_ERROR)
  .max(MAX_HORIZON_YEARS, HORIZON_ERROR);
const scenarioKey = z.enum(SCENARIO_KEYS);
const operations = z
  .array(simulationOperationSchema)
  .max(MAX_OPERATIONS, `Au plus ${MAX_OPERATIONS} opérations par simulation`);

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
    name: nameField(SCENARIO_NAME_MAX),
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
