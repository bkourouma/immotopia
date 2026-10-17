import { z } from 'zod';
import { t } from '../../../i18n';
import { parseIsoDate } from '../business-days';

/**
 * Validation des corps et requêtes du retour banque (spec 042, P3, data-model
 * §8.3 à §8.7). Les dates restent des chaînes `AAAA-MM-JJ` : le service les
 * compare à la date de prélèvement et à aujourd'hui.
 */

const emptyToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value);

const isoDate = (message: string) =>
  z
    .string()
    .trim()
    .refine(value => parseIsoDate(value) !== null, { message });

export const settleLineSchema = z
  .object({ settledAt: isoDate(t('Date de règlement invalide (AAAA-MM-JJ).')) })
  .strict();
export type SettleLineInput = z.infer<typeof settleLineSchema>;

export const rejectLineSchema = z
  .object({
    rejectedAt: isoDate(t('Date de rejet invalide (AAAA-MM-JJ).')),
    code: z
      .preprocess(
        emptyToNull,
        z
          .string()
          .trim()
          .min(1)
          .max(20)
          .regex(/^[A-Za-z0-9_-]+$/, { message: t('Code de rejet invalide (lettres, chiffres, tiret).') })
          .nullable()
      )
      .optional(),
    reason: z.preprocess(emptyToNull, z.string().trim().min(1).max(500).nullable()).optional()
  })
  .strict()
  .refine(value => Boolean(value.code) || Boolean(value.reason), {
    message: t('Indiquez un code ou un motif de rejet.'),
    path: ['reason']
  });
export type RejectLineInput = z.infer<typeof rejectLineSchema>;

export const settleAllSchema = z.object({ settledAt: isoDate(t('Date de règlement invalide (AAAA-MM-JJ).')) }).strict();
export type SettleAllInput = z.infer<typeof settleAllSchema>;

export const listReturnImportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});
export type ListReturnImportsQuery = z.infer<typeof listReturnImportsQuerySchema>;

/** Format du fichier de retour ; absent : GENERIC_CSV. */
export const returnFormatSchema = z.enum(['GENERIC_CSV']).optional();
