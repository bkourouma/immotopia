import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Form, Input, Button, Card, Alert, Typography, Result, Space } from 'antd';
import { CheckCircleOutlined, LockOutlined } from '@ant-design/icons';
import { resetPassword as resetPasswordApi } from '../services/auth-service';
import { PasswordStrength } from '../components/PasswordStrength';
import { PasswordResetData } from '../types/auth-types';
import { t } from '../i18n/t';

const { Text } = Typography;

export const ResetPassword: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [formData, setFormData] = useState<PasswordResetData>({
    token: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const token = searchParams.get('token');
    if (token) {
      setFormData(prev => ({ ...prev, token }));
      form.setFieldValue('token', token);
    } else {
      setErrors({ general: t("Token de réinitialisation manquant dans l'URL.") });
    }
  }, [searchParams, form]);

  const handleSubmit = async (values: { newPassword: string; confirmPassword: string }): Promise<void> => {
    const token = formData.token;
    if (!token) {
      setErrors({ general: t('Token manquant.') });
      return;
    }

    setErrors({});
    setIsSubmitting(true);

    try {
      await resetPasswordApi({
        token,
        newPassword: values.newPassword,
        confirmPassword: values.confirmPassword
      });
      setSuccess(true);
      setTimeout(() => {
        navigate('/login');
      }, 3000);
    } catch (error: any) {
      if (error.response?.data?.errors) {
        const fieldErrors: Record<string, string> = {};
        error.response.data.errors.forEach((err: { field: string; message: string }) => {
          fieldErrors[err.field] = err.message;
        });
        setErrors(fieldErrors);
      } else {
        setErrors({
          general: error.response?.data?.message || t('Une erreur est survenue lors de la réinitialisation.')
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleValuesChange = (_changed: Partial<PasswordResetData>, all: Partial<PasswordResetData>) => {
    setFormData(prev => ({ ...prev, ...all, token: all.token ?? prev.token }));
    if (_changed.newPassword !== undefined || _changed.confirmPassword !== undefined) {
      setErrors(prev => {
        const next = { ...prev };
        delete next.newPassword;
        delete next.confirmPassword;
        return next;
      });
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
          padding: 24
        }}
      >
        <Card style={{ maxWidth: 480, width: '100%' }}>
          <Result
            status="success"
            icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
            title={t('Mot de passe réinitialisé !')}
            subTitle={t(
              'Votre mot de passe a été réinitialisé avec succès. Vous allez être redirigé vers la page de connexion...'
            )}
            extra={
              <Button type="primary" onClick={() => navigate('/login')}>
                {t('Aller à la page de connexion')}
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
        background: '#f0f2f5'
      }}
    >
      <Card
        style={{ maxWidth: 440, width: '100%' }}
        title={
          <Space>
            <LockOutlined />
            <span>{t('Réinitialiser votre mot de passe')}</span>
          </Space>
        }
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
          {t('Entrez votre nouveau mot de passe ci-dessous.')}
        </Text>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          onValuesChange={handleValuesChange}
          initialValues={{ token: formData.token, newPassword: '', confirmPassword: '' }}
        >
          {errors.general && (
            <Alert
              message={errors.general}
              type="error"
              showIcon
              closable
              style={{ marginBottom: 24 }}
              onClose={() => setErrors(prev => ({ ...prev, general: '' }))}
            />
          )}

          <Form.Item
            name="newPassword"
            label={t('Nouveau mot de passe')}
            validateStatus={errors.newPassword ? 'error' : undefined}
            help={errors.newPassword}
            rules={[
              { required: true, message: t('Le nouveau mot de passe est requis.') },
              { min: 8, message: t('Le mot de passe doit contenir au moins 8 caractères.') },
              {
                pattern: /[A-Z]/,
                message: t('Le mot de passe doit contenir au moins une majuscule.')
              },
              {
                pattern: /[a-z]/,
                message: t('Le mot de passe doit contenir au moins une minuscule.')
              },
              {
                pattern: /[0-9]/,
                message: t('Le mot de passe doit contenir au moins un chiffre.')
              },
              {
                pattern: /[^A-Za-z0-9]/,
                message: t('Le mot de passe doit contenir au moins un caractère spécial.')
              }
            ]}
          >
            <Input.Password size="large" prefix={<LockOutlined />} placeholder="••••••••" autoComplete="new-password" />
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.newPassword !== curr.newPassword}>
            {() => <PasswordStrength password={form.getFieldValue('newPassword') || ''} />}
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            label={t('Confirmer le nouveau mot de passe')}
            validateStatus={errors.confirmPassword ? 'error' : undefined}
            help={errors.confirmPassword}
            rules={[
              { required: true, message: t('La confirmation du mot de passe est requise.') },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error(t('Les mots de passe ne correspondent pas.')));
                }
              })
            ]}
          >
            <Input.Password size="large" prefix={<LockOutlined />} placeholder="••••••••" autoComplete="new-password" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 16 }}>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={isSubmitting}
              disabled={!formData.token}
            >
              {isSubmitting ? t('Réinitialisation en cours...') : t('Réinitialiser le mot de passe')}
            </Button>
          </Form.Item>

          <div style={{ textAlign: 'center' }}>
            <Link to="/login">{t('Retour à la connexion')}</Link>
          </div>
        </Form>
      </Card>
    </div>
  );
};
