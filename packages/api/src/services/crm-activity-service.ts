import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { logAuditEvent } from './audit-service';
import { CRM_ENTITY_TYPES } from '../types/audit-types';
import { CreateActivityRequest, ActivityFilters } from '../types/crm-types';
import { CrmActivityType } from '@prisma/client';
import { updateLastInteractionAt } from './crm-contact-service';

/**
 * Create a new activity (immutable - no update/delete)
 * @param tenantId - Tenant ID (required for isolation)
 * @param data - Activity creation data
 * @param actorUserId - User creating the activity (for audit)
 * @returns Created activity
 */
export async function createActivity(tenantId: string, data: CreateActivityRequest, actorUserId: string) {
  // Enforce that contactId is required
  if (!data.contactId) {
    throw new Error('Contact ID is required');
  }

  // Verify contact exists and belongs to tenant (if provided)
  if (data.contactId) {
    const contact = await prisma.crmContact.findFirst({
      where: {
        id: data.contactId,
        tenantId
      }
    });

    if (!contact) {
      throw new Error('Contact not found');
    }
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

  // Verify correction activity references valid activity
  if (data.correctionOfId) {
    const correctionOf = await prisma.crmActivity.findFirst({
      where: {
        id: data.correctionOfId,
        tenantId
      }
    });

    if (!correctionOf) {
      throw new Error('Activity to correct not found');
    }

    // Correction activities must be of type CORRECTION
    if (data.activityType !== CrmActivityType.CORRECTION) {
      throw new Error('Correction activities must have activityType CORRECTION');
    }
  }

  // Create activity
  const activity = await prisma.crmActivity.create({
    data: {
      tenantId,
      contactId: data.contactId || null,
      dealId: data.dealId || null,
      activityType: data.activityType,
      direction: data.direction || null,
      subject: data.subject || null,
      content: data.content,
      outcome: data.outcome || null,
      occurredAt: data.occurredAt || new Date(),
      createdByUserId: actorUserId,
      nextActionAt: data.nextActionAt || null,
      nextActionType: data.nextActionType || null,
      correctionOfId: data.correctionOfId || null
    },
    include: {
      createdBy: {
        select: {
          id: true,
          email: true,
          fullName: true
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
      }
    }
  });

  // Update contact's last interaction timestamp
  if (data.contactId) {
    await updateLastInteractionAt(tenantId, data.contactId);
  }

  logger.info('CRM activity created', {
    activityId: activity.id,
    tenantId,
    activityType: data.activityType,
    contactId: data.contactId,
    dealId: data.dealId
  });

  // Audit log
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: 'CRM_ACTIVITY_CREATED',
    entityType: CRM_ENTITY_TYPES.ACTIVITY,
    entityId: activity.id,
    payload: {
      activityType: data.activityType,
      contactId: data.contactId,
      dealId: data.dealId,
      correctionOfId: data.correctionOfId
    }
  });

  return activity;
}

/**
 * List activities with filtering and pagination
 * @param tenantId - Tenant ID (required for isolation)
 * @param filters - Filter criteria
 * @returns Paginated activities
 */
export async function listActivities(tenantId: string, filters: ActivityFilters) {
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

  if (filters.type) {
    where.activityType = filters.type;
  }

  if (filters.createdBy) {
    where.createdByUserId = filters.createdBy;
  }

  // Date range filter for occurredAt
  if (filters.startDate || filters.endDate) {
    where.occurredAt = {};
    if (filters.startDate) {
      where.occurredAt.gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      // Add one day to include the entire end date
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999);
      where.occurredAt.lte = endDate;
    }
  }

  // Get total count
  const total = await prisma.crmActivity.count({ where });

  // Get activities
  const activities = await prisma.crmActivity.findMany({
    where,
    skip,
    take: limit,
    orderBy: {
      occurredAt: 'desc'
    },
    include: {
      createdBy: {
        select: {
          id: true,
          email: true,
          fullName: true
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
      corrections: {
        take: 5,
        orderBy: {
          createdAt: 'desc'
        }
      }
    }
  });

  return {
    activities,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

/**
 * Get activity timeline for a contact or deal
 * @param tenantId - Tenant ID
 * @param contactId - Optional contact ID
 * @param dealId - Optional deal ID
 * @param limit - Maximum number of activities to return
 * @returns Activities in chronological order
 */
export async function getActivityTimeline(tenantId: string, contactId?: string, dealId?: string, limit: number = 50) {
  const where: any = {
    tenantId
    // contactId is now required, so we don't need to check for null
  };

  if (contactId) {
    where.AND.push({ contactId });
  }

  if (dealId) {
    where.AND.push({ dealId });
  }

  const activities = await prisma.crmActivity.findMany({
    where,
    take: limit,
    orderBy: {
      occurredAt: 'asc' // Chronological order
    },
    include: {
      createdBy: {
        select: {
          id: true,
          email: true,
          fullName: true
        }
      },
      corrections: {
        orderBy: {
          createdAt: 'desc'
        }
      }
    }
  });

  return activities;
}

/**
 * Create a correction activity
 * @param tenantId - Tenant ID
 * @param originalActivityId - ID of activity being corrected
 * @param data - Correction activity data
 * @param actorUserId - User creating the correction
 * @returns Created correction activity
 */
export async function createCorrectionActivity(
  tenantId: string,
  originalActivityId: string,
  data: Omit<CreateActivityRequest, 'correctionOfId' | 'activityType'>,
  actorUserId: string
) {
  return createActivity(
    tenantId,
    {
      ...data,
      activityType: CrmActivityType.CORRECTION,
      correctionOfId: originalActivityId
    },
    actorUserId
  );
}

/**
 * Update next_action_at for an activity (for rescheduling follow-ups)
 * @param tenantId - Tenant ID
 * @param activityId - Activity ID
 * @param nextActionAt - New next action date/time
 * @param actorUserId - User rescheduling the follow-up (for audit)
 * @returns Updated activity
 */
export async function rescheduleFollowUp(
  tenantId: string,
  activityId: string,
  nextActionAt: Date,
  actorUserId: string
) {
  // Verify activity exists and belongs to tenant
  const existingActivity = await prisma.crmActivity.findFirst({
    where: {
      id: activityId,
      tenantId
    }
  });

  if (!existingActivity) {
    throw new Error('Activity not found');
  }

  const updatedActivity = await prisma.crmActivity.update({
    where: { id: activityId },
    data: {
      nextActionAt
    },
    include: {
      createdBy: {
        select: {
          id: true,
          email: true,
          fullName: true
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
      }
    }
  });

  logger.info('CRM follow-up rescheduled', {
    activityId,
    tenantId,
    previousNextActionAt: existingActivity.nextActionAt,
    newNextActionAt: nextActionAt
  });

  // Audit log
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: 'CRM_FOLLOWUP_RESCHEDULED',
    entityType: CRM_ENTITY_TYPES.ACTIVITY,
    entityId: activityId,
    payload: {
      previousNextActionAt: existingActivity.nextActionAt,
      newNextActionAt: nextActionAt
    }
  });

  return updatedActivity;
}

/**
 * Mark follow-up as done (clear next_action_at)
 * @param tenantId - Tenant ID
 * @param activityId - Activity ID
 * @param actorUserId - User marking the follow-up as done (for audit)
 * @returns Updated activity
 */
export async function markFollowUpDone(tenantId: string, activityId: string, actorUserId: string) {
  // Verify activity exists and belongs to tenant
  const existingActivity = await prisma.crmActivity.findFirst({
    where: {
      id: activityId,
      tenantId
    }
  });

  if (!existingActivity) {
    throw new Error('Activity not found');
  }

  const updatedActivity = await prisma.crmActivity.update({
    where: { id: activityId },
    data: {
      nextActionAt: null
    },
    include: {
      createdBy: {
        select: {
          id: true,
          email: true,
          fullName: true
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
      }
    }
  });

  logger.info('CRM follow-up marked as done', {
    activityId,
    tenantId
  });

  // Audit log
  logAuditEvent({
    actorUserId,
    tenantId,
    actionKey: 'CRM_FOLLOWUP_MARKED_DONE',
    entityType: CRM_ENTITY_TYPES.ACTIVITY,
    entityId: activityId,
    payload: {
      previousNextActionAt: existingActivity.nextActionAt
    }
  });

  return updatedActivity;
}
