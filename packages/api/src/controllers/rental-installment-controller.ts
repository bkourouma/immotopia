import { Request, Response } from 'express';
import { asyncHandler, NotFoundError, UnauthorizedError } from '../middleware/error-middleware';
import { getTenantIdFromRequest } from '../middleware/tenant-isolation-middleware';
import {
  generateInstallments,
  listInstallments,
  getInstallmentById,
  recalculateInstallmentStatuses,
  deleteAllInstallments
} from '../services/rental-installment-service';
import { RentalInstallmentStatus } from '@prisma/client';
import { parsePagination } from '../utils/pagination-helper';
import { parseEnumParam, parseIntParam } from '../utils/query-params';

/**
 * Generate installments for a lease
 * POST /tenants/:tenantId/rental/leases/:leaseId/installments
 */
export const generateInstallmentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const { leaseId } = req.params;
  const actorUserId = req.user?.userId;

  if (!actorUserId) {
    throw new UnauthorizedError('Non authentifié');
  }

  const installments = await generateInstallments(tenantId, leaseId, actorUserId);

  res.status(201).json({
    success: true,
    data: installments,
    message: `${installments.length} échéance(s) générée(s) avec succès`
  });
});

/**
 * List installments
 * GET /tenants/:tenantId/rental/leases/:leaseId/installments
 * GET /tenants/:tenantId/rental/installments
 */
export const listInstallmentsHandler = asyncHandler(async (req: Request, res: Response) => {
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
  const statusFilter = parseEnumParam(status, RentalInstallmentStatus, 'status');
  if (statusFilter) {
    filters.status = statusFilter;
  }
  const yearFilter = parseIntParam(year, 'year', { min: 1, max: 9999 });
  if (yearFilter !== undefined) {
    filters.year = yearFilter;
  }
  const monthFilter = parseIntParam(month, 'month', { min: 1, max: 12 });
  if (monthFilter !== undefined) {
    filters.month = monthFilter;
  }
  if (overdue === 'true') {
    filters.overdue = true;
  }

  const { page, limit } = parsePagination(req.query);

  const result = await listInstallments(tenantId, filters, { page, limit });

  res.json({
    success: true,
    ...result
  });
});

/**
 * Get installment by ID
 * GET /tenants/:tenantId/rental/installments/:installmentId
 */
export const getInstallmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const { installmentId } = req.params;

  const installment = await getInstallmentById(tenantId, installmentId);

  if (!installment) {
    throw new NotFoundError('Échéance non trouvée');
  }

  res.json({
    success: true,
    data: installment
  });
});

/**
 * Recalculate installment statuses for a lease
 * POST /tenants/:tenantId/rental/leases/:leaseId/installments/recalculate
 */
export const recalculateInstallmentStatusesHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const { leaseId } = req.params;

  await recalculateInstallmentStatuses(tenantId, leaseId);

  res.json({
    success: true,
    message: 'Statuts des échéances recalculés avec succès'
  });
});

/**
 * Delete all installments for a lease
 * DELETE /tenants/:tenantId/rental/leases/:leaseId/installments
 */
export const deleteAllInstallmentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const { leaseId } = req.params;
  const actorUserId = req.user?.userId;

  if (!actorUserId) {
    throw new UnauthorizedError('Non authentifié');
  }

  const deletedCount = await deleteAllInstallments(tenantId, leaseId, actorUserId);

  res.json({
    success: true,
    message: `${deletedCount} échéance(s) supprimée(s) avec succès`,
    data: { deletedCount }
  });
});
