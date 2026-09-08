import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { App, Card, Table, Button, Modal, Tag, Space, Spin, Select, DatePicker, Typography } from 'antd';
import {
  PlusOutlined,
  SendOutlined,
  EditOutlined,
  EyeOutlined,
  CalendarOutlined,
  StopOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { CampaignForm } from '../../components/newsletter/CampaignForm';
import {
  newsletterService,
  type NewsletterList,
  type NewsletterTemplate,
  type NewsletterCampaign
} from '../../services/newsletter.service';
import { useConfirmAction } from '../../components/primitives';

const statusColors: Record<string, string> = {
  DRAFT: 'default',
  SCHEDULED: 'blue',
  SENDING: 'processing',
  SENT: 'success',
  CANCELLED: 'default',
  FAILED: 'error'
};

const statusLabels: Record<string, string> = {
  DRAFT: 'Brouillon',
  SCHEDULED: 'Planifiée',
  SENDING: 'En cours',
  SENT: 'Envoyée',
  CANCELLED: 'Annulée',
  FAILED: 'Échec'
};

export function NewsletterCampaignsPage() {
  const { message } = App.useApp();
  const confirmAction = useConfirmAction();

  const { tenantId } = useParams<{ tenantId: string }>();
  const [campaigns, setCampaigns] = useState<NewsletterCampaign[]>([]);
  const [lists, setLists] = useState<NewsletterList[]>([]);
  const [templates, setTemplates] = useState<NewsletterTemplate[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<NewsletterCampaign | null>(null);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [scheduleDate, setScheduleDate] = useState<dayjs.Dayjs | null>(null);
  const [saving, setSaving] = useState(false);

  const loadCampaigns = useCallback(
    async (page = 1, limit = 20, status?: string) => {
      if (!tenantId) return;
      setLoading(true);
      try {
        const data = await newsletterService.listCampaigns(tenantId, { page, limit, status });
        setCampaigns(data.campaigns);
        setPagination(data.pagination);
      } catch (e) {
        message.error((e as Error).message || 'Erreur lors du chargement');
      } finally {
        setLoading(false);
      }
    },
    [tenantId]
  );

  const loadListsAndTemplates = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [listsData, templatesData] = await Promise.all([
        newsletterService.listLists(tenantId),
        newsletterService.listTemplates(tenantId)
      ]);
      setLists(listsData);
      setTemplates(templatesData);
    } catch (e) {
      message.error((e as Error).message || 'Erreur');
    }
  }, [tenantId]);

  useEffect(() => {
    loadCampaigns();
    loadListsAndTemplates();
  }, [loadCampaigns, loadListsAndTemplates]);

  const handleCreateCampaign = async (values: {
    listId: string;
    templateId?: string;
    subject: string;
    bodyHtml: string;
  }) => {
    if (!tenantId) return;
    setSaving(true);
    try {
      await newsletterService.createCampaign(tenantId, values);
      message.success('Campagne créée');
      setCreateModalOpen(false);
      loadCampaigns();
    } catch (e) {
      message.error((e as Error).message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateCampaign = async (values: {
    listId: string;
    templateId?: string;
    subject: string;
    bodyHtml: string;
  }) => {
    if (!tenantId || !selectedCampaign) return;
    setSaving(true);
    try {
      await newsletterService.updateCampaign(tenantId, selectedCampaign.id, {
        subject: values.subject,
        bodyHtml: values.bodyHtml,
        templateId: values.templateId
      });
      message.success('Campagne mise à jour');
      setEditModalOpen(false);
      setSelectedCampaign(null);
      loadCampaigns();
    } catch (e) {
      message.error((e as Error).message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const handleSendCampaign = async (campaign: NewsletterCampaign) => {
    if (!tenantId) return;
    confirmAction({
      title: 'Envoyer la campagne',
      description: `Êtes-vous sûr de vouloir envoyer « ${campaign.subject} » à tous les abonnés actifs ?`,
      okText: 'Envoyer',
      onConfirm: async () => {
        try {
          await newsletterService.sendCampaign(tenantId, campaign.id);
          message.success('Campagne envoyée');
          loadCampaigns();
        } catch (e) {
          message.error((e as Error).message || 'Erreur');
          throw e;
        }
      }
    });
  };

  const handleScheduleCampaign = async () => {
    if (!tenantId || !selectedCampaign || !scheduleDate) return;
    setSaving(true);
    try {
      await newsletterService.scheduleCampaign(tenantId, selectedCampaign.id, scheduleDate.toISOString());
      message.success('Campagne planifiée');
      setScheduleModalOpen(false);
      setSelectedCampaign(null);
      setScheduleDate(null);
      loadCampaigns();
    } catch (e) {
      message.error((e as Error).message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelCampaign = async (campaign: NewsletterCampaign) => {
    if (!tenantId) return;
    confirmAction({
      title: 'Annuler la campagne',
      description: `Annuler l'envoi planifié de « ${campaign.subject} » ?`,
      okText: 'Annuler la campagne',
      danger: true,
      onConfirm: async () => {
        try {
          await newsletterService.cancelCampaign(tenantId, campaign.id);
          message.success('Campagne annulée');
          loadCampaigns();
        } catch (e) {
          message.error((e as Error).message || 'Erreur');
          throw e;
        }
      }
    });
  };

  const handlePreview = async (campaignId: string) => {
    if (!tenantId) return;
    try {
      const p = await newsletterService.getPreview(tenantId, campaignId);
      setPreview(p);
      setPreviewModalOpen(true);
    } catch (e) {
      message.error((e as Error).message || 'Erreur');
    }
  };

  const columns = [
    {
      title: 'Sujet',
      dataIndex: 'subject',
      key: 'subject',
      render: (v: string, r: NewsletterCampaign) => (
        <Space>
          <Typography.Text strong>{v}</Typography.Text>
          <Tag color={statusColors[r.status]}>{statusLabels[r.status]}</Tag>
        </Space>
      )
    },
    {
      title: 'Liste',
      dataIndex: 'listName',
      key: 'listName'
    },
    {
      title: 'Statistiques',
      key: 'stats',
      render: (_: unknown, r: NewsletterCampaign) =>
        r.status === 'SENT' || r.status === 'SENDING' ? (
          <Space wrap size="middle">
            <span title="Mails envoyés">Envoyés: {r.sentCount ?? 0}</span>
            <span title="Mails ouverts">Ouverts: {r.openCount ?? 0}</span>
            {(r.failedCount ?? 0) > 0 && (
              <span style={{ color: '#ff4d4f' }} title="Retournés / email invalide">
                Retournés: {r.failedCount}
              </span>
            )}
          </Space>
        ) : (
          '—'
        )
    },
    {
      title: 'Date',
      dataIndex: 'sentAt',
      key: 'sentAt',
      render: (_: unknown, r: NewsletterCampaign) => {
        if (r.sentAt) return dayjs(r.sentAt).format('DD/MM/YYYY HH:mm');
        if (r.scheduledAt) return <>Planifié: {dayjs(r.scheduledAt).format('DD/MM/YYYY HH:mm')}</>;
        return dayjs(r.createdAt).format('DD/MM/YYYY');
      }
    },
    {
      title: '',
      key: 'actions',
      render: (_: unknown, record: NewsletterCampaign) => (
        <Space>
          {record.status === 'DRAFT' && (
            <>
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={() => {
                  setSelectedCampaign(record);
                  setEditModalOpen(true);
                }}
              >
                Modifier
              </Button>
              <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handlePreview(record.id)}>
                Aperçu
              </Button>
              <Button
                type="link"
                size="small"
                icon={<CalendarOutlined />}
                onClick={() => {
                  setSelectedCampaign(record);
                  setScheduleDate(null);
                  setScheduleModalOpen(true);
                }}
              >
                Planifier
              </Button>
              <Button type="primary" size="small" icon={<SendOutlined />} onClick={() => handleSendCampaign(record)}>
                Envoyer
              </Button>
            </>
          )}
          {record.status === 'SCHEDULED' && (
            <Button
              type="link"
              size="small"
              danger
              icon={<StopOutlined />}
              onClick={() => handleCancelCampaign(record)}
            >
              Annuler
            </Button>
          )}
        </Space>
      )
    }
  ];

  return (
    <DashboardLayout>
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            Campagnes newsletter
          </Typography.Title>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
            Nouvelle campagne
          </Button>
        </div>

        <Select
          placeholder="Filtrer par statut"
          allowClear
          style={{ width: 200, marginBottom: 16 }}
          onChange={v => loadCampaigns(1, pagination.limit, v ?? undefined)}
          options={[
            { value: 'DRAFT', label: 'Brouillons' },
            { value: 'SCHEDULED', label: 'Planifiées' },
            { value: 'SENT', label: 'Envoyées' }
          ]}
        />

        <Card>
          <Table
            loading={loading}
            columns={columns}
            dataSource={campaigns}
            rowKey="id"
            pagination={{
              current: pagination.page,
              pageSize: pagination.limit,
              total: pagination.total,
              showSizeChanger: true,
              onChange: (page, limit) => loadCampaigns(page, limit ?? 20)
            }}
          />
        </Card>
      </div>

      <Modal
        title="Nouvelle campagne"
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        footer={null}
        width={800}
        destroyOnClose
      >
        <CampaignForm
          lists={lists}
          templates={templates}
          loading={!lists.length}
          saving={saving}
          onSubmit={handleCreateCampaign}
        />
      </Modal>

      <Modal
        title="Modifier la campagne"
        open={editModalOpen}
        onCancel={() => {
          setEditModalOpen(false);
          setSelectedCampaign(null);
        }}
        footer={null}
        width={800}
        destroyOnClose
      >
        {selectedCampaign && (
          <CampaignForm
            lists={lists}
            templates={templates}
            campaign={selectedCampaign}
            loading={false}
            saving={saving}
            onSubmit={handleUpdateCampaign}
            onPreview={handlePreview}
          />
        )}
      </Modal>

      <Modal
        title="Aperçu"
        open={previewModalOpen}
        onCancel={() => {
          setPreviewModalOpen(false);
          setPreview(null);
        }}
        footer={null}
        width={700}
      >
        {preview && (
          <div>
            <p>
              <strong>Sujet:</strong> {preview.subject}
            </p>
            {/*
              Campaign HTML is authored by users in the template editor, so it is
              untrusted. Rendering it with dangerouslySetInnerHTML executed that
              markup inside the app (stored XSS). A sandboxed iframe with no
              allow-scripts and no allow-same-origin renders it inert instead.
            */}
            <iframe
              title="Aperçu de la campagne"
              sandbox=""
              srcDoc={preview.html}
              style={{ border: '1px solid #d9d9d9', width: '100%', height: 400, background: '#fff' }}
            />
          </div>
        )}
      </Modal>

      <Modal
        title="Planifier l'envoi"
        open={scheduleModalOpen}
        onOk={handleScheduleCampaign}
        onCancel={() => {
          setScheduleModalOpen(false);
          setSelectedCampaign(null);
          setScheduleDate(null);
        }}
        confirmLoading={saving}
        okText="Planifier"
        okButtonProps={{ disabled: !scheduleDate || (scheduleDate && scheduleDate.isBefore(dayjs())) }}
      >
        <p>Sélectionnez la date et l'heure d'envoi :</p>
        <DatePicker
          showTime
          format="DD/MM/YYYY HH:mm"
          value={scheduleDate}
          onChange={v => setScheduleDate(v)}
          disabledDate={d => d && d.isBefore(dayjs(), 'day')}
          style={{ width: '100%' }}
        />
      </Modal>
    </DashboardLayout>
  );
}
