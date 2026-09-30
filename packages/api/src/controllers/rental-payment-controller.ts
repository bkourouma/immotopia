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
import { asyncHandler, NotFoundError } from '../middleware/error-middleware';
import { getCheckoutForPayment, reconcileCheckout, toOnlineCheckoutSummaryDto } from '../lib/payment-gateway/checkout';
import { parsePagination } from '../utils/pagination-helper';
import { respondWithAppError } from '../utils/app-error-response';

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
 * Create a new payment
 * POST /tenants/:tenantId/rental/payments
 */
export async function createPaymentHandler(req: Request, res: Response): Promise<void> {
  try {
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
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        message: 'Données invalides',
        errors: error.errors
      });
      return;
    }

    if (error instanceof Error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: "Erreur lors de l'enregistrement du paiement"
    });
  }
}

/**
 * Allocate payment to installments
 * POST /tenants/:tenantId/rental/payments/:paymentId/allocate
 */
export async function allocatePaymentHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { paymentId } = req.params;
    const actorUserId = req.user?.userId;

    if (!actorUserId) {
      res.status(401).json({
        success: false,
        message: 'Non authentifié'
      });
      return;
    }

    // Validate request body
    const validatedData = allocatePaymentSchema.parse(req.body);

    const result = await allocatePayment(tenantId, paymentId, validatedData, actorUserId);

    res.json({
      success: true,
      data: result,
      message: `Paiement alloué à ${result.allocations.length} échéance(s)`
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        message: 'Données invalides',
        errors: error.errors
      });
      return;
    }

    if (error instanceof Error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: "Erreur lors de l'allocation du paiement"
    });
  }
}

/**
 * Update payment status
 * PATCH /tenants/:tenantId/rental/payments/:paymentId/status
 */
export async function updatePaymentStatusHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { paymentId } = req.params;
    const actorUserId = req.user?.userId;

    if (!actorUserId) {
      res.status(401).json({
        success: false,
        message: 'Non authentifié'
      });
      return;
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
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        message: 'Données invalides',
        errors: error.errors
      });
      return;
    }

    if (error instanceof Error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour du statut du paiement'
    });
  }
}

/**
 * Get payment by ID
 * GET /tenants/:tenantId/rental/payments/:paymentId
 */
export async function getPaymentHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { paymentId } = req.params;

    const payment = await getPaymentById(tenantId, paymentId);

    if (!payment) {
      res.status(404).json({
        success: false,
        message: 'Paiement non trouvé'
      });
      return;
    }

    res.json({
      success: true,
      data: withOnlineCheckoutSummary(payment)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du paiement'
    });
  }
}

/**
 * List payments
 * GET /tenants/:tenantId/rental/payments
 */
export async function listPaymentsHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { leaseId, renterClientId, status, method, startDate, endDate } = req.query;

    const filters: any = {};
    if (leaseId) {
      filters.leaseId = leaseId as string;
    }
    if (renterClientId) {
      filters.renterClientId = renterClientId as string;
    }
    if (status) {
      filters.status = status as RentalPaymentStatus;
    }
    if (method) {
      filters.method = method as RentalPaymentMethod;
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
  } catch (error) {
    if (respondWithAppError(res, error)) return;
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des paiements'
    });
  }
}

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
