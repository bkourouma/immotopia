import { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import {
  getFinalSettlement,
  getLeaseEvents,
  recordAmendment,
  renewLease,
  reviseRent,
  terminateLease
} from '../lib/lease-lifecycle/service';

function requireTenantId(req: Request): string {
  const tenantId = req.tenantContext?.tenantId || req.params.tenantId;
  if (!tenantId) throw new BadRequestError('Contexte agence requis.');
  return tenantId;
}

export const getLeaseEventsHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await getLeaseEvents(requireTenantId(req), req.params.leaseId) });
});

export const reviseRentHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await reviseRent(requireTenantId(req), req.params.leaseId, req.body, req.user?.userId);
  res.status(201).json({ success: true, data });
});

export const renewLeaseHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await renewLease(requireTenantId(req), req.params.leaseId, req.body, req.user?.userId);
  res.status(201).json({ success: true, data });
});

export const recordAmendmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await recordAmendment(requireTenantId(req), req.params.leaseId, req.body, req.user?.userId);
  res.status(201).json({ success: true, data });
});

export const terminateLeaseHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await terminateLease(requireTenantId(req), req.params.leaseId, req.body, req.user?.userId);
  res.status(201).json({ success: true, data });
});

export const getFinalSettlementHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await getFinalSettlement(requireTenantId(req), req.params.leaseId) });
});
