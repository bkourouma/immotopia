import React, { useEffect, useState } from 'react';
import { Form, Input, Select, Button, Card, Typography, Alert } from 'antd';
import { HtmlCodeEditor } from '../HtmlCodeEditor';
import type { NewsletterList, NewsletterTemplate, NewsletterCampaign } from '../../services/newsletter.service';

const { TextArea } = Input;
const { Text } = Typography;

interface CampaignFormProps {
  lists: NewsletterList[];
  templates: NewsletterTemplate[];
  campaign?: NewsletterCampaign | null;
  loading?: boolean;
  saving?: boolean;
  onSubmit: (values: {
    listId: string;
    templateId?: string;
    subject: string;
    bodyHtml: string;
  }) => Promise<void>;
  onPreview?: (campaignId: string) => void;
}

const UNSUBSCRIBE_PLACEHOLDER = '{{lien_desinscription}}';
const HELP_VARS =
  'Variables disponibles : {{prenom}}, {{nom}}, {{email}}, {{lien_desinscription}} (obligatoire). Le contenu sera aussi relaye sur WhatsApp (version texte) quand un numero avec consentement existe.';

export function CampaignForm({
  lists,
  templates,
  campaign,
  loading,
  saving,
  onSubmit,
  onPreview
}: CampaignFormProps) {
  const [form] = Form.useForm();
  const [missingUnsubscribe, setMissingUnsubscribe] = useState(false);

  useEffect(() => {
    if (campaign) {
      form.setFieldsValue({
        listId: campaign.listId,
        templateId: campaign.templateId || undefined,
        subject: campaign.subject,
        bodyHtml: campaign.bodyHtml
      });
    } else {
      form.setFieldsValue({
        bodyHtml: `<p>Bonjour {{prenom}},</p>\n<p>Voici notre dernière newsletter.</p>\n<p><a href="${UNSUBSCRIBE_PLACEHOLDER}">Se désabonner</a></p>`
      });
    }
  }, [campaign, form]);

  const bodyHtml = Form.useWatch('bodyHtml', form);
  useEffect(() => {
    const html = bodyHtml || '';
    setMissingUnsubscribe(!new RegExp(UNSUBSCRIBE_PLACEHOLDER.replace(/[{}]/g, '\\$&'), 'i').test(html));
  }, [bodyHtml]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    await onSubmit(values);
  };

  const campaignLists = lists;

  return (
    <Form form={form} layout="vertical" onFinish={handleSubmit}>
      {missingUnsubscribe && (
        <Alert
          type="warning"
          showIcon
          message="Le lien de désinscription est obligatoire"
          description="Ajoutez la variable {{lien_desinscription}} dans le corps du message (par ex. dans un lien « Se désabonner »)."
          style={{ marginBottom: 16 }}
        />
      )}
      <Form.Item
        name="listId"
        label="Liste de diffusion"
        rules={[{ required: true, message: 'Sélectionnez une liste' }]}
      >
        <Select
          placeholder="Choisir une liste"
          options={campaignLists.map((l) => ({ value: l.id, label: `${l.name} (${l.activeCount ?? 0} destinataires)` }))}
          loading={loading}
          disabled={!!campaign}
        />
      </Form.Item>
      <Form.Item name="templateId" label="Template (optionnel)">
        <Select
          placeholder="Aucun template"
          allowClear
          options={templates.map((t) => ({ value: t.id, label: t.name }))}
          loading={loading}
        />
      </Form.Item>
      <Form.Item
        name="subject"
        label="Sujet"
        rules={[{ required: true, message: 'Saisissez le sujet' }]}
      >
        <Input placeholder="Sujet du message" />
      </Form.Item>
      <Form.Item
        name="bodyHtml"
        label="Corps du message (HTML)"
        extra={HELP_VARS}
        rules={[
          { required: true, message: 'Saisissez le contenu' },
          {
            pattern: new RegExp(UNSUBSCRIBE_PLACEHOLDER.replace(/[{}]/g, '\\$&'), 'i'),
            message: `Vous devez inclure ${UNSUBSCRIBE_PLACEHOLDER} pour le lien de désinscription`
          }
        ]}
      >
        <HtmlCodeEditor minHeight={280} />
      </Form.Item>
      <Form.Item>
        <Button type="primary" htmlType="submit" loading={saving} disabled={missingUnsubscribe}>
          {campaign ? 'Enregistrer' : 'Créer la campagne'}
        </Button>
        {campaign && onPreview && campaign.status === 'DRAFT' && (
          <Button type="default" style={{ marginLeft: 8 }} onClick={() => onPreview(campaign.id)}>
            Aperçu
          </Button>
        )}
      </Form.Item>
    </Form>
  );
}
