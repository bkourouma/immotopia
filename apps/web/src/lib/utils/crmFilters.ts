import { CrmDashboardFilters } from '../../types/crmDashboard';
import { CrmDealStage, CrmContactStatus } from '../../types/crm-types';

/**
 * Parse dashboard filters from URL search params
 */
export function parseFiltersFromUrl(searchParams: URLSearchParams): CrmDashboardFilters {
  const filters: CrmDashboardFilters = {};

  const start = searchParams.get('start');
  const end = searchParams.get('end');
  if (start) filters.start = start;
  if (end) filters.end = end;

  const assignee = searchParams.get('assignee');
  if (assignee) filters.assignee = assignee;

  const tags = searchParams.get('tags');
  if (tags) {
    filters.tags = tags.split(',').filter(Boolean);
  }

  const stages = searchParams.get('stages');
  if (stages) {
    filters.stages = stages.split(',').filter(Boolean) as CrmDealStage[];
  }

  const statuses = searchParams.get('statuses');
  if (statuses) {
    filters.statuses = statuses.split(',').filter(Boolean) as CrmContactStatus[];
  }

  return filters;
}

/**
 * Serialize dashboard filters to URL search params
 */
export function serializeFiltersToUrl(filters: CrmDashboardFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.start) params.set('start', filters.start);
  if (filters.end) params.set('end', filters.end);
  if (filters.assignee) params.set('assignee', filters.assignee);
  if (filters.tags && filters.tags.length > 0) {
    params.set('tags', filters.tags.join(','));
  }
  if (filters.stages && filters.stages.length > 0) {
    params.set('stages', filters.stages.join(','));
  }
  if (filters.statuses && filters.statuses.length > 0) {
    params.set('statuses', filters.statuses.join(','));
  }

  return params;
}

/**
 * Get default date range for period presets
 */
export function getDateRangeForPeriod(period: '7d' | '30d' | '90d' | '6m' | '1y' | 'thisMonth' | 'custom'): {
  start: Date;
  end: Date;
} {
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const start = new Date();

  switch (period) {
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    case '90d':
      start.setDate(start.getDate() - 90);
      break;
    case '6m':
      start.setMonth(start.getMonth() - 6);
      break;
    case '1y':
      start.setFullYear(start.getFullYear() - 1);
      break;
    case 'thisMonth':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'custom':
      // Return current month as default
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
  }

  start.setHours(0, 0, 0, 0);
  return { start, end };
}

/**
 * Format date range for display
 */
export function formatDateRange(start: Date, end: Date): string {
  const formatOptions: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  };
  return `${start.toLocaleDateString('fr-FR', formatOptions)} - ${end.toLocaleDateString('fr-FR', formatOptions)}`;
}

/**
 * Check if filters are active (non-default)
 */
export function hasActiveFilters(filters: CrmDashboardFilters): boolean {
  return !!(
    filters.start ||
    filters.end ||
    filters.assignee ||
    (filters.tags && filters.tags.length > 0) ||
    (filters.stages && filters.stages.length > 0) ||
    (filters.statuses && filters.statuses.length > 0)
  );
}

/**
 * Get active filter chips for display
 * Note: FilterChip is also exported from types/crmDashboard.ts
 */
export interface FilterChip {
  key: string;
  label: string;
  value: string;
}

export function getActiveFilterChips(
  filters: CrmDashboardFilters,
  options?: {
    stageLabels?: Record<CrmDealStage, string>;
    statusLabels?: Record<CrmContactStatus, string>;
    tagLabels?: Record<string, string>;
    userLabels?: Record<string, string>;
  }
): FilterChip[] {
  const chips: FilterChip[] = [];

  if (filters.start && filters.end) {
    const start = new Date(filters.start);
    const end = new Date(filters.end);
    chips.push({
      key: 'dateRange',
      label: 'Période',
      value: formatDateRange(start, end),
    });
  }

  if (filters.assignee) {
    const label = filters.assignee === 'me' ? 'Moi' : options?.userLabels?.[filters.assignee] || filters.assignee;
    chips.push({
      key: 'assignee',
      label: 'Collaborateur',
      value: label,
    });
  }

  if (filters.tags && filters.tags.length > 0) {
    filters.tags.forEach((tagId) => {
      const label = options?.tagLabels?.[tagId] || tagId;
      chips.push({
        key: `tag-${tagId}`,
        label: 'Tag',
        value: label,
      });
    });
  }

  if (filters.stages && filters.stages.length > 0) {
    filters.stages.forEach((stage) => {
      const label = options?.stageLabels?.[stage] || stage;
      chips.push({
        key: `stage-${stage}`,
        label: 'Étape',
        value: label,
      });
    });
  }

  if (filters.statuses && filters.statuses.length > 0) {
    filters.statuses.forEach((status) => {
      const label = options?.statusLabels?.[status] || status;
      chips.push({
        key: `status-${status}`,
        label: 'Statut',
        value: label,
      });
    });
  }

  return chips;
}

