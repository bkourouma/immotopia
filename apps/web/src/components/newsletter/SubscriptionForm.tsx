import React, { useState } from 'react';
import { App, Form, Input, Button } from 'antd';
import { MailOutlined, UserOutlined } from '@ant-design/icons';
import apiClient from '../../utils/api-client';

interface SubscriptionFormProps {
  listToken?: string;
  listId?: string;
  onSuccess?: () => void;
  submitLabel?: string;
  showName?: boolean;
  compact?: boolean;
}

export function SubscriptionForm({
  listToken,
  listId,
  onSuccess,
  submitLabel = "S'inscrire",
  showName = true,
  compact = false
}: SubscriptionFormProps) {
  const { message } = App.useApp();

  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!listToken && !listId) {
    return (
      <p style={{ color: '#999' }}>
        Configuration manquante : fournissez listToken ou listId pour le formulaire d'inscription.
      </p>
    );
  }

  const handleSubmit = async (values: { email: string; name?: string }) => {
    setLoading(true);
    try {
      const { data } = await apiClient.post('/newsletter/subscribe', {
        listToken: listToken || undefined,
        listId: listId || undefined,
        email: values.email,
        name: values.name || undefined
      });
      if (data?.success) {
        setDone(true);
        message.success(data.message || 'Inscription effectuée. Vérifiez votre email pour confirmer.');
        form.resetFields();
        onSuccess?.();
      } else {
        message.error(data?.message || 'Une erreur est survenue.');
      }
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Impossible de contacter le serveur.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div style={{ padding: 16, background: '#f6ffed', borderRadius: 8, border: '1px solid #b7eb8f' }}>
        <p style={{ margin: 0, color: '#52c41a' }}>
          ✓ Un email de confirmation vous a été envoyé. Cliquez sur le lien pour valider votre inscription.
        </p>
      </div>
    );
  }

  return (
    <Form form={form} layout={compact ? 'inline' : 'vertical'} onFinish={handleSubmit}>
      {showName && (
        <Form.Item name="name" rules={[]} style={compact ? { marginRight: 8 } : undefined}>
          <Input prefix={<UserOutlined />} placeholder="Prénom / Nom" />
        </Form.Item>
      )}
      <Form.Item
        name="email"
        rules={[
          { required: true, message: 'Email requis' },
          { type: 'email', message: 'Email invalide' }
        ]}
        style={compact ? { marginRight: 8 } : undefined}
      >
        <Input prefix={<MailOutlined />} type="email" placeholder="votre@email.com" />
      </Form.Item>
      <Form.Item style={compact ? { marginBottom: 0 } : undefined}>
        <Button type="primary" htmlType="submit" loading={loading}>
          {submitLabel}
        </Button>
      </Form.Item>
    </Form>
  );
}
