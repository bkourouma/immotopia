import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { logAuditEvent } from './audit-service';
import { PROPERTY_ENTITY_TYPES } from '../types/audit-types';
import { AuditActionKey } from '../types/audit-types';
import { PropertyVisitType, PropertyVisitStatus, PropertyVisitGoal } from '@prisma/client';
import { createActivity } from './crm-activity-service';

/**
 * Schedule a property visit
 * @param propertyId - Property ID
 * @param data - Visit data
 * @param tenantId - Tenant ID (for validation)
 * @param actorUserId - User scheduling the visit (for audit)
 * @returns Created visit
 */
export async function scheduleVisit(
  propertyId: string,
  data: {
    contactId?: string | null;
    dealId?: string | null;
    visitType: PropertyVisitType;
    goal?: PropertyVisitGoal | null;
    scheduledAt: Date;
    duration?: number | null;
    location?: string | null;
    assignedToUserId?: string | null;
    collaboratorIds?: string[];
    notes?: string | null;
  },
  tenantId?: string | null,
  actorUserId?: string
) {
  // Validate property exists and is accessible
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      OR: [
        { ownershipType: 'TENANT', tenantId },
        { ownershipType: 'CLIENT', mandates: { some: { tenantId, isActive: true } } }
      ]
    }
  });

  if (!property) {
    throw new Error('Property not found or access denied');
  }

  // Validate scheduledAt is in the future
  if (new Date(data.scheduledAt) <= new Date()) {
    throw new Error('Visit must be scheduled in the future');
  }

  // Validate contact if provided
  if (data.contactId) {
    const contact = await prisma.crmContact.findFirst({
      where: {
        id: data.contactId,
        tenantId: tenantId || undefined
      }
    });

    if (!contact) {
      throw new Error('Contact not found or access denied');
    }
  }

  // Validate deal if provided
  if (data.dealId) {
    const deal = await prisma.crmDeal.findFirst({
      where: {
        id: data.dealId,
        tenantId: tenantId || undefined
      }
    });

    if (!deal) {
      throw new Error('Deal not found or access denied');
    }
  }

  // Validate collaborators if provided
  if (data.collaboratorIds && data.collaboratorIds.length > 0) {
    // Validate that all collaborator user IDs exist and belong to the tenant
    const tenantMembers = await prisma.membership.findMany({
      where: {
        tenantId: tenantId || undefined,
        userId: { in: data.collaboratorIds }
      }
    });

    if (tenantMembers.length !== data.collaboratorIds.length) {
      throw new Error('One or more collaborators not found or access denied');
    }
  }

  // Create visit with collaborators
  const visit = await prisma.propertyVisit.create({
    data: {
      propertyId,
      contactId: data.contactId || null,
      dealId: data.dealId || null,
      visitType: data.visitType,
      goal: data.goal || null,
      scheduledAt: data.scheduledAt,
      duration: data.duration || null,
      location: data.location || property.address || null,
      status: PropertyVisitStatus.SCHEDULED,
      assignedToUserId: data.assignedToUserId || null,
      notes: data.notes || null,
      collaborators:
        data.collaboratorIds && data.collaboratorIds.length > 0
          ? {
              create: data.collaboratorIds.map(userId => ({
                userId
              }))
            }
          : undefined
    },
    include: {
      property: {
        select: {
          id: true,
          title: true,
          address: true
        }
      },
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true
        }
      },
      deal: {
        select: {
          id: true,
          type: true
        }
      },
      assignedTo: {
        select: {
          id: true,
          email: true,
          fullName: true
        }
      },
      collaborators: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true
            }
          }
        }
      }
    }
  });

  logger.info('Property visit scheduled', {
    visitId: visit.id,
    propertyId,
    scheduledAt: data.scheduledAt
  });

  // Audit log
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId: tenantId || null,
      actionKey: AuditActionKey.PROPERTY_VISIT_SCHEDULED,
      entityType: PROPERTY_ENTITY_TYPES.PROPERTY_VISIT,
      entityId: visit.id,
      payload: {
        propertyId,
        scheduledAt: data.scheduledAt,
        contactId: data.contactId,
        dealId: data.dealId
      }
    });
  }

  // Create CRM activity if linked to contact/deal
  if (data.contactId && actorUserId && tenantId) {
    try {
      await createActivity(
        tenantId,
        {
          contactId: data.contactId,
          dealId: data.dealId || null,
          activityType: 'CALL',
          content: `Visite de propriété planifiée: ${property.title || property.address}`,
          occurredAt: new Date(),
          nextActionAt: data.scheduledAt,
          nextActionType: 'VISIT'
        },
        actorUserId
      );
    } catch (error) {
      logger.warn('Failed to create CRM activity for visit', { error });
    }
  }

  return visit;
}

/**
 * Update visit status
 * @param visitId - Visit ID
 * @param status - New status
 * @param tenantId - Tenant ID (for validation)
 * @param actorUserId - User updating the status (for audit)
 * @param notes - Optional notes
 * @returns Updated visit
 */
export async function updateVisitStatus(
  visitId: string,
  status: PropertyVisitStatus,
  tenantId?: string | null,
  actorUserId?: string,
  notes?: string | null
) {
  // Get visit with property to validate tenant access
  const visit = await prisma.propertyVisit.findFirst({
    where: { id: visitId },
    include: {
      property: true
    }
  });

  if (!visit) {
    throw new Error('Visit not found');
  }

  // Validate tenant access
  if (tenantId) {
    const hasAccess =
      (visit.property.ownershipType === 'TENANT' && visit.property.tenantId === tenantId) ||
      (visit.property.ownershipType === 'CLIENT' &&
        (await prisma.propertyMandate.findFirst({
          where: {
            propertyId: visit.propertyId,
            tenantId,
            isActive: true
          }
        })) !== null);

    if (!hasAccess) {
      throw new Error('Access denied');
    }
  }

  // Update visit
  const updated = await prisma.propertyVisit.update({
    where: { id: visitId },
    data: {
      status,
      notes: notes !== undefined ? notes : visit.notes
    },
    include: {
      property: {
        select: {
          id: true,
          title: true,
          address: true
        }
      },
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true
        }
      },
      deal: {
        select: {
          id: true,
          type: true
        }
      },
      assignedTo: {
        select: {
          id: true,
          email: true,
          fullName: true
        }
      }
    }
  });

  logger.info('Property visit status updated', {
    visitId,
    status
  });

  // Audit log
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId: tenantId || null,
      actionKey: AuditActionKey.PROPERTY_STATUS_CHANGED,
      entityType: PROPERTY_ENTITY_TYPES.PROPERTY_VISIT,
      entityId: visitId,
      payload: {
        previousStatus: visit.status,
        newStatus: status
      }
    });
  }

  return updated;
}

/**
 * Get all visits for a property
 * @param propertyId - Property ID
 * @param tenantId - Tenant ID (for validation)
 * @returns List of visits
 */
export async function getPropertyVisits(propertyId: string, tenantId?: string | null) {
  // Validate property access
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      OR: [
        { ownershipType: 'TENANT', tenantId },
        { ownershipType: 'CLIENT', mandates: { some: { tenantId, isActive: true } } }
      ]
    }
  });

  if (!property) {
    throw new Error('Property not found or access denied');
  }

  // Get visits
  const visits = await prisma.propertyVisit.findMany({
    where: { propertyId },
    include: {
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true
        }
      },
      deal: {
        select: {
          id: true,
          type: true,
          stage: true
        }
      },
      assignedTo: {
        select: {
          id: true,
          email: true,
          fullName: true
        }
      },
      collaborators: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true
            }
          }
        }
      }
    },
    orderBy: {
      scheduledAt: 'desc'
    }
  });

  return visits;
}

/**
 * Get calendar visits organized by date
 * @param startDate - Start date
 * @param endDate - End date
 * @param tenantId - Tenant ID (for filtering)
 * @param assignedToUserId - Filter by assigned user (optional)
 * @returns Visits organized by date
 */
export async function getCalendarVisits(
  startDate: Date,
  endDate: Date,
  tenantId?: string | null,
  assignedToUserId?: string | null
) {
  const where: any = {
    scheduledAt: {
      gte: startDate,
      lte: endDate
    }
  };

  // Filter by tenant (through property)
  if (tenantId) {
    where.property = {
      OR: [
        { ownershipType: 'TENANT', tenantId },
        { ownershipType: 'CLIENT', mandates: { some: { tenantId, isActive: true } } }
      ]
    };
  }

  // Filter by assigned user
  if (assignedToUserId) {
    where.assignedToUserId = assignedToUserId;
  }

  const visits = await prisma.propertyVisit.findMany({
    where,
    include: {
      property: {
        select: {
          id: true,
          title: true,
          address: true,
          locationZone: true
        }
      },
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phonePrimary: true,
          phoneSecondary: true
        }
      },
      deal: {
        select: {
          id: true,
          type: true,
          stage: true
        }
      },
      assignedTo: {
        select: {
          id: true,
          email: true,
          fullName: true
        }
      },
      collaborators: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true
            }
          }
        }
      }
    },
    orderBy: {
      scheduledAt: 'asc'
    }
  });

  // Organize by date
  const visitsByDate: Record<string, typeof visits> = {};
  visits.forEach(visit => {
    const dateKey = visit.scheduledAt.toISOString().split('T')[0];
    if (!visitsByDate[dateKey]) {
      visitsByDate[dateKey] = [];
    }
    visitsByDate[dateKey].push(visit);
  });

  return visitsByDate;
}

/**
 * Complete a visit (mark as DONE)
 * @param visitId - Visit ID
 * @param tenantId - Tenant ID (for validation)
 * @param actorUserId - User completing the visit (for audit)
 * @param notes - Visit completion notes
 * @returns Updated visit
 */
export async function completeVisit(
  visitId: string,
  tenantId?: string | null,
  actorUserId?: string,
  notes?: string | null
) {
  const visit = await updateVisitStatus(visitId, PropertyVisitStatus.DONE, tenantId, actorUserId, notes);

  // Create CRM activity if linked to contact/deal
  if (visit.contactId && actorUserId && tenantId) {
    try {
      await createActivity(
        tenantId,
        {
          contactId: visit.contactId,
          dealId: visit.dealId || null,
          activityType: 'VISIT',
          content: `Visite de propriété terminée: ${visit.property.title || visit.property.address}${notes ? `\n\nNotes: ${notes}` : ''}`,
          occurredAt: new Date()
        },
        actorUserId
      );
    } catch (error) {
      logger.warn('Failed to create CRM activity for completed visit', { error });
    }
  }

  return visit;
}
