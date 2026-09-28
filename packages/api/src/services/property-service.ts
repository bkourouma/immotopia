import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { logAuditEvent } from './audit-service';
import { PROPERTY_ENTITY_TYPES } from '../types/audit-types';
import { AuditActionKey } from '../types/audit-types';
import { syncLotActivationsTx } from './lot-registry-service';
import { generatePropertyReference } from '../utils/property-reference-generator';
import { validatePropertyData } from './property-template-service';
import { CreatePropertyRequest, UpdatePropertyRequest, PropertyDetail } from '../types/property-types';
import { createPropertySchema, updatePropertySchema } from '../lib/properties/schemas';
import { BadRequestError, NotFoundError, ConflictError } from '../middleware/error-middleware';
import { PROPERTY_DOCUMENT_SELECT } from './property-document-service';
import {
  PropertyType,
  PropertyOwnershipType,
  PropertyStatus,
  PropertyTransactionMode,
  PropertyMediaType,
  RentalLeaseStatus,
  GlobalRole
} from '@prisma/client';

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
  // Un ZodError leve ici (pas de try/catch : voir lib/properties/schemas.ts)
  // remonte tel quel jusqu'a `errorHandler`, qui le classe en 400
  // `VALIDATION_ERROR` avec le champ en cause — jamais la
  // `PrismaClientValidationError` (500) que `tx.property.create()` levait sur
  // un champ mal type plus bas.
  createPropertySchema.parse(data);

  // Validate ownership type matches provided IDs
  if (data.ownershipType === PropertyOwnershipType.TENANT && !tenantId) {
    throw new BadRequestError('Tenant ID is required for tenant-owned properties');
  }

  // If ownerEmail is provided, find or create the User
  // Priority: data.ownerUserId > data.ownerEmail > ownerUserId parameter
  let finalOwnerUserId = data.ownerUserId || ownerUserId;
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
    throw new BadRequestError('Owner user ID or email is required for public properties');
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
    throw new BadRequestError(`Property validation failed: ${validation.errors.join(', ')}`);
  }

  // Retry logic for handling unique constraint violations (reference collisions)
  const MAX_RETRIES = 5;
  let retries = 0;
  let property: any = null;

  while (retries < MAX_RETRIES && !property) {
    try {
      // Generate unique reference
      const internalReference = await generatePropertyReference(tenantId, finalOwnerUserId);

      // Create property — et, dans la meme transaction, son entree au registre
      // des lots de l'abonnement (D1 ; QuotaExceededError en BLOCK annule tout).
      property = await prisma.$transaction(async tx => {
        const created = await tx.property.create({
          data: {
            internalReference,
            propertyType: data.propertyType,
            ownershipType: data.ownershipType,
            tenantId: data.ownershipType === PropertyOwnershipType.TENANT ? tenantId : null,
            ownerUserId: finalOwnerUserId, // Can be set even for TENANT type if owner is selected in form
            containerParentId: data.containerParentId || null, // For sub-properties (apartments in buildings)
            title: data.title,
            // Colonnes NOT NULL sans defaut, mais facultatives dans le
            // formulaire : « Terminer » omet l'adresse laissee vide. Sans ce
            // repli, Prisma levait « Argument `address` is missing » -> 500.
            description: data.description ?? '',
            address: data.address ?? '',
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
            status: data.status || PropertyStatus.AVAILABLE,
            availability: data.availability || 'AVAILABLE',
            // Prisma type ce champ en InputJsonValue, plus etroit que le
            // Record<string, any> | null du contrat d entree. Aucune conversion
            // a l execution : la valeur part telle quelle.
            typeSpecificData: (data.typeSpecificData || null) as any
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
        if (tenantId) {
          await syncLotActivationsTx(
            tx,
            tenantId,
            { propertyIds: [created.id, created.containerParentId] },
            { actorUserId }
          );
        }
        return created;
      });
    } catch (error: any) {
      // Check if it's a unique constraint violation on internal_reference
      if (error.code === 'P2002' && error.meta?.target?.includes('internal_reference')) {
        retries++;
        if (retries < MAX_RETRIES) {
          // Wait a bit before retrying (exponential backoff)
          const delay = Math.min(50 * Math.pow(2, retries - 1), 200);
          await new Promise(resolve => setTimeout(resolve, delay));
          logger.warn('Property reference collision, retrying', { retries, title: data.title });
          continue;
        } else {
          logger.error('Failed to create property after max retries due to reference collision', {
            retries,
            title: data.title,
            tenantId,
            ownerUserId: finalOwnerUserId
          });
          throw new BadRequestError(
            'Failed to generate unique property reference after multiple attempts. Please try again.'
          );
        }
      } else {
        // Re-throw if it's not a reference collision error
        throw error;
      }
    }
  }

  if (!property) {
    throw new BadRequestError('Failed to create property after multiple attempts');
  }

  logger.info('[PROPERTY_CREATE] Propriété créée', {
    propertyId: property.id,
    internalReference: property.internalReference,
    title: property.title,
    tenantId: property.tenantId,
    ownerUserId: property.ownerUserId,
    ownerEmail: property.owner?.email ?? '(aucun)'
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

  // Calculate quality score (async, don't wait). Only for tenant-scoped
  // creations: calculateAndStoreQualityScore requires a tenantId to re-check
  // ownership itself (defense in depth).
  if (tenantId) {
    const { calculateAndStoreQualityScore } = await import('./property-quality-service');
    calculateAndStoreQualityScore(property.id, tenantId).catch(error => {
      logger.warn('Failed to calculate quality score', { propertyId: property.id, error });
    });
  }

  return property as PropertyDetail;
}

/**
 * Whether the caller may see a property, whatever its ownership type.
 *
 * The agency acting (`tenantId`) must own the property or hold an active
 * mandate on it. Only a PUBLIC listing can be reached outside any agency: by
 * its owner, or by anyone once published. Before this check, a CLIENT property
 * was returned to any agency that knew its id.
 */
function canAccessProperty(
  property: {
    ownershipType: PropertyOwnershipType;
    tenantId: string | null;
    ownerUserId: string | null;
    isPublished: boolean;
  },
  tenantId: string | null | undefined,
  userId: string | null | undefined,
  activeMandateTenantIds: string[]
): boolean {
  if (tenantId) {
    return property.tenantId === tenantId || activeMandateTenantIds.includes(tenantId);
  }

  if (property.ownershipType === PropertyOwnershipType.PUBLIC) {
    return Boolean(userId && property.ownerUserId === userId) || property.isPublished;
  }

  return Boolean(userId && property.ownerUserId === userId);
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
      // Jamais `filePath` (chemin disque) dans le detail du bien : select
      // explicite, meme ensemble que `property-document-service.ts`.
      documents: { select: PROPERTY_DOCUMENT_SELECT },
      statusHistory: {
        orderBy: {
          createdAt: 'desc'
        },
        take: 10
      },
      mandates: {
        where: { isActive: true },
        select: { tenantId: true }
      },
      containerParent: true,
      containerChildren: {
        include: {
          media: {
            orderBy: {
              displayOrder: 'asc'
            },
            take: 1
          }
        },
        orderBy: {
          title: 'asc'
        }
      }
    }
  });

  if (!property) {
    return null;
  }

  const activeMandateTenantIds = property.mandates.map(mandate => mandate.tenantId);

  if (!canAccessProperty(property, tenantId, userId, activeMandateTenantIds)) {
    logger.warn('Property access denied', {
      propertyId,
      ownershipType: property.ownershipType,
      propertyTenantId: property.tenantId,
      requestedTenantId: tenantId
    });
    return null;
  }

  // Les mandats ne servaient qu'au controle d'acces : ils ne sortent pas.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { mandates: _mandates, ...detail } = property;
  return detail as PropertyDetail;
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
  // Meme validation qu'a la creation (voir lib/properties/schemas.ts) : un
  // champ mal type levait une `PrismaClientValidationError` (500) au
  // `tx.property.update()` plus bas, au lieu d'un 400 clair.
  updatePropertySchema.parse(data);

  // Get existing property
  const existing = await getPropertyById(propertyId, tenantId, userId);
  if (!existing) {
    throw new NotFoundError('Property not found or access denied');
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
      throw new BadRequestError(`Property validation failed: ${validation.errors.join(', ')}`);
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
  if (data.status !== undefined) {
    // Only validate and record history if status is actually changing
    if (data.status !== existing.status) {
      // Validate status transition before updating
      const { validateStatusTransition } = await import('./property-status-service');
      const validation = validateStatusTransition(
        existing.status,
        data.status,
        existing.ownershipType,
        true // Assume permission is checked at route level
      );

      if (!validation.valid) {
        throw new BadRequestError(validation.error || 'Invalid status transition');
      }

      // Record status history before updating
      const { recordStatusHistory } = await import('./property-status-service');
      await recordStatusHistory(
        propertyId,
        existing.status,
        data.status,
        actorUserId || userId || '',
        'Status updated via property edit',
        existing.tenantId
      );
    }
    // Include status in update (even if unchanged, to ensure it's set correctly)
    updateData.status = data.status;
  }
  if (data.typeSpecificData !== undefined) updateData.typeSpecificData = data.typeSpecificData;

  updateData.version = { increment: 1 };

  // Update property with optimistic locking ; statut ou modes changent le
  // decompte des lots de l'abonnement (D1), recalcule dans la meme transaction.
  const lotTenantId = tenantId || existing.tenantId || null;
  const updated = await prisma.$transaction(async tx => {
    const row = await tx.property.update({
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
    if (lotTenantId && (data.status !== undefined || data.transactionModes !== undefined)) {
      await syncLotActivationsTx(
        tx,
        lotTenantId,
        { propertyIds: [row.id] },
        {
          actorUserId: actorUserId ?? userId ?? null,
          reason: `PROPERTY_${row.status}`
        }
      );
    }
    return row;
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

  // Calculate quality score (async, don't wait). Only when a tenant is known
  // (the acting agency, or else the property's own owning tenant):
  // calculateAndStoreQualityScore requires a tenantId to re-check ownership
  // itself (defense in depth).
  const qualityScoreTenantId = tenantId || updated.tenantId || null;
  if (qualityScoreTenantId) {
    const { calculateAndStoreQualityScore } = await import('./property-quality-service');
    calculateAndStoreQualityScore(updated.id, qualityScoreTenantId).catch(error => {
      logger.warn('Failed to calculate quality score', { propertyId: updated.id, error });
    });
  }

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
    /** Recherche libre : titre, adresse, reference interne. */
    q?: string;
    /** Commune ou zone : adresse ou zone de localisation. */
    city?: string;
    minPrice?: number;
    maxPrice?: number;
    minSurface?: number;
    maxSurface?: number;
    minRooms?: number;
    maxRooms?: number;
    minBedrooms?: number;
    maxBedrooms?: number;
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

  // Status filter - exclude archived by default (unless explicitly requested)
  if (filters?.status) {
    where.status = filters.status;
  } else {
    // Exclude archived properties from default listing
    where.status = {
      not: PropertyStatus.ARCHIVED
    };
  }

  if (filters?.propertyType) {
    where.propertyType = filters.propertyType;
  }

  if (filters?.ownershipType) {
    where.ownershipType = filters.ownershipType;
  }

  if (filters?.transactionMode) {
    where.transactionModes = {
      has: filters.transactionMode
    };
  }

  // Recherche libre et filtre de commune : chacun porte sur plusieurs colonnes,
  // donc sur un `OR`. Ils vont dans `AND` et non a la racine du `where`, car
  // `where.OR` est deja pris par l'isolation par agence plus haut : deux `OR`
  // frere a frere s'ecraseraient, et le survivant aurait ouvert la liste a
  // TOUTES les agences.
  const and: any[] = [];

  const q = filters?.q?.trim();
  if (q) {
    and.push({
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { address: { contains: q, mode: 'insensitive' } },
        { internalReference: { contains: q, mode: 'insensitive' } }
      ]
    });
  }

  const city = filters?.city?.trim();
  if (city) {
    and.push({
      OR: [
        { address: { contains: city, mode: 'insensitive' } },
        { locationZone: { contains: city, mode: 'insensitive' } }
      ]
    });
  }

  if (and.length > 0) {
    where.AND = and;
  }

  // Bornes numeriques. Une borne absente laisse l'intervalle ouvert de ce
  // cote : un minimum seul ou un maximum seul est licite.
  const range = (min?: number, max?: number): { gte?: number; lte?: number } | undefined => {
    const bounds: { gte?: number; lte?: number } = {};
    if (typeof min === 'number' && Number.isFinite(min)) bounds.gte = min;
    if (typeof max === 'number' && Number.isFinite(max)) bounds.lte = max;
    return Object.keys(bounds).length > 0 ? bounds : undefined;
  };

  const priceRange = range(filters?.minPrice, filters?.maxPrice);
  if (priceRange) where.price = priceRange;

  const surfaceRange = range(filters?.minSurface, filters?.maxSurface);
  if (surfaceRange) where.surfaceArea = surfaceRange;

  const roomsRange = range(filters?.minRooms, filters?.maxRooms);
  if (roomsRange) where.rooms = roomsRange;

  const bedroomsRange = range(filters?.minBedrooms, filters?.maxBedrooms);
  if (bedroomsRange) where.bedrooms = bedroomsRange;

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
      },
      containerParent: {
        select: {
          id: true,
          internalReference: true,
          title: true,
          rooms: true,
          propertyType: true
        }
      },
      containerChildren: {
        select: {
          status: true
        }
      },
      _count: {
        select: {
          containerChildren: true
        }
      },
      rentalLeases: {
        where: { status: RentalLeaseStatus.ACTIVE },
        select: { id: true },
        take: 1
      }
    }
  });

  // Derive effective status: si bail actif, Loué ou Vendu selon le statut déjà en base
  // (le statut est mis à jour correctement à la création du bail : SOLD pour Vente, RENTED pour Location)
  const propertiesWithLeaseStatus = (properties as any[]).map(p => {
    const hasActiveLease = (p.rentalLeases?.length ?? 0) > 0;
    let effectiveStatus = p.status;
    if (hasActiveLease && effectiveStatus !== PropertyStatus.SOLD) {
      effectiveStatus = PropertyStatus.RENTED;
    }
    const { rentalLeases: removedRentalLeases, ...rest } = p;
    void removedRentalLeases;
    return { ...rest, status: effectiveStatus };
  });

  // For IMMEUBLE properties, compute rented and available apartment counts
  const propertiesWithCounts = (propertiesWithLeaseStatus as any[]).map(p => {
    if (p.propertyType !== PropertyType.IMMEUBLE) {
      const { containerChildren: removedContainerChildren, ...rest } = p;
      void removedContainerChildren;
      return rest;
    }
    const total = p._count?.containerChildren ?? 0;
    const rented = (p.containerChildren || []).filter(
      (c: { status: string }) => c.status === PropertyStatus.RENTED
    ).length;
    const available = Math.max(0, total - rented);
    const { containerChildren: removedContainerChildren, ...rest } = p;
    void removedContainerChildren;
    return {
      ...rest,
      containerChildrenRentedCount: rented,
      containerChildrenAvailableCount: available
    };
  });

  // Vignette de chaque bien (REFONTE_UI_UX.md §8.4).
  //
  // Le front lancait une requete `/media` PAR carte affichee, soit jusqu'a 20
  // requetes pour une page de liste. Une seule requete groupee les remplace :
  // le cout ne depend plus du nombre de biens affiches.
  //
  // L'`include.media` ci-dessus n'est volontairement pas reutilise : il filtre
  // sur `isPrimary` sans regarder le type de media, donc il rendrait un plan ou
  // une video marquee primaire comme s'il s'agissait de la photo. Il reste en
  // l'etat — c'est un contrat existant — et `thumbnailUrl` s'y ajoute.
  const thumbnailByPropertyId = new Map<string, string>();
  const propertyIds = propertiesWithCounts.map(p => p.id);
  if (propertyIds.length > 0) {
    const photos = await prisma.propertyMedia.findMany({
      where: {
        propertyId: { in: propertyIds },
        mediaType: PropertyMediaType.PHOTO
      },
      // La photo primaire d'abord ; a defaut, la premiere dans l'ordre
      // d'affichage. C'est exactement la regle que le front appliquait.
      orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }],
      select: { propertyId: true, fileUrl: true, filePath: true }
    });
    for (const photo of photos) {
      if (thumbnailByPropertyId.has(photo.propertyId)) continue;
      const url = photo.fileUrl || photo.filePath;
      if (url) thumbnailByPropertyId.set(photo.propertyId, url);
    }
  }

  const propertiesWithThumbnail = propertiesWithCounts.map(p => ({
    ...p,
    thumbnailUrl: thumbnailByPropertyId.get(p.id) ?? null
  }));

  return {
    properties: propertiesWithThumbnail as PropertyDetail[],
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
 * Delete property (hard delete - completely removes from database)
 * @param propertyId - Property ID
 * @param tenantId - Tenant ID (for validation)
 * @param userId - User ID (for ownership validation)
 * @param actorUserId - User deleting the property (for audit)
 */
export async function deleteProperty(
  propertyId: string,
  tenantId?: string | null,
  userId?: string | null,
  actorUserId?: string
): Promise<void> {
  // Get property with validation
  const property = await getPropertyById(propertyId, tenantId, userId);
  if (!property) {
    throw new NotFoundError('Property not found or access denied');
  }

  // Check if property has active deals (through CrmDealProperty)
  // This is a simplified check - in production, you might want more thorough validation
  const { CrmDealStage } = await import('@prisma/client');
  const hasActiveDeals = await prisma.crmDealProperty.count({
    where: {
      propertyId,
      deal: {
        stage: {
          not: CrmDealStage.LOST
        }
      }
    }
  });

  if (hasActiveDeals > 0) {
    throw new ConflictError('Cannot delete property - has active deals');
  }

  // Log before deletion for audit
  logger.info('Property being deleted (hard delete)', {
    propertyId,
    internalReference: property.internalReference,
    tenantId: property.tenantId
  });

  // Audit log before deletion
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId: property.tenantId || null,
      actionKey: AuditActionKey.PROPERTY_DELETED,
      entityType: PROPERTY_ENTITY_TYPES.PROPERTY,
      entityId: propertyId,
      payload: {
        internalReference: property.internalReference,
        title: property.title
      }
    });
  }

  // Hard delete - Prisma will cascade delete related records (media, documents, etc.)
  // based on the schema's onDelete: Cascade relationships. Le lot compte dans
  // l'abonnement est ferme dans la meme transaction (l'historique du registre
  // survit : pas de cle etrangere).
  const lotTenantId = tenantId || property.tenantId || null;
  await prisma.$transaction(async tx => {
    const related = lotTenantId
      ? await tx.property.findUnique({
          where: { id: propertyId },
          select: {
            containerParentId: true,
            syndicateLots: { select: { id: true } },
            siteLot: { select: { id: true } }
          }
        })
      : null;
    await tx.property.delete({
      where: { id: propertyId }
    });
    if (lotTenantId) {
      await syncLotActivationsTx(
        tx,
        lotTenantId,
        {
          propertyIds: [propertyId, related?.containerParentId],
          syndicateLotIds: related?.syndicateLots.map(l => l.id) ?? [],
          siteLotIds: related?.siteLot ? [related.siteLot.id] : []
        },
        { actorUserId, reason: 'PROPERTY_DELETED' }
      );
    }
  });

  logger.info('Property deleted successfully', {
    propertyId,
    internalReference: property.internalReference
  });
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

  // Exclude archived properties by default (unless explicitly requested)
  if (filters?.status) {
    where.status = filters.status;
  } else {
    // Exclude archived properties from default listing
    where.status = {
      not: PropertyStatus.ARCHIVED
    };
  }

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

/**
 * Get child properties (sub-properties) of a container property
 * @param parentPropertyId - Parent property ID
 * @param tenantId - Tenant ID (for validation)
 * @returns List of child properties
 */
export async function getChildProperties(
  parentPropertyId: string,
  tenantId?: string | null
): Promise<PropertyDetail[]> {
  // Verify parent property exists and is accessible
  const parent = await getPropertyById(parentPropertyId, tenantId);
  if (!parent) {
    throw new NotFoundError('Parent property not found or access denied');
  }

  // If parent is not a container type (IMMEUBLE), return empty array
  // This allows the frontend to handle non-building properties gracefully
  if (parent.propertyType !== PropertyType.IMMEUBLE) {
    logger.debug('Parent property is not IMMEUBLE type, returning empty children list', {
      parentPropertyId,
      propertyType: parent.propertyType
    });
    return [];
  }

  const children = await prisma.property.findMany({
    where: {
      containerParentId: parentPropertyId
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
        orderBy: {
          displayOrder: 'asc'
        },
        take: 1 // Just get primary image
      }
    },
    orderBy: {
      title: 'asc'
    }
  });

  return children as PropertyDetail[];
}
