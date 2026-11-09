import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, BadRequestError, UnauthorizedError } from '../middleware/error-middleware';
import { SaleMandateStatus, SaleAgreementStatus, SaleCommissionStatus } from '@prisma/client';
import { createMandate, getMandateDetail, listMandates, revokeMandate, updateMandate } from '../lib/sales/mandates';
import { parseEnumParam } from '../utils/query-params';
import { createOffer, decideOffer } from '../lib/sales/offers';
import {
  addCondition,
  cancelAgreement,
  completeAgreement,
  createAgreementFromOffer,
  deleteCondition,
  getAgreementDetail,
  listAgreements,
  patchCondition,
  replaceMilestones,
  signAgreement,
  updateAgreement
} from '../lib/sales/agreements';
import {
  createCommissionPayment,
  getCommissionDetail,
  listCommissions,
  voidCommissionPayment
} from '../lib/sales/commissions';
import { getSalesPipeline } from '../lib/sales/pipeline';

/**
 * Contrôleur des ventes immobilières (lot 9). Même motif que
 * `treasury-controller.ts` : un `context(req)` qui extrait tenant et
 * utilisateur, un `asyncHandler` par route, aucun `try/catch` — les erreurs
 * typées de `lib/errors` remontent au middleware central.
 */
function context(req: Request) {
  const tenantId = req.tenantContext?.tenantId || req.params.tenantId;
  if (!tenantId) throw new BadRequestError('Contexte agence requis.');
  const userId = req.user?.userId;
  if (!userId) throw new UnauthorizedError('Authentification requise.');
  return { tenantId, userId };
}

const listPageSchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});
const finiteAmount = z.coerce.number().finite().optional();
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();
const optionalBoolean = z
  .enum(['true', 'false'])
  .transform(value => value === 'true')
  .optional();
const commaList = (value: unknown, values: Record<string, string>, name: string): string | undefined => {
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') throw new BadRequestError(`${name} invalide.`);
  const parsed = value.split(',').map(part => parseEnumParam(part.trim(), values, name));
  return parsed.join(',');
};

// ---------------------------------------------------------------------------
// Mandats
// ---------------------------------------------------------------------------

export const listMandatesHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = context(req);
  const filters = listPageSchema
    .extend({
      propertyId: z.string().optional(),
      search: z.string().optional(),
      type: z.string().optional(),
      startFrom: isoDate,
      startTo: isoDate,
      endFrom: isoDate,
      endTo: isoDate,
      minPrice: finiteAmount,
      maxPrice: finiteAmount,
      expired: optionalBoolean
    })
    .parse(req.query);
  const status = commaList(req.query.status, SaleMandateStatus, 'status');
  const type = commaList(filters.type, { SIMPLE: 'SIMPLE', EXCLUSIVE: 'EXCLUSIVE' }, 'type');
  res.json({ success: true, data: await listMandates(tenantId, { ...filters, status, type }) });
});

export const createMandateHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = context(req);
  res.status(201).json({ success: true, data: await createMandate(tenantId, userId, req.body) });
});

export const getMandateHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = context(req);
  res.json({ success: true, data: await getMandateDetail(tenantId, req.params.id) });
});

export const updateMandateHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = context(req);
  res.json({ success: true, data: await updateMandate(tenantId, req.params.id, req.body, userId) });
});

export const revokeMandateHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = context(req);
  res.json({ success: true, data: await revokeMandate(tenantId, userId, req.params.id, req.body) });
});

// ---------------------------------------------------------------------------
// Offres
// ---------------------------------------------------------------------------

export const createOfferHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = context(req);
  res.status(201).json({ success: true, data: await createOffer(tenantId, userId, req.params.id, req.body) });
});

export const decideOfferHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = context(req);
  res.json({ success: true, data: await decideOffer(tenantId, userId, req.params.id, req.body) });
});

// ---------------------------------------------------------------------------
// Compromis
// ---------------------------------------------------------------------------

export const createAgreementHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = context(req);
  res
    .status(201)
    .json({ success: true, data: await createAgreementFromOffer(tenantId, userId, req.params.id, req.body) });
});

export const listAgreementsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = context(req);
  const { page, limit } = listPageSchema.parse(req.query);
  const status = parseEnumParam(req.query.status, SaleAgreementStatus, 'status');
  res.json({ success: true, data: await listAgreements(tenantId, { status, page, limit }) });
});

export const getAgreementHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = context(req);
  res.json({ success: true, data: await getAgreementDetail(tenantId, req.params.id) });
});

export const updateAgreementHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = context(req);
  res.json({ success: true, data: await updateAgreement(tenantId, req.params.id, req.body, userId) });
});

export const signAgreementHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = context(req);
  res.json({ success: true, data: await signAgreement(tenantId, userId, req.params.id, req.body) });
});

export const completeAgreementHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = context(req);
  res.json({ success: true, data: await completeAgreement(tenantId, userId, req.params.id, req.body) });
});

export const cancelAgreementHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = context(req);
  res.json({ success: true, data: await cancelAgreement(tenantId, userId, req.params.id, req.body) });
});

export const addConditionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = context(req);
  res.status(201).json({ success: true, data: await addCondition(tenantId, req.params.id, req.body, userId) });
});

export const patchConditionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = context(req);
  res.json({ success: true, data: await patchCondition(tenantId, req.params.id, req.body, userId) });
});

export const deleteConditionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = context(req);
  await deleteCondition(tenantId, req.params.id, userId);
  res.json({ success: true });
});

export const replaceMilestonesHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = context(req);
  res.json({ success: true, data: await replaceMilestones(tenantId, req.params.id, req.body, userId) });
});

// ---------------------------------------------------------------------------
// Commissions
// ---------------------------------------------------------------------------

export const listCommissionsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = context(req);
  const filters = listPageSchema
    .extend({
      search: z.string().optional(),
      payer: z.string().optional(),
      from: isoDate,
      to: isoDate,
      minAmount: finiteAmount,
      maxAmount: finiteAmount,
      unpaid: optionalBoolean
    })
    .parse(req.query);
  const status = commaList(req.query.status, SaleCommissionStatus, 'status');
  const payer = commaList(filters.payer, { SELLER: 'SELLER', BUYER: 'BUYER' }, 'payer');
  res.json({ success: true, data: await listCommissions(tenantId, { ...filters, status, payer }) });
});

export const getCommissionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = context(req);
  res.json({ success: true, data: await getCommissionDetail(tenantId, req.params.id) });
});

export const createCommissionPaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = context(req);
  res
    .status(201)
    .json({ success: true, data: await createCommissionPayment(tenantId, userId, req.params.id, req.body) });
});

export const voidCommissionPaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = context(req);
  res.json({ success: true, data: await voidCommissionPayment(tenantId, userId, req.params.id, req.body) });
});

// ---------------------------------------------------------------------------
// Tableau des ventes
// ---------------------------------------------------------------------------

export const getSalesPipelineHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = context(req);
  res.json({ success: true, data: await getSalesPipeline(tenantId) });
});
