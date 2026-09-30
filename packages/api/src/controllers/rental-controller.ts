import { Request, Response } from 'express';
import { getTenantIdFromRequest } from '../middleware/tenant-isolation-middleware';
import { z } from 'zod';
import {
  createLease,
  getLeaseById,
  updateLease,
  listLeases,
  updateLeaseStatus,
  addCoRenter,
  removeCoRenter,
  listCoRenters,
  deleteLease
} from '../services/rental-lease-service';
import { RentalLeaseStatus } from '@prisma/client';
import { asyncHandler, UnauthorizedError, NotFoundError, BadRequestError } from '../middleware/error-middleware';
import { parsePagination } from '../utils/pagination-helper';

// Helper function to validate datetime strings
const datetimeSchema = z.string().refine(
  val => {
    if (!val || val.trim() === '') return true; // Allow empty for optional fields
    // Check for obviously malformed dates (like +020257 instead of 2027)
    if (val.match(/^\+0+\d/)) {
      return false;
    }
    const date = new Date(val);
    const isValid = !isNaN(date.getTime());
    // Also check that it's a valid ISO-like format (should contain T for datetime)
    return isValid && (val.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(val));
  },
  {
    message: 'Format de date invalide. Utilisez le format ISO 8601 (ex: 2026-01-01T00:00:00.000Z)'
  }
);

// Validation schemas
const createLeaseSchema = z
  .object({
    leaseNumber: z.string().min(1).optional(), // Optional - will be auto-generated if not provided
    propertyId: z.string().min(1),
    // Support both CRM contact IDs and TenantClient IDs
    primaryRenterClientId: z.string().min(1).optional(),
    primaryRenterContactId: z.string().min(1).optional(),
    ownerClientId: z.string().optional(),
    ownerContactId: z.string().optional(),
    startDate: datetimeSchema,
    endDate: datetimeSchema.optional(),
    moveInDate: datetimeSchema.optional(),
    moveOutDate: datetimeSchema.optional(),
    billingFrequency: z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL']).optional(),
    dueDayOfMonth: z.number().int().min(1).max(31).optional(),
    currency: z.string().optional().default('FCFA'),
    rentAmount: z.number().nonnegative().optional(),
    serviceChargeAmount: z.number().nonnegative().optional(),
    securityDepositAmount: z.number().nonnegative().optional(),
    penaltyGraceDays: z.number().int().nonnegative().optional(),
    penaltyMode: z.enum(['FIXED_AMOUNT', 'PERCENT_OF_RENT', 'PERCENT_OF_BALANCE']).optional(),
    penaltyRate: z.number().nonnegative().optional(),
    penaltyFixedAmount: z.number().nonnegative().optional(),
    penaltyCapAmount: z.number().nonnegative().optional(),
    notes: z.string().optional(),
    termsJson: z.record(z.any()).optional()
  })
  .refine(data => data.primaryRenterClientId || data.primaryRenterContactId, {
    message: 'Either primaryRenterClientId or primaryRenterContactId is required',
    path: ['primaryRenterClientId']
  });

const updateLeaseSchema = z.object({
  endDate: datetimeSchema.optional(),
  moveInDate: datetimeSchema.optional(),
  moveOutDate: datetimeSchema.optional(),
  rentAmount: z.number().positive().optional(),
  serviceChargeAmount: z.number().nonnegative().optional(),
  securityDepositAmount: z.number().nonnegative().optional(),
  billingFrequency: z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL']).optional(),
  notes: z.string().optional()
});

const updateLeaseStatusSchema = z.object({
  status: z.enum(['DRAFT', 'ACTIVE', 'SUSPENDED', 'ENDED', 'CANCELED'])
});

const addCoRenterSchema = z.object({
  renterClientId: z.string().min(1)
});

function requireActorUserId(req: Request): string {
  const actorUserId = req.user?.userId;
  if (!actorUserId) {
    throw new UnauthorizedError('Non authentifié');
  }
  return actorUserId;
}

/**
 * Create a new lease
 * POST /tenants/:tenantId/rental/leases
 */
export const createLeaseHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const actorUserId = requireActorUserId(req);

  // Validate request body
  const validatedData = createLeaseSchema.parse(req.body);

  // Convert date strings to Date objects with validation
  const leaseData = {
    ...validatedData,
    startDate: new Date(validatedData.startDate),
    endDate: validatedData.endDate ? new Date(validatedData.endDate) : undefined,
    moveInDate: validatedData.moveInDate ? new Date(validatedData.moveInDate) : undefined,
    moveOutDate: validatedData.moveOutDate ? new Date(validatedData.moveOutDate) : undefined
  };

  // Validate that dates are valid Date objects
  if (isNaN(leaseData.startDate.getTime())) {
    throw new BadRequestError('Date de début invalide');
  }
  if (leaseData.endDate && isNaN(leaseData.endDate.getTime())) {
    throw new BadRequestError('Date de fin invalide');
  }
  if (leaseData.moveInDate && isNaN(leaseData.moveInDate.getTime())) {
    throw new BadRequestError("Date d'emménagement invalide");
  }
  if (leaseData.moveOutDate && isNaN(leaseData.moveOutDate.getTime())) {
    throw new BadRequestError('Date de déménagement invalide');
  }

  const lease = await createLease(tenantId, leaseData, actorUserId);

  res.status(201).json({
    success: true,
    data: lease
  });
});

/**
 * Get lease by ID
 * GET /tenants/:tenantId/rental/leases/:leaseId
 */
export const getLeaseHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const { leaseId } = req.params;

  const lease = await getLeaseById(tenantId, leaseId);

  if (!lease) {
    throw new NotFoundError('Bail non trouvé');
  }

  res.json({
    success: true,
    data: lease
  });
});

/**
 * List leases
 * GET /tenants/:tenantId/rental/leases
 */
export const listLeasesHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const { status, propertyId, primaryRenterClientId, search } = req.query;

  const filters: any = {};
  if (status) {
    filters.status = status as RentalLeaseStatus;
  }
  if (propertyId) {
    filters.propertyId = propertyId as string;
  }
  if (primaryRenterClientId) {
    filters.primaryRenterClientId = primaryRenterClientId as string;
  }
  if (search) {
    filters.search = search as string;
  }

  const { page, limit } = parsePagination(req.query);

  const result = await listLeases(tenantId, filters, { page, limit });

  res.json({
    success: true,
    ...result
  });
});

/**
 * Update lease
 * PATCH /tenants/:tenantId/rental/leases/:leaseId
 */
export const updateLeaseHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const { leaseId } = req.params;
  const actorUserId = requireActorUserId(req);

  // Validate request body
  const validatedData = updateLeaseSchema.parse(req.body);

  // Convert date strings to Date objects with validation
  const updateData: any = { ...validatedData };
  if (validatedData.endDate) {
    updateData.endDate = new Date(validatedData.endDate);
    if (isNaN(updateData.endDate.getTime())) {
      throw new BadRequestError('Date de fin invalide');
    }
  }
  if (validatedData.moveInDate) {
    updateData.moveInDate = new Date(validatedData.moveInDate);
    if (isNaN(updateData.moveInDate.getTime())) {
      throw new BadRequestError("Date d'emménagement invalide");
    }
  }
  if (validatedData.moveOutDate) {
    updateData.moveOutDate = new Date(validatedData.moveOutDate);
    if (isNaN(updateData.moveOutDate.getTime())) {
      throw new BadRequestError('Date de déménagement invalide');
    }
  }

  const lease = await updateLease(tenantId, leaseId, updateData, actorUserId);

  res.json({
    success: true,
    data: lease
  });
});

/**
 * Update lease status
 * PATCH /tenants/:tenantId/rental/leases/:leaseId/status
 */
export const updateLeaseStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const { leaseId } = req.params;
  const actorUserId = requireActorUserId(req);

  // Validate request body
  const validatedData = updateLeaseStatusSchema.parse(req.body);

  const lease = await updateLeaseStatus(tenantId, leaseId, validatedData.status as RentalLeaseStatus, actorUserId);

  res.json({
    success: true,
    data: lease
  });
});

/**
 * Add co-renter to lease
 * POST /tenants/:tenantId/rental/leases/:leaseId/co-renters
 */
export const addCoRenterHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const { leaseId } = req.params;
  const actorUserId = requireActorUserId(req);

  // Validate request body
  const validatedData = addCoRenterSchema.parse(req.body);

  const lease = await addCoRenter(tenantId, leaseId, validatedData.renterClientId, actorUserId);

  res.status(201).json({
    success: true,
    data: lease
  });
});

/**
 * Remove co-renter from lease
 * DELETE /tenants/:tenantId/rental/leases/:leaseId/co-renters/:renterClientId
 */
export const removeCoRenterHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const { leaseId, renterClientId } = req.params;
  const actorUserId = requireActorUserId(req);

  await removeCoRenter(tenantId, leaseId, renterClientId, actorUserId);

  res.json({
    success: true,
    message: 'Co-locataire retiré avec succès'
  });
});

/**
 * List co-renters for a lease
 * GET /tenants/:tenantId/rental/leases/:leaseId/co-renters
 */
export const listCoRentersHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const { leaseId } = req.params;

  const coRenters = await listCoRenters(tenantId, leaseId);

  res.json({
    success: true,
    data: coRenters
  });
});

/**
 * Delete a lease
 * DELETE /tenants/:tenantId/rental/leases/:leaseId
 */
export const deleteLeaseHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = getTenantIdFromRequest(req);
  const { leaseId } = req.params;
  const actorUserId = requireActorUserId(req);

  await deleteLease(tenantId, leaseId, actorUserId);

  res.json({
    success: true,
    message: 'Bail supprimé avec succès'
  });
});
