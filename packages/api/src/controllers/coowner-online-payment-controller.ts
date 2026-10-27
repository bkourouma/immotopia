import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, ForbiddenError } from '../middleware/error-middleware';
import {
  getCoOwnerAvailability,
  getCoOwnerCheckout,
  startCoOwnerCheckout,
  startCoOwnerOnlinePaymentSchema
} from '../lib/syndics/online-payment/portal';

/**
 * Paiement en ligne des charges, portail copropriétaire (spec 042, contracts §2).
 *
 * L'agence, le lot et le payeur viennent EXCLUSIVEMENT de la garde
 * (`requireCoOwnerPortalAccess`) ; le corps ne porte que `lotId` et
 * `chargeCallIds`, jamais un montant. Le portail n'étant pas derrière la garde
 * d'abonnement, le droit SYNDIC est vérifié par `startCoOwnerCheckout`.
 */

function sessionOf(req: Request) {
  if (!req.coOwnerPortal) throw new ForbiddenError('Accès portail copropriétaire refusé.');
  return req.coOwnerPortal;
}

const codeParamsSchema = z.object({ codePaiement: z.string().max(64) });

export const getCoOwnerOnlinePaymentAvailabilityHandler = asyncHandler(async (req: Request, res: Response) => {
  const { scope } = sessionOf(req);
  res.json({ success: true, data: await getCoOwnerAvailability(scope) });
});

export const startCoOwnerOnlinePaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const { scope, tenantClientId } = sessionOf(req);
  const body = startCoOwnerOnlinePaymentSchema.parse(req.body ?? {});
  const { checkout, reused } = await startCoOwnerCheckout(scope, tenantClientId, body);
  res.status(reused ? 200 : 201).json({ success: true, data: checkout });
});

export const getCoOwnerOnlinePaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const { scope, tenantClientId } = sessionOf(req);
  const { codePaiement } = codeParamsSchema.parse(req.params);
  res.json({ success: true, data: await getCoOwnerCheckout(scope, tenantClientId, codePaiement) });
});
