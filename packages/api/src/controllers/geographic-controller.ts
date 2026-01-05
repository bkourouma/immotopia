import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import {
  searchLocations,
  getRegionsByCountry,
  getCommunesByRegion,
  getLocationByCommuneId,
  getAllCommunes
} from '../services/geographic-service';

/**
 * Search locations handler
 * GET /api/geographic/search?q=query&limit=50
 */
export async function searchLocationsHandler(req: Request, res: Response): Promise<void> {
  try {
    const query = (req.query.q as string) || '';
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    const locations = await searchLocations(query, limit);

    res.json({
      success: true,
      data: locations
    });
  } catch (error: any) {
    logger.error('Error searching locations', { error });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to search locations'
    });
  }
}

/**
 * Get regions by country
 * GET /api/geographic/countries/:countryCode/regions
 */
export async function getRegionsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { countryCode } = req.params;
    const regions = await getRegionsByCountry(countryCode);

    res.json({
      success: true,
      data: regions
    });
  } catch (error: any) {
    logger.error('Error getting regions', { error });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get regions'
    });
  }
}

/**
 * Get communes by region
 * GET /api/geographic/regions/:regionId/communes
 */
export async function getCommunesHandler(req: Request, res: Response): Promise<void> {
  try {
    const { regionId } = req.params;
    const communes = await getCommunesByRegion(regionId);

    res.json({
      success: true,
      data: communes
    });
  } catch (error: any) {
    logger.error('Error getting communes', { error });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get communes'
    });
  }
}

/**
 * Get all communes
 * GET /api/geographic/communes
 */
export async function getAllCommunesHandler(req: Request, res: Response): Promise<void> {
  try {
    const communes = await getAllCommunes();

    res.json({
      success: true,
      data: communes
    });
  } catch (error: any) {
    logger.error('Error getting all communes', { error });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get communes'
    });
  }
}

/**
 * Get location by commune ID
 * GET /api/geographic/locations/:communeId
 */
export async function getLocationHandler(req: Request, res: Response): Promise<void> {
  try {
    const { communeId } = req.params;
    const location = await getLocationByCommuneId(communeId);

    if (!location) {
      res.status(404).json({
        success: false,
        error: 'Location not found'
      });
      return;
    }

    res.json({
      success: true,
      data: location
    });
  } catch (error: any) {
    logger.error('Error getting location', { error });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get location'
    });
  }
}




