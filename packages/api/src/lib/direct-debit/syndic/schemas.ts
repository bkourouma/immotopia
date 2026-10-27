import { z } from 'zod';
import { parseIsoDate } from '../business-days';

/**
 * Validation des corps et requêtes des remises de prélèvement d'un syndicat
 * (spec 042, P4, data-model §9.4). Le créancier de la remise est toujours celui
 * du syndicat : aucun `creditorId` dans le corps (un champ inconnu est refusé).
 */

const emptyToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value);

export const createSyndicRemittanceSchema = z
  .object({
    collectionDate: z
      .string()
      .trim()
      .refine(value => parseIsoDate(value) !== null, { message: 'Date de prélèvement invalide (AAAA-MM-JJ)' })
      .transform(value => parseIsoDate(value) as Date),
    notes: z.preprocess(emptyToNull, z.string().trim().max(2000).nullable()).optional()
  })
  .strict();
export type CreateSyndicRemittanceInput = z.infer<typeof createSyndicRemittanceSchema>;

export const listSyndicRemittancesQuerySchema = z.object({
  status: z.enum(['DRAFT', 'VALIDATED', 'EXPORTED', 'SUBMITTED', 'CANCELED']).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});
export type ListSyndicRemittancesQuery = z.infer<typeof listSyndicRemittancesQuerySchema>;
