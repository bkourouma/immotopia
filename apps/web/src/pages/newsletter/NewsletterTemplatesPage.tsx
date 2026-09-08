import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { App, Card, Table, Button, Modal, Form, Input, Space, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { HtmlCodeEditor } from '../../components/HtmlCodeEditor';
import { newsletterService, type NewsletterTemplate } from '../../services/newsletter.service';
import { useConfirmAction } from '../../components/primitives';

const HELP_TEXT = 'Variables disponibles : {{contenu}}, {{prenom}}, {{nom}}, {{email}}, {{lien_desinscription}}';

export function NewsletterTemplatesPage() {
  const { message } = App.useApp();
  const confirmAction = useConfirmAction();

  const { tenantId } = useParams<{ tenantId: string }>();
  const [templates, setTemplates] = useState<NewsletterTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NewsletterTemplate | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const loadTemplates = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const data = await newsletterService.listTemplates(tenantId);
      setTemplates(data);
    } catch (e) {
      message.error((e as Error).message || 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  }, [tenantId, message]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleOpenCreate = () => {
    setEditingTemplate(null);
    form.setFieldsValue({
      name: '',
      html: '<div style="font-family: sans-serif;">\n  <p>Bonjour {{prenom}},</p>\n  <div>{{contenu}}</div>\n  <p><a href="{{lien_desinscription}}">Se désabonner</a></p>\n</div>'
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (tpl: NewsletterTemplate) => {
    setEditingTemplate(tpl);
    form.setFieldsValue({ name: tpl.name, html: tpl.html });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (!tenantId) return;
    setSaving(true);
    try {
      if (editingTemplate) {
        await newsletterService.updateTemplate(tenantId, editingTemplate.id, values);
        message.success('Template modifié');
      } else {
        await newsletterService.createTemplate(tenantId, values);
        message.success('Template créé');
      }
      setModalOpen(false);
      loadTemplates();
    } catch (e) {
      message.error((e as Error).message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (tpl: NewsletterTemplate) => {
    if (!tenantId) return;
    confirmAction({
      title: 'Supprimer le template',
      description: `Supprimer « ${tpl.name} » ?`,
      okText: 'Supprimer',
      danger: true,
      onConfirm: async () => {
        try {
          await newsletterService.deleteTemplate(tenantId, tpl.id);
          message.success('Template supprimé');
          loadTemplates();
        } catch (e) {
          message.error((e as Error).message || 'Erreur');
          throw e;
        }
      }
    });
  };

  const columns = [
    { title: 'Nom', dataIndex: 'name', key: 'name' },
    {
      title: 'Aperçu',
      key: 'preview',
      render: (_: unknown, r: NewsletterTemplate) => (
        <Typography.Text type="secondary" ellipsis style={{ maxWidth: 200 }}>
          {r.html.replace(/<[^>]+>/g, ' ').slice(0, 80)}...
        </Typography.Text>
      )
    },
    {
      title: '',
      key: 'actions',
      render: (_: unknown, record: NewsletterTemplate) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleOpenEdit(record)}>
            Modifier
          </Button>
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>
            Supprimer
          </Button>
        </Space>
      )
    }
  ];

  return (
    <>
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Templates newsletter
          </Typography.Title>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>
            Nouveau template
          </Button>
        </div>

        <Card>
          <Table
            loading={loading}
            columns={columns}
            dataSource={templates}
            rowKey="id"
            locale={{ emptyText: 'Aucun template. Créez-en un pour réutiliser une structure HTML dans vos campagnes.' }}
          />
        </Card>
      </div>

      <Modal
        title={editingTemplate ? 'Modifier le template' : 'Nouveau template'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        width={700}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Nom" rules={[{ required: true, message: 'Nom requis' }]}>
            <Input placeholder="Ex: Modèle standard" />
          </Form.Item>
          <Form.Item name="html" label="HTML" extra={HELP_TEXT} rules={[{ required: true, message: 'Contenu requis' }]}>
            <HtmlCodeEditor minHeight={200} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
