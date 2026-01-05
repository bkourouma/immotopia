import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import {
  scheduleVisit,
  updateVisitStatus,
  getPropertyVisits,
  getCalendarVisits,
  completeVisit
} from '../services/property-visit-service';
import { PropertyVisitType, PropertyVisitStatus, PropertyVisitGoal } from '@prisma/client';

/**
 * Schedule visit handler
 */
export async function scheduleVisitHandler(req: Request, res: Response): Promise<void> {
  try {
    const propertyId = req.params.id;
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const userId = req.user?.userId;

    const visitData = {
      contactId: req.body.contactId || null,
      dealId: req.body.dealId || null,
      visitType: (req.body.visitType as PropertyVisitType) || PropertyVisitType.VISIT,
      goal: req.body.goal ? (req.body.goal as PropertyVisitGoal) : null,
      scheduledAt: new Date(req.body.scheduledAt),
      duration: req.body.duration || null,
      location: req.body.location || null,
      assignedToUserId: req.body.assignedToUserId || null,
      collaboratorIds: req.body.collaboratorIds || [],
      notes: req.body.notes || null
    };

    const visit = await scheduleVisit(propertyId, visitData, tenantId, userId);

    res.json({
      success: true,
      data: visit
    });
  } catch (error: any) {
    logger.error('Error scheduling visit', { error, propertyId: req.params.id });
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to schedule visit'
    });
  }
}

/**
 * Update visit status handler
 */
export async function updateVisitStatusHandler(req: Request, res: Response): Promise<void> {
  try {
    const visitId = req.params.visitId;
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const userId = req.user?.userId;
    const status = req.body.status as PropertyVisitStatus;
    const notes = req.body.notes || null;

    if (!status) {
      res.status(400).json({
        success: false,
        error: 'Status is required'
      });
      return;
    }

    const visit = await updateVisitStatus(visitId, status, tenantId, userId, notes);

    res.json({
      success: true,
      data: visit
    });
  } catch (error: any) {
    logger.error('Error updating visit status', { error, visitId: req.params.visitId });
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to update visit status'
    });
  }
}

/**
 * Get property visits handler
 */
export async function getPropertyVisitsHandler(req: Request, res: Response): Promise<void> {
  try {
    const propertyId = req.params.id;
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;

    const visits = await getPropertyVisits(propertyId, tenantId);

    res.json({
      success: true,
      data: visits
    });
  } catch (error: any) {
    logger.error('Error getting property visits', { error, propertyId: req.params.id });
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to get property visits'
    });
  }
}

/**
 * Get calendar visits handler
 */
export async function getCalendarVisitsHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const assignedToUserId = req.query.assignedToUserId as string | undefined;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date();
    const endDate = req.query.endDate
      ? new Date(req.query.endDate as string)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Default: 30 days from now

    const visits = await getCalendarVisits(startDate, endDate, tenantId, assignedToUserId || null);

    res.json({
      success: true,
      data: visits
    });
  } catch (error: any) {
    logger.error('Error getting calendar visits', { error });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get calendar visits'
    });
  }
}

/**
 * Complete visit handler
 */
export async function completeVisitHandler(req: Request, res: Response): Promise<void> {
  try {
    const visitId = req.params.visitId;
    const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
    const userId = req.user?.userId;
    const notes = req.body.notes || null;

    const visit = await completeVisit(visitId, tenantId, userId, notes);

    res.json({
      success: true,
      data: visit
    });
  } catch (error: any) {
    logger.error('Error completing visit', { error, visitId: req.params.visitId });
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to complete visit'
    });
  }
}
