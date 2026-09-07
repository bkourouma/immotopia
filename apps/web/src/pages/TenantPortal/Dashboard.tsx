import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Typography, Spin, Alert, Space, Tag, List, Empty } from 'antd';
import {
  HomeOutlined,
  DollarOutlined,
  CalendarOutlined,
  SafetyOutlined,
  WalletOutlined,
  ToolOutlined,
  WarningOutlined
} from '@ant-design/icons';
import { tenantPortalService } from '../../services/tenantPortalService';

const { Title, Text } = Typography;

interface DashboardData {
  lease: {
    id: string;
    propertyAddress: string;
    startDate: string;
    endDate: string | null;
    monthlyRent: number;
    serviceCharges: number;
    status: string;
  };
  currentBalance: number;
  overdueInstallmentsCount: number;
  nextInstallment: {
    id: string;
    period: string;
    dueDate: string;
    amount: number;
    status: string;
  } | null;
  recentPayments: Array<{
    id: string;
    amount: number;
    date: string;
    method: string;
  }>;
  depositInfo: {
    amount: number;
    status: string;
    heldAmount: number;
    collectedAmount: number;
  };
  maintenanceTickets: {
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
  };
}

export default function TenantDashboard() {
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
      const response = await tenantPortalService.getDashboard();
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
      ACTIVE: { label: 'Actif', color: 'success' },
      DRAFT: { label: 'Brouillon', color: 'default' },
      SUSPENDED: { label: 'Suspendu', color: 'warning' },
      ENDED: { label: 'Terminé', color: 'default' },
      CANCELED: { label: 'Annulé', color: 'error' }
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
      <div>
        <Title level={2}>Tableau de bord</Title>
        <Text type="secondary">Vue d'ensemble de votre situation locative</Text>
      </div>

      {/* Lease Overview Card (T028) */}
      <Card title={<><HomeOutlined /> Informations du bail</>}>
        <Row gutter={16}>
          <Col xs={24} sm={12} md={8}>
            <Text type="secondary">Adresse</Text>
            <div style={{ marginTop: 4 }}>
              <Text strong>{data.lease.propertyAddress}</Text>
            </div>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Text type="secondary">Loyer mensuel</Text>
            <div style={{ marginTop: 4 }}>
              <Text strong>{formatCurrency(data.lease.monthlyRent)}</Text>
            </div>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Text type="secondary">Charges</Text>
            <div style={{ marginTop: 4 }}>
              <Text strong>{formatCurrency(data.lease.serviceCharges)}</Text>
            </div>
          </Col>
          <Col xs={24} sm={12} md={8} style={{ marginTop: 16 }}>
            <Text type="secondary">Date de début</Text>
            <div style={{ marginTop: 4 }}>
              <Text>{formatDate(data.lease.startDate)}</Text>
            </div>
          </Col>
          <Col xs={24} sm={12} md={8} style={{ marginTop: 16 }}>
            <Text type="secondary">Date de fin</Text>
            <div style={{ marginTop: 4 }}>
              <Text>{data.lease.endDate ? formatDate(data.lease.endDate) : 'Non définie'}</Text>
            </div>
          </Col>
          <Col xs={24} sm={12} md={8} style={{ marginTop: 16 }}>
            <Text type="secondary">Statut</Text>
            <div style={{ marginTop: 4 }}>
              {getStatusTag(data.lease.status)}
            </div>
          </Col>
        </Row>
      </Card>

      {/* Stats Cards Row */}
      <Row gutter={[16, 16]}>
        {/* Overdue Installments Card (T029) */}
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="Retard des échéances"
              value={data.overdueInstallmentsCount ?? 0}
              prefix={<WarningOutlined style={{ color: data.overdueInstallmentsCount > 0 ? '#ff4d4f' : '#d9d9d9' }} />}
              valueStyle={{ color: data.overdueInstallmentsCount > 0 ? '#ff4d4f' : '#000000' }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {data.overdueInstallmentsCount === 0
                ? 'Aucune échéance en retard'
                : data.overdueInstallmentsCount === 1
                  ? '1 échéance en retard'
                  : `${data.overdueInstallmentsCount} échéances en retard`}
            </Text>
          </Card>
        </Col>

        {/* Next Installment Card (T030) */}
        <Col xs={24} sm={12} lg={8}>
          <Card>
            {data.nextInstallment ? (
              <>
                <Statistic
                  title="Prochaine échéance"
                  value={formatCurrency(data.nextInstallment.amount)}
                  prefix={<CalendarOutlined style={{ color: '#1890ff' }} />}
                  valueStyle={{ color: '#1890ff' }}
                />
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {formatDate(data.nextInstallment.dueDate)} ({data.nextInstallment.period})
                  </Text>
                </div>
              </>
            ) : (
              <>
                <Statistic
                  title="Prochaine échéance"
                  value={0}
                  prefix={<CalendarOutlined style={{ color: '#d9d9d9' }} />}
                  valueStyle={{ color: '#d9d9d9' }}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Aucune échéance à venir
                </Text>
              </>
            )}
          </Card>
        </Col>

        {/* Deposit Info Card (T031) */}
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="Dépôt de garantie"
              value={formatCurrency(data.depositInfo.collectedAmount)}
              prefix={<SafetyOutlined style={{ color: data.depositInfo.status === 'COLLECTED' ? '#52c41a' : '#722ed1' }} />}
              valueStyle={{ color: data.depositInfo.status === 'COLLECTED' ? '#52c41a' : '#722ed1' }}
              suffix={data.depositInfo.amount > 0 ? ` / ${formatCurrency(data.depositInfo.amount)}` : ''}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {data.depositInfo.status === 'COLLECTED'
                ? 'Dépôt effectué'
                : data.depositInfo.status === 'PARTIAL'
                  ? 'Montant versé / Montant total'
                  : data.depositInfo.amount > 0
                    ? 'Montant versé / Montant total'
                    : 'Aucun dépôt configuré'}
            </Text>
          </Card>
        </Col>
      </Row>

      {/* Recent Payments and Maintenance Summary Row */}
      <Row gutter={[16, 16]}>
        {/* Recent Payments List (T032) */}
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
                      description={formatDate(payment.date)}
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Empty description="Aucun paiement récent" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </Col>

        {/* Maintenance Summary Section (T033) */}
        <Col xs={24} lg={12}>
          <Card title={<><ToolOutlined /> Résumé maintenance</>}>
            <Row gutter={16}>
              <Col span={12}>
                <Statistic
                  title="Total"
                  value={data.maintenanceTickets.total}
                  valueStyle={{ fontSize: 24 }}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="Ouverts"
                  value={data.maintenanceTickets.open}
                  valueStyle={{ color: '#faad14', fontSize: 24 }}
                />
              </Col>
              <Col span={12} style={{ marginTop: 16 }}>
                <Statistic
                  title="En cours"
                  value={data.maintenanceTickets.inProgress}
                  valueStyle={{ color: '#1890ff', fontSize: 24 }}
                />
              </Col>
              <Col span={12} style={{ marginTop: 16 }}>
                <Statistic
                  title="Résolus"
                  value={data.maintenanceTickets.resolved}
                  valueStyle={{ color: '#52c41a', fontSize: 24 }}
                />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
