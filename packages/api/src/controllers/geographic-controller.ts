import { Request, Response } from 'express';
import {
  searchLocations,
  getRegionsByCountry,
  getCommunesByRegion,
  getLocationByCommuneId,
  getAllCommunes
} from '../services/geographic-service';
import { asyncHandler, NotFoundError } from '../middleware/error-middleware';

/**
 * Routes publiques : aucune erreur brute ne sort (asyncHandler + errorHandler).
 */

/**
 * Search locations handler
 * GET /api/geographic/search?q=query&limit=50
 */
export const searchLocationsHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = (req.query.q as string) || '';
  const parsedLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 200) : 50;

  const locations = await searchLocations(query, limit);

  res.json({ success: true, data: locations });
});

/**
 * Get regions by country
 * GET /api/geographic/countries/:countryCode/regions
 */
export const getRegionsHandler = asyncHandler(async (req: Request, res: Response) => {
  const regions = await getRegionsByCountry(req.params.countryCode);
  res.json({ success: true, data: regions });
});

/**
 * Get communes by region
 * GET /api/geographic/regions/:regionId/communes
 */
export const getCommunesHandler = asyncHandler(async (req: Request, res: Response) => {
  const communes = await getCommunesByRegion(req.params.regionId);
  res.json({ success: true, data: communes });
});

/**
 * Get all communes
 * GET /api/geographic/communes
 */
export const getAllCommunesHandler = asyncHandler(async (_req: Request, res: Response) => {
  const communes = await getAllCommunes();
  res.json({ success: true, data: communes });
});

/**
 * Get location by commune ID
 * GET /api/geographic/locations/:communeId
 */
export const getLocationHandler = asyncHandler(async (req: Request, res: Response) => {
  const location = await getLocationByCommuneId(req.params.communeId);

  if (!location) {
    throw new NotFoundError('Lieu introuvable.');
  }

  res.json({ success: true, data: location });
});
