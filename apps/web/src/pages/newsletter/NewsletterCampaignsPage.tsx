import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { App, Card, Table, Button, Modal, Tag, Space, Select, DatePicker, Typography, Drawer } from 'antd';
import {
  PlusOutlined,
  SendOutlined,
  EditOutlined,
  EyeOutlined,
  CalendarOutlined,
  StopOutlined,
  TeamOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { CampaignForm } from '../../components/newsletter/CampaignForm';
import {
  newsletterService,
  type NewsletterList,
  type NewsletterTemplate,
  type NewsletterCampaign,
  type NewsletterCampaignRecipient,
  type NewsletterPagination
} from '../../services/newsletter.service';
import { useConfirmAction } from '../../components/primitives';
import { newsletterErrorMessage } from '../../components/newsletter/newsletter-error';
import { t } from '../../i18n/t';

const statusColors: Record<string, string> = {
  DRAFT: 'default',
  SCHEDULED: 'blue',
  SENDING: 'processing',
  SENT: 'success',
  CANCELLED: 'default',
  FAILED: 'error'
};

const statusLabels: Record<string, string> = {
  DRAFT: t('Brouillon'),
  SCHEDULED: t('Planifiée'),
  SENDING: t('En cours'),
  SENT: t('Envoyée'),
  CANCELLED: t('Annulée'),
  FAILED: t('Échec')
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
  const [recipientsCampaign, setRecipientsCampaign] = useState<NewsletterCampaign | null>(null);
  const [recipients, setRecipients] = useState<NewsletterCampaignRecipient[]>([]);
  const [recipientsPagination, setRecipientsPagination] = useState<NewsletterPagination>({
    total: 0,
    page: 1,
    limit: 50,
    totalPages: 0
  });
  const [recipientsLoading, setRecipientsLoading] = useState(false);

  const loadCampaigns = useCallback(
    async (page = 1, limit = 20, status?: string) => {
      if (!tenantId) return;
      setLoading(true);
      try {
        const data = await newsletterService.listCampaigns(tenantId, { page, limit, status });
        setCampaigns(data.campaigns);
        setPagination(data.pagination);
      } catch (e) {
        message.error(newsletterErrorMessage(e, t('Erreur lors du chargement')));
      } finally {
        setLoading(false);
      }
    },
    [tenantId, message]
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
      message.error(newsletterErrorMessage(e, t('Erreur')));
    }
  }, [tenantId, message]);

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
      message.success(t('Campagne créée'));
      setCreateModalOpen(false);
      loadCampaigns();
    } catch (e) {
      message.error(newsletterErrorMessage(e, t('Erreur')));
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
      message.success(t('Campagne mise à jour'));
      setEditModalOpen(false);
      setSelectedCampaign(null);
      loadCampaigns();
    } catch (e) {
      message.error(newsletterErrorMessage(e, t('Erreur')));
    } finally {
      setSaving(false);
    }
  };

  const handleSendCampaign = async (campaign: NewsletterCampaign) => {
    if (!tenantId) return;
    confirmAction({
      title: t('Envoyer la campagne'),
      description: t('Êtes-vous sûr de vouloir envoyer « {{subject}} » à tous les abonnés actifs ?', {
        subject: campaign.subject
      }),
      okText: t('Envoyer'),
      onConfirm: async () => {
        try {
          const sent = await newsletterService.sendCampaign(tenantId, campaign.id);
          if (sent?.status === 'SENT') {
            if ((sent.failedCount ?? 0) > 0) {
              message.warning(
                t('Campagne envoyée, mais {{failed}} destinataire(s) en échec. Consultez les destinataires.', {
                  failed: sent.failedCount ?? 0
                })
              );
            } else {
              message.success(t('Campagne envoyée'));
            }
          } else {
            message.error(
              t(
                "La campagne n'a pas pu être envoyée : aucun message n'est parti. Consultez les destinataires pour le détail."
              )
            );
          }
          loadCampaigns();
        } catch (e) {
          // Pas de `throw` : la boîte de confirmation se ferme, le toast explique le refus.
          message.error(newsletterErrorMessage(e, t("La campagne n'a pas pu être envoyée.")));
        }
      }
    });
  };

  const handleScheduleCampaign = async () => {
    if (!tenantId || !selectedCampaign || !scheduleDate) return;
    setSaving(true);
    try {
      await newsletterService.scheduleCampaign(tenantId, selectedCampaign.id, scheduleDate.toISOString());
      message.success(t('Campagne planifiée'));
      setScheduleModalOpen(false);
      setSelectedCampaign(null);
      setScheduleDate(null);
      loadCampaigns();
    } catch (e) {
      message.error(newsletterErrorMessage(e, t('Erreur')));
    } finally {
      setSaving(false);
    }
  };

  const handleCancelCampaign = async (campaign: NewsletterCampaign) => {
    if (!tenantId) return;
    confirmAction({
      title: t('Annuler la campagne'),
      description: t("Annuler l'envoi planifié de « {{subject}} » ?", { subject: campaign.subject }),
      okText: t('Annuler la campagne'),
      danger: true,
      onConfirm: async () => {
        try {
          await newsletterService.cancelCampaign(tenantId, campaign.id);
          message.success(t('Campagne annulée'));
          loadCampaigns();
        } catch (e) {
          message.error(newsletterErrorMessage(e, t('Erreur')));
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
      message.error(newsletterErrorMessage(e, t('Erreur')));
    }
  };

  const loadRecipients = async (campaign: NewsletterCampaign, page = 1, limit = 50) => {
    if (!tenantId) return;
    setRecipientsLoading(true);
    try {
      const data = await newsletterService.getCampaignRecipients(tenantId, campaign.id, { page, limit });
      setRecipients(data.recipients);
      setRecipientsPagination(data.pagination);
    } catch (e) {
      message.error(newsletterErrorMessage(e, t('Erreur lors du chargement')));
    } finally {
      setRecipientsLoading(false);
    }
  };

  const openRecipients = (campaign: NewsletterCampaign) => {
    setRecipientsCampaign(campaign);
    setRecipients([]);
    loadRecipients(campaign);
  };

  const recipientColumns = [
    { title: t('E-mail'), dataIndex: 'email', key: 'email' },
    {
      title: t('Statut'),
      dataIndex: 'status',
      key: 'status',
      render: (s: string) =>
        s === 'SENT' ? <Tag color="success">{t('Envoyé')}</Tag> : <Tag color="error">{t('Échec')}</Tag>
    },
    {
      title: t('Envoyé le'),
      dataIndex: 'sentAt',
      key: 'sentAt',
      render: (v: string | null) => (v ? dayjs(v).format('DD/MM/YYYY HH:mm') : '—')
    },
    {
      title: t('Ouvert le'),
      dataIndex: 'openedAt',
      key: 'openedAt',
      render: (v: string | null) => (v ? dayjs(v).format('DD/MM/YYYY HH:mm') : '—')
    },
    {
      title: t('Motif'),
      dataIndex: 'failureReason',
      key: 'failureReason',
      render: (v: string | null) => v || '—'
    }
  ];

  const columns = [
    {
      title: t('Sujet'),
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
      title: t('Liste'),
      dataIndex: 'listName',
      key: 'listName'
    },
    {
      title: t('Statistiques'),
      key: 'stats',
      render: (_: unknown, r: NewsletterCampaign) =>
        r.status === 'SENT' || r.status === 'SENDING' || r.status === 'FAILED' ? (
          <Space wrap size="middle">
            <span title={t('Mails envoyés')}>
              {t('Envoyés:')} {r.sentCount ?? 0}
            </span>
            <span title={t('Mails ouverts')}>
              {t('Ouverts :')} {r.openCount ?? 0}
            </span>
            {(r.failedCount ?? 0) > 0 && (
              <span style={{ color: '#ff4d4f' }} title={t('Retournés / email invalide')}>
                {t('Retournés:')} {r.failedCount}
              </span>
            )}
          </Space>
        ) : (
          '—'
        )
    },
    {
      title: t('Date'),
      dataIndex: 'sentAt',
      key: 'sentAt',
      render: (_: unknown, r: NewsletterCampaign) => {
        if (r.sentAt) return dayjs(r.sentAt).format('DD/MM/YYYY HH:mm');
        if (r.scheduledAt)
          return (
            <>
              {t('Planifié:')} {dayjs(r.scheduledAt).format('DD/MM/YYYY HH:mm')}
            </>
          );
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
                {t('Modifier')}
              </Button>
              <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handlePreview(record.id)}>
                {t('Aperçu')}
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
                {t('Planifier')}
              </Button>
              <Button type="primary" size="small" icon={<SendOutlined />} onClick={() => handleSendCampaign(record)}>
                {t('Envoyer')}
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
              {t('Annuler')}
            </Button>
          )}
          {(record.status === 'SENT' || record.status === 'FAILED' || record.status === 'SENDING') && (
            <Button type="link" size="small" icon={<TeamOutlined />} onClick={() => openRecipients(record)}>
              {t('Destinataires')}
            </Button>
          )}
        </Space>
      )
    }
  ];

  return (
    <>
      <div style={{ padding: 24 }}>
        <div className="it-toolbar" style={{ marginBottom: 16 }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {t('Campagnes newsletter')}
          </Typography.Title>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
            {t('Nouvelle campagne')}
          </Button>
        </div>

        <Select
          placeholder={t('Filtrer par statut')}
          allowClear
          style={{ width: 200, marginBottom: 16 }}
          onChange={v => loadCampaigns(1, pagination.limit, v ?? undefined)}
          options={[
            { value: 'DRAFT', label: t('Brouillons') },
            { value: 'SCHEDULED', label: t('Planifiées') },
            { value: 'SENT', label: t('Envoyées') },
            { value: 'FAILED', label: t('En échec') },
            { value: 'CANCELLED', label: t('Annulées') }
          ]}
        />

        <Card>
          <Table
            scroll={{ x: 'max-content' }}
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
        title={t('Nouvelle campagne')}
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
        title={t('Modifier la campagne')}
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
        title={t('Aperçu')}
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
              <strong>{t('Sujet :')}</strong> {preview.subject}
            </p>
            {/*
              Campaign HTML is authored by users in the template editor, so it is
              untrusted. Rendering it with dangerouslySetInnerHTML executed that
              markup inside the app (stored XSS). A sandboxed iframe with no
              allow-scripts and no allow-same-origin renders it inert instead.
            */}
            <iframe
              title={t('Aperçu de la campagne')}
              sandbox=""
              srcDoc={preview.html}
              style={{ border: '1px solid #d9d9d9', width: '100%', height: 400, background: '#fff' }}
            />
          </div>
        )}
      </Modal>

      <Drawer
        title={
          recipientsCampaign
            ? t('Destinataires — {{subject}}', { subject: recipientsCampaign.subject })
            : t('Destinataires')
        }
        open={!!recipientsCampaign}
        onClose={() => {
          setRecipientsCampaign(null);
          setRecipients([]);
        }}
        size="large"
        destroyOnHidden
      >
        <Table
          scroll={{ x: 'max-content' }}
          loading={recipientsLoading}
          columns={recipientColumns}
          dataSource={recipients}
          rowKey="id"
          locale={{ emptyText: t('Aucun envoi enregistré pour cette campagne.') }}
          pagination={{
            current: recipientsPagination.page,
            pageSize: recipientsPagination.limit,
            total: recipientsPagination.total,
            onChange: (page, limit) => recipientsCampaign && loadRecipients(recipientsCampaign, page, limit ?? 50)
          }}
        />
      </Drawer>

      <Modal
        title={t("Planifier l'envoi")}
        open={scheduleModalOpen}
        onOk={handleScheduleCampaign}
        onCancel={() => {
          setScheduleModalOpen(false);
          setSelectedCampaign(null);
          setScheduleDate(null);
        }}
        confirmLoading={saving}
        okText={t('Planifier')}
        okButtonProps={{ disabled: !scheduleDate || (scheduleDate && scheduleDate.isBefore(dayjs())) }}
      >
        <p>{t("Sélectionnez la date et l'heure d'envoi :")}</p>
        <DatePicker
          showTime
          format="DD/MM/YYYY HH:mm"
          value={scheduleDate}
          onChange={v => setScheduleDate(v)}
          disabledDate={d => d && d.isBefore(dayjs(), 'day')}
          style={{ width: '100%' }}
        />
      </Modal>
    </>
  );
}
