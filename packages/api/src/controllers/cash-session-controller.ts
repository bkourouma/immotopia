import { Request, Response } from 'express';
import { asyncHandler, BadRequestError, UnauthorizedError } from '../middleware/error-middleware';
import {
  closeSession,
  getCurrentSession,
  getSession,
  listSessions,
  openSession,
  validateSession
} from '../lib/cash-sessions/service';

function context(req: Request) {
  const tenantId = req.tenantContext?.tenantId || req.params.tenantId;
  if (!tenantId) throw new BadRequestError('Contexte agence requis.');
  const userId = req.user?.userId;
  if (!userId) throw new UnauthorizedError('Authentification requise.');
  return { tenantId, userId };
}

export const getCurrentSessionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = context(req);
  res.json({ success: true, data: await getCurrentSession(tenantId, userId) });
});

export const openSessionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = context(req);
  res.status(201).json({ success: true, data: await openSession(tenantId, userId, req.body) });
});

export const closeSessionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = context(req);
  res.json({ success: true, data: await closeSession(tenantId, userId, req.params.sessionId, req.body) });
});

export const validateSessionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = context(req);
  res.json({ success: true, data: await validateSession(tenantId, userId, req.params.sessionId, req.body) });
});

export const listSessionsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = context(req);
  res.json({ success: true, data: await listSessions(tenantId, req.query) });
});

export const getSessionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = context(req);
  res.json({ success: true, data: await getSession(tenantId, userId, req.params.sessionId) });
});
