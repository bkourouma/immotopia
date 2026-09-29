import { z } from 'zod';

/**
 * `GET /tenants/:tenantId/patrimoine/net-worth/export` : format obligatoire
 * (PDF ou Excel), date de calcul facultative (`AAAA-MM-JJ`, aujourd'hui par défaut).
 */
export const netWorthExportQuerySchema = z
  .object({
    format: z.enum(['pdf', 'xlsx'], { errorMap: () => ({ message: "Format attendu : 'pdf' ou 'xlsx'" }) }),
    asOf: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date AAAA-MM-JJ attendue')
      .optional()
  })
  .strict();

export type NetWorthExportQuery = z.infer<typeof netWorthExportQuerySchema>;
