import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import {
  uploadMedia,
  reorderMedia,
  setPrimaryMedia,
  deleteMedia,
  getPropertyMedia
} from '../services/property-media-service';
import { getTenantIdFromRequest } from '../middleware/tenant-isolation-middleware';
import { PropertyMediaType } from '@prisma/client';

/**
 * Upload media handler
 */
export async function uploadMediaHandler(req: Request, res: Response): Promise<void> {
  try {
    const propertyId = req.params.id;
    const userId = req.user?.userId;

    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'File is required'
      });
      return;
    }

    const mediaType = (req.body.mediaType || PropertyMediaType.PHOTO) as PropertyMediaType;
    const displayOrder = req.body.displayOrder ? parseInt(req.body.displayOrder, 10) : undefined;
    const isPrimary = req.body.isPrimary === 'true' || req.body.isPrimary === true;

    const media = await uploadMedia(propertyId, req.file, mediaType, displayOrder, isPrimary, userId);

    res.status(201).json({
      success: true,
      data: media
    });
  } catch (error: any) {
    logger.error('Error uploading media', { error, propertyId: req.params.id });
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to upload media'
    });
  }
}

/**
 * List media handler
 */
export async function listMediaHandler(req: Request, res: Response): Promise<void> {
  try {
    const propertyId = req.params.id;
    const media = await getPropertyMedia(propertyId);

    res.json({
      success: true,
      data: media
    });
  } catch (error: any) {
    logger.error('Error listing media', { error, propertyId: req.params.id });
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to list media'
    });
  }
}

/**
 * Reorder media handler
 */
export async function reorderMediaHandler(req: Request, res: Response): Promise<void> {
  try {
    const propertyId = req.params.id;
    const userId = req.user?.userId;
    const mediaOrders = req.body.mediaOrders as Array<{ mediaId: string; displayOrder: number }>;

    if (!Array.isArray(mediaOrders)) {
      res.status(400).json({
        success: false,
        error: 'mediaOrders must be an array'
      });
      return;
    }

    await reorderMedia(propertyId, mediaOrders, userId);

    res.json({
      success: true,
      message: 'Media reordered successfully'
    });
  } catch (error: any) {
    logger.error('Error reordering media', { error, propertyId: req.params.id });
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to reorder media'
    });
  }
}

/**
 * Delete media handler
 */
export async function deleteMediaHandler(req: Request, res: Response): Promise<void> {
  try {
    const propertyId = req.params.id;
    const mediaId = req.params.mediaId;
    const userId = req.user?.userId;

    await deleteMedia(propertyId, mediaId, userId);

    res.json({
      success: true,
      message: 'Media deleted successfully'
    });
  } catch (error: any) {
    logger.error('Error deleting media', { error, mediaId: req.params.mediaId });
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to delete media'
    });
  }
}

/**
 * Set primary media handler
 */
export async function setPrimaryMediaHandler(req: Request, res: Response): Promise<void> {
  try {
    const propertyId = req.params.id;
    const mediaId = req.body.mediaId;
    const userId = req.user?.userId;

    if (!mediaId) {
      res.status(400).json({
        success: false,
        error: 'mediaId is required'
      });
      return;
    }

    const media = await setPrimaryMedia(propertyId, mediaId, userId);

    res.json({
      success: true,
      data: media
    });
  } catch (error: any) {
    logger.error('Error setting primary media', { error, propertyId: req.params.id });
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to set primary media'
    });
  }
}




