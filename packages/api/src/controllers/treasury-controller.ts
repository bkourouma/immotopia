import { Request, Response } from 'express';
import { asyncHandler, BadRequestError, UnauthorizedError } from '../middleware/error-middleware';
import {
  createAccount,
  createTaxRemittance,
  createTransfer,
  getWithholdingSummary,
  listAccounts,
  listTaxRemittances,
  listTransfers,
  patchAccount,
  voidTaxRemittance,
  voidTransfer
} from '../lib/treasury/service';

function context(req: Request) {
  const tenantId = req.tenantContext?.tenantId || req.params.tenantId;
  if (!tenantId) throw new BadRequestError('Contexte agence requis.');
  const userId = req.user?.userId;
  if (!userId) throw new UnauthorizedError('Authentification requise.');
  return { tenantId, userId };
}

export const listAccountsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = context(req);
  res.json({ success: true, data: await listAccounts(tenantId) });
});

export const createAccountHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = context(req);
  res.status(201).json({ success: true, data: await createAccount(tenantId, req.body) });
});

export const patchAccountHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = context(req);
  res.json({ success: true, data: await patchAccount(tenantId, req.params.id, req.body) });
});

export const listTransfersHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = context(req);
  res.json({ success: true, data: await listTransfers(tenantId) });
});

export const createTransferHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = context(req);
  res.status(201).json({ success: true, data: await createTransfer(tenantId, userId, req.body) });
});

export const voidTransferHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = context(req);
  res.json({ success: true, data: await voidTransfer(tenantId, userId, req.params.id, req.body) });
});

export const getWithholdingHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = context(req);
  res.json({ success: true, data: await getWithholdingSummary(tenantId) });
});

export const listTaxRemittancesHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = context(req);
  res.json({ success: true, data: await listTaxRemittances(tenantId) });
});

export const createTaxRemittanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = context(req);
  res.status(201).json({ success: true, data: await createTaxRemittance(tenantId, userId, req.body) });
});

export const voidTaxRemittanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = context(req);
  res.json({ success: true, data: await voidTaxRemittance(tenantId, userId, req.params.id, req.body) });
});
