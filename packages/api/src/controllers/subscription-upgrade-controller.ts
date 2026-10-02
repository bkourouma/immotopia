import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import { startSubscriptionUpgrade } from '../services/subscription-upgrade/upgrade-service';
import { UPGRADE_TARGETS } from '../services/subscription-upgrade/constants';

/** Corps strict : la cible est une liste blanche fermee, jamais un code de pack libre. */
export const upgradeBodySchema = z.object({ target: z.enum(UPGRADE_TARGETS) }).strict();

/**
 * POST /api/tenants/:tenantId/subscription/upgrade → 201 { data: { invoiceId, checkoutUrl, code } }.
 * `tenantId` est celui de l'URL verifie par `requireTenantAccess`.
 */
export const startUpgradeHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) throw new BadRequestError('Authentification requise.');
  const body = upgradeBodySchema.parse(req.body ?? {});
  const data = await startSubscriptionUpgrade(req.params.tenantId, body.target, userId);
  res.status(201).json({ success: true, data });
});
