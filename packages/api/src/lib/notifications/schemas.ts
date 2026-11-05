import { z } from 'zod';
import { zSearch } from '../../utils/list-query-schemas';

/**
 * Paramètres des routes de notifications.
 *
 * `.strict()` : un paramètre inconnu (dont `tenantId` sur les routes d'agence)
 * est refusé en 400 au lieu d'être ignoré. L'agence vient de l'URL vérifiée par
 * `requireTenantAccess`, jamais de la requête.
 */

const CHANNELS = ['IN_APP', 'EMAIL', 'WHATSAPP', 'SMS'] as const;
const STATUSES = ['PENDING', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED'] as const;

const boolParam = z.enum(['true', 'false']).transform(v => v === 'true');
const pageParam = z.coerce.number().int().min(1).max(10000);
const pageSizeParam = z.coerce.number().int().min(1).max(100);

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function dateParam(endOfDay: boolean, message: string) {
  return z
    .string()
    .max(40)
    .transform((value, ctx) => {
      const iso = DATE_ONLY.test(value) ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z` : value;
      const date = new Date(iso);
      // Un jour impossible (2026-02-31) ne doit pas glisser au mois suivant.
      if (Number.isNaN(date.getTime()) || (DATE_ONLY.test(value) && date.toISOString().slice(0, 10) !== value)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message });
        return z.NEVER;
      }
      return date;
    });
}

/** GET /tenants/:tenantId/notifications */
export const myNotificationsQuerySchema = z
  .object({
    unreadOnly: boolParam.optional(),
    /** Recherche libre dans le titre et le message. */
    q: zSearch(200),
    from: dateParam(false, 'Date de début invalide').optional(),
    to: dateParam(true, 'Date de fin invalide').optional(),
    page: pageParam.optional(),
    pageSize: pageSizeParam.optional()
  })
  .strict();

export type MyNotificationsQuery = z.infer<typeof myNotificationsQuerySchema>;

const adminFilterShape = {
  recipientUserId: z.string().min(1).max(64).optional(),
  senderUserId: z.string().min(1).max(64).optional(),
  channel: z.enum(CHANNELS).optional(),
  status: z.enum(STATUSES).optional(),
  q: zSearch(200),
  from: dateParam(false, 'Date de début invalide').optional(),
  to: dateParam(true, 'Date de fin invalide').optional(),
  page: pageParam.optional(),
  pageSize: pageSizeParam.optional()
};

/** GET /tenants/:tenantId/admin/notifications */
export const adminNotificationsQuerySchema = z.object(adminFilterShape).strict();

/** GET /admin/notifications (plateforme) : le filtre `tenantId` y est permis. */
export const platformNotificationsQuerySchema = z
  .object({ ...adminFilterShape, tenantId: z.string().min(1).max(64).optional() })
  .strict();

/** GET /tenants/:tenantId/admin/notifications/recipients */
export const recipientsQuerySchema = z.object({ q: z.string().trim().max(200).optional() }).strict();

/** POST .../resend */
export const resendBodySchema = z.object({ channels: z.array(z.enum(CHANNELS)).max(4).optional() }).strict();

export const notificationIdParamSchema = z.object({ id: z.string().min(1).max(64) });
