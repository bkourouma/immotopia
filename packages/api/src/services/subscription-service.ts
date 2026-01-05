import { prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { SubscriptionPlan, BillingCycle, SubscriptionStatus } from '@prisma/client';
import { CreateSubscriptionRequest, UpdateSubscriptionRequest } from '../types/subscription-types';
import { logAuditEvent, AuditActionKey } from './audit-service';

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

  // Set default dates if not provided
  const startAt = data.startAt || new Date();
  const currentPeriodStart = data.currentPeriodStart || startAt;
  const currentPeriodEnd = data.currentPeriodEnd || calculatePeriodEnd(currentPeriodStart, data.billingCycle);

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
      metadata: data.metadata || {}
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

  // Update subscription
  const updated = await prisma.subscription.update({
    where: { tenantId },
    data: {
      planKey: data.planKey,
      billingCycle: data.billingCycle,
      status: data.status,
      cancelAt: data.cancelAt,
      metadata: data.metadata,
      // Update period end if billing cycle changed
      ...(data.billingCycle && data.billingCycle !== subscription.billingCycle
        ? {
            currentPeriodEnd: calculatePeriodEnd(subscription.currentPeriodStart, data.billingCycle)
          }
        : {}),
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

  const updated = await prisma.subscription.update({
    where: { tenantId },
    data: {
      status: SubscriptionStatus.CANCELED,
      cancelAt: cancellationDate,
      canceledAt: new Date()
    }
  });

  logger.info('Subscription canceled', {
    subscriptionId: updated.id,
    tenantId,
    cancelAt: cancellationDate
  });

  // Audit log
  if (actorUserId) {
    logAuditEvent({
      actorUserId,
      tenantId,
      actionKey: AuditActionKey.SUBSCRIPTION_CANCELED,
      entityType: 'Subscription',
      entityId: updated.id,
      payload: {
        cancelAt: cancellationDate
      }
    });
  }

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

/**
 * Calculate period end date based on billing cycle
 */
function calculatePeriodEnd(startDate: Date, billingCycle: BillingCycle): Date {
  const endDate = new Date(startDate);
  if (billingCycle === BillingCycle.MONTHLY) {
    endDate.setMonth(endDate.getMonth() + 1);
  } else if (billingCycle === BillingCycle.ANNUAL) {
    endDate.setFullYear(endDate.getFullYear() + 1);
  }
  return endDate;
}
