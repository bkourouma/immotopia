import React, { useEffect, useState } from 'react';
import { App, Modal, Form, Input, Select, Button, Alert } from 'antd';
import { HtmlCodeEditor } from '../HtmlCodeEditor';
import { newsletterService } from '../../services/newsletter.service';
import type { NewsletterList, NewsletterTemplate } from '../../services/newsletter.service';
import type { Property } from '../../types/property-types';
import { t as translate } from '../../i18n/t';

import { activeLocale } from '../../i18n/format';
const UNSUBSCRIBE_PLACEHOLDER = '{{lien_desinscription}}';

const propertyTypeLabels: Record<string, string> = {
  APPARTEMENT: 'Appartement',
  MAISON_VILLA: translate('Maison / Villa'),
  STUDIO: 'Studio',
  DUPLEX_TRIPLEX: translate('Duplex / Triplex'),
  CHAMBRE_COLOCATION: translate('Chambre / Colocation'),
  BUREAU: 'Bureau',
  BOUTIQUE_COMMERCIAL: translate('Boutique / Commercial'),
  ENTREPOT_INDUSTRIEL: translate('Entrepôt / Industriel'),
  TERRAIN: 'Terrain',
  IMMEUBLE: 'Immeuble',
  PARKING_BOX: translate('Parking / Box'),
  LOT_PROGRAMME_NEUF: translate('Lot programme neuf')
};

const transactionModeLabels: Record<string, string> = {
  SALE: 'Vente',
  RENTAL: 'Location',
  SHORT_TERM: translate('Location courte durée')
};

function formatPrice(price?: number, currency?: string): string {
  if (!price) return translate('Prix sur demande');
  return new Intl.NumberFormat(activeLocale()).format(price) + ' ' + (currency || 'EUR');
}

function buildPropertyHtmlBody(property: Property, imageUrls: string[]): string {
  const typeLabel = propertyTypeLabels[property.propertyType] || property.propertyType;
  const modes = (property.transactionModes || []).map((m: string) => transactionModeLabels[m] || m).join(', ');
  const specs: string[] = [];
  if (property.rooms) specs.push(translate('{{rooms}} pièce(s)', { rooms: property.rooms }));
  if (property.bedrooms) specs.push(`${property.bedrooms} chambre(s)`);
  if (property.bathrooms) specs.push(`${property.bathrooms} salle(s) de bain`);
  if (property.surfaceArea) specs.push(`${property.surfaceArea} m²`);
  const specsHtml = specs.length
    ? translate('<p><strong>Caractéristiques :</strong> {{value}}</p>', { value: specs.join(' • ') })
    : '';

  let imagesHtml = '';
  if (imageUrls.length > 0) {
    imagesHtml = imageUrls
      .map(
        url =>
          `<img src="${url}" alt="${property.title}" style="max-width: 100%; height: auto; border-radius: 8px; margin: 8px 0;" />`
      )
      .join('');
  }

  return `<p>Bonjour {{prenom}},</p>

<p>Nous avons le plaisir de vous présenter une nouvelle propriété qui pourrait vous intéresser :</p>

<h2 style="color: #1890ff; margin-top: 16px;">${escapeHtml(property.title)}</h2>

${imagesHtml ? `<div style="margin: 16px 0;">${imagesHtml}</div>` : ''}

<p><strong>Type :</strong> ${escapeHtml(typeLabel)}${modes ? ` • <strong>Modes :</strong> ${escapeHtml(modes)}` : ''}</p>

${specsHtml}

<p><strong>Prix :</strong> ${formatPrice(property.price, property.currency)}</p>

${property.address ? `<p><strong>Adresse :</strong> ${escapeHtml(property.address)}</p>` : ''}
${property.locationZone ? `<p><strong>Zone :</strong> ${escapeHtml(property.locationZone)}</p>` : ''}

${property.description ? `<div style="margin-top: 16px;"><strong>Description :</strong><br/>${escapeHtml(property.description).replace(/\n/g, '<br/>')}</div>` : ''}

<p style="margin-top: 24px;">Contactez-nous pour une visite ou plus d'informations.</p>

<p>Cordialement,<br/>Votre agence</p>

<p><a href="${UNSUBSCRIBE_PLACEHOLDER}">Se désabonner</a></p>`;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

interface PropertyNewsletterCampaignModalProps {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  property: Property;
  imageUrls?: string[];
  onSuccess?: () => void;
}

export function PropertyNewsletterCampaignModal({
  open,
  onClose,
  tenantId,
  property,
  imageUrls = [],
  onSuccess
}: PropertyNewsletterCampaignModalProps) {
  const { message } = App.useApp();

  const [form] = Form.useForm();
  const [lists, setLists] = useState<NewsletterList[]>([]);
  const [templates, setTemplates] = useState<NewsletterTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [missingUnsubscribe, setMissingUnsubscribe] = useState(false);

  useEffect(() => {
    if (open && tenantId) {
      setLoading(true);
      Promise.all([newsletterService.listLists(tenantId), newsletterService.listTemplates(tenantId)])
        .then(([listsData, templatesData]) => {
          setLists(listsData);
          setTemplates(templatesData);
        })
        .catch(() => message.error(translate('Erreur lors du chargement des listes')))
        .finally(() => setLoading(false));
    }
  }, [open, tenantId, message]);

  useEffect(() => {
    if (open && property) {
      const location = property.locationZone || property.address || '';
      const subject = translate('Nouvelle propriété : {{title}}{{value}}', {
        title: property.title,
        value: location ? ` - ${location}` : ''
      });
      const bodyHtml = buildPropertyHtmlBody(property, imageUrls);
      form.setFieldsValue({ subject, bodyHtml, listId: undefined, templateId: undefined });
      setMissingUnsubscribe(false);
    }
  }, [open, property, imageUrls, form]);

  const bodyHtml = Form.useWatch('bodyHtml', form);
  useEffect(() => {
    const html = bodyHtml || '';
    setMissingUnsubscribe(!new RegExp(UNSUBSCRIBE_PLACEHOLDER.replace(/[{}]/g, '\\$&'), 'i').test(html));
  }, [bodyHtml]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await newsletterService.createCampaign(tenantId, {
        listId: values.listId,
        templateId: values.templateId || undefined,
        subject: values.subject,
        bodyHtml: values.bodyHtml
      });
      message.success(translate("Campagne créée. Vous pouvez l'envoyer depuis la page Campagnes."));
      form.resetFields();
      onClose();
      onSuccess?.();
    } catch (e: unknown) {
      message.error((e as Error).message || translate('Erreur lors de la création'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={translate('Créer une campagne newsletter pour cette propriété')}
      open={open}
      onCancel={onClose}
      footer={null}
      width={800}
      destroyOnClose
    >
      {missingUnsubscribe && (
        <Alert
          type="warning"
          showIcon
          message={translate('Le lien de désinscription est obligatoire')}
          description={translate('Ajoutez la variable {{UNSUBSCRIBE_PLACEHOLDER}} dans le corps du message.', {
            UNSUBSCRIBE_PLACEHOLDER: UNSUBSCRIBE_PLACEHOLDER
          })}
          style={{ marginBottom: 16 }}
        />
      )}
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          name="listId"
          label={translate('Liste de diffusion')}
          rules={[{ required: true, message: translate('Sélectionnez une liste') }]}
        >
          <Select
            placeholder={translate('Choisir une liste')}
            showSearch
            optionFilterProp="label"
            options={lists.map(l => ({ value: l.id, label: `${l.name} (${l.activeCount ?? 0} destinataires)` }))}
            loading={loading}
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
          <Input placeholder={translate("Sujet de l'email")} />
        </Form.Item>
        <Form.Item
          name="bodyHtml"
          label={translate('Corps du message (HTML)')}
          extra="Variables : {{prenom}}, {{nom}}, {{email}}, {{lien_desinscription}} (obligatoire)"
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
          <HtmlCodeEditor minHeight={320} />
        </Form.Item>
        <Form.Item style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button onClick={onClose}>{translate('Annuler')}</Button>
            <Button type="primary" htmlType="submit" loading={saving} disabled={missingUnsubscribe}>
              {translate('Créer la campagne')}
            </Button>
          </div>
        </Form.Item>
      </Form>
    </Modal>
  );
}
