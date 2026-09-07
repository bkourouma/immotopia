import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { logAuditEvent } from './audit-service';
import { CRM_ENTITY_TYPES } from '../types/audit-types';
import { CreateDealRequest, UpdateDealRequest, DealFilters, DealDetail } from '../types/crm-types';
import { CrmDealStage } from '@prisma/client';

/**
 * Create a new deal
 * @param tenantId - Tenant ID (required for isolation)
 * @param data - Deal creation data
 * @param actorUserId - User creating the deal (for audit)
 * @returns Created deal
 */
export async function createDeal(tenantId: string, data: CreateDealRequest, actorUserId?: string) {
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

  // Create deal with default NEW stage
  const deal = await prisma.crmDeal.create({
    data: {
      tenantId,
      contactId: data.contactId,
      type: data.type,
      stage: CrmDealStage.NEW,
      budgetMin: data.budgetMin ? data.budgetMin : null,
      budgetMax: data.budgetMax ? data.budgetMax : null,
      locationZone: data.locationZone || null,
      criteriaJson: data.criteriaJson || null,
      expectedValue: data.expectedValue ? data.expectedValue : null,
      assignedToUserId: data.assignedToUserId || null,
      version: 1 // Initial version for optimistic locking
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
      assignedTo: {
        select: {
          id: true,
          email: true,
          fullName: true
        }
      }
    }
  });

  logger.info('CRM deal created', {
    dealId: deal.id,
    tenantId,
    contactId: data.contactId,
    type: data.type
  });

  // Audit log
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: 'CRM_DEAL_CREATED',
      entityType: CRM_ENTITY_TYPES.DEAL,
      entityId: deal.id,
      payload: {
        contactId: data.contactId,
        type: data.type,
        stage: CrmDealStage.NEW
      }
    });
  }

  // Les emails (DEAL_CREATED) seraient gérés par "Notifications email" (email_notification_configs) si un flux dédié est ajouté. Pas de triggerEvent (Règles/Templates).

  return deal;
}

/**
 * Get deal by ID with full details
 * @param tenantId - Tenant ID (required for isolation)
 * @param dealId - Deal ID
 * @returns Deal detail with relationships
 */
export async function getDealById(tenantId: string, dealId: string): Promise<DealDetail | null> {
  const deal = await prisma.crmDeal.findFirst({
    where: {
      id: dealId,
      tenantId // Enforce tenant isolation
    },
    include: {
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
      activities: {
        take: 10,
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
          }
        }
      },
      propertyMatches: {
        orderBy: {
          matchScore: 'desc'
        },
        include: {
          sourceOwner: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          }
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

  return deal;
}

/**
 * List deals with filtering and pagination
 * @param tenantId - Tenant ID (required for isolation)
 * @param filters - Filter criteria
 * @returns Paginated deals
 */
export async function listDeals(tenantId: string, filters: DealFilters) {
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const skip = (page - 1) * limit;

  // Build where clause
  const where: any = {
    tenantId // Always enforce tenant isolation
  };

  if (filters.type) {
    where.type = filters.type;
  }

  if (filters.stage) {
    where.stage = filters.stage;
  }

  if (filters.assignedTo) {
    where.assignedToUserId = filters.assignedTo;
  }

  if (filters.contactId) {
    where.contactId = filters.contactId;
  }

  if (filters.budgetMin || filters.budgetMax) {
    const budgetConditions: any[] = [];

    if (filters.budgetMin && filters.budgetMax) {
      // Deal budget overlaps with filter range if:
      // - budgetMin is within range OR
      // - budgetMax is within range OR
      // - deal range contains filter range
      budgetConditions.push({
        AND: [{ budgetMin: { lte: filters.budgetMax } }, { budgetMax: { gte: filters.budgetMin } }]
      });
      // Also include deals with only budgetMin or budgetMax
      budgetConditions.push({
        AND: [{ budgetMin: { gte: filters.budgetMin, lte: filters.budgetMax } }, { budgetMax: null }]
      });
      budgetConditions.push({
        AND: [{ budgetMin: null }, { budgetMax: { gte: filters.budgetMin, lte: filters.budgetMax } }]
      });
    } else if (filters.budgetMin) {
      // Deal has budgetMax >= filterMin OR budgetMin >= filterMin
      budgetConditions.push({ budgetMax: { gte: filters.budgetMin } });
      budgetConditions.push({ budgetMin: { gte: filters.budgetMin } });
    } else if (filters.budgetMax) {
      // Deal has budgetMin <= filterMax OR budgetMax <= filterMax
      budgetConditions.push({ budgetMin: { lte: filters.budgetMax } });
      budgetConditions.push({ budgetMax: { lte: filters.budgetMax } });
    }

    if (budgetConditions.length > 0) {
      where.AND = where.AND || [];
      where.AND.push({ OR: budgetConditions });
    }
  }

  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) {
      where.createdAt.gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      where.createdAt.lte = new Date(filters.endDate);
    }
  }

  // Get total count
  const total = await prisma.crmDeal.count({ where });

  // Get deals
  const deals = await prisma.crmDeal.findMany({
    where,
    skip,
    take: limit,
    orderBy: {
      createdAt: 'desc'
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
      assignedTo: {
        select: {
          id: true,
          email: true,
          fullName: true
        }
      }
    }
  });

  return {
    deals,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

/**
 * Update deal with optimistic locking
 * @param tenantId - Tenant ID (required for isolation)
 * @param dealId - Deal ID
 * @param data - Update data (must include version)
 * @param actorUserId - User updating the deal (for audit)
 * @returns Updated deal
 */
export async function updateDeal(tenantId: string, dealId: string, data: UpdateDealRequest, actorUserId?: string) {
  // Verify deal exists and belongs to tenant
  const existingDeal = await prisma.crmDeal.findFirst({
    where: {
      id: dealId,
      tenantId // Enforce tenant isolation
    }
  });

  if (!existingDeal) {
    throw new Error('Deal not found');
  }

  // Optimistic locking check
  if (data.version !== existingDeal.version) {
    throw new Error('Deal has been modified by another user. Please refresh and try again.');
  }

  // Track changed fields for audit
  const changedFields: Record<string, unknown> = {};
  const previousStage = existingDeal.stage;

  // Build update data
  const updateData: any = {
    version: existingDeal.version + 1 // Increment version
  };

  if (data.type !== undefined) {
    updateData.type = data.type;
    if (data.type !== existingDeal.type) {
      changedFields.type = data.type;
    }
  }
  if (data.stage !== undefined) {
    updateData.stage = data.stage;
    if (data.stage !== existingDeal.stage) {
      changedFields.stage = data.stage;
      changedFields.previousStage = previousStage;
    }
  }
  if (data.budgetMin !== undefined) {
    updateData.budgetMin = data.budgetMin ? data.budgetMin : null;
    if (data.budgetMin !== existingDeal.budgetMin?.toNumber()) {
      changedFields.budgetMin = data.budgetMin;
    }
  }
  if (data.budgetMax !== undefined) {
    updateData.budgetMax = data.budgetMax ? data.budgetMax : null;
    if (data.budgetMax !== existingDeal.budgetMax?.toNumber()) {
      changedFields.budgetMax = data.budgetMax;
    }
  }
  if (data.locationZone !== undefined) {
    updateData.locationZone = data.locationZone || null;
    if (data.locationZone !== existingDeal.locationZone) {
      changedFields.locationZone = data.locationZone;
    }
  }
  if (data.criteriaJson !== undefined) {
    updateData.criteriaJson = data.criteriaJson || null;
    changedFields.criteriaJson = data.criteriaJson;
  }
  if (data.expectedValue !== undefined) {
    updateData.expectedValue = data.expectedValue ? data.expectedValue : null;
    if (data.expectedValue !== existingDeal.expectedValue?.toNumber()) {
      changedFields.expectedValue = data.expectedValue;
    }
  }
  if (data.probability !== undefined) {
    updateData.probability = data.probability;
    if (data.probability !== existingDeal.probability) {
      changedFields.probability = data.probability;
    }
  }
  if (data.assignedToUserId !== undefined) {
    updateData.assignedToUserId = data.assignedToUserId || null;
    if (data.assignedToUserId !== existingDeal.assignedToUserId) {
      changedFields.assignedToUserId = data.assignedToUserId;
    }
  }

  // Handle stage transitions to WON/LOST
  if (data.stage === CrmDealStage.WON || data.stage === CrmDealStage.LOST) {
    updateData.closedAt = new Date();
    if (data.closedReason) {
      updateData.closedReason = data.closedReason;
      changedFields.closedReason = data.closedReason;
    }
  } else if (existingDeal.stage === CrmDealStage.WON || existingDeal.stage === CrmDealStage.LOST) {
    // Reopening a closed deal
    updateData.closedAt = null;
    updateData.closedReason = null;
  }

  // Update deal
  const updatedDeal = await prisma.crmDeal.update({
    where: { id: dealId },
    data: updateData,
    include: {
      contact: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true
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

  logger.info('CRM deal updated', {
    dealId,
    tenantId,
    changedFields: Object.keys(changedFields),
    stageChanged: data.stage !== undefined && data.stage !== previousStage
  });

  // Audit log
  if (actorUserId) {
    const actionKey =
      data.stage !== undefined && data.stage !== previousStage ? 'CRM_DEAL_STAGE_CHANGED' : 'CRM_DEAL_UPDATED';

    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey,
      entityType: CRM_ENTITY_TYPES.DEAL,
      entityId: dealId,
      payload: changedFields
    });
  }

  // Les emails (DEAL_STAGE_CHANGED) seraient gérés par "Notifications email" (email_notification_configs) si un flux dédié est ajouté. Pas de triggerEvent (Règles/Templates).

  return updatedDeal;
}

/**
 * Update deal stage (convenience function)
 * @param tenantId - Tenant ID
 * @param dealId - Deal ID
 * @param stage - New stage
 * @param actorUserId - User changing the stage (for audit)
 * @returns Updated deal
 */
export async function updateDealStage(tenantId: string, dealId: string, stage: CrmDealStage, actorUserId?: string) {
  // Get current deal to get version
  const currentDeal = await prisma.crmDeal.findFirst({
    where: {
      id: dealId,
      tenantId
    }
  });

  if (!currentDeal) {
    throw new Error('Deal not found');
  }

  return updateDeal(
    tenantId,
    dealId,
    {
      stage,
      version: currentDeal.version
    },
    actorUserId
  );
}

/**
 * Close deal (mark as WON or LOST)
 * @param tenantId - Tenant ID
 * @param dealId - Deal ID
 * @param stage - WON or LOST
 * @param closedReason - Reason for closing
 * @param actorUserId - User closing the deal (for audit)
 * @returns Updated deal
 */
export async function closeDeal(
  tenantId: string,
  dealId: string,
  stage: CrmDealStage.WON | CrmDealStage.LOST,
  closedReason?: string,
  actorUserId?: string
) {
  // Get current deal to get version
  const currentDeal = await prisma.crmDeal.findFirst({
    where: {
      id: dealId,
      tenantId
    }
  });

  if (!currentDeal) {
    throw new Error('Deal not found');
  }

  return updateDeal(
    tenantId,
    dealId,
    {
      stage,
      closedReason: closedReason || null,
      version: currentDeal.version
    },
    actorUserId
  );
}
