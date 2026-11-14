import { Request, Response } from 'express';
import { t } from '../i18n';
import { asyncHandler, BadRequestError, UnauthorizedError } from '../middleware/error-middleware';
import { createHelpFeedbackSchema, listHelpFeedbackQuerySchema } from '../lib/help/help-feedback-schemas';
import {
  createHelpFeedback,
  listHelpFeedbackSummary,
  resolveFeedbackTenantId
} from '../services/help-feedback-service';

/** Même en-tête que `middleware/tenant-portal-access.ts` (choix d'agence d'un client de portail). */
const PORTAL_TENANT_HEADER = 'x-portal-tenant-id';

function readPortalTenantHeader(req: Request): string | undefined {
  const raw = req.headers[PORTAL_TENANT_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() || undefined;
}

/** `POST /api/help/feedback` : corps `{ id }` exactement (contrat figé pour le web). */
export const createHelpFeedbackHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) throw new UnauthorizedError();
  const body = createHelpFeedbackSchema.parse(req.body ?? {});
  // L'agence n'est jamais lue du corps : déduite du chemin ou de l'en-tête, puis vérifiée en base.
  const tenantId = await resolveFeedbackTenantId(userId, {
    path: body.path,
    portalTenantHeader: readPortalTenantHeader(req)
  });
  const created = await createHelpFeedback(userId, body, tenantId);
  res.status(201).json({ id: created.id });
});

/** `GET /api/admin/help-feedback` (super-admin) : tous les avis, avec le nom de l'agence. */
export const listPlatformHelpFeedbackHandler = asyncHandler(async (req: Request, res: Response) => {
  const { days } = listHelpFeedbackQuerySchema.parse(req.query ?? {});
  res.json(await listHelpFeedbackSummary({ days }));
});

/** `GET /api/tenants/:tenantId/help-feedback` : agence du contexte posé par `requireTenantAccess`, jamais un paramètre. */
export const listTenantHelpFeedbackHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.tenantContext?.tenantId;
  if (!tenantId) throw new BadRequestError(t("Contexte d'agence requis pour consulter les avis d'aide."));
  const { days } = listHelpFeedbackQuerySchema.parse(req.query ?? {});
  res.json(await listHelpFeedbackSummary({ days, tenantId }));
});
