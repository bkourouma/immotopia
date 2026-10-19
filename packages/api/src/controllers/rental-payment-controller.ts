import { Request, Response } from 'express';
import { getTenantIdFromRequest } from '../middleware/tenant-isolation-middleware';
import { z } from 'zod';
import {
  createPayment,
  allocatePayment,
  updatePaymentStatus,
  getPaymentById,
  listPayments
} from '../services/rental-payment-service';
import { RentalPaymentStatus, RentalPaymentMethod } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { asyncHandler, NotFoundError, UnauthorizedError } from '../middleware/error-middleware';
import { getCheckoutForPayment, reconcileCheckout, toOnlineCheckoutSummaryDto } from '../lib/payment-gateway/checkout';
import { parsePagination } from '../utils/pagination-helper';
import { parseEnumParam } from '../utils/query-params';

/**
 * Lot 7 : `onlineCheckout` sort en `OnlineCheckoutSummary` (contrat §3.2),
 * jamais la ligne Prisma brute (qui porterait `lastProviderPayload`,
 * `providerToken`...).
 */
function withOnlineCheckoutSummary<T extends { onlineCheckout?: unknown }>(payment: T) {
  const { onlineCheckout, ...rest } = payment;
  return {
    ...rest,
    onlineCheckout: onlineCheckout ? toOnlineCheckoutSummaryDto(onlineCheckout as any) : null
  };
}

// Validation schemas
const createPaymentSchema = z.object({
  leaseId: z.string().uuid().optional(),
  renterClientId: z.string().uuid().optional(),
  invoiceId: z.string().uuid().optional(),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'CHECK', 'MOBILE_MONEY', 'CARD', 'OTHER']),
  amount: z.number().positive(),
  currency: z.string().optional().default('FCFA'),
  mmOperator: z.enum(['ORANGE', 'MTN', 'MOOV', 'WAVE', 'OTHER']).optional(),
  mmPhone: z.string().optional(),
  pspName: z.string().optional(),
  pspTransactionId: z.string().optional(),
  pspReference: z.string().optional(),
  /** Date à laquelle le locataire a payé, `YYYY-MM-DD`. Absente : maintenant. */
  paidAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date du règlement attendue au format AAAA-MM-JJ')
    .optional(),
  idempotencyKey: z.string().optional(), // Auto-generated if not provided
  /** Lot 10 : compte de trésorerie réellement crédité. Absent : celui par défaut du moyen de paiement. */
  treasuryAccountId: z.string().uuid().optional().nullable()
});

const allocatePaymentSchema = z.object({
  installmentIds: z.array(z.string().uuid()).min(1),
  amounts: z.record(z.string().uuid(), z.number().positive()).optional()
});

const updatePaymentStatusSchema = z.object({
  status: z.enum(['PENDING', 'SUCCESS', 'FAILED', 'CANCELED', 'REFUNDED', 'PARTIALLY_REFUNDED'])
});

/**
 * Les handlers lèvent des erreurs typées (`asyncHandler`) : le middleware
 * d'erreurs fixe le statut (404 introuvable, 409 conflit, 400 validation) et
 * traduit le message ; un `ZodError` y devient un 400 détaillé champ par champ.
 */

/**
 * Create a new payment
 * POST /tenants/:tenantId/rental/payments
 */
export const createPaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const actorUserId = req.user?.userId;

  // Validate request body
  const validatedData = createPaymentSchema.parse(req.body);

  // Generate idempotency key if not provided
  const idempotencyKey = validatedData.idempotencyKey || uuidv4();

  const paymentData = {
    ...validatedData,
    idempotencyKey
  };

  const payment = await createPayment(tenantId, paymentData, actorUserId);

  res.status(201).json({
    success: true,
    data: payment
  });
});

/**
 * Allocate payment to installments
 * POST /tenants/:tenantId/rental/payments/:paymentId/allocate
 */
export const allocatePaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const { paymentId } = req.params;
  const actorUserId = req.user?.userId;

  if (!actorUserId) {
    throw new UnauthorizedError();
  }

  // Validate request body
  const validatedData = allocatePaymentSchema.parse(req.body);

  const result = await allocatePayment(tenantId, paymentId, validatedData, actorUserId);

  res.json({
    success: true,
    data: result,
    message: `Paiement alloué à ${result.allocations.length} échéance(s)`
  });
});

/**
 * Update payment status
 * PATCH /tenants/:tenantId/rental/payments/:paymentId/status
 */
export const updatePaymentStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const { paymentId } = req.params;
  const actorUserId = req.user?.userId;

  if (!actorUserId) {
    throw new UnauthorizedError();
  }

  // Validate request body
  const validatedData = updatePaymentStatusSchema.parse(req.body);

  const payment = await updatePaymentStatus(
    tenantId,
    paymentId,
    validatedData.status as RentalPaymentStatus,
    actorUserId
  );

  res.json({
    success: true,
    data: payment
  });
});

/**
 * Get payment by ID
 * GET /tenants/:tenantId/rental/payments/:paymentId
 */
export const getPaymentHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const { paymentId } = req.params;

  const payment = await getPaymentById(tenantId, paymentId);

  if (!payment) {
    throw new NotFoundError('Paiement introuvable');
  }

  res.json({
    success: true,
    data: withOnlineCheckoutSummary(payment)
  });
});

/**
 * List payments
 * GET /tenants/:tenantId/rental/payments
 */
export const listPaymentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const { leaseId, renterClientId, status, method, startDate, endDate } = req.query;

  const filters: any = {};
  if (leaseId) {
    filters.leaseId = leaseId as string;
  }
  if (renterClientId) {
    filters.renterClientId = renterClientId as string;
  }
  const statusFilter = parseEnumParam(status, RentalPaymentStatus, 'status');
  if (statusFilter) {
    filters.status = statusFilter;
  }
  const methodFilter = parseEnumParam(method, RentalPaymentMethod, 'method');
  if (methodFilter) {
    filters.method = methodFilter;
  }
  if (startDate) {
    filters.startDate = new Date(startDate as string);
  }
  if (endDate) {
    filters.endDate = new Date(endDate as string);
  }

  const { page, limit } = parsePagination(req.query);

  const result = await listPayments(tenantId, filters, { page, limit });

  res.json({
    success: true,
    ...result,
    data: (result.data as any[]).map(withOnlineCheckoutSummary)
  });
});

/**
 * Relance le rapprochement d'un paiement en ligne — contrat §3.2.
 * POST /tenants/:tenantId/rental/payments/:paymentId/online-check
 */
export const onlineCheckHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const { paymentId } = req.params;

  const checkout = await getCheckoutForPayment(tenantId, paymentId);
  if (!checkout) {
    throw new NotFoundError("Ce paiement n'a pas de paiement en ligne associé.");
  }

  const updated = await reconcileCheckout(tenantId, checkout.id);
  res.json({ success: true, data: toOnlineCheckoutSummaryDto(updated) });
});
