import React from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import {
  Form,
  Input,
  Button,
  Card,
  Alert,
  Checkbox,
  Divider,
  Space,
  Row,
  Col,
  Typography,
  Tag,
} from 'antd';
import {
  SafetyOutlined,
  CrownOutlined,
  HomeOutlined,
  UserOutlined,
  TeamOutlined,
  BankOutlined,
  LoginOutlined,
} from '@ant-design/icons';
import { useAuth } from '../hooks/useAuth';
import { LoginCredentials } from '../types/auth-types';

const { Title, Text, Paragraph } = Typography;

// Test users for quick login (matching seeded database)
const TEST_USERS = [
  {
    email: 'admin@immobillier.com',
    password: 'Admin@123456',
    name: 'Super Administrateur',
    role: 'SUPER_ADMIN',
    category: 'platform',
    icon: CrownOutlined,
    color: 'purple',
    badge: 'Platform Admin'
  },
  {
    email: 'visitor@immobillier.com',
    password: 'Test@123456',
    name: 'Visiteur Non Lié',
    role: 'VISITOR',
    category: 'public',
    icon: UserOutlined,
    color: 'default',
    badge: 'Public User'
  },
  {
    email: 'scolarflow@gmail.com',
    password: 'Test@123456',
    name: 'Amadou Koné',
    role: 'ADMIN @ Agence Mali',
    category: 'tenant-admin',
    icon: BankOutlined,
    color: 'red',
    badge: 'Tenant Admin'
  },
  {
    email: 'admin2@bamako-immo.com',
    password: 'Test@123456',
    name: 'Fatima Traoré',
    role: 'ADMIN @ Bamako Immo',
    category: 'tenant-admin',
    icon: BankOutlined,
    color: 'purple',
    badge: 'Tenant Admin'
  },
  {
    email: 'agent@agence-mali.com',
    password: 'Test@123456',
    name: 'Moussa Diarra',
    role: 'AGENT @ Agence Mali',
    category: 'collaborator',
    icon: TeamOutlined,
    color: 'blue',
    badge: 'Collaborator'
  },
  {
    email: 'collab7.koffi.n\'guessan@agence-mali.com',
    password: 'Test@123456',
    name: 'Koffi N\'Guessan',
    role: 'TENANT AGENT @ Agence Mali',
    category: 'collaborator',
    icon: TeamOutlined,
    color: 'blue',
    badge: 'Tenant Agent'
  },
  {
    email: 'mickael.andjui.21@gmail.com',
    password: 'P@ssw0rd_2025',
    name: 'DevMick Ange',
    role: 'PROPRIÉTAIRE (Owner)',
    category: 'client',
    icon: HomeOutlined,
    color: 'green',
    badge: 'Owner Client'
  },
  {
    email: 'bkourouma2002@yahoo.com',
    password: 'P@ssw0rd_2026',
    name: 'BABA KOUROUMA',
    role: 'LOCATAIRE (Renter)',
    category: 'client',
    icon: HomeOutlined,
    color: 'orange',
    badge: 'Renter Client'
  },
  {
    email: 'devaccrocs@gmail.com',
    password: 'P@ssw0rd',
    name: 'Ali Sangaré',
    role: 'LOCATAIRE (Renter)',
    category: 'client',
    icon: HomeOutlined,
    color: 'orange',
    badge: 'Renter Client'
  }
];

// Group users by category
const groupedUsers = {
  platform: TEST_USERS.filter(u => u.category === 'platform'),
  'tenant-admin': TEST_USERS.filter(u => u.category === 'tenant-admin'),
  collaborator: TEST_USERS.filter(u => u.category === 'collaborator'),
  client: TEST_USERS.filter(u => u.category === 'client'),
  public: TEST_USERS.filter(u => u.category === 'public'),
};

const categoryLabels = {
  platform: { label: 'Platform Administration', icon: SafetyOutlined },
  'tenant-admin': { label: 'Tenant Administrators', icon: BankOutlined },
  collaborator: { label: 'Collaborators', icon: TeamOutlined },
  client: { label: 'Clients', icon: HomeOutlined },
  public: { label: 'Public Users', icon: UserOutlined },
};

function getRedirectTarget(searchParams: URLSearchParams): string {
  const redirect = searchParams.get('redirect');
  if (!redirect) return '/dashboard';
  // Security: only allow relative paths (no protocol, no double slash)
  if (redirect.startsWith('/') && !redirect.startsWith('//')) {
    return redirect;
  }
  return '/dashboard';
}

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, error, clearError, isLoading } = useAuth();
  const [form] = Form.useForm();

  const handleSubmit = async (values: LoginCredentials): Promise<void> => {
    clearError();
    try {
      await login(values);
      setTimeout(() => {
        navigate(getRedirectTarget(searchParams));
      }, 500);
    } catch (error: any) {
      console.error('Login error:', error);
    }
  };

  const handleQuickLogin = async (user: typeof TEST_USERS[0]): Promise<void> => {
    clearError();
    form.setFieldsValue({
      email: user.email,
      password: user.password
    });
    try {
      await login({
        email: user.email,
        password: user.password
      });
      setTimeout(() => {
        navigate(getRedirectTarget(searchParams));
      }, 500);
    } catch (error: any) {
      console.error('Quick login error:', error);
    }
  };

  const handleGoogleLogin = (): void => {
    const apiUrl = process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:8001';
    window.location.href = `${apiUrl}/api/auth/google`;
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(to bottom right, #eff6ff, #eef2ff, #f3e8ff)',
        padding: '48px 16px',
      }}
    >
      <div style={{ maxWidth: 1024, width: '100%' }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          {/* Header */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <div
                style={{
                  backgroundColor: '#fff',
                  borderRadius: '50%',
                  padding: 12,
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                }}
              >
                <SafetyOutlined style={{ fontSize: 40, color: '#4f46e5' }} />
              </div>
            </div>
            <Title level={2} style={{ marginBottom: 8 }}>
              Bienvenue sur ImmoPro
            </Title>
            <Paragraph style={{ fontSize: 16 }}>
              Connectez-vous à votre compte ou{' '}
              <Link to="/register" style={{ color: '#4f46e5', fontWeight: 500 }}>
                créez un nouveau compte
              </Link>
            </Paragraph>
          </div>

          <Row gutter={24}>
            {/* Quick Login Section */}
            <Col xs={24} lg={12}>
              <Card
                title={
                  <Space>
                    <CrownOutlined style={{ color: '#faad14' }} />
                    <Text strong>Connexion rapide</Text>
                  </Space>
                }
              >
                <Paragraph type="secondary" style={{ marginBottom: 16 }}>
                  Sélectionnez un compte de test pour vous connecter automatiquement
                </Paragraph>
                
                <div style={{ maxHeight: 600, overflowY: 'auto', paddingRight: 8 }}>
                  <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    {Object.entries(groupedUsers).map(([category, users]) => {
                      if (users.length === 0) return null;
                      const categoryInfo = categoryLabels[category as keyof typeof categoryLabels];
                      const Icon = categoryInfo.icon;
                      
                      return (
                        <div key={category}>
                          <Space style={{ marginBottom: 8, padding: '0 8px' }}>
                            <Icon style={{ color: '#8c8c8c' }} />
                            <Text type="secondary" style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase' }}>
                              {categoryInfo.label}
                            </Text>
                          </Space>
                          <Space direction="vertical" size="small" style={{ width: '100%' }}>
                            {users.map((user) => {
                              const UserIcon = user.icon;
                              const isPlatform = user.category === 'platform';
                              return (
                                <Button
                                  key={user.email}
                                  type={isPlatform ? 'primary' : 'default'}
                                  block
                                  onClick={() => handleQuickLogin(user)}
                                  loading={isLoading}
                                  style={{
                                    height: 'auto',
                                    padding: '12px 16px',
                                    textAlign: 'left',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
                                    <div
                                      style={{
                                        flexShrink: 0,
                                        padding: 8,
                                        borderRadius: 6,
                                        backgroundColor: isPlatform ? 'rgba(255, 255, 255, 0.2)' : '#f0f0f0',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}
                                    >
                                      <UserIcon style={{ fontSize: 20, color: isPlatform ? '#fff' : '#595959' }} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                                      <div style={{ marginBottom: 4 }}>
                                        <Text strong style={{ color: isPlatform ? '#fff' : undefined, fontSize: 14 }}>
                                          {user.name}
                                        </Text>
                                      </div>
                                      <div style={{ marginBottom: 4 }}>
                                        <Text
                                          type="secondary"
                                          style={{
                                            fontSize: 12,
                                            color: isPlatform ? 'rgba(255, 255, 255, 0.8)' : undefined,
                                          }}
                                        >
                                          {user.email}
                                        </Text>
                                      </div>
                                      <Tag color={isPlatform ? undefined : user.color} style={{ margin: 0 }}>
                                        {user.badge}
                                      </Tag>
                                    </div>
                                  </div>
                                </Button>
                              );
                            })}
                          </Space>
                        </div>
                      );
                    })}
                  </Space>
                </div>
              </Card>
            </Col>
            {/* Manual Login Form */}
            <Col xs={24} lg={12}>
              <Card title={<Text strong>Connexion manuelle</Text>}>
                <Form
                  form={form}
                  layout="vertical"
                  onFinish={handleSubmit}
                  autoComplete="off"
                >
                  {error && (
                    <Alert
                      message={error}
                      type="error"
                      showIcon
                      closable
                      onClose={clearError}
                      style={{ marginBottom: 16 }}
                    />
                  )}

                  <Form.Item
                    label="Adresse email"
                    name="email"
                    rules={[
                      { required: true, message: 'L\'adresse email est requise.' },
                      { type: 'email', message: 'Veuillez entrer une adresse email valide.' },
                    ]}
                  >
                    <Input
                      size="large"
                      placeholder="vous@example.com"
                      autoComplete="email"
                    />
                  </Form.Item>

                  <Form.Item
                    label="Mot de passe"
                    name="password"
                    rules={[
                      { required: true, message: 'Le mot de passe est requis.' },
                    ]}
                  >
                    <Input.Password
                      size="large"
                      placeholder="••••••••"
                      autoComplete="current-password"
                    />
                  </Form.Item>

                  <Form.Item>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Form.Item name="remember" valuePropName="checked" noStyle>
                        <Checkbox>Se souvenir de moi</Checkbox>
                      </Form.Item>
                      <Link to="/forgot-password" style={{ color: '#4f46e5', fontWeight: 500 }}>
                        Mot de passe oublié ?
                      </Link>
                    </div>
                  </Form.Item>

                  <Form.Item>
                    <Button
                      type="primary"
                      htmlType="submit"
                      block
                      size="large"
                      loading={isLoading}
                      icon={<LoginOutlined />}
                    >
                      Se connecter
                    </Button>
                  </Form.Item>

                  <Divider>Ou continuer avec</Divider>

                  <Form.Item>
                    <Button
                      block
                      size="large"
                      onClick={handleGoogleLogin}
                      disabled={isLoading}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                      Se connecter avec Google
                    </Button>
                  </Form.Item>
                </Form>
              </Card>
            </Col>
          </Row>
        </Space>
      </div>
    </div>
  );
};

