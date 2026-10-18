import { z } from 'zod';
import { parseIsoDate } from './business-days';

/**
 * Validation des corps et requêtes des remises de prélèvement (spec 042, P2,
 * data-model §7.6). `collectionDate` arrive en `AAAA-MM-JJ` et devient une date
 * à minuit UTC. Les corps sont stricts (un champ inconnu est refusé, comme en P1) ;
 * la requête de liste ignore les paramètres inconnus, comme celle des mandats.
 */

const emptyToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value);

export const createRemittanceSchema = z
  .object({
    creditorId: z.string().uuid(),
    collectionDate: z
      .string()
      .trim()
      .refine(value => parseIsoDate(value) !== null, { message: 'Date de prélèvement invalide (AAAA-MM-JJ)' })
      .transform(value => parseIsoDate(value) as Date),
    notes: z.preprocess(emptyToNull, z.string().trim().max(2000).nullable()).optional()
  })
  .strict();
export type CreateRemittanceInput = z.infer<typeof createRemittanceSchema>;

export const cancelLineSchema = z
  .object({
    reason: z.preprocess(emptyToNull, z.string().trim().max(500).nullable()).optional()
  })
  .strict();
export type CancelLineInput = z.infer<typeof cancelLineSchema>;

export const cancelRemittanceSchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict();
export type CancelRemittanceInput = z.infer<typeof cancelRemittanceSchema>;

export const REMITTANCE_STATUSES = ['DRAFT', 'VALIDATED', 'EXPORTED', 'SUBMITTED', 'CANCELED'] as const;

export const listRemittancesQuerySchema = z.object({
  creditorId: z.string().uuid().optional(),
  status: z.enum(REMITTANCE_STATUSES).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});
export type ListRemittancesQuery = z.infer<typeof listRemittancesQuerySchema>;
