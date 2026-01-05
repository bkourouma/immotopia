import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import {
  createProperty,
  getPropertyById,
  updateProperty,
  listProperties,
  publishPropertyWrapper,
  unpublishPropertyWrapper
} from '../services/property-service';
import { getLatestQualityScore, calculateQualityScore } from '../services/property-quality-service';
import { getTemplateByType, getAllTemplates } from '../services/property-template-service';
import { getTenantIdFromRequest } from '../middleware/tenant-isolation-middleware';
import { CreatePropertyRequest, UpdatePropertyRequest } from '../types/property-types';
import { PropertyType } from '@prisma/client';

/**
 * Create property handler
 */
export async function createPropertyHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || getTenantIdFromRequest(req);
    const userId = req.user?.userId;
    const actorUserId = userId;

    const data: CreatePropertyRequest = {
      propertyType: req.body.propertyType,
      ownershipType: req.body.ownershipType,
      tenantId: req.body.tenantId,
      ownerUserId: req.body.ownerUserId || userId,
      ownerEmail: req.body.ownerEmail,
      title: req.body.title,
      description: req.body.description,
      address: req.body.address,
      locationZone: req.body.locationZone,
      latitude: req.body.latitude,
      longitude: req.body.longitude,
      transactionModes: req.body.transactionModes,
      price: req.body.price,
      fees: req.body.fees,
      currency: req.body.currency || 'EUR',
      surfaceArea: req.body.surfaceArea,
      surfaceUseful: req.body.surfaceUseful,
      surfaceTerrain: req.body.surfaceTerrain,
      rooms: req.body.rooms,
      bedrooms: req.body.bedrooms,
      bathrooms: req.body.bathrooms,
      furnishingStatus: req.body.furnishingStatus,
      availability: req.body.availability,
      typeSpecificData: req.body.typeSpecificData
    };

    const property = await createProperty(tenantId, data.ownerUserId || userId || null, data, actorUserId);

    res.status(201).json({
      success: true,
      data: property
    });
  } catch (error: any) {
    logger.error('Error creating property', { error, body: req.body });
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to create property'
    });
  }
}

/**
 * Get property handler
 */
export async function getPropertyHandler(req: Request, res: Response): Promise<void> {
  try {
    const propertyId = req.params.id;
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const userId = req.user?.userId;

    const property = await getPropertyById(propertyId, tenantId, userId);

    if (!property) {
      res.status(404).json({
        success: false,
        error: 'Property not found'
      });
      return;
    }

    res.json({
      success: true,
      data: property
    });
  } catch (error: any) {
    logger.error('Error getting property', { error, propertyId: req.params.id });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get property'
    });
  }
}

/**
 * Update property handler
 */
export async function updatePropertyHandler(req: Request, res: Response): Promise<void> {
  try {
    const propertyId = req.params.id;
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const userId = req.user?.userId;
    const actorUserId = userId;

    const data: UpdatePropertyRequest = {
      ownerUserId: req.body.ownerUserId,
      title: req.body.title,
      description: req.body.description,
      address: req.body.address,
      locationZone: req.body.locationZone,
      latitude: req.body.latitude,
      longitude: req.body.longitude,
      transactionModes: req.body.transactionModes,
      price: req.body.price,
      fees: req.body.fees,
      currency: req.body.currency,
      surfaceArea: req.body.surfaceArea,
      surfaceUseful: req.body.surfaceUseful,
      surfaceTerrain: req.body.surfaceTerrain,
      rooms: req.body.rooms,
      bedrooms: req.body.bedrooms,
      bathrooms: req.body.bathrooms,
      furnishingStatus: req.body.furnishingStatus,
      availability: req.body.availability,
      typeSpecificData: req.body.typeSpecificData
    };

    const property = await updateProperty(propertyId, data, tenantId, userId, actorUserId);

    res.json({
      success: true,
      data: property
    });
  } catch (error: any) {
    logger.error('Error updating property', { error, propertyId: req.params.id });

    if (error.message?.includes('not found')) {
      res.status(404).json({
        success: false,
        error: error.message
      });
      return;
    }

    if (error.message?.includes('version')) {
      res.status(409).json({
        success: false,
        error: 'Property was modified by another user. Please refresh and try again.'
      });
      return;
    }

    res.status(400).json({
      success: false,
      error: error.message || 'Failed to update property'
    });
  }
}

/**
 * List properties handler
 */
export async function listPropertiesHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const userId = req.user?.userId;

    const filters = {
      propertyType: req.query.propertyType as PropertyType | undefined,
      ownershipType: req.query.ownershipType as any,
      status: req.query.status as any,
      transactionMode: req.query.transactionMode as any,
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20
    };

    const result = await listProperties(tenantId, userId, filters);

    res.json({
      success: true,
      data: result.properties,
      pagination: {
        page: filters.page || 1,
        limit: filters.limit || 20,
        total: result.total,
        totalPages: Math.ceil(result.total / (filters.limit || 20))
      }
    });
  } catch (error: any) {
    logger.error('Error listing properties', { error });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to list properties'
    });
  }
}

/**
 * Get property template handler
 */
export async function getTemplateHandler(req: Request, res: Response): Promise<void> {
  try {
    const propertyType = req.params.type as PropertyType;
    const template = await getTemplateByType(propertyType);

    if (!template) {
      res.status(404).json({
        success: false,
        error: `Template not found for property type: ${propertyType}`
      });
      return;
    }

    res.json({
      success: true,
      data: template
    });
  } catch (error: any) {
    logger.error('Error getting template', { error, propertyType: req.params.type });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get template'
    });
  }
}

/**
 * List all templates handler
 */
export async function listTemplatesHandler(req: Request, res: Response): Promise<void> {
  try {
    const templates = await getAllTemplates();

    res.json({
      success: true,
      data: templates
    });
  } catch (error: any) {
    logger.error('Error listing templates', { error });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to list templates'
    });
  }
}

/**
 * Publish property handler
 */
export async function publishPropertyHandler(req: Request, res: Response): Promise<void> {
  try {
    const propertyId = req.params.id;
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const userId = req.user?.userId;
    const actorUserId = userId;

    const property = await publishPropertyWrapper(propertyId, tenantId, userId, actorUserId);

    res.json({
      success: true,
      data: property,
      message: 'Property published successfully'
    });
  } catch (error: any) {
    logger.error('Error publishing property', { error, propertyId: req.params.id });
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to publish property'
    });
  }
}

/**
 * Unpublish property handler
 */
export async function unpublishPropertyHandler(req: Request, res: Response): Promise<void> {
  try {
    const propertyId = req.params.id;
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const userId = req.user?.userId;
    const actorUserId = userId;

    const property = await unpublishPropertyWrapper(propertyId, tenantId, userId, actorUserId);

    res.json({
      success: true,
      data: property,
      message: 'Property unpublished successfully'
    });
  } catch (error: any) {
    logger.error('Error unpublishing property', { error, propertyId: req.params.id });
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to unpublish property'
    });
  }
}

/**
 * Get quality score handler
 */
export async function getQualityScoreHandler(req: Request, res: Response): Promise<void> {
  try {
    const propertyId = req.params.id;
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const userId = req.user?.userId;

    // Verify property access
    const property = await getPropertyById(propertyId, tenantId, userId);
    if (!property) {
      res.status(404).json({
        success: false,
        error: 'Property not found or access denied'
      });
      return;
    }

    // Get latest score or calculate new one
    const recalculate = req.query.recalculate === 'true';
    let qualityScore;

    if (recalculate) {
      qualityScore = await calculateQualityScore(propertyId);
    } else {
      const latest = await getLatestQualityScore(propertyId);
      if (latest) {
        qualityScore = {
          score: latest.score,
          suggestions: latest.suggestions as string[],
          breakdown: {
            requiredFields: 0,
            media: 0,
            geolocation: 0,
            description: 0
          }
        };
      } else {
        // Calculate if no score exists
        qualityScore = await calculateQualityScore(propertyId);
      }
    }

    res.json({
      success: true,
      data: qualityScore
    });
  } catch (error: any) {
    logger.error('Error getting quality score', { error, propertyId: req.params.id });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get quality score'
    });
  }
}
