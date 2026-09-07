import { CrmContactStatus, CrmDealStage, CrmActivityType } from './crm-types';

export interface CrmDashboardFilters {
  start?: string; // ISO date string
  end?: string; // ISO date string
  assignee?: string; // User ID or 'me'
  tags?: string[]; // Tag IDs
  stages?: CrmDealStage[]; // Deal stages
  statuses?: CrmContactStatus[]; // Contact statuses
}

export interface KpiValue {
  value: number;
  delta?: number; // Change vs previous period
  deltaPercent?: number;
  trend?: number[]; // Sparkline data (last 7/14/30 points)
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
  value: number; // Total expected value
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
  dropOff?: number; // Percentage dropped from previous step
}

export interface ConversionFunnel {
  steps: FunnelStep[];
}

export interface TimeSeriesDataPoint {
  date: string; // ISO date string
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
  range: string; // e.g., "0-20", "21-50"
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
  dueDate: string; // ISO date string
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
  team?: TeamPerformance; // Optional based on permissions
}

export interface CrmDashboardResponse {
  success: boolean;
  data: CrmDashboardData;
}

// Re-export FilterChip from utils for convenience
export interface FilterChip {
  key: string;
  label: string;
  value: string;
}

