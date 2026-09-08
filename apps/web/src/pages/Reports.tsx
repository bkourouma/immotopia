import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Row, Col, Space, Typography } from 'antd';
import { BarChartOutlined, FileTextOutlined, RiseOutlined, DollarOutlined, HomeOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';

const { Title, Text } = Typography;

export const Reports: React.FC = () => {
  const navigate = useNavigate();
  const { tenantMembership } = useAuth();
  const tenantId = tenantMembership?.tenantId;

  if (!tenantId) {
    return (
      <>
        <Card>
          <Text type="secondary">Aucun tenant sélectionné.</Text>
        </Card>
      </>
    );
  }

  const reportCards = [
    {
      title: 'Rapports de ventes',
      description: 'Analysez vos transactions de vente et vos deals CRM',
      icon: <RiseOutlined style={{ fontSize: 32 }} />,
      href: `/tenant/${tenantId}/crm/deals`,
      color: '#1890ff'
    },
    {
      title: 'Rapports de locations',
      description: 'Consultez les statistiques de vos baux et paiements',
      icon: <DollarOutlined style={{ fontSize: 32 }} />,
      href: `/tenant/${tenantId}/rental/leases`,
      color: '#52c41a'
    },
    {
      title: 'Rapports de propriétés',
      description: 'Analysez votre portefeuille immobilier',
      icon: <HomeOutlined style={{ fontSize: 32 }} />,
      href: `/tenant/${tenantId}/properties`,
      color: '#722ed1'
    },
    {
      title: 'Documents générés',
      description: 'Consultez tous les documents générés',
      icon: <FileTextOutlined style={{ fontSize: 32 }} />,
      href: `/tenant/${tenantId}/rental/documents`,
      color: '#fa8c16'
    }
  ];

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Title level={2} style={{ margin: 0 }}>
              Rapports
            </Title>
            <Text type="secondary">Analysez vos données et générez des rapports détaillés</Text>
          </div>
        </div>

        {/* Report Cards Grid */}
        <Row gutter={[16, 16]}>
          {reportCards.map((card, index) => (
            <Col xs={24} md={12} key={index}>
              <Card hoverable style={{ height: '100%' }}>
                <Space size="middle" style={{ width: '100%' }}>
                  <div
                    style={{
                      backgroundColor: card.color,
                      color: '#fff',
                      padding: '12px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: '56px',
                      height: '56px'
                    }}
                  >
                    {card.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <Title level={5} style={{ margin: 0, marginBottom: 8 }}>
                      {card.title}
                    </Title>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                      {card.description}
                    </Text>
                    <Button onClick={() => navigate(card.href)} block>
                      Consulter
                    </Button>
                  </div>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>

        {/* Coming Soon Section */}
        <Card>
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <BarChartOutlined style={{ fontSize: 64, color: '#d9d9d9', marginBottom: 16 }} />
            <Title level={4} style={{ marginBottom: 8 }}>
              Rapports avancés à venir
            </Title>
            <Text type="secondary" style={{ maxWidth: '600px', margin: '0 auto', display: 'block' }}>
              Nous travaillons sur des fonctionnalités de reporting avancées incluant des graphiques interactifs, des
              exports personnalisés et des analyses prédictives. Ces fonctionnalités seront disponibles prochainement.
            </Text>
          </div>
        </Card>
      </Space>
    </>
  );
};
