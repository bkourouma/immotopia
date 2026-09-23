import { Request, Response } from 'express';
import { asyncHandler, BadRequestError, ForbiddenError } from '../middleware/error-middleware';
import { createOwnerPayout, getOwnerAccount, listOwnerAccounts, voidOwnerPayout } from '../lib/owner-account/service';

function requireTenantId(req: Request): string {
  const tenantId = req.tenantContext?.tenantId || req.params.tenantId;
  if (!tenantId) throw new BadRequestError('Contexte agence requis.');
  return tenantId;
}

export const listOwnerAccountsHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await listOwnerAccounts(requireTenantId(req)) });
});

export const getOwnerAccountHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await getOwnerAccount(requireTenantId(req), req.params.ownerClientId) });
});

export const createOwnerPayoutHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await createOwnerPayout(requireTenantId(req), req.params.ownerClientId, req.body, req.user?.userId);
  res.status(201).json({ success: true, data });
});

export const voidOwnerPayoutHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await voidOwnerPayout(
    requireTenantId(req),
    req.params.ownerClientId,
    req.params.payoutId,
    req.body,
    req.user?.userId
  );
  res.json({ success: true, data });
});

/** Portail : le compte du propriétaire connecté, et seulement le sien. */
export const getMyOwnerAccountHandler = asyncHandler(async (req: Request, res: Response) => {
  const context = req.ownerPortal;
  if (!context) throw new ForbiddenError('Accès au portail propriétaire requis.');
  res.json({ success: true, data: await getOwnerAccount(context.tenantId, context.tenantClientId) });
});
