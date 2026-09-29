import React, { useState } from 'react';
import { App, Form, Input, Button } from 'antd';
import { MailOutlined, UserOutlined } from '@ant-design/icons';
import apiClient from '../../utils/api-client';
import { t } from '../../i18n/t';

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
  const [pendingConfirmation, setPendingConfirmation] = useState(true);
  const [doneMessage, setDoneMessage] = useState('');

  if (!listToken && !listId) {
    return (
      <p style={{ color: '#999' }}>
        {t("Configuration manquante : fournissez listToken ou listId pour le formulaire d'inscription.")}
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
        // Liste sans double opt-in : l'inscription est déjà active, pas d'e-mail à attendre.
        setPendingConfirmation(data.pendingConfirmation !== false);
        setDoneMessage(data.message || '');
        setDone(true);
        message.success(data.message || t('Inscription effectuée. Vérifiez votre email pour confirmer.'));
        form.resetFields();
        onSuccess?.();
      } else {
        message.error(data?.message || t('Une erreur est survenue.'));
      }
    } catch (err: any) {
      message.error(err?.response?.data?.message || t('Impossible de contacter le serveur.'));
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div style={{ padding: 16, background: '#f6ffed', borderRadius: 8, border: '1px solid #b7eb8f' }}>
        <p style={{ margin: 0, color: '#52c41a' }}>
          {pendingConfirmation
            ? t('✓ Un email de confirmation vous a été envoyé. Cliquez sur le lien pour valider votre inscription.')
            : `✓ ${doneMessage || t('Votre inscription est confirmée.')}`}
        </p>
      </div>
    );
  }

  return (
    <Form form={form} layout={compact ? 'inline' : 'vertical'} onFinish={handleSubmit}>
      {showName && (
        <Form.Item name="name" rules={[]} style={compact ? { marginInlineEnd: 8 } : undefined}>
          <Input prefix={<UserOutlined />} placeholder={t('Prénom / Nom')} />
        </Form.Item>
      )}
      <Form.Item
        name="email"
        rules={[
          { required: true, message: t('Email requis') },
          { type: 'email', message: t('Email invalide') }
        ]}
        style={compact ? { marginInlineEnd: 8 } : undefined}
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
