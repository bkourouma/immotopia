import { Request, Response } from 'express';
import { getTenantIdFromRequest } from '../middleware/tenant-isolation-middleware';
import {
  generateInstallments,
  listInstallments,
  getInstallmentById,
  recalculateInstallmentStatuses,
  deleteAllInstallments
} from '../services/rental-installment-service';
import { RentalInstallmentStatus } from '@prisma/client';

/**
 * Generate installments for a lease
 * POST /tenants/:tenantId/rental/leases/:leaseId/installments
 */
export async function generateInstallmentsHandler(req: Request, res: Response): Promise<void> {
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

    const installments = await generateInstallments(tenantId, leaseId, actorUserId);

    res.status(201).json({
      success: true,
      data: installments,
      message: `${installments.length} échéance(s) générée(s) avec succès`
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
      message: 'Erreur lors de la génération des échéances'
    });
  }
}

/**
 * List installments
 * GET /tenants/:tenantId/rental/leases/:leaseId/installments
 * GET /tenants/:tenantId/rental/installments
 */
export async function listInstallmentsHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { leaseId: paramLeaseId } = req.params;
    const { leaseId: queryLeaseId, renterClientId, status, year, month, overdue } = req.query;

    const filters: any = {};
    // leaseId can come from route params (/:leaseId/installments) or query params (?leaseId=...)
    const leaseId = paramLeaseId || (queryLeaseId as string);
    if (leaseId) {
      filters.leaseId = leaseId;
    }
    if (renterClientId) {
      filters.renterClientId = renterClientId as string;
    }
    if (status) {
      filters.status = status as RentalInstallmentStatus;
    }
    if (year) {
      filters.year = parseInt(year as string, 10);
    }
    if (month) {
      filters.month = parseInt(month as string, 10);
    }
    if (overdue === 'true') {
      filters.overdue = true;
    }

    const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

    const result = await listInstallments(tenantId, filters, { page, limit });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des échéances'
    });
  }
}

/**
 * Get installment by ID
 * GET /tenants/:tenantId/rental/installments/:installmentId
 */
export async function getInstallmentHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { installmentId } = req.params;

    const installment = await getInstallmentById(tenantId, installmentId);

    if (!installment) {
      res.status(404).json({
        success: false,
        message: 'Échéance non trouvée'
      });
      return;
    }

    res.json({
      success: true,
      data: installment
    });
  } catch (error) {
    console.error('Error getting installment:', error);
    const errorMessage = error instanceof Error ? error.message : "Erreur lors de la récupération de l'échéance";
    res.status(500).json({
      success: false,
      message: errorMessage
    });
  }
}

/**
 * Recalculate installment statuses for a lease
 * POST /tenants/:tenantId/rental/leases/:leaseId/installments/recalculate
 */
export async function recalculateInstallmentStatusesHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { leaseId } = req.params;

    await recalculateInstallmentStatuses(tenantId, leaseId);

    res.json({
      success: true,
      message: 'Statuts des échéances recalculés avec succès'
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
      message: 'Erreur lors du recalcul des statuts'
    });
  }
}

/**
 * Delete all installments for a lease
 * DELETE /tenants/:tenantId/rental/leases/:leaseId/installments
 */
export async function deleteAllInstallmentsHandler(req: Request, res: Response): Promise<void> {
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

    const deletedCount = await deleteAllInstallments(tenantId, leaseId, actorUserId);

    res.json({
      success: true,
      message: `${deletedCount} échéance(s) supprimée(s) avec succès`,
      data: { deletedCount }
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
      message: 'Erreur lors de la suppression des échéances'
    });
  }
}
