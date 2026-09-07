import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Typography, Spin, Alert, Space, Tag, List, Empty, Statistic, Button } from 'antd';
import {
  BankOutlined,
  DollarOutlined,
  CalendarOutlined,
  WalletOutlined,
  ToolOutlined,
  HomeOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  PercentageOutlined,
  SyncOutlined
} from '@ant-design/icons';
import { ownerPortalService } from '../../services/ownerPortalService';
import { StatCard } from '../../components/OwnerPortal/StatCard';

const { Title, Text } = Typography;

interface DashboardData {
  portfolioSummary: {
    total: number;
    rented: number;
    available: number;
    inMaintenance: number;
  };
  revenueMetrics: {
    currentMonth: number;
    currentYear: number;
    lastMonth: number;
    lastYear: number;
  };
  occupancyRate: number;
  upcomingPayments: Array<{
    id: string;
    propertyAddress: string;
    tenantName: string;
    period: string;
    dueDate: string;
    amount: number;
    status: string;
  }>;
  recentPayments: Array<{
    id: string;
    propertyAddress: string;
    tenantName: string;
    amount: number;
    date: string;
    method: string;
  }>;
  recentTickets: Array<{
    id: string;
    propertyAddress: string;
    title: string;
    status: string;
    createdAt: string;
  }>;
}

export default function OwnerDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await ownerPortalService.getDashboard();
      if (response.data?.success && response.data?.data) {
        setData(response.data.data);
      } else {
        setError('Erreur lors du chargement du tableau de bord');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement du tableau de bord');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'XOF',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getPaymentMethodLabel = (method: string) => {
    const methods: Record<string, string> = {
      CASH: 'Espèces',
      BANK_TRANSFER: 'Virement bancaire',
      CHECK: 'Chèque',
      MOBILE_MONEY: 'Mobile Money',
      CARD: 'Carte',
      OTHER: 'Autre'
    };
    return methods[method] || method;
  };

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { label: string; color: string }> = {
      DUE: { label: 'Échéance', color: 'warning' },
      OVERDUE: { label: 'En retard', color: 'error' },
      PAID: { label: 'Payé', color: 'success' },
      DECLARED: { label: 'Déclaré', color: 'default' },
      IN_PROGRESS: { label: 'En cours', color: 'processing' },
      RESOLVED: { label: 'Résolu', color: 'success' },
    };
    const config = statusMap[status] || { label: status, color: 'default' };
    return <Tag color={config.color}>{config.label}</Tag>;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" tip="Chargement du tableau de bord..." />
      </div>
    );
  }

  if (error) {
    return <Alert message="Erreur" description={error} type="error" showIcon />;
  }

  if (!data) {
    return <Empty description="Aucune donnée disponible" />;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={2}>Tableau de bord</Title>
          <Text type="secondary">Vue d'ensemble de votre portefeuille immobilier</Text>
        </div>
        <Button
          icon={<SyncOutlined />}
          onClick={loadDashboard}
          loading={loading}
          aria-label="Rafraîchir le tableau de bord"
        >
          Actualiser
        </Button>
      </div>

      {/* Portfolio Summary Cards (T028) */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Total propriétés"
            value={data.portfolioSummary.total}
            icon={<BankOutlined style={{ color: '#1890ff' }} />}
            valueStyle={{ fontSize: 24 }}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Louées"
            value={data.portfolioSummary.rented}
            icon={<HomeOutlined style={{ color: '#52c41a' }} />}
            valueStyle={{ fontSize: 24, color: '#52c41a' }}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Disponibles"
            value={data.portfolioSummary.available}
            icon={<HomeOutlined style={{ color: '#1890ff' }} />}
            valueStyle={{ fontSize: 24, color: '#1890ff' }}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="En maintenance"
            value={data.portfolioSummary.inMaintenance}
            icon={<ToolOutlined style={{ color: '#faad14' }} />}
            valueStyle={{ fontSize: 24, color: '#faad14' }}
          />
        </Col>
      </Row>

      {/* Revenue KPI Cards (T029) */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Revenus ce mois"
            value={formatCurrency(data.revenueMetrics.currentMonth)}
            icon={<DollarOutlined style={{ color: '#52c41a' }} />}
            valueStyle={{ fontSize: 20, color: '#52c41a' }}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Revenus cette année"
            value={formatCurrency(data.revenueMetrics.currentYear)}
            icon={<DollarOutlined style={{ color: '#1890ff' }} />}
            valueStyle={{ fontSize: 20, color: '#1890ff' }}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Revenus mois dernier"
            value={formatCurrency(data.revenueMetrics.lastMonth)}
            icon={<DollarOutlined style={{ color: '#722ed1' }} />}
            valueStyle={{ fontSize: 20 }}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Revenus année dernière"
            value={formatCurrency(data.revenueMetrics.lastYear)}
            icon={<DollarOutlined style={{ color: '#722ed1' }} />}
            valueStyle={{ fontSize: 20 }}
          />
        </Col>
      </Row>

      {/* Occupancy Rate Card (T030) */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Taux d'occupation"
              value={data.occupancyRate.toFixed(1)}
              prefix={<PercentageOutlined style={{ color: '#1890ff' }} />}
              suffix="%"
              valueStyle={{ fontSize: 24, color: '#1890ff' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Upcoming Payments and Recent Activity Row */}
      <Row gutter={[16, 16]}>
        {/* Upcoming Payments Section (T031) */}
        <Col xs={24} lg={12}>
          <Card
            title={<><CalendarOutlined /> Prochains paiements</>}
            extra={<Text type="secondary" style={{ fontSize: 12 }}>5 prochaines échéances</Text>}
          >
            {data.upcomingPayments.length > 0 ? (
              <List
                dataSource={data.upcomingPayments}
                renderItem={(payment) => (
                  <List.Item>
                    <List.Item.Meta
                      title={
                        <Space>
                          <Text strong>{formatCurrency(payment.amount)}</Text>
                          {getStatusTag(payment.status)}
                        </Space>
                      }
                      description={
                        <Space direction="vertical" size={0}>
                          <Text type="secondary">{payment.propertyAddress}</Text>
                          <Text type="secondary">Locataire: {payment.tenantName}</Text>
                          <Text type="secondary">Période: {payment.period} - {formatDate(payment.dueDate)}</Text>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Empty description="Aucune échéance à venir" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </Col>

        {/* Recent Activity Section (T032) */}
        <Col xs={24} lg={12}>
          <Card
            title={<><WalletOutlined /> Paiements récents</>}
            extra={<Text type="secondary" style={{ fontSize: 12 }}>5 derniers</Text>}
          >
            {data.recentPayments.length > 0 ? (
              <List
                dataSource={data.recentPayments}
                renderItem={(payment) => (
                  <List.Item>
                    <List.Item.Meta
                      title={
                        <Space>
                          <Text strong>{formatCurrency(payment.amount)}</Text>
                          <Tag>{getPaymentMethodLabel(payment.method)}</Tag>
                        </Space>
                      }
                      description={
                        <Space direction="vertical" size={0}>
                          <Text type="secondary">{payment.propertyAddress}</Text>
                          <Text type="secondary">Locataire: {payment.tenantName}</Text>
                          <Text type="secondary">{formatDate(payment.date)}</Text>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Empty description="Aucun paiement récent" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </Col>
      </Row>

      {/* Recent Maintenance Tickets */}
      <Row gutter={[16, 16]}>
        <Col xs={24}>
          <Card
            title={<><ToolOutlined /> Tickets de maintenance récents</>}
            extra={<Text type="secondary" style={{ fontSize: 12 }}>5 derniers</Text>}
          >
            {data.recentTickets.length > 0 ? (
              <List
                dataSource={data.recentTickets}
                renderItem={(ticket) => (
                  <List.Item>
                    <List.Item.Meta
                      title={
                        <Space>
                          <Text strong>{ticket.title}</Text>
                          {getStatusTag(ticket.status)}
                        </Space>
                      }
                      description={
                        <Space direction="vertical" size={0}>
                          <Text type="secondary">{ticket.propertyAddress}</Text>
                          <Text type="secondary">{formatDate(ticket.createdAt)}</Text>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Empty description="Aucun ticket récent" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
