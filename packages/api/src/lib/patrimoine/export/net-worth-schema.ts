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
      // Bornes : une année < 0100 est reportée en 19xx par Date.UTC et donnait une erreur trompeuse sur `from`.
      .refine(v => v >= '1970-01-01' && v <= '2100-12-31', 'Date comprise entre 1970 et 2100 attendue')
      .optional()
  })
  .strict();

export type NetWorthExportQuery = z.infer<typeof netWorthExportQuerySchema>;
