import { z } from 'zod';
import { isoDaySchema } from './charge-allocation-schemas';
import { GRID_LIMITS } from './charge-receipt-pdf';

/**
 * Paramètres des routes des reçus et quittances (lot S3). Toute valeur hors
 * bornes répond 400 (ZodError).
 */

const optionalUuid = z.string().uuid().optional();
// Identifiant de contact CRM (texte libre en base) : borné, sans séparateur de chemin.
const optionalContactId = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'Identifiant de contact invalide')
  .optional();

function checkRange(value: { from?: Date; to?: Date }, ctx: z.RefinementCtx) {
  if (value.from && value.to && value.from.getTime() > value.to.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'La date de debut doit preceder la date de fin',
      path: ['to']
    });
  }
}

export const receiptListQuerySchema = z
  .object({
    lotId: optionalUuid,
    contactId: optionalContactId,
    kind: z.enum(['RECEIPT', 'QUITTANCE']).optional(),
    from: isoDaySchema.optional(),
    to: isoDaySchema.optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20)
  })
  .superRefine(checkRange);

export const receiptPrintQuerySchema = z
  .object({
    from: isoDaySchema,
    to: isoDaySchema,
    kind: z.enum(['QUITTANCE', 'RECEIPT', 'ALL']).default('QUITTANCE'),
    lotId: optionalUuid,
    contactId: optionalContactId,
    cols: z.coerce.number().int().min(GRID_LIMITS.minCols).max(GRID_LIMITS.maxCols).default(2),
    rows: z.coerce.number().int().min(GRID_LIMITS.minRows).max(GRID_LIMITS.maxRows).default(2)
  })
  .superRefine(checkRange);

export type ReceiptListQuery = z.infer<typeof receiptListQuerySchema>;
export type ReceiptPrintQuery = z.infer<typeof receiptPrintQuerySchema>;
