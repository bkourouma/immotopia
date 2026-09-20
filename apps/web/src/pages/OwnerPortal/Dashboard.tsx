import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Typography, Spin, Alert, Space, Tag, List, Empty, Button } from 'antd';
import {
  BankOutlined,
  DollarOutlined,
  CalendarOutlined,
  WalletOutlined,
  ToolOutlined,
  HomeOutlined,
  PercentageOutlined,
  SyncOutlined
} from '@ant-design/icons';
import { ownerPortalService } from '../../services/ownerPortalService';
import { StatCard } from '../../components/OwnerPortal/StatCard';
import { t } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
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
      DUE: { label: t('Échéance'), color: 'warning' },
      OVERDUE: { label: t('En retard'), color: 'error' },
      PAID: { label: t('Payé'), color: 'success' },
      DECLARED: { label: t('Déclaré'), color: 'default' },
      IN_PROGRESS: { label: t('En cours'), color: 'processing' },
      RESOLVED: { label: t('Résolu'), color: 'success' }
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
      <div className="it-toolbar">
        <div>
          <Title level={2}>{t('Tableau de bord')}</Title>
          <Text type="secondary">{t("Vue d'ensemble de votre portefeuille immobilier")}</Text>
        </div>
        <Button
          icon={<SyncOutlined />}
          onClick={loadDashboard}
          loading={loading}
          aria-label={t('Rafraîchir le tableau de bord')}
        >
          {t('Actualiser')}
        </Button>
      </div>

      {/* Rangee d'indicateurs (T028-T030).
          Les trois rangees d'origine — patrimoine, revenus, occupation — n'en
          font plus qu'une, reglee sur quatre cartes par ligne. « Revenus année
          dernière » a ete retire : c'est le seul chiffre de la serie qui ne
          bouge plus jamais, et il repoussait l'activite sous la ligne de
          flottaison. Restent huit indicateurs, soit deux rangees pleines — pas
          de carte orpheline en bout de ligne, ce que faisait le taux
          d'occupation seul sur la sienne. Le passage a quatre par ligne se fait
          a 1200 px et non a 992 : en dessous, la barre laterale ne laisse que
          160 px par carte, ou « 2 450 000 F CFA » ne tient pas. */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            compact
            title={t('Total propriétés')}
            value={data.portfolioSummary.total}
            icon={<BankOutlined style={{ color: '#1890ff' }} />}
            valueStyle={{ fontSize: 24 }}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            compact
            title={t('Louées')}
            value={data.portfolioSummary.rented}
            icon={<HomeOutlined style={{ color: '#52c41a' }} />}
            valueStyle={{ fontSize: 24, color: '#52c41a' }}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            compact
            title={t('Disponibles')}
            value={data.portfolioSummary.available}
            icon={<HomeOutlined style={{ color: '#1890ff' }} />}
            valueStyle={{ fontSize: 24, color: '#1890ff' }}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            compact
            title={t('En maintenance')}
            value={data.portfolioSummary.inMaintenance}
            icon={<ToolOutlined style={{ color: '#faad14' }} />}
            valueStyle={{ fontSize: 24, color: '#faad14' }}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            compact
            title={t("Taux d'occupation")}
            value={data.occupancyRate.toFixed(1)}
            suffix="%"
            icon={<PercentageOutlined style={{ color: '#1890ff' }} />}
            valueStyle={{ fontSize: 24, color: '#1890ff' }}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            compact
            title={t('Revenus ce mois')}
            value={formatCurrency(data.revenueMetrics.currentMonth)}
            icon={<DollarOutlined style={{ color: '#52c41a' }} />}
            valueStyle={{ color: '#52c41a' }}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            compact
            title={t('Revenus cette année')}
            value={formatCurrency(data.revenueMetrics.currentYear)}
            icon={<DollarOutlined style={{ color: '#1890ff' }} />}
            valueStyle={{ color: '#1890ff' }}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            compact
            title={t('Revenus mois dernier')}
            value={formatCurrency(data.revenueMetrics.lastMonth)}
            icon={<DollarOutlined style={{ color: '#722ed1' }} />}
          />
        </Col>
      </Row>

      {/* Upcoming Payments and Recent Activity Row */}
      <Row gutter={[16, 16]}>
        {/* Upcoming Payments Section (T031) */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <>
                <CalendarOutlined /> {t('Prochains paiements')}
              </>
            }
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('5 prochaines échéances')}
              </Text>
            }
          >
            {data.upcomingPayments.length > 0 ? (
              <List
                dataSource={data.upcomingPayments}
                renderItem={payment => (
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
                          <Text type="secondary">
                            {t('Période:')} {payment.period} - {formatDate(payment.dueDate)}
                          </Text>
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Empty description={t('Aucune échéance à venir')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </Col>

        {/* Recent Activity Section (T032) */}
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
              <Empty description={t('Aucun paiement récent')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </Col>
      </Row>

      {/* Recent Maintenance Tickets */}
      <Row gutter={[16, 16]}>
        <Col xs={24}>
          <Card
            title={
              <>
                <ToolOutlined /> {t('Tickets de maintenance récents')}
              </>
            }
            extra={
              <Text type="secondary" style={{ fontSize: 12 }}>
                5 derniers
              </Text>
            }
          >
            {data.recentTickets.length > 0 ? (
              <List
                dataSource={data.recentTickets}
                renderItem={ticket => (
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
              <Empty description={t('Aucun ticket récent')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
