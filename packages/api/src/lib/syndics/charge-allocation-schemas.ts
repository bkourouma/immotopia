import { z } from 'zod';
import { parseIsoDay } from './period';

/**
 * Schemas du lot S2 : paiements par lot, suivi mensuel et bornes de periode.
 */

/**
 * Date sans heure « AAAA-MM-JJ ». Une date-heure ISO est acceptee : seule sa
 * partie date est retenue (minuit UTC). « 2026-02-30 » est refusee.
 */
export const isoDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T[0-9:.]+(Z|[+-]\d{2}:?\d{2})?)?$/, 'Date attendue au format AAAA-MM-JJ')
  .transform((value, ctx) => {
    const day = parseIsoDay(value.slice(0, 10));
    if (!day) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Date invalide' });
      return z.NEVER;
    }
    return day;
  });

/** Champs facultatifs de bornes de periode, a verifier avec `checkPeriodBounds`. */
export const periodBoundsFields = {
  periodStart: isoDaySchema.optional().nullable(),
  periodEnd: isoDaySchema.optional().nullable()
};

/** Les deux bornes vont ensemble, et le debut ne depasse pas la fin. */
export function checkPeriodBounds(
  value: { periodStart?: Date | null; periodEnd?: Date | null },
  ctx: z.RefinementCtx
): void {
  const hasStart = Boolean(value.periodStart);
  const hasEnd = Boolean(value.periodEnd);
  if (hasStart !== hasEnd) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Les bornes de periode vont ensemble : debut et fin',
      path: [hasStart ? 'periodEnd' : 'periodStart']
    });
    return;
  }
  if (value.periodStart && value.periodEnd && value.periodStart.getTime() > value.periodEnd.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Le debut de la periode doit preceder sa fin',
      path: ['periodEnd']
    });
  }
}

export const lotPaymentSchema = z
  .object({
    amount: z.number().positive().max(9_999_999_999.99),
    paidAt: z.coerce.date(),
    method: z.string().trim().min(1).max(50),
    reference: z.string().trim().max(120).optional().nullable(),
    chargeCallIds: z.array(z.string().uuid()).max(120).optional()
  })
  .strict();

export const monthlyTrackingQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100)
});

export type LotPaymentBody = z.infer<typeof lotPaymentSchema>;
