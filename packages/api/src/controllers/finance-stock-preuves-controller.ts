import { Request, Response } from 'express';

import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import { buildStockCountReportPdf, buildStockSlipPdf, getStockSlipView } from '../lib/finance/stock-bons-pdf';
import { resolveStockCallerContext } from '../lib/finance/stock-controles';
import {
  listStockAttachments,
  readStockAttachmentFile,
  removeStockAttachment,
  uploadStockAttachment
} from '../lib/finance/stock-pieces-jointes';
import {
  listStockAttachmentsQuerySchema,
  removeStockAttachmentBodySchema,
  stockProofIdParamSchema,
  uploadStockAttachmentBodySchema
} from '../lib/finance/schemas-stock-preuves';
import { sendPrivateFile } from '../lib/files/private-files';

/**
 * Contrôleur des preuves du stock — lot 040, territoire API-4 : bons (lecture
 * et PDF), procès-verbal d'inventaire, pièces jointes.
 *
 * Enveloppé dans `asyncHandler` : le middleware central traduit les erreurs
 * typées des services. Isolation multi-tenant : `tenantId` vient toujours de
 * l'URL (posé par `requireTenantAccess` en amont), jamais du corps ni d'une
 * query ; tout identifiant reçu est vérifié dans l'agence par le service.
 */

function requireTenantId(req: Request): string {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) {
    throw new BadRequestError('Contexte tenant requis pour les opérations financières.');
  }
  return tenantId;
}

function requireActorUserId(req: Request): string {
  const userId = req.user?.userId;
  if (!userId) {
    throw new BadRequestError('Utilisateur authentifié requis pour cette opération.');
  }
  return userId;
}

function requireIdParam(req: Request, name: string): string {
  const parsed = stockProofIdParamSchema.safeParse(req.params[name]);
  if (!parsed.success) {
    throw new BadRequestError('Identifiant invalide.');
  }
  return parsed.data;
}

async function callerContext(req: Request) {
  const tenantId = requireTenantId(req);
  const ctx = await resolveStockCallerContext(requireActorUserId(req), tenantId);
  return { tenantId, ctx };
}

function sendPdf(res: Response, file: { buffer: Buffer; fileName: string }): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
  res.setHeader('Content-Length', file.buffer.length.toString());
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(200).send(file.buffer);
}

// ---------------------------------------------------------------------------
// Bons
// ---------------------------------------------------------------------------

/** GET /stock/slips/:slipId — le bon, ses mouvements et ses pièces jointes, masqués. */
export const getStockSlipHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, ctx } = await callerContext(req);
  const slipId = requireIdParam(req, 'slipId');
  const { data, meta } = await getStockSlipView(tenantId, ctx, slipId);
  res.status(200).json({ success: true, data, meta });
});

/** GET /stock/slips/:slipId/pdf — le bon régénéré (B4-R2, B4-R3). */
export const getStockSlipPdfHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, ctx } = await callerContext(req);
  const slipId = requireIdParam(req, 'slipId');
  sendPdf(res, await buildStockSlipPdf(tenantId, ctx, slipId));
});

/** GET /stock/counts/:countId/report.pdf — procès-verbal d'un inventaire validé (B4-R3 bis). */
export const getStockCountReportPdfHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, ctx } = await callerContext(req);
  const countId = requireIdParam(req, 'countId');
  sendPdf(res, await buildStockCountReportPdf(tenantId, ctx, countId));
});

// ---------------------------------------------------------------------------
// Pièces jointes
// ---------------------------------------------------------------------------

/** POST /stock/attachments (multipart, champ « file ») — 201, ou 200 pour un rejeu. */
export const uploadStockAttachmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, ctx } = await callerContext(req);
  const body = uploadStockAttachmentBodySchema.parse(req.body ?? {});
  const file = req.file ? { buffer: req.file.buffer, originalName: req.file.originalname } : null;

  const { attachment, replayed } = await uploadStockAttachment(tenantId, ctx, { ...body, file });
  res.status(replayed ? 200 : 201).json({ success: true, data: attachment });
});

/** GET /stock/attachments?targetType=&targetId= — pièces d'une cible, retirées comprises, sans fichier. */
export const listStockAttachmentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, ctx } = await callerContext(req);
  const query = listStockAttachmentsQuerySchema.parse(req.query ?? {});
  const data = await listStockAttachments(tenantId, ctx, query.targetType, query.targetId);
  res.status(200).json({ success: true, data });
});

/** GET /stock/attachments/:attachmentId/file — fichier privé, jamais servi en statique (B5-R8). */
export const getStockAttachmentFileHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = requireTenantId(req);
  const attachmentId = requireIdParam(req, 'attachmentId');
  sendPrivateFile(res, await readStockAttachmentFile(tenantId, attachmentId));
});

/** POST /stock/attachments/:attachmentId/remove — retrait motivé (B5-R5). */
export const removeStockAttachmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, ctx } = await callerContext(req);
  const attachmentId = requireIdParam(req, 'attachmentId');
  const body = removeStockAttachmentBodySchema.parse(req.body ?? {});
  const data = await removeStockAttachment(tenantId, ctx, attachmentId, body.reason);
  res.status(200).json({ success: true, data });
});
