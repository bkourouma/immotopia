import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { logAuditEvent } from './audit-service';
import { PROPERTY_ENTITY_TYPES } from '../types/audit-types';
import { AuditActionKey } from '../types/audit-types';
import { PropertyMediaType } from '@prisma/client';
import { PROPERTY_MEDIA_SELECT } from '../utils/property-media-select';
import * as path from 'path';
import * as fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { getPropertyForTenant } from '../utils/property-tenant-guard';
import { getProjectRoot } from '../utils/project-root';
import { t } from '../i18n';
import { BadRequestError, NotFoundError } from '../middleware/error-middleware';

export { PROPERTY_MEDIA_SELECT };

/**
 * Upload media file for a property
 * @param propertyId - Property ID
 * @param tenantId - Tenant owning the property (enforces isolation)
 * @param file - Uploaded file (from multer)
 * @param mediaType - Type of media
 * @param displayOrder - Display order (optional)
 * @param isPrimary - Whether this is the primary image (optional)
 * @param actorUserId - User uploading the media (for audit)
 * @returns Created media record
 */
export async function uploadMedia(
  propertyId: string,
  tenantId: string,
  file: Express.Multer.File,
  mediaType: PropertyMediaType,
  displayOrder?: number,
  isPrimary?: boolean,
  actorUserId?: string
) {
  // Verify property exists AND belongs to the caller's tenant
  const property = await getPropertyForTenant(propertyId, tenantId);

  // Validate file type based on media type
  if (mediaType === PropertyMediaType.PHOTO) {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!file.mimetype || !allowedTypes.includes(file.mimetype)) {
      // Check if it's actually a video file
      if (file.mimetype && file.mimetype.startsWith('video/')) {
        throw new BadRequestError(
          t(
            'Un fichier vidéo a été fourni alors que le type de média est PHOTO. Utilisez le type VIDEO pour les vidéos.'
          )
        );
      }
      throw new BadRequestError(t('Type de fichier invalide pour une photo. Formats acceptés : JPEG, PNG, WebP'));
    }
  } else if (mediaType === PropertyMediaType.VIDEO) {
    const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
    if (!file.mimetype || !allowedTypes.includes(file.mimetype)) {
      // Check if it's actually an image file
      if (file.mimetype && file.mimetype.startsWith('image/')) {
        throw new BadRequestError(
          t('Une image a été fournie alors que le type de média est VIDEO. Utilisez le type PHOTO pour les images.')
        );
      }
      throw new BadRequestError(t('Type de fichier invalide pour une vidéo. Formats acceptés : MP4, WebM, QuickTime'));
    }
  }

  // Generate file path (store in property-specific directory)
  const projectRoot = getProjectRoot();
  const uploadDir = path.join(projectRoot, 'uploads', 'properties', propertyId);
  await fs.mkdir(uploadDir, { recursive: true });

  // CSPRNG name: Date.now()+Math.random() is guessable, and these files sit
  // under a publicly served directory.
  const fileExtension = path.extname(file.originalname).toLowerCase();
  const fileName = `${randomUUID()}${fileExtension}`;
  const filePath = path.join(uploadDir, fileName);

  // Save file
  await fs.writeFile(filePath, file.buffer);

  // Get next display order if not provided
  let finalDisplayOrder = displayOrder;
  if (finalDisplayOrder === undefined) {
    const maxOrder = await prisma.propertyMedia.findFirst({
      where: { propertyId, tenantId: property.tenantId },
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
        tenantId: property.tenantId,
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
      // Denormalised so media can be scoped by tenant without joining properties.
      tenantId: property.tenantId,
      mediaType,
      filePath: filePath,
      fileUrl: `/uploads/properties/${propertyId}/${fileName}`, // Relative URL for serving
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      displayOrder: finalDisplayOrder,
      isPrimary: isPrimary || false
    },
    select: PROPERTY_MEDIA_SELECT
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
 * @param tenantId - Tenant owning the property (enforces isolation)
 * @param mediaOrders - Array of { mediaId, displayOrder }
 * @param actorUserId - User performing the reorder (for audit)
 */
export async function reorderMedia(
  propertyId: string,
  tenantId: string,
  mediaOrders: Array<{ mediaId: string; displayOrder: number }>,
  _actorUserId?: string
) {
  // Verify property exists AND belongs to the caller's tenant
  await getPropertyForTenant(propertyId, tenantId);

  // Update display orders
  for (const order of mediaOrders) {
    await prisma.propertyMedia.updateMany({
      where: {
        id: order.mediaId,
        propertyId, // Ensure media belongs to property
        tenantId
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
 * @param tenantId - Tenant owning the property (enforces isolation)
 * @param mediaId - Media ID to set as primary
 * @param actorUserId - User setting primary (for audit)
 * @returns Updated media
 */
export async function setPrimaryMedia(propertyId: string, tenantId: string, mediaId: string, _actorUserId?: string) {
  // Verify the property belongs to the caller's tenant before touching media
  await getPropertyForTenant(propertyId, tenantId);

  // Verify property and media exist
  const media = await prisma.propertyMedia.findFirst({
    where: {
      id: mediaId,
      propertyId,
      tenantId
    },
    include: {
      property: true
    }
  });

  if (!media) {
    throw new NotFoundError(t("Média introuvable ou n'appartenant pas à ce bien"));
  }

  // Only photos can be primary
  if (media.mediaType !== PropertyMediaType.PHOTO) {
    throw new BadRequestError(t('Seules les photos peuvent être définies comme photo principale'));
  }

  // Unset other primary media
  await prisma.propertyMedia.updateMany({
    where: {
      propertyId,
      tenantId,
      isPrimary: true,
      id: { not: mediaId }
    },
    data: {
      isPrimary: false
    }
  });

  // Set this media as primary
  const updated = await prisma.propertyMedia.update({
    where: { id: mediaId, tenantId },
    data: { isPrimary: true },
    select: PROPERTY_MEDIA_SELECT
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
 * @param tenantId - Tenant owning the property (enforces isolation)
 * @param mediaId - Media ID to delete
 * @param actorUserId - User deleting the media (for audit)
 */
export async function deleteMedia(propertyId: string, tenantId: string, mediaId: string, actorUserId?: string) {
  // Verify the property belongs to the caller's tenant before touching media
  await getPropertyForTenant(propertyId, tenantId);

  // Get media with property
  const media = await prisma.propertyMedia.findFirst({
    where: {
      id: mediaId,
      propertyId,
      tenantId
    },
    include: {
      property: true
    }
  });

  if (!media) {
    throw new NotFoundError(t("Média introuvable ou n'appartenant pas à ce bien"));
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
    where: { id: mediaId, tenantId }
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
 * @param tenantId - Tenant owning the property (enforces isolation)
 * @returns List of media ordered by displayOrder
 */
export async function getPropertyMedia(propertyId: string, tenantId: string) {
  await getPropertyForTenant(propertyId, tenantId);

  const media = await prisma.propertyMedia.findMany({
    where: { propertyId, tenantId },
    orderBy: { displayOrder: 'asc' },
    select: PROPERTY_MEDIA_SELECT
  });

  return media;
}
