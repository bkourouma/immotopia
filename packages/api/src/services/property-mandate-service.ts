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
  // Get mandate with property
  const mandate = await prisma.propertyMandate.findUnique({
    where: { id: mandateId },
    include: {
      property: true
    }
  });

  if (!mandate) {
    throw new Error('Mandate not found');
  }

  if (mandate.tenantId !== tenantId) {
    throw new Error('Tenant does not have access to revoke this mandate');
  }

  if (!mandate.isActive) {
    throw new Error('Mandate is already inactive');
  }

  // Revoke mandate (preserve historical data)
  const revoked = await prisma.propertyMandate.update({
    where: { id: mandateId },
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
 * @param propertyId - Property ID
 * @returns List of active mandates
 */
export async function getPropertyMandates(propertyId: string) {
  const mandates = await prisma.propertyMandate.findMany({
    where: {
      propertyId,
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




