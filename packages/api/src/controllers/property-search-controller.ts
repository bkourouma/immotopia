import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { searchProperties } from '../services/property-search-service';
import { getTenantIdFromRequest } from '../middleware/tenant-isolation-middleware';
import { PropertySearchRequest } from '../types/property-types';

/**
 * Search properties handler
 */
export async function searchPropertiesHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const userId = req.user?.userId;

    const searchRequest: PropertySearchRequest = {
      propertyType: req.body.propertyType,
      location: req.body.location,
      locationZone: req.body.locationZone,
      priceMin: req.body.priceMin,
      priceMax: req.body.priceMax,
      surfaceAreaMin: req.body.surfaceAreaMin,
      surfaceAreaMax: req.body.surfaceAreaMax,
      rooms: req.body.rooms,
      bedrooms: req.body.bedrooms,
      features: req.body.features,
      transactionMode: req.body.transactionMode,
      status: req.body.status,
      ownershipType: req.body.ownershipType,
      latitude: req.body.latitude,
      longitude: req.body.longitude,
      radius: req.body.radius,
      page: req.body.page || req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.body.limit || req.query.limit ? parseInt(req.query.limit as string, 10) : 20
    };

    const result = await searchProperties(searchRequest, tenantId, userId);

    res.json({
      success: true,
      data: result.properties,
      pagination: result.pagination
    });
  } catch (error: any) {
    logger.error('Error searching properties', { error });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to search properties'
    });
  }
}




