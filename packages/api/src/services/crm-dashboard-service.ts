import { prisma } from '../utils/database';
import { Dashboard, NextBestAction } from '../types/crm-types';
import { CrmContactStatus, CrmDealStage } from '@prisma/client';

// Types for the enhanced dashboard (matching frontend expectations)
export interface KpiValue {
  value: number;
  delta?: number;
  deltaPercent?: number;
  trend?: number[];
}

export interface CrmDashboardKPIs {
  newLeads: KpiValue;
  convertedLeads: KpiValue;
  dealsCreated: KpiValue;
  dealsWon: KpiValue;
  overdueActions: KpiValue;
}

export interface PipelineStageData {
  stage: CrmDealStage;
  count: number;
  value: number;
  avgAgeDays: number;
  percentage: number;
}

export interface PipelineSummary {
  stages: PipelineStageData[];
  total: number;
  totalValue: number;
}

export interface FunnelStep {
  step: string;
  count: number;
  percentage: number;
  dropOff?: number;
}

export interface ConversionFunnel {
  steps: FunnelStep[];
}

export interface TimeSeriesDataPoint {
  date: string;
  activities: number;
  newLeads: number;
  wonDeals: number;
}

export interface TimeSeries {
  data: TimeSeriesDataPoint[];
  period: 'day' | 'week' | 'month';
}

export interface ContactsByStatus {
  status: CrmContactStatus;
  count: number;
  percentage: number;
}

export interface ContactsByRole {
  role: string;
  count: number;
  percentage: number;
}

export interface ScoreBucket {
  range: string;
  count: number;
  percentage: number;
}

export interface ContactsInsights {
  byStatus: ContactsByStatus[];
  byRole: ContactsByRole[];
  byScore: ScoreBucket[];
  topHotLeads: Array<{
    id: string;
    name: string;
    score: number;
    lastActivityAt?: string;
  }>;
  inactiveLeads: Array<{
    id: string;
    name: string;
    lastActivityAt?: string;
    daysSinceActivity: number;
  }>;
}

export interface WorkbenchItem {
  id: string;
  type: 'OVERDUE_ACTION' | 'UPCOMING_ACTION';
  title: string;
  description?: string;
  dueDate: string;
  contactId?: string;
  contactName?: string;
  dealId?: string;
  dealLabel?: string;
  activityId?: string;
  priority?: 'LOW' | 'NORMAL' | 'HIGH';
  canComplete: boolean;
  canReschedule: boolean;
}

export interface Workbench {
  overdue: WorkbenchItem[];
  today: WorkbenchItem[];
  thisWeek: WorkbenchItem[];
}

export interface TeamMemberPerformance {
  userId: string;
  userName: string;
  userEmail?: string;
  activitiesCount: number;
  wonDealsCount: number;
  avgResponseTimeHours?: number;
  conversionRate?: number;
}

export interface TeamPerformance {
  members: TeamMemberPerformance[];
  totalActivities: number;
  totalWonDeals: number;
  avgResponseTimeHours?: number;
}

export interface CrmDashboardData {
  kpis: CrmDashboardKPIs;
  pipeline: PipelineSummary;
  funnel: ConversionFunnel;
  timeSeries: TimeSeries;
  contacts: ContactsInsights;
  workbench: Workbench;
  team?: TeamPerformance;
}

/**
 * Get dashboard KPIs
 * @param tenantId - Tenant ID
 * @param assignedToUserId - Optional filter by assigned user
 * @returns Dashboard KPIs
 */
export async function getDashboardKPIs(tenantId: string, assignedToUserId?: string): Promise<Dashboard['kpis']> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // New leads (last 7 days)
  const newLeadsWhere: any = {
    tenantId,
    status: CrmContactStatus.LEAD,
    createdAt: {
      gte: sevenDaysAgo
    }
  };
  if (assignedToUserId) {
    newLeadsWhere.assignedToUserId = assignedToUserId;
  }
  const newLeads = await prisma.crmContact.count({
    where: newLeadsWhere
  });

  // Hot leads (leads with deals in QUALIFIED/VISIT/NEGOTIATION)
  const hotLeadsWhere: any = {
    tenantId,
    status: CrmContactStatus.LEAD,
    deals: {
      some: {
        stage: {
          in: [CrmDealStage.QUALIFIED, CrmDealStage.VISIT, CrmDealStage.NEGOTIATION]
        }
      }
    }
  };
  if (assignedToUserId) {
    hotLeadsWhere.assignedToUserId = assignedToUserId;
  }
  const hotLeads = await prisma.crmContact.count({
    where: hotLeadsWhere
  });

  // Deals in negotiation
  const dealsInNegotiationWhere: any = {
    tenantId,
    stage: CrmDealStage.NEGOTIATION
  };
  if (assignedToUserId) {
    dealsInNegotiationWhere.assignedToUserId = assignedToUserId;
  }
  const dealsInNegotiation = await prisma.crmDeal.count({
    where: dealsInNegotiationWhere
  });

  return {
    newLeads,
    hotLeads,
    dealsInNegotiation
  };
}

/**
 * Get hot leads
 * @param tenantId - Tenant ID
 * @param assignedToUserId - Optional filter by assigned user
 * @returns Array of hot lead contacts
 */
export async function getHotLeads(tenantId: string, assignedToUserId?: string) {
  const where: any = {
    tenantId,
    status: CrmContactStatus.LEAD,
    deals: {
      some: {
        stage: {
          in: [CrmDealStage.QUALIFIED, CrmDealStage.VISIT, CrmDealStage.NEGOTIATION]
        }
      }
    }
  };

  if (assignedToUserId) {
    where.assignedToUserId = assignedToUserId;
  }

  return prisma.crmContact.findMany({
    where,
    include: {
      deals: {
        where: {
          stage: {
            in: [CrmDealStage.QUALIFIED, CrmDealStage.VISIT, CrmDealStage.NEGOTIATION]
          }
        },
        take: 1
      }
    }
  });
}

/**
 * Get next best actions
 * @param tenantId - Tenant ID
 * @param assignedToUserId - Optional filter by assigned user
 * @returns Array of next best actions
 */
export async function getNextBestActions(tenantId: string, assignedToUserId?: string): Promise<NextBestAction[]> {
  const actions: NextBestAction[] = [];
  const now = new Date();

  // Overdue follow-ups (activities with nextActionAt in past)
  const overdueActivitiesWhere: any = {
    tenantId,
    nextActionAt: {
      lt: now,
      not: null
    }
  };
  if (assignedToUserId) {
    // Note: Activities don't have assignedTo, but we can filter by contact's assignedTo
    // This is simplified - in production you might want a more complex query
  }

  const overdueActivities = await prisma.crmActivity.findMany({
    where: overdueActivitiesWhere,
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
      }
    },
    take: 10
  });

  for (const activity of overdueActivities) {
    actions.push({
      type: 'FOLLOW_UP',
      description: `Follow up: ${activity.nextActionType || 'Action required'}`,
      dueDate: activity.nextActionAt!,
      contactId: activity.contactId || undefined,
      dealId: activity.dealId || undefined,
      activityId: activity.id
    });
  }

  // Sort by due date
  actions.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  return actions.slice(0, 20); // Return top 20 actions
}

/**
 * Get complete dashboard data (legacy)
 * @param tenantId - Tenant ID
 * @param assignedToUserId - Optional filter by assigned user
 * @returns Complete dashboard
 */
export async function getDashboardLegacy(tenantId: string, assignedToUserId?: string): Promise<Dashboard> {
  const [kpis, nextActions] = await Promise.all([
    getDashboardKPIs(tenantId, assignedToUserId),
    getNextBestActions(tenantId, assignedToUserId)
  ]);

  return {
    kpis,
    nextActions
  };
}

/**
 * Get enhanced KPIs for the dashboard
 */
async function getEnhancedKPIs(
  tenantId: string,
  assignedToUserId?: string,
  startDate?: Date,
  endDate?: Date,
  tagIds?: string[],
  statuses?: CrmContactStatus[]
): Promise<CrmDashboardKPIs> {
  const now = new Date(); // Always use current date for overdue actions
  const periodStart = startDate || new Date(now);
  if (!startDate) {
    periodStart.setDate(periodStart.getDate() - 7);
  }
  periodStart.setHours(0, 0, 0, 0);

  const periodEnd = endDate || new Date(now);
  periodEnd.setHours(23, 59, 59, 999);

  // Previous period for delta calculation
  const periodDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));
  const previousPeriodStart = new Date(periodStart);
  previousPeriodStart.setDate(previousPeriodStart.getDate() - periodDays);

  const buildContactWhere = (dateFilter: any) => {
    const where: any = { tenantId, ...dateFilter };
    if (assignedToUserId) {
      where.assignedToUserId = assignedToUserId;
    }
    if (statuses && statuses.length > 0) {
      where.status = { in: statuses };
    }
    if (tagIds && tagIds.length > 0) {
      where.tags = { some: { tagId: { in: tagIds } } };
    }
    return where;
  };

  // New leads (in period)
  const newLeadsCount = await prisma.crmContact.count({
    where: buildContactWhere({ status: CrmContactStatus.LEAD, createdAt: { gte: periodStart, lte: periodEnd } })
  });

  // Previous period for delta
  const previousNewLeads = await prisma.crmContact.count({
    where: buildContactWhere({
      status: CrmContactStatus.LEAD,
      createdAt: { gte: previousPeriodStart, lt: periodStart }
    })
  });

  // Converted leads (contacts that changed from LEAD to ACTIVE_CLIENT in period)
  const convertedLeadsCount = await prisma.crmContact.count({
    where: buildContactWhere({
      status: CrmContactStatus.ACTIVE_CLIENT,
      updatedAt: { gte: periodStart, lte: periodEnd }
    })
  });
  const previousConvertedLeads = await prisma.crmContact.count({
    where: buildContactWhere({
      status: CrmContactStatus.ACTIVE_CLIENT,
      updatedAt: { gte: previousPeriodStart, lt: periodStart }
    })
  });

  // Deals created
  const buildDealWhere = (dateFilter: any, stageFilter?: any) => {
    const where: any = { tenantId, ...dateFilter };
    if (assignedToUserId) {
      where.assignedToUserId = assignedToUserId;
    }
    if (stageFilter) {
      where.stage = stageFilter;
    }
    return where;
  };

  const dealsCreatedCount = await prisma.crmDeal.count({
    where: buildDealWhere({ createdAt: { gte: periodStart, lte: periodEnd } })
  });
  const previousDealsCreated = await prisma.crmDeal.count({
    where: buildDealWhere({ createdAt: { gte: previousPeriodStart, lt: periodStart } })
  });

  // Deals won
  const dealsWonCount = await prisma.crmDeal.count({
    where: buildDealWhere({ stage: CrmDealStage.WON, updatedAt: { gte: periodStart, lte: periodEnd } })
  });
  const previousDealsWon = await prisma.crmDeal.count({
    where: buildDealWhere({ stage: CrmDealStage.WON, updatedAt: { gte: previousPeriodStart, lt: periodStart } })
  });

  // Overdue actions
  const overdueActionsCount = await prisma.crmActivity.count({
    where: { tenantId, nextActionAt: { lt: now, not: null } }
  });

  const calculateDelta = (current: number, previous: number) => {
    const delta = current - previous;
    const deltaPercent = previous > 0 ? Math.round((delta / previous) * 100) : current > 0 ? 100 : 0;
    return { delta, deltaPercent };
  };

  return {
    newLeads: { value: newLeadsCount, ...calculateDelta(newLeadsCount, previousNewLeads) },
    convertedLeads: { value: convertedLeadsCount, ...calculateDelta(convertedLeadsCount, previousConvertedLeads) },
    dealsCreated: { value: dealsCreatedCount, ...calculateDelta(dealsCreatedCount, previousDealsCreated) },
    dealsWon: { value: dealsWonCount, ...calculateDelta(dealsWonCount, previousDealsWon) },
    overdueActions: { value: overdueActionsCount }
  };
}

/**
 * Get pipeline summary
 */
async function getPipelineSummary(
  tenantId: string,
  assignedToUserId?: string,
  stages?: CrmDealStage[]
): Promise<PipelineSummary> {
  const baseWhere: any = { tenantId, stage: { notIn: [CrmDealStage.WON, CrmDealStage.LOST] } };
  if (assignedToUserId) baseWhere.assignedToUserId = assignedToUserId;
  if (stages && stages.length > 0) {
    baseWhere.stage = { in: stages.filter(s => s !== CrmDealStage.WON && s !== CrmDealStage.LOST) };
  }

  const stagesToShow =
    stages && stages.length > 0
      ? stages.filter(s => s !== CrmDealStage.WON && s !== CrmDealStage.LOST)
      : [CrmDealStage.NEW, CrmDealStage.QUALIFIED, CrmDealStage.VISIT, CrmDealStage.NEGOTIATION];

  const stageData: PipelineStageData[] = [];
  let total = 0;
  let totalValue = 0;

  for (const stage of stagesToShow) {
    const deals = await prisma.crmDeal.findMany({
      where: { ...baseWhere, stage },
      select: { expectedValue: true, createdAt: true }
    });

    const count = deals.length;
    const value = deals.reduce((sum, d) => sum + (d.expectedValue ? Number(d.expectedValue) : 0), 0);
    const avgAgeDays =
      count > 0
        ? Math.round(
            deals.reduce((sum, d) => sum + (Date.now() - d.createdAt.getTime()) / (1000 * 60 * 60 * 24), 0) / count
          )
        : 0;

    stageData.push({ stage, count, value, avgAgeDays, percentage: 0 });
    total += count;
    totalValue += value;
  }

  // Calculate percentages
  stageData.forEach(s => {
    s.percentage = total > 0 ? Math.round((s.count / total) * 100) : 0;
  });

  return { stages: stageData, total, totalValue };
}

/**
 * Get conversion funnel
 */
async function getConversionFunnel(
  tenantId: string,
  assignedToUserId?: string,
  stages?: CrmDealStage[]
): Promise<ConversionFunnel> {
  const baseContactWhere: any = { tenantId };
  if (assignedToUserId) baseContactWhere.assignedToUserId = assignedToUserId;

  const baseDealWhere: any = { tenantId };
  if (assignedToUserId) baseDealWhere.assignedToUserId = assignedToUserId;

  const totalLeads = await prisma.crmContact.count({ where: { ...baseContactWhere, status: CrmContactStatus.LEAD } });
  const totalClients = await prisma.crmContact.count({
    where: { ...baseContactWhere, status: CrmContactStatus.ACTIVE_CLIENT }
  });

  // If stages filter is provided, only count deals in those stages
  const stageFilter = stages && stages.length > 0 ? { in: stages } : undefined;

  const qualifiedDeals = await prisma.crmDeal.count({
    where: {
      ...baseDealWhere,
      stage: stageFilter || {
        in: [CrmDealStage.QUALIFIED, CrmDealStage.VISIT, CrmDealStage.NEGOTIATION, CrmDealStage.WON]
      }
    }
  });
  const visitDeals = await prisma.crmDeal.count({
    where: {
      ...baseDealWhere,
      stage: stageFilter || { in: [CrmDealStage.VISIT, CrmDealStage.NEGOTIATION, CrmDealStage.WON] }
    }
  });
  const negotiationDeals = await prisma.crmDeal.count({
    where: {
      ...baseDealWhere,
      stage: stageFilter || { in: [CrmDealStage.NEGOTIATION, CrmDealStage.WON] }
    }
  });
  const wonDeals = await prisma.crmDeal.count({
    where: {
      ...baseDealWhere,
      stage: stageFilter || CrmDealStage.WON
    }
  });

  const steps: FunnelStep[] = [
    { step: 'Leads', count: totalLeads + totalClients, percentage: 100 },
    {
      step: 'Qualified',
      count: qualifiedDeals,
      percentage: totalLeads > 0 ? Math.round((qualifiedDeals / (totalLeads + totalClients)) * 100) : 0
    },
    {
      step: 'Visit',
      count: visitDeals,
      percentage: qualifiedDeals > 0 ? Math.round((visitDeals / qualifiedDeals) * 100) : 0
    },
    {
      step: 'Negotiation',
      count: negotiationDeals,
      percentage: visitDeals > 0 ? Math.round((negotiationDeals / visitDeals) * 100) : 0
    },
    {
      step: 'Won',
      count: wonDeals,
      percentage: negotiationDeals > 0 ? Math.round((wonDeals / negotiationDeals) * 100) : 0
    }
  ];

  // Calculate drop-off
  for (let i = 1; i < steps.length; i++) {
    steps[i].dropOff =
      steps[i - 1].count > 0 ? Math.round(((steps[i - 1].count - steps[i].count) / steps[i - 1].count) * 100) : 0;
  }

  return { steps };
}

/**
 * Get time series data
 */
async function getTimeSeries(
  tenantId: string,
  assignedToUserId?: string,
  startDate?: Date,
  endDate?: Date
): Promise<TimeSeries> {
  const data: TimeSeriesDataPoint[] = [];
  const now = endDate || new Date();
  const periodStart = startDate || new Date(now);
  if (!startDate) {
    periodStart.setDate(periodStart.getDate() - 7);
  }
  periodStart.setHours(0, 0, 0, 0);

  const periodEnd = endDate || new Date(now);
  periodEnd.setHours(23, 59, 59, 999);

  // Calculate number of days in period
  const daysDiff = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));
  const numPoints = Math.min(daysDiff, 30); // Max 30 points for performance

  // If period is more than 7 days, group by week, otherwise by day
  const groupBy = daysDiff > 7 ? 'week' : 'day';

  for (let i = 0; i < numPoints; i++) {
    const date = new Date(periodStart);
    if (groupBy === 'week') {
      date.setDate(date.getDate() + i * 7);
    } else {
      date.setDate(date.getDate() + i);
    }
    date.setHours(0, 0, 0, 0);

    const nextDate = new Date(date);
    if (groupBy === 'week') {
      nextDate.setDate(nextDate.getDate() + 7);
    } else {
      nextDate.setDate(nextDate.getDate() + 1);
    }
    if (nextDate > periodEnd) {
      nextDate.setTime(periodEnd.getTime());
    }

    const baseWhere: any = { tenantId };
    if (assignedToUserId) baseWhere.assignedToUserId = assignedToUserId;

    const [activities, newLeads, wonDeals] = await Promise.all([
      prisma.crmActivity.count({ where: { tenantId, createdAt: { gte: date, lt: nextDate } } }),
      prisma.crmContact.count({
        where: { ...baseWhere, status: CrmContactStatus.LEAD, createdAt: { gte: date, lt: nextDate } }
      }),
      prisma.crmDeal.count({ where: { ...baseWhere, stage: CrmDealStage.WON, updatedAt: { gte: date, lt: nextDate } } })
    ]);

    data.push({
      date: date.toISOString().split('T')[0],
      activities,
      newLeads,
      wonDeals
    });
  }

  return { data, period: groupBy as 'day' | 'week' | 'month' };
}

/**
 * Get contacts insights
 */
async function getContactsInsights(
  tenantId: string,
  assignedToUserId?: string,
  tagIds?: string[],
  statuses?: CrmContactStatus[]
): Promise<ContactsInsights> {
  const baseWhere: any = { tenantId };
  if (assignedToUserId) baseWhere.assignedToUserId = assignedToUserId;
  if (statuses && statuses.length > 0) {
    baseWhere.status = { in: statuses };
  }
  if (tagIds && tagIds.length > 0) {
    baseWhere.tags = { some: { tagId: { in: tagIds } } };
  }

  // By status
  const statusesToShow =
    statuses && statuses.length > 0
      ? statuses
      : [CrmContactStatus.LEAD, CrmContactStatus.ACTIVE_CLIENT, CrmContactStatus.ARCHIVED];

  const statusBaseWhere: any = { tenantId };
  if (assignedToUserId) statusBaseWhere.assignedToUserId = assignedToUserId;
  if (tagIds && tagIds.length > 0) {
    statusBaseWhere.tags = { some: { tagId: { in: tagIds } } };
  }

  const totalContacts = await prisma.crmContact.count({ where: statusBaseWhere });

  const byStatus: ContactsByStatus[] = [];
  for (const status of statusesToShow) {
    const count = await prisma.crmContact.count({ where: { ...statusBaseWhere, status } });
    byStatus.push({ status, count, percentage: totalContacts > 0 ? Math.round((count / totalContacts) * 100) : 0 });
  }

  // By role
  const roleGroups = await prisma.crmContactRole.groupBy({
    by: ['role'],
    where: { tenantId, active: true },
    _count: { role: true }
  });
  const totalRoles = roleGroups.reduce((sum, r) => sum + r._count.role, 0);
  const byRole: ContactsByRole[] = roleGroups.map(r => ({
    role: r.role,
    count: r._count.role,
    percentage: totalRoles > 0 ? Math.round((r._count.role / totalRoles) * 100) : 0
  }));

  // By score (simplified buckets)
  const scoreBuckets = [
    { range: '0-20', min: 0, max: 20 },
    { range: '21-50', min: 21, max: 50 },
    { range: '51-80', min: 51, max: 80 },
    { range: '81-100', min: 81, max: 100 }
  ];
  const byScore: ScoreBucket[] = [];
  for (const bucket of scoreBuckets) {
    const count = await prisma.crmContact.count({
      where: { ...baseWhere, score: { gte: bucket.min, lte: bucket.max } }
    });
    byScore.push({
      range: bucket.range,
      count,
      percentage: totalContacts > 0 ? Math.round((count / totalContacts) * 100) : 0
    });
  }

  // Hot leads
  const hotLeads = await prisma.crmContact.findMany({
    where: {
      ...baseWhere,
      status: CrmContactStatus.LEAD,
      score: { gte: 70 }
    },
    take: 5,
    orderBy: { score: 'desc' },
    select: { id: true, firstName: true, lastName: true, score: true, updatedAt: true }
  });

  // Inactive leads (no activity in 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const inactiveLeads = await prisma.crmContact.findMany({
    where: {
      ...baseWhere,
      status: CrmContactStatus.LEAD,
      updatedAt: { lt: thirtyDaysAgo }
    },
    take: 5,
    orderBy: { updatedAt: 'asc' },
    select: { id: true, firstName: true, lastName: true, updatedAt: true }
  });

  return {
    byStatus,
    byRole,
    byScore,
    topHotLeads: hotLeads.map(l => ({
      id: l.id,
      name: `${l.firstName} ${l.lastName}`,
      score: l.score || 0,
      lastActivityAt: l.updatedAt.toISOString()
    })),
    inactiveLeads: inactiveLeads.map(l => ({
      id: l.id,
      name: `${l.firstName} ${l.lastName}`,
      lastActivityAt: l.updatedAt.toISOString(),
      daysSinceActivity: Math.floor((Date.now() - l.updatedAt.getTime()) / (1000 * 60 * 60 * 24))
    }))
  };
}

/**
 * Get workbench items
 */
async function getWorkbench(tenantId: string, assignedToUserId?: string): Promise<Workbench> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const baseWhere: any = { tenantId };
  if (assignedToUserId) baseWhere.assignedToUserId = assignedToUserId;

  // Overdue actions
  const overdueActivities = await prisma.crmActivity.findMany({
    where: { tenantId, nextActionAt: { lt: now, not: null } },
    include: {
      contact: { select: { id: true, firstName: true, lastName: true } },
      deal: { select: { id: true, type: true } }
    },
    take: 10,
    orderBy: { nextActionAt: 'asc' }
  });

  const overdue: WorkbenchItem[] = overdueActivities.map(a => ({
    id: a.id,
    type: 'OVERDUE_ACTION' as const,
    title: a.nextActionType || 'Action requise',
    description: a.subject || undefined,
    dueDate: a.nextActionAt!.toISOString(),
    contactId: a.contactId || undefined,
    contactName: a.contact ? `${a.contact.firstName} ${a.contact.lastName}` : undefined,
    dealId: a.dealId || undefined,
    activityId: a.id,
    priority: 'HIGH' as const,
    canComplete: true,
    canReschedule: true
  }));

  // Today's actions (activities with nextActionAt today)
  const todayActivities = await prisma.crmActivity.findMany({
    where: {
      tenantId,
      nextActionAt: {
        gte: todayStart,
        lte: todayEnd,
        not: null
      }
    },
    include: {
      contact: { select: { id: true, firstName: true, lastName: true } },
      deal: { select: { id: true, type: true } }
    },
    orderBy: { nextActionAt: 'asc' }
  });

  const today: WorkbenchItem[] = todayActivities.map(a => ({
    id: a.id,
    type: 'UPCOMING_ACTION' as const,
    title: a.nextActionType || 'Action requise',
    description: a.subject || undefined,
    dueDate: a.nextActionAt!.toISOString(),
    contactId: a.contactId || undefined,
    contactName: a.contact ? `${a.contact.firstName} ${a.contact.lastName}` : undefined,
    dealId: a.dealId || undefined,
    activityId: a.id,
    priority: 'NORMAL' as const,
    canComplete: true,
    canReschedule: true
  }));

  // This week's upcoming actions
  const weekActivities = await prisma.crmActivity.findMany({
    where: {
      tenantId,
      nextActionAt: {
        gt: todayEnd,
        lte: weekEnd,
        not: null
      }
    },
    include: {
      contact: { select: { id: true, firstName: true, lastName: true } },
      deal: { select: { id: true, type: true } }
    },
    take: 10,
    orderBy: { nextActionAt: 'asc' }
  });

  const thisWeek: WorkbenchItem[] = weekActivities.map(a => ({
    id: a.id,
    type: 'UPCOMING_ACTION' as const,
    title: a.nextActionType || 'Action requise',
    description: a.subject || undefined,
    dueDate: a.nextActionAt!.toISOString(),
    contactId: a.contactId || undefined,
    contactName: a.contact ? `${a.contact.firstName} ${a.contact.lastName}` : undefined,
    dealId: a.dealId || undefined,
    activityId: a.id,
    priority: 'NORMAL' as const,
    canComplete: true,
    canReschedule: true
  }));

  return { overdue, today, thisWeek };
}

export interface DashboardFilters {
  assignedToUserId?: string;
  startDate?: Date;
  endDate?: Date;
  tagIds?: string[];
  stages?: CrmDealStage[];
  statuses?: CrmContactStatus[];
}

/**
 * Get complete enhanced dashboard data
 * @param tenantId - Tenant ID
 * @param filters - Optional filters for dashboard data
 * @returns Complete dashboard matching frontend expectations
 */
export async function getDashboard(tenantId: string, filters?: DashboardFilters): Promise<CrmDashboardData> {
  const assignedToUserId = filters?.assignedToUserId;
  const startDate = filters?.startDate;
  const endDate = filters?.endDate;
  const tagIds = filters?.tagIds;
  const stages = filters?.stages;
  const statuses = filters?.statuses;

  const [kpis, pipeline, funnel, timeSeries, contacts, workbench] = await Promise.all([
    getEnhancedKPIs(tenantId, assignedToUserId, startDate, endDate, tagIds, statuses),
    getPipelineSummary(tenantId, assignedToUserId, stages),
    getConversionFunnel(tenantId, assignedToUserId, stages),
    getTimeSeries(tenantId, assignedToUserId, startDate, endDate),
    getContactsInsights(tenantId, assignedToUserId, tagIds, statuses),
    getWorkbench(tenantId, assignedToUserId)
  ]);

  return {
    kpis,
    pipeline,
    funnel,
    timeSeries,
    contacts,
    workbench
  };
}
