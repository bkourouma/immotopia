import { Request, Response } from 'express';
import { getTenantIdFromRequest } from '../middleware/tenant-isolation-middleware';
import { asyncHandler, NotFoundError, UnauthorizedError } from '../middleware/error-middleware';
import { z } from 'zod';
import {
  createDeposit,
  getDeposit,
  createDepositMovement,
  listDepositMovements,
  computeDepositBalance
} from '../services/rental-deposit-service';
import { RentalDepositMovementType } from '@prisma/client';

const createDepositMovementSchema = z.object({
  type: z.enum(['COLLECT', 'HOLD', 'RELEASE', 'REFUND', 'FORFEIT', 'ADJUSTMENT']),
  amount: z.coerce.number().positive(),
  paymentId: z.string().uuid().optional().nullable(),
  installmentId: z.string().uuid().optional().nullable(),
  note: z.string().optional().nullable(),
  /** Lot 10 : compte de tresorerie d'un remboursement. Absent : caisse par defaut. */
  treasuryAccountId: z.string().uuid().optional().nullable(),
  /** Moyen de paiement du mouvement, pour valider `treasuryAccountId`. */
  method: z.enum(['MOBILE_MONEY', 'BANK_TRANSFER', 'CASH', 'CHECK', 'CARD', 'OTHER']).optional().nullable()
});

/**
 * Les handlers lèvent des erreurs typées (`asyncHandler`) : le middleware
 * d'erreurs fixe le statut (404 introuvable, 409 conflit, 400 validation) et
 * traduit le message ; un `ZodError` y devient un 400 détaillé champ par champ.
 */

/**
 * Get security deposit for a lease
 * GET /tenants/:tenantId/rental/leases/:leaseId/deposit
 */
export const getDepositHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const { leaseId } = req.params;
  const actorUserId = req.user?.userId;

  const deposit = await getDeposit(tenantId, leaseId, actorUserId);

  if (!deposit) {
    throw new NotFoundError('Dépôt de garantie introuvable');
  }

  const currentBalance = computeDepositBalance(deposit);

  res.json({
    success: true,
    data: {
      ...deposit,
      current_balance: currentBalance
    }
  });
});

/**
 * Create security deposit for a lease
 * POST /tenants/:tenantId/rental/leases/:leaseId/deposit
 */
export const createDepositHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const { leaseId } = req.params;
  const actorUserId = req.user?.userId;

  if (!actorUserId) {
    throw new UnauthorizedError();
  }

  const deposit = await createDeposit(tenantId, leaseId, actorUserId);

  const currentBalance = computeDepositBalance(deposit);

  res.status(201).json({
    success: true,
    data: {
      ...deposit,
      current_balance: currentBalance
    }
  });
});

/**
 * Create deposit movement
 * POST /tenants/:tenantId/rental/deposits/:depositId/movements
 */
export const createDepositMovementHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const { depositId } = req.params;
  const actorUserId = req.user?.userId;

  if (!actorUserId) {
    throw new UnauthorizedError();
  }

  // Validate request body (un ZodError devient un 400 via le middleware)
  const validatedData = createDepositMovementSchema.parse(req.body);

  const movement = await createDepositMovement(
    tenantId,
    depositId,
    validatedData.type as RentalDepositMovementType,
    validatedData.amount,
    validatedData.paymentId ?? undefined,
    validatedData.installmentId ?? undefined,
    validatedData.note ?? undefined,
    actorUserId,
    validatedData.treasuryAccountId ?? undefined,
    validatedData.method ?? undefined
  );

  res.status(201).json({
    success: true,
    data: movement
  });
});

/**
 * List deposit movements
 * GET /tenants/:tenantId/rental/deposits/:depositId/movements
 */
export const listDepositMovementsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const { depositId } = req.params;

  const movements = await listDepositMovements(tenantId, depositId);

  res.json({
    success: true,
    data: movements
  });
});
