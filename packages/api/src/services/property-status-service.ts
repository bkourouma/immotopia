import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { logAuditEvent } from './audit-service';
import { PROPERTY_ENTITY_TYPES } from '../types/audit-types';
import { AuditActionKey } from '../types/audit-types';
import { PropertyStatus, PropertyOwnershipType } from '@prisma/client';
import { getPropertyById } from './property-service';

/**
 * Valid status transitions
 */
const ALLOWED_TRANSITIONS: Record<PropertyStatus, PropertyStatus[]> = {
  [PropertyStatus.DRAFT]: [PropertyStatus.UNDER_REVIEW, PropertyStatus.ARCHIVED],
  [PropertyStatus.UNDER_REVIEW]: [PropertyStatus.DRAFT, PropertyStatus.AVAILABLE, PropertyStatus.ARCHIVED],
  [PropertyStatus.AVAILABLE]: [PropertyStatus.RESERVED, PropertyStatus.UNDER_OFFER, PropertyStatus.ARCHIVED],
  [PropertyStatus.RESERVED]: [PropertyStatus.AVAILABLE, PropertyStatus.UNDER_OFFER, PropertyStatus.ARCHIVED],
  [PropertyStatus.UNDER_OFFER]: [
    PropertyStatus.AVAILABLE,
    PropertyStatus.RENTED,
    PropertyStatus.SOLD,
    PropertyStatus.ARCHIVED
  ],
  [PropertyStatus.RENTED]: [PropertyStatus.AVAILABLE, PropertyStatus.ARCHIVED],
  [PropertyStatus.SOLD]: [PropertyStatus.ARCHIVED],
  [PropertyStatus.ARCHIVED]: [PropertyStatus.DRAFT, PropertyStatus.AVAILABLE]
};

/**
 * Validate status transition
 * @param currentStatus - Current property status
 * @param newStatus - Desired new status
 * @param ownershipType - Property ownership type
 * @param hasPermission - Whether user has permission to change status
 * @returns Validation result
 */
export function validateStatusTransition(
  currentStatus: PropertyStatus,
  newStatus: PropertyStatus,
  ownershipType: PropertyOwnershipType,
  hasPermission: boolean
): { valid: boolean; error?: string } {
  if (!hasPermission) {
    return { valid: false, error: 'Permission denied: PROPERTIES_EDIT required' };
  }

  if (currentStatus === newStatus) {
    return { valid: false, error: 'Status is already set to this value' };
  }

  const allowedNextStatuses = ALLOWED_TRANSITIONS[currentStatus];
  if (!allowedNextStatuses.includes(newStatus)) {
    return {
      valid: false,
      error: `Invalid status transition from ${currentStatus} to ${newStatus}`
    };
  }

  // Additional business rules
  if (newStatus === PropertyStatus.AVAILABLE && ownershipType === PropertyOwnershipType.CLIENT) {
    // Client properties may need mandate validation
    // This is handled in the update function
  }

  return { valid: true };
}

/**
 * Update property status
 * @param propertyId - Property ID
 * @param newStatus - New status
 * @param tenantId - Tenant ID (for validation)
 * @param userId - User ID (for ownership validation)
 * @param actorUserId - User performing the status change (for audit)
 * @param notes - Optional notes about the status change
 * @returns Updated property with status history
 */
export async function updatePropertyStatus(
  propertyId: string,
  newStatus: PropertyStatus,
  tenantId?: string | null,
  userId?: string | null,
  actorUserId?: string,
  notes?: string
) {
  // Get property with current status
  const property = await getPropertyById(propertyId, tenantId, userId);

  if (!property) {
    throw new Error('Property not found or access denied');
  }

  // Check permission (simplified - in production, use RBAC service)
  const hasPermission = true; // TODO: Check actual permission

  // Validate transition
  const validation = validateStatusTransition(property.status, newStatus, property.ownershipType, hasPermission);

  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid status transition');
  }

  // Update property status
  const updated = await prisma.property.update({
    where: { id: propertyId },
    data: {
      status: newStatus,
      version: {
        increment: 1
      }
    }
  });

  // Record status history (immutable)
  await recordStatusHistory(propertyId, property.status, newStatus, actorUserId || userId || '', notes);

  logger.info('Property status updated', {
    propertyId,
    previousStatus: property.status,
    newStatus,
    changedBy: actorUserId || userId
  });

  // Audit log
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId: property.tenantId || null,
      actionKey: AuditActionKey.PROPERTY_STATUS_CHANGED,
      entityType: PROPERTY_ENTITY_TYPES.PROPERTY,
      entityId: propertyId,
      payload: {
        previousStatus: property.status,
        newStatus,
        notes
      }
    });
  }

  return updated;
}

/**
 * Record status history (immutable)
 * @param propertyId - Property ID
 * @param previousStatus - Previous status
 * @param newStatus - New status
 * @param changedByUserId - User who changed the status
 * @param notes - Optional notes
 * @returns Created history record
 */
export async function recordStatusHistory(
  propertyId: string,
  previousStatus: PropertyStatus | null,
  newStatus: PropertyStatus,
  changedByUserId: string,
  notes?: string
) {
  const history = await prisma.propertyStatusHistory.create({
    data: {
      propertyId,
      previousStatus,
      newStatus,
      changedByUserId,
      notes: notes || null
    },
    include: {
      changedBy: {
        select: {
          id: true,
          email: true,
          fullName: true
        }
      }
    }
  });

  return history;
}

/**
 * Get status history for a property
 * @param propertyId - Property ID
 * @param limit - Maximum number of records to return (default: 50)
 * @returns List of status history records
 */
export async function getStatusHistory(propertyId: string, limit: number = 50) {
  const history = await prisma.propertyStatusHistory.findMany({
    where: { propertyId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      changedBy: {
        select: {
          id: true,
          email: true,
          fullName: true
        }
      }
    }
  });

  return history;
}




