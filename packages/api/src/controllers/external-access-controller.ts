import { Request, Response } from 'express';
import { t } from '../i18n';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import {
  accessLogQuerySchema,
  createExternalAccessGrant,
  createGrantSchema,
  getExternalAccessGrantDetail,
  getExternalAccessScopeOptions,
  grantIdParamSchema,
  listExternalAccessGrants,
  listExternalAccessLog,
  listPropertyDocumentsForSharing,
  revokeExternalAccessGrant,
  sendExternalAccessLink,
  sendLinkSchema,
  updateExternalAccessGrant,
  updateGrantSchema
} from '../lib/external-access';

/**
 * Accès en lecture seule des tiers de confiance — API d'agence (lot B3).
 * Contrat : `/tenants/:tenantId/patrimoine/external-access`. Les permissions
 * (`PROPERTIES_VIEW` / `PROPERTIES_EDIT`) sont posées par les routes ; chaque
 * identifiant reçu est vérifié par agence dans `lib/external-access`.
 *
 * Les corps sont lus avec zod (`.parse`, jamais d'abandon silencieux) : un
 * `ZodError` remonte par `asyncHandler` jusqu'à l'`errorHandler` (400).
 */

function tenantIdOf(req: Request): string {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) throw new BadRequestError(t('TenantId manquant'));
  return tenantId;
}

const actorOf = (req: Request): string | null => req.user?.userId ?? null;

function grantIdOf(req: Request): string {
  return grantIdParamSchema.parse(req.params.grantId);
}

export const listExternalAccessGrantsHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await listExternalAccessGrants(tenantIdOf(req)) });
});

export const getExternalAccessScopeOptionsHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await getExternalAccessScopeOptions(tenantIdOf(req)) });
});

export const listPropertyDocumentsForSharingHandler = asyncHandler(async (req: Request, res: Response) => {
  const propertyId = grantIdParamSchema.parse(req.params.propertyId);
  res.json({ success: true, data: await listPropertyDocumentsForSharing(tenantIdOf(req), propertyId) });
});

export const createExternalAccessGrantHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = createGrantSchema.parse(req.body ?? {});
  // L'URL (donc le jeton) n'est renvoyée qu'ici, une seule fois.
  const data = await createExternalAccessGrant(tenantIdOf(req), actorOf(req), body);
  res.status(201).json({ success: true, data });
});

export const getExternalAccessGrantHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await getExternalAccessGrantDetail(tenantIdOf(req), grantIdOf(req)) });
});

export const updateExternalAccessGrantHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = updateGrantSchema.parse(req.body ?? {});
  res.json({
    success: true,
    data: await updateExternalAccessGrant(tenantIdOf(req), actorOf(req), grantIdOf(req), body)
  });
});

export const revokeExternalAccessGrantHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({
    success: true,
    data: await revokeExternalAccessGrant(tenantIdOf(req), actorOf(req), grantIdOf(req))
  });
});

export const sendExternalAccessLinkHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = sendLinkSchema.parse(req.body ?? {});
  const data = await sendExternalAccessLink(tenantIdOf(req), actorOf(req), grantIdOf(req), body);
  res.status(201).json({ success: true, data });
});

export const listExternalAccessLogHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = accessLogQuerySchema.parse({ limit: req.query.limit });
  res.json({
    success: true,
    data: await listExternalAccessLog(tenantIdOf(req), grantIdOf(req), query.limit)
  });
});
