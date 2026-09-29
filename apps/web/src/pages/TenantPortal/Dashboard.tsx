import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Row, Col, Statistic, Typography, Spin, Alert, Space, Tag, List, Empty, Button } from 'antd';
import {
  HomeOutlined,
  DollarOutlined,
  CalendarOutlined,
  SafetyOutlined,
  WalletOutlined,
  ToolOutlined,
  WarningOutlined,
  CreditCardOutlined
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { tenantPortalService } from '../../services/tenantPortalService';
import { getOnlinePaymentAvailability } from '../../services/payment-gateway-service';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
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
    /** Reste dû. */
    amount: number;
    totalAmount?: number;
    amountPaid?: number;
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
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);

  // Paiement en ligne (Lot 7) : le bouton n'apparaît que si l'agence a activé
  // PaySecureHub et qu'il reste effectivement un montant dû.
  const { data: onlinePaymentAvailability } = useQuery({
    queryKey: ['online-payment-availability'],
    queryFn: () => getOnlinePaymentAvailability(),
    staleTime: 60_000,
    retry: false
  });

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
        setError(t('Erreur lors du chargement du tableau de bord'));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('Erreur lors du chargement du tableau de bord'));
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(activeLocale(), {
      style: 'currency',
      currency: 'XOF',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(activeLocale(), {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getPaymentMethodLabel = (method: string) => {
    const methods: Record<string, string> = {
      CASH: t('Espèces'),
      BANK_TRANSFER: t('Virement bancaire'),
      CHECK: t('Chèque'),
      MOBILE_MONEY: t('Mobile Money'),
      CARD: 'Carte',
      OTHER: 'Autre'
    };
    return methods[method] || method;
  };

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { label: string; color: string }> = {
      ACTIVE: { label: t('Actif'), color: 'success' },
      DRAFT: { label: t('Brouillon'), color: 'default' },
      SUSPENDED: { label: t('Suspendu'), color: 'warning' },
      ENDED: { label: t('Terminé'), color: 'default' },
      CANCELED: { label: t('Annulé'), color: 'error' }
    };
    const config = statusMap[status] || { label: status, color: 'default' };
    return <Tag color={config.color}>{config.label}</Tag>;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" tip={t('Chargement du tableau de bord...')} />
      </div>
    );
  }

  if (error) {
    return <Alert message={t('Erreur')} description={error} type="error" showIcon />;
  }

  if (!data) {
    return <Empty description={t('Aucune donnée disponible')} />;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Page Header */}
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}
      >
        <div>
          <Title level={2}>{t('Tableau de bord')}</Title>
          <Text type="secondary">{t("Vue d'ensemble de votre situation locative")}</Text>
        </div>
        {onlinePaymentAvailability?.available && data.currentBalance > 0 ? (
          <Button type="primary" icon={<CreditCardOutlined aria-hidden />} onClick={() => navigate('/tenant/payments')}>
            {t('Payer en ligne')}
          </Button>
        ) : null}
      </div>

      {/* Lease Overview Card (T028) */}
      <Card
        title={
          <>
            <HomeOutlined /> {t('Informations du bail')}
          </>
        }
      >
        <Row gutter={16}>
          <Col xs={24} sm={12} md={8}>
            <Text type="secondary">{t('Adresse')}</Text>
            <div style={{ marginTop: 4 }}>
              <Text strong>{data.lease.propertyAddress}</Text>
            </div>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Text type="secondary">{t('Loyer mensuel')}</Text>
            <div style={{ marginTop: 4 }}>
              <Text strong>{formatCurrency(data.lease.monthlyRent)}</Text>
            </div>
          </Col>
          <Col xs={24} sm={12} md={8}>
            <Text type="secondary">{t('Charges')}</Text>
            <div style={{ marginTop: 4 }}>
              <Text strong>{formatCurrency(data.lease.serviceCharges)}</Text>
            </div>
          </Col>
          <Col xs={24} sm={12} md={8} style={{ marginTop: 16 }}>
            <Text type="secondary">{t('Date de début')}</Text>
            <div style={{ marginTop: 4 }}>
              <Text>{formatDate(data.lease.startDate)}</Text>
            </div>
          </Col>
          <Col xs={24} sm={12} md={8} style={{ marginTop: 16 }}>
            <Text type="secondary">{t('Date de fin')}</Text>
            <div style={{ marginTop: 4 }}>
              <Text>{data.lease.endDate ? formatDate(data.lease.endDate) : t('Non définie')}</Text>
            </div>
          </Col>
          <Col xs={24} sm={12} md={8} style={{ marginTop: 16 }}>
            <Text type="secondary">{t('Statut')}</Text>
            <div style={{ marginTop: 4 }}>{getStatusTag(data.lease.status)}</div>
          </Col>
        </Row>
      </Card>

      {/* Stats Cards Row */}
      <Row gutter={[16, 16]}>
        {/* Overdue Installments Card (T029) */}
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title={t('Retard des échéances')}
              value={data.overdueInstallmentsCount ?? 0}
              prefix={<WarningOutlined style={{ color: data.overdueInstallmentsCount > 0 ? '#ff4d4f' : '#d9d9d9' }} />}
              valueStyle={{ color: data.overdueInstallmentsCount > 0 ? '#ff4d4f' : '#000000' }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {data.overdueInstallmentsCount === 0
                ? t('Aucune échéance en retard')
                : data.overdueInstallmentsCount === 1
                  ? t('1 échéance en retard')
                  : t('{{overdueInstallmentsCount}} échéances en retard', {
                      overdueInstallmentsCount: data.overdueInstallmentsCount
                    })}
            </Text>
          </Card>
        </Col>

        {/* Next Installment Card (T030) */}
        <Col xs={24} sm={12} lg={8}>
          <Card>
            {data.nextInstallment ? (
              <>
                <Statistic
                  title={t('Prochaine échéance')}
                  value={formatCurrency(data.nextInstallment.amount)}
                  prefix={<CalendarOutlined style={{ color: '#1890ff' }} />}
                  valueStyle={{ color: '#1890ff' }}
                />
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {formatDate(data.nextInstallment.dueDate)} ({data.nextInstallment.period})
                  </Text>
                </div>
                {(data.nextInstallment.amountPaid ?? 0) > 0 && (
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {t('Reste dû : {{paid}} déjà réglés sur {{total}}', {
                        paid: formatCurrency(data.nextInstallment.amountPaid ?? 0),
                        total: formatCurrency(data.nextInstallment.totalAmount ?? data.nextInstallment.amount)
                      })}
                    </Text>
                  </div>
                )}
              </>
            ) : (
              <>
                <Statistic
                  title={t('Prochaine échéance')}
                  value={0}
                  prefix={<CalendarOutlined style={{ color: '#d9d9d9' }} />}
                  valueStyle={{ color: '#d9d9d9' }}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {t('Aucune échéance à venir')}
                </Text>
              </>
            )}
          </Card>
        </Col>

        {/* Deposit Info Card (T031) */}
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title={t('Dépôt de garantie')}
              value={formatCurrency(data.depositInfo.collectedAmount)}
              prefix={
                <SafetyOutlined style={{ color: data.depositInfo.status === 'COLLECTED' ? '#52c41a' : '#722ed1' }} />
              }
              valueStyle={{ color: data.depositInfo.status === 'COLLECTED' ? '#52c41a' : '#722ed1' }}
              suffix={data.depositInfo.amount > 0 ? ` / ${formatCurrency(data.depositInfo.amount)}` : ''}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {data.depositInfo.status === 'COLLECTED'
                ? t('Dépôt effectué')
                : data.depositInfo.status === 'PARTIAL'
                  ? t('Montant versé / Montant total')
                  : data.depositInfo.amount > 0
                    ? t('Montant versé / Montant total')
                    : t('Aucun dépôt configuré')}
            </Text>
          </Card>
        </Col>
      </Row>

      {/* Recent Payments and Maintenance Summary Row */}
      <Row gutter={[16, 16]}>
        {/* Recent Payments List (T032) */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <>
                <WalletOutlined /> {t('Paiements récents')}
              </>
            }
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                5 derniers
              </Text>
            }
          >
            {data.recentPayments.length > 0 ? (
              <List
                dataSource={data.recentPayments}
                renderItem={payment => (
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
              <Empty description={t('Aucun paiement récent')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </Col>

        {/* Maintenance Summary Section (T033) */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <>
                <ToolOutlined /> {t('Résumé maintenance')}
              </>
            }
          >
            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <Statistic title={t('Total')} value={data.maintenanceTickets.total} valueStyle={{ fontSize: 24 }} />
              </Col>
              <Col xs={24} sm={12}>
                <Statistic
                  title={t('Ouverts')}
                  value={data.maintenanceTickets.open}
                  valueStyle={{ color: '#faad14', fontSize: 24 }}
                />
              </Col>
              <Col xs={24} sm={12} style={{ marginTop: 16 }}>
                <Statistic
                  title={t('En cours')}
                  value={data.maintenanceTickets.inProgress}
                  valueStyle={{ color: '#1890ff', fontSize: 24 }}
                />
              </Col>
              <Col xs={24} sm={12} style={{ marginTop: 16 }}>
                <Statistic
                  title={t('Résolus')}
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
