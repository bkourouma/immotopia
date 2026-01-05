import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { updatePropertyStatus, getStatusHistory } from '../services/property-status-service';
import { getTenantIdFromRequest } from '../middleware/tenant-isolation-middleware';
import { PropertyStatus } from '@prisma/client';

/**
 * Update property status handler
 */
export async function updateStatusHandler(req: Request, res: Response): Promise<void> {
  try {
    const propertyId = req.params.id;
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const userId = req.user?.userId;
    const actorUserId = userId;

    const newStatus = req.body.status as PropertyStatus;
    const notes = req.body.notes as string | undefined;

    if (!newStatus) {
      res.status(400).json({
        success: false,
        error: 'Status is required'
      });
      return;
    }

    const property = await updatePropertyStatus(propertyId, newStatus, tenantId, userId, actorUserId, notes);

    res.json({
      success: true,
      data: property
    });
  } catch (error: any) {
    logger.error('Error updating property status', { error, propertyId: req.params.id });
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to update property status'
    });
  }
}

/**
 * Get status history handler
 */
export async function getStatusHistoryHandler(req: Request, res: Response): Promise<void> {
  try {
    const propertyId = req.params.id;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    const history = await getStatusHistory(propertyId, limit);

    res.json({
      success: true,
      data: history
    });
  } catch (error: any) {
    logger.error('Error getting status history', { error, propertyId: req.params.id });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get status history'
    });
  }
}




