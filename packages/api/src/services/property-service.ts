import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { logAuditEvent } from './audit-service';
import { PROPERTY_ENTITY_TYPES } from '../types/audit-types';
import { AuditActionKey } from '../types/audit-types';
import { generatePropertyReference } from '../utils/property-reference-generator';
import { validatePropertyData } from './property-template-service';
import { CreatePropertyRequest, UpdatePropertyRequest, PropertyDetail } from '../types/property-types';
import { PropertyType, PropertyOwnershipType, PropertyStatus, PropertyTransactionMode, GlobalRole } from '@prisma/client';

/**
 * Create a tenant-owned property
 * @param tenantId - Tenant ID
 * @param data - Property creation data
 * @param actorUserId - User creating the property (for audit)
 * @returns Created property
 */
export async function createTenantProperty(
  tenantId: string,
  data: CreatePropertyRequest,
  actorUserId?: string
): Promise<PropertyDetail> {
  return createProperty(tenantId, null, { ...data, ownershipType: PropertyOwnershipType.TENANT }, actorUserId);
}

/**
 * Create a public property (private owner)
 * @param ownerUserId - Owner user ID
 * @param data - Property creation data
 * @param actorUserId - User creating the property (for audit)
 * @returns Created property
 */
export async function createPublicProperty(
  ownerUserId: string,
  data: CreatePropertyRequest,
  actorUserId?: string
): Promise<PropertyDetail> {
  return createProperty(null, ownerUserId, { ...data, ownershipType: PropertyOwnershipType.PUBLIC }, actorUserId);
}

/**
 * Create a new property
 * @param tenantId - Tenant ID (for tenant-owned properties)
 * @param ownerUserId - Owner user ID (for public/private owner properties)
 * @param data - Property creation data
 * @param actorUserId - User creating the property (for audit)
 * @returns Created property
 */
export async function createProperty(
  tenantId: string | null,
  ownerUserId: string | null,
  data: CreatePropertyRequest,
  actorUserId?: string
): Promise<PropertyDetail> {
  // Validate ownership type matches provided IDs
  if (data.ownershipType === PropertyOwnershipType.TENANT && !tenantId) {
    throw new Error('Tenant ID is required for tenant-owned properties');
  }
  
  // If ownerEmail is provided, find or create the User
  let finalOwnerUserId = ownerUserId;
  if (data.ownerEmail && !finalOwnerUserId) {
    let user = await prisma.user.findUnique({
      where: { email: data.ownerEmail }
    });
    
    if (!user) {
      // Create a minimal user for the contact
      user = await prisma.user.create({
        data: {
          email: data.ownerEmail,
          globalRole: GlobalRole.USER,
          emailVerified: false,
          isActive: true
        }
      });
      logger.info('Created user from contact email', { userId: user.id, email: data.ownerEmail });
    }
    
    finalOwnerUserId = user.id;
  }
  
  if (data.ownershipType === PropertyOwnershipType.PUBLIC && !finalOwnerUserId) {
    throw new Error('Owner user ID or email is required for public properties');
  }

  // Validate against template
  // Merge typeSpecificData fields into the data object for validation
  const validationData = {
    ...data,
    ...(data.typeSpecificData || {}),
    typeSpecificData: data.typeSpecificData
  };
  const validation = await validatePropertyData(data.propertyType, validationData);

  if (!validation.valid) {
    throw new Error(`Property validation failed: ${validation.errors.join(', ')}`);
  }

  // Generate unique reference
  const internalReference = await generatePropertyReference(tenantId, finalOwnerUserId);

  // Create property
  const property = await prisma.property.create({
    data: {
      internalReference,
      propertyType: data.propertyType,
      ownershipType: data.ownershipType,
      tenantId: data.ownershipType === PropertyOwnershipType.TENANT ? tenantId : null,
      ownerUserId: data.ownershipType === PropertyOwnershipType.PUBLIC ? ownerUserId : null,
      title: data.title,
      description: data.description,
      address: data.address,
      locationZone: data.locationZone || null,
      latitude: data.latitude || null,
      longitude: data.longitude || null,
      transactionModes: data.transactionModes,
      price: data.price || null,
      fees: data.fees || null,
      currency: data.currency || 'EUR',
      surfaceArea: data.surfaceArea || null,
      surfaceUseful: data.surfaceUseful || null,
      surfaceTerrain: data.surfaceTerrain || null,
      rooms: data.rooms || null,
      bedrooms: data.bedrooms || null,
      bathrooms: data.bathrooms || null,
      furnishingStatus: data.furnishingStatus || null,
      status: PropertyStatus.DRAFT,
      availability: data.availability || 'AVAILABLE',
      typeSpecificData: data.typeSpecificData || null
    },
    include: {
      tenant: {
        select: {
          id: true,
          name: true
        }
      },
      owner: {
        select: {
          id: true,
          email: true,
          fullName: true
        }
      }
    }
  });

  logger.info('Property created', {
    propertyId: property.id,
    internalReference: property.internalReference,
    propertyType: property.propertyType,
    tenantId: property.tenantId,
    ownerUserId: property.ownerUserId
  });

  // Audit log
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId: property.tenantId || null,
      actionKey: AuditActionKey.PROPERTY_CREATED,
      entityType: PROPERTY_ENTITY_TYPES.PROPERTY,
      entityId: property.id,
      payload: {
        propertyType: property.propertyType,
        ownershipType: property.ownershipType,
        internalReference: property.internalReference
      }
    });
  }

  // Calculate quality score (async, don't wait)
  const { calculateAndStoreQualityScore } = await import('./property-quality-service');
  calculateAndStoreQualityScore(property.id).catch(error => {
    logger.warn('Failed to calculate quality score', { propertyId: property.id, error });
  });

  return property as PropertyDetail;
}

/**
 * Get property by ID with ownership checks
 * @param propertyId - Property ID
 * @param tenantId - Tenant ID (for tenant isolation)
 * @param userId - User ID (for ownership checks)
 * @returns Property detail
 */
export async function getPropertyById(
  propertyId: string,
  tenantId?: string | null,
  userId?: string | null
): Promise<PropertyDetail | null> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    include: {
      tenant: {
        select: {
          id: true,
          name: true
        }
      },
      owner: {
        select: {
          id: true,
          email: true,
          fullName: true
        }
      },
      media: {
        orderBy: {
          displayOrder: 'asc'
        }
      },
      documents: true,
      statusHistory: {
        orderBy: {
          createdAt: 'desc'
        },
        take: 10
      }
    }
  });

  if (!property) {
    return null;
  }

  // Tenant isolation check for tenant-owned properties
  if (property.ownershipType === PropertyOwnershipType.TENANT) {
    if (tenantId && property.tenantId !== tenantId) {
      logger.warn('Property access denied - tenant mismatch', {
        propertyId,
        propertyTenantId: property.tenantId,
        requestedTenantId: tenantId
      });
      return null;
    }
  }

  // Ownership check for public properties
  if (property.ownershipType === PropertyOwnershipType.PUBLIC) {
    if (userId && property.ownerUserId !== userId && !property.isPublished) {
      logger.warn('Property access denied - not owner and not published', {
        propertyId,
        propertyOwnerId: property.ownerUserId,
        requestedUserId: userId
      });
      return null;
    }
  }

  return property as PropertyDetail;
}

/**
 * Update property
 * @param propertyId - Property ID
 * @param data - Update data
 * @param tenantId - Tenant ID (for validation)
 * @param userId - User ID (for ownership validation)
 * @param actorUserId - User performing the update (for audit)
 * @returns Updated property
 */
export async function updateProperty(
  propertyId: string,
  data: UpdatePropertyRequest,
  tenantId?: string | null,
  userId?: string | null,
  actorUserId?: string
): Promise<PropertyDetail> {
  // Get existing property
  const existing = await getPropertyById(propertyId, tenantId, userId);
  if (!existing) {
    throw new Error('Property not found or access denied');
  }

  // Validate against template if typeSpecificData is provided
  // Merge typeSpecificData fields into the data object for validation
  if (data.typeSpecificData) {
    const validationData = {
      ...existing,
      ...data,
      ...(data.typeSpecificData || {}), // Merge typeSpecificData fields for validation
      typeSpecificData: data.typeSpecificData
    };
    const validation = await validatePropertyData(existing.propertyType, validationData);

    if (!validation.valid) {
      throw new Error(`Property validation failed: ${validation.errors.join(', ')}`);
    }
  }

  // Build update data object, only including fields that are provided
  const updateData: any = {};
  
  if (data.ownerUserId !== undefined) {
    updateData.ownerUserId = data.ownerUserId || null;
  }
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.address !== undefined) updateData.address = data.address;
  if (data.locationZone !== undefined) updateData.locationZone = data.locationZone;
  if (data.latitude !== undefined) updateData.latitude = data.latitude;
  if (data.longitude !== undefined) updateData.longitude = data.longitude;
  if (data.transactionModes !== undefined) updateData.transactionModes = data.transactionModes;
  if (data.price !== undefined) updateData.price = data.price;
  if (data.fees !== undefined) updateData.fees = data.fees;
  if (data.currency !== undefined) updateData.currency = data.currency;
  if (data.surfaceArea !== undefined) updateData.surfaceArea = data.surfaceArea;
  if (data.surfaceUseful !== undefined) updateData.surfaceUseful = data.surfaceUseful;
  if (data.surfaceTerrain !== undefined) updateData.surfaceTerrain = data.surfaceTerrain;
  if (data.rooms !== undefined) updateData.rooms = data.rooms;
  if (data.bedrooms !== undefined) updateData.bedrooms = data.bedrooms;
  if (data.bathrooms !== undefined) updateData.bathrooms = data.bathrooms;
  if (data.furnishingStatus !== undefined) updateData.furnishingStatus = data.furnishingStatus;
  if (data.availability !== undefined) updateData.availability = data.availability;
  if (data.typeSpecificData !== undefined) updateData.typeSpecificData = data.typeSpecificData;
  
  updateData.version = { increment: 1 };

  // Update property with optimistic locking
  const updated = await prisma.property.update({
    where: {
      id: propertyId,
      version: existing.version // Optimistic locking
    },
    data: updateData,
    include: {
      tenant: {
        select: {
          id: true,
          name: true
        }
      },
      owner: {
        select: {
          id: true,
          email: true,
          fullName: true
        }
      }
    }
  });

  logger.info('Property updated', {
    propertyId: updated.id,
    internalReference: updated.internalReference
  });

  // Audit log
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId: updated.tenantId || null,
      actionKey: AuditActionKey.PROPERTY_UPDATED,
      entityType: PROPERTY_ENTITY_TYPES.PROPERTY,
      entityId: updated.id,
      payload: {
        changes: data
      }
    });
  }

  // Calculate quality score (async, don't wait)
  const { calculateAndStoreQualityScore } = await import('./property-quality-service');
  calculateAndStoreQualityScore(updated.id).catch(error => {
    logger.warn('Failed to calculate quality score', { propertyId: updated.id, error });
  });

  return updated as PropertyDetail;
}

/**
 * List properties with filtering
 * @param tenantId - Tenant ID (for tenant isolation)
 * @param userId - User ID (for ownership filtering)
 * @param filters - Filter options
 * @returns List of properties
 */
export async function listProperties(
  tenantId?: string | null,
  userId?: string | null,
  filters?: {
    propertyType?: PropertyType;
    ownershipType?: PropertyOwnershipType;
    status?: PropertyStatus;
    transactionMode?: PropertyTransactionMode;
    page?: number;
    limit?: number;
  }
): Promise<{ properties: PropertyDetail[]; total: number }> {
  const page = filters?.page || 1;
  const limit = filters?.limit || 20;
  const skip = (page - 1) * limit;

  // Build where clause
  const where: any = {};

  // Tenant isolation for tenant-owned properties
  if (tenantId) {
    where.OR = [
      { ownershipType: PropertyOwnershipType.TENANT, tenantId },
      { ownershipType: PropertyOwnershipType.PUBLIC, isPublished: true },
      { ownershipType: PropertyOwnershipType.CLIENT, mandates: { some: { tenantId, isActive: true } } }
    ];
  } else if (userId) {
    // Public properties owned by user or published
    where.OR = [
      { ownershipType: PropertyOwnershipType.PUBLIC, ownerUserId: userId },
      { ownershipType: PropertyOwnershipType.PUBLIC, isPublished: true }
    ];
  }

  if (filters?.propertyType) {
    where.propertyType = filters.propertyType;
  }

  if (filters?.ownershipType) {
    where.ownershipType = filters.ownershipType;
  }

  if (filters?.status) {
    where.status = filters.status;
  }

  if (filters?.transactionMode) {
    where.transactionModes = {
      has: filters.transactionMode
    };
  }

  // Get total count
  const total = await prisma.property.count({ where });

  // Get properties
  const properties = await prisma.property.findMany({
    where,
    skip,
    take: limit,
    orderBy: {
      createdAt: 'desc'
    },
    include: {
      tenant: {
        select: {
          id: true,
          name: true
        }
      },
      owner: {
        select: {
          id: true,
          email: true,
          fullName: true
        }
      },
      media: {
        where: {
          isPrimary: true
        },
        take: 1
      }
    }
  });

  return {
    properties: properties as PropertyDetail[],
    total
  };
}

/**
 * Update property status (delegates to status service)
 * This is a convenience wrapper
 */
export async function updatePropertyStatusWrapper(
  propertyId: string,
  newStatus: PropertyStatus,
  tenantId?: string | null,
  userId?: string | null,
  actorUserId?: string,
  notes?: string
) {
  const { updatePropertyStatus: updateStatus } = await import('./property-status-service');
  return updateStatus(propertyId, newStatus, tenantId, userId, actorUserId, notes);
}

/**
 * Publish property (delegates to publication service)
 */
export async function publishPropertyWrapper(
  propertyId: string,
  tenantId?: string | null,
  userId?: string | null,
  actorUserId?: string
) {
  const { publishProperty } = await import('./property-publication-service');
  return publishProperty(propertyId, tenantId, userId, actorUserId);
}

/**
 * Unpublish property (delegates to publication service)
 */
export async function unpublishPropertyWrapper(
  propertyId: string,
  tenantId?: string | null,
  userId?: string | null,
  actorUserId?: string
) {
  const { unpublishProperty } = await import('./property-publication-service');
  return unpublishProperty(propertyId, tenantId, userId, actorUserId);
}

/**
 * Get accessible properties for a user/tenant
 * Filters by ownership type and tenant association
 * @param tenantId - Tenant ID (optional)
 * @param userId - User ID (optional)
 * @param filters - Filter options
 * @returns List of accessible properties
 */
export async function getAccessibleProperties(
  tenantId?: string | null,
  userId?: string | null,
  filters?: {
    propertyType?: PropertyType;
    ownershipType?: PropertyOwnershipType;
    status?: PropertyStatus;
    transactionMode?: PropertyTransactionMode;
    page?: number;
    limit?: number;
  }
): Promise<{ properties: PropertyDetail[]; total: number }> {
  const page = filters?.page || 1;
  const limit = filters?.limit || 20;
  const skip = (page - 1) * limit;

  // Build where clause based on access rights
  const where: any = {
    OR: []
  };

  // Tenant-owned properties: user must be in same tenant
  if (tenantId) {
    where.OR.push({
      ownershipType: PropertyOwnershipType.TENANT,
      tenantId
    });
  }

  // Public properties: owner or published
  if (userId) {
    where.OR.push({
      ownershipType: PropertyOwnershipType.PUBLIC,
      OR: [{ ownerUserId: userId }, { isPublished: true }]
    });
  } else {
    where.OR.push({
      ownershipType: PropertyOwnershipType.PUBLIC,
      isPublished: true
    });
  }

  // Client properties with active mandate: tenant has access
  if (tenantId) {
    where.OR.push({
      ownershipType: PropertyOwnershipType.CLIENT,
      mandates: {
        some: {
          tenantId,
          isActive: true
        }
      }
    });
  }

  // Client properties: owner has access
  if (userId) {
    where.OR.push({
      ownershipType: PropertyOwnershipType.CLIENT,
      ownerUserId: userId
    });
  }

  // Apply additional filters
  if (filters?.propertyType) {
    where.propertyType = filters.propertyType;
  }

  if (filters?.ownershipType) {
    where.ownershipType = filters.ownershipType;
  }

  if (filters?.status) {
    where.status = filters.status;
  }

  if (filters?.transactionMode) {
    where.transactionModes = {
      has: filters.transactionMode
    };
  }

  // Get total count
  const total = await prisma.property.count({ where });

  // Get properties
  const properties = await prisma.property.findMany({
    where,
    skip,
    take: limit,
    orderBy: {
      createdAt: 'desc'
    },
    include: {
      tenant: {
        select: {
          id: true,
          name: true
        }
      },
      owner: {
        select: {
          id: true,
          email: true,
          fullName: true
        }
      },
      mandates: {
        where: {
          isActive: true
        },
        include: {
          tenant: {
            select: {
              id: true,
              name: true
            }
          }
        }
      },
      media: {
        where: {
          isPrimary: true
        },
        take: 1
      }
    }
  });

  return {
    properties: properties as PropertyDetail[],
    total
  };
}
