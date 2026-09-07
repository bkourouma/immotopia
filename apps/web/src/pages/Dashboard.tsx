import React, { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Card,
  Row,
  Col,
  Statistic,
  Typography,
  Spin,
  Avatar,
  List,
  Space,
  Tag,
} from 'antd';
import {
  HomeOutlined,
  UserOutlined,
  DollarOutlined,
  RiseOutlined,
  BankOutlined,
  TeamOutlined,
  TransactionOutlined,
} from '@ant-design/icons';
import { useAuth } from '../hooks/useAuth';
import { DashboardLayout } from '../components/dashboard/dashboard-layout';

const { Title, Text, Paragraph } = Typography;

export const Dashboard: React.FC = () => {
  const { user, isAuthenticated, isLoading, tenantClient, isLoadingMembership } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, isLoading, navigate]);

  // Redirect tenant clients to appropriate portal based on clientType
  useEffect(() => {
    if (!isLoading && !isLoadingMembership && isAuthenticated && tenantClient) {
      if (tenantClient.clientType === 'OWNER') {
        navigate('/owner', { replace: true });
      } else if (tenantClient.clientType === 'RENTER') {
        navigate('/tenant', { replace: true });
      }
      return;
    }
  }, [isLoading, isLoadingMembership, isAuthenticated, tenantClient, navigate]);

  // Show loading while checking if user is a tenant client
  if (isLoading || isLoadingMembership) {
    return (
      <DashboardLayout>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
          <Spin size="large" tip="Chargement..." />
        </div>
      </DashboardLayout>
    );
  }

  // If user is a tenant client, don't render dashboard (redirect will happen)
  if (tenantClient) {
    const portalName = tenantClient.clientType === 'OWNER' ? 'propriétaire' : 'locataire';
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" tip={`Redirection vers le portail ${portalName}...`} />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <DashboardLayout>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Page Header */}
        <div>
          <Title level={2}>Tableau de bord</Title>
          <Paragraph type="secondary">
            Bienvenue, {user.fullName || user.email}
          </Paragraph>
        </div>

        {/* Stats Cards */}
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <Card
              extra={
                <Link to="/properties" style={{ color: '#1890ff' }}>
                  Voir tout
                </Link>
              }
            >
              <Statistic
                title="Propriétés"
                value={24}
                prefix={<HomeOutlined style={{ color: '#1890ff' }} />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card
              extra={
                <Link to="/clients" style={{ color: '#1890ff' }}>
                  Voir tout
                </Link>
              }
            >
              <Statistic
                title="Clients"
                value={156}
                prefix={<TeamOutlined style={{ color: '#52c41a' }} />}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card
              extra={
                <Link to="/reports" style={{ color: '#1890ff' }}>
                  Voir rapport
                </Link>
              }
            >
              <Statistic
                title="Revenus (mois)"
                value={45000000}
                prefix={<DollarOutlined style={{ color: '#faad14' }} />}
                formatter={(value) => {
                  return `${Number(value).toLocaleString('fr-FR')} FCFA`;
                }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card
              extra={
                <Link to="/transactions" style={{ color: '#1890ff' }}>
                  Voir tout
                </Link>
              }
            >
              <Statistic
                title="Transactions"
                value={89}
                prefix={<RiseOutlined style={{ color: '#722ed1' }} />}
              />
            </Card>
          </Col>
        </Row>

        {/* Recent Activity */}
        <Card title="Activités récentes">
          <List
            dataSource={[
              {
                title: 'Nouvelle propriété ajoutée',
                description: 'Villa moderne à Cocody - 3 chambres, 2 salles de bain',
                time: 'Il y a 2 heures',
                icon: <HomeOutlined />,
                color: '#1890ff',
              },
              {
                title: 'Nouveau client enregistré',
                description: 'Jean Kouassi - Intéressé par location',
                time: 'Il y a 5 heures',
                icon: <UserOutlined />,
                color: '#52c41a',
              },
              {
                title: 'Transaction complétée',
                description: 'Vente d\'appartement - 25 000 000 FCFA',
                time: 'Hier',
                icon: <TransactionOutlined />,
                color: '#faad14',
              },
            ]}
            renderItem={(item) => (
              <List.Item>
                <List.Item.Meta
                  avatar={
                    <Avatar
                      style={{ backgroundColor: item.color }}
                      icon={item.icon}
                    />
                  }
                  title={<Text strong>{item.title}</Text>}
                  description={
                    <Space direction="vertical" size="small">
                      <Text type="secondary">{item.description}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {item.time}
                      </Text>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </Card>

        {/* User Info Card */}
        <Card title="Informations du compte">
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} lg={6}>
              <Space direction="vertical" size="small">
                <Text type="secondary">Nom complet</Text>
                <Text strong>{user.fullName || 'Non renseigné'}</Text>
              </Space>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Space direction="vertical" size="small">
                <Text type="secondary">Email</Text>
                <Text strong>{user.email}</Text>
              </Space>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Space direction="vertical" size="small">
                <Text type="secondary">Rôle</Text>
                <Tag color={user.globalRole === 'SUPER_ADMIN' ? 'red' : 'blue'}>
                  {user.globalRole === 'SUPER_ADMIN' ? 'Super Administrateur' : 'Utilisateur'}
                </Tag>
              </Space>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Space direction="vertical" size="small">
                <Text type="secondary">Date d'inscription</Text>
                <Text strong>{formatDate(user.createdAt)}</Text>
              </Space>
            </Col>
          </Row>
        </Card>
      </Space>
    </DashboardLayout>
  );
};

