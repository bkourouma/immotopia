import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import { CreateSubscriptionRequest, UpdateSubscriptionRequest } from '../types/subscription-types';
import { ConflictError } from '../middleware/error-middleware';
import { t } from '../i18n';
import { BILLING_ANCHOR_METADATA_KEY, addBillingPeriod, withBillingAnchorDay } from '../lib/subscription';
import { logAuditEvent, recordAuditEvent, AuditActionKey } from './audit-service';

/**
 * Metadata fourni par l'appelant sans la cle reservee a la facturation : le jour
 * d'ancrage n'est pose que par le flux de renouvellement, jamais par une saisie.
 */
function stripReservedMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...metadata };
  delete rest[BILLING_ANCHOR_METADATA_KEY];
  return rest;
}

/**
 * Create a subscription for a tenant
 * @param data - Subscription creation data
 * @param actorUserId - User creating the subscription (for audit)
 * @returns Created subscription
 */
export async function createSubscription(data: CreateSubscriptionRequest, actorUserId?: string) {
  // Verify tenant exists
  const tenant = await prisma.tenant.findUnique({
    where: { id: data.tenantId }
  });

  if (!tenant) {
    throw new Error('Tenant introuvable.');
  }

  // Check if subscription already exists
  const existing = await prisma.subscription.findUnique({
    where: { tenantId: data.tenantId }
  });

  if (existing) {
    throw new Error('Ce tenant a déjà un abonnement.');
  }

  // Dates par defaut. Le controleur transmet les dates validees en chaines ISO :
  // elles sont normalisees ici avant tout calcul.
  const startAt = data.startAt ? new Date(data.startAt) : new Date();
  const currentPeriodStart = data.currentPeriodStart ? new Date(data.currentPeriodStart) : startAt;
  // Fin de periode en UTC (fin de mois : 31/01 -> 28/02, jamais 03/03).
  const computedPeriodEnd = addBillingPeriod(currentPeriodStart, data.billingCycle);
  const currentPeriodEnd = data.currentPeriodEnd ? new Date(data.currentPeriodEnd) : computedPeriodEnd;
  // Ancre (> 28) memorisee des la creation pour retrouver le 31 apres fevrier.
  // Seulement si la fin est bien un cycle calendaire depuis le debut : une fin
  // saisie a une autre date garde l'ancre lue au renouvellement (jour de fin).
  const baseMetadata = stripReservedMetadata(data.metadata || {});
  const anchoredMetadata =
    currentPeriodEnd.getTime() === computedPeriodEnd.getTime()
      ? withBillingAnchorDay(baseMetadata, currentPeriodStart.getUTCDate())
      : undefined;

  // Create subscription
  const subscription = await prisma.subscription.create({
    data: {
      tenantId: data.tenantId,
      planKey: data.planKey,
      billingCycle: data.billingCycle,
      status: data.status || SubscriptionStatus.TRIALING,
      startAt,
      currentPeriodStart,
      currentPeriodEnd,
      metadata: (anchoredMetadata ?? baseMetadata) as Prisma.InputJsonObject
    }
  });

  logger.info('Subscription created', {
    subscriptionId: subscription.id,
    tenantId: data.tenantId,
    plan: data.planKey
  });

  // Audit log
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId: data.tenantId,
      actionKey: AuditActionKey.SUBSCRIPTION_CREATED,
      entityType: 'Subscription',
      entityId: subscription.id,
      payload: {
        planKey: data.planKey,
        billingCycle: data.billingCycle,
        status: subscription.status
      }
    });
  }

  return subscription;
}

/**
 * Update a subscription
 * @param tenantId - Tenant ID
 * @param data - Update data
 * @param actorUserId - User performing the update (for audit)
 * @returns Updated subscription
 */
export async function updateSubscription(tenantId: string, data: UpdateSubscriptionRequest, actorUserId?: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { tenantId }
  });

  if (!subscription) {
    throw new Error('Abonnement introuvable.');
  }

  // Le cycle n'est jamais modifie par cette route (la periode en cours en depend).
  if (data.billingCycle && data.billingCycle !== subscription.billingCycle) {
    throw new ConflictError(t('Le cycle de facturation (mensuel/annuel) ne peut pas être modifié par cette route.'));
  }

  // billingAnchorDay est reserve : retire de la saisie, puis reinjecte la valeur
  // deja en base (posee par le flux de facturation) si le metadata est remplace.
  const existingMetadata = subscription.metadata as Record<string, unknown> | null;
  const existingAnchor =
    existingMetadata && typeof existingMetadata === 'object'
      ? existingMetadata[BILLING_ANCHOR_METADATA_KEY]
      : undefined;
  const metadata = data.metadata
    ? {
        ...stripReservedMetadata(data.metadata),
        ...(existingAnchor !== undefined ? { [BILLING_ANCHOR_METADATA_KEY]: existingAnchor } : {})
      }
    : undefined;

  // Update subscription (billingCycle volontairement non modifie ici)
  const updated = await prisma.subscription.update({
    where: { tenantId },
    data: {
      planKey: data.planKey,
      status: data.status,
      cancelAt: data.cancelAt,
      metadata: metadata as Prisma.InputJsonObject | undefined,
      // Set canceledAt if status is CANCELED
      ...(data.status === SubscriptionStatus.CANCELED && !subscription.canceledAt ? { canceledAt: new Date() } : {})
    }
  });

  logger.info('Subscription updated', {
    subscriptionId: updated.id,
    tenantId,
    changes: Object.keys(data)
  });

  // Audit log
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: AuditActionKey.SUBSCRIPTION_UPDATED,
      entityType: 'Subscription',
      entityId: updated.id,
      payload: {
        changes: Object.keys(data),
        previousStatus: subscription.status,
        newStatus: updated.status
      }
    });
  }

  return updated;
}

/**
 * Get subscription by tenant ID
 * @param tenantId - Tenant ID
 * @returns Subscription with invoices
 */
export async function getSubscriptionByTenantId(tenantId: string) {
  return prisma.subscription.findUnique({
    where: { tenantId },
    include: {
      invoices: {
        orderBy: { issueDate: 'desc' },
        take: 10 // Last 10 invoices
      }
    }
  });
}

/**
 * Cancel a subscription
 * @param tenantId - Tenant ID
 * @param cancelAt - Optional cancellation date (defaults to end of current period)
 * @param actorUserId - User performing the cancellation (for audit)
 * @returns Updated subscription
 */
export async function cancelSubscription(tenantId: string, cancelAt?: Date, actorUserId?: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { tenantId }
  });

  if (!subscription) {
    throw new Error('Abonnement introuvable.');
  }

  if (subscription.status === SubscriptionStatus.CANCELED) {
    throw new Error('Cet abonnement est déjà annulé.');
  }

  // Set cancel date to end of current period if not provided
  const cancellationDate = cancelAt || subscription.currentPeriodEnd;

  // Critical action: audit trace in the same transaction as the cancellation.
  const updated = await prisma.$transaction(async tx => {
    const result = await tx.subscription.update({
      where: { tenantId },
      data: {
        status: SubscriptionStatus.CANCELED,
        cancelAt: cancellationDate,
        canceledAt: new Date()
      }
    });

    if (actorUserId) {
      await recordAuditEvent(tx, {
        actorUserId,
        tenantId,
        actionKey: AuditActionKey.SUBSCRIPTION_CANCELED,
        entityType: 'Subscription',
        entityId: result.id,
        payload: {
          cancelAt: cancellationDate
        }
      });
    }

    return result;
  });

  logger.info('Subscription canceled', {
    subscriptionId: updated.id,
    tenantId,
    cancelAt: cancellationDate
  });

  return updated;
}

/**
 * Check subscription access (read-only for expired/canceled)
 * @param tenantId - Tenant ID
 * @returns Object with access information
 */
export async function checkSubscriptionAccess(tenantId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { tenantId }
  });

  if (!subscription) {
    return {
      hasAccess: false,
      isReadOnly: true,
      reason: 'No subscription found'
    };
  }

  // Active subscriptions have full access
  if (subscription.status === SubscriptionStatus.ACTIVE) {
    // Check if current period has expired
    if (new Date() > subscription.currentPeriodEnd) {
      return {
        hasAccess: true,
        isReadOnly: true,
        reason: 'Subscription period expired',
        subscription
      };
    }
    return {
      hasAccess: true,
      isReadOnly: false,
      subscription
    };
  }

  // TRIALING subscriptions have full access
  if (subscription.status === SubscriptionStatus.TRIALING) {
    return {
      hasAccess: true,
      isReadOnly: false,
      subscription
    };
  }

  // PAST_DUE, CANCELED, SUSPENDED are read-only
  return {
    hasAccess: true,
    isReadOnly: true,
    reason: `Subscription status: ${subscription.status}`,
    subscription
  };
}
