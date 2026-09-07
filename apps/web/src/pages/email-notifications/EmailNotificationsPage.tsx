import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Card,
  Table,
  Switch,
  Button,
  Modal,
  Form,
  Input,
  message,
  Spin,
  Tag,
  Space,
  Typography,
  Tooltip,
  Collapse
} from 'antd';
import { EditOutlined, RollbackOutlined } from '@ant-design/icons';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { HtmlCodeEditor } from '../../components/HtmlCodeEditor';
import {
  emailNotificationConfigService,
  type EmailNotificationConfigItem,
  type UpdateEmailNotificationPayload
} from '../../services/email-notification-config-service';

const { Title, Text } = Typography;

export function EmailNotificationsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [items, setItems] = useState<EmailNotificationConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<EmailNotificationConfigItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const list = await emailNotificationConfigService.list(tenantId);
      setItems(list);
    } catch (e: any) {
      message.error(e.response?.data?.message || 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [tenantId]);

  const handleToggleEnabled = async (key: string, enabled: boolean) => {
    if (!tenantId) return;
    try {
      await emailNotificationConfigService.update(tenantId, key, { enabled });
      setItems((prev) => prev.map((i) => (i.key === key ? { ...i, enabled } : i)));
      message.success(enabled ? 'Notification activée' : 'Notification désactivée');
    } catch (e: any) {
      message.error(e.response?.data?.message || 'Erreur');
    }
  };

  const openEditModal = (record: EmailNotificationConfigItem) => {
    setEditingItem(record);
    form.setFieldsValue({
      subjectOverride: record.subjectOverride ?? '',
      bodyHtmlOverride: record.bodyHtmlOverride ?? ''
    });
    setModalOpen(true);
  };

  /** Remplir le formulaire avec le template par défaut (modèle dans le code) */
  const fillWithDefaultTemplate = () => {
    if (!editingItem) return;
    form.setFieldsValue({
      subjectOverride: editingItem.defaultSubject || '',
      bodyHtmlOverride: editingItem.defaultBodyHtml || ''
    });
    message.info('Formulaire rempli avec le template par défaut. Vous pouvez modifier puis enregistrer.');
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingItem(null);
    form.resetFields();
  };

  const handleSaveTemplate = async () => {
    if (!tenantId || !editingItem) return;
    try {
      const values = await form.validateFields();
      setSaving(true);
      await emailNotificationConfigService.update(tenantId, editingItem.key, {
        subjectOverride: values.subjectOverride?.trim() || null,
        bodyHtmlOverride: values.bodyHtmlOverride?.trim() || null
      });
      message.success('Template enregistré');
      closeModal();
      load();
    } catch (e: any) {
      if (e.errorFields) return;
      message.error(e.response?.data?.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async (record: EmailNotificationConfigItem) => {
    if (!tenantId) return;
    Modal.confirm({
      title: 'Réinitialiser le template ?',
      content: `Le sujet et le corps de l'email "${record.label}" reviendront au contenu par défaut.`,
      okText: 'Réinitialiser',
      cancelText: 'Annuler',
      onOk: async () => {
        try {
          await emailNotificationConfigService.reset(tenantId, record.key);
          message.success('Template réinitialisé');
          load();
        } catch (e: any) {
          message.error(e.response?.data?.message || 'Erreur');
        }
      }
    });
  };

  const columns = [
    {
      title: 'Notification',
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
      width: 140,
      render: (val: string) => <Tag color="blue">{val}</Tag>
    },
    {
      title: 'Activer',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 100,
      render: (enabled: boolean, record: EmailNotificationConfigItem) => (
        <Switch
          checked={enabled}
          onChange={(checked) => handleToggleEnabled(record.key, checked)}
        />
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_: unknown, record: EmailNotificationConfigItem) => (
        <Space>
          <Tooltip title="Modifier le template (sujet et corps de l'email)">
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEditModal(record)}
            >
              Modifier
            </Button>
          </Tooltip>
          {(record.subjectOverride || record.bodyHtmlOverride) && (
            <Tooltip title="Revenir au template par défaut">
              <Button
                type="link"
                size="small"
                danger
                icon={<RollbackOutlined />}
                onClick={() => handleReset(record)}
              >
                Réinitialiser
              </Button>
            </Tooltip>
          )}
        </Space>
      )
    }
  ];

  return (
    <DashboardLayout>
      <Card>
        <Title level={4} style={{ marginBottom: 16 }}>
          Notifications email
        </Title>
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          Activez ou désactivez chaque notification et personnalisez le sujet et le contenu des
          emails envoyés par l'application (maintenance, paiements, etc.).
        </Text>
        <Spin spinning={loading}>
          <Table
            rowKey="key"
            columns={columns}
            dataSource={items}
            pagination={false}
            size="middle"
          />
        </Spin>
      </Card>

      <Modal
        title={editingItem ? `Template : ${editingItem.label}` : 'Modifier le template'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={handleSaveTemplate}
        confirmLoading={saving}
        width={800}
        destroyOnClose
        okText="Enregistrer"
      >
        {editingItem && (
          <>
            <Collapse
              defaultActiveKey={['default']}
              style={{ marginBottom: 16 }}
              items={[
                {
                  key: 'default',
                  label: 'Template par défaut (modèle dans le code)',
                  children: (
                    <div style={{ background: '#fafafa', padding: 12, borderRadius: 8 }}>
                      <div style={{ marginBottom: 12 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>Sujet par défaut :</Text>
                        <div style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 13, wordBreak: 'break-word' }}>
                          {editingItem.defaultSubject || '—'}
                        </div>
                      </div>
                      <div>
                        <Text type="secondary" style={{ fontSize: 12 }}>Corps HTML par défaut :</Text>
                        <div style={{ marginTop: 4 }}>
                          <HtmlCodeEditor
                            readOnly
                            value={editingItem.defaultBodyHtml || ''}
                            minHeight={220}
                          />
                        </div>
                      </div>
                      <Button type="dashed" size="small" onClick={fillWithDefaultTemplate} style={{ marginTop: 8 }}>
                        Utiliser ce modèle par défaut dans les champs ci-dessous
                      </Button>
                    </div>
                  )
                }
              ]}
            />
            <Form form={form} layout="vertical">
              <Form.Item
                name="subjectOverride"
                label="Sujet personnalisé (vide = sujet par défaut)"
              >
                <Input placeholder="Ex: Nouveau ticket - {{ticketTitle}}" />
              </Form.Item>
              <Form.Item
                name="bodyHtmlOverride"
                label="Corps personnalisé HTML (vide = contenu par défaut). Variables : {{ticketTitle}}, {{agencyName}}, {{leaseNumber}}, etc."
              >
                <HtmlCodeEditor
                  placeholder="<p>Bonjour {{tenantName}}, ...</p>"
                  minHeight={280}
                />
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>
    </DashboardLayout>
  );
}
