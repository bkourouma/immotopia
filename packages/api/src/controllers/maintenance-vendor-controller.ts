import { NextFunction, Request, Response } from 'express';
import { AppError } from '../middleware/error-middleware';
import { getTenantIdFromRequest } from '../middleware/tenant-isolation-middleware';
import {
  createVendor,
  listVendors,
  getVendorById,
  updateVendor,
  deactivateVendor,
  deleteVendor,
  getActiveVendors
} from '../services/maintenance-vendor-service';
import { createVendorSchema, updateVendorSchema } from '../types/maintenance-types';
import { parsePagination } from '../utils/pagination-helper';
import { respondWithAppError } from '../utils/app-error-response';

/**
 * Transform vendor from Prisma format (snake_case) to frontend format (camelCase)
 */
function transformVendor(vendor: any) {
  return {
    id: vendor.id,
    tenantId: vendor.tenant_id,
    name: vendor.name,
    phone: vendor.phone,
    email: vendor.email,
    address: vendor.address,
    specialties: vendor.specialties,
    isActive: vendor.is_active,
    createdAt: vendor.created_at,
    updatedAt: vendor.updated_at
  };
}

/**
 * Create a new maintenance vendor
 * POST /tenants/:tenantId/maintenance/admin/vendors
 */
export async function createVendorHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const actorUserId = req.user?.userId;

    if (!actorUserId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentification requise'
      });
      return;
    }

    // Validate request body
    const validatedData = createVendorSchema.parse(req.body);

    const vendor = await createVendor(tenantId, validatedData, actorUserId);

    res.status(201).json({
      success: true,
      data: transformVendor(vendor)
    });
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }
    console.error('Error creating vendor:', error);
    if (error instanceof Error) {
      if (error.message.includes('existe déjà')) {
        res.status(409).json({
          success: false,
          error: 'Conflict',
          message: error.message
        });
        return;
      }
      if (error.message.includes('invalide') || error.message.includes('requis')) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: error.message
        });
        return;
      }
    }
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Échec de la création du prestataire'
    });
  }
}

/**
 * List vendors with filters
 * GET /tenants/:tenantId/maintenance/admin/vendors
 */
export async function listVendorsHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);

    const filters: any = {};
    if (req.query.isActive !== undefined) {
      filters.isActive = req.query.isActive === 'true';
    }
    if (req.query.search) {
      filters.search = req.query.search as string;
    }

    const { page, limit } = parsePagination(req.query, { defaultPage: 1, defaultLimit: 20 });

    const result = await listVendors(tenantId, filters, { page, limit });

    res.status(200).json({
      success: true,
      data: result.vendors.map(transformVendor),
      pagination: result.pagination
    });
  } catch (error) {
    if (respondWithAppError(res, error)) return;
    console.error('Error listing vendors:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Échec de la récupération de la liste des prestataires'
    });
  }
}

/**
 * Get vendor by ID
 * GET /tenants/:tenantId/maintenance/admin/vendors/:vendorId
 */
export async function getVendorHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { vendorId } = req.params;

    const vendor = await getVendorById(tenantId, vendorId);

    res.status(200).json({
      success: true,
      data: transformVendor(vendor)
    });
  } catch (error) {
    console.error('Error getting vendor:', error);
    if (error instanceof Error) {
      if (error.message.includes('introuvable')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: error.message
        });
        return;
      }
    }
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Échec de la récupération du prestataire'
    });
  }
}

/**
 * Update vendor
 * PATCH /tenants/:tenantId/maintenance/admin/vendors/:vendorId
 */
export async function updateVendorHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { vendorId } = req.params;
    const actorUserId = req.user?.userId;

    if (!actorUserId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentification requise'
      });
      return;
    }

    // Validate request body
    const validatedData = updateVendorSchema.parse(req.body);

    const vendor = await updateVendor(tenantId, vendorId, validatedData, actorUserId);

    res.status(200).json({
      success: true,
      data: transformVendor(vendor)
    });
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }
    console.error('Error updating vendor:', error);
    if (error instanceof Error) {
      if (error.message.includes('introuvable')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: error.message
        });
        return;
      }
      if (error.message.includes('existe déjà')) {
        res.status(409).json({
          success: false,
          error: 'Conflict',
          message: error.message
        });
        return;
      }
      if (error.message.includes('invalide') || error.message.includes('requis')) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: error.message
        });
        return;
      }
    }
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Échec de la mise à jour du prestataire'
    });
  }
}

/**
 * Deactivate vendor (soft delete)
 * DELETE /tenants/:tenantId/maintenance/admin/vendors/:vendorId
 */
export async function deactivateVendorHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { vendorId } = req.params;
    const actorUserId = req.user?.userId;

    if (!actorUserId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentification requise'
      });
      return;
    }

    const vendor = await deactivateVendor(tenantId, vendorId, actorUserId);

    res.status(200).json({
      success: true,
      data: vendor
    });
  } catch (error) {
    console.error('Error deactivating vendor:', error);
    if (error instanceof Error) {
      if (error.message.includes('introuvable')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: error.message
        });
        return;
      }
      if (error.message.includes('assigné')) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: error.message
        });
        return;
      }
    }
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Échec de la désactivation du prestataire'
    });
  }
}

/**
 * Delete vendor permanently (hard delete)
 * POST /tenants/:tenantId/maintenance/admin/vendors/:vendorId/delete
 */
export async function deleteVendorHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { vendorId } = req.params;
    const actorUserId = req.user?.userId;

    if (!actorUserId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Authentification requise'
      });
      return;
    }

    const result = await deleteVendor(tenantId, vendorId, actorUserId);

    res.status(200).json({
      success: true,
      message: 'Prestataire supprimé définitivement',
      data: result
    });
  } catch (error) {
    console.error('Error deleting vendor:', error);
    if (error instanceof Error) {
      if (error.message.includes('introuvable')) {
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: error.message
        });
        return;
      }
      if (error.message.includes('assigné') || error.message.includes('réassigner')) {
        res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: error.message
        });
        return;
      }
    }
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Échec de la suppression du prestataire'
    });
  }
}

/**
 * Get active vendors for assignment
 * GET /tenants/:tenantId/maintenance/vendors/active
 */
export async function getActiveVendorsHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);

    const vendors = await getActiveVendors(tenantId);

    res.status(200).json({
      success: true,
      data: vendors.map(transformVendor)
    });
  } catch (error) {
    console.error('Error getting active vendors:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Échec de la récupération des prestataires'
    });
  }
}
