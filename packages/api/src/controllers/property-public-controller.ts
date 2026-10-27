import { Request, Response } from 'express';
import { getPublishedProperties, getPublishedProperty } from '../services/property-publication-service';
import { parsePagination } from '../utils/pagination-helper';
import { asyncHandler, NotFoundError } from '../middleware/error-middleware';
import { PropertyTransactionMode, PropertyType } from '@prisma/client';
import { parseEnumParam, parseIntParam, parseNumberParam } from '../utils/query-params';

/**
 * Get published properties handler (public access, no authentication required)
 */
export const getPublishedPropertiesHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = {
    propertyType: parseEnumParam(req.query.propertyType, PropertyType, 'propertyType'),
    locationZone: req.query.locationZone as string | undefined,
    priceMin: parseNumberParam(req.query.priceMin, 'priceMin'),
    priceMax: parseNumberParam(req.query.priceMax, 'priceMax'),
    surfaceAreaMin: parseNumberParam(req.query.surfaceAreaMin, 'surfaceAreaMin'),
    surfaceAreaMax: parseNumberParam(req.query.surfaceAreaMax, 'surfaceAreaMax'),
    rooms: parseIntParam(req.query.rooms, 'rooms'),
    transactionMode: parseEnumParam(req.query.transactionMode, PropertyTransactionMode, 'transactionMode')
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
