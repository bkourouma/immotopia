import React from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Form, Input, Button, Card, Alert, Checkbox, Divider, Space, Typography } from 'antd';
import { SafetyOutlined, LoginOutlined } from '@ant-design/icons';
import { useAuth } from '../hooks/useAuth';
import { LoginCredentials } from '../types/auth-types';
import { API_ORIGIN } from '../config/api';

const { Title, Text, Paragraph } = Typography;

/**
 * Écran de connexion.
 *
 * Le bloc « Connexion rapide » et ses neuf comptes de test — mots de passe en
 * clair, dont des adresses nominatives réelles — ont été supprimés au Lot 1
 * (§6.1). Purge sèche : aucun mécanisme de remplacement n'est prévu ici, un
 * environnement de démonstration dédié est un sujet distinct.
 *
 * Colonne unique centrée : la mise en page `Row xs=24 lg=12` n'existait que
 * pour loger ce bloc à côté du formulaire.
 */
function getRedirectTarget(searchParams: URLSearchParams): string {
  const redirect = searchParams.get('redirect');
  if (!redirect) return '/dashboard';
  // Sécurité : uniquement des chemins relatifs (ni protocole, ni double slash).
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
      navigate(getRedirectTarget(searchParams));
    } catch (err) {
      // `error` du contexte porte déjà le message affiché dans l'Alert.
      console.error('Login error:', err);
    }
  };

  const handleGoogleLogin = (): void => {
    window.location.href = `${API_ORIGIN}/api/auth/google`;
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--surface-page)',
        padding: 'var(--space-8) var(--page-padding)'
      }}
    >
      {/* Colonne unique : le formulaire occupe l'écran sur mobile. */}
      <div style={{ maxWidth: 420, width: '100%' }}>
        <Space orientation="vertical" size="large" style={{ width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-4)' }}>
              <div
                style={{
                  backgroundColor: 'var(--surface-card)',
                  borderRadius: 'var(--radius-full)',
                  padding: 'var(--space-3)',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                <SafetyOutlined style={{ fontSize: 40, color: 'var(--color-primary)' }} />
              </div>
            </div>
            <Title
              level={1}
              style={{
                marginBottom: 'var(--space-2)',
                fontSize: 'var(--font-size-h1)',
                lineHeight: 'var(--line-height-h1)'
              }}
            >
              Bienvenue sur ImmoPro
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              Connectez-vous à votre compte ou <Link to="/register">créez un nouveau compte</Link>
            </Paragraph>
          </div>

          <Card>
            <Form form={form} layout="vertical" onFinish={handleSubmit} autoComplete="off">
              {error && (
                <Alert
                  message={error}
                  type="error"
                  showIcon
                  closable
                  onClose={clearError}
                  style={{ marginBottom: 'var(--space-4)' }}
                />
              )}

              <Form.Item
                label="Adresse email"
                name="email"
                rules={[
                  { required: true, message: "L'adresse email est requise." },
                  { type: 'email', message: 'Veuillez entrer une adresse email valide.' }
                ]}
              >
                {/* Pas de `size` explicite : `componentSize` du ConfigProvider
                    donne 44 px et 16 px sous 992 px, 36 px et 14 px au-dessus. */}
                <Input placeholder="vous@example.com" autoComplete="email" />
              </Form.Item>

              <Form.Item
                label="Mot de passe"
                name="password"
                rules={[{ required: true, message: 'Le mot de passe est requis.' }]}
              >
                <Input.Password placeholder="••••••••" autoComplete="current-password" />
              </Form.Item>

              <Form.Item>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    flexWrap: 'wrap'
                  }}
                >
                  <Form.Item name="remember" valuePropName="checked" noStyle>
                    <Checkbox>Se souvenir de moi</Checkbox>
                  </Form.Item>
                  <Link to="/forgot-password">Mot de passe oublié ?</Link>
                </div>
              </Form.Item>

              <Form.Item style={{ marginBottom: 0 }}>
                <Button type="primary" htmlType="submit" block loading={isLoading} icon={<LoginOutlined />}>
                  Se connecter
                </Button>
              </Form.Item>

              <Divider>Ou continuer avec</Divider>

              <Form.Item style={{ marginBottom: 0 }}>
                {/* Google en secondaire : bouton `default`, pas `primary`. */}
                <Button
                  block
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 'var(--space-2)'
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
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
                  <Text>Se connecter avec Google</Text>
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </Space>
      </div>
    </div>
  );
};
