import { Request, Response } from 'express';
import { asyncHandler, BadRequestError, NotFoundError, UnauthorizedError } from '../middleware/error-middleware';
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

const updatePenaltySchema = z.object({
  amount: z.number().nonnegative(),
  reason: z.string().min(1)
});

/**
 * Calculate penalties for overdue installments
 * POST /tenants/:tenantId/rental/penalties/calculate
 */
export const calculatePenaltiesHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

/**
 * Update penalty manually
 * PATCH /tenants/:tenantId/rental/penalties/:penaltyId
 */
export const updatePenaltyHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const { penaltyId } = req.params;
  const actorUserId = req.user?.userId;

  if (!actorUserId) {
    throw new UnauthorizedError('Non authentifié');
  }

  // Validate request body
  const validatedData = updatePenaltySchema.parse(req.body);

  const penalty = await updatePenalty(tenantId, penaltyId, validatedData.amount, validatedData.reason, actorUserId);

  res.json({
    success: true,
    data: penalty,
    message: 'Pénalité mise à jour avec succès'
  });
});

/**
 * Get penalty by ID
 * GET /tenants/:tenantId/rental/penalties/:penaltyId
 */
export const getPenaltyHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const { penaltyId } = req.params;

  const penalty = await getPenaltyById(tenantId, penaltyId);

  if (!penalty) {
    throw new NotFoundError('Pénalité non trouvée');
  }

  res.json({
    success: true,
    data: penalty
  });
});

/**
 * List penalties
 * GET /tenants/:tenantId/rental/penalties
 */
export const listPenaltiesHandler = asyncHandler(async (req: Request, res: Response) => {
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
});

/**
 * Delete penalty
 * DELETE /tenants/:tenantId/rental/penalties/:penaltyId
 */
export const deletePenaltyHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const { penaltyId } = req.params;
  const actorUserId = req.user?.userId;

  if (!actorUserId) {
    throw new UnauthorizedError('Non authentifié');
  }

  const penalty = await deletePenalty(tenantId, penaltyId, actorUserId);

  res.json({
    success: true,
    data: penalty,
    message: 'Pénalité supprimée avec succès'
  });
});

/**
 * Upload justification document for penalty
 * POST /tenants/:tenantId/rental/penalties/:penaltyId/justification
 */
export const uploadPenaltyJustificationHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const { penaltyId } = req.params;
  const actorUserId = req.user?.userId;

  if (!actorUserId) {
    throw new UnauthorizedError('Non authentifié');
  }

  if (!req.file) {
    throw new BadRequestError('Fichier requis');
  }

  const result = await uploadPenaltyJustification(tenantId, penaltyId, req.file, actorUserId);

  res.json({
    success: true,
    data: result,
    message: 'Justificatif uploadé avec succès'
  });
});
