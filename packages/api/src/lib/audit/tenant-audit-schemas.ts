import { z } from 'zod';

/**
 * Paramètres de `GET /tenants/:tenantId/audit`.
 *
 * `.strict()` : un paramètre inconnu est refusé en 400 plutôt qu'ignoré. C'est
 * ce qui fait d'un `?tenantId=autre-agence` glissé dans l'URL une erreur
 * visible et non un filtre silencieusement écarté. L'agence vient de l'URL
 * vérifiée par `requireTenantAccess`, jamais de la requête.
 */

const CATEGORIES = ['AUTH', 'DATA', 'ADMIN', 'SECURITY', 'BILLING', 'EXPORT', 'AI', 'SYSTEM'] as const;
const OUTCOMES = ['SUCCESS', 'FAILURE', 'DENIED'] as const;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` ou date-heure ISO ; renvoie `null` si illisible. */
function parseDate(value: string, endOfDay: boolean): Date | null {
  const iso = DATE_ONLY.test(value) ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z` : value;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateParam(endOfDay: boolean, message: string) {
  return z
    .string()
    .max(40)
    .transform((value, ctx) => {
      const date = parseDate(value, endOfDay);
      if (!date) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message });
        return z.NEVER;
      }
      return date;
    });
}

export const tenantAuditQuerySchema = z
  .object({
    category: z.enum(CATEGORIES).optional(),
    outcome: z.enum(OUTCOMES).optional(),
    actionKey: z
      .string()
      .max(100)
      .regex(/^[A-Z0-9_]+$/)
      .optional(),
    actorUserId: z.string().min(1).max(64).optional(),
    entityType: z.string().min(1).max(100).optional(),
    entityId: z.string().min(1).max(64).optional(),
    startDate: dateParam(false, 'Date de début invalide').optional(),
    endDate: dateParam(true, 'Date de fin invalide').optional(),
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional()
  })
  .strict();

export type TenantAuditQuery = z.infer<typeof tenantAuditQuerySchema>;
