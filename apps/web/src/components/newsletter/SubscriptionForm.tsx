import React, { useState } from 'react';
import { Form, Input, Button, message } from 'antd';
import { MailOutlined, UserOutlined } from '@ant-design/icons';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8001/api';

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
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!listToken && !listId) {
    return (
      <p style={{ color: '#999' }}>Configuration manquante : fournissez listToken ou listId pour le formulaire d'inscription.</p>
    );
  }

  const handleSubmit = async (values: { email: string; name?: string }) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/newsletter/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          listToken: listToken || undefined,
          listId: listId || undefined,
          email: values.email,
          name: values.name || undefined
        })
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };
      if (data.success) {
        setDone(true);
        message.success(data.message || 'Inscription effectuée. Vérifiez votre email pour confirmer.');
        form.resetFields();
        onSuccess?.();
      } else {
        message.error(data.message || 'Une erreur est survenue.');
      }
    } catch {
      message.error('Impossible de contacter le serveur.');
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
