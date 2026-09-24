import { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import { getPropertyOwnership, setPropertyOwnership } from '../lib/ownership/service';

function requireTenantId(req: Request): string {
  const tenantId = req.tenantContext?.tenantId || req.params.tenantId;
  if (!tenantId) throw new BadRequestError('Contexte agence requis.');
  return tenantId;
}

export const getPropertyOwnershipHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await getPropertyOwnership(requireTenantId(req), req.params.propertyId) });
});

export const setPropertyOwnershipHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await setPropertyOwnership(requireTenantId(req), req.params.propertyId, req.body, req.user?.userId);
  res.json({ success: true, data });
});
