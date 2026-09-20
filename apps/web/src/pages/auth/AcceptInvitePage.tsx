import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, Form, Input, Progress, Result, Space, Typography } from 'antd';
import { ArrowLeftOutlined, CheckCircleOutlined, LockOutlined, UserAddOutlined, UserOutlined } from '@ant-design/icons';
import { acceptInvitation } from '../../services/invitation-service';
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
  const [form] = Form.useForm<AcceptInviteFormValues>();
  const passwordValue = Form.useWatch('password', form) || '';
  const passwordStrength = getPasswordStrength(passwordValue);

  const [token, setToken] = useState('');
  const [generalError, setGeneralError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

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
    setIsSubmitting(true);

    try {
      const response = await acceptInvitation({
        token,
        password: values.password,
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
      setGeneralError(err?.response?.data?.message || t('Une erreur est survenue. Veuillez reessayer.'));
      console.error('Accept invite error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

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
            title={t('Invitation acceptee')}
            subTitle={t('Votre compte est pret. Redirection vers la connexion...')}
            extra={
              <Button type="primary" onClick={() => navigate('/login?invite=accepted')}>
                {t('Aller a la connexion')}
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
          {t('Creez votre mot de passe pour rejoindre votre equipe.')}
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

          <Form.Item
            name="fullName"
            label={t('Nom complet')}
            rules={[{ required: true, message: t('Le nom complet est requis.') }]}
          >
            <Input size="large" prefix={<UserOutlined />} placeholder={t('Jean Dupont')} autoComplete="name" />
          </Form.Item>

          <Form.Item
            name="password"
            label={t('Mot de passe')}
            rules={[
              { required: true, message: t('Le mot de passe est requis.') },
              { min: 8, message: t('Minimum 8 caracteres.') },
              { pattern: /[A-Z]/, message: t('Ajoutez au moins une majuscule.') },
              { pattern: /[a-z]/, message: t('Ajoutez au moins une minuscule.') },
              { pattern: /[0-9]/, message: t('Ajoutez au moins un chiffre.') },
              {
                pattern: /[^A-Za-z0-9]/,
                message: t('Ajoutez au moins un caractere special.')
              }
            ]}
          >
            <Input.Password size="large" prefix={<LockOutlined />} placeholder="********" autoComplete="new-password" />
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
            <Input.Password size="large" prefix={<LockOutlined />} placeholder="********" autoComplete="new-password" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 16 }}>
            <Button type="primary" htmlType="submit" size="large" block loading={isSubmitting} disabled={!token}>
              {isSubmitting ? t('Acceptation en cours...') : t("Accepter l'invitation")}
            </Button>
          </Form.Item>

          <div style={{ textAlign: 'center' }}>
            <Link to="/login">
              <ArrowLeftOutlined /> {t('Retour a la connexion')}
            </Link>
          </div>
        </Form>
      </Card>
    </div>
  );
};
