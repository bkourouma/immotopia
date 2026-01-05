import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { CrmAppointmentStatus } from '@prisma/client';

export type CalendarEventType = 'APPOINTMENT' | 'FOLLOWUP' | 'PROPERTY_VISIT';

export type CalendarScope = 'GLOBAL' | 'MINE';

export interface CalendarEvent {
  eventId: string;
  eventType: CalendarEventType;
  start: Date;
  end: Date | null; // null for follow-ups (point-in-time)
  title: string;
  contactId: string;
  contactName: string;
  dealId: string | null;
  dealLabel: string | null;
  status?: string;
  badges: string[];
  canEdit: boolean;
  canDrag: boolean;
  // Additional metadata
  appointmentType?: string;
  nextActionType?: string;
  location?: string;
  assignedToUserId?: string | null;
  createdByUserId: string;
}

export interface CalendarFilters {
  from: Date;
  to: Date;
  scope?: CalendarScope;
  types?: ('appointments' | 'followups' | 'propertyVisits')[];
  userId?: string; // For MINE scope
}

/**
 * Get calendar events (appointments + follow-ups) for a date range
 * @param tenantId - Tenant ID (required for isolation)
 * @param filters - Filter criteria
 * @returns Unified calendar events
 */
export async function getCalendarEvents(tenantId: string, filters: CalendarFilters): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];
  const userId = filters.userId;

  // Determine if we should include appointments
  const includeAppointments = !filters.types || filters.types.includes('appointments');
  // Determine if we should include follow-ups
  const includeFollowups = !filters.types || filters.types.includes('followups');
  // Determine if we should include property visits
  const includePropertyVisits = !filters.types || filters.types.includes('propertyVisits');

  // Fetch appointments
  if (includeAppointments) {
    const appointmentWhere: any = {
      tenantId,
      startAt: {
        gte: filters.from,
        lte: filters.to
      }
    };

    // Apply "My Calendar" filter for appointments
    if (filters.scope === 'MINE' && userId) {
      appointmentWhere.OR = [
        { assignedToUserId: userId },
        { createdByUserId: userId },
        {
          collaborators: {
            some: {
              userId
            }
          }
        }
      ];
    }

    const appointments = await prisma.crmAppointment.findMany({
      where: appointmentWhere,
      include: {
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
            type: true,
            stage: true
          }
        },
        assignedTo: {
          select: {
            id: true,
            fullName: true
          }
        },
        collaborators: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true
              }
            }
          }
        }
      },
      orderBy: {
        startAt: 'asc'
      }
    });

    for (const appointment of appointments) {
      const contactName = `${appointment.contact.firstName} ${appointment.contact.lastName}`;
      const dealLabel = appointment.deal ? `${appointment.deal.type} - ${appointment.deal.stage}` : null;

      const badges: string[] = [appointment.appointmentType];
      if (appointment.deal) {
        badges.push('Deal');
      }

      events.push({
        eventId: appointment.id,
        eventType: 'APPOINTMENT',
        start: appointment.startAt,
        end: appointment.endAt,
        title: `${appointment.appointmentType}: ${contactName}`,
        contactId: appointment.contactId,
        contactName,
        dealId: appointment.dealId,
        dealLabel,
        status: appointment.status,
        badges,
        canEdit: true, // Can be edited if user has permission (checked at route level)
        canDrag:
          appointment.status !== CrmAppointmentStatus.DONE && appointment.status !== CrmAppointmentStatus.CANCELED,
        appointmentType: appointment.appointmentType,
        location: appointment.location || undefined,
        assignedToUserId: appointment.assignedToUserId,
        createdByUserId: appointment.createdByUserId
      });
    }
  }

  // Fetch follow-ups (activities with next_action_at)
  if (includeFollowups) {
    const activityWhere: any = {
      tenantId,
      nextActionAt: {
        not: null,
        gte: filters.from,
        lte: filters.to
      }
    };

    // Apply "My Calendar" filter for follow-ups
    if (filters.scope === 'MINE' && userId) {
      activityWhere.createdByUserId = userId;
    }

    const activities = await prisma.crmActivity.findMany({
      where: activityWhere,
      include: {
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
            type: true,
            stage: true
          }
        },
        createdBy: {
          select: {
            id: true,
            fullName: true
          }
        }
      },
      orderBy: {
        nextActionAt: 'asc'
      }
    });

    for (const activity of activities) {
      if (!activity.nextActionAt) continue; // Type guard

      const contactName = `${activity.contact.firstName} ${activity.contact.lastName}`;
      const dealLabel = activity.deal ? `${activity.deal.type} - ${activity.deal.stage}` : null;

      const title = activity.nextActionType
        ? `Tâche: ${activity.nextActionType} - ${contactName}`
        : `Relance: ${contactName}`;

      const badges: string[] = [];
      if (activity.nextActionType) {
        badges.push(activity.nextActionType);
      } else {
        badges.push('Relance');
      }
      if (activity.deal) {
        badges.push('Deal');
      }

      events.push({
        eventId: activity.id,
        eventType: 'FOLLOWUP',
        start: activity.nextActionAt,
        end: null, // Follow-ups are point-in-time
        title,
        contactId: activity.contactId,
        contactName,
        dealId: activity.dealId,
        dealLabel,
        badges,
        canEdit: true,
        canDrag: true, // Follow-ups can always be dragged
        nextActionType: activity.nextActionType || undefined,
        createdByUserId: activity.createdByUserId
      });
    }
  }

  // Fetch property visits
  if (includePropertyVisits) {
    const visitWhere: any = {
      scheduledAt: {
        gte: filters.from,
        lte: filters.to
      },
      property: {
        OR: [
          { ownershipType: 'TENANT', tenantId },
          { ownershipType: 'CLIENT', mandates: { some: { tenantId, isActive: true } } }
        ]
      }
    };

    // Apply "My Calendar" filter for property visits
    if (filters.scope === 'MINE' && userId) {
      visitWhere.OR = [
        { assignedToUserId: userId },
        {
          collaborators: {
            some: {
              userId
            }
          }
        }
      ];
    }

    const visits = await prisma.propertyVisit.findMany({
      where: visitWhere,
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
            lastName: true
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
            fullName: true
          }
        },
        collaborators: {
          include: {
            user: {
              select: {
                id: true,
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

    for (const visit of visits) {
      const contactName = visit.contact
        ? `${visit.contact.firstName} ${visit.contact.lastName}`
        : 'Visite sans contact';
      const dealLabel = visit.deal ? `${visit.deal.type} - ${visit.deal.stage}` : null;
      const propertyTitle = visit.property.title || visit.property.address || 'Propriété';

      const title = `${visit.visitType === 'VISIT' ? 'Visite' : 'Rendez-vous'}: ${propertyTitle}${visit.contact ? ` - ${contactName}` : ''}`;

      const badges: string[] = [visit.visitType === 'VISIT' ? 'Visite' : 'Rendez-vous'];
      if (visit.deal) {
        badges.push('Deal');
      }
      if (visit.status) {
        badges.push(visit.status);
      }

      // Calculate end time from duration
      const endTime = visit.duration
        ? new Date(visit.scheduledAt.getTime() + visit.duration * 60 * 1000)
        : new Date(visit.scheduledAt.getTime() + 60 * 60 * 1000); // Default 1 hour

      events.push({
        eventId: visit.id,
        eventType: 'PROPERTY_VISIT',
        start: visit.scheduledAt,
        end: endTime,
        title,
        contactId: visit.contactId || '',
        contactName,
        dealId: visit.dealId,
        dealLabel,
        status: visit.status,
        badges,
        canEdit: true,
        canDrag: visit.status !== 'DONE' && visit.status !== 'CANCELED',
        location: visit.location || visit.property.address || undefined,
        assignedToUserId: visit.assignedToUserId,
        createdByUserId: visit.assignedToUserId || '' // Property visits don't have createdByUserId, use assignedToUserId as fallback
      });
    }
  }

  // Sort all events by start time
  events.sort((a, b) => a.start.getTime() - b.start.getTime());

  logger.debug('Calendar events fetched', {
    tenantId,
    eventCount: events.length,
    scope: filters.scope,
    types: filters.types
  });

  return events;
}
