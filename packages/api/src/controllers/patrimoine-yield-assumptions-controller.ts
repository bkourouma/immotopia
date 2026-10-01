import { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import { yieldAssumptionsBodySchema } from '../lib/patrimoine/schemas';
import { getYieldAssumptions, setYieldAssumptions } from '../lib/patrimoine/yield-assumptions';

/**
 * Hypotheses de projection enregistrees d'un bien (spec 029). Le tenant vient
 * du contexte d'agence ou du chemin, jamais du corps.
 */

function requireTenantId(req: Request): string {
  const tenantId = req.tenantContext?.tenantId || req.params.tenantId;
  if (!tenantId) throw new BadRequestError('Contexte agence requis.');
  return tenantId;
}

export const getYieldAssumptionsHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getYieldAssumptions(requireTenantId(req), req.params.propertyId);
  res.json({ success: true, data });
});

export const setYieldAssumptionsHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = yieldAssumptionsBodySchema.parse(req.body ?? {});
  const data = await setYieldAssumptions(requireTenantId(req), req.params.propertyId, body, req.user?.userId);
  res.json({ success: true, data });
});
