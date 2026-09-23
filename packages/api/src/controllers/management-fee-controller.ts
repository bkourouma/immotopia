import { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import {
  clearOwnerFeeTerms,
  getLeaseManagementTerms,
  listAgentCommissionRates,
  listOwnerFeeTerms,
  setAgentCommissionRate,
  setLeaseManagementTerms,
  setOwnerFeeTerms
} from '../lib/rental-fees/terms-service';
import { getAgentCommissions } from '../lib/rental-fees/commissions';

function requireTenantId(req: Request): string {
  const tenantId = req.tenantContext?.tenantId || req.params.tenantId;
  if (!tenantId) throw new BadRequestError('Contexte agence requis.');
  return tenantId;
}

export const listOwnerFeeTermsHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await listOwnerFeeTerms(requireTenantId(req)) });
});

export const setOwnerFeeTermsHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await setOwnerFeeTerms(requireTenantId(req), req.params.ownerClientId, req.body, req.user?.userId);
  res.json({ success: true, data });
});

export const clearOwnerFeeTermsHandler = asyncHandler(async (req: Request, res: Response) => {
  await clearOwnerFeeTerms(requireTenantId(req), req.params.ownerClientId);
  res.json({ success: true, data: null });
});

export const listAgentCommissionRatesHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await listAgentCommissionRates(requireTenantId(req)) });
});

export const setAgentCommissionRateHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await setAgentCommissionRate(requireTenantId(req), req.params.userId, req.body);
  res.json({ success: true, data });
});

export const getLeaseManagementTermsHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await getLeaseManagementTerms(requireTenantId(req), req.params.leaseId) });
});

export const setLeaseManagementTermsHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await setLeaseManagementTerms(requireTenantId(req), req.params.leaseId, req.body, req.user?.userId);
  res.json({ success: true, data });
});

export const getAgentCommissionsHandler = asyncHandler(async (req: Request, res: Response) => {
  const period = typeof req.query.period === 'string' ? req.query.period : '';
  res.json({ success: true, data: await getAgentCommissions(requireTenantId(req), period) });
});
