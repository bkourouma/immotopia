import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { DashboardLayout } from '../../dashboard/dashboard-layout';
import { getCrmDashboard } from '../../../lib/api/crmDashboard';
import { CrmDashboardData, CrmDashboardFilters, WorkbenchItem } from '../../../types/crmDashboard';
import { parseFiltersFromUrl, serializeFiltersToUrl, getDateRangeForPeriod } from '../../../lib/utils/crmFilters';
import { DashboardFilters } from './filters/DashboardFilters';
import { KpiCard } from './cards/KpiCard';
import { PipelineChart } from './charts/PipelineChart';
import { FunnelChart } from './charts/FunnelChart';
import { TimeSeriesChart } from './charts/TimeSeriesChart';
import { ContactsCharts } from './charts/ContactsCharts';
import { WorkbenchComponent } from './workbench/Workbench';
import { TeamPerformanceTable } from './team/TeamPerformanceTable';
import {
  Users,
  TrendingUp,
  Calendar,
  Briefcase,
  Clock,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { CrmDealStage, CrmContactStatus } from '../../../types/crm-types';
import { listTags, CrmTag } from '../../../services/crm-service';
import { useAuth } from '../../../hooks/useAuth';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
    },
  },
};

export const CrmDashboard: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  const [data, setData] = useState<CrmDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tags, setTags] = useState<CrmTag[]>([]);

  // Parse filters from URL
  const filters = useMemo(() => {
    const parsed = parseFiltersFromUrl(searchParams);
    // Set default date range if not present
    if (!parsed.start || !parsed.end) {
      const { start, end } = getDateRangeForPeriod('30d');
      parsed.start = start.toISOString();
      parsed.end = end.toISOString();
    }
    return parsed;
  }, [searchParams]);

  // Update URL when filters change
  const updateFilters = useCallback(
    (newFilters: CrmDashboardFilters) => {
      // Ensure dates are always present
      const filtersWithDefaults = { ...newFilters };
      if (!filtersWithDefaults.start || !filtersWithDefaults.end) {
        const { start, end } = getDateRangeForPeriod('30d');
        filtersWithDefaults.start = start.toISOString();
        filtersWithDefaults.end = end.toISOString();
      }
      
      const params = serializeFiltersToUrl(filtersWithDefaults);
      setSearchParams(params, { replace: true });
    },
    [setSearchParams]
  );

  // Load dashboard data
  useEffect(() => {
    if (!tenantId) return;

    const loadDashboard = async () => {
      setLoading(true);
      setError(null);
      try {
        // Prepare filters for API (convert 'me' to actual user ID)
        const apiFilters: CrmDashboardFilters = { ...filters };
        if (apiFilters.assignee === 'me' && user?.id) {
          apiFilters.assignee = user.id;
        }

        // Ensure dates are always included
        if (!apiFilters.start || !apiFilters.end) {
          const { start, end } = getDateRangeForPeriod('30d');
          apiFilters.start = start.toISOString();
          apiFilters.end = end.toISOString();
        }

        const response = await getCrmDashboard(tenantId, apiFilters);
        if (response.success) {
          setData(response.data);
        } else {
          setError('Erreur lors du chargement du tableau de bord');
        }
      } catch (err: any) {
        console.error('Error loading dashboard:', err);
        setError(err.response?.data?.message || 'Erreur lors du chargement du tableau de bord');
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, [tenantId, filters.start, filters.end, filters.assignee, filters.tags, filters.stages, filters.statuses, user?.id]);

  // Load tags
  useEffect(() => {
    if (!tenantId) return;

    const loadTags = async () => {
      try {
        const response = await listTags(tenantId);
        if (response.success) {
          setTags(response.data);
        }
      } catch (err) {
        console.error('Error loading tags:', err);
      }
    };

    loadTags();
  }, [tenantId]);

  // KPI click handlers (drill-down)
  const handleKpiClick = useCallback(
    (type: string) => {
      const baseUrl = `/tenant/${tenantId}/crm`;
      const params = new URLSearchParams();
      
      // Always include date filters if available
      if (filters.start) params.set('startDate', filters.start);
      if (filters.end) params.set('endDate', filters.end);
      
      // Include assignee if not 'all'
      if (filters.assignee && filters.assignee !== 'all' && filters.assignee !== 'me') {
        params.set('assignedTo', filters.assignee);
      } else if (filters.assignee === 'me' && user?.id) {
        params.set('assignedTo', user.id);
      }
      
      switch (type) {
        case 'newLeads':
          params.set('status', 'LEAD');
          navigate(`${baseUrl}/contacts?${params.toString()}`);
          break;
        case 'convertedLeads':
          params.set('status', 'ACTIVE_CLIENT');
          navigate(`${baseUrl}/contacts?${params.toString()}`);
          break;
        case 'dealsCreated':
          navigate(`${baseUrl}/deals?${params.toString()}`);
          break;
        case 'dealsWon':
          params.set('stage', 'WON');
          navigate(`${baseUrl}/deals?${params.toString()}`);
          break;
        case 'upcomingAppointments':
          navigate(`${baseUrl}/appointments?${params.toString()}`);
          break;
        case 'overdueActions':
          params.set('overdue', '1');
          navigate(`${baseUrl}/activities?${params.toString()}`);
          break;
      }
    },
    [tenantId, navigate, filters, user?.id]
  );

  // Stage click handler - navigate to deals list filtered by stage
  const handleStageClick = useCallback(
    (stage: CrmDealStage) => {
      const baseUrl = `/tenant/${tenantId}/crm/deals`;
      const params = new URLSearchParams();
      params.set('stage', stage);
      if (filters.start) params.set('startDate', filters.start);
      if (filters.end) params.set('endDate', filters.end);
      if (filters.assignee && filters.assignee !== 'me') {
        params.set('assignedTo', filters.assignee);
      }
      navigate(`${baseUrl}?${params.toString()}`);
    },
    [tenantId, navigate, filters]
  );

  // Funnel step click handler - navigate to deals list filtered by stage
  const handleFunnelStepClick = useCallback(
    (step: string) => {
      // Map funnel step names to deal stages
      const stepToStageMap: Record<string, CrmDealStage> = {
        Leads: 'NEW',
        'Qualified': 'QUALIFIED',
        'Qualifié': 'QUALIFIED',
        'RDV': 'APPOINTMENT',
        'Appointment': 'APPOINTMENT',
        'Visite': 'VISIT',
        'Visit': 'VISIT',
        'Négociation': 'NEGOTIATION',
        'Negotiation': 'NEGOTIATION',
        'Gagné': 'WON',
        'Won': 'WON',
        'Perdu': 'LOST',
        'Lost': 'LOST',
      };

      const stage = stepToStageMap[step];
      if (stage) {
        handleStageClick(stage);
      } else {
        // If no stage mapping, navigate to deals page without stage filter
        const baseUrl = `/tenant/${tenantId}/crm/deals`;
        const params = new URLSearchParams();
        if (filters.start) params.set('startDate', filters.start);
        if (filters.end) params.set('endDate', filters.end);
        navigate(`${baseUrl}?${params.toString()}`);
      }
    },
    [tenantId, navigate, filters, handleStageClick]
  );

  const handleStatusClick = useCallback(
    (status: CrmContactStatus) => {
      const currentStatuses = filters.statuses || [];
      const newStatuses = currentStatuses.includes(status)
        ? currentStatuses.filter((s) => s !== status)
        : [...currentStatuses, status];
      updateFilters({ ...filters, statuses: newStatuses });
    },
    [filters, updateFilters]
  );

  const handleWorkbenchItemClick = useCallback(
    (item: WorkbenchItem) => {
      const baseUrl = `/tenant/${tenantId}/crm`;
      if (item.contactId) {
        navigate(`${baseUrl}/contacts/${item.contactId}`);
      } else if (item.dealId) {
        navigate(`${baseUrl}/deals/${item.dealId}`);
      } else if (item.appointmentId) {
        navigate(`${baseUrl}/appointments`);
      }
    },
    [tenantId, navigate]
  );

  const handleLeadClick = useCallback(
    (leadId: string) => {
      navigate(`/tenant/${tenantId}/crm/contacts/${leadId}`);
    },
    [tenantId, navigate]
  );

  // Loading state
  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
            <p className="text-slate-600">Chargement du tableau de bord...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <DashboardLayout>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error || 'Erreur lors du chargement des données'}
        </div>
      </DashboardLayout>
    );
  }

  const availableTags = tags.map((tag) => ({ id: tag.id, name: tag.name }));
  const availableCollaborators = [{ id: 'me', name: 'Moi', email: user?.email }];

  return (
    <DashboardLayout>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-6 pb-8"
      >
        {/* Header */}
        <motion.div variants={itemVariants}>
          <h1 className="text-3xl font-bold text-slate-900">Tableau de bord CRM</h1>
          <p className="text-slate-600 mt-1">Vue d'ensemble de vos suivis et KPIs CRM</p>
        </motion.div>

        {/* Filters */}
        <motion.div variants={itemVariants}>
          <DashboardFilters
            filters={filters}
            onFiltersChange={updateFilters}
            availableTags={availableTags}
            availableCollaborators={availableCollaborators}
          />
        </motion.div>

        {/* KPI Cards */}
        <motion.div variants={itemVariants}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <KpiCard
              title="Nouveaux leads"
              icon={Users}
              iconColor="text-blue-600"
              value={data.kpis.newLeads}
              onClick={() => handleKpiClick('newLeads')}
              delay={0}
            />
            <KpiCard
              title="Leads convertis"
              icon={TrendingUp}
              iconColor="text-green-600"
              value={data.kpis.convertedLeads}
              onClick={() => handleKpiClick('convertedLeads')}
              delay={0.05}
            />
            <KpiCard
              title="Affaires créées"
              icon={Briefcase}
              iconColor="text-purple-600"
              value={data.kpis.dealsCreated}
              onClick={() => handleKpiClick('dealsCreated')}
              delay={0.1}
            />
            <KpiCard
              title="Affaires gagnées"
              icon={TrendingUp}
              iconColor="text-green-600"
              value={data.kpis.dealsWon}
              onClick={() => handleKpiClick('dealsWon')}
              delay={0.15}
            />
            <KpiCard
              title="RDV à venir"
              icon={Calendar}
              iconColor="text-orange-600"
              value={data.kpis.upcomingAppointments}
              onClick={() => handleKpiClick('upcomingAppointments')}
              delay={0.2}
            />
            <KpiCard
              title="Actions en retard"
              icon={AlertCircle}
              iconColor="text-red-600"
              value={data.kpis.overdueActions}
              onClick={() => handleKpiClick('overdueActions')}
              delay={0.25}
            />
          </div>
        </motion.div>

        {/* Analytics Grid */}
        <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PipelineChart data={data.pipeline} onStageClick={handleStageClick} />
          <FunnelChart data={data.funnel} onStepClick={handleFunnelStepClick} />
        </motion.div>

        {/* Time Series */}
        <motion.div variants={itemVariants}>
          <TimeSeriesChart data={data.timeSeries} />
        </motion.div>

        {/* Workbench and Contacts Insights */}
        <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <WorkbenchComponent
            data={data.workbench}
            onItemClick={handleWorkbenchItemClick}
            onComplete={(item) => {
              // Handle completion - would need to call API
              console.log('Complete item:', item);
            }}
            onReschedule={(item) => {
              // Handle reschedule - would need modal
              console.log('Reschedule item:', item);
            }}
          />
          <ContactsCharts
            data={data.contacts}
            onStatusClick={handleStatusClick}
            onLeadClick={handleLeadClick}
          />
        </motion.div>

        {/* Team Performance (conditional) */}
        {data.team && data.team.members.length > 0 && (
          <motion.div variants={itemVariants}>
            <TeamPerformanceTable
              data={data.team}
              onMemberClick={(userId) => {
                updateFilters({ ...filters, assignee: userId });
              }}
            />
          </motion.div>
        )}
      </motion.div>
    </DashboardLayout>
  );
};

