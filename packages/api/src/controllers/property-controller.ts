import { Request, Response } from 'express';
import {
  createProperty,
  getPropertyById,
  updateProperty,
  listProperties,
  publishPropertyWrapper,
  unpublishPropertyWrapper,
  deleteProperty,
  getChildProperties
} from '../services/property-service';
import { getLatestQualityScore, calculateQualityScore } from '../services/property-quality-service';
import { getTemplateByType, getAllTemplates } from '../services/property-template-service';
import { getTenantIdFromRequest } from '../middleware/tenant-isolation-middleware';
import { CreatePropertyRequest, UpdatePropertyRequest } from '../types/property-types';
import { PropertyType } from '@prisma/client';
import { asyncHandler, BadRequestError, NotFoundError } from '../middleware/error-middleware';
import { t } from '../i18n';
import { parsePagination } from '../utils/pagination-helper';

/**
 * Create property handler
 */
export const createPropertyHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId || getTenantIdFromRequest(req);
  const userId = req.user?.userId;
  const actorUserId = userId;

  const data: CreatePropertyRequest = {
    propertyType: req.body.propertyType,
    ownershipType: req.body.ownershipType,
    ownerUserId: req.body.ownerUserId ?? (req.body.ownerEmail ? undefined : userId),
    ownerEmail: req.body.ownerEmail,
    title: req.body.title,
    description: req.body.description,
    address: req.body.address,
    locationZone: req.body.locationZone,
    latitude: req.body.latitude,
    longitude: req.body.longitude,
    transactionModes: req.body.transactionModes,
    price: req.body.price,
    fees: req.body.fees,
    currency: req.body.currency || 'EUR',
    surfaceArea: req.body.surfaceArea,
    surfaceUseful: req.body.surfaceUseful,
    surfaceTerrain: req.body.surfaceTerrain,
    rooms: req.body.rooms,
    bedrooms: req.body.bedrooms,
    bathrooms: req.body.bathrooms,
    furnishingStatus: req.body.furnishingStatus,
    availability: req.body.availability,
    status: req.body.status,
    typeSpecificData: req.body.typeSpecificData,
    containerParentId: req.body.containerParentId
  };

  const property = await createProperty(
    tenantId,
    data.ownerUserId ?? (data.ownerEmail ? null : (userId ?? null)),
    data,
    actorUserId
  );

  res.status(201).json({
    success: true,
    data: property
  });
});

/**
 * Get property handler
 */
export const getPropertyHandler = asyncHandler(async (req: Request, res: Response) => {
  const propertyId = req.params.id;
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  const userId = req.user?.userId;

  const property = await getPropertyById(propertyId, tenantId, userId);

  if (!property) {
    throw new NotFoundError(t('Bien introuvable'));
  }

  res.json({
    success: true,
    data: property
  });
});

/**
 * Update property handler
 */
export const updatePropertyHandler = asyncHandler(async (req: Request, res: Response) => {
  const propertyId = req.params.id;
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  const userId = req.user?.userId;
  const actorUserId = userId;

  const data: UpdatePropertyRequest = {
    ownershipType: req.body.ownershipType,
    ownerUserId: req.body.ownerUserId,
    ownerEmail: req.body.ownerEmail,
    title: req.body.title,
    description: req.body.description,
    address: req.body.address,
    locationZone: req.body.locationZone,
    latitude: req.body.latitude,
    longitude: req.body.longitude,
    transactionModes: req.body.transactionModes,
    price: req.body.price,
    fees: req.body.fees,
    currency: req.body.currency,
    surfaceArea: req.body.surfaceArea,
    surfaceUseful: req.body.surfaceUseful,
    surfaceTerrain: req.body.surfaceTerrain,
    rooms: req.body.rooms,
    bedrooms: req.body.bedrooms,
    bathrooms: req.body.bathrooms,
    furnishingStatus: req.body.furnishingStatus,
    availability: req.body.availability,
    status: req.body.status,
    typeSpecificData: req.body.typeSpecificData
  };

  const property = await updateProperty(propertyId, data, tenantId, userId, actorUserId);

  res.json({
    success: true,
    data: property
  });
});

/**
 * List properties handler
 */
export const listPropertiesHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  const userId = req.user?.userId;

  // Un nombre absent ou illisible vaut « pas de borne » et non zero :
  // `?minPrice=` ne doit pas se comporter comme `?minPrice=0`.
  const num = (value: unknown): number | undefined => {
    if (typeof value !== 'string' || value.trim() === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const filters = {
    propertyType: req.query.propertyType as PropertyType | undefined,
    ownershipType: req.query.ownershipType as any,
    status: req.query.status as any,
    transactionMode: req.query.transactionMode as any,
    // Filtres deplaces du navigateur vers le serveur (§8.4) : ils etaient
    // appliques sur la page deja recue, donc sur 20 biens et non sur le
    // portefeuille, et le compteur affiche mentait.
    q: typeof req.query.q === 'string' ? req.query.q : undefined,
    city: typeof req.query.city === 'string' ? req.query.city : undefined,
    minPrice: num(req.query.minPrice),
    maxPrice: num(req.query.maxPrice),
    minSurface: num(req.query.minSurface),
    maxSurface: num(req.query.maxSurface),
    minRooms: num(req.query.minRooms),
    maxRooms: num(req.query.maxRooms),
    minBedrooms: num(req.query.minBedrooms),
    maxBedrooms: num(req.query.maxBedrooms),
    ...parsePagination(req.query, { defaultPage: 1, defaultLimit: 20 })
  };

  const result = await listProperties(tenantId, userId, filters);

  res.json({
    success: true,
    data: result.properties,
    pagination: {
      page: filters.page || 1,
      limit: filters.limit || 20,
      total: result.total,
      totalPages: Math.ceil(result.total / (filters.limit || 20))
    }
  });
});

/**
 * Get property template handler
 */
export const getTemplateHandler = asyncHandler(async (req: Request, res: Response) => {
  const propertyType = req.params.type as PropertyType;
  const template = await getTemplateByType(propertyType);

  if (!template) {
    throw new NotFoundError(t('Aucun modèle trouvé pour le type de bien : {{type}}', { type: propertyType }));
  }

  res.json({
    success: true,
    data: template
  });
});

/**
 * List all templates handler
 */
export const listTemplatesHandler = asyncHandler(async (_req: Request, res: Response) => {
  const templates = await getAllTemplates();

  res.json({
    success: true,
    data: templates
  });
});

/**
 * Publish property handler
 */
export const publishPropertyHandler = asyncHandler(async (req: Request, res: Response) => {
  const propertyId = req.params.id;
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  const userId = req.user?.userId;
  const actorUserId = userId;

  const property = await publishPropertyWrapper(propertyId, tenantId, userId, actorUserId);

  res.json({
    success: true,
    data: property,
    message: 'Property published successfully'
  });
});

/**
 * Unpublish property handler
 */
export const unpublishPropertyHandler = asyncHandler(async (req: Request, res: Response) => {
  const propertyId = req.params.id;
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  const userId = req.user?.userId;
  const actorUserId = userId;

  const property = await unpublishPropertyWrapper(propertyId, tenantId, userId, actorUserId);

  res.json({
    success: true,
    data: property,
    message: 'Property unpublished successfully'
  });
});

/**
 * Delete property handler
 */
export const deletePropertyHandler = asyncHandler(async (req: Request, res: Response) => {
  const propertyId = req.params.id;
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  const userId = req.user?.userId;
  const actorUserId = userId;

  await deleteProperty(propertyId, tenantId, userId, actorUserId);

  res.status(204).send();
});

/**
 * Get quality score handler
 */
export const getQualityScoreHandler = asyncHandler(async (req: Request, res: Response) => {
  const propertyId = req.params.id;
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;
  const userId = req.user?.userId;

  if (!tenantId) {
    throw new BadRequestError('Contexte tenant requis');
  }

  // Verify property access
  const property = await getPropertyById(propertyId, tenantId, userId);
  if (!property) {
    throw new NotFoundError(t('Bien introuvable ou accès refusé'));
  }

  // Get latest score or calculate new one
  const recalculate = req.query.recalculate === 'true';
  let qualityScore;

  if (recalculate) {
    qualityScore = await calculateQualityScore(propertyId, tenantId);
  } else {
    const latest = await getLatestQualityScore(propertyId, tenantId);
    if (latest) {
      qualityScore = {
        score: latest.score,
        suggestions: latest.suggestions as string[],
        breakdown: {
          requiredFields: 0,
          media: 0,
          geolocation: 0,
          description: 0
        }
      };
    } else {
      // Calculate if no score exists
      qualityScore = await calculateQualityScore(propertyId, tenantId);
    }
  }

  res.json({
    success: true,
    data: qualityScore
  });
});

/**
 * Create sub-property (apartment) handler
 */
export const createSubPropertyHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = req.params.tenantId || getTenantIdFromRequest(req);
  const parentPropertyId = req.params.id;
  const userId = req.user?.userId;
  const actorUserId = userId;

  // Verify parent property exists and is IMMEUBLE
  const parent = await getPropertyById(parentPropertyId, tenantId, userId);
  if (!parent) {
    throw new NotFoundError(t('Bien parent introuvable ou accès refusé'));
  }

  if (parent.propertyType !== PropertyType.IMMEUBLE) {
    throw new BadRequestError(t('Le bien parent doit être de type IMMEUBLE'));
  }

  // Inherit location from parent (Pays, Région, Commune) so apartments have same location as building
  const parentLocation =
    (parent as any).typeSpecificData && typeof (parent as any).typeSpecificData === 'object'
      ? (parent as any).typeSpecificData
      : {};
  const locationKeys = ['country', 'countryId', 'region', 'regionId', 'commune', 'communeId'];
  const inheritedLocation: Record<string, any> = {};
  locationKeys.forEach(key => {
    if (parentLocation[key] !== undefined && parentLocation[key] !== null) {
      inheritedLocation[key] = parentLocation[key];
    }
  });
  const mergedTypeSpecificData = {
    ...inheritedLocation,
    ...(req.body.typeSpecificData && typeof req.body.typeSpecificData === 'object' ? req.body.typeSpecificData : {})
  };

  const data: CreatePropertyRequest = {
    propertyType: req.body.propertyType || PropertyType.APPARTEMENT,
    ownershipType: req.body.ownershipType || parent.ownershipType,
    ownerUserId: req.body.ownerUserId || parent.ownerUserId || userId,
    ownerEmail: req.body.ownerEmail,
    containerParentId: parentPropertyId, // Link to parent
    title: req.body.title,
    description: req.body.description || '',
    address: req.body.address || parent.address, // Inherit from parent if not provided
    locationZone: req.body.locationZone ?? parent.locationZone ?? undefined,
    latitude: req.body.latitude ?? parent.latitude ?? undefined,
    longitude: req.body.longitude ?? parent.longitude ?? undefined,
    transactionModes: req.body.transactionModes || parent.transactionModes,
    price: req.body.price,
    fees: req.body.fees,
    currency: req.body.currency || parent.currency || 'EUR',
    surfaceArea: req.body.surfaceArea,
    surfaceUseful: req.body.surfaceUseful,
    surfaceTerrain: req.body.surfaceTerrain,
    rooms: req.body.rooms,
    bedrooms: req.body.bedrooms,
    bathrooms: req.body.bathrooms,
    furnishingStatus: req.body.furnishingStatus,
    availability: req.body.availability,
    status: req.body.status,
    typeSpecificData: Object.keys(mergedTypeSpecificData).length > 0 ? mergedTypeSpecificData : undefined
  };

  const property = await createProperty(tenantId, data.ownerUserId || userId || null, data, actorUserId);

  res.status(201).json({
    success: true,
    data: property
  });
});

/**
 * Get child properties handler
 */
export const getChildPropertiesHandler = asyncHandler(async (req: Request, res: Response) => {
  const parentPropertyId = req.params.id;
  const tenantId = req.params.tenantId || req.tenantContext?.tenantId;

  const children = await getChildProperties(parentPropertyId, tenantId);

  res.json({
    success: true,
    data: children
  });
});
