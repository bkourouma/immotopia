import { Request, Response } from 'express';
import { asyncHandler } from '../middleware/error-middleware';
import { resolveRentalOnlineAvailability } from '../lib/payment-gateway/availability';
import {
  getOnlinePaymentDetail,
  getOnlinePaymentsSummary,
  listOnlinePayments,
  verifyOnlinePayment
} from '../lib/rental/online-review/queries';
import { resolveOnlinePayment } from '../lib/rental/online-review/resolve';
import {
  createCollectionPayout,
  getCollectionAccount,
  listCollectionPayouts
} from '../lib/rental/online-review/collection-account';
import type { OnlinePaymentAvailabilityDto } from '../lib/rental/online-review/types';

/**
 * Paiements de loyer en ligne, côté gestionnaire (contrat 049 §2). `tenantId` vient de la route
 * (déjà contrôlé par `requireTenantAccess`), jamais du corps ; `userId` de la session.
 */

function userIdOf(req: Request): string {
  // `authenticate` a déjà refusé toute requête sans utilisateur.
  return req.user?.userId as string;
}

export const listOnlinePaymentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await listOnlinePayments(req.params.tenantId, req.query);
  res.json({ success: true, data });
});

export const getOnlinePaymentsSummaryHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getOnlinePaymentsSummary(req.params.tenantId);
  res.json({ success: true, data });
});

export const getOnlinePaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getOnlinePaymentDetail(req.params.tenantId, req.params.checkoutId);
  res.json({ success: true, data });
});

export const verifyOnlinePaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await verifyOnlinePayment(req.params.tenantId, req.params.checkoutId);
  res.json({ success: true, data });
});

export const resolveOnlinePaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await resolveOnlinePayment(req.params.tenantId, userIdOf(req), req.params.checkoutId, req.body);
  res.json({ success: true, data });
});

export const getOnlineAvailabilityHandler = asyncHandler(async (req: Request, res: Response) => {
  const availability = await resolveRentalOnlineAvailability(req.params.tenantId);
  // La configuration brute ne sort jamais de l'API.
  const data: OnlinePaymentAvailabilityDto = {
    usable: availability.usable,
    unavailableReason: availability.unavailableReason,
    mode: availability.mode,
    simulated: availability.simulated,
    feesPaidBy: availability.feesPaidBy,
    simulatorAvailable: availability.simulatorAvailable,
    encryptionAvailable: availability.encryptionAvailable
  };
  res.json({ success: true, data });
});

export const getCollectionAccountHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getCollectionAccount(req.params.tenantId);
  res.json({ success: true, data });
});

export const listCollectionPayoutsHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await listCollectionPayouts(req.params.tenantId, req.query);
  res.json({ success: true, data });
});

export const createCollectionPayoutHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await createCollectionPayout(req.params.tenantId, userIdOf(req), req.body);
  res.status(201).json({ success: true, data });
});
