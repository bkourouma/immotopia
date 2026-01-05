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
  listCoRenters
} from '../services/rental-lease-service';
import { RentalLeaseStatus } from '@prisma/client';

// Helper function to validate datetime strings
const datetimeSchema = z.string().refine(
  (val) => {
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
const createLeaseSchema = z.object({
  leaseNumber: z.string().min(1),
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
  billingFrequency: z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL']),
  dueDayOfMonth: z.number().int().min(1).max(31),
  currency: z.string().optional().default('FCFA'),
  rentAmount: z.number().positive(),
  serviceChargeAmount: z.number().nonnegative().optional(),
  securityDepositAmount: z.number().nonnegative().optional(),
  penaltyGraceDays: z.number().int().nonnegative().optional(),
  penaltyMode: z.enum(['FIXED_AMOUNT', 'PERCENT_OF_RENT', 'PERCENT_OF_BALANCE']).optional(),
  penaltyRate: z.number().nonnegative().optional(),
  penaltyFixedAmount: z.number().nonnegative().optional(),
  penaltyCapAmount: z.number().nonnegative().optional(),
  notes: z.string().optional(),
  termsJson: z.record(z.any()).optional()
}).refine(
  (data) => data.primaryRenterClientId || data.primaryRenterContactId,
  {
    message: 'Either primaryRenterClientId or primaryRenterContactId is required',
    path: ['primaryRenterClientId']
  }
);

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

/**
 * Create a new lease
 * POST /tenants/:tenantId/rental/leases
 */
export async function createLeaseHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const actorUserId = req.user?.userId;

    if (!actorUserId) {
      res.status(401).json({
        success: false,
        message: 'Non authentifié'
      });
      return;
    }

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
      throw new Error('Date de début invalide');
    }
    if (leaseData.endDate && isNaN(leaseData.endDate.getTime())) {
      throw new Error('Date de fin invalide');
    }
    if (leaseData.moveInDate && isNaN(leaseData.moveInDate.getTime())) {
      throw new Error('Date d\'emménagement invalide');
    }
    if (leaseData.moveOutDate && isNaN(leaseData.moveOutDate.getTime())) {
      throw new Error('Date de déménagement invalide');
    }

    const lease = await createLease(tenantId, leaseData, actorUserId);

    res.status(201).json({
      success: true,
      data: lease
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
      // Check if it's a Prisma foreign key constraint error
      if (error.message.includes('Foreign key constraint') || error.message.includes('Foreign key constraint violated')) {
        res.status(400).json({
          success: false,
          message: 'Erreur de référence: Vérifiez que la propriété et les clients existent et appartiennent à ce tenant'
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
      message: 'Erreur lors de la création du bail'
    });
  }
}

/**
 * Get lease by ID
 * GET /tenants/:tenantId/rental/leases/:leaseId
 */
export async function getLeaseHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { leaseId } = req.params;

    const lease = await getLeaseById(tenantId, leaseId);

    if (!lease) {
      res.status(404).json({
        success: false,
        message: 'Bail non trouvé'
      });
      return;
    }

    res.json({
      success: true,
      data: lease
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du bail'
    });
  }
}

/**
 * List leases
 * GET /tenants/:tenantId/rental/leases
 */
export async function listLeasesHandler(req: Request, res: Response): Promise<void> {
  try {
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

    const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

    const result = await listLeases(tenantId, filters, { page, limit });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des baux'
    });
  }
}

/**
 * Update lease
 * PATCH /tenants/:tenantId/rental/leases/:leaseId
 */
export async function updateLeaseHandler(req: Request, res: Response): Promise<void> {
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

    // Validate request body
    const validatedData = updateLeaseSchema.parse(req.body);

    // Convert date strings to Date objects with validation
    const updateData: any = { ...validatedData };
    if (validatedData.endDate) {
      updateData.endDate = new Date(validatedData.endDate);
      if (isNaN(updateData.endDate.getTime())) {
        throw new Error('Date de fin invalide');
      }
    }
    if (validatedData.moveInDate) {
      updateData.moveInDate = new Date(validatedData.moveInDate);
      if (isNaN(updateData.moveInDate.getTime())) {
        throw new Error('Date d\'emménagement invalide');
      }
    }
    if (validatedData.moveOutDate) {
      updateData.moveOutDate = new Date(validatedData.moveOutDate);
      if (isNaN(updateData.moveOutDate.getTime())) {
        throw new Error('Date de déménagement invalide');
      }
    }

    const lease = await updateLease(tenantId, leaseId, updateData, actorUserId);

    res.json({
      success: true,
      data: lease
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
      message: 'Erreur lors de la mise à jour du bail'
    });
  }
}

/**
 * Update lease status
 * PATCH /tenants/:tenantId/rental/leases/:leaseId/status
 */
export async function updateLeaseStatusHandler(req: Request, res: Response): Promise<void> {
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

    // Validate request body
    const validatedData = updateLeaseStatusSchema.parse(req.body);

    const lease = await updateLeaseStatus(tenantId, leaseId, validatedData.status as RentalLeaseStatus, actorUserId);

    res.json({
      success: true,
      data: lease
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
      message: 'Erreur lors de la mise à jour du statut du bail'
    });
  }
}

/**
 * Add co-renter to lease
 * POST /tenants/:tenantId/rental/leases/:leaseId/co-renters
 */
export async function addCoRenterHandler(req: Request, res: Response): Promise<void> {
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

    // Validate request body
    const validatedData = addCoRenterSchema.parse(req.body);

    const lease = await addCoRenter(tenantId, leaseId, validatedData.renterClientId, actorUserId);

    res.status(201).json({
      success: true,
      data: lease
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
      message: "Erreur lors de l'ajout du co-locataire"
    });
  }
}

/**
 * Remove co-renter from lease
 * DELETE /tenants/:tenantId/rental/leases/:leaseId/co-renters/:renterClientId
 */
export async function removeCoRenterHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { leaseId, renterClientId } = req.params;
    const actorUserId = req.user?.userId;

    if (!actorUserId) {
      res.status(401).json({
        success: false,
        message: 'Non authentifié'
      });
      return;
    }

    await removeCoRenter(tenantId, leaseId, renterClientId, actorUserId);

    res.json({
      success: true,
      message: 'Co-locataire retiré avec succès'
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
      message: 'Erreur lors de la suppression du co-locataire'
    });
  }
}

/**
 * List co-renters for a lease
 * GET /tenants/:tenantId/rental/leases/:leaseId/co-renters
 */
export async function listCoRentersHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { leaseId } = req.params;

    const coRenters = await listCoRenters(tenantId, leaseId);

    res.json({
      success: true,
      data: coRenters
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
      message: 'Erreur lors de la récupération des co-locataires'
    });
  }
}
