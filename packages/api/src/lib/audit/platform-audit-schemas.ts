import { z } from 'zod';

/**
 * Paramètres de `GET /admin/audit` et `GET /admin/audit/export` (ADR-006, phase 4).
 *
 * `.strict()` : un paramètre inconnu — dont les anciens alias `action`,
 * `resourceType`, `userId`, et `page` — est refusé en 400 plutôt qu'ignoré. Le
 * lecteur plateforme ne pose aucun filtre implicite : tout ce qui réduit la
 * lecture est explicite et validé ici.
 */

const CATEGORIES = ['AUTH', 'DATA', 'ADMIN', 'SECURITY', 'BILLING', 'EXPORT', 'AI', 'SYSTEM'] as const;
const OUTCOMES = ['SUCCESS', 'FAILURE', 'DENIED'] as const;
const ACTOR_TYPES = ['USER', 'SUPER_ADMIN', 'PORTAL', 'SYSTEM', 'AI'] as const;
const SCOPES = ['TENANT', 'PLATFORM'] as const;
const VISIBILITIES = ['TENANT', 'PLATFORM_ONLY'] as const;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

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

const filterShape = {
  tenantId: z.string().min(1).max(64).optional(),
  scope: z.enum(SCOPES).optional(),
  visibility: z.enum(VISIBILITIES).optional(),
  category: z.enum(CATEGORIES).optional(),
  outcome: z.enum(OUTCOMES).optional(),
  actorType: z.enum(ACTOR_TYPES).optional(),
  actionKey: z
    .string()
    .max(100)
    .regex(/^[A-Z0-9_]+$/)
    .optional(),
  actorUserId: z.string().min(1).max(64).optional(),
  entityType: z.string().min(1).max(100).optional(),
  entityId: z.string().min(1).max(64).optional(),
  requestId: z
    .string()
    .max(64)
    .regex(/^[A-Za-z0-9._-]+$/)
    .optional(),
  startDate: dateParam(false, 'Date de début invalide').optional(),
  endDate: dateParam(true, 'Date de fin invalide').optional()
};

export const platformAuditQuerySchema = z
  .object({
    ...filterShape,
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional()
  })
  .strict();

/** Export : mêmes filtres, ni curseur ni taille de page (le plafond est celui de l'export). */
export const platformAuditExportQuerySchema = z.object(filterShape).strict();

export type PlatformAuditQuery = z.infer<typeof platformAuditQuerySchema>;
export type PlatformAuditExportQuery = z.infer<typeof platformAuditExportQuerySchema>;
