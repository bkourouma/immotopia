import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error-middleware';
import { badRequest } from '../lib/errors';
import { zAmount, zDay, zSearch, dayOrderRefinement } from '../utils/list-query-schemas';
import { listSyndicPaymentAllocations } from '../services/syndic-payment-read-service';

const querySchema = z
  .object({
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    search: zSearch(),
    method: zSearch(100),
    paidFrom: zDay,
    paidTo: zDay,
    amountMin: zAmount({ min: 0 }),
    amountMax: zAmount({ min: 0 }),
    sort: z.enum(['paidAt:asc', 'paidAt:desc', 'amount:asc', 'amount:desc']).optional()
  })
  .superRefine((value, context) => {
    dayOrderRefinement('paidFrom', 'paidTo')(value, context);
    if (value.amountMin !== undefined && value.amountMax !== undefined && value.amountMin > value.amountMax) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amountMax'],
        message: 'Montant maximal inférieur au minimum.'
      });
    }
  });

export const listSyndicPaymentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  if (!tenantId) throw badRequest('TenantId manquant pour la liste des paiements');
  const syndicateId = req.params.syndicId;
  const query = querySchema.parse(req.query ?? {});
  const { items, total, methods } = await listSyndicPaymentAllocations(tenantId, syndicateId, query);
  res.json({
    success: true,
    data: items,
    methods,
    pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) }
  });
});
