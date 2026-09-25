import { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import { t } from '../i18n';
import {
  getTenantSmsOverview,
  updateTenantSmsSettings,
  updateTenantSmsSettingsSchema,
  getPlatformSmsStatus,
  testPlatformSmsConnection,
  sendTestSms,
  sendTestSmsSchema
} from '../lib/sms/settings';

/** Paramètres SMS — lot SMS-1 (compte plateforme unique). */

function requireTenantId(req: Request): string {
  const tenantId = req.tenantContext?.tenantId || req.params.tenantId;
  if (!tenantId) {
    throw new BadRequestError('Contexte agence requis.');
  }
  return tenantId;
}

// -----------------------------------------------------------------------
// Agence — lecture seule (montée dans agency-settings-routes.ts)
// -----------------------------------------------------------------------

export const getTenantSmsSettingsHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getTenantSmsOverview(requireTenantId(req));
  res.json({ success: true, data });
});

// -----------------------------------------------------------------------
// Super-admin (montée dans admin-routes.ts, /api/admin)
// -----------------------------------------------------------------------

export const getPlatformSmsStatusHandler = asyncHandler(async (_req: Request, res: Response) => {
  const data = await getPlatformSmsStatus();
  res.json({ success: true, data });
});

export const testPlatformSmsConnectionHandler = asyncHandler(async (_req: Request, res: Response) => {
  const data = await testPlatformSmsConnection();
  res.json({ success: true, data });
});

export const getAdminTenantSmsHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getTenantSmsOverview(req.params.tenantId);
  res.json({ success: true, data });
});

export const updateAdminTenantSmsHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = updateTenantSmsSettingsSchema.parse(req.body);
  const data = await updateTenantSmsSettings(req.params.tenantId, input);
  res.json({ success: true, data });
});

export const sendAdminTenantTestSmsHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = sendTestSmsSchema.parse(req.body);
  const message = await sendTestSms(req.params.tenantId, input, req.user?.userId);
  res.json({
    success: true,
    data: {
      id: message.id,
      to: message.to,
      body: message.body,
      senderName: message.senderName,
      status: message.status,
      provider: message.provider,
      providerMessageId: message.providerMessageId,
      // Message stocké en français (comme lastTestMessage du lot 7) : traduit
      // seulement ici, au point de réponse.
      errorMessage: message.errorMessage ? t(message.errorMessage) : null,
      createdAt: message.createdAt,
      sentAt: message.sentAt
    }
  });
});
