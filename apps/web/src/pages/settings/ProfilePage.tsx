import React, { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Card,
  Typography,
  Descriptions,
  Avatar,
  Space,
  Tag,
  Spin,
  Divider,
} from 'antd';
import { UserOutlined, MailOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useAuth } from '../../hooks/useAuth';

const { Title, Text } = Typography;

export const ProfilePage: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, isLoading, navigate]);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" tip="Chargement..." />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <Title level={3} style={{ marginBottom: 24 }}>
          Mon profil
        </Title>

        <Card>
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
              <Avatar
                src={user.avatarUrl}
                size={80}
                icon={<UserOutlined />}
                style={{ backgroundColor: '#1890ff' }}
              />
              <div>
                <Title level={4} style={{ margin: 0 }}>
                  {user.fullName || 'Utilisateur'}
                </Title>
                <Text type="secondary">{user.email}</Text>
                <div style={{ marginTop: 8 }}>
                  <Tag color={user.globalRole === 'SUPER_ADMIN' ? 'purple' : 'blue'}>
                    {user.globalRole === 'SUPER_ADMIN' ? 'Administrateur' : 'Utilisateur'}
                  </Tag>
                  {user.emailVerified && (
                    <Tag icon={<SafetyCertificateOutlined />} color="success">
                      Email vérifié
                    </Tag>
                  )}
                </div>
              </div>
            </div>

            <Divider />

            <Descriptions title="Informations du compte" column={1} bordered size="small">
              <Descriptions.Item label={<><MailOutlined /> Email</>}>
                {user.email}
              </Descriptions.Item>
              <Descriptions.Item label={<><UserOutlined /> Nom complet</>}>
                {user.fullName || '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Compte créé le">
                {formatDate(user.createdAt)}
              </Descriptions.Item>
              <Descriptions.Item label="Dernière mise à jour">
                {formatDate(user.updatedAt)}
              </Descriptions.Item>
            </Descriptions>

            <div>
              <Link to="/forgot-password">Changer le mot de passe</Link>
            </div>
          </Space>
        </Card>
      </div>
  );
};
