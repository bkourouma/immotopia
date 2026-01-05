import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { getPublishedProperties, getPublishedProperty } from '../services/property-publication-service';

/**
 * Get published properties handler (public access, no authentication required)
 */
export async function getPublishedPropertiesHandler(req: Request, res: Response): Promise<void> {
  try {
    const filters = {
      propertyType: req.query.propertyType as any,
      locationZone: req.query.locationZone as string | undefined,
      priceMin: req.query.priceMin ? parseFloat(req.query.priceMin as string) : undefined,
      priceMax: req.query.priceMax ? parseFloat(req.query.priceMax as string) : undefined,
      surfaceAreaMin: req.query.surfaceAreaMin ? parseFloat(req.query.surfaceAreaMin as string) : undefined,
      surfaceAreaMax: req.query.surfaceAreaMax ? parseFloat(req.query.surfaceAreaMax as string) : undefined,
      rooms: req.query.rooms ? parseInt(req.query.rooms as string, 10) : undefined,
      transactionMode: req.query.transactionMode as any
    };

    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    const result = await getPublishedProperties(filters, page, limit);

    res.json({
      success: true,
      data: result.properties,
      pagination: result.pagination
    });
  } catch (error: any) {
    logger.error('Error getting published properties', { error });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get published properties'
    });
  }
}

/**
 * Get single published property handler (public access, no authentication required)
 */
export async function getPublishedPropertyHandler(req: Request, res: Response): Promise<void> {
  try {
    const propertyId = req.params.id;

    const property = await getPublishedProperty(propertyId);

    if (!property) {
      res.status(404).json({
        success: false,
        error: 'Property not found or not published'
      });
      return;
    }

    res.json({
      success: true,
      data: property
    });
  } catch (error: any) {
    logger.error('Error getting published property', { error, propertyId: req.params.id });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get published property'
    });
  }
}




