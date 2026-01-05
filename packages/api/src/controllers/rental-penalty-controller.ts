import { Request, Response } from 'express';
import { getTenantIdFromRequest } from '../middleware/tenant-isolation-middleware';
import { z } from 'zod';
import {
  calculatePenalty,
  calculatePenaltiesForOverdueInstallments,
  updatePenalty,
  getPenaltyById,
  listPenalties
} from '../services/rental-penalty-service';
import { triggerPenaltyCalculation } from '../jobs/penalty-calculation-job';

const calculatePenaltiesSchema = z.object({
  leaseId: z.string().uuid().optional(),
  installmentId: z.string().uuid().optional()
});

const updatePenaltySchema = z.object({
  amount: z.number().nonnegative(),
  reason: z.string().min(1)
});

/**
 * Calculate penalties for overdue installments
 * POST /tenants/:tenantId/rental/penalties/calculate
 */
export async function calculatePenaltiesHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const actorUserId = req.user?.userId;
    const { installmentId } = req.query;

    if (installmentId) {
      // Calculate penalty for specific installment
      const penalty = await calculatePenalty(tenantId, installmentId as string, undefined, actorUserId);
      res.json({
        success: true,
        data: penalty,
        message: 'Pénalité calculée avec succès'
      });
    } else {
      // Calculate penalties for all overdue installments
      const results = await triggerPenaltyCalculation(tenantId);
      res.json({
        success: true,
        data: results,
        message: `${results.processed} pénalité(s) calculée(s)`
      });
    }
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
      message: 'Erreur lors du calcul des pénalités'
    });
  }
}

/**
 * Update penalty manually
 * PATCH /tenants/:tenantId/rental/penalties/:penaltyId
 */
export async function updatePenaltyHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { penaltyId } = req.params;
    const actorUserId = req.user?.userId;

    if (!actorUserId) {
      res.status(401).json({
        success: false,
        message: 'Non authentifié'
      });
      return;
    }

    // Validate request body
    const validatedData = updatePenaltySchema.parse(req.body);

    const penalty = await updatePenalty(tenantId, penaltyId, validatedData.amount, validatedData.reason, actorUserId);

    res.json({
      success: true,
      data: penalty,
      message: 'Pénalité mise à jour avec succès'
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
      message: 'Erreur lors de la mise à jour de la pénalité'
    });
  }
}

/**
 * Get penalty by ID
 * GET /tenants/:tenantId/rental/penalties/:penaltyId
 */
export async function getPenaltyHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { penaltyId } = req.params;

    const penalty = await getPenaltyById(tenantId, penaltyId);

    if (!penalty) {
      res.status(404).json({
        success: false,
        message: 'Pénalité non trouvée'
      });
      return;
    }

    res.json({
      success: true,
      data: penalty
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de la pénalité'
    });
  }
}

/**
 * List penalties
 * GET /tenants/:tenantId/rental/penalties
 */
export async function listPenaltiesHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { leaseId, installmentId } = req.query;

    const filters: any = {};
    if (leaseId) {
      filters.leaseId = leaseId as string;
    }
    if (installmentId) {
      filters.installmentId = installmentId as string;
    }

    const penalties = await listPenalties(tenantId, filters);

    res.json({
      success: true,
      data: penalties
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des pénalités'
    });
  }
}
