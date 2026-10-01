import { z } from 'zod';

/**
 * Validation Zod du plan de trésorerie prévisionnel (spec 030, lot A2).
 * Schémas `.strict()` : un paramètre inconnu est refusé, pas ignoré.
 */

/** Nombre décimal écrit en toutes lettres de chiffres (« 1500000 », « -250000.5 ») : pas de chaîne vide, pas de « abc ». */
const decimalString = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d+)?$/, 'Nombre attendu')
  .transform(Number)
  .refine(value => Number.isFinite(value) && Math.abs(value) <= 1e13, 'Montant hors limites');

export const cashPlanQuerySchema = z
  .object({
    months: z.enum(['12', '24']).transform(Number).default('12'),
    openingBalance: decimalString.optional(),
    propertyId: z.string().uuid().optional()
  })
  .strict();

export type CashPlanQuery = z.infer<typeof cashPlanQuerySchema>;

/** Jours maximum de chaque mois, février à 29 (année bissextile) : le plan ramène le 29 au 28 les autres années. */
const MAX_DAY_BY_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Date d'exigibilité annuelle de la taxe foncière : les deux champs nuls
 * (effacer) ou les deux renseignés, le jour devant exister dans le mois.
 */
export const cashPlanSettingsSchema = z
  .object({
    propertyTaxDueMonth: z.number().int().min(1).max(12).nullable(),
    propertyTaxDueDay: z.number().int().min(1).max(31).nullable()
  })
  .strict()
  .superRefine((value, ctx) => {
    const { propertyTaxDueMonth: month, propertyTaxDueDay: day } = value;
    if ((month === null) !== (day === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [month === null ? 'propertyTaxDueMonth' : 'propertyTaxDueDay'],
        message: "Le mois et le jour de l'échéance vont ensemble : renseignez les deux ou aucun"
      });
      return;
    }
    if (month !== null && day !== null && day > MAX_DAY_BY_MONTH[month - 1]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['propertyTaxDueDay'],
        message: "Ce jour n'existe pas dans le mois choisi"
      });
    }
  });

export type CashPlanSettingsInput = z.infer<typeof cashPlanSettingsSchema>;
