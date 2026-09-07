import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Form,
  Input,
  Button,
  Card,
  Alert,
  Typography,
  Result,
  Space,
} from 'antd';
import { MailOutlined, CheckCircleOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { forgotPassword as forgotPasswordApi } from '../services/auth-service';

const { Text } = Typography;

export const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string>('');

  const handleSubmit = async (values: { email: string }): Promise<void> => {
    setError('');
    setSuccess(false);
    setIsSubmitting(true);

    try {
      await forgotPasswordApi(values.email);
      setSuccess(true);
    } catch (err: any) {
      // Erreur réseau : afficher un message pour permettre une nouvelle tentative
      if (!err?.response) {
        setError('Erreur de connexion. Veuillez vérifier votre connexion et réessayer.');
      } else {
        // Le backend retourne toujours 200 pour la sécurité - en cas d'autre erreur, afficher succès
        setSuccess(true);
      }
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
        <Card style={{ maxWidth: 480, width: '100%' }}>
          <Result
            status="success"
            icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
            title="Email envoyé"
            subTitle="Si cette adresse email existe dans notre système, un lien de réinitialisation de mot de passe a été envoyé. Veuillez vérifier votre boîte de réception (et les spams)."
            extra={[
              <Button type="primary" key="login" onClick={() => navigate('/login')}>
                Retour à la connexion
              </Button>,
              <Button key="resend" onClick={() => setSuccess(false)}>
                Nouvelle demande
              </Button>
            ]}
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
            <MailOutlined />
            <span>Mot de passe oublié ?</span>
          </Space>
        }
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
          Entrez votre adresse email et nous vous enverrons un lien pour réinitialiser votre mot de
          passe.
        </Text>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          onValuesChange={() => setError('')}
        >
          {error && (
            <Alert
              message={error}
              type="error"
              showIcon
              closable
              style={{ marginBottom: 24 }}
              onClose={() => setError('')}
            />
          )}

          <Form.Item
            name="email"
            label="Adresse email"
            rules={[
              { required: true, message: "Veuillez entrer votre adresse email." },
              { type: 'email', message: "Veuillez entrer une adresse email valide." }
            ]}
          >
            <Input
              size="large"
              prefix={<MailOutlined />}
              placeholder="vous@example.com"
              autoComplete="email"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 16 }}>
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={isSubmitting}
            >
              {isSubmitting ? 'Envoi en cours...' : 'Envoyer le lien de réinitialisation'}
            </Button>
          </Form.Item>

          <div style={{ textAlign: 'center' }}>
            <Link to="/login">
              <ArrowLeftOutlined /> Retour à la connexion
            </Link>
          </div>
        </Form>
      </Card>
    </div>
  );
};
