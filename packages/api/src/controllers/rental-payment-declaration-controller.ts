/**
 * Rental Payment Declaration Controller
 * Handles HTTP requests for payment declaration approval, rejection, and retrieval
 */

import { Request, Response } from 'express';
import { asyncHandler, UnauthorizedError } from '../middleware/error-middleware';
import { getTenantIdFromRequest } from '../middleware/tenant-isolation-middleware';
import {
  approvePaymentDeclaration,
  rejectPaymentDeclaration,
  getPaymentDeclarations,
  getPaymentDeclarationById
} from '../services/rental-payment-declaration-service';
import { PaymentDeclarationStatus } from '@prisma/client';
import { loadDeclarationDto } from '../lib/rental/declared-payment/declaration-dto';
import {
  approveDeclarationBodySchema,
  rejectDeclarationBodySchema
} from '../lib/rental/declared-payment/manager-schemas';
import { parsePagination } from '../utils/pagination-helper';
import { parseEnumParam } from '../utils/query-params';
import { parseDeclarationListExtras } from '../lib/rental/payment-list-filters';

/**
 * Approve a payment declaration
 * POST /api/tenants/:tenantId/rental/payment-declarations/:declarationId/approve
 */
export const approvePaymentDeclarationHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const { declarationId } = req.params;
  const actorUserId = req.user?.userId;

  if (!actorUserId) {
    throw new UnauthorizedError('Non authentifié');
  }

  // Corps : anciens champs (reviewNotes, treasuryAccountId) ET nouveaux (acceptedAmount, note).
  const body = approveDeclarationBodySchema.parse(req.body ?? {});

  const result = await approvePaymentDeclaration(
    tenantId,
    declarationId,
    actorUserId,
    body.note ?? body.reviewNotes ?? undefined,
    body.treasuryAccountId,
    { acceptedAmount: body.acceptedAmount }
  );

  // Contrat 1.6 `ApproveDeclarationResponse` ; la ligne snake_case reste dans `declaration`
  // et `payment` garde ses champs historiques (additif).
  const declaration = await loadDeclarationDto(tenantId, declarationId);
  res.json({
    success: true,
    message: 'Déclaration approuvée et paiement créé avec succès',
    data: {
      declaration: { ...result.declaration, ...declaration },
      payment: {
        ...result.payment,
        amount: Number(result.payment.amount),
        paymentDate: result.payment.succeeded_at ?? declaration.paidAt
      },
      installment: result.installment,
      corrected: result.corrected
    }
  });
});

/**
 * Reject a payment declaration
 * POST /api/tenants/:tenantId/rental/payment-declarations/:declarationId/reject
 */
export const rejectPaymentDeclarationHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const { declarationId } = req.params;
  const actorUserId = req.user?.userId;

  if (!actorUserId) {
    throw new UnauthorizedError('Non authentifié');
  }

  // Sans `rejectReason`, l'ancien corps `{ reviewNotes }` est lu comme `OTHER`.
  const body = rejectDeclarationBodySchema.parse(req.body ?? {});

  await rejectPaymentDeclaration(
    tenantId,
    declarationId,
    actorUserId,
    body.note ?? body.reviewNotes,
    // `note` (contrat §1.6) est toujours contrôlée (10 à 500) ; l'ancien `reviewNotes` seul reste toléré.
    body.rejectReason ?? (body.note ? 'OTHER' : undefined)
  );

  res.json({
    success: true,
    message: 'Déclaration rejetée avec succès',
    data: await loadDeclarationDto(tenantId, declarationId)
  });
});

/**
 * List payment declarations with filters and pagination
 * GET /api/tenants/:tenantId/rental/payment-declarations
 */
export const listPaymentDeclarationsHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);

  // Parse filters from query params
  const filters: any = {};
  // Contrat 1.6 : `status` absent = PENDING ; `ALL` = tous les statuts.
  if (req.query.status === undefined || req.query.status === '') {
    filters.status = PaymentDeclarationStatus.PENDING;
  } else if (String(req.query.status).toUpperCase() !== 'ALL') {
    const statusFilter = parseEnumParam(req.query.status, PaymentDeclarationStatus, 'status');
    if (statusFilter) filters.status = statusFilter;
  }
  if (req.query.flagged === 'true') filters.flagged = true;
  if (typeof req.query.receivingNumberId === 'string' && req.query.receivingNumberId) {
    filters.receivingNumberId = req.query.receivingNumberId;
  }
  if (req.query.leaseId) {
    filters.leaseId = req.query.leaseId as string;
  }
  if (req.query.declaredBy) {
    filters.declaredBy = req.query.declaredBy as string;
  }
  Object.assign(filters, parseDeclarationListExtras(req.query));
  // `from` / `to` (contrat) = anciens `startDate` / `endDate`.
  const dayFilters = parseDeclarationListExtras({
    startDate: req.query.from ?? req.query.startDate,
    endDate: req.query.to ?? req.query.endDate
  });
  if (dayFilters.startDate) filters.startDate = dayFilters.startDate;
  if (dayFilters.endDate) filters.endDate = dayFilters.endDate;

  // Parse pagination (defaults so all declarations can be shown)
  const { page, limit } = parsePagination(
    req.query.pageSize !== undefined && req.query.limit === undefined
      ? { ...req.query, limit: req.query.pageSize }
      : req.query,
    { defaultPage: 1, defaultLimit: 100 }
  );
  const pagination = { page: Math.max(1, page), limit: Math.min(500, Math.max(1, limit)) };

  const result = await getPaymentDeclarations(tenantId, filters, pagination);

  res.json({
    success: true,
    data: result.declarations,
    pagination: result.pagination
  });
});

/**
 * Get a payment declaration by ID
 * GET /api/tenants/:tenantId/rental/payment-declarations/:declarationId
 */
export const getPaymentDeclarationHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const { declarationId } = req.params;

  const declaration = await getPaymentDeclarationById(tenantId, declarationId);

  res.json({
    success: true,
    data: declaration
  });
});
