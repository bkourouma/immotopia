import { Request, Response } from 'express';
import {
  registerTenantClient,
  getTenantById,
  getTenantBySlug,
  getTenantClients,
  getUserTenantMemberships,
  listActiveTenants,
  createTenant,
  updateTenantClientDetails,
  removeTenantClient,
  updateTenant,
  listTenants as listTenantsService,
  getTenantStats,
  suspendTenant,
  activateTenant
} from '../services/tenant-service';
import { ClientType, TenantType } from '@prisma/client';
import {
  CreateTenantRequest,
  UpdateTenantRequest,
  TenantFilters,
  UpdateTenantModulesRequest
} from '../types/tenant-types';
import { z } from 'zod';
import { getTenantModules, updateTenantModules } from '../services/module-service';

/**
 * Register as a client of a tenant
 * POST /api/tenants/:tenantId/register
 */
export async function registerAsTenantClient(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const { tenantId } = req.params;
    const { clientType, details } = req.body;

    // Validate clientType
    if (!clientType || !Object.values(ClientType).includes(clientType)) {
      res.status(400).json({
        success: false,
        message: 'Type de client invalide. Valeurs acceptÃ©es: OWNER, RENTER, BUYER, CO_OWNER.'
      });
      return;
    }

    const tenantClient = await registerTenantClient({
      userId: req.user.userId,
      tenantId,
      clientType,
      details
    });

    res.status(201).json({
      success: true,
      message: 'Inscription rÃ©ussie au tenant.',
      data: tenantClient
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}

/**
 * Get tenant by ID
 * GET /api/tenants/:tenantId
 */
export async function getTenant(req: Request, res: Response): Promise<void> {
  try {
    const { tenantId } = req.params;
    const tenant = await getTenantById(tenantId);

    if (!tenant) {
      res.status(404).json({ success: false, message: 'Tenant introuvable.' });
      return;
    }

    res.status(200).json({ success: true, data: tenant });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}

/**
 * Get tenant by slug
 * GET /api/tenants/slug/:slug
 */
export async function getTenantBySlugHandler(req: Request, res: Response): Promise<void> {
  try {
    const { slug } = req.params;
    const tenant = await getTenantBySlug(slug);

    if (!tenant) {
      res.status(404).json({ success: false, message: 'Tenant introuvable.' });
      return;
    }

    res.status(200).json({ success: true, data: tenant });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}

/**
 * List all active tenants
 * GET /api/tenants
 */
export async function listTenants(_req: Request, res: Response): Promise<void> {
  try {
    const tenants = await listActiveTenants();
    res.status(200).json({ success: true, data: tenants });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}

// Validation schemas
const createTenantSchema = z.object({
  name: z.string().min(1),
  legalName: z.string().optional(),
  type: z.nativeEnum(TenantType),
  contactEmail: z.string().email(),
  contactPhone: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  address: z.string().optional(),
  brandingPrimaryColor: z.string().optional(),
  subdomain: z.string().optional(),
  customDomain: z.string().optional(),
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED']).optional(),
  logoUrl: z.string().url().optional(),
  website: z.string().url().optional()
});

const updateTenantSchema = z.object({
  name: z.string().min(1).optional(),
  legalName: z.string().optional(),
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED']).optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  address: z.string().optional(),
  brandingPrimaryColor: z.string().optional(),
  subdomain: z.string().optional(),
  customDomain: z.string().optional(),
  logoUrl: z.string().url().optional(),
  website: z.string().url().optional()
});

// Schema for tenant self-update (without status)
const updateTenantSelfSchema = z.object({
  name: z.string().min(1).optional(),
  legalName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  address: z.string().optional(),
  brandingPrimaryColor: z.string().optional(),
  logoUrl: z.string().url().optional(),
  website: z.string().url().optional()
});

/**
 * Create a new tenant (Platform Admin only)
 * POST /api/admin/tenants
 */
export async function createTenantHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    // Validate request body
    const validationResult = createTenantSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        message: 'DonnÃ©es invalides',
        errors: validationResult.error.errors
      });
      return;
    }

    const data = validationResult.data as CreateTenantRequest;
    const tenant = await createTenant(data, req.user.userId);

    res.status(201).json({
      success: true,
      message: 'Tenant crÃ©Ã© avec succÃ¨s.',
      data: tenant
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}

/**
 * Update tenant (Platform Admin only)
 * PATCH /api/admin/tenants/:tenantId
 */
export async function updateTenantHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const { tenantId } = req.params;

    // Validate request body
    const validationResult = updateTenantSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        message: 'DonnÃ©es invalides',
        errors: validationResult.error.errors
      });
      return;
    }

    const data = validationResult.data as UpdateTenantRequest;
    const tenant = await updateTenant(tenantId, data, req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Tenant mis Ã  jour avec succÃ¨s.',
      data: tenant
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    if (errorMessage.includes('introuvable')) {
      res.status(404).json({ success: false, message: errorMessage });
    } else {
      res.status(400).json({ success: false, message: errorMessage });
    }
  }
}

/**
 * Update tenant (Self - Tenant members can update their own tenant info)
 * PATCH /api/tenants/:tenantId
 * Note: Cannot update status, subdomain, or customDomain
 */
export async function updateTenantSelfHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const { tenantId } = req.params;

    // Validate request body (without status, subdomain, customDomain)
    const validationResult = updateTenantSelfSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        message: 'DonnÃ©es invalides',
        errors: validationResult.error.errors
      });
      return;
    }

    const data = validationResult.data as Omit<UpdateTenantRequest, 'status' | 'subdomain' | 'customDomain'>;
    const tenant = await updateTenant(tenantId, data, req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Informations mises Ã  jour avec succÃ¨s.',
      data: tenant
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    if (errorMessage.includes('introuvable')) {
      res.status(404).json({ success: false, message: errorMessage });
    } else {
      res.status(400).json({ success: false, message: errorMessage });
    }
  }
}

/**
 * List tenants with filtering (Platform Admin only)
 * GET /api/admin/tenants
 */
export async function listTenantsHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const filters: TenantFilters = {
      status: req.query.status as any,
      type: req.query.type as any,
      plan: req.query.plan as string,
      module: req.query.module as string,
      search: req.query.search as string,
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20
    };

    const result = await listTenantsService(filters);

    res.status(200).json({
      success: true,
      data: {
        tenants: result.tenants,
        pagination: result.pagination
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}

/**
 * Get tenant details (Platform Admin only)
 * GET /api/admin/tenants/:tenantId
 */
export async function getTenantDetailHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const { tenantId } = req.params;
    const tenant = await getTenantById(tenantId);

    if (!tenant) {
      res.status(404).json({ success: false, message: 'Tenant introuvable.' });
      return;
    }

    res.status(200).json({
      success: true,
      data: tenant
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}

/**
 * Get tenant statistics (Platform Admin only)
 * GET /api/admin/tenants/:tenantId/stats
 */
export async function getTenantStatsHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const { tenantId } = req.params;
    const stats = await getTenantStats(tenantId);

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}

/**
 * Suspend tenant (Platform Admin only)
 * POST /api/admin/tenants/:tenantId/suspend
 */
export async function suspendTenantHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const { tenantId } = req.params;
    const tenant = await suspendTenant(tenantId, req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Tenant suspendu avec succÃ¨s.',
      data: tenant
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    if (errorMessage.includes('introuvable')) {
      res.status(404).json({ success: false, message: errorMessage });
    } else {
      res.status(400).json({ success: false, message: errorMessage });
    }
  }
}

/**
 * Activate tenant (Platform Admin only)
 * POST /api/admin/tenants/:tenantId/activate
 */
export async function activateTenantHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const { tenantId } = req.params;
    const tenant = await activateTenant(tenantId, req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Tenant active avec succes.',
      data: tenant
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    if (errorMessage.includes('introuvable')) {
      res.status(404).json({ success: false, message: errorMessage });
    } else {
      res.status(400).json({ success: false, message: errorMessage });
    }
  }
}

// Module management validation schema
const updateTenantModulesSchema = z.object({
  modules: z
    .array(
      z.object({
        moduleKey: z.enum(['MODULE_AGENCY', 'MODULE_SYNDIC', 'MODULE_PROMOTER']),
        enabled: z.boolean()
      })
    )
    .min(1)
});

/**
 * Get tenant modules (Platform Admin only)
 * GET /api/admin/tenants/:tenantId/modules
 */
export async function getTenantModulesHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const { tenantId } = req.params;
    const modules = await getTenantModules(tenantId);

    res.status(200).json({
      success: true,
      data: {
        modules: modules
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    if (errorMessage.includes('introuvable')) {
      res.status(404).json({ success: false, message: errorMessage });
    } else {
      res.status(400).json({ success: false, message: errorMessage });
    }
  }
}

/**
 * Update tenant modules (Platform Admin only)
 * PATCH /api/admin/tenants/:tenantId/modules
 */
export async function updateTenantModulesHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const { tenantId } = req.params;

    // Validate request body
    const validationResult = updateTenantModulesSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        message: 'DonnÃ©es invalides',
        errors: validationResult.error.errors
      });
      return;
    }

    const data = validationResult.data as UpdateTenantModulesRequest;
    const modules = await updateTenantModules(tenantId, data, req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Modules mis Ã  jour avec succÃ¨s.',
      data: modules
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    if (errorMessage.includes('introuvable')) {
      res.status(404).json({ success: false, message: errorMessage });
    } else {
      res.status(400).json({ success: false, message: errorMessage });
    }
  }
}

/**
 * Get clients of a tenant
 * GET /api/tenants/:tenantId/clients
 */
export async function getTenantClientsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { tenantId } = req.params;
    const clients = await getTenantClients(tenantId);

    res.status(200).json({ success: true, data: clients });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}

/**
 * Get user's tenant memberships
 * GET /api/tenants/my-memberships
 */
export async function getMyMemberships(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const memberships = await getUserTenantMemberships(req.user.userId);
    res.status(200).json({ success: true, data: memberships });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}

/**
 * Update tenant client details
 * PATCH /api/tenants/:tenantId/client-details
 */
export async function updateClientDetails(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const { tenantId } = req.params;
    const { details } = req.body;

    if (!details || typeof details !== 'object') {
      res.status(400).json({ success: false, message: 'DÃ©tails invalides.' });
      return;
    }

    const updated = await updateTenantClientDetails(req.user.userId, tenantId, details);
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}

/**
 * Unregister from a tenant
 * DELETE /api/tenants/:tenantId/unregister
 */
export async function unregisterFromTenant(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user?.userId) {
      res.status(401).json({ success: false, message: 'Authentification requise.' });
      return;
    }

    const { tenantId } = req.params;
    await removeTenantClient(req.user.userId, tenantId);

    res.status(200).json({ success: true, message: 'DÃ©sinscription rÃ©ussie.' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Une erreur est survenue.';
    res.status(400).json({ success: false, message: errorMessage });
  }
}
