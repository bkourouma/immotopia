import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { prisma } from '../utils/database';
import {
  matchPropertiesForDeal,
  addToShortlist,
  updatePropertyMatchStatus,
  generateMatchExplanation
} from '../services/property-matching-service';
import { getTenantIdFromRequest } from '../middleware/tenant-isolation-middleware';
import { CrmDealPropertyStatus } from '@prisma/client';

/**
 * Match properties for a deal handler
 */
export async function matchPropertiesHandler(req: Request, res: Response): Promise<void> {
  try {
    const dealId = req.params.dealId;
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    if (!tenantId) {
      res.status(400).json({
        success: false,
        error: 'Tenant ID is required'
      });
      return;
    }

    const matches = await matchPropertiesForDeal(dealId, tenantId, limit);

    // Enrich with property details and explanations
    const enrichedMatches = await Promise.all(
      matches.map(async match => {
        const property = await prisma.property.findUnique({
          where: { id: match.propertyId },
          include: {
            media: {
              where: { isPrimary: true },
              take: 1
            }
          }
        });

        return {
          ...match,
          property,
          explanationText: generateMatchExplanation(match)
        };
      })
    );

    res.json({
      success: true,
      data: enrichedMatches
    });
  } catch (error: any) {
    logger.error('Error matching properties', { error, dealId: req.params.dealId });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to match properties'
    });
  }
}

/**
 * Add property to deal shortlist handler
 */
export async function addToShortlistHandler(req: Request, res: Response): Promise<void> {
  try {
    const dealId = req.params.dealId;
    const propertyId = req.body.propertyId;
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const matchScore = req.body.matchScore;
    const matchExplanation = req.body.matchExplanation;
    const sourceOwnerContactId = req.body.sourceOwnerContactId;

    if (!tenantId) {
      res.status(400).json({
        success: false,
        error: 'Tenant ID is required'
      });
      return;
    }

    if (!propertyId) {
      res.status(400).json({
        success: false,
        error: 'Property ID is required'
      });
      return;
    }

    const dealProperty = await addToShortlist(
      dealId,
      propertyId,
      tenantId,
      matchScore,
      matchExplanation,
      sourceOwnerContactId
    );

    res.json({
      success: true,
      data: dealProperty
    });
  } catch (error: any) {
    logger.error('Error adding property to shortlist', { error });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to add property to shortlist'
    });
  }
}

/**
 * Update property match status handler
 */
export async function updateMatchStatusHandler(req: Request, res: Response): Promise<void> {
  try {
    const dealId = req.params.dealId;
    const propertyId = req.body.propertyId;
    const status = req.body.status as CrmDealPropertyStatus;
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;

    if (!tenantId) {
      res.status(400).json({
        success: false,
        error: 'Tenant ID is required'
      });
      return;
    }

    if (!propertyId || !status) {
      res.status(400).json({
        success: false,
        error: 'Property ID and status are required'
      });
      return;
    }

    const dealProperty = await updatePropertyMatchStatus(dealId, propertyId, tenantId, status);

    res.json({
      success: true,
      data: dealProperty
    });
  } catch (error: any) {
    logger.error('Error updating match status', { error });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update match status'
    });
  }
}
