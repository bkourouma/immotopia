import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  App,
  Card,
  Table,
  Switch,
  Button,
  Form,
  Input,
  Spin,
  Tag,
  Space,
  Typography,
  Tooltip,
  Collapse,
  Alert
} from 'antd';
import { EditOutlined, MessageOutlined } from '@ant-design/icons';
import {
  whatsappNotificationConfigService,
  type WhatsappNotificationConfigItem,
  type UpdateWhatsappNotificationPayload
} from '../../services/whatsapp-notification-config-service';
import { WHATSAPP_VARIABLES_BY_KEY, getVariablePlaceholder } from '../../constants/whatsapp-notification-variables';
import { t } from '../../i18n/t';

const { Title, Text } = Typography;
const { TextArea } = Input;

export function WhatsAppNotificationsPage() {
  const { message } = App.useApp();

  const { tenantId } = useParams<{ tenantId: string }>();
  const [items, setItems] = useState<WhatsappNotificationConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const list = await whatsappNotificationConfigService.list(tenantId);
      setItems(list);
      if (!selectedKey) form.resetFields();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message || t('Erreur lors du chargement'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [tenantId]);

  const selectedItem = items.find(i => i.key === selectedKey) ?? null;
  const variablesForEvent = selectedKey ? (WHATSAPP_VARIABLES_BY_KEY[selectedKey] ?? []) : [];

  useEffect(() => {
    if (!selectedItem) return;
    form.setFieldsValue({
      bodyOverride: selectedItem.bodyOverride ?? selectedItem.defaultBody ?? '',
      contentSid: selectedItem.contentSid ?? '',
      contentVariablesJson: selectedItem.contentVariablesJson ?? ''
    });
  }, [selectedKey, selectedItem]);

  const handleToggleEnabled = async (key: string, enabled: boolean) => {
    if (!tenantId) return;
    try {
      await whatsappNotificationConfigService.update(tenantId, key, { enabled });
      setItems(prev => prev.map(i => (i.key === key ? { ...i, enabled } : i)));
      message.success(enabled ? t('Notification activée') : t('Notification désactivée'));
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message || 'Erreur');
    }
  };

  const handleSaveTemplate = async () => {
    if (!tenantId || !selectedItem) return;
    try {
      const values = await form.validateFields();
      const payload: UpdateWhatsappNotificationPayload = {
        bodyOverride: values.bodyOverride?.trim() || null,
        contentSid: values.contentSid?.trim() || null,
        contentVariablesJson: values.contentVariablesJson?.trim() || null
      };
      setSaving(true);
      await whatsappNotificationConfigService.update(tenantId, selectedItem.key, payload);
      message.success(t('Configuration enregistrée'));
      load();
    } catch (e: unknown) {
      if ((e as { errorFields?: unknown[] })?.errorFields) return;
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!tenantId || !selectedItem) return;
    try {
      await whatsappNotificationConfigService.reset(tenantId, selectedItem.key);
      message.success(t('Message réinitialisé'));
      form.setFieldsValue({ bodyOverride: selectedItem.defaultBody ?? '' });
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message || 'Erreur');
    }
  };

  const insertVariable = (variableName: string) => {
    const placeholder = getVariablePlaceholder(variableName);
    const body = form.getFieldValue('bodyOverride') ?? '';
    form.setFieldsValue({ bodyOverride: body + placeholder });
  };

  const columns = [
    {
      title: t('Événement déclencheur'),
      key: 'label',
      render: (_: unknown, r: WhatsappNotificationConfigItem) => (
        <div>
          <Text strong>{r.label}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {r.description}
          </Text>
        </div>
      )
    },
    {
      title: t('Destinataire'),
      dataIndex: 'recipientLabel',
      key: 'recipientLabel',
      width: 140,
      render: (val: string) => <Tag color="green">{val}</Tag>
    },
    {
      title: t('Activer'),
      dataIndex: 'enabled',
      key: 'enabled',
      width: 90,
      render: (enabled: boolean, record: WhatsappNotificationConfigItem) => (
        <Switch checked={enabled} onChange={checked => handleToggleEnabled(record.key, checked)} />
      )
    },
    {
      title: t('Actions'),
      key: 'actions',
      width: 100,
      render: (_: unknown, record: WhatsappNotificationConfigItem) => (
        <Tooltip title={t('Modifier le message')}>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setSelectedKey(record.key);
              form.setFieldsValue({
                bodyOverride: record.bodyOverride ?? record.defaultBody ?? '',
                contentSid: record.contentSid ?? '',
                contentVariablesJson: record.contentVariablesJson ?? ''
              });
              const el = document.getElementById('whatsapp-notif-edit-section');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            {t('Modifier')}
          </Button>
        </Tooltip>
      )
    }
  ];

  return (
    <>
      <Card style={{ marginBottom: 24 }}>
        <Space align="center" style={{ marginBottom: 8 }}>
          <MessageOutlined style={{ fontSize: 20, color: '#25D366' }} />
          <Title level={4} style={{ margin: 0 }}>
            {t('Notifications WhatsApp')}
          </Title>
        </Space>
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          Gérez les événements déclencheurs et personnalisez les messages WhatsApp (Twilio). Les messages ne sont
          envoyés qu&apos;aux contacts ayant donné leur consentement (consent_whatsapp) et un numéro WhatsApp renseigné.
        </Text>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title={t("Message initié par l'entreprise (Sandbox / production)")}
          description={t(
            'Pour envoyer sans que le client ait répondu, Twilio exige un modèle pré-approuvé. Renseignez un Content SID (ex. HXxxx) et le mapping des variables (ex. {"1":"appointmentDate","2":"appointmentTime"}) dans la section « Template Twilio » ci-dessous. Ex. Sandbox « Rappels de rendez-vous » : Content SID = HXb5b62575e6e4ff6129ad7c8efe1f983e.'
          )}
        />

        <div id="whatsapp-notif-edit-section">
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            Modifier le message d&apos;un événement
          </Text>
          <Space wrap style={{ marginBottom: 16 }}>
            {items.map(item => (
              <Button
                key={item.key}
                type={selectedKey === item.key ? 'primary' : 'default'}
                icon={<MessageOutlined />}
                onClick={() => {
                  setSelectedKey(item.key);
                  form.setFieldsValue({
                    bodyOverride: item.bodyOverride ?? item.defaultBody ?? '',
                    contentSid: item.contentSid ?? '',
                    contentVariablesJson: item.contentVariablesJson ?? ''
                  });
                }}
              >
                {item.label}
              </Button>
            ))}
          </Space>

          {selectedItem && (
            <>
              <Card size="small" style={{ marginBottom: 16, background: '#f6ffed' }}>
                <Text type="secondary">{selectedItem.description}</Text>
                <br />
                <Tag color="green" style={{ marginTop: 6 }}>
                  {t('Destinataire :')} {selectedItem.recipientLabel}
                </Tag>
              </Card>

              <Form form={form} layout="vertical">
                <Form.Item
                  name="bodyOverride"
                  label={t('Message personnalisé (vide = message par défaut)')}
                  extra="Utilisez les variables avec la syntaxe {{nomVariable}}. Texte uniquement (pas de HTML)."
                >
                  <TextArea
                    rows={4}
                    placeholder="Ex: Bonjour {{tenantName}}, votre ticket {{ticketTitle}} a été enregistré."
                  />
                </Form.Item>

                <div style={{ marginBottom: 16 }}>
                  <Text type="secondary" strong style={{ display: 'block', marginBottom: 8 }}>
                    {t('Variables pour cet événement (cliquez pour insérer)')}
                  </Text>
                  <Space size={[4, 4]} wrap>
                    {variablesForEvent.map(name => (
                      <Tag
                        key={name}
                        style={{ cursor: 'pointer', marginBottom: 4 }}
                        onClick={() => insertVariable(name)}
                      >
                        {`{{${name}}}`}
                      </Tag>
                    ))}
                  </Space>
                </div>

                <Collapse
                  style={{ marginBottom: 16 }}
                  items={[
                    {
                      key: 'twilio-template',
                      label: t("Template Twilio (message initié par l'entreprise)"),
                      children: (
                        <>
                          <Form.Item
                            name="contentSid"
                            label={t('Content SID (Twilio)')}
                            extra={t('Ex. Sandbox Rappels de rendez-vous : HXb5b62575e6e4ff6129ad7c8efe1f983e')}
                          >
                            <Input placeholder={'HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'} />
                          </Form.Item>
                          <Form.Item
                            name="contentVariablesJson"
                            label={t('Mapping des variables (JSON)')}
                            extra={t(
                              'Placeholders Twilio (1, 2, ...) vers nos clés. Ex: {"1":"appointmentDate","2":"appointmentTime"}'
                            )}
                          >
                            <TextArea rows={2} placeholder='{"1":"appointmentDate","2":"appointmentTime"}' />
                          </Form.Item>
                        </>
                      )
                    }
                  ]}
                />

                <Space>
                  <Button type="primary" onClick={handleSaveTemplate} loading={saving}>
                    {t('Enregistrer')}
                  </Button>
                  <Button onClick={handleReset}>{t('Réinitialiser au message par défaut')}</Button>
                </Space>
              </Form>
            </>
          )}
        </div>
      </Card>

      <Card title={t('Liste des notifications WhatsApp')}>
        <Spin spinning={loading}>
          <Table
            scroll={{ x: 'max-content' }}
            rowKey="key"
            columns={columns}
            dataSource={items}
            pagination={false}
            size="middle"
          />
        </Spin>
      </Card>
    </>
  );
}
