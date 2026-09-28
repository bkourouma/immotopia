import { z } from 'zod';
import { isoDaySchema } from './charge-allocation-schemas';

/**
 * Corps et paramètres des routes de programmation des appels de charges
 * (lot S4). Toute valeur hors bornes répond 400 (ZodError). Les règles qui
 * croisent plusieurs champs (source et montant, dates) sont vérifiées ici
 * pour la création, et par le service après fusion avec l'existant pour une
 * modification.
 */

const frequencySchema = z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL']);
const amountSourceSchema = z.enum(['BUDGET', 'FIXED']);

const scheduleFields = {
  label: z.string().trim().min(1, 'Le libelle est obligatoire').max(120),
  frequency: frequencySchema,
  // 1 a 28 : un jour qui existe dans tous les mois.
  issueDay: z.number().int().min(1).max(28),
  dueOffsetDays: z.number().int().min(0).max(365),
  amountSource: amountSourceSchema,
  budgetId: z.string().uuid().nullable().optional(),
  fixedAmount: z.number().positive().max(9_999_999_999.99).nullable().optional(),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}$/, 'Devise attendue sur trois lettres (ex. XOF)')
    .optional(),
  startDate: isoDaySchema,
  endDate: isoDaySchema.nullable().optional()
};

export interface ScheduleConsistencyInput {
  amountSource: 'BUDGET' | 'FIXED';
  budgetId?: string | null;
  fixedAmount?: number | null;
  startDate: Date;
  endDate?: Date | null;
}

/** Messages des règles croisées, partagés par le schéma et le service. */
export function scheduleConsistencyIssues(value: ScheduleConsistencyInput): Array<{ field: string; message: string }> {
  const issues: Array<{ field: string; message: string }> = [];
  if (value.amountSource === 'FIXED' && !value.fixedAmount) {
    issues.push({ field: 'fixedAmount', message: 'Le montant fixe est obligatoire pour un montant fixe' });
  }
  if (value.amountSource === 'FIXED' && value.budgetId) {
    issues.push({ field: 'budgetId', message: "Un montant fixe ne s'appuie sur aucun budget" });
  }
  if (value.amountSource === 'BUDGET' && value.fixedAmount) {
    issues.push({ field: 'fixedAmount', message: 'Un montant tire du budget ne prend pas de montant fixe' });
  }
  if (value.endDate && value.endDate.getTime() < value.startDate.getTime()) {
    issues.push({ field: 'endDate', message: 'La date de fin doit suivre la date de debut' });
  }
  return issues;
}

export const createChargeScheduleSchema = z
  .object({ ...scheduleFields, active: z.boolean().optional() })
  .strict()
  .superRefine((value, ctx) => {
    for (const issue of scheduleConsistencyIssues(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue.message, path: [issue.field] });
    }
  });

export const updateChargeScheduleSchema = z
  .object({
    label: scheduleFields.label.optional(),
    frequency: frequencySchema.optional(),
    issueDay: scheduleFields.issueDay.optional(),
    dueOffsetDays: scheduleFields.dueOffsetDays.optional(),
    amountSource: amountSourceSchema.optional(),
    budgetId: scheduleFields.budgetId,
    fixedAmount: scheduleFields.fixedAmount,
    currency: scheduleFields.currency,
    startDate: isoDaySchema.optional(),
    endDate: scheduleFields.endDate
  })
  .strict()
  .refine(value => Object.keys(value).length > 0, { message: 'Au moins un champ doit etre fourni' });

export const scheduleRunsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export type CreateChargeScheduleInput = z.infer<typeof createChargeScheduleSchema>;
export type UpdateChargeScheduleInput = z.infer<typeof updateChargeScheduleSchema>;
