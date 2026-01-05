import { Request, Response } from 'express';
import { getTenantIdFromRequest } from '../middleware/tenant-isolation-middleware';
import { z } from 'zod';
import {
  createDeposit,
  getDeposit,
  createDepositMovement,
  listDepositMovements
} from '../services/rental-deposit-service';
import { RentalDepositMovementType } from '@prisma/client';

const createDepositMovementSchema = z.object({
  type: z.enum(['COLLECT', 'HOLD', 'RELEASE', 'REFUND', 'FORFEIT', 'ADJUSTMENT']),
  amount: z.number().positive(),
  paymentId: z.string().uuid().optional(),
  installmentId: z.string().uuid().optional(),
  note: z.string().optional()
});

/**
 * Get security deposit for a lease
 * GET /tenants/:tenantId/rental/leases/:leaseId/deposit
 */
export async function getDepositHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { leaseId } = req.params;

    const deposit = await getDeposit(tenantId, leaseId);

    if (!deposit) {
      res.status(404).json({
        success: false,
        message: 'Dépôt de garantie non trouvé'
      });
      return;
    }

    res.json({
      success: true,
      data: deposit
    });
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du dépôt de garantie'
    });
  }
}

/**
 * Create security deposit for a lease
 * POST /tenants/:tenantId/rental/leases/:leaseId/deposit
 */
export async function createDepositHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { leaseId } = req.params;
    const actorUserId = req.user?.userId;

    if (!actorUserId) {
      res.status(401).json({
        success: false,
        message: 'Non authentifié'
      });
      return;
    }

    const deposit = await createDeposit(tenantId, leaseId, actorUserId);

    res.status(201).json({
      success: true,
      data: deposit
    });
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création du dépôt de garantie'
    });
  }
}

/**
 * Create deposit movement
 * POST /tenants/:tenantId/rental/deposits/:depositId/movements
 */
export async function createDepositMovementHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { depositId } = req.params;
    const actorUserId = req.user?.userId;

    if (!actorUserId) {
      res.status(401).json({
        success: false,
        message: 'Non authentifié'
      });
      return;
    }

    // Validate request body
    const validatedData = createDepositMovementSchema.parse(req.body);

    const movement = await createDepositMovement(
      tenantId,
      depositId,
      validatedData.type as RentalDepositMovementType,
      validatedData.amount,
      validatedData.paymentId,
      validatedData.installmentId,
      validatedData.note,
      actorUserId
    );

    res.status(201).json({
      success: true,
      data: movement
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
      message: 'Erreur lors de la création du mouvement de dépôt'
    });
  }
}

/**
 * List deposit movements
 * GET /tenants/:tenantId/rental/deposits/:depositId/movements
 */
export async function listDepositMovementsHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { depositId } = req.params;

    const movements = await listDepositMovements(tenantId, depositId);

    res.json({
      success: true,
      data: movements
    });
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des mouvements de dépôt'
    });
  }
}




