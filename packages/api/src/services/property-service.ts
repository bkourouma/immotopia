import { prisma } from '../utils/database';
import { PROPERTY_MEDIA_SELECT } from '../utils/property-media-select';
import { logger } from '../utils/logger';
import { logAuditEvent, recordAuditEvent } from './audit-service';
import { diffForAudit } from '../lib/audit/changes';
import { PROPERTY_ENTITY_TYPES } from '../types/audit-types';
import { AuditActionKey } from '../types/audit-types';
import { syncLotActivationsTx } from './lot-registry-service';
import { generatePropertyReference } from '../utils/property-reference-generator';
import { validatePropertyData } from './property-template-service';
import { CreatePropertyRequest, UpdatePropertyRequest, PropertyDetail } from '../types/property-types';
import { createPropertySchema, updatePropertySchema } from '../lib/properties/schemas';
import { BadRequestError, NotFoundError, ConflictError } from '../middleware/error-middleware';
import { PROPERTY_DOCUMENT_SELECT } from './property-document-service';
import { assertThirdPartyAllowedForTenant, isThirdPartyOwnershipInput } from './own-assets-barrier-service';
import {
  PropertyType,
  PropertyOwnershipType,
  PropertyStatus,
  PropertyTransactionMode,
  PropertyMediaType,
  RentalLeaseStatus,
  MembershipStatus,
  GlobalRole
} from '@prisma/client';
import { t } from '../i18n';

/**
 * Barriere « detenu en propre » (pack Patrimoine) : vrai quand `ownerUserId`
 * designe quelqu'un d'autre que l'acteur ET que cette personne n'est pas
 * membre ACTIF de l'agence — un simple collaborateur designe responsable
 * d'un bien TENANT n'est jamais un proprietaire tiers. Lecture seule, avant
 * toute ecriture.
 */
async function isThirdPartyOwnerUserId(
  tenantId: string,
  ownerUserId: string | null | undefined,
  actorUserId: string | null | undefined
): Promise<boolean> {
  if (!ownerUserId || ownerUserId === actorUserId) return false;
  const activeMember = await prisma.membership.findFirst({
    where: { tenantId, userId: ownerUserId, status: MembershipStatus.ACTIVE },
    select: { id: true }
  });
  return !activeMember;
}

/**
 * Nom d'un contact CRM tel qu'il s'affiche : raison sociale pour une
 * entreprise, sinon « prénom nom ».
 */
function nomContactCrm(contact: {
  contactType: string | null;
  legalName: string | null;
  firstName: string;
  lastName: string;
}): string | null {
  const personne = `${contact.firstName} ${contact.lastName}`.trim();
  const legal = contact.legalName?.trim() || '';
  const nom = contact.contactType === 'COMPANY' ? legal || personne : personne || legal;
  return nom || null;
}

/**
 * Complète `owner.fullName` quand le compte du propriétaire n'en a pas.
 *
 * Le compte est créé à partir de l'e-mail du contact choisi (`ownerEmail`),
 * sans nom : la fiche affichait l'e-mail. Le nom vient du contact CRM de CETTE
 * agence portant cet e-mail (lecture seule, filtrée par `tenantId`). Un compte
 * qui a déjà un nom n'est jamais modifié.
 */
async function completerNomsProprietaires(
  tenantId: string | null | undefined,
  biens: Array<{ owner?: { email: string; fullName: string | null } | null }>
): Promise<void> {
  if (!tenantId) return;
  const sansNom = biens
    .map(bien => bien.owner)
    .filter((owner): owner is { email: string; fullName: string | null } => Boolean(owner && !owner.fullName));
  if (sansNom.length === 0) return;
  const contacts = await prisma.crmContact.findMany({
    where: { tenantId, email: { in: [...new Set(sansNom.map(owner => owner.email))], mode: 'insensitive' } },
    select: { email: true, contactType: true, legalName: true, firstName: true, lastName: true }
  });
  const parEmail = new Map(contacts.map(contact => [contact.email.toLowerCase(), nomContactCrm(contact)]));
  for (const owner of sansNom) {
    const nom = parEmail.get(owner.email.toLowerCase());
    if (nom) owner.fullName = nom;
  }
}

/**
 * Compte du propriétaire désigné par l'e-mail d'un contact : trouvé, ou créé
 * (nommé d'après le contact CRM de l'agence portant cet e-mail, pour que la
 * fiche affiche un nom).
 *
 * Étanchéité entre agences : un compte existant de la plateforme n'est
 * rattaché à l'agence que s'il a déjà un `TenantClient` ou un contact CRM
 * portant cet e-mail DANS CETTE agence. Sinon l'id est renvoyé (l'e-mail est
 * celui que l'appelant a saisi) mais `nomVisible` vaut faux : l'appelant doit
 * masquer `fullName`, qui appartient à une autre agence.
 */
async function resoudreProprietaireParEmail(
  tenantId: string | null,
  emailSaisi: string
): Promise<{ id: string; nomVisible: boolean }> {
  const email = emailSaisi.trim().toLowerCase();
  const existant = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existant) {
    if (!tenantId) return { id: existant.id, nomVisible: false };
    const [client, contact] = await Promise.all([
      prisma.tenantClient.findFirst({ where: { tenantId, userId: existant.id }, select: { id: true } }),
      prisma.crmContact.findFirst({
        where: { tenantId, email: { equals: email, mode: 'insensitive' } },
        select: { id: true }
      })
    ]);
    return { id: existant.id, nomVisible: Boolean(client || contact) };
  }
  const contactProprietaire = tenantId
    ? await prisma.crmContact.findFirst({
        where: { tenantId, email: { equals: email, mode: 'insensitive' } },
        select: { contactType: true, legalName: true, firstName: true, lastName: true }
      })
    : null;
  const user = await prisma.user.create({
    data: {
      email,
      fullName: contactProprietaire ? nomContactCrm(contactProprietaire) : null,
      globalRole: GlobalRole.USER,
      emailVerified: false,
      isActive: true
    }
  });
  logger.info('Created user from contact email', { userId: user.id, email });
  return { id: user.id, nomVisible: true };
}

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
    throw new BadRequestError(t("L'agence est requise pour un bien appartenant à une agence"));
  }

  // Barriere « detenu en propre » (pack Patrimoine) : AVANT toute ecriture,
  // y compris la creation d'un User depuis `ownerEmail` juste en dessous.
  // Seule une agence (tenantId) est concernee (creation directe pour un
  // proprietaire prive, sans agence, n'est jamais soumise au pack Patrimoine).
  if (tenantId && isThirdPartyOwnershipInput({ ownershipType: data.ownershipType, ownerEmail: data.ownerEmail })) {
    await assertThirdPartyAllowedForTenant(tenantId, 'THIRD_PARTY_OWNER');
  }

  // If ownerEmail is provided, find or create the User
  // Priority: data.ownerUserId > data.ownerEmail > ownerUserId parameter
  let finalOwnerUserId = data.ownerUserId || ownerUserId;
  let masquerNomProprietaire = false;
  if (data.ownerEmail && !finalOwnerUserId) {
    const resolu = await resoudreProprietaireParEmail(tenantId, data.ownerEmail);
    finalOwnerUserId = resolu.id;
    masquerNomProprietaire = !resolu.nomVisible;
  }

  if (data.ownershipType === PropertyOwnershipType.PUBLIC && !finalOwnerUserId) {
    throw new BadRequestError(t('Le propriétaire (identifiant ou e-mail) est requis pour un bien public'));
  }

  // Barriere « detenu en propre » (suite) : `ownerUserId` fourni, different
  // de l'acteur, et pas membre ACTIF de l'agence -> proprietaire tiers.
  // Toujours avant l'ecriture du bien.
  if (tenantId && (await isThirdPartyOwnerUserId(tenantId, finalOwnerUserId, actorUserId))) {
    await assertThirdPartyAllowedForTenant(tenantId, 'THIRD_PARTY_OWNER');
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
    throw new BadRequestError(
      t('Validation du bien impossible : {{errors}}', { errors: validation.errors.join(', ') })
    );
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
            // TENANT et CLIENT portent l'agence qui les a saisis : sans elle, un bien
            // CLIENT créé depuis l'assistant serait introuvable (fiche, médias,
            // documents) tant qu'aucun mandat n'existe. Seul PUBLIC reste sans agence.
            tenantId: data.ownershipType === PropertyOwnershipType.PUBLIC ? null : tenantId,
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
            t('Impossible de générer une référence de bien unique après plusieurs essais. Réessayez.')
          );
        }
      } else {
        // Re-throw if it's not a reference collision error
        throw error;
      }
    }
  }

  if (!property) {
    throw new BadRequestError(t('Impossible de créer le bien après plusieurs essais'));
  }

  // Compte d'une autre agence adopté par e-mail : son nom ne sort pas.
  if (masquerNomProprietaire && property.owner) property.owner = { ...property.owner, fullName: null };

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

  await completerNomsProprietaires(tenantId, [property]);

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
        select: PROPERTY_MEDIA_SELECT,
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
            select: PROPERTY_MEDIA_SELECT,
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
  await completerNomsProprietaires(tenantId, [detail]);
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

  // « Confier ce bien à un propriétaire » : l'e-mail du contact choisi désigne
  // (ou crée) le compte propriétaire, comme à la création.
  // Get existing property
  const existing = await getPropertyById(propertyId, tenantId, userId);
  if (!existing) {
    throw new NotFoundError(t('Bien introuvable ou accès refusé'));
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
      throw new BadRequestError(
        t('Validation du bien impossible : {{errors}}', { errors: validation.errors.join(', ') })
      );
    }
  }

  // Barriere « detenu en propre » (pack Patrimoine) : AVANT toute ecriture.
  // Seule une agence (tenantId, l'acteur courant) est concernee — une
  // modification hors contexte d'agence (portail proprietaire...) n'y est
  // jamais soumise.
  if (tenantId) {
    const thirdPartyByOwnershipType = isThirdPartyOwnershipInput({
      ownershipType: data.ownershipType,
      ownerEmail: data.ownerEmail
    });
    const thirdPartyByOwnerUserId =
      data.ownerUserId !== undefined && (await isThirdPartyOwnerUserId(tenantId, data.ownerUserId, actorUserId));
    if (thirdPartyByOwnershipType || thirdPartyByOwnerUserId) {
      await assertThirdPartyAllowedForTenant(tenantId, 'THIRD_PARTY_OWNER');
    }
  }

  // « Confier ce bien à un propriétaire » : l'e-mail du contact choisi désigne
  // (ou crée) le compte propriétaire, comme à la création. Résolu seulement
  // après l'accès au bien et la barrière « détenu en propre » : un bien
  // introuvable ou refusé ne crée aucun compte.
  let masquerNomProprietaire = false;
  if (data.ownerEmail && !data.ownerUserId) {
    const resolu = await resoudreProprietaireParEmail(tenantId ?? null, data.ownerEmail);
    data = { ...data, ownerUserId: resolu.id };
    masquerNomProprietaire = !resolu.nomVisible;
  }

  // Build update data object, only including fields that are provided
  const updateData: any = {};

  if (data.ownershipType !== undefined) updateData.ownershipType = data.ownershipType;
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
    if (
      lotTenantId &&
      (data.status !== undefined || data.transactionModes !== undefined || data.ownershipType !== undefined)
    ) {
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
      },
      // Avant/après des champs réellement modifiés (`existing` est la ligne lue
      // avant la mise à jour ; `version` n'est qu'un compteur technique).
      changes: diffForAudit(existing as unknown as Record<string, unknown>, updateData as Record<string, unknown>, {
        exclude: ['version']
      })
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

  if (masquerNomProprietaire && updated.owner) updated.owner = { ...updated.owner, fullName: null };

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
    /**
     * Avec un `tenantId` : exclut les biens PUBLIC publies d'autres agences
     * (annonces independantes) et ne garde que les biens de l'agence
     * (propres ou sous mandat). Sans effet sans `tenantId`.
     */
    excludePublicListings?: boolean;
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
  //
  // Chaque branche du OR doit nommer explicitement `tenantId`, sinon
  // l'extension Prisma (`utils/prisma-tenant-guard-extension.ts`) journalise
  // un faux positif : elle ne peut pas voir que la branche est bien bornee a
  // l'agence via une relation imbriquee (`mandates`). PUBLIC est toujours
  // `tenantId: null` (bien independant, jamais rattache a une agence).
  // CLIENT peut porter `tenantId` (mandat) ou `null` (proprietaire seul) :
  // le mandat actif de CETTE agence reste la condition qui filtre reellement.
  if (tenantId) {
    where.OR = [
      { ownershipType: PropertyOwnershipType.TENANT, tenantId },
      ...(filters?.excludePublicListings
        ? []
        : [{ ownershipType: PropertyOwnershipType.PUBLIC, isPublished: true, tenantId: null }]),
      {
        ownershipType: PropertyOwnershipType.CLIENT,
        OR: [{ tenantId }, { tenantId: null }],
        mandates: { some: { tenantId, isActive: true } }
      },
      // Bien de client saisi par l'agence, mandat pas encore créé : il reste
      // dans la liste pour que le mandat puisse être créé depuis sa fiche.
      { ownershipType: PropertyOwnershipType.CLIENT, tenantId, mandates: { none: { tenantId } } }
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
        select: PROPERTY_MEDIA_SELECT,
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
      select: { propertyId: true, fileUrl: true }
    });
    for (const photo of photos) {
      if (thumbnailByPropertyId.has(photo.propertyId)) continue;
      const url = photo.fileUrl;
      if (url) thumbnailByPropertyId.set(photo.propertyId, url);
    }
  }

  const propertiesWithThumbnail = propertiesWithCounts.map(p => ({
    ...p,
    thumbnailUrl: thumbnailByPropertyId.get(p.id) ?? null
  }));

  await completerNomsProprietaires(tenantId, propertiesWithThumbnail as any[]);

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
/**
 * Dépendances qui empêchent de supprimer un bien, une phrase par blocage.
 *
 * Lecture seule, filtrée par bien (déjà résolu pour l'agence par l'appelant).
 * Les baux, tickets, mandats et compromis de vente ne sont pas supprimés en
 * cascade : sans ce contrôle, la clé étrangère levait une erreur interne.
 * Le bien reste archivable dans tous les cas.
 */
export async function listerBlocagesSuppression(
  propertyId: string
): Promise<Array<{ field: string; message: string }>> {
  const blocages: Array<{ field: string; message: string }> = [];
  const ajouter = (field: string, message: string) => blocages.push({ field, message });

  const baux = await prisma.rentalLease.findMany({
    where: { property_id: propertyId },
    select: { id: true, lease_number: true, status: true }
  });
  const enCours = baux.filter(b => b.status !== 'ENDED' && b.status !== 'CANCELED');
  const clos = baux.filter(b => b.status === 'ENDED' || b.status === 'CANCELED');
  if (enCours.length > 0) {
    ajouter(
      'lease',
      t('Ce bien a un bail actif ou à venir ({{count}} : {{references}}) : résiliez-le avant de le supprimer', {
        count: enCours.length,
        references: enCours.map(b => b.lease_number).join(', ')
      })
    );
  }
  if (clos.length > 0) {
    ajouter(
      'leaseHistory',
      t('Ce bien a un historique de baux ({{count}} : {{references}}) qui doit être conservé', {
        count: clos.length,
        references: clos.map(b => b.lease_number).join(', ')
      })
    );
  }
  if (baux.length > 0) {
    const impayees = await prisma.rentalInstallment.count({
      where: { lease_id: { in: baux.map(b => b.id) }, status: { in: ['DUE', 'PARTIAL', 'OVERDUE'] } }
    });
    if (impayees > 0) {
      ajouter('installments', t('Ce bien a {{count}} échéance(s) de loyer impayée(s)', { count: impayees }));
    }
  }

  const mandats = await prisma.propertyMandate.count({ where: { propertyId, isActive: true } });
  if (mandats > 0) {
    ajouter('mandate', t('Ce bien a un mandat de gestion actif : résiliez-le avant de le supprimer'));
  }

  const parts = await prisma.propertyOwnershipShare.count({ where: { propertyId } });
  if (parts > 0) {
    ajouter(
      'ownership',
      t('Ce bien est en indivision ({{count}} propriétaire(s)) : supprimez les parts avant', { count: parts })
    );
  }

  const rattaches = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { syndicateLots: { select: { id: true } }, siteLot: { select: { id: true } } }
  });
  if ((rattaches?.syndicateLots.length ?? 0) > 0 || rattaches?.siteLot) {
    ajouter('lot', t('Ce bien est rattaché à un lot de copropriété ou de site : détachez-le avant de le supprimer'));
  }

  const tickets = await prisma.maintenanceTicket.count({ where: { property_id: propertyId } });
  if (tickets > 0) {
    ajouter('maintenance', t('Ce bien a {{count}} ticket(s) de maintenance', { count: tickets }));
  }

  const ventes =
    (await prisma.saleMandate.count({ where: { propertyId } })) +
    (await prisma.saleAgreement.count({ where: { propertyId } }));
  if (ventes > 0) {
    ajouter('sale', t('Ce bien a des mandats ou compromis de vente ({{count}})', { count: ventes }));
  }

  const visites = await prisma.propertyVisit.count({
    where: { propertyId, status: { in: ['SCHEDULED', 'CONFIRMED'] } }
  });
  if (visites > 0) {
    ajouter('visits', t('Ce bien a {{count}} visite(s) planifiée(s)', { count: visites }));
  }

  const documents = await prisma.propertyDocument.count({ where: { propertyId } });
  if (documents > 0) {
    ajouter('documents', t('Ce bien a {{count}} document(s) : supprimez-les avant', { count: documents }));
  }

  return blocages;
}

export async function deleteProperty(
  propertyId: string,
  tenantId?: string | null,
  userId?: string | null,
  actorUserId?: string
): Promise<void> {
  // Get property with validation
  const property = await getPropertyById(propertyId, tenantId, userId);
  if (!property) {
    throw new NotFoundError(t('Bien introuvable ou accès refusé'));
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
    throw new ConflictError(t('Impossible de supprimer ce bien : il a des affaires actives'));
  }

  const blocages = await listerBlocagesSuppression(propertyId);
  if (blocages.length > 0) {
    throw new ConflictError(
      t('Ce bien ne peut pas être supprimé : {{blocages}}. Archivez-le à la place (statut « Archivé »).', {
        blocages: blocages.map(b => b.message).join(' ; ')
      }),
      blocages
    );
  }

  // Log before deletion for audit
  logger.info('Property being deleted (hard delete)', {
    propertyId,
    internalReference: property.internalReference,
    tenantId: property.tenantId
  });

  // Hard delete - Prisma will cascade delete related records (media, documents, etc.)
  // based on the schema's onDelete: Cascade relationships. Le lot compte dans
  // l'abonnement est ferme dans la meme transaction (l'historique du registre
  // survit : pas de cle etrangere).
  const lotTenantId = tenantId || property.tenantId || null;
  try {
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
      // Critical action: audit trail written in the same transaction as the delete.
      if (actorUserId) {
        await recordAuditEvent(tx, {
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
    });
  } catch (error: any) {
    // Dépendance non prévue ci-dessus : clé étrangère -> même refus métier, jamais un 500.
    if (error?.code === 'P2003') {
      throw new ConflictError(
        t(
          'Ce bien ne peut pas être supprimé : il est référencé par d’autres données. Archivez-le à la place (statut « Archivé »).'
        )
      );
    }
    throw error;
  }

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
        select: PROPERTY_MEDIA_SELECT,
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
    throw new NotFoundError(t('Bien parent introuvable ou accès refusé'));
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
        select: PROPERTY_MEDIA_SELECT,
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
