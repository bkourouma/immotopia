import { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import {
  getOwnerPortalSettings,
  updateOwnerPortalSettings,
  updateOwnerPortalSettingsSchema
} from '../lib/settings/owner-portal-settings';

function requireTenantId(req: Request): string {
  const tenantId = req.tenantContext?.tenantId || req.params.tenantId;
  if (!tenantId) {
    throw new BadRequestError('Contexte agence requis.');
  }
  return tenantId;
}

export const getOwnerPortalSettingsHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getOwnerPortalSettings(requireTenantId(req));
  res.json({ success: true, data });
});

export const updateOwnerPortalSettingsHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = updateOwnerPortalSettingsSchema.parse(req.body);
  const data = await updateOwnerPortalSettings(requireTenantId(req), input, req.user?.userId);
  res.json({ success: true, data });
});
