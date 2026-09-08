import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Typography, Alert, Spin, Statistic, Space } from 'antd';
import { BankOutlined, TeamOutlined, CreditCardOutlined, BarChartOutlined } from '@ant-design/icons';
import { getGlobalStatistics, GlobalStatistics } from '../../services/statistics-service';

const { Title, Text } = Typography;

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
        setError('Erreur lors du chargement des statistiques');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors du chargement des statistiques');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 256 }}>
          <Spin size="large" />
        </div>
      </>
    );
  }

  if (error || !stats) {
    return (
      <>
        <Alert message="Erreur" description={error || 'Erreur lors du chargement'} type="error" showIcon />
      </>
    );
  }

  const statCards = [
    {
      title: 'Total Tenants',
      value: stats.totalTenants,
      icon: <BankOutlined style={{ fontSize: 24, color: '#1677ff' }} />,
      footer: (
        <>
          <Text type="success">{stats.activeTenants} actifs</Text>
          {stats.suspendedTenants > 0 && (
            <>
              <Text type="danger" style={{ marginLeft: 8 }}>
                {stats.suspendedTenants} suspendus
              </Text>
            </>
          )}
        </>
      )
    },
    {
      title: 'Collaborateurs',
      value: stats.totalCollaborators,
      icon: <TeamOutlined style={{ fontSize: 24, color: '#52c41a' }} />,
      footer: <Text type="success">{stats.activeCollaborators} actifs</Text>
    },
    {
      title: 'Abonnements',
      value: stats.totalSubscriptions,
      icon: <CreditCardOutlined style={{ fontSize: 24, color: '#722ed1' }} />,
      footer: (
        <>
          <Text type="success">{stats.activeSubscriptions} actifs</Text>
          {stats.cancelledSubscriptions > 0 && (
            <>
              <Text type="danger" style={{ marginLeft: 8 }}>
                {stats.cancelledSubscriptions} annulés
              </Text>
            </>
          )}
        </>
      )
    },
    {
      title: 'Modules Activés',
      value: Object.keys(stats.moduleActivations).length,
      icon: <BarChartOutlined style={{ fontSize: 24, color: '#faad14' }} />,
      footer: (
        <Text type="secondary">
          {Object.entries(stats.moduleActivations)
            .slice(0, 2)
            .map(([key, value]) => `${key}: ${value}`)
            .join(' · ')}
        </Text>
      )
    }
  ];

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Statistiques Globales
          </Title>
          <Text type="secondary">Vue d&apos;ensemble de la plateforme</Text>
        </div>

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
          <Card title="Activations par Module">
            <Row gutter={[16, 16]}>
              {Object.entries(stats.moduleActivations).map(([moduleKey, count]) => (
                <Col xs={24} sm={12} key={moduleKey}>
                  <Card size="small" style={{ background: 'var(--ant-color-fill-quaternary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text>{moduleKey}</Text>
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
