import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { logAuditEvent } from './audit-service';
import { PROPERTY_ENTITY_TYPES } from '../types/audit-types';
import { AuditActionKey } from '../types/audit-types';
import { getPropertyById } from './property-service';
import {
  PropertyMedia,
  PropertyMediaType,
  PropertyStatus,
  PropertyType,
  PropertyTransactionMode,
  PropertyFurnishingStatus,
  PropertyAvailability
} from '@prisma/client';
import { BadRequestError, NotFoundError } from '../middleware/error-middleware';
import { t } from '../i18n';
import { sendPropertyPublishedGroupBroadcast } from './whatsapp-group-automation-service';

const WHATSAPP_SUPPORTED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png']);

function resolvePrimaryPhoto(media: PropertyMedia[] = []): {
  fileUrl: string;
  filePath: string;
  mimeType: string;
} {
  if (!media.length) {
    return { fileUrl: '', filePath: '', mimeType: '' };
  }
  const photos = media.filter(item => item.mediaType === PropertyMediaType.PHOTO);
  const primaryPhoto = photos.find(item => item.isPrimary) || photos[0];
  const primaryMime = String(primaryPhoto?.mimeType || '').toLowerCase();
  const fallbackPhoto = photos.find(item =>
    WHATSAPP_SUPPORTED_IMAGE_MIME_TYPES.has(String(item.mimeType || '').toLowerCase())
  );
  const selectedPhoto =
    primaryPhoto && WHATSAPP_SUPPORTED_IMAGE_MIME_TYPES.has(primaryMime) ? primaryPhoto : fallbackPhoto || primaryPhoto;
  return {
    fileUrl: String(selectedPhoto?.fileUrl || '').trim(),
    filePath: String(selectedPhoto?.filePath || '').trim(),
    mimeType: String(selectedPhoto?.mimeType || '').trim()
  };
}

/**
 * Validate publication requirements
 * @param propertyId - Property ID
 * @returns Validation result with missing requirements
 */
export async function validatePublicationRequirements(propertyId: string): Promise<{
  valid: boolean;
  errors: string[];
}> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    include: {
      media: {
        where: {
          isPrimary: true
        },
        take: 1
      },
      documents: {
        where: {
          isRequired: true,
          isValid: true
        }
      }
    }
  });

  if (!property) {
    return {
      valid: false,
      errors: [t('Bien introuvable.')]
    };
  }

  const errors: string[] = [];

  // Required fields
  if (!property.title || property.title.trim() === '') {
    errors.push(t('Le titre du bien est obligatoire'));
  }

  if (!property.description || property.description.trim() === '') {
    errors.push(t('La description est obligatoire'));
  }

  if (!property.address || property.address.trim() === '') {
    errors.push(t("L'adresse du bien est obligatoire"));
  }

  // Primary photo required
  if (!property.media || property.media.length === 0) {
    errors.push(t('Au moins une photo principale est obligatoire'));
  }

  // Geolocation required
  if (!property.latitude || !property.longitude) {
    errors.push(t('La géolocalisation (latitude/longitude) est obligatoire'));
  }

  // Price required for published properties
  if (!property.price) {
    errors.push(t('Le prix est obligatoire pour la publication'));
  }

  // Status must be AVAILABLE, RESERVED, or UNDER_OFFER
  const allowedStatuses: PropertyStatus[] = [
    PropertyStatus.AVAILABLE,
    PropertyStatus.RESERVED,
    PropertyStatus.UNDER_OFFER
  ];
  if (!allowedStatuses.includes(property.status)) {
    errors.push(t('Le statut du bien doit être : {{statuts}}', { statuts: allowedStatuses.join(', ') }));
  }

  // Required documents must be valid
  const invalidRequiredDocs = property.documents.filter(doc => !doc.isValid);
  if (invalidRequiredDocs.length > 0) {
    errors.push(
      t('Certains documents obligatoires sont invalides ou expirés : {{documents}}', {
        documents: invalidRequiredDocs.map(d => d.documentType).join(', ')
      })
    );
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Publish property to public portal
 * @param propertyId - Property ID
 * @param tenantId - Tenant ID (for validation)
 * @param userId - User ID (for ownership validation)
 * @param actorUserId - User publishing the property (for audit)
 * @returns Updated property
 */
export async function publishProperty(
  propertyId: string,
  tenantId?: string | null,
  userId?: string | null,
  actorUserId?: string
) {
  // Get property with validation
  const property = await getPropertyById(propertyId, tenantId, userId);
  if (!property) {
    throw new NotFoundError('Bien introuvable.');
  }

  // Validate publication requirements
  const validation = await validatePublicationRequirements(propertyId);
  if (!validation.valid) {
    // Refus métier, pas une panne : 400 avec la liste des conditions manquantes
    // (BUG-2026-09-28-009 : c'était un `Error` nu, donc un 500 INTERNAL).
    throw new BadRequestError(
      t('Les conditions de publication ne sont pas remplies : {{conditions}}', {
        conditions: validation.errors.join(', ')
      }),
      validation.errors.map(message => ({ field: 'publication', message }))
    );
  }

  // Update property
  const updated = await prisma.property.update({
    where: { id: propertyId },
    data: {
      isPublished: true,
      publishedAt: new Date()
    }
  });

  logger.info('Property published', {
    propertyId,
    internalReference: property.internalReference
  });

  // Audit log
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId: property.tenantId || null,
      actionKey: AuditActionKey.PROPERTY_PUBLISHED,
      entityType: PROPERTY_ENTITY_TYPES.PROPERTY,
      entityId: propertyId,
      payload: {
        publishedAt: updated.publishedAt
      }
    });
  }

  if (property.tenantId) {
    const primaryPhoto = resolvePrimaryPhoto(property.media || []);
    sendPropertyPublishedGroupBroadcast({
      tenantId: property.tenantId,
      propertyId: property.id,
      propertyTitle: property.title,
      propertyDescription: property.description,
      propertyReference: property.internalReference,
      propertyType: property.propertyType,
      propertyAddress: property.address,
      propertyPrice: property.price ? Number(property.price) : null,
      propertyCurrency: property.currency,
      transactionModes: property.transactionModes as PropertyTransactionMode[],
      surfaceArea: property.surfaceArea ? Number(property.surfaceArea) : null,
      rooms: property.rooms ?? null,
      bedrooms: property.bedrooms ?? null,
      bathrooms: property.bathrooms ?? null,
      furnishingStatus: property.furnishingStatus as PropertyFurnishingStatus | null,
      availability: property.availability as PropertyAvailability | null,
      locationZone: property.locationZone,
      publishedAt: updated.publishedAt,
      primaryImageUrl: primaryPhoto.fileUrl,
      primaryImagePath: primaryPhoto.filePath,
      primaryImageMimeType: primaryPhoto.mimeType
    }).catch(error => {
      logger.warn('Property published WhatsApp group broadcast failed', {
        tenantId: property.tenantId,
        propertyId: property.id,
        error: error instanceof Error ? error.message : String(error)
      });
    });
  }

  // Les emails (PROPERTY_PUBLISHED) seraient gérés par "Notifications email" (email_notification_configs) si un flux dédié est ajouté. Pas de triggerEvent (Règles/Templates).

  return updated;
}

/**
 * Unpublish property from public portal
 * @param propertyId - Property ID
 * @param tenantId - Tenant ID (for validation)
 * @param userId - User ID (for ownership validation)
 * @param actorUserId - User unpublishing the property (for audit)
 * @returns Updated property
 */
export async function unpublishProperty(
  propertyId: string,
  tenantId?: string | null,
  userId?: string | null,
  actorUserId?: string
) {
  // Get property with validation
  const property = await getPropertyById(propertyId, tenantId, userId);
  if (!property) {
    throw new NotFoundError('Bien introuvable.');
  }

  // Update property
  const updated = await prisma.property.update({
    where: { id: propertyId },
    data: {
      isPublished: false,
      publishedAt: null
    }
  });

  logger.info('Property unpublished', {
    propertyId,
    internalReference: property.internalReference
  });

  // Audit log
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId: property.tenantId || null,
      actionKey: AuditActionKey.PROPERTY_UNPUBLISHED,
      entityType: PROPERTY_ENTITY_TYPES.PROPERTY,
      entityId: propertyId
    });
  }

  return updated;
}

/**
 * Get published properties for public portal
 * @param filters - Search filters (public-safe)
 * @param page - Page number
 * @param limit - Items per page
 * @returns Published properties
 */
export async function getPublishedProperties(
  filters?: {
    propertyType?: PropertyType;
    locationZone?: string;
    priceMin?: number;
    priceMax?: number;
    surfaceAreaMin?: number;
    surfaceAreaMax?: number;
    rooms?: number;
    transactionMode?: PropertyTransactionMode;
  },
  page: number = 1,
  limit: number = 20
) {
  const skip = (page - 1) * limit;

  const where: any = {
    isPublished: true,
    status: {
      in: [PropertyStatus.AVAILABLE, PropertyStatus.RESERVED, PropertyStatus.UNDER_OFFER]
    }
  };

  if (filters?.propertyType) {
    where.propertyType = filters.propertyType;
  }

  if (filters?.locationZone) {
    where.locationZone = {
      contains: filters.locationZone,
      mode: 'insensitive'
    };
  }

  if (filters?.priceMin !== undefined || filters?.priceMax !== undefined) {
    where.price = {};
    if (filters.priceMin !== undefined) {
      where.price.gte = filters.priceMin;
    }
    if (filters.priceMax !== undefined) {
      where.price.lte = filters.priceMax;
    }
  }

  if (filters?.surfaceAreaMin !== undefined || filters?.surfaceAreaMax !== undefined) {
    where.surfaceArea = {};
    if (filters.surfaceAreaMin !== undefined) {
      where.surfaceArea.gte = filters.surfaceAreaMin;
    }
    if (filters.surfaceAreaMax !== undefined) {
      where.surfaceArea.lte = filters.surfaceAreaMax;
    }
  }

  if (filters?.rooms !== undefined) {
    where.rooms = {
      gte: filters.rooms
    };
  }

  if (filters?.transactionMode) {
    where.transactionModes = {
      has: filters.transactionMode
    };
  }

  const total = await prisma.property.count({ where });

  const properties = await prisma.property.findMany({
    where,
    skip,
    take: limit,
    orderBy: [{ publishedAt: 'desc' }, { qualityScore: 'desc' }],
    include: {
      media: {
        where: {
          isPrimary: true
        },
        take: 1
      }
    }
  });

  return {
    properties,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

/**
 * Get single published property (public access)
 * @param propertyId - Property ID
 * @returns Published property or null
 */
export async function getPublishedProperty(propertyId: string) {
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      isPublished: true,
      status: {
        in: [PropertyStatus.AVAILABLE, PropertyStatus.RESERVED, PropertyStatus.UNDER_OFFER]
      }
    },
    include: {
      media: {
        orderBy: {
          displayOrder: 'asc'
        }
      },
      documents: {
        where: {
          isValid: true
        }
      }
    }
  });

  return property;
}
