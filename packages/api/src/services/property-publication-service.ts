import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { logAuditEvent } from './audit-service';
import { PROPERTY_ENTITY_TYPES } from '../types/audit-types';
import { AuditActionKey } from '../types/audit-types';
import { getPropertyById } from './property-service';
import { PropertyStatus, PropertyType, PropertyTransactionMode } from '@prisma/client';

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
      errors: ['Property not found']
    };
  }

  const errors: string[] = [];

  // Required fields
  if (!property.title || property.title.trim() === '') {
    errors.push('Title is required');
  }

  if (!property.description || property.description.trim() === '') {
    errors.push('Description is required');
  }

  if (!property.address || property.address.trim() === '') {
    errors.push('Address is required');
  }

  // Primary photo required
  if (!property.media || property.media.length === 0) {
    errors.push('At least one primary photo is required');
  }

  // Geolocation required
  if (!property.latitude || !property.longitude) {
    errors.push('Geolocation (latitude/longitude) is required');
  }

  // Price required for published properties
  if (!property.price) {
    errors.push('Price is required for publication');
  }

  // Status must be AVAILABLE, RESERVED, or UNDER_OFFER
  const allowedStatuses = [PropertyStatus.AVAILABLE, PropertyStatus.RESERVED, PropertyStatus.UNDER_OFFER];
  if (!allowedStatuses.includes(property.status)) {
    errors.push(`Property status must be one of: ${allowedStatuses.join(', ')}`);
  }

  // Required documents must be valid
  const invalidRequiredDocs = property.documents.filter(doc => !doc.isValid);
  if (invalidRequiredDocs.length > 0) {
    errors.push(
      `Some required documents are invalid or expired: ${invalidRequiredDocs.map(d => d.documentType).join(', ')}`
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
    throw new Error('Property not found or access denied');
  }

  // Validate publication requirements
  const validation = await validatePublicationRequirements(propertyId);
  if (!validation.valid) {
    throw new Error(`Publication requirements not met: ${validation.errors.join(', ')}`);
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
    throw new Error('Property not found or access denied');
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
