import { z } from 'zod';

/**
 * Paramètres de `GET /admin/audit/integrity` (ADR-006, phase 5). `.strict()` : un
 * paramètre inconnu est refusé. Les dates sont des jours UTC (`AAAA-MM-JJ`) ;
 * sans période, les 500 scellés les plus récents sont revérifiés.
 */
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ')
  .transform((value, ctx) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    // V8 reporte « 2026-02-31 » au 3 mars : on exige l'aller-retour exact.
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Date invalide' });
      return z.NEVER;
    }
    return date;
  });

export const auditIntegrityQuerySchema = z
  .object({ from: day.optional(), to: day.optional() })
  .strict()
  .refine(q => !q.from || !q.to || q.from <= q.to, { message: 'from doit précéder to', path: ['from'] });

export type AuditIntegrityQuery = z.infer<typeof auditIntegrityQuerySchema>;
