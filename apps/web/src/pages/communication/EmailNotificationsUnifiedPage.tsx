import React, { useState, useEffect, useMemo } from 'react';
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
  Select,
  Divider,
  Checkbox
} from 'antd';
import { EditOutlined, MailOutlined, CodeOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import { HtmlCodeEditor } from '../../components/HtmlCodeEditor';
import {
  emailNotificationConfigService,
  type EmailNotificationConfigItem,
  type UpdateEmailNotificationPayload
} from '../../services/email-notification-config-service';
import { VARIABLES_BY_EVENT_KEY, getEventGroupKey } from '../../constants/email-notification-events';
import { getVariablePlaceholder } from '../../constants/template-variables';

const { Title, Text } = Typography;

/** Un événement déclencheur unique (sans doublon par groupe). */
interface UniqueEventOption {
  eventGroupKey: string;
  label: string;
}

export function EmailNotificationsUnifiedPage() {
  const { message } = App.useApp();

  const { tenantId } = useParams<{ tenantId: string }>();
  const [items, setItems] = useState<EmailNotificationConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEventGroup, setSelectedEventGroup] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [applyToOtherKeys, setApplyToOtherKeys] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const list = await emailNotificationConfigService.list(tenantId);
      setItems(list);
      setSelectedKey(null);
      setSelectedEventGroup(null);
      form.resetFields();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message || 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [tenantId]);

  const uniqueEvents = useMemo((): UniqueEventOption[] => {
    const seen = new Set<string>();
    const result: UniqueEventOption[] = [];
    for (const item of items) {
      const group = getEventGroupKey(item.key);
      if (!seen.has(group)) {
        seen.add(group);
        result.push({ eventGroupKey: group, label: item.label });
      }
    }
    return result;
  }, [items]);

  const recipientsForSelectedEvent = useMemo(() => {
    if (!selectedEventGroup) return [];
    return items.filter(i => getEventGroupKey(i.key) === selectedEventGroup);
  }, [items, selectedEventGroup]);

  useEffect(() => {
    if (!selectedKey || items.length === 0) return;
    const item = items.find(i => i.key === selectedKey);
    if (item) {
      form.setFieldsValue({
        subjectOverride: item.subjectOverride ?? item.defaultSubject ?? '',
        bodyHtmlOverride: item.bodyHtmlOverride ?? item.defaultBodyHtml ?? ''
      });
    }
  }, [selectedKey, items]);

  const selectedItem = items.find(i => i.key === selectedKey) ?? null;
  const variablesForEvent = selectedKey ? (VARIABLES_BY_EVENT_KEY[selectedKey] ?? []) : [];
  const sameEventOtherItems =
    selectedKey && selectedEventGroup ? recipientsForSelectedEvent.filter(i => i.key !== selectedKey) : [];

  const handleSelectEvent = (eventGroupKey: string | null) => {
    setSelectedEventGroup(eventGroupKey);
    setSelectedKey(null);
    setApplyToOtherKeys([]);
    form.resetFields();
  };

  const handleSelectRecipient = (key: string) => {
    setSelectedKey(key);
    setApplyToOtherKeys([]);
    const item = items.find(i => i.key === key);
    if (item) {
      form.setFieldsValue({
        subjectOverride: item.subjectOverride ?? item.defaultSubject ?? '',
        bodyHtmlOverride: item.bodyHtmlOverride ?? item.defaultBodyHtml ?? ''
      });
    }
  };

  const handleToggleEnabled = async (key: string, enabled: boolean) => {
    if (!tenantId) return;
    try {
      await emailNotificationConfigService.update(tenantId, key, { enabled });
      setItems(prev => prev.map(i => (i.key === key ? { ...i, enabled } : i)));
      message.success(enabled ? 'Notification activée' : 'Notification désactivée');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message || 'Erreur');
    }
  };

  const fillWithDefaultTemplate = () => {
    if (!selectedItem) return;
    form.setFieldsValue({
      subjectOverride: selectedItem.defaultSubject || '',
      bodyHtmlOverride: selectedItem.defaultBodyHtml || ''
    });
    message.info('Formulaire rempli avec le template par défaut. Vous pouvez modifier puis enregistrer.');
  };

  const handleSaveTemplate = async () => {
    if (!tenantId || !selectedItem) return;
    try {
      const values = await form.validateFields();
      const payload: UpdateEmailNotificationPayload = {
        subjectOverride: values.subjectOverride?.trim() || null,
        bodyHtmlOverride: values.bodyHtmlOverride?.trim() || null
      };
      setSaving(true);
      await emailNotificationConfigService.update(tenantId, selectedItem.key, payload);
      const keysToUpdate = [selectedItem.key, ...applyToOtherKeys];
      for (const key of keysToUpdate) {
        if (key !== selectedItem.key) {
          await emailNotificationConfigService.update(tenantId, key, payload);
        }
      }
      setApplyToOtherKeys([]);
      message.success(
        keysToUpdate.length > 1
          ? `Template enregistré pour ${keysToUpdate.length} destinataire(s).`
          : 'Template enregistré'
      );
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
      await emailNotificationConfigService.reset(tenantId, selectedItem.key);
      message.success('Template réinitialisé');
      form.setFieldsValue({
        subjectOverride: selectedItem.defaultSubject ?? '',
        bodyHtmlOverride: selectedItem.defaultBodyHtml ?? ''
      });
      load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      message.error(err.response?.data?.message || 'Erreur');
    }
  };

  const insertVariable = (variableName: string) => {
    const placeholder = getVariablePlaceholder(variableName);
    const body = form.getFieldValue('bodyHtmlOverride') ?? '';
    form.setFieldsValue({ bodyHtmlOverride: body + placeholder });
  };

  const columns = [
    {
      title: 'Événement déclencheur',
      key: 'label',
      render: (_: unknown, r: EmailNotificationConfigItem) => (
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
      title: 'Destinataire',
      dataIndex: 'recipientLabel',
      key: 'recipientLabel',
      width: 160,
      render: (val: string) => <Tag color="blue">{val}</Tag>
    },
    {
      title: 'Activer',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 90,
      render: (enabled: boolean, record: EmailNotificationConfigItem) => (
        <Switch checked={enabled} onChange={checked => handleToggleEnabled(record.key, checked)} />
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      render: (_: unknown, record: EmailNotificationConfigItem) => (
        <Tooltip title="Modifier le template">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setSelectedEventGroup(getEventGroupKey(record.key));
              setSelectedKey(record.key);
              form.setFieldsValue({
                subjectOverride: record.subjectOverride ?? record.defaultSubject ?? '',
                bodyHtmlOverride: record.bodyHtmlOverride ?? record.defaultBodyHtml ?? ''
              });
              setApplyToOtherKeys([]);
              const el = document.getElementById('email-notif-edit-section');
              el?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            Modifier
          </Button>
        </Tooltip>
      )
    }
  ];

  return (
    <>
      <Card style={{ marginBottom: 24 }}>
        <Space align="center" style={{ marginBottom: 8 }}>
          <MailOutlined style={{ fontSize: 20, color: '#1890ff' }} />
          <Title level={4} style={{ margin: 0 }}>
            Notifications email
          </Title>
        </Space>
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          Gérez les événements déclencheurs et personnalisez les templates d&apos;emails (sujet et corps). Les variables
          sont remplacées à l&apos;envoi. Canal : Email uniquement.
        </Text>

        <Divider style={{ margin: '16px 0' }} />

        <div id="email-notif-edit-section">
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            Choisir un événement déclencheur
          </Text>
          <Select
            placeholder="Sélectionner un événement déclencheur"
            value={selectedEventGroup ?? undefined}
            onChange={value => handleSelectEvent(value ?? null)}
            allowClear
            style={{ width: '100%', maxWidth: 480, marginBottom: 16 }}
            options={uniqueEvents.map(ev => ({
              value: ev.eventGroupKey,
              label: ev.label
            }))}
            loading={loading}
          />

          {selectedEventGroup && recipientsForSelectedEvent.length > 0 && (
            <>
              <div style={{ marginBottom: 16 }}>
                <Space align="center" style={{ marginBottom: 8 }}>
                  <UserOutlined style={{ color: '#1890ff' }} />
                  <Text strong>Destinataires pour cet événement</Text>
                </Space>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
                  Cliquez sur un destinataire pour afficher et modifier le template qui lui est envoyé.
                </Text>
                <Space size={8} wrap>
                  {recipientsForSelectedEvent.map(item => (
                    <Button
                      key={item.key}
                      type={selectedKey === item.key ? 'primary' : 'default'}
                      icon={<MailOutlined />}
                      onClick={() => handleSelectRecipient(item.key)}
                    >
                      {item.recipientLabel}
                    </Button>
                  ))}
                </Space>
              </div>

              {selectedItem && (
                <>
                  <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
                    <Text type="secondary">{selectedItem.description}</Text>
                    <br />
                    <Tag color="blue" style={{ marginTop: 6 }}>
                      Template pour : {selectedItem.recipientLabel}
                    </Tag>
                  </Card>

                  <Collapse
                    defaultActiveKey={['default']}
                    style={{ marginBottom: 16 }}
                    items={[
                      {
                        key: 'default',
                        label: 'Template par défaut (modèle)',
                        children: (
                          <div
                            style={{ background: '#fff', padding: 12, borderRadius: 8, border: '1px solid #f0f0f0' }}
                          >
                            <div style={{ marginBottom: 12 }}>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                Sujet par défaut :
                              </Text>
                              <div
                                style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-word' }}
                              >
                                {selectedItem.defaultSubject || '—'}
                              </div>
                            </div>
                            <div>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                Corps HTML par défaut :
                              </Text>
                              <div style={{ marginTop: 4 }}>
                                <HtmlCodeEditor readOnly value={selectedItem.defaultBodyHtml || ''} minHeight={180} />
                              </div>
                            </div>
                            <Button
                              type="dashed"
                              size="small"
                              onClick={fillWithDefaultTemplate}
                              style={{ marginTop: 8 }}
                            >
                              Utiliser ce modèle dans les champs ci-dessous
                            </Button>
                          </div>
                        )
                      }
                    ]}
                  />

                  <Form form={form} layout="vertical">
                    <Form.Item name="subjectOverride" label="Sujet personnalisé (vide = sujet par défaut)">
                      <Input placeholder="Ex: Nouveau ticket - {{ticketTitle}}" />
                    </Form.Item>
                    <Form.Item
                      name="bodyHtmlOverride"
                      label="Corps personnalisé HTML (vide = contenu par défaut)"
                      extra="Utilisez les variables ci-dessous avec la syntaxe {{nomVariable}}."
                    >
                      <HtmlCodeEditor placeholder="<p>Bonjour {{contactName}}, ...</p>" minHeight={280} />
                    </Form.Item>

                    <div style={{ marginBottom: 16 }}>
                      <Space align="center" style={{ marginBottom: 8 }}>
                        <CodeOutlined />
                        <Text type="secondary" strong>
                          Variables pour cet événement
                        </Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Cliquez pour insérer dans le corps du template.
                        </Text>
                      </Space>
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

                    {sameEventOtherItems.length > 0 && (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: 12,
                          background: '#f6ffed',
                          border: '1px solid #b7eb8f',
                          borderRadius: 8
                        }}
                      >
                        <Space align="center" style={{ marginBottom: 8 }}>
                          <TeamOutlined style={{ color: '#52c41a' }} />
                          <Text strong>Appliquer ce template à d&apos;autres destinataires</Text>
                        </Space>
                        <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
                          En enregistrant, appliquer le même sujet et le même corps aux destinataires cochés ci-dessous.
                        </Text>
                        <Checkbox.Group
                          value={applyToOtherKeys}
                          onChange={checked => setApplyToOtherKeys(checked as string[])}
                          options={sameEventOtherItems.map(i => ({
                            value: i.key,
                            label: i.recipientLabel
                          }))}
                        />
                      </div>
                    )}

                    <Space>
                      <Button type="primary" onClick={handleSaveTemplate} loading={saving}>
                        Enregistrer
                      </Button>
                      <Button onClick={handleReset}>Réinitialiser au modèle par défaut</Button>
                    </Space>
                  </Form>
                </>
              )}

              {selectedEventGroup && !selectedKey && (
                <Card size="small" style={{ background: '#fafafa', textAlign: 'center', padding: 24 }}>
                  <Text type="secondary">
                    Cliquez sur un destinataire ci-dessus pour afficher et modifier son template.
                  </Text>
                </Card>
              )}
            </>
          )}
        </div>
      </Card>

      <Card title="Liste des notifications email">
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
