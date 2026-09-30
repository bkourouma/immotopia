import { Request, Response } from 'express';
import { getPublishedProperties, getPublishedProperty } from '../services/property-publication-service';
import { parsePagination } from '../utils/pagination-helper';
import { asyncHandler, NotFoundError } from '../middleware/error-middleware';

/**
 * Get published properties handler (public access, no authentication required)
 */
export const getPublishedPropertiesHandler = asyncHandler(async (req: Request, res: Response) => {
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

  const { page, limit } = parsePagination(req.query, { defaultPage: 1, defaultLimit: 20 });

  const result = await getPublishedProperties(filters, page, limit);

  res.json({
    success: true,
    data: result.properties,
    pagination: result.pagination
  });
});

/**
 * Get single published property handler (public access, no authentication required)
 */
export const getPublishedPropertyHandler = asyncHandler(async (req: Request, res: Response) => {
  const property = await getPublishedProperty(req.params.id);

  if (!property) {
    throw new NotFoundError("Ce bien n'existe pas ou n'est pas publié.");
  }

  res.json({
    success: true,
    data: property
  });
});
