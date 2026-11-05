import { Request, Response } from 'express';
import { getTenantIdFromRequest } from '../middleware/tenant-isolation-middleware';
import { z } from 'zod';
import {
  calculatePenalty,
  updatePenalty,
  getPenaltyById,
  listPenalties,
  deletePenalty,
  uploadPenaltyJustification
} from '../services/rental-penalty-service';
import { triggerPenaltyCalculation } from '../jobs/penalty-calculation-job';
import { asyncHandler } from '../middleware/error-middleware';
import { dayOrderRefinement, zAmount, zDay, zSearch } from '../utils/list-query-schemas';

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
const optionalBoolean = z.preprocess(
  value => (value === 'true' || value === '1' ? true : value === 'false' || value === '0' ? false : value),
  z.boolean().optional()
);
const penaltiesListSchema = z
  .object({
    leaseId: z.string().uuid().optional(),
    installmentId: z.string().uuid().optional(),
    search: zSearch(),
    from: zDay,
    to: zDay,
    adjusted: optionalBoolean,
    hasJustification: optionalBoolean,
    minAmount: zAmount({ min: 0 }),
    maxAmount: zAmount({ min: 0 }),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50)
  })
  .superRefine(dayOrderRefinement('from', 'to'));

export const listPenaltiesHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const query = penaltiesListSchema.parse(req.query ?? {});
  const { items, total } = await listPenalties(tenantId, query);
  res.json({
    success: true,
    data: items,
    pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) }
  });
});

/**
 * Delete penalty
 * DELETE /tenants/:tenantId/rental/penalties/:penaltyId
 */
export async function deletePenaltyHandler(req: Request, res: Response): Promise<void> {
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

    const penalty = await deletePenalty(tenantId, penaltyId, actorUserId);

    res.json({
      success: true,
      data: penalty,
      message: 'Pénalité supprimée avec succès'
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
      message: 'Erreur lors de la suppression de la pénalité'
    });
  }
}

/**
 * Upload justification document for penalty
 * POST /tenants/:tenantId/rental/penalties/:penaltyId/justification
 */
export async function uploadPenaltyJustificationHandler(req: Request, res: Response): Promise<void> {
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

    if (!req.file) {
      res.status(400).json({
        success: false,
        message: 'Fichier requis'
      });
      return;
    }

    const result = await uploadPenaltyJustification(tenantId, penaltyId, req.file, actorUserId);

    res.json({
      success: true,
      data: result,
      message: 'Justificatif uploadé avec succès'
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
      message: "Erreur lors de l'upload du justificatif"
    });
  }
}
