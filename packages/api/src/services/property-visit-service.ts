import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { logAuditEvent } from './audit-service';
import { PROPERTY_ENTITY_TYPES } from '../types/audit-types';
import { AuditActionKey } from '../types/audit-types';
import { MembershipStatus, PropertyVisitType, PropertyVisitStatus, PropertyVisitGoal } from '@prisma/client';
import { createActivity } from './crm-activity-service';
import { t } from '../i18n';
import { NotFoundError, BadRequestError, ForbiddenError, ConflictError } from '../middleware/error-middleware';

/** Durée retenue pour une visite sans durée saisie (le formulaire web n'en propose pas). */
export const DEFAULT_VISIT_DURATION_MINUTES = 60;
/** Durée maximale acceptée : borne aussi la fenêtre de recherche des chevauchements. */
export const MAX_VISIT_DURATION_MINUTES = 480;

/** Statuts qui occupent le créneau : une visite annulée, faite ou absente ne bloque rien. */
const ACTIVE_VISIT_STATUSES: PropertyVisitStatus[] = [PropertyVisitStatus.SCHEDULED, PropertyVisitStatus.CONFIRMED];

const MINUTE_MS = 60_000;

/**
 * Refuse (409) si une autre visite ACTIVE du même bien, dans la même agence,
 * chevauche [début, début + durée]. Des créneaux contigus (fin = début) ne se
 * chevauchent pas ; un autre bien ou une autre agence n'est jamais concerné.
 * Le créneau de l'autre visite est renvoyé dans `data.conflict` pour l'écran.
 */
export async function assertNoVisitOverlap(params: {
  propertyId: string;
  tenantId?: string | null;
  scheduledAt: Date;
  duration?: number | null;
  excludeVisitId?: string;
}): Promise<void> {
  const { propertyId, tenantId, scheduledAt, excludeVisitId } = params;
  const start = scheduledAt.getTime();
  const end = start + (params.duration || DEFAULT_VISIT_DURATION_MINUTES) * MINUTE_MS;

  const candidates = await prisma.propertyVisit.findMany({
    where: {
      propertyId,
      tenantId: tenantId || null,
      status: { in: ACTIVE_VISIT_STATUSES },
      ...(excludeVisitId ? { id: { not: excludeVisitId } } : {}),
      scheduledAt: {
        gt: new Date(start - MAX_VISIT_DURATION_MINUTES * MINUTE_MS),
        lt: new Date(end)
      }
    },
    select: { id: true, scheduledAt: true, duration: true }
  });

  const clash = candidates.find(v => {
    const vStart = v.scheduledAt.getTime();
    const vEnd = vStart + (v.duration || DEFAULT_VISIT_DURATION_MINUTES) * MINUTE_MS;
    return vStart < end && vEnd > start;
  });

  if (clash) {
    const from = clash.scheduledAt;
    const to = new Date(from.getTime() + (clash.duration || DEFAULT_VISIT_DURATION_MINUTES) * MINUTE_MS);
    const error = new ConflictError(
      t('Ce bien a déjà une visite prévue sur ce créneau. Choisissez un autre horaire.'),
      [{ field: 'scheduledAt', message: t('Créneau déjà occupé pour ce bien') }]
    );
    error.data = { conflict: { visitId: clash.id, startsAt: from.toISOString(), endsAt: to.toISOString() } };
    throw error;
  }
}

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
  // Without an agency there is nothing to validate against: refuse (never match any property).
  if (!tenantId) {
    throw new NotFoundError(t('Bien introuvable ou accès refusé'));
  }

  // Validate property exists and is accessible
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      OR: [
        { ownershipType: 'TENANT', tenantId },
        { ownershipType: 'CLIENT', tenantId },
        { ownershipType: 'CLIENT', mandates: { some: { tenantId, isActive: true } } }
      ]
    }
  });

  if (!property) {
    throw new NotFoundError(t('Bien introuvable ou accès refusé'));
  }

  // Validate scheduledAt is in the future
  if (new Date(data.scheduledAt) <= new Date()) {
    throw new BadRequestError(t('La visite doit être planifiée dans le futur'));
  }

  // Refuse a slot already taken by another active visit of the same property
  await assertNoVisitOverlap({
    propertyId,
    tenantId,
    scheduledAt: new Date(data.scheduledAt),
    duration: data.duration
  });

  // Validate contact if provided
  if (data.contactId) {
    const contact = await prisma.crmContact.findFirst({
      where: {
        id: data.contactId,
        tenantId: tenantId || undefined
      }
    });

    if (!contact) {
      throw new NotFoundError(t('Contact introuvable ou accès refusé'));
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
      throw new NotFoundError(t('Affaire introuvable ou accès refusé'));
    }
  }

  // Validate collaborators if provided
  if (data.collaboratorIds && data.collaboratorIds.length > 0) {
    // Validate that all collaborator user IDs exist and belong to the tenant
    const tenantMembers = await prisma.membership.findMany({
      where: {
        tenantId,
        userId: { in: data.collaboratorIds },
        status: MembershipStatus.ACTIVE
      },
      select: { userId: true }
    });

    if (new Set(tenantMembers.map(member => member.userId)).size !== new Set(data.collaboratorIds).size) {
      throw new NotFoundError(t('Un ou plusieurs collaborateurs sont introuvables ou inaccessibles'));
    }
  }

  // Validate assignee if provided: same rule as collaborators, an agent
  // assigned to a visit must belong to the acting agency.
  if (data.assignedToUserId) {
    const assignee = await prisma.membership.findFirst({
      where: {
        tenantId,
        userId: data.assignedToUserId,
        status: MembershipStatus.ACTIVE
      }
    });

    if (!assignee) {
      throw new NotFoundError(t('Responsable introuvable ou accès refusé'));
    }
  }

  // Create visit with collaborators
  const visit = await prisma.propertyVisit.create({
    data: {
      propertyId,
      // Denormalised so visits can be listed per tenant without joining properties.
      tenantId: tenantId || null,
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
          dealId: data.dealId || undefined,
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
    throw new NotFoundError(t('Visite introuvable'));
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
      throw new ForbiddenError(t('Accès refusé'));
    }
  }

  // Re-activating a canceled/done visit takes its slot back: re-check it.
  if (!ACTIVE_VISIT_STATUSES.includes(visit.status) && ACTIVE_VISIT_STATUSES.includes(status)) {
    await assertNoVisitOverlap({
      propertyId: visit.propertyId,
      tenantId: visit.tenantId,
      scheduledAt: visit.scheduledAt,
      duration: visit.duration,
      excludeVisitId: visitId
    });
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
  // Without an agency, `tenantId: undefined` would drop the filter below and
  // match any property: refuse instead.
  if (!tenantId) {
    throw new NotFoundError(t('Bien introuvable ou accès refusé'));
  }

  // Validate property access
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      OR: [
        { ownershipType: 'TENANT', tenantId },
        { ownershipType: 'CLIENT', tenantId },
        { ownershipType: 'CLIENT', mandates: { some: { tenantId, isActive: true } } }
      ]
    }
  });

  if (!property) {
    throw new NotFoundError(t('Bien introuvable ou accès refusé'));
  }

  // Get visits — only this agency's. A CLIENT property can be under mandate
  // with several agencies: each one sees its own visits (notes, contacts),
  // never a competing agency's.
  const visits = await prisma.propertyVisit.findMany({
    where: { propertyId, tenantId },
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
/** Nombre maximal de visites renvoyees par le calendrier (periode bornee a 366 jours). */
export const CALENDAR_VISITS_MAX_ROWS = 2000;

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

  // Only the visits scheduled by this agency. Without an agency there is
  // nothing to show: the calendar never spans agencies.
  if (!tenantId) {
    return [];
  }
  where.tenantId = tenantId;

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
    },
    // Plafond de lignes : une agence tres active ne peut pas tout charger.
    take: CALENDAR_VISITS_MAX_ROWS
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
          dealId: visit.dealId || undefined,
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
