import { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import {
  getPaymentGatewaySettings,
  updatePaymentGatewaySettings,
  updatePaymentGatewaySettingsSchema,
  testPaymentGatewayConnection
} from '../lib/payment-gateway/settings';

/** Paramètres « Paiement en ligne » de l'agence — contrat §3.1. */

function requireTenantId(req: Request): string {
  const tenantId = req.tenantContext?.tenantId || req.params.tenantId;
  if (!tenantId) {
    throw new BadRequestError('Contexte agence requis.');
  }
  return tenantId;
}

export const getPaymentGatewaySettingsHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getPaymentGatewaySettings(requireTenantId(req));
  res.json({ success: true, data });
});

export const updatePaymentGatewaySettingsHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = updatePaymentGatewaySettingsSchema.parse(req.body);
  const data = await updatePaymentGatewaySettings(requireTenantId(req), input);
  res.json({ success: true, data });
});

export const testPaymentGatewayConnectionHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await testPaymentGatewayConnection(requireTenantId(req));
  res.json({ success: true, data });
});
