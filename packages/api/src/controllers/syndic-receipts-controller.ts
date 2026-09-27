import type { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import { assertUuidOrNotFound } from '../lib/documents/mandating-agencies';
import { sendPrivateFile } from '../lib/files/private-files';
import {
  backfillMissingQuittances,
  getReceiptFile,
  listLotReceipts,
  listSyndicateReceipts,
  printReceipts,
  resendReceiptEmail
} from '../lib/syndics/charge-receipt-queries';
import { receiptListQuerySchema, receiptPrintQuerySchema } from '../lib/syndics/charge-receipt-schemas';

/**
 * Reçus de paiement et quittances de charges (lot S3, besoin 1). Les gardes
 * (session, agence, permission) sont posées par
 * `routes/syndic-receipts-routes.ts` ; l'appartenance de la copropriété, du
 * lot et du document à l'agence est vérifiée par le service (404 sinon).
 */

function tenantIdOf(req: Request): string {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) throw new BadRequestError('Agence manquante dans la requête.');
  return tenantId;
}

const syndicIdOf = (req: Request) =>
  assertUuidOrNotFound(req.params.syndicId, 'Copropriete introuvable ou inaccessible.');
const lotIdOf = (req: Request) =>
  assertUuidOrNotFound(req.params.lotId, 'Lot introuvable ou inaccessible pour cette copropriete.');
const receiptIdOf = (req: Request) => assertUuidOrNotFound(req.params.receiptId, 'Document introuvable.');

export const listSyndicateReceiptsHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = receiptListQuerySchema.parse(req.query);
  res.json({ success: true, data: await listSyndicateReceipts(tenantIdOf(req), syndicIdOf(req), query) });
});

export const listLotReceiptsHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = receiptListQuerySchema.parse(req.query);
  res.json({ success: true, data: await listLotReceipts(tenantIdOf(req), syndicIdOf(req), lotIdOf(req), query) });
});

export const downloadReceiptHandler = asyncHandler(async (req: Request, res: Response) => {
  const file = await getReceiptFile(tenantIdOf(req), syndicIdOf(req), receiptIdOf(req));
  sendPrivateFile(res, file);
});

export const resendReceiptHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await resendReceiptEmail(tenantIdOf(req), syndicIdOf(req), receiptIdOf(req)) });
});

export const printReceiptsHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = receiptPrintQuerySchema.parse(req.query);
  const buffer = await printReceipts(tenantIdOf(req), syndicIdOf(req), query);
  const day = (value: Date) => value.toISOString().slice(0, 10);
  sendPrivateFile(res, {
    buffer,
    fileName: `Quittances ${day(query.from)} au ${day(query.to)}.pdf`,
    mimeType: 'application/pdf'
  });
});

export const backfillQuittancesHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await backfillMissingQuittances(tenantIdOf(req), syndicIdOf(req), req.user?.userId ?? null);
  res.json({ success: true, data: result });
});
