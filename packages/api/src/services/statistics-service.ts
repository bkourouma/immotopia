import { prisma } from '../utils/database';
import { logger } from '../utils/logger';

/**
 * Global statistics across all tenants
 */
export interface GlobalStatistics {
  totalTenants: number;
  activeTenants: number;
  suspendedTenants: number;
  pendingTenants: number;
  totalCollaborators: number;
  activeCollaborators: number;
  totalSubscriptions: number;
  subscriptionsByPlan: {
    BASIC: number;
    PRO: number;
    ELITE: number;
  };
  subscriptionsByStatus: {
    TRIALING: number;
    ACTIVE: number;
    PAST_DUE: number;
    CANCELED: number;
    SUSPENDED: number;
  };
  moduleActivations: {
    MODULE_AGENCY: number;
    MODULE_SYNDIC: number;
    MODULE_PROMOTER: number;
  };
  recentActivity: {
    tenantsCreatedLast30Days: number;
    lastLoginDate: Date | null;
  };
}

/**
 * Get global statistics across all tenants
 * @returns Global statistics
 */
export async function getGlobalStatistics(): Promise<GlobalStatistics> {
  // Get tenant counts by status
  const [totalTenants, activeTenants, suspendedTenants, pendingTenants] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.count({ where: { status: 'ACTIVE' } }),
    prisma.tenant.count({ where: { status: 'SUSPENDED' } }),
    prisma.tenant.count({ where: { status: 'PENDING' } })
  ]);

  // Get collaborator counts
  const [totalCollaborators, activeCollaborators] = await Promise.all([
    prisma.membership.count(),
    prisma.membership.count({ where: { status: 'ACTIVE' } })
  ]);

  // Get subscription statistics
  const [totalSubscriptions, subscriptionsByPlan, subscriptionsByStatus] = await Promise.all([
    prisma.subscription.count(),
    prisma.subscription.groupBy({
      by: ['planKey'],
      _count: true
    }),
    prisma.subscription.groupBy({
      by: ['status'],
      _count: true
    })
  ]);

  // Get module activation counts
  const moduleActivations = await prisma.tenantModule.groupBy({
    by: ['moduleKey'],
    where: { enabled: true },
    _count: true
  });

  // Get recent activity
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [tenantsCreatedLast30Days, lastLogin] = await Promise.all([
    prisma.tenant.count({
      where: {
        createdAt: {
          gte: thirtyDaysAgo
        }
      }
    }),
    prisma.user.findFirst({
      where: {
        lastLoginAt: { not: null }
      },
      orderBy: {
        lastLoginAt: 'desc'
      },
      select: {
        lastLoginAt: true
      }
    })
  ]);

  // Format subscription by plan
  const subscriptionsByPlanMap = subscriptionsByPlan.reduce(
    (acc, item) => {
      acc[item.planKey] = item._count;
      return acc;
    },
    { BASIC: 0, PRO: 0, ELITE: 0 } as Record<string, number>
  );

  // Format subscription by status
  const subscriptionsByStatusMap = subscriptionsByStatus.reduce(
    (acc, item) => {
      acc[item.status] = item._count;
      return acc;
    },
    {
      TRIALING: 0,
      ACTIVE: 0,
      PAST_DUE: 0,
      CANCELED: 0,
      SUSPENDED: 0
    } as Record<string, number>
  );

  // Format module activations
  const moduleActivationsMap = moduleActivations.reduce(
    (acc, item) => {
      acc[item.moduleKey] = item._count;
      return acc;
    },
    {
      MODULE_AGENCY: 0,
      MODULE_SYNDIC: 0,
      MODULE_PROMOTER: 0
    } as Record<string, number>
  );

  return {
    totalTenants,
    activeTenants,
    suspendedTenants,
    pendingTenants,
    totalCollaborators,
    activeCollaborators,
    totalSubscriptions,
    subscriptionsByPlan: subscriptionsByPlanMap as any,
    subscriptionsByStatus: subscriptionsByStatusMap as any,
    moduleActivations: moduleActivationsMap as any,
    recentActivity: {
      tenantsCreatedLast30Days,
      lastLoginDate: lastLogin?.lastLoginAt || null
    }
  };
}

/**
 * Get tenant activity statistics
 * @param tenantId - Tenant ID
 * @returns Tenant activity statistics
 */
export async function getTenantActivityStats(tenantId: string) {
  const [memberships, modules, subscription, lastLogin] = await Promise.all([
    // Get membership statistics
    prisma.membership.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: true
    }),
    // Get enabled modules
    prisma.tenantModule.findMany({
      where: {
        tenantId,
        enabled: true
      },
      select: {
        moduleKey: true,
        enabledAt: true
      }
    }),
    // Get subscription info
    prisma.subscription.findUnique({
      where: { tenantId },
      select: {
        planKey: true,
        status: true,
        billingCycle: true,
        currentPeriodEnd: true
      }
    }),
    // Get most recent login
    prisma.user.findFirst({
      where: {
        memberships: {
          some: { tenantId }
        },
        lastLoginAt: { not: null }
      },
      orderBy: {
        lastLoginAt: 'desc'
      },
      select: {
        lastLoginAt: true
      }
    })
  ]);

  const activeMembers = memberships.find(m => m.status === 'ACTIVE')?._count || 0;
  const disabledMembers = memberships.find(m => m.status === 'DISABLED')?._count || 0;
  const totalMembers = memberships.reduce((sum, m) => sum + m._count, 0);

  return {
    memberships: {
      total: totalMembers,
      active: activeMembers,
      disabled: disabledMembers
    },
    modules: {
      enabled: modules.length,
      modules: modules.map(m => ({
        key: m.moduleKey,
        enabledAt: m.enabledAt
      }))
    },
    subscription: subscription
      ? {
          plan: subscription.planKey,
          status: subscription.status,
          billingCycle: subscription.billingCycle,
          currentPeriodEnd: subscription.currentPeriodEnd
        }
      : null,
    lastLogin: lastLogin?.lastLoginAt || null
  };
}




