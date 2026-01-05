import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { logAuditEvent } from './audit-service';
import { CRM_ENTITY_TYPES } from '../types/audit-types';
import { CreateAppointmentRequest, UpdateAppointmentRequest, AppointmentFilters } from '../types/crm-types';
import { CrmAppointmentStatus, CrmAppointmentType } from '@prisma/client';
import { createActivity } from './crm-activity-service';

/**
 * Create a new appointment
 * @param tenantId - Tenant ID (required for isolation)
 * @param data - Appointment creation data
 * @param actorUserId - User creating the appointment (for audit)
 * @returns Created appointment
 */
export async function createAppointment(tenantId: string, data: CreateAppointmentRequest, actorUserId: string) {
  // Verify contact exists and belongs to tenant
  const contact = await prisma.crmContact.findFirst({
    where: {
      id: data.contactId,
      tenantId
    }
  });

  if (!contact) {
    throw new Error('Contact not found');
  }

  // Verify deal exists and belongs to tenant (if provided)
  if (data.dealId) {
    const deal = await prisma.crmDeal.findFirst({
      where: {
        id: data.dealId,
        tenantId
      }
    });

    if (!deal) {
      throw new Error('Deal not found');
    }
  }

  // Validate date range
  if (data.endAt <= data.startAt) {
    throw new Error('End time must be after start time');
  }

  // Create appointment with default SCHEDULED status
  const appointment = await prisma.crmAppointment.create({
    data: {
      tenantId,
      contactId: data.contactId,
      dealId: data.dealId || null,
      appointmentType: data.appointmentType,
      startAt: data.startAt,
      endAt: data.endAt,
      location: data.location || null,
      status: CrmAppointmentStatus.SCHEDULED,
      createdByUserId: actorUserId,
      assignedToUserId: data.assignedToUserId || null,
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
              fullName: true,
              avatarUrl: true
            }
          }
        }
      }
    }
  });

  logger.info('CRM appointment created', {
    appointmentId: appointment.id,
    tenantId,
    contactId: data.contactId,
    appointmentType: data.appointmentType
  });

  // Audit log
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: 'CRM_APPOINTMENT_CREATED',
    entityType: 'APPOINTMENT',
    entityId: appointment.id,
    payload: {
      contactId: data.contactId,
      dealId: data.dealId,
      appointmentType: data.appointmentType,
      startAt: data.startAt
    }
  });

  return appointment;
}

/**
 * List appointments with filtering and pagination
 * @param tenantId - Tenant ID (required for isolation)
 * @param filters - Filter criteria
 * @returns Paginated appointments
 */
export async function listAppointments(tenantId: string, filters: AppointmentFilters) {
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const skip = (page - 1) * limit;

  // Build where clause
  const where: any = {
    tenantId // Always enforce tenant isolation
  };

  if (filters.contactId) {
    where.contactId = filters.contactId;
  }

  if (filters.dealId) {
    where.dealId = filters.dealId;
  }

  if (filters.assignedTo) {
    where.assignedToUserId = filters.assignedTo;
  }

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.appointmentType) {
    where.appointmentType = filters.appointmentType;
  }

  if (filters.startDate || filters.endDate) {
    where.startAt = {};
    if (filters.startDate) {
      where.startAt.gte = filters.startDate;
    }
    if (filters.endDate) {
      where.startAt.lte = filters.endDate;
    }
  }

  // Get total count
  const total = await prisma.crmAppointment.count({ where });

  // Get appointments
  const appointments = await prisma.crmAppointment.findMany({
    where,
    skip,
    take: limit,
    orderBy: {
      startAt: 'asc'
    },
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
              fullName: true,
              avatarUrl: true
            }
          }
        }
      }
    }
  });

  return {
    appointments,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

/**
 * Update appointment status
 * @param tenantId - Tenant ID
 * @param appointmentId - Appointment ID
 * @param status - New status
 * @param actorUserId - User updating the appointment (for audit)
 * @returns Updated appointment
 */
export async function updateAppointmentStatus(
  tenantId: string,
  appointmentId: string,
  status: CrmAppointmentStatus,
  actorUserId?: string
) {
  // Verify appointment exists and belongs to tenant
  const existingAppointment = await prisma.crmAppointment.findFirst({
    where: {
      id: appointmentId,
      tenantId
    }
  });

  if (!existingAppointment) {
    throw new Error('Appointment not found');
  }

  const updatedAppointment = await prisma.crmAppointment.update({
    where: { id: appointmentId },
    data: { status },
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
      collaborators: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
              avatarUrl: true
            }
          }
        }
      }
    }
  });

  logger.info('CRM appointment status updated', {
    appointmentId,
    tenantId,
    previousStatus: existingAppointment.status,
    newStatus: status
  });

  // Audit log
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: 'CRM_APPOINTMENT_UPDATED',
      entityType: 'APPOINTMENT',
      entityId: appointmentId,
      payload: {
        previousStatus: existingAppointment.status,
        newStatus: status
      }
    });
  }

  return updatedAppointment;
}

/**
 * Mark appointment as done and create activity
 * @param tenantId - Tenant ID
 * @param appointmentId - Appointment ID
 * @param notes - Optional notes about the appointment
 * @param actorUserId - User marking appointment as done
 * @returns Updated appointment
 */
export async function markAppointmentDone(
  tenantId: string,
  appointmentId: string,
  notes?: string,
  actorUserId?: string
) {
  // Update appointment status
  const appointment = await updateAppointmentStatus(tenantId, appointmentId, CrmAppointmentStatus.DONE, actorUserId);

  // Automatically create activity for the appointment
  if (actorUserId) {
    try {
      await createActivity(
        tenantId,
        {
          contactId: appointment.contactId,
          dealId: appointment.dealId || undefined,
          activityType: appointment.appointmentType === CrmAppointmentType.VISITE ? 'VISIT' : 'MEETING',
          content: notes || `Appointment completed: ${appointment.appointmentType}`,
          occurredAt: appointment.endAt
        },
        actorUserId
      );
    } catch (error) {
      // Log error but don't fail the appointment update
      logger.error('Failed to create activity for appointment', {
        appointmentId,
        error
      });
    }
  }

  return appointment;
}

/**
 * Get upcoming appointments for dashboard
 * @param tenantId - Tenant ID
 * @param days - Number of days ahead to look (default 7)
 * @param assignedToUserId - Optional filter by assigned user
 * @returns Upcoming appointments
 */
export async function getUpcomingAppointments(tenantId: string, days: number = 7, assignedToUserId?: string) {
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + days);

  const where: any = {
    tenantId,
    startAt: {
      gte: startDate,
      lte: endDate
    },
    status: {
      in: [CrmAppointmentStatus.SCHEDULED, CrmAppointmentStatus.CONFIRMED]
    }
  };

  if (assignedToUserId) {
    where.assignedToUserId = assignedToUserId;
  }

  return prisma.crmAppointment.findMany({
    where,
    orderBy: {
      startAt: 'asc'
    },
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
      collaborators: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
              avatarUrl: true
            }
          }
        }
      }
    }
  });
}

/**
 * Reschedule an appointment (update start and end times)
 * @param tenantId - Tenant ID
 * @param appointmentId - Appointment ID
 * @param startAt - New start time
 * @param endAt - New end time
 * @param actorUserId - User rescheduling the appointment (for audit)
 * @returns Updated appointment
 */
export async function rescheduleAppointment(
  tenantId: string,
  appointmentId: string,
  startAt: Date,
  endAt: Date,
  actorUserId: string
) {
  // Verify appointment exists and belongs to tenant
  const existingAppointment = await prisma.crmAppointment.findFirst({
    where: {
      id: appointmentId,
      tenantId
    }
  });

  if (!existingAppointment) {
    throw new Error('Appointment not found');
  }

  // Validate date range
  if (endAt <= startAt) {
    throw new Error('End time must be after start time');
  }

  const updatedAppointment = await prisma.crmAppointment.update({
    where: { id: appointmentId },
    data: {
      startAt,
      endAt
    },
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
      collaborators: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
              avatarUrl: true
            }
          }
        }
      }
    }
  });

  logger.info('CRM appointment rescheduled', {
    appointmentId,
    tenantId,
    previousStartAt: existingAppointment.startAt,
    newStartAt: startAt
  });

  // Audit log
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: 'CRM_APPOINTMENT_RESCHEDULED',
    entityType: 'APPOINTMENT',
    entityId: appointmentId,
    payload: {
      previousStartAt: existingAppointment.startAt,
      previousEndAt: existingAppointment.endAt,
      newStartAt: startAt,
      newEndAt: endAt
    }
  });

  return updatedAppointment;
}

/**
 * Update appointment (for resizing or other updates)
 * @param tenantId - Tenant ID
 * @param appointmentId - Appointment ID
 * @param data - Update data
 * @param actorUserId - User updating the appointment (for audit)
 * @returns Updated appointment
 */
export async function updateAppointment(
  tenantId: string,
  appointmentId: string,
  data: {
    startAt?: Date;
    endAt?: Date;
    location?: string | null;
    assignedToUserId?: string | null;
    status?: CrmAppointmentStatus;
  },
  actorUserId: string
) {
  // Verify appointment exists and belongs to tenant
  const existingAppointment = await prisma.crmAppointment.findFirst({
    where: {
      id: appointmentId,
      tenantId
    }
  });

  if (!existingAppointment) {
    throw new Error('Appointment not found');
  }

  // Validate date range if both dates are provided
  if (data.startAt && data.endAt && data.endAt <= data.startAt) {
    throw new Error('End time must be after start time');
  }

  // If only endAt is provided (resize), validate against existing startAt
  if (data.endAt && !data.startAt && data.endAt <= existingAppointment.startAt) {
    throw new Error('End time must be after start time');
  }

  // If only startAt is provided, validate against existing endAt
  if (data.startAt && !data.endAt && data.startAt >= existingAppointment.endAt) {
    throw new Error('Start time must be before end time');
  }

  const updatedAppointment = await prisma.crmAppointment.update({
    where: { id: appointmentId },
    data: {
      ...(data.startAt && { startAt: data.startAt }),
      ...(data.endAt && { endAt: data.endAt }),
      ...(data.location !== undefined && { location: data.location }),
      ...(data.assignedToUserId !== undefined && { assignedToUserId: data.assignedToUserId }),
      ...(data.status && { status: data.status })
    },
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
      collaborators: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
              avatarUrl: true
            }
          }
        }
      }
    }
  });

  logger.info('CRM appointment updated', {
    appointmentId,
    tenantId,
    changes: Object.keys(data)
  });

  // Audit log
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: 'CRM_APPOINTMENT_UPDATED',
    entityType: 'APPOINTMENT',
    entityId: appointmentId,
    payload: {
      previousData: {
        startAt: existingAppointment.startAt,
        endAt: existingAppointment.endAt,
        location: existingAppointment.location,
        assignedToUserId: existingAppointment.assignedToUserId,
        status: existingAppointment.status
      },
      newData: data
    }
  });

  return updatedAppointment;
}
