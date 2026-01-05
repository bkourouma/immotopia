import { Request, Response } from 'express';
import { getTenantIdFromRequest } from '../middleware/tenant-isolation-middleware';
import {
  matchPropertiesForDeal,
  addPropertyToShortlist,
  updatePropertyMatchStatus,
  getDealPropertyMatches
} from '../services/crm-matching-service';
import { UpdatePropertyMatchStatusRequest, PropertyMatch } from '../types/crm-types';

/**
 * Match properties for a deal
 * POST /tenants/:tenantId/crm/deals/:dealId/match
 */
export async function matchPropertiesHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { dealId } = req.params;
    const threshold = req.body.threshold ? parseInt(req.body.threshold, 10) : 40;
    const limit = req.body.limit ? parseInt(req.body.limit, 10) : 10;

    const matches = await matchPropertiesForDeal(tenantId, dealId, threshold, limit);

    res.status(200).json({
      success: true,
      matches
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
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
      message: 'Failed to match properties'
    });
  }
}

/**
 * Get property matches for a deal
 * GET /tenants/:tenantId/crm/deals/:dealId/matches
 */
export async function getMatchesHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { dealId } = req.params;

    const matches = await getDealPropertyMatches(tenantId, dealId);

    res.status(200).json({
      success: true,
      matches
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: error.message
      });
      return;
    }
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to get matches'
    });
  }
}

/**
 * Add property to shortlist
 * POST /tenants/:tenantId/crm/deals/:dealId/properties
 */
export async function addPropertyToShortlistHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { dealId } = req.params;
    const { propertyId, matchScore, matchExplanation, sourceOwnerContactId } = req.body;

    if (!propertyId) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'propertyId is required'
      });
      return;
    }

    const dealProperty = await addPropertyToShortlist(
      tenantId,
      dealId,
      propertyId,
      matchScore || 0,
      matchExplanation || {},
      sourceOwnerContactId
    );

    res.status(200).json({
      success: true,
      data: dealProperty
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
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
      message: 'Failed to add property to shortlist'
    });
  }
}

/**
 * Update property match status
 * POST /tenants/:tenantId/crm/deals/:dealId/properties/:propertyId/status
 */
export async function updatePropertyStatusHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = getTenantIdFromRequest(req);
    const { dealId, propertyId } = req.params;
    const { status } = req.body as UpdatePropertyMatchStatusRequest;

    if (!status) {
      res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Status is required'
      });
      return;
    }

    const updated = await updatePropertyMatchStatus(tenantId, dealId, propertyId, status);

    res.status(200).json({
      success: true,
      data: updated
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
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
      message: 'Failed to update property status'
    });
  }
}
