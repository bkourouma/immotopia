import { Request, Response } from 'express';
import { asyncHandler, ForbiddenError } from '../middleware/error-middleware';
import { assertUuidOrNotFound } from '../lib/documents/mandating-agencies';
import { BRANDING_IMAGE_MIME, type BrandingImage } from '../lib/documents/branding-storage';
import { sendPrivateFile } from '../lib/files/private-files';
import type { CoOwnerPortalScope } from '../lib/syndics/coowner-portal';
import {
  getCoOwnerLotMonthlyTracking,
  getCoOwnerReceiptFile,
  listCoOwnerPayments,
  listCoOwnerReceipts,
  LOT_NOT_FOUND,
  RECEIPT_NOT_FOUND
} from '../lib/syndics/coowner-portal-finance';
import {
  coOwnerMonthlyQuerySchema,
  coOwnerPaymentsQuerySchema,
  coOwnerReceiptsQuerySchema,
  coOwnerStatementQuerySchema
} from '../lib/syndics/coowner-portal-schemas';
import { buildCoOwnerLotStatement } from '../lib/syndics/coowner-portal-statement';
import {
  getCoOwnerSyndicate,
  readCoOwnerIssuerLogo,
  readCoOwnerSyndicateLogo,
  SYNDICATE_NOT_FOUND
} from '../lib/syndics/coowner-portal-syndicate';

/**
 * Portail copropriétaire enrichi (lot S5) — lecture seule, pas de paiement
 * en ligne (P4). Le périmètre vient EXCLUSIVEMENT de la garde
 * `requireCoOwnerPortalAccess` ; un identifiant de chemin n'est qu'un filtre
 * à l'intérieur de ce périmètre. Un identifiant mal formé répond 404, comme
 * un objet inexistant ou hors périmètre.
 */

function scopeOf(req: Request): CoOwnerPortalScope {
  if (!req.coOwnerPortal) throw new ForbiddenError('Accès portail copropriétaire refusé.');
  return req.coOwnerPortal.scope;
}

const lotIdOf = (req: Request) => assertUuidOrNotFound(req.params.lotId, LOT_NOT_FOUND);
const receiptIdOf = (req: Request) => assertUuidOrNotFound(req.params.receiptId, RECEIPT_NOT_FOUND);
const syndicIdOf = (req: Request) => assertUuidOrNotFound(req.params.syndicId, SYNDICATE_NOT_FOUND);

function sendImage(res: Response, image: BrandingImage): void {
  const buffer = Buffer.from(image.bytes);
  res.setHeader('Content-Type', BRANDING_IMAGE_MIME[image.format]);
  res.setHeader('Content-Disposition', `inline; filename="logo.${image.format}"`);
  res.setHeader('Content-Length', buffer.length.toString());
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(buffer);
}

export const listCoOwnerPaymentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = coOwnerPaymentsQuerySchema.parse(req.query);
  res.json({ success: true, data: await listCoOwnerPayments(scopeOf(req), query) });
});

export const listCoOwnerReceiptsHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = coOwnerReceiptsQuerySchema.parse(req.query);
  res.json({ success: true, data: await listCoOwnerReceipts(scopeOf(req), query) });
});

export const downloadCoOwnerReceiptHandler = asyncHandler(async (req: Request, res: Response) => {
  sendPrivateFile(res, await getCoOwnerReceiptFile(scopeOf(req), receiptIdOf(req)));
});

export const downloadCoOwnerLotStatementHandler = asyncHandler(async (req: Request, res: Response) => {
  const lotId = lotIdOf(req);
  const query = coOwnerStatementQuerySchema.parse(req.query);
  sendPrivateFile(res, await buildCoOwnerLotStatement(scopeOf(req), lotId, query));
});

export const getCoOwnerLotMonthlyTrackingHandler = asyncHandler(async (req: Request, res: Response) => {
  const lotId = lotIdOf(req);
  const { year } = coOwnerMonthlyQuerySchema.parse({ year: req.query.year ?? new Date().getUTCFullYear() });
  res.json({ success: true, data: await getCoOwnerLotMonthlyTracking(scopeOf(req), lotId, year) });
});

export const getCoOwnerSyndicateHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await getCoOwnerSyndicate(scopeOf(req), syndicIdOf(req)) });
});

export const readCoOwnerSyndicateLogoHandler = asyncHandler(async (req: Request, res: Response) => {
  sendImage(res, await readCoOwnerSyndicateLogo(scopeOf(req), syndicIdOf(req)));
});

export const readCoOwnerIssuerLogoHandler = asyncHandler(async (req: Request, res: Response) => {
  sendImage(res, await readCoOwnerIssuerLogo(scopeOf(req), syndicIdOf(req)));
});
