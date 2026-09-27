import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, ForbiddenError } from '../middleware/error-middleware';
import {
  getCoOwnerDocumentFile,
  getCoOwnerLotAccount,
  listCoOwnerChargeCalls,
  listCoOwnerDocuments,
  listCoOwnerLots,
  listCoOwnerMeetings,
  type CoOwnerPortalScope
} from '../lib/syndics/coowner-portal';

/**
 * Portail copropriétaire — lecture seule (`/api/portal/copropriete/*`).
 *
 * Aucun identifiant de copropriétaire, de contact ou d'agence n'est lu dans
 * la requête : le périmètre vient exclusivement de la garde
 * (`requireCoOwnerPortalAccess`), qui le calcule depuis la session. Un
 * identifiant de lot ou de document passé en paramètre n'est qu'un filtre À
 * L'INTÉRIEUR de ce périmètre ; hors de lui, 404 comme pour un objet
 * inexistant.
 *
 * Aucune route d'écriture, et en particulier aucun paiement en ligne : le
 * paiement des charges de copropriété n'existe pas (hors périmètre de ce lot).
 */

function scopeOf(req: Request): CoOwnerPortalScope {
  if (!req.coOwnerPortal) {
    throw new ForbiddenError('Accès portail copropriétaire refusé.');
  }
  return req.coOwnerPortal.scope;
}

const lotParamsSchema = z.object({ lotId: z.string().uuid() });
const documentParamsSchema = z.object({ documentId: z.string().uuid() });
const chargeCallsQuerySchema = z.object({ lotId: z.string().uuid().optional() });

export const listCoOwnerLotsHandler = asyncHandler(async (req: Request, res: Response) => {
  const lots = await listCoOwnerLots(scopeOf(req));
  res.json({ success: true, data: lots });
});

export const getCoOwnerLotAccountHandler = asyncHandler(async (req: Request, res: Response) => {
  const { lotId } = lotParamsSchema.parse(req.params);
  const account = await getCoOwnerLotAccount(scopeOf(req), lotId);
  res.json({ success: true, data: account });
});

export const listCoOwnerChargeCallsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { lotId } = chargeCallsQuerySchema.parse(req.query);
  const calls = await listCoOwnerChargeCalls(scopeOf(req), { lotId });
  res.json({ success: true, data: calls });
});

export const listCoOwnerDocumentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const documents = await listCoOwnerDocuments(scopeOf(req));
  res.json({ success: true, data: documents });
});

export const downloadCoOwnerDocumentHandler = asyncHandler(async (req: Request, res: Response) => {
  const { documentId } = documentParamsSchema.parse(req.params);
  const file = await getCoOwnerDocumentFile(scopeOf(req), documentId);
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
  res.setHeader('Content-Length', file.buffer.length.toString());
  res.send(file.buffer);
});

export const listCoOwnerMeetingsHandler = asyncHandler(async (req: Request, res: Response) => {
  const meetings = await listCoOwnerMeetings(scopeOf(req));
  res.json({ success: true, data: meetings });
});
