import { z } from 'zod';
import { isoDaySchema } from './charge-allocation-schemas';

/**
 * Paramètres des routes du portail copropriétaire enrichi (lot S5). Toute
 * valeur hors bornes répond 400 (ZodError) ; un identifiant de chemin mal
 * formé répond 404, comme un objet inexistant (voir le contrôleur).
 */

const optionalUuid = z.string().uuid().optional();
const yearSchema = z.coerce.number().int().min(2000).max(2100);

function checkRange(value: { from?: Date; to?: Date }, ctx: z.RefinementCtx) {
  if (value.from && value.to && value.from.getTime() > value.to.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'La date de debut doit preceder la date de fin',
      path: ['to']
    });
  }
}

/** `GET /paiements?lotId=&year=` */
export const coOwnerPaymentsQuerySchema = z.object({
  lotId: optionalUuid,
  year: yearSchema.optional()
});

/** `GET /quittances?lotId=&kind=&from=&to=&page=&limit=` */
export const coOwnerReceiptsQuerySchema = z
  .object({
    lotId: optionalUuid,
    kind: z.enum(['RECEIPT', 'QUITTANCE']).optional(),
    from: isoDaySchema.optional(),
    to: isoDaySchema.optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20)
  })
  .superRefine(checkRange);

/** `GET /lots/:lotId/releve?from=&to=` */
export const coOwnerStatementQuerySchema = z
  .object({
    from: isoDaySchema.optional(),
    to: isoDaySchema.optional()
  })
  .superRefine(checkRange);

/** `GET /lots/:lotId/suivi-mensuel?year=` (année courante par défaut, voir le contrôleur). */
export const coOwnerMonthlyQuerySchema = z.object({ year: yearSchema });

export type CoOwnerPaymentsQuery = z.infer<typeof coOwnerPaymentsQuerySchema>;
export type CoOwnerReceiptsQuery = z.infer<typeof coOwnerReceiptsQuerySchema>;
export type CoOwnerStatementQuery = z.infer<typeof coOwnerStatementQuerySchema>;
