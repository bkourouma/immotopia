import { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import {
  getAgencyFinanceSettings,
  updateAgencyFinanceSettings,
  updateFinanceSettingsSchema
} from '../lib/settings/finance-settings';

function requireTenantId(req: Request): string {
  const tenantId = req.tenantContext?.tenantId || req.params.tenantId;
  if (!tenantId) {
    throw new BadRequestError('Contexte agence requis.');
  }
  return tenantId;
}

export const getAgencyFinanceSettingsHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getAgencyFinanceSettings(requireTenantId(req));
  res.json({ success: true, data });
});

export const updateAgencyFinanceSettingsHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = updateFinanceSettingsSchema.parse(req.body);
  const data = await updateAgencyFinanceSettings(requireTenantId(req), input, req.user?.userId);
  res.json({ success: true, data });
});
