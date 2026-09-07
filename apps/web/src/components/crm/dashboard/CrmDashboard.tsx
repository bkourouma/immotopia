import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Card, 
  Button, 
  Space, 
  Row, 
  Col, 
  Typography, 
  Alert, 
  Spin,
  Statistic
} from 'antd';
import {
  UserOutlined,
  RiseOutlined,
  ShoppingOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { getCrmDashboard } from '../../../lib/api/crmDashboard';
import { CrmDashboardData, CrmDashboardFilters } from '../../../types/crmDashboard';
import { KpiCard } from './cards/KpiCard';
import { PipelineChart } from './charts/PipelineChart';
import { FunnelChart } from './charts/FunnelChart';
import { TimeSeriesChart } from './charts/TimeSeriesChart';
import { Workbench } from './workbench/Workbench';
import { TeamPerformanceTable } from './team/TeamPerformanceTable';

const { Title, Text } = Typography;

export const CrmDashboard: React.FC = () => {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [data, setData] = useState<CrmDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Parse filters from URL
  const getFiltersFromUrl = (): CrmDashboardFilters => {
    const start = searchParams.get('start') || format(subDays(new Date(), 30), 'yyyy-MM-dd');
    const end = searchParams.get('end') || format(new Date(), 'yyyy-MM-dd');
    const assignee = searchParams.get('assignee') || undefined;
    const tags = searchParams.get('tags')?.split(',').filter(Boolean) || undefined;
    const stages = searchParams.get('stages')?.split(',') as any[] || undefined;
    const statuses = searchParams.get('statuses')?.split(',') as any[] || undefined;

    return {
      start,
      end,
      assignee,
      tags,
      stages,
      statuses,
    };
  };

  const [filters, setFilters] = useState<CrmDashboardFilters>(getFiltersFromUrl());

  // Update filters when URL changes
  useEffect(() => {
    setFilters(getFiltersFromUrl());
  }, [searchParams]);

  // Fetch dashboard data
  useEffect(() => {
    if (!tenantId) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await getCrmDashboard(tenantId, filters);
        if (response.success) {
          setData(response.data);
        } else {
          setError('Erreur lors du chargement des données');
        }
      } catch (err: any) {
        console.error('Error fetching dashboard data:', err);
        setError(err.message || 'Erreur lors du chargement des données');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [tenantId, filters]);

  // Update URL when filters change
  const updateFilters = (newFilters: Partial<CrmDashboardFilters>) => {
    const updated = { ...filters, ...newFilters };
    const params = new URLSearchParams();
    
    if (updated.start) params.set('start', updated.start);
    if (updated.end) params.set('end', updated.end);
    if (updated.assignee) params.set('assignee', updated.assignee);
    if (updated.tags && updated.tags.length > 0) params.set('tags', updated.tags.join(','));
    if (updated.stages && updated.stages.length > 0) params.set('stages', updated.stages.join(','));
    if (updated.statuses && updated.statuses.length > 0) params.set('statuses', updated.statuses.join(','));

    setSearchParams(params);
  };

  // Navigation handlers for drill-down
  const handleKpiClick = (type: string) => {
    const baseUrl = `/tenant/${tenantId}/crm`;
    const params = new URLSearchParams();
    
    if (filters.start) params.set('startDate', filters.start);
    if (filters.end) params.set('endDate', filters.end);
    if (filters.assignee) params.set('assignee', filters.assignee);
    if (filters.tags && filters.tags.length > 0) params.set('tags', filters.tags.join(','));
    if (filters.statuses && filters.statuses.length > 0) params.set('status', filters.statuses.join(','));

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
      case 'overdueActions':
        params.set('overdue', '1');
        navigate(`${baseUrl}/activities?${params.toString()}`);
        break;
    }
  };

  const handleStageClick = (stage: string) => {
    const params = new URLSearchParams();
    params.set('stage', stage);
    if (filters.start) params.set('startDate', filters.start);
    if (filters.end) params.set('endDate', filters.end);
    navigate(`/tenant/${tenantId}/crm/deals?${params.toString()}`);
  };

  const handleWorkbenchItemClick = (item: any) => {
    if (item.contactId) {
      navigate(`/tenant/${tenantId}/crm/contacts/${item.contactId}`);
    } else if (item.dealId) {
      navigate(`/tenant/${tenantId}/crm/deals/${item.dealId}`);
    } else if (item.activityId) {
      navigate(`/tenant/${tenantId}/crm/activities?activityId=${item.activityId}`);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" tip="Chargement des données..." />
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        message="Erreur"
        description={error}
        type="error"
        showIcon
        style={{ marginBottom: 16 }}
      />
    );
  }

  if (!data) {
    return (
      <Alert
        message="Aucune donnée"
        description="Aucune donnée disponible pour cette période"
        type="info"
        showIcon
      />
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Header */}
      <Row justify="space-between" align="middle" gutter={[16, 16]}>
        <Col xs={24} sm={24} md={12}>
          <Title level={2} style={{ margin: 0 }}>Tableau de bord CRM</Title>
          <Text type="secondary">
            {filters.start && filters.end
              ? `${format(new Date(filters.start), 'dd MMM yyyy')} - ${format(new Date(filters.end), 'dd MMM yyyy')}`
              : 'Vue d\'ensemble'}
          </Text>
        </Col>
        <Col xs={24} sm={24} md={12} style={{ textAlign: 'right' }}>
          <Space wrap>
            <Button
              onClick={() => {
                const today = new Date();
                updateFilters({
                  start: format(startOfMonth(today), 'yyyy-MM-dd'),
                  end: format(endOfMonth(today), 'yyyy-MM-dd'),
                });
              }}
            >
              Ce mois
            </Button>
            <Button
              onClick={() => {
                updateFilters({
                  start: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
                  end: format(new Date(), 'yyyy-MM-dd'),
                });
              }}
            >
              30 derniers jours
            </Button>
          </Space>
        </Col>
      </Row>

      {/* KPI Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8}>
          <KpiCard
            title="Nouveaux leads"
            icon={<UserOutlined />}
            iconColor="#1890ff"
            value={data.kpis.newLeads}
            onClick={() => handleKpiClick('newLeads')}
            delay={0.1}
          />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <KpiCard
            title="Leads convertis"
            icon={<RiseOutlined />}
            iconColor="#52c41a"
            value={data.kpis.convertedLeads}
            onClick={() => handleKpiClick('convertedLeads')}
            delay={0.15}
          />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <KpiCard
            title="Affaires créées"
            icon={<ShoppingOutlined />}
            iconColor="#722ed1"
            value={data.kpis.dealsCreated}
            onClick={() => handleKpiClick('dealsCreated')}
            delay={0.2}
          />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <KpiCard
            title="Affaires gagnées"
            icon={<CheckCircleOutlined />}
            iconColor="#13c2c2"
            value={data.kpis.dealsWon}
            onClick={() => handleKpiClick('dealsWon')}
            delay={0.25}
          />
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <KpiCard
            title="Actions en retard"
            icon={<ExclamationCircleOutlined />}
            iconColor="#ff4d4f"
            value={data.kpis.overdueActions}
            onClick={() => handleKpiClick('overdueActions')}
            delay={0.35}
          />
        </Col>
      </Row>

      {/* Charts Row */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <BarChartOutlined />
                Pipeline des affaires
              </Space>
            }
          >
            <PipelineChart data={data.pipeline} onStageClick={handleStageClick} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <FunnelChart data={data.funnel} />
        </Col>
      </Row>

      {/* Time Series Chart */}
      <Card title="Évolution dans le temps">
        <TimeSeriesChart data={data.timeSeries} />
      </Card>

      {/* Workbench and Team Performance */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Plan de travail">
            <Workbench
              data={data.workbench}
              onItemClick={handleWorkbenchItemClick}
            />
          </Card>
        </Col>
        {data.team && (
          <Col xs={24} lg={12}>
            <Card title="Performance de l'équipe">
              <TeamPerformanceTable
                data={data.team}
                onMemberClick={(userId) => {
                  updateFilters({ assignee: userId });
                }}
              />
            </Card>
          </Col>
        )}
      </Row>
    </Space>
  );
};
