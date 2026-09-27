import type { Request, Response } from 'express';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';
import { assertUuidOrNotFound } from '../lib/documents/mandating-agencies';
import {
  getLotAdvance,
  listOpenCallsForLot,
  previewLotPaymentForTenant,
  recordLotPayment,
  type LotPaymentInput
} from '../lib/syndics/charge-allocation';
import { lotPaymentSchema, monthlyTrackingQuerySchema } from '../lib/syndics/charge-allocation-schemas';
import { getMonthlyTrackingBySyndicate } from '../lib/syndics/charge-monthly-tracking';

/**
 * Paiements par lot, avance et suivi mensuel des charges (lot S2, besoins 4
 * et 5). Les gardes (session, agence, permission) sont posees par
 * `routes/syndic-lot-payments-routes.ts` ; l'appartenance du lot et des appels
 * a la copropriete de l'agence est verifiee par le service (404 sinon).
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

function lotPaymentInput(req: Request): LotPaymentInput {
  const body = lotPaymentSchema.parse(req.body ?? {});
  return {
    tenantId: tenantIdOf(req),
    syndicateId: syndicIdOf(req),
    lotId: lotIdOf(req),
    amount: body.amount,
    paidAt: body.paidAt,
    method: body.method,
    reference: body.reference ?? null,
    chargeCallIds: body.chargeCallIds ? Array.from(new Set(body.chargeCallIds)) : undefined,
    actorUserId: req.user?.userId ?? null
  };
}

export const recordLotPaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await recordLotPayment(lotPaymentInput(req));
  res.status(201).json({ success: true, data: result });
});

export const previewLotPaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await previewLotPaymentForTenant(lotPaymentInput(req)) });
});

export const getLotAdvanceHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await getLotAdvance(tenantIdOf(req), syndicIdOf(req), lotIdOf(req)) });
});

export const listLotOpenCallsHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await listOpenCallsForLot(tenantIdOf(req), syndicIdOf(req), lotIdOf(req)) });
});

export const getMonthlyTrackingHandler = asyncHandler(async (req: Request, res: Response) => {
  const { year } = monthlyTrackingQuerySchema.parse({ year: req.query.year ?? new Date().getUTCFullYear() });
  res.json({ success: true, data: await getMonthlyTrackingBySyndicate(tenantIdOf(req), syndicIdOf(req), year) });
});
