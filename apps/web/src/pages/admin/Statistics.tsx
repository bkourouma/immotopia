import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Typography, Statistic, Space } from 'antd';
import { BankOutlined, TeamOutlined, CreditCardOutlined, BarChartOutlined } from '@ant-design/icons';
import { getGlobalStatistics, GlobalStatistics } from '../../services/statistics-service';
import { getModuleKeyLabelFr } from '../../constants/module-labels';
import { t } from '../../i18n/t';
import { HelpSectionTitle } from '../../help';
import { PageHeader, SkeletonStats, StateBlock } from '../../components/primitives';

const { Text } = Typography;

export const Statistics: React.FC = () => {
  const [stats, setStats] = useState<GlobalStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStatistics();
  }, []);

  const loadStatistics = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getGlobalStatistics();
      if (response.success) {
        setStats(response.data);
      } else {
        setError(t('Erreur lors du chargement des statistiques'));
      }
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: unknown } } } | null)?.response?.data?.message;
      setError(typeof message === 'string' && message ? message : t('Erreur lors du chargement des statistiques'));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <SkeletonStats aria-label={t('Chargement des statistiques')} />;
  }

  if (error || !stats) {
    return (
      <StateBlock
        variant="error"
        title={t('Statistiques indisponibles')}
        description={error || t('Erreur lors du chargement')}
        actions={[{ label: t('Réessayer'), primary: true, onClick: () => void loadStatistics() }]}
      />
    );
  }

  const statCards = [
    {
      title: t('Total agences'),
      value: stats.totalTenants,
      icon: <BankOutlined style={{ fontSize: 24, color: '#1677ff' }} />,
      footer: (
        <>
          <Text type="success">{t('{{value}} actifs', { value: stats.activeTenants })}</Text>
          {stats.suspendedTenants > 0 && (
            <>
              <Text type="danger" style={{ marginInlineStart: 8 }}>
                {t('{{value}} suspendus', { value: stats.suspendedTenants })}
              </Text>
            </>
          )}
        </>
      )
    },
    {
      title: t('Collaborateurs'),
      value: stats.totalCollaborators,
      icon: <TeamOutlined style={{ fontSize: 24, color: '#52c41a' }} />,
      footer: <Text type="success">{t('{{value}} actifs', { value: stats.activeCollaborators })}</Text>
    },
    {
      title: t('Abonnements'),
      value: stats.totalSubscriptions,
      icon: <CreditCardOutlined style={{ fontSize: 24, color: '#722ed1' }} />,
      footer: (
        <>
          <Text type="success">{t('{{value}} actifs', { value: stats.subscriptionsByStatus.ACTIVE })}</Text>
          {stats.subscriptionsByStatus.TRIALING > 0 && (
            <Text type="secondary" style={{ marginInlineStart: 8 }}>
              {t('{{value}} en essai', { value: stats.subscriptionsByStatus.TRIALING })}
            </Text>
          )}
          {stats.subscriptionsByStatus.CANCELED > 0 && (
            <Text type="danger" style={{ marginInlineStart: 8 }}>
              {t('{{value}} annulés', { value: stats.subscriptionsByStatus.CANCELED })}
            </Text>
          )}
        </>
      )
    },
    {
      title: t('Modules activés'),
      value: Object.keys(stats.moduleActivations).length,
      icon: <BarChartOutlined style={{ fontSize: 24, color: '#faad14' }} />,
      footer: (
        <Text type="secondary">
          {Object.entries(stats.moduleActivations)
            .slice(0, 2)
            .map(([key, value]) => `${getModuleKeyLabelFr(key)} : ${value}`)
            .join(' · ')}
        </Text>
      )
    }
  ];

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <PageHeader
          title={t('Statistiques Globales')}
          subtitle={t("Vue d'ensemble de la plateforme")}
          helpId="administration.pilotage.statistiques.indicateurs"
        />

        <Row gutter={[24, 24]}>
          {statCards.map((item, index) => (
            <Col xs={24} sm={12} lg={6} key={index}>
              <Card>
                <Space align="start" style={{ width: '100%' }}>
                  {item.icon}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Statistic title={item.title} value={item.value} />
                    <div style={{ marginTop: 12, fontSize: 12 }}>{item.footer}</div>
                  </div>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>

        {Object.keys(stats.moduleActivations).length > 0 && (
          <Card
            title={
              <HelpSectionTitle
                title={t('Activations par module')}
                helpId="administration.pilotage.statistiques.modules"
              />
            }
          >
            <Row gutter={[16, 16]}>
              {Object.entries(stats.moduleActivations).map(([moduleKey, count]) => (
                <Col xs={24} sm={12} key={moduleKey}>
                  <Card size="small" style={{ background: 'var(--ant-color-fill-quaternary)' }}>
                    <div className="it-toolbar">
                      <Text>{getModuleKeyLabelFr(moduleKey)}</Text>
                      <Text strong>{count}</Text>
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>
          </Card>
        )}
      </Space>
    </>
  );
};
