import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import {
  createMandate,
  revokeMandate,
  getPropertyMandates,
  getTenantMandates
} from '../services/property-mandate-service';
import { getTenantIdFromRequest } from '../middleware/tenant-isolation-middleware';
import { CreateMandateRequest } from '../types/property-types';

/**
 * Create mandate handler
 */
export async function createMandateHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || getTenantIdFromRequest(req);
    const userId = req.user?.userId;

    const data: CreateMandateRequest = {
      propertyId: req.body.propertyId,
      tenantId,
      startDate: new Date(req.body.startDate),
      endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
      scope: req.body.scope,
      notes: req.body.notes
    };

    const mandate = await createMandate(tenantId, data, userId);

    res.status(201).json({
      success: true,
      data: mandate
    });
  } catch (error: any) {
    logger.error('Error creating mandate', { error, body: req.body });
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to create mandate'
    });
  }
}

/**
 * Revoke mandate handler
 */
export async function revokeMandateHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || getTenantIdFromRequest(req);
    const mandateId = req.params.mandateId;
    const userId = req.user?.userId;

    const mandate = await revokeMandate(mandateId, tenantId, userId);

    res.json({
      success: true,
      data: mandate
    });
  } catch (error: any) {
    logger.error('Error revoking mandate', { error, mandateId: req.params.mandateId });
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to revoke mandate'
    });
  }
}

/**
 * Get property mandates handler
 */
export async function getPropertyMandatesHandler(req: Request, res: Response): Promise<void> {
  try {
    const propertyId = req.params.propertyId || req.params.id;

    const mandates = await getPropertyMandates(propertyId);

    res.json({
      success: true,
      data: mandates
    });
  } catch (error: any) {
    logger.error('Error getting property mandates', { error, propertyId: req.params.propertyId });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get property mandates'
    });
  }
}

/**
 * Get tenant mandates handler
 */
export async function getTenantMandatesHandler(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.params.tenantId || getTenantIdFromRequest(req);

    const mandates = await getTenantMandates(tenantId);

    res.json({
      success: true,
      data: mandates
    });
  } catch (error: any) {
    logger.error('Error getting tenant mandates', { error, tenantId: req.params.tenantId });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get tenant mandates'
    });
  }
}




