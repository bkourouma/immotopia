import React, { useEffect, useState } from 'react';
import { Form, Input, Select, Button, Card, Typography, Alert } from 'antd';
import { HtmlCodeEditor } from '../HtmlCodeEditor';
import type { NewsletterList, NewsletterTemplate, NewsletterCampaign } from '../../services/newsletter.service';
import { t as translate } from '../../i18n/t';

const { TextArea } = Input;
const { Text } = Typography;

interface CampaignFormProps {
  lists: NewsletterList[];
  templates: NewsletterTemplate[];
  campaign?: NewsletterCampaign | null;
  loading?: boolean;
  saving?: boolean;
  onSubmit: (values: { listId: string; templateId?: string; subject: string; bodyHtml: string }) => Promise<void>;
  onPreview?: (campaignId: string) => void;
}

const UNSUBSCRIBE_PLACEHOLDER = '{{lien_desinscription}}';
const CAMPAIGN_VARIABLES = '{{prenom}}, {{nom}}, {{email}}, {{lien_desinscription}}';

export function CampaignForm({ lists, templates, campaign, loading, saving, onSubmit, onPreview }: CampaignFormProps) {
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
          message={translate('Le lien de désinscription est obligatoire')}
          description={translate(
            'Ajoutez la variable {{variable}} dans le corps du message (par ex. dans un lien « Se désabonner »).',
            { variable: UNSUBSCRIBE_PLACEHOLDER }
          )}
          style={{ marginBottom: 16 }}
        />
      )}
      <Form.Item
        name="listId"
        label={translate('Liste de diffusion')}
        rules={[{ required: true, message: translate('Sélectionnez une liste') }]}
      >
        <Select
          placeholder={translate('Choisir une liste')}
          showSearch
          optionFilterProp="label"
          options={campaignLists.map(l => ({ value: l.id, label: `${l.name} (${l.activeCount ?? 0} destinataires)` }))}
          loading={loading}
          disabled={!!campaign}
        />
      </Form.Item>
      <Form.Item name="templateId" label={translate('Template (optionnel)')}>
        <Select
          placeholder={translate('Aucun template')}
          allowClear
          showSearch
          optionFilterProp="label"
          options={templates.map(t => ({ value: t.id, label: t.name }))}
          loading={loading}
        />
      </Form.Item>
      <Form.Item
        name="subject"
        label={translate('Sujet')}
        rules={[{ required: true, message: translate('Saisissez le sujet') }]}
      >
        <Input placeholder={translate('Sujet du message')} />
      </Form.Item>
      <Form.Item
        name="bodyHtml"
        label={translate('Corps du message (HTML)')}
        extra={translate(
          'Variables disponibles : {{variables}} ({{lien_desinscription}} est obligatoire). Le contenu sera aussi relayé sur WhatsApp (version texte) quand un numéro avec consentement existe.',
          { variables: CAMPAIGN_VARIABLES, lien_desinscription: UNSUBSCRIBE_PLACEHOLDER }
        )}
        rules={[
          { required: true, message: translate('Saisissez le contenu') },
          {
            pattern: new RegExp(UNSUBSCRIBE_PLACEHOLDER.replace(/[{}]/g, '\\$&'), 'i'),
            message: translate('Vous devez inclure {{UNSUBSCRIBE_PLACEHOLDER}} pour le lien de désinscription', {
              UNSUBSCRIBE_PLACEHOLDER: UNSUBSCRIBE_PLACEHOLDER
            })
          }
        ]}
      >
        <HtmlCodeEditor minHeight={280} />
      </Form.Item>
      <Form.Item>
        <Button type="primary" htmlType="submit" loading={saving} disabled={missingUnsubscribe}>
          {campaign ? translate('Enregistrer') : translate('Créer la campagne')}
        </Button>
        {campaign && onPreview && campaign.status === 'DRAFT' && (
          <Button type="default" style={{ marginInlineStart: 8 }} onClick={() => onPreview(campaign.id)}>
            {translate('Aperçu')}
          </Button>
        )}
      </Form.Item>
    </Form>
  );
}
