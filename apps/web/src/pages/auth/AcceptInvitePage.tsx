import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, Form, Input, Progress, Result, Space, Typography } from 'antd';
import { ArrowLeftOutlined, CheckCircleOutlined, LockOutlined, UserAddOutlined, UserOutlined } from '@ant-design/icons';
import { acceptInvitation } from '../../services/invitation-service';
import { useAuth } from '../../context/AuthContext';
import { t } from '../../i18n/t';

const { Text } = Typography;

interface AcceptInviteFormValues {
  fullName: string;
  password: string;
  confirmPassword: string;
}

const getPasswordStrength = (
  pwd: string
): { percent: number; status: 'exception' | 'normal' | 'success'; label: string } => {
  if (!pwd) {
    return { percent: 0, status: 'normal', label: '' };
  }

  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[a-z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;

  if (score <= 2) {
    return { percent: Math.max(20, score * 20), status: 'exception', label: t('Faible') };
  }
  if (score === 3 || score === 4) {
    return { percent: score * 20, status: 'normal', label: t('Moyen') };
  }

  return { percent: 100, status: 'success', label: t('Fort') };
};

export const AcceptInvitePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [form] = Form.useForm<AcceptInviteFormValues>();
  const passwordValue = Form.useWatch('password', form) || '';
  const passwordStrength = getPasswordStrength(passwordValue);

  const [token, setToken] = useState('');
  const [generalError, setGeneralError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  // Un compte existe deja pour l'e-mail invite : l'API refuse de reecrire
  // son mot de passe et demande une connexion avec CE compte avant de
  // rattacher l'agence (voir invitation-service.ts, acceptInvitation).
  const [requiresLogin, setRequiresLogin] = useState(false);

  useEffect(() => {
    const inviteToken = searchParams.get('token');
    if (inviteToken) {
      setToken(inviteToken);
      setGeneralError('');
    } else {
      setGeneralError(t("Token d'invitation manquant ou invalide."));
    }
  }, [searchParams]);

  const handleSubmit = async (values: AcceptInviteFormValues): Promise<void> => {
    if (!token) {
      setGeneralError(t("Token d'invitation manquant ou invalide."));
      return;
    }

    setGeneralError('');
    setRequiresLogin(false);
    setIsSubmitting(true);

    try {
      const response = await acceptInvitation({
        token,
        // Un compte deja connecte n'envoie pas de mot de passe : l'API
        // l'ignorerait de toute facon (elle ne reecrit jamais le mot de
        // passe d'un compte existant), autant ne pas le collecter.
        ...(isAuthenticated ? {} : { password: values.password }),
        fullName: values.fullName
      });

      if (response.success) {
        setSuccess(true);
        setTimeout(() => {
          navigate('/login?invite=accepted');
        }, 2000);
      } else {
        setGeneralError(response.message || t("Erreur lors de l'acceptation de l'invitation."));
      }
    } catch (err: any) {
      if (err?.response?.data?.code === 'INVITATION_REQUIRES_LOGIN') {
        setRequiresLogin(true);
      } else {
        setGeneralError(err?.response?.data?.message || t('Une erreur est survenue. Veuillez réessayer.'));
      }
      console.error('Accept invite error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const loginRedirectUrl = `/login?redirect=${encodeURIComponent(`/auth/accept-invite?token=${token}`)}`;

  if (requiresLogin) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: '#f0f2f5'
        }}
      >
        <Card style={{ maxWidth: 520, width: '100%' }}>
          <Result
            status="info"
            title={t('Connectez-vous pour accepter')}
            subTitle={t(
              'Un compte existe déjà avec cette adresse e-mail. Connectez-vous avec ce compte pour accepter cette invitation.'
            )}
            extra={
              <Button type="primary" onClick={() => navigate(loginRedirectUrl)}>
                {t('Se connecter')}
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: '#f0f2f5'
        }}
      >
        <Card style={{ maxWidth: 520, width: '100%' }}>
          <Result
            status="success"
            icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
            title={t('Invitation acceptée')}
            subTitle={t('Votre compte est prêt. Redirection vers la connexion...')}
            extra={
              <Button type="primary" onClick={() => navigate('/login?invite=accepted')}>
                {t('Aller à la connexion')}
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'linear-gradient(180deg, #f7fbff 0%, #eef3f8 100%)'
      }}
    >
      <Card
        style={{ maxWidth: 460, width: '100%', borderRadius: 12 }}
        title={
          <Space>
            <UserAddOutlined />
            <span>{t('Accepter une invitation')}</span>
          </Space>
        }
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
          {isAuthenticated
            ? t('Vous êtes connecté : confirmez pour rejoindre cette équipe.')
            : t('Créez votre mot de passe pour rejoindre votre équipe.')}
        </Text>

        <Form<AcceptInviteFormValues>
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          onValuesChange={() => setGeneralError('')}
          initialValues={{ fullName: '', password: '', confirmPassword: '' }}
        >
          {generalError && (
            <Alert
              message={generalError}
              type="error"
              showIcon
              closable
              style={{ marginBottom: 24 }}
              onClose={() => setGeneralError('')}
            />
          )}

          {!isAuthenticated && (
            <Form.Item
              name="fullName"
              label={t('Nom complet')}
              rules={[{ required: true, message: t('Le nom complet est requis.') }]}
            >
              <Input size="large" prefix={<UserOutlined />} placeholder={t('Jean Dupont')} autoComplete="name" />
            </Form.Item>
          )}

          {!isAuthenticated && (
            <>
              <Form.Item
                name="password"
                label={t('Mot de passe')}
                rules={[
                  { required: true, message: t('Le mot de passe est requis.') },
                  { min: 8, message: t('Minimum 8 caractères.') },
                  { pattern: /[A-Z]/, message: t('Ajoutez au moins une majuscule.') },
                  { pattern: /[a-z]/, message: t('Ajoutez au moins une minuscule.') },
                  { pattern: /[0-9]/, message: t('Ajoutez au moins un chiffre.') },
                  {
                    pattern: /[^A-Za-z0-9]/,
                    message: t('Ajoutez au moins un caractère spécial.')
                  }
                ]}
              >
                <Input.Password
                  size="large"
                  prefix={<LockOutlined />}
                  placeholder="********"
                  autoComplete="new-password"
                />
              </Form.Item>

              {passwordValue && (
                <div style={{ marginBottom: 16 }}>
                  <Space orientation="vertical" size={4} style={{ width: '100%' }}>
                    <Progress
                      percent={passwordStrength.percent}
                      status={passwordStrength.status}
                      showInfo={false}
                      size={[100, 8]}
                    />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {t('Force du mot de passe:')} {passwordStrength.label}
                    </Text>
                  </Space>
                </div>
              )}

              <Form.Item
                name="confirmPassword"
                label={t('Confirmer le mot de passe')}
                dependencies={['password']}
                rules={[
                  { required: true, message: t('La confirmation du mot de passe est requise.') },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('password') === value) {
                        return Promise.resolve();
                      }
                      return Promise.reject(new Error(t('Les mots de passe ne correspondent pas.')));
                    }
                  })
                ]}
              >
                <Input.Password
                  size="large"
                  prefix={<LockOutlined />}
                  placeholder="********"
                  autoComplete="new-password"
                />
              </Form.Item>
            </>
          )}

          <Form.Item style={{ marginBottom: 16 }}>
            <Button type="primary" htmlType="submit" size="large" block loading={isSubmitting} disabled={!token}>
              {isSubmitting ? t('Acceptation en cours...') : t("Accepter l'invitation")}
            </Button>
          </Form.Item>

          <div style={{ textAlign: 'center' }}>
            <Link to="/login">
              <ArrowLeftOutlined /> {t('Retour à la connexion')}
            </Link>
          </div>
        </Form>
      </Card>
    </div>
  );
};
