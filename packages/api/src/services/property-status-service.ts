import { prisma, type PrismaTransactionClient } from '../utils/database';
import { logger } from '../utils/logger';
import { logAuditEvent, recordAuditEvent } from './audit-service';
import { PROPERTY_ENTITY_TYPES } from '../types/audit-types';
import { AuditActionKey } from '../types/audit-types';
import { PropertyStatus, PropertyOwnershipType, PropertyAvailability } from '@prisma/client';
import { getPropertyById } from './property-service';
import { syncLotActivationsTx } from './lot-registry-service';
import { t } from '../i18n';
import { NotFoundError } from '../middleware/error-middleware';

/**
 * Valid status transitions
 */
const ALLOWED_TRANSITIONS: Record<PropertyStatus, PropertyStatus[]> = {
  [PropertyStatus.DRAFT]: [
    PropertyStatus.UNDER_REVIEW,
    PropertyStatus.AVAILABLE,
    PropertyStatus.RENTED,
    PropertyStatus.ARCHIVED
  ],
  [PropertyStatus.UNDER_REVIEW]: [
    PropertyStatus.DRAFT,
    PropertyStatus.AVAILABLE,
    PropertyStatus.RENTED,
    PropertyStatus.ARCHIVED
  ],
  [PropertyStatus.AVAILABLE]: [
    PropertyStatus.RESERVED,
    PropertyStatus.UNDER_OFFER,
    PropertyStatus.RENTED,
    PropertyStatus.SOLD,
    PropertyStatus.ARCHIVED
  ],
  [PropertyStatus.RESERVED]: [
    PropertyStatus.AVAILABLE,
    PropertyStatus.UNDER_OFFER,
    PropertyStatus.RENTED,
    PropertyStatus.ARCHIVED
  ],
  [PropertyStatus.UNDER_OFFER]: [
    PropertyStatus.AVAILABLE,
    PropertyStatus.RENTED,
    PropertyStatus.SOLD,
    PropertyStatus.ARCHIVED
  ],
  [PropertyStatus.RENTED]: [PropertyStatus.AVAILABLE, PropertyStatus.ARCHIVED],
  [PropertyStatus.SOLD]: [PropertyStatus.AVAILABLE, PropertyStatus.ARCHIVED],
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
 * @param client - Client de transaction optionnel : l'ecriture, le decompte des lots
 *   et l'historique s'executent alors dans la transaction de l'appelant (pas de
 *   transaction imbriquee) ; un echec remonte et l'annule.
 * @returns Updated property with status history
 */
export async function updatePropertyStatus(
  propertyId: string,
  newStatus: PropertyStatus,
  tenantId?: string | null,
  userId?: string | null,
  actorUserId?: string,
  notes?: string,
  client?: PrismaTransactionClient
) {
  // Get property with current status. Dans la transaction de l'appelant, la
  // lecture passe par son client (pas par le prisma global) : on voit ses
  // ecritures non validees et on ne sort pas de la transaction.
  const property = client
    ? await getPropertyForStatusTx(client, propertyId, tenantId, userId)
    : await getPropertyById(propertyId, tenantId, userId);

  if (!property) {
    throw new NotFoundError(t('Bien introuvable ou accès refusé'));
  }

  // Check permission (simplified - in production, use RBAC service)
  const hasPermission = true; // TODO: Check actual permission

  // Validate transition
  const validation = validateStatusTransition(property.status, newStatus, property.ownershipType, hasPermission);

  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid status transition');
  }

  // When status becomes RENTED or SOLD, set availability to UNAVAILABLE for consistency
  const updateData: { status: PropertyStatus; version: { increment: number }; availability?: PropertyAvailability } = {
    status: newStatus,
    version: { increment: 1 }
  };
  if (newStatus === PropertyStatus.RENTED || newStatus === PropertyStatus.SOLD) {
    updateData.availability = PropertyAvailability.UNAVAILABLE;
  } else if (newStatus === PropertyStatus.AVAILABLE) {
    updateData.availability = PropertyAvailability.AVAILABLE;
  }

  // Sortie de brouillon, archivage, vente : le decompte des lots de
  // l'abonnement (D1) suit dans la meme transaction.
  const lotTenantId = tenantId || property.tenantId || null;
  const run = async (tx: PrismaTransactionClient) => {
    const row = await tx.property.update({
      where: { id: propertyId },
      data: updateData
    });
    if (lotTenantId) {
      await syncLotActivationsTx(
        tx,
        lotTenantId,
        { propertyIds: [propertyId] },
        {
          actorUserId: actorUserId ?? userId ?? null,
          reason: `PROPERTY_${newStatus}`
        }
      );
    }
    return row;
  };
  const updated = client ? await run(client) : await prisma.$transaction(async tx => run(tx));

  // Record status history (immutable)
  await recordStatusHistory(
    propertyId,
    property.status,
    newStatus,
    actorUserId || userId || '',
    notes,
    property.tenantId,
    client
  );

  logger.info('Property status updated', {
    propertyId,
    previousStatus: property.status,
    newStatus,
    changedBy: actorUserId || userId
  });

  // Audit log : dans la transaction de l'appelant quand il en fournit une (la
  // trace suit le commit ou le rollback), sinon file asynchrone habituelle.
  if (actorUserId) {
    const auditEntry = {
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
    };
    if (client) {
      await recordAuditEvent(client, auditEntry);
    } else {
      logAuditEvent(auditEntry);
    }
  }

  return updated;
}

/**
 * Lecture du bien pour un changement de statut, via le client de transaction
 * de l'appelant. Meme controle d'acces que `getPropertyById` (bien de l'agence
 * ou mandat actif ; sans agence, proprietaire ou bien public publie).
 */
async function getPropertyForStatusTx(
  client: PrismaTransactionClient,
  propertyId: string,
  tenantId?: string | null,
  userId?: string | null
) {
  const property = await client.property.findUnique({
    where: { id: propertyId },
    include: { mandates: { where: { isActive: true }, select: { tenantId: true } } }
  });
  if (!property) return null;
  const mandateTenantIds = property.mandates.map(mandate => mandate.tenantId);
  let allowed: boolean;
  if (tenantId) {
    allowed = property.tenantId === tenantId || mandateTenantIds.includes(tenantId);
  } else if (property.ownershipType === PropertyOwnershipType.PUBLIC) {
    allowed = Boolean(userId && property.ownerUserId === userId) || property.isPublished;
  } else {
    allowed = Boolean(userId && property.ownerUserId === userId);
  }
  return allowed ? property : null;
}

/**
 * Record status history (immutable)
 * @param propertyId - Property ID
 * @param previousStatus - Previous status
 * @param newStatus - New status
 * @param changedByUserId - User who changed the status
 * @param notes - Optional notes
 * @param tenantId - Tenant owning the property (denormalised for scoping)
 * @returns Created history record
 */
export async function recordStatusHistory(
  propertyId: string,
  previousStatus: PropertyStatus | null,
  newStatus: PropertyStatus,
  changedByUserId: string,
  notes?: string,
  tenantId?: string | null,
  client?: PrismaTransactionClient
) {
  const history = await (client ?? prisma).propertyStatusHistory.create({
    data: {
      propertyId,
      tenantId: tenantId ?? null,
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
 *
 * The route (`GET /tenants/:tenantId/properties/:id/status/history`) is
 * protected only by `enforcePropertyTenantIsolation`, which checks that a
 * tenant context exists, not that `:id` belongs to it (same gap fixed for
 * property mandates). Without this check here, any authenticated user could
 * read another agency's property status history by id.
 * @param propertyId - Property ID
 * @param tenantId - Tenant the caller is authorised for
 * @param limit - Maximum number of records to return (default: 50)
 * @returns List of status history records
 */
export async function getStatusHistory(propertyId: string, tenantId: string, limit: number = 50) {
  const property = await getPropertyById(propertyId, tenantId);
  if (!property) {
    throw new NotFoundError(t('Bien introuvable ou accès refusé'));
  }

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
