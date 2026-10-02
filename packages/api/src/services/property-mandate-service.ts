import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { logAuditEvent, recordAuditEvent } from './audit-service';
import { PROPERTY_ENTITY_TYPES } from '../types/audit-types';
import { AuditActionKey } from '../types/audit-types';
import { CreateMandateRequest } from '../types/property-types';
import { Prisma, PropertyOwnershipType } from '@prisma/client';
import { assertThirdPartyAllowedForTenant } from './own-assets-barrier-service';
import { t } from '../i18n';
import { syncLotActivationsTx } from './lot-registry-service';
import { NotFoundError, ConflictError } from '../middleware/error-middleware';

/** Rattachement préalable d'un bien sans agence : propriétaire client de l'agence, ou bail de l'agence. */
async function isAttachedToTenant(tenantId: string, propertyId: string, ownerUserId: string | null): Promise<boolean> {
  if (ownerUserId) {
    const client = await prisma.tenantClient.findFirst({
      where: { tenantId, userId: ownerUserId },
      select: { id: true }
    });
    if (client) return true;
  }
  const bail = await prisma.rentalLease.findFirst({
    where: { tenant_id: tenantId, property_id: propertyId },
    select: { id: true }
  });
  return Boolean(bail);
}

/**
 * Create a management mandate for a property
 * @param tenantId - Tenant ID managing the property
 * @param data - Mandate creation data
 * @param actorUserId - User creating the mandate (for audit)
 * @returns Created mandate
 */
export async function createMandate(tenantId: string, data: CreateMandateRequest, actorUserId?: string) {
  // Barriere « detenu en propre » (pack Patrimoine) : le PREMIER controle, avant
  // toute lecture du bien — un compte detenu en propre recoit 403
  // OWN_ASSETS_ONLY (traduit) quel que soit le bien, jamais un refus tire du
  // type de detention.
  await assertThirdPartyAllowedForTenant(tenantId, 'MANDATE');

  // Lecture du bien FILTRÉE par agence : un bien de cette agence, ou un bien
  // CLIENT hérité (sans agence) déjà couvert par un mandat de cette agence.
  // Absent, étranger ou non CLIENT : le MÊME NotFoundError, sans oracle
  // d'existence (jamais un 400/403 propre à un bien d'une autre agence).
  const property = await prisma.property.findFirst({
    where: {
      id: data.propertyId,
      OR: [{ tenantId }, { tenantId: null, mandates: { some: { tenantId } } }]
    },
    include: {
      mandates: {
        where: {
          isActive: true
        }
      }
    }
  });

  if (!property || property.ownershipType !== PropertyOwnershipType.CLIENT) {
    throw new NotFoundError(t('Bien introuvable'));
  }

  // Check if property already has an active mandate with this tenant
  const existingMandate = property.mandates.find(mandate => mandate.tenantId === tenantId && mandate.isActive);

  if (existingMandate) {
    throw new ConflictError(t('Un mandat actif existe déjà pour cette agence et ce bien'));
  }

  // Un bien sans agence n'est captable qu'après rattachement à cette agence :
  // son propriétaire est déjà un client (`TenantClient`) de l'agence, ou
  // l'agence gère déjà un bail sur ce bien.
  if (!property.tenantId) {
    const rattache = await isAttachedToTenant(tenantId, property.id, property.ownerUserId);
    if (!rattache) {
      throw new NotFoundError(t('Bien introuvable'));
    }
  }

  // Create mandate
  // Mandat + registre des lots dans la MEME transaction : un bien CLIENT en
  // location entre dans la reserve LOTS tout de suite ; en enforce + Bloquer,
  // un quota plein leve QuotaExceededError (409) et annule le mandat.
  const mandate = await prisma.$transaction(async tx => {
    const created = await tx.propertyMandate.create({
      data: {
        propertyId: data.propertyId,
        tenantId,
        ownerUserId: property.ownerUserId!,
        startDate: data.startDate,
        endDate: data.endDate || null,
        scope: (data.scope as Prisma.InputJsonObject | undefined) ?? Prisma.JsonNull,
        notes: data.notes || null,
        isActive: true
      },
      include: {
        property: {
          select: {
            id: true,
            title: true,
            internalReference: true
          }
        },
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
    await syncLotActivationsTx(tx, tenantId, { propertyIds: [data.propertyId] }, { actorUserId });
    return created;
  });

  logger.info('Property mandate created', {
    mandateId: mandate.id,
    propertyId: data.propertyId,
    tenantId
  });

  // Audit log
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: AuditActionKey.PROPERTY_MANDATE_CREATED,
      entityType: PROPERTY_ENTITY_TYPES.PROPERTY_MANDATE,
      entityId: mandate.id,
      payload: {
        propertyId: data.propertyId,
        startDate: data.startDate,
        endDate: data.endDate
      }
    });
  }

  return mandate;
}

/**
 * Revoke a management mandate
 * @param mandateId - Mandate ID
 * @param tenantId - Tenant ID (for validation)
 * @param actorUserId - User revoking the mandate (for audit)
 * @returns Revoked mandate
 */
export async function revokeMandate(mandateId: string, tenantId: string, actorUserId?: string) {
  // Get mandate with property. Filtered by tenantId directly (rather than
  // fetched broad then checked) so a mandate id from another agency reads as
  // not-found, same as `getPropertyForTenant`.
  const mandate = await prisma.propertyMandate.findFirst({
    where: { id: mandateId, tenantId },
    include: {
      property: true
    }
  });

  if (!mandate) {
    throw new NotFoundError(t('Mandat introuvable'));
  }

  if (!mandate.isActive) {
    throw new ConflictError(t('Ce mandat est déjà inactif'));
  }

  // Revoke mandate (preserve historical data)
  const revoked = await prisma.$transaction(async tx => {
    const updated = await tx.propertyMandate.update({
      where: { id: mandateId, tenantId },
      data: {
        isActive: false,
        revokedAt: new Date(),
        revokedByUserId: actorUserId || null
      },
      include: {
        property: {
          select: {
            id: true,
            title: true,
            internalReference: true
          }
        },
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
    await syncLotActivationsTx(
      tx,
      tenantId,
      { propertyIds: [mandate.propertyId] },
      { actorUserId, reason: 'MANDATE_REVOKED' }
    );
    // Critical action: audit trail written in the same transaction.
    if (actorUserId) {
      await recordAuditEvent(tx, {
        actorUserId,
        tenantId,
        actionKey: AuditActionKey.PROPERTY_MANDATE_REVOKED,
        entityType: PROPERTY_ENTITY_TYPES.PROPERTY_MANDATE,
        entityId: mandateId,
        payload: {
          propertyId: mandate.propertyId,
          revokedAt: updated.revokedAt
        }
      });
    }
    return updated;
  });

  logger.info('Property mandate revoked', {
    mandateId,
    propertyId: mandate.propertyId,
    tenantId
  });

  return revoked;
}

/**
 * Get active mandates for a property
 *
 * Mandates can only be created for CLIENT-ownership properties (see
 * `createMandate`), which have no owning agency of their own: several
 * agencies can each hold their own, separate mandate on the same privately
 * owned property. Without a tenant check here, any authenticated user could
 * read `/tenants/:tenantId/properties/:id/mandates` for a property id they
 * found elsewhere and see which OTHER agencies hold a mandate on it, plus
 * the mandate owner's contact details — a cross-tenant leak the route
 * middleware (`enforcePropertyTenantIsolation`) does not catch, since it only
 * checks that a tenant context exists, not that `propertyId` belongs to it.
 * @param propertyId - Property ID
 * @param tenantId - Tenant asking (only their own mandate is returned, never
 *   a competing agency's)
 * @returns List of active mandates belonging to `tenantId`
 */
export async function getPropertyMandates(propertyId: string, tenantId: string) {
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      OR: [
        { ownershipType: PropertyOwnershipType.TENANT, tenantId },
        { ownershipType: PropertyOwnershipType.CLIENT, mandates: { some: { tenantId, isActive: true } } },
        // Bien de client saisi par l'agence, mandat pas encore créé.
        { ownershipType: PropertyOwnershipType.CLIENT, tenantId }
      ]
    },
    select: { id: true }
  });

  if (!property) {
    throw new NotFoundError(t('Bien introuvable ou accès refusé'));
  }

  const mandates = await prisma.propertyMandate.findMany({
    where: {
      propertyId,
      tenantId,
      isActive: true
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
    },
    orderBy: {
      startDate: 'desc'
    }
  });

  return mandates;
}

/**
 * Get mandates for a tenant
 * @param tenantId - Tenant ID
 * @returns List of active mandates
 */
export async function getTenantMandates(tenantId: string) {
  const mandates = await prisma.propertyMandate.findMany({
    where: {
      tenantId,
      isActive: true
    },
    include: {
      property: {
        select: {
          id: true,
          title: true,
          internalReference: true,
          address: true,
          status: true
        }
      },
      owner: {
        select: {
          id: true,
          email: true,
          fullName: true
        }
      }
    },
    orderBy: {
      startDate: 'desc'
    }
  });

  return mandates;
}
