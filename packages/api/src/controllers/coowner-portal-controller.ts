import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, ForbiddenError } from '../middleware/error-middleware';
import {
  getCoOwnerDocumentFile,
  getCoOwnerLotAccount,
  listCoOwnerChargeCalls,
  listCoOwnerChargeCallsPage,
  listCoOwnerDocuments,
  listCoOwnerLots,
  listCoOwnerMeetings,
  listCoOwnerMeetingsPage,
  type CoOwnerPortalScope
} from '../lib/syndics/coowner-portal';
import { issueCoOwnerPortalMeetingLink } from '../lib/syndics/meeting-participants';
import { zSearch } from '../utils/list-query-schemas';
import { isoDaySchema } from '../lib/syndics/charge-allocation-schemas';

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
 * Lecture seule. Le paiement en ligne des charges a son propre contrôleur
 * (`coowner-online-payment-controller.ts`).
 */

function scopeOf(req: Request): CoOwnerPortalScope {
  if (!req.coOwnerPortal) {
    throw new ForbiddenError('Accès portail copropriétaire refusé.');
  }
  return req.coOwnerPortal.scope;
}

const lotParamsSchema = z.object({ lotId: z.string().uuid() });
const meetingParamsSchema = z.object({ meetingId: z.string().uuid() });
const documentParamsSchema = z.object({ documentId: z.string().uuid() });
const chargeCallsQuerySchema = z
  .object({
    lotId: z.string().uuid().optional(),
    search: zSearch(),
    statuses: z
      .string()
      .refine(value => value.split(',').every(status => ['PENDING', 'PARTIAL', 'PAID', 'OVERDUE'].includes(status)))
      .optional(),
    dueFrom: isoDaySchema.optional(),
    dueTo: isoDaySchema.optional(),
    page: z.coerce.number().int().min(1).max(10000).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional()
  })
  .strict()
  .refine(value => !value.dueFrom || !value.dueTo || value.dueFrom <= value.dueTo, { path: ['dueTo'] });
const meetingsQuerySchema = z
  .object({
    search: zSearch(),
    statuses: z
      .string()
      .refine(value =>
        value.split(',').every(status => ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(status))
      )
      .optional(),
    dateFrom: isoDaySchema.optional(),
    dateTo: isoDaySchema.optional(),
    page: z.coerce.number().int().min(1).max(10000).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional()
  })
  .strict()
  .refine(value => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo, { path: ['dateTo'] });
const lotAccountQuerySchema = z
  .object({
    search: zSearch(),
    type: z.enum(['CHARGE_CALL', 'PAYMENT', 'PENALTY', 'WAIVER', 'ADJUSTMENT', 'FUND_TRANSFER']).optional(),
    dateFrom: isoDaySchema.optional(),
    dateTo: isoDaySchema.optional(),
    page: z.coerce.number().int().min(1).max(10000).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional()
  })
  .strict()
  .refine(value => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo, { path: ['dateTo'] });

export const listCoOwnerLotsHandler = asyncHandler(async (req: Request, res: Response) => {
  const lots = await listCoOwnerLots(scopeOf(req));
  res.json({ success: true, data: lots });
});

export const getCoOwnerLotAccountHandler = asyncHandler(async (req: Request, res: Response) => {
  const { lotId } = lotParamsSchema.parse(req.params);
  const account = await getCoOwnerLotAccount(scopeOf(req), lotId, lotAccountQuerySchema.parse(req.query));
  res.json({ success: true, data: account });
});

export const listCoOwnerChargeCallsHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = chargeCallsQuerySchema.parse(req.query);
  const filters = { ...query, tenantClientId: req.coOwnerPortal?.tenantClientId ?? null };
  const calls =
    query.page !== undefined || query.limit !== undefined
      ? await listCoOwnerChargeCallsPage(scopeOf(req), { ...filters, page: query.page ?? 1, limit: query.limit ?? 20 })
      : await listCoOwnerChargeCalls(scopeOf(req), filters);
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
  const query = meetingsQuerySchema.parse(req.query);
  const meetings =
    query.page !== undefined || query.limit !== undefined
      ? await listCoOwnerMeetingsPage(scopeOf(req), { ...query, page: query.page ?? 1, limit: query.limit ?? 20 })
      : await listCoOwnerMeetings(scopeOf(req));
  res.json({ success: true, data: meetings });
});

/**
 * Spec 043 : lien personnel d'AG en direct pour le contact du portail. Seule
 * ecriture du portail : elle ne touche ni lot ni vote, elle delivre un acces
 * (jeton remis une fois, jamais mis en cache).
 */
export const issueCoOwnerMeetingAccessHandler = asyncHandler(async (req: Request, res: Response) => {
  const { meetingId } = meetingParamsSchema.parse(req.params);
  const data = await issueCoOwnerPortalMeetingLink(scopeOf(req), meetingId, req.user?.userId ?? null);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.json({ success: true, data });
});
