import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { logAuditEvent } from './audit-service';
import { PROPERTY_ENTITY_TYPES } from '../types/audit-types';
import { AuditActionKey } from '../types/audit-types';
import { CreateMandateRequest } from '../types/property-types';
import { PropertyOwnershipType } from '@prisma/client';

/**
 * Create a management mandate for a property
 * @param tenantId - Tenant ID managing the property
 * @param data - Mandate creation data
 * @param actorUserId - User creating the mandate (for audit)
 * @returns Created mandate
 */
export async function createMandate(tenantId: string, data: CreateMandateRequest, actorUserId?: string) {
  // Verify property exists and is CLIENT ownership type
  const property = await prisma.property.findUnique({
    where: { id: data.propertyId },
    include: {
      mandates: {
        where: {
          isActive: true
        }
      }
    }
  });

  if (!property) {
    throw new Error('Property not found');
  }

  if (property.ownershipType !== PropertyOwnershipType.CLIENT) {
    throw new Error('Mandates can only be created for CLIENT ownership type properties');
  }

  // Check if property already has an active mandate with this tenant
  const existingMandate = property.mandates.find(mandate => mandate.tenantId === tenantId && mandate.isActive);

  if (existingMandate) {
    throw new Error('An active mandate already exists for this tenant and property');
  }

  // Verify tenant has access to create mandates
  if (property.tenantId && property.tenantId !== tenantId) {
    throw new Error('Tenant does not have access to create mandates for this property');
  }

  // Create mandate
  const mandate = await prisma.propertyMandate.create({
    data: {
      propertyId: data.propertyId,
      tenantId,
      ownerUserId: property.ownerUserId!,
      startDate: data.startDate,
      endDate: data.endDate || null,
      scope: data.scope || null,
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
    throw new Error('Mandate not found');
  }

  if (!mandate.isActive) {
    throw new Error('Mandate is already inactive');
  }

  // Revoke mandate (preserve historical data)
  const revoked = await prisma.propertyMandate.update({
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

  logger.info('Property mandate revoked', {
    mandateId,
    propertyId: mandate.propertyId,
    tenantId
  });

  // Audit log
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: AuditActionKey.PROPERTY_MANDATE_REVOKED,
      entityType: PROPERTY_ENTITY_TYPES.PROPERTY_MANDATE,
      entityId: mandateId,
      payload: {
        propertyId: mandate.propertyId,
        revokedAt: revoked.revokedAt
      }
    });
  }

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
        { ownershipType: PropertyOwnershipType.CLIENT, mandates: { some: { tenantId, isActive: true } } }
      ]
    },
    select: { id: true }
  });

  if (!property) {
    throw new Error('Property not found or access denied');
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
