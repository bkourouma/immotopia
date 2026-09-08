import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card, Button, Tabs, Space, Typography, Empty } from 'antd';
import { FileTextOutlined, ArrowRightOutlined, ShoppingCartOutlined, HomeOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';

const { Title, Text } = Typography;

export const Transactions: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { tenantMembership } = useAuth();
  const tenantId = tenantMembership?.tenantId;

  // Determine active tab from URL
  const getActiveTab = (): 'all' | 'sales' | 'rentals' => {
    if (location.pathname.includes('/sales')) return 'sales';
    if (location.pathname.includes('/rentals')) return 'rentals';
    return 'all';
  };

  const [activeTab, setActiveTab] = useState<'all' | 'sales' | 'rentals'>(getActiveTab());

  useEffect(() => {
    setActiveTab(getActiveTab());
  }, [location.pathname]);

  const handleTabChange = (key: string) => {
    if (key === 'all') {
      navigate('/transactions');
    } else if (key === 'sales') {
      navigate('/transactions/sales');
    } else if (key === 'rentals') {
      navigate('/transactions/rentals');
    }
  };

  if (!tenantId) {
    return (
      <>
        <Card>
          <Text type="secondary">Aucun tenant sélectionné.</Text>
        </Card>
      </>
    );
  }

  const getTitle = () => {
    switch (activeTab) {
      case 'sales':
        return 'Ventes';
      case 'rentals':
        return 'Locations';
      default:
        return 'Toutes les transactions';
    }
  };

  const getDescription = () => {
    switch (activeTab) {
      case 'sales':
        return 'Gérez vos transactions de vente depuis le module CRM.';
      case 'rentals':
        return 'Gérez vos baux et locations depuis le module Location.';
      default:
        return 'Consultez vos deals CRM pour les ventes et vos baux pour les locations.';
    }
  };

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Title level={2} style={{ margin: 0 }}>
              Transactions
            </Title>
            <Text type="secondary">Gérez vos transactions immobilières (ventes et locations)</Text>
          </div>
        </div>

        {/* Tabs */}
        <Tabs
          activeKey={activeTab}
          onChange={handleTabChange}
          items={[
            {
              key: 'all',
              label: 'Toutes les transactions'
            },
            {
              key: 'sales',
              label: 'Ventes'
            },
            {
              key: 'rentals',
              label: 'Locations'
            }
          ]}
        />

        {/* Content */}
        <Card>
          <Empty
            image={<FileTextOutlined style={{ fontSize: 64, color: '#d9d9d9' }} />}
            description={
              <Space direction="vertical" size="small">
                <Title level={4} style={{ margin: 0 }}>
                  {getTitle()}
                </Title>
                <Text type="secondary">{getDescription()}</Text>
              </Space>
            }
          >
            <Space>
              {(activeTab === 'all' || activeTab === 'sales') && (
                <Button
                  type="primary"
                  icon={<ShoppingCartOutlined />}
                  onClick={() => navigate(`/tenant/${tenantId}/crm/deals`)}
                >
                  Voir les deals CRM
                </Button>
              )}
              {(activeTab === 'all' || activeTab === 'rentals') && (
                <Button icon={<HomeOutlined />} onClick={() => navigate(`/tenant/${tenantId}/rental/leases`)}>
                  Voir les baux
                </Button>
              )}
            </Space>
          </Empty>
        </Card>
      </Space>
    </>
  );
};
