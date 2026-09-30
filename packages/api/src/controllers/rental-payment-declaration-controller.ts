/**
 * Rental Payment Declaration Controller
 * Handles HTTP requests for payment declaration approval, rejection, and retrieval
 */

import { Request, Response } from 'express';
import { getTenantIdFromRequest } from '../middleware/tenant-isolation-middleware';
import { z } from 'zod';
import {
  approvePaymentDeclaration,
  rejectPaymentDeclaration,
  getPaymentDeclarations,
  getPaymentDeclarationById
} from '../services/rental-payment-declaration-service';
import { PaymentDeclarationStatus } from '@prisma/client';
import { parsePagination } from '../utils/pagination-helper';

// Validation schemas
const approvePaymentDeclarationSchema = z.object({
  reviewNotes: z.string().optional(),
  /** Lot 10 : compte de trésorerie réellement crédité. Absent : celui par défaut du moyen de paiement. */
  treasuryAccountId: z.string().uuid().optional().nullable()
});

const rejectPaymentDeclarationSchema = z.object({
  reviewNotes: z.string().min(1, 'Les notes de rejet sont requises')
});

/**
 * Approve a payment declaration
 * POST /api/tenants/:tenantId/rental/payment-declarations/:declarationId/approve
 */
export async function approvePaymentDeclarationHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { declarationId } = req.params;
    const actorUserId = req.user?.userId;

    if (!actorUserId) {
      res.status(401).json({
        success: false,
        message: 'Non authentifié'
      });
      return;
    }

    // Validate request body
    const validatedData = approvePaymentDeclarationSchema.parse(req.body);

    const result = await approvePaymentDeclaration(
      tenantId,
      declarationId,
      actorUserId,
      validatedData.reviewNotes,
      validatedData.treasuryAccountId
    );

    res.json({
      success: true,
      message: 'Déclaration approuvée et paiement créé avec succès',
      data: {
        declaration: result.declaration,
        payment: result.payment
      }
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
      // Check for specific error messages
      if (error.message.includes('non trouvée') || error.message.includes('déjà traitée')) {
        res.status(404).json({
          success: false,
          message: error.message
        });
        return;
      }

      res.status(400).json({
        success: false,
        message: error.message
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: "Erreur lors de l'approbation de la déclaration"
    });
  }
}

/**
 * Reject a payment declaration
 * POST /api/tenants/:tenantId/rental/payment-declarations/:declarationId/reject
 */
export async function rejectPaymentDeclarationHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { declarationId } = req.params;
    const actorUserId = req.user?.userId;

    if (!actorUserId) {
      res.status(401).json({
        success: false,
        message: 'Non authentifié'
      });
      return;
    }

    // Validate request body
    const validatedData = rejectPaymentDeclarationSchema.parse(req.body);

    const declaration = await rejectPaymentDeclaration(tenantId, declarationId, actorUserId, validatedData.reviewNotes);

    res.json({
      success: true,
      message: 'Déclaration rejetée avec succès',
      data: declaration
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
      // Check for specific error messages
      if (error.message.includes('non trouvée') || error.message.includes('déjà traitée')) {
        res.status(404).json({
          success: false,
          message: error.message
        });
        return;
      }

      res.status(400).json({
        success: false,
        message: error.message
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors du rejet de la déclaration'
    });
  }
}

/**
 * List payment declarations with filters and pagination
 * GET /api/tenants/:tenantId/rental/payment-declarations
 */
export async function listPaymentDeclarationsHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);

    // Parse filters from query params
    const filters: any = {};
    if (req.query.status) {
      filters.status = req.query.status as PaymentDeclarationStatus;
    }
    if (req.query.leaseId) {
      filters.leaseId = req.query.leaseId as string;
    }
    if (req.query.declaredBy) {
      filters.declaredBy = req.query.declaredBy as string;
    }
    if (req.query.startDate) {
      filters.startDate = new Date(req.query.startDate as string);
    }
    if (req.query.endDate) {
      filters.endDate = new Date(req.query.endDate as string);
    }

    // Parse pagination (defaults so all declarations can be shown)
    const { page, limit } = parsePagination(req.query, { defaultPage: 1, defaultLimit: 100 });
    const pagination = { page: Math.max(1, page), limit: Math.min(500, Math.max(1, limit)) };

    const result = await getPaymentDeclarations(tenantId, filters, pagination);

    res.json({
      success: true,
      data: result.declarations,
      pagination: result.pagination
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
      message: 'Erreur lors de la récupération des déclarations'
    });
  }
}

/**
 * Get a payment declaration by ID
 * GET /api/tenants/:tenantId/rental/payment-declarations/:declarationId
 */
export async function getPaymentDeclarationHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { declarationId } = req.params;

    const declaration = await getPaymentDeclarationById(tenantId, declarationId);

    res.json({
      success: true,
      data: declaration
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('non trouvée')) {
        res.status(404).json({
          success: false,
          message: error.message
        });
        return;
      }

      res.status(400).json({
        success: false,
        message: error.message
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de la déclaration'
    });
  }
}
