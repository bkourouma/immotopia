import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { PropertySearchRequest, PropertySearchResponse, PropertyDetail } from '../types/property-types';
import { PropertyType, PropertyOwnershipType, PropertyStatus, PropertyTransactionMode } from '@prisma/client';
import { calculateDistance } from '../utils/geolocation-utils';

/**
 * Build Prisma query from search filters
 * @param filters - Search filters
 * @param tenantId - Tenant ID (for isolation)
 * @param userId - User ID (for ownership filtering)
 * @returns Prisma where clause
 */
function buildSearchQuery(filters: PropertySearchRequest, tenantId?: string | null, userId?: string | null): any {
  const where: any = {
    OR: []
  };

  // Tenant isolation and ownership filtering
  if (tenantId) {
    where.OR.push({
      ownershipType: PropertyOwnershipType.TENANT,
      tenantId
    });
  }

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

  // Property type filter
  if (filters.propertyType) {
    where.propertyType = filters.propertyType;
  }

  // Ownership type filter
  if (filters.ownershipType) {
    where.ownershipType = filters.ownershipType;
  }

  // Status filter
  if (filters.status) {
    where.status = filters.status;
  } else {
    // Default: only show available properties in search
    where.status = {
      in: [PropertyStatus.AVAILABLE, PropertyStatus.RESERVED, PropertyStatus.UNDER_OFFER]
    };
  }

  // Transaction mode filter
  if (filters.transactionMode) {
    where.transactionModes = {
      has: filters.transactionMode
    };
  }

  // Price range filter
  if (filters.priceMin !== undefined || filters.priceMax !== undefined) {
    where.price = {};
    if (filters.priceMin !== undefined) {
      where.price.gte = filters.priceMin;
    }
    if (filters.priceMax !== undefined) {
      where.price.lte = filters.priceMax;
    }
  }

  // Surface area filter
  if (filters.surfaceAreaMin !== undefined || filters.surfaceAreaMax !== undefined) {
    where.surfaceArea = {};
    if (filters.surfaceAreaMin !== undefined) {
      where.surfaceArea.gte = filters.surfaceAreaMin;
    }
    if (filters.surfaceAreaMax !== undefined) {
      where.surfaceArea.lte = filters.surfaceAreaMax;
    }
  }

  // Rooms filter
  if (filters.rooms !== undefined) {
    where.rooms = {
      gte: filters.rooms
    };
  }

  // Bedrooms filter
  if (filters.bedrooms !== undefined) {
    where.bedrooms = {
      gte: filters.bedrooms
    };
  }

  // Location zone filter
  if (filters.locationZone) {
    where.locationZone = {
      contains: filters.locationZone,
      mode: 'insensitive'
    };
  }

  // Geolocation search (radius-based)
  if (filters.latitude && filters.longitude && filters.radius) {
    // Note: This is a simplified implementation
    // For production, consider using PostGIS for efficient geospatial queries
    where.latitude = {
      gte: filters.latitude - filters.radius / 111000, // Approximate conversion
      lte: filters.latitude + filters.radius / 111000
    };
    where.longitude = {
      gte: filters.longitude - filters.radius / (111000 * Math.cos((filters.latitude * Math.PI) / 180)),
      lte: filters.longitude + filters.radius / (111000 * Math.cos((filters.latitude * Math.PI) / 180))
    };
  }

  // Features filter (from typeSpecificData)
  // Note: JSON filtering in Prisma is limited, this is a simplified approach
  // For production, consider using full-text search or separate features table
  if (filters.features && filters.features.length > 0) {
    // This would need custom Prisma query or raw SQL for proper JSON filtering
    // For now, we'll skip this filter or implement it differently
  }

  return where;
}

/**
 * Search properties with multiple criteria
 * @param filters - Search filters
 * @param tenantId - Tenant ID (for isolation)
 * @param userId - User ID (for ownership filtering)
 * @returns Search results with pagination
 */
export async function searchProperties(
  filters: PropertySearchRequest,
  tenantId?: string | null,
  userId?: string | null
): Promise<PropertySearchResponse> {
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const skip = (page - 1) * limit;

  // Build search query
  const where = buildSearchQuery(filters, tenantId, userId);

  // Get total count
  const total = await prisma.property.count({ where });

  // Get properties
  let properties = await prisma.property.findMany({
    where,
    skip,
    take: limit,
    orderBy: [{ isPublished: 'desc' }, { qualityScore: 'desc' }, { createdAt: 'desc' }],
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

  // Apply geolocation distance filtering if radius is specified
  if (filters.latitude && filters.longitude && filters.radius) {
    properties = properties.filter(property => {
      if (!property.latitude || !property.longitude) return false;
      const distance = calculateDistance(filters.latitude!, filters.longitude!, property.latitude, property.longitude);
      return distance <= filters.radius!;
    });
  }

  return {
    properties: properties as PropertyDetail[],
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

/**
 * Geolocation-based search
 * @param latitude - Latitude
 * @param longitude - Longitude
 * @param radius - Radius in meters
 * @param filters - Additional filters
 * @param tenantId - Tenant ID
 * @param userId - User ID
 * @returns Properties within radius
 */
export async function geolocationSearch(
  latitude: number,
  longitude: number,
  radius: number,
  filters?: Omit<PropertySearchRequest, 'latitude' | 'longitude' | 'radius'>,
  tenantId?: string | null,
  userId?: string | null
): Promise<PropertySearchResponse> {
  return searchProperties(
    {
      ...filters,
      latitude,
      longitude,
      radius
    },
    tenantId,
    userId
  );
}

/**
 * Paginate search results
 * @param properties - Properties to paginate
 * @param page - Page number
 * @param limit - Items per page
 * @returns Paginated results
 */
export function paginateResults<T>(
  items: T[],
  page: number,
  limit: number
): { items: T[]; pagination: { page: number; limit: number; total: number; totalPages: number } } {
  const total = items.length;
  const skip = (page - 1) * limit;
  const paginatedItems = items.slice(skip, skip + limit);

  return {
    items: paginatedItems,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}
