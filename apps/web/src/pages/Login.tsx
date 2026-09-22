import React, { Suspense, lazy, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Form, Input, Button, Card, Alert, Checkbox, Col, Divider, Row, Space, Typography } from 'antd';
import { LoginOutlined } from '@ant-design/icons';
import { useAuth } from '../hooks/useAuth';
import { LoginCredentials } from '../types/auth-types';
import { API_ORIGIN } from '../config/api';
import logoImmoTopia from '../assets/logo-immotopia.png';
import { t } from '../i18n/t';

const { Title, Text, Paragraph } = Typography;

/**
 * Écran de connexion.
 *
 * Le panneau « Comptes par tenant » s'affiche en `npm run dev` (DEV) et sur
 * le build de démonstration quand `VITE_SHOW_DEMO_ACCOUNTS=true` est passé
 * à Vite — c'est le cas de l'image `immotopia-saas-web`. Sans ce flag, le
 * panneau est éliminé du bundle.
 *
 * Deux colonnes sous `lg` uniquement : sur mobile le formulaire reste seul et
 * pleine largeur, le panneau passe dessous.
 */

const showDemoAccounts = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_ACCOUNTS === 'true';

/** Panneau de comptes de démonstration. `null` si le flag de build est absent. */
const DevAccountsPanel = showDemoAccounts ? lazy(() => import('../dev/DevAccountsPanel')) : null;
function getRedirectTarget(searchParams: URLSearchParams): string {
  const redirect = searchParams.get('redirect');
  if (!redirect) return '/dashboard';
  // Sécurité : uniquement des chemins relatifs (ni protocole, ni double slash).
  if (redirect.startsWith('/') && !redirect.startsWith('//')) {
    return redirect;
  }
  return '/dashboard';
}

function googleOAuthErrorMessage(reason: string | null): string | null {
  if (!reason) return null;
  if (reason === 'google_unavailable') {
    return t("La connexion Google n'est pas encore configurée sur ce serveur.");
  }
  if (reason === 'invalid_state' || reason === 'auth_failed') {
    return t('La connexion Google a échoué. Réessayez.');
  }
  return null;
}

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, error, clearError, isLoading } = useAuth();
  const [form] = Form.useForm();

  // Adresse chargée depuis le panneau de développement, pour que celui-ci
  // puisse marquer la ligne active. Vaut `undefined` en production.
  const [pickedEmail, setPickedEmail] = useState<string | undefined>(undefined);

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

  const googleError = googleOAuthErrorMessage(searchParams.get('error'));
  const displayedError = error || googleError;

  const handleGoogleLogin = (): void => {
    window.location.href = `${API_ORIGIN}/api/auth/google`;
  };

  /**
   * Charge un compte de démonstration dans le formulaire.
   *
   * On remplit, on ne soumet pas : voir `DevAccountsPanel`. L'erreur affichée
   * est effacée au passage, sinon l'échec du compte précédent resterait à
   * l'écran au-dessus d'identifiants qui n'ont plus rien à voir avec lui.
   */
  const handlePickDevAccount = (account: { email: string; password: string }): void => {
    clearError();
    setPickedEmail(account.email);
    form.setFieldsValue({ email: account.email, password: account.password });
  };

  /**
   * Ouvre la session d'un compte de démonstration, sans passer par le champ
   * de mot de passe.
   *
   * Le panneau remplissait le formulaire et laissait soumettre, pour qu'on voie
   * quel compte part. C'est toujours ce que fait « Utiliser ». Mais une recette
   * pilotée par un agent doit changer de persona une dizaine de fois, et
   * certains s'interdisent — à raison — de toucher un champ de mot de passe :
   * ils restaient bloqués sur des parties entières du parcours. La ligne
   * cliquée nomme déjà le compte et son rôle : l'information qu'on venait
   * chercher est là, avant le clic.
   *
   * Ce chemin n'existe que là où le panneau existe : en développement, ou sur
   * la démonstration construite avec `VITE_SHOW_DEMO_ACCOUNTS=true`. Jamais
   * dans une installation cliente.
   */
  const handleConnectDevAccount = (account: { email: string; password: string }): void => {
    clearError();
    setPickedEmail(account.email);
    form.setFieldsValue({ email: account.email, password: account.password });
    void handleSubmit({ email: account.email, password: account.password });
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
      {/* Sans le panneau de développement, la largeur reste celle d'une colonne
          unique : la production retrouve exactement la mise en page d'avant. */}
      <div style={{ maxWidth: DevAccountsPanel ? 980 : 420, width: '100%' }}>
        <Space orientation="vertical" size="large" style={{ width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            {/* Le logo EST le titre de l'écran : le doubler d'un « Bienvenue sur
                ImmoTopia » répéterait au lecteur d'écran un nom qu'il vient de
                lire dans l'`alt`. Le `h1` porte donc l'image. */}
            <Title level={1} style={{ marginBottom: 'var(--space-4)' }}>
              <img
                src={logoImmoTopia}
                alt={t("ImmoTopia, l'ERP immobilier le plus complet")}
                width={176}
                height={54}
                style={{ display: 'block', margin: '0 auto', width: '100%', maxWidth: 176, height: 'auto' }}
              />
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {t('Connectez-vous à votre compte ou')} <Link to="/register">{t('créez un nouveau compte')}</Link>
            </Paragraph>
          </div>

          <Row gutter={[24, 24]} justify="center" align="stretch">
            <Col xs={24} lg={DevAccountsPanel ? 12 : 24}>
              <Card style={{ height: '100%' }}>
                <Form form={form} layout="vertical" onFinish={handleSubmit} autoComplete="off">
                  {displayedError && (
                    <Alert
                      message={displayedError}
                      type="error"
                      showIcon
                      closable
                      onClose={clearError}
                      style={{ marginBottom: 'var(--space-4)' }}
                    />
                  )}

                  <Form.Item
                    label={t('Adresse email')}
                    name="email"
                    rules={[
                      { required: true, message: t("L'adresse email est requise.") },
                      { type: 'email', message: t('Veuillez entrer une adresse email valide.') }
                    ]}
                  >
                    {/* Pas de `size` explicite : `componentSize` du ConfigProvider
                    donne 44 px et 16 px sous 992 px, 36 px et 14 px au-dessus. */}
                    <Input placeholder={t('vous@example.com')} autoComplete="email" />
                  </Form.Item>

                  <Form.Item
                    label={t('Mot de passe')}
                    name="password"
                    rules={[{ required: true, message: t('Le mot de passe est requis.') }]}
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
                        <Checkbox>{t('Se souvenir de moi')}</Checkbox>
                      </Form.Item>
                      <Link to="/forgot-password">{t('Mot de passe oublié ?')}</Link>
                    </div>
                  </Form.Item>

                  <Form.Item style={{ marginBottom: 0 }}>
                    <Button type="primary" htmlType="submit" block loading={isLoading} icon={<LoginOutlined />}>
                      {t('Se connecter')}
                    </Button>
                  </Form.Item>

                  <Divider>{t('Ou continuer avec')}</Divider>

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
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                        aria-hidden="true"
                      >
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
                      <Text>{t('Se connecter avec Google')}</Text>
                    </Button>
                  </Form.Item>
                </Form>
              </Card>
            </Col>

            {DevAccountsPanel && (
              <Col xs={24} lg={12}>
                <Suspense fallback={null}>
                  <DevAccountsPanel
                    onPick={handlePickDevAccount}
                    onConnect={handleConnectDevAccount}
                    activeEmail={pickedEmail}
                  />
                </Suspense>
              </Col>
            )}
          </Row>
        </Space>
      </div>
    </div>
  );
};
