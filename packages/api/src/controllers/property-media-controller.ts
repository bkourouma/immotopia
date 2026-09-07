import { Request, Response } from 'express';
import {
  uploadMedia,
  reorderMedia,
  setPrimaryMedia,
  deleteMedia,
  getPropertyMedia
} from '../services/property-media-service';
import { PropertyMediaType } from '@prisma/client';
import { asyncHandler, BadRequestError } from '../middleware/error-middleware';

/**
 * Reference implementation of the target controller shape:
 * `asyncHandler` + typed errors thrown to the central error middleware, instead
 * of a per-handler try/catch that re-derives the HTTP status from the message.
 */

/**
 * Resolve the tenant the caller is authorised for.
 * Set by enforcePropertyTenantIsolation; required to scope every property lookup.
 */
function requireTenantId(req: Request): string {
  const tenantId = req.propertyTenantId || req.tenantContext?.tenantId;
  if (!tenantId) {
    throw new BadRequestError('Contexte tenant requis pour les opérations sur les biens.');
  }
  return tenantId;
}

/**
 * Upload media handler
 */
export const uploadMediaHandler = asyncHandler(async (req: Request, res: Response) => {
  const propertyId = req.params.id;
  const tenantId = requireTenantId(req);
  const userId = req.user?.userId;

  if (!req.file) {
    throw new BadRequestError('Un fichier est requis.');
  }

  const mediaType = (req.body.mediaType || PropertyMediaType.PHOTO) as PropertyMediaType;
  const displayOrder = req.body.displayOrder ? parseInt(req.body.displayOrder, 10) : undefined;
  const isPrimary = req.body.isPrimary === 'true' || req.body.isPrimary === true;

  const media = await uploadMedia(propertyId, tenantId, req.file, mediaType, displayOrder, isPrimary, userId);

  res.status(201).json({ success: true, data: media });
});

/**
 * List media handler
 */
export const listMediaHandler = asyncHandler(async (req: Request, res: Response) => {
  const propertyId = req.params.id;
  const tenantId = requireTenantId(req);

  const media = await getPropertyMedia(propertyId, tenantId);

  res.json({ success: true, data: media });
});

/**
 * Reorder media handler
 */
export const reorderMediaHandler = asyncHandler(async (req: Request, res: Response) => {
  const propertyId = req.params.id;
  const tenantId = requireTenantId(req);
  const userId = req.user?.userId;
  const mediaOrders = req.body.mediaOrders as Array<{ mediaId: string; displayOrder: number }>;

  if (!Array.isArray(mediaOrders)) {
    throw new BadRequestError('mediaOrders doit être un tableau.');
  }

  await reorderMedia(propertyId, tenantId, mediaOrders, userId);

  res.json({ success: true, message: 'Media reordered successfully' });
});

/**
 * Delete media handler
 */
export const deleteMediaHandler = asyncHandler(async (req: Request, res: Response) => {
  const propertyId = req.params.id;
  const mediaId = req.params.mediaId;
  const tenantId = requireTenantId(req);
  const userId = req.user?.userId;

  await deleteMedia(propertyId, tenantId, mediaId, userId);

  res.json({ success: true, message: 'Media deleted successfully' });
});

/**
 * Set primary media handler
 */
export const setPrimaryMediaHandler = asyncHandler(async (req: Request, res: Response) => {
  const propertyId = req.params.id;
  const mediaId = req.body.mediaId;
  const tenantId = requireTenantId(req);
  const userId = req.user?.userId;

  if (!mediaId) {
    throw new BadRequestError('mediaId est requis.');
  }

  const media = await setPrimaryMedia(propertyId, tenantId, mediaId, userId);

  res.json({ success: true, data: media });
});
