import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { logAuditEvent } from './audit-service';
import { PROPERTY_ENTITY_TYPES } from '../types/audit-types';
import { AuditActionKey } from '../types/audit-types';
import { PropertyMediaType } from '@prisma/client';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Upload media file for a property
 * @param propertyId - Property ID
 * @param file - Uploaded file (from multer)
 * @param mediaType - Type of media
 * @param displayOrder - Display order (optional)
 * @param isPrimary - Whether this is the primary image (optional)
 * @param actorUserId - User uploading the media (for audit)
 * @returns Created media record
 */
export async function uploadMedia(
  propertyId: string,
  file: Express.Multer.File,
  mediaType: PropertyMediaType,
  displayOrder?: number,
  isPrimary?: boolean,
  actorUserId?: string
) {
  // Verify property exists
  const property = await prisma.property.findUnique({
    where: { id: propertyId }
  });

  if (!property) {
    throw new Error('Property not found');
  }

  // Validate file type based on media type
  if (mediaType === PropertyMediaType.PHOTO) {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!file.mimetype || !allowedTypes.includes(file.mimetype)) {
      // Check if it's actually a video file
      if (file.mimetype && file.mimetype.startsWith('video/')) {
        throw new Error('Video file provided but mediaType is PHOTO. Please use mediaType VIDEO for video files.');
      }
      throw new Error('Invalid file type for photo. Allowed: JPEG, PNG, WebP');
    }
  } else if (mediaType === PropertyMediaType.VIDEO) {
    const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
    if (!file.mimetype || !allowedTypes.includes(file.mimetype)) {
      // Check if it's actually an image file
      if (file.mimetype && file.mimetype.startsWith('image/')) {
        throw new Error('Image file provided but mediaType is VIDEO. Please use mediaType PHOTO for image files.');
      }
      throw new Error('Invalid file type for video. Allowed: MP4, WebM, QuickTime');
    }
  }

  // Generate file path (store in property-specific directory)
  // When running from packages/api, process.cwd() is packages/api, so go up one level
  // When running from project root, process.cwd() is already the project root
  const cwd = process.cwd();
  const projectRoot =
    path.basename(cwd) === 'api' && path.basename(path.dirname(cwd)) === 'packages' ? path.resolve(cwd, '..') : cwd;
  const uploadDir = path.join(projectRoot, 'uploads', 'properties', propertyId);
  await fs.mkdir(uploadDir, { recursive: true });

  const fileExtension = path.extname(file.originalname);
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}${fileExtension}`;
  const filePath = path.join(uploadDir, fileName);

  // Save file
  await fs.writeFile(filePath, file.buffer);

  // Get next display order if not provided
  let finalDisplayOrder = displayOrder;
  if (finalDisplayOrder === undefined) {
    const maxOrder = await prisma.propertyMedia.findFirst({
      where: { propertyId },
      orderBy: { displayOrder: 'desc' },
      select: { displayOrder: true }
    });
    finalDisplayOrder = maxOrder ? maxOrder.displayOrder + 1 : 0;
  }

  // If this is primary, unset other primary media
  if (isPrimary) {
    await prisma.propertyMedia.updateMany({
      where: {
        propertyId,
        isPrimary: true
      },
      data: {
        isPrimary: false
      }
    });
  }

  // Create media record
  const media = await prisma.propertyMedia.create({
    data: {
      propertyId,
      mediaType,
      filePath: filePath,
      fileUrl: `/uploads/properties/${propertyId}/${fileName}`, // Relative URL for serving
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      displayOrder: finalDisplayOrder,
      isPrimary: isPrimary || false
    }
  });

  logger.info('Property media uploaded', {
    mediaId: media.id,
    propertyId,
    mediaType,
    fileName: file.originalname
  });

  // Audit log
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId: property.tenantId || null,
      actionKey: AuditActionKey.PROPERTY_MEDIA_UPLOADED,
      entityType: PROPERTY_ENTITY_TYPES.PROPERTY_MEDIA,
      entityId: media.id,
      payload: {
        propertyId,
        mediaType,
        fileName: file.originalname
      }
    });
  }

  return media;
}

/**
 * Reorder media items
 * @param propertyId - Property ID
 * @param mediaOrders - Array of { mediaId, displayOrder }
 * @param actorUserId - User performing the reorder (for audit)
 */
export async function reorderMedia(
  propertyId: string,
  mediaOrders: Array<{ mediaId: string; displayOrder: number }>,
  actorUserId?: string
) {
  // Verify property exists
  const property = await prisma.property.findUnique({
    where: { id: propertyId }
  });

  if (!property) {
    throw new Error('Property not found');
  }

  // Update display orders
  for (const order of mediaOrders) {
    await prisma.propertyMedia.updateMany({
      where: {
        id: order.mediaId,
        propertyId // Ensure media belongs to property
      },
      data: {
        displayOrder: order.displayOrder
      }
    });
  }

  logger.info('Property media reordered', {
    propertyId,
    mediaCount: mediaOrders.length
  });

  return { success: true };
}

/**
 * Set primary media
 * @param propertyId - Property ID
 * @param mediaId - Media ID to set as primary
 * @param actorUserId - User setting primary (for audit)
 * @returns Updated media
 */
export async function setPrimaryMedia(propertyId: string, mediaId: string, actorUserId?: string) {
  // Verify property and media exist
  const media = await prisma.propertyMedia.findFirst({
    where: {
      id: mediaId,
      propertyId
    },
    include: {
      property: true
    }
  });

  if (!media) {
    throw new Error('Media not found or does not belong to property');
  }

  // Only photos can be primary
  if (media.mediaType !== PropertyMediaType.PHOTO) {
    throw new Error('Only photos can be set as primary');
  }

  // Unset other primary media
  await prisma.propertyMedia.updateMany({
    where: {
      propertyId,
      isPrimary: true,
      id: { not: mediaId }
    },
    data: {
      isPrimary: false
    }
  });

  // Set this media as primary
  const updated = await prisma.propertyMedia.update({
    where: { id: mediaId },
    data: { isPrimary: true }
  });

  logger.info('Primary media set', {
    mediaId,
    propertyId
  });

  return updated;
}

/**
 * Delete media
 * @param propertyId - Property ID
 * @param mediaId - Media ID to delete
 * @param actorUserId - User deleting the media (for audit)
 */
export async function deleteMedia(propertyId: string, mediaId: string, actorUserId?: string) {
  // Get media with property
  const media = await prisma.propertyMedia.findFirst({
    where: {
      id: mediaId,
      propertyId
    },
    include: {
      property: true
    }
  });

  if (!media) {
    throw new Error('Media not found or does not belong to property');
  }

  // Delete file from filesystem
  try {
    if (media.filePath) {
      await fs.unlink(media.filePath);
    }
  } catch (error) {
    logger.warn('Failed to delete media file', { filePath: media.filePath, error });
    // Continue with database deletion even if file deletion fails
  }

  // Delete media record
  await prisma.propertyMedia.delete({
    where: { id: mediaId }
  });

  logger.info('Property media deleted', {
    mediaId,
    propertyId
  });

  // Audit log
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId: media.property.tenantId || null,
      actionKey: AuditActionKey.PROPERTY_MEDIA_UPLOADED, // Reuse action key
      entityType: PROPERTY_ENTITY_TYPES.PROPERTY_MEDIA,
      entityId: mediaId,
      payload: {
        propertyId,
        action: 'deleted'
      }
    });
  }

  return { success: true };
}

/**
 * Get all media for a property
 * @param propertyId - Property ID
 * @returns List of media ordered by displayOrder
 */
export async function getPropertyMedia(propertyId: string) {
  const media = await prisma.propertyMedia.findMany({
    where: { propertyId },
    orderBy: { displayOrder: 'asc' }
  });

  return media;
}
