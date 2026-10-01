import { z } from 'zod';
import { MaintenanceLogCategory } from '@prisma/client';
import { amountSchema, currencySchema, dateInputSchema, idSchema, uuidSchema } from './schemas';

/**
 * Validation Zod du carnet d'entretien (lot B1, spec 032). Schémas appelés
 * directement en tête de contrôleur avec `.parse()`, tous `.strict()` : un
 * champ inconnu (ex. `tenantId`, `createdByUserId`) est rejeté.
 *
 * Dates, montants et devise : schémas partagés de `schemas.ts` (`AAAA-MM-JJ` ou
 * ISO 8601 complet, montant à deux décimales au plus).
 */

const categorySchema = z.nativeEnum(MaintenanceLogCategory);
const descriptionSchema = z
  .string()
  .trim()
  .min(1, 'La description est requise.')
  .max(4000, 'La description ne peut pas dépasser 4000 caractères.');
const DATES_MESSAGE = (label: string) => `${label} ne peut pas précéder la date d'intervention.`;

/** Cohérence des dates quand l'intervention et l'échéance sont toutes deux fournies. */
function refineDates(
  value: { performedAt?: Date; nextDueDate?: Date | null; warrantyEndDate?: Date | null },
  ctx: z.RefinementCtx
): void {
  if (!value.performedAt) return;
  if (value.nextDueDate && value.nextDueDate < value.performedAt) {
    ctx.addIssue({ code: 'custom', path: ['nextDueDate'], message: DATES_MESSAGE('La prochaine échéance') });
  }
  if (value.warrantyEndDate && value.warrantyEndDate < value.performedAt) {
    ctx.addIssue({ code: 'custom', path: ['warrantyEndDate'], message: DATES_MESSAGE('La fin de garantie') });
  }
}

export const createMaintenanceLogEntrySchema = z
  .object({
    propertyId: idSchema,
    category: categorySchema,
    performedAt: dateInputSchema,
    description: descriptionSchema,
    vendorId: uuidSchema.nullable().optional(),
    cost: amountSchema.nullable().optional(),
    currency: currencySchema.optional(),
    nextDueDate: dateInputSchema.nullable().optional(),
    warrantyEndDate: dateInputSchema.nullable().optional(),
    documentId: idSchema.nullable().optional()
  })
  .strict()
  .superRefine(refineDates);

export const updateMaintenanceLogEntrySchema = z
  .object({
    category: categorySchema.optional(),
    performedAt: dateInputSchema.optional(),
    description: descriptionSchema.optional(),
    vendorId: uuidSchema.nullable().optional(),
    cost: amountSchema.nullable().optional(),
    currency: currencySchema.optional(),
    nextDueDate: dateInputSchema.nullable().optional(),
    warrantyEndDate: dateInputSchema.nullable().optional(),
    documentId: idSchema.nullable().optional()
  })
  .strict()
  .superRefine(refineDates);

export const listMaintenanceLogQuerySchema = z
  .object({
    propertyId: idSchema,
    category: categorySchema.optional()
  })
  .strict();

export const exportMaintenanceLogQuerySchema = z.object({ propertyId: idSchema }).strict();

export type CreateMaintenanceLogEntryInput = z.infer<typeof createMaintenanceLogEntrySchema>;
export type UpdateMaintenanceLogEntryInput = z.infer<typeof updateMaintenanceLogEntrySchema>;
export type ListMaintenanceLogQuery = z.infer<typeof listMaintenanceLogQuerySchema>;
