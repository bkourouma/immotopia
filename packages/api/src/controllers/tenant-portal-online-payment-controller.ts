import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, ForbiddenError } from '../middleware/error-middleware';
import {
  getCheckoutForPortal,
  getOnlinePaymentAvailability,
  startCheckout,
  toOnlineCheckoutDto
} from '../lib/payment-gateway/checkout';

/**
 * Paiement en ligne — portail locataire (contrat §3.3).
 *
 * `req.tenantPortal` (posé par `requireTenantPortalAccess`) porte le contexte
 * de confiance : `leaseId` et `tenantClientId` n'arrivent jamais du corps de
 * la requête.
 */

function requirePortalContext(req: Request) {
  if (!req.tenantPortal) {
    throw new ForbiddenError('Accès portail locataire requis.');
  }
  return req.tenantPortal;
}

export const getOnlinePaymentAvailabilityHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = requirePortalContext(req);
  const data = await getOnlinePaymentAvailability(tenantId);
  res.json({ success: true, data });
});

const startCheckoutSchema = z.object({
  installmentIds: z.array(z.string().uuid()).min(1).max(24)
});

export const startOnlinePaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, tenantClientId, leaseId } = requirePortalContext(req);
  const { installmentIds } = startCheckoutSchema.parse(req.body);

  const checkout = await startCheckout(tenantId, tenantClientId, leaseId, installmentIds, req.user?.userId);
  res.status(201).json({ success: true, data: checkout });
});

export const getOnlinePaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, tenantClientId } = requirePortalContext(req);
  const { codePaiement } = req.params;

  const checkout = await getCheckoutForPortal(tenantId, tenantClientId, codePaiement);
  res.json({ success: true, data: toOnlineCheckoutDto(checkout) });
});
