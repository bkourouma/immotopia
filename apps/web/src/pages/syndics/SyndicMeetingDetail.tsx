import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Alert, Button, Card, Form, Input, Modal, Space, Spin, TimePicker, Typography } from 'antd';
import { ArrowLeftOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { meetingTypeLabels } from '../../components/syndics/labels';
import { MeetingAgenda } from '../../components/syndics/MeetingAgenda';
import { VoteBoard } from '../../components/syndics/VoteBoard';
import {
  addMeetingAgendaItem,
  addMeetingResolution,
  castResolutionVote,
  deleteMeetingAgendaItem,
  generateMeetingMinutesDocx,
  getMeeting,
  updateMeeting,
  updateMeetingAgendaItem
} from '../../services/syndic-service';
import { GeneralMeeting, MeetingAgendaItem, VoteChoice } from '../../types/syndic-types';
import { useSyndicRouteContext } from './useSyndicRouteContext';
import { t } from '../../i18n/t';

const { Paragraph, Title, Text } = Typography;

export const SyndicMeetingDetail: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId: effectiveTenantId, syndicId, meetingId } = useSyndicRouteContext();
  const navigate = useNavigate();

  const [meeting, setMeeting] = useState<GeneralMeeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [openResolution, setOpenResolution] = useState(false);
  const [submittingResolution, setSubmittingResolution] = useState(false);
  const [openAgenda, setOpenAgenda] = useState(false);
  const [editingAgendaId, setEditingAgendaId] = useState<string | null>(null);
  const [savingAgenda, setSavingAgenda] = useState(false);
  const [savingMeetingMeta, setSavingMeetingMeta] = useState(false);
  const [deletingAgendaId, setDeletingAgendaId] = useState<string | null>(null);
  const [generatingMinutes, setGeneratingMinutes] = useState(false);
  const [resolutionForm] = Form.useForm();
  const [agendaForm] = Form.useForm();
  const [meetingMetaForm] = Form.useForm();

  useEffect(() => {
    if (!effectiveTenantId || !syndicId || !meetingId) {
      setLoading(false);
      setError(t('Paramètres assemblée manquants'));
      return;
    }
    void loadMeeting();
  }, [effectiveTenantId, syndicId, meetingId]);

  const loadMeeting = async () => {
    if (!effectiveTenantId || !syndicId || !meetingId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getMeeting(effectiveTenantId, syndicId, meetingId);
      setMeeting(data);
    } catch (err: any) {
      setError(err.response?.data?.error || t('Impossible de charger le détail AG'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!meeting) return;
    meetingMetaForm.setFieldsValue({
      startTime: meeting.startTime ? dayjs(meeting.startTime) : null,
      endTime: meeting.endTime ? dayjs(meeting.endTime) : null,
      location: meeting.location || ''
    });
  }, [meeting, meetingMetaForm]);

  const handleVote = async (resolutionId: string, lotId: string, vote: VoteChoice) => {
    if (!effectiveTenantId || !syndicId || !meetingId) return;
    setVoting(true);
    try {
      await castResolutionVote(effectiveTenantId, syndicId, meetingId, resolutionId, { lotId, vote });
      message.success(t('Vote enregistré'));
      await loadMeeting();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Vote impossible'));
    } finally {
      setVoting(false);
    }
  };

  const handleAddResolution = async () => {
    if (!effectiveTenantId || !syndicId || !meetingId) return;
    const values = await resolutionForm.validateFields();
    setSubmittingResolution(true);
    try {
      await addMeetingResolution(effectiveTenantId, syndicId, meetingId, values);
      message.success(t('Résolution ajoutée'));
      setOpenResolution(false);
      resolutionForm.resetFields();
      await loadMeeting();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Ajout impossible'));
    } finally {
      setSubmittingResolution(false);
    }
  };

  const openCreateAgendaModal = () => {
    setEditingAgendaId(null);
    agendaForm.setFieldsValue({
      title: '',
      orderIndex: (meeting?.agendaItems?.length || 0) + 1,
      discussionsText: ''
    });
    setOpenAgenda(true);
  };

  const openEditAgendaModal = (item: MeetingAgendaItem) => {
    setEditingAgendaId(item.id);
    agendaForm.setFieldsValue({
      title: item.title,
      orderIndex: item.orderIndex,
      discussionsText: (item.discussions || []).join('\n')
    });
    setOpenAgenda(true);
  };

  const handleSaveAgenda = async () => {
    if (!effectiveTenantId || !syndicId || !meetingId) return;
    const values = await agendaForm.validateFields();
    const discussions = String(values.discussionsText || '')
      .split('\n')
      .map((item: string) => item.trim())
      .filter((item: string) => item.length > 0);

    setSavingAgenda(true);
    try {
      if (editingAgendaId) {
        await updateMeetingAgendaItem(effectiveTenantId, syndicId, meetingId, editingAgendaId, {
          title: values.title,
          orderIndex: Number(values.orderIndex),
          discussions
        });
      } else {
        await addMeetingAgendaItem(effectiveTenantId, syndicId, meetingId, {
          title: values.title,
          orderIndex: Number(values.orderIndex),
          discussions
        });
      }
      message.success(t("Point d'ordre du jour enregistré"));
      setOpenAgenda(false);
      agendaForm.resetFields();
      await loadMeeting();
    } catch (err: any) {
      message.error(err.response?.data?.error || t("Echec de l'enregistrement du point"));
    } finally {
      setSavingAgenda(false);
    }
  };

  const handleDeleteAgenda = async (agendaItemId: string) => {
    if (!effectiveTenantId || !syndicId || !meetingId) return;
    setDeletingAgendaId(agendaItemId);
    try {
      await deleteMeetingAgendaItem(effectiveTenantId, syndicId, meetingId, agendaItemId);
      message.success(t("Point d'ordre du jour supprimé"));
      await loadMeeting();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Suppression impossible'));
    } finally {
      setDeletingAgendaId(null);
    }
  };

  const handleGenerateMinutes = async () => {
    if (!effectiveTenantId || !syndicId || !meetingId) return;
    setGeneratingMinutes(true);
    try {
      const blob = await generateMeetingMinutesDocx(effectiveTenantId, syndicId, meetingId);
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `compte-rendu-${meetingId}.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      message.success(t('Compte rendu généré'));
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Génération du compte rendu impossible'));
    } finally {
      setGeneratingMinutes(false);
    }
  };

  const handleSaveMeetingMeta = async () => {
    if (!effectiveTenantId || !syndicId || !meetingId || !meeting) return;
    const values = await meetingMetaForm.validateFields();
    const meetingDate = dayjs(meeting.scheduledAt);
    const startTime = values.startTime
      ? meetingDate
          .hour(values.startTime.hour())
          .minute(values.startTime.minute())
          .second(0)
          .millisecond(0)
          .toISOString()
      : null;
    const endTime = values.endTime
      ? meetingDate.hour(values.endTime.hour()).minute(values.endTime.minute()).second(0).millisecond(0).toISOString()
      : null;

    setSavingMeetingMeta(true);
    try {
      await updateMeeting(effectiveTenantId, syndicId, meetingId, {
        startTime,
        endTime,
        location: values.location?.trim() ? values.location.trim() : null
      });
      message.success(t('Informations de réunion mises à jour'));
      await loadMeeting();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Mise à jour impossible'));
    } finally {
      setSavingMeetingMeta(false);
    }
  };

  if (loading) {
    return (
      <>
        <div style={{ minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spin size="large" />
        </div>
      </>
    );
  }

  if (error || !meeting) {
    return (
      <>
        <Alert type="error" message={error || t('Assemblée introuvable')} showIcon />
      </>
    );
  }

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <Space direction="vertical" size={4}>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate(`/tenant/${effectiveTenantId}/syndics/${syndicId}/assemblees`)}
            >
              {t('Retour aux assemblées')}
            </Button>
            <Title level={2} style={{ margin: 0 }}>
              {t('Détail assemblée générale')}
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              Date: {dayjs(meeting.scheduledAt).format('DD/MM/YYYY HH:mm')} {t('| Type:')}{' '}
              {meetingTypeLabels()[meeting.type]}
            </Paragraph>
            <Form form={meetingMetaForm} layout="inline">
              <Form.Item label={t('Heure début')} name="startTime">
                <TimePicker format="HH:mm" minuteStep={5} allowClear />
              </Form.Item>
              <Form.Item label={t('Heure fin')} name="endTime">
                <TimePicker format="HH:mm" minuteStep={5} allowClear />
              </Form.Item>
              <Form.Item label={t('Lieu')} name="location">
                <Input placeholder={t("Lieu de l'assemblée")} style={{ minWidth: 240 }} />
              </Form.Item>
              <Form.Item>
                <Button onClick={() => void handleSaveMeetingMeta()} loading={savingMeetingMeta}>
                  {t('Enregistrer')}
                </Button>
              </Form.Item>
            </Form>
          </Space>
          <Space>
            <Button
              icon={<DownloadOutlined />}
              onClick={() => void handleGenerateMinutes()}
              loading={generatingMinutes}
            >
              {t('Générer compte rendu Word')}
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpenResolution(true)}>
              {t('Ajouter une résolution')}
            </Button>
          </Space>
        </div>

        <VoteBoard quorum={meeting.quorum || 0} resolutions={meeting.resolutions || []} />

        <Card
          title={t('Ordre du jour')}
          extra={
            <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openCreateAgendaModal}>
              {t('Ajouter un point')}
            </Button>
          }
        >
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {(meeting.agendaItems || []).length === 0 ? (
              <Text type="secondary">{t("Aucun point d'ordre du jour enregistré.")}</Text>
            ) : (
              (meeting.agendaItems || [])
                .slice()
                .sort((a, b) => a.orderIndex - b.orderIndex)
                .map(item => (
                  <Card
                    key={item.id}
                    size="small"
                    title={`${item.orderIndex}. ${item.title}`}
                    extra={
                      <Space>
                        <Button size="small" icon={<EditOutlined />} onClick={() => openEditAgendaModal(item)}>
                          {t('Modifier')}
                        </Button>
                        <Button
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          loading={deletingAgendaId === item.id}
                          onClick={() => void handleDeleteAgenda(item.id)}
                        >
                          {t('Supprimer')}
                        </Button>
                      </Space>
                    }
                  >
                    <Space direction="vertical" size={4}>
                      {(item.discussions || []).length === 0 ? (
                        <Text type="secondary">{t('Aucune discussion renseignee.')}</Text>
                      ) : (
                        (item.discussions || []).map((discussion, index) => (
                          <Text key={`${item.id}-${index}`}>- {discussion}</Text>
                        ))
                      )}
                    </Space>
                  </Card>
                ))
            )}
          </Space>
        </Card>

        <Card title={t('Ordre du jour et votes')}>
          <MeetingAgenda
            resolutions={meeting.resolutions || []}
            lots={meeting.syndicate?.lots || []}
            onVote={handleVote}
            voting={voting}
          />
        </Card>
      </Space>

      <Modal
        title={t('Ajouter une resolution')}
        open={openResolution}
        onCancel={() => setOpenResolution(false)}
        onOk={() => void handleAddResolution()}
        okText={t('Ajouter')}
        cancelText={t('Annuler')}
        confirmLoading={submittingResolution}
      >
        <Form form={resolutionForm} layout="vertical">
          <Form.Item
            label={t('Titre')}
            name="title"
            rules={[{ required: true, message: t('Le titre est obligatoire') }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label={t('Description')} name="description">
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item label={t('Regle de majorite')} name="majorityRule">
            <Input placeholder={t('Ex: article 24')} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingAgendaId ? t("Modifier le point d'ordre du jour") : t("Ajouter un point d'ordre du jour")}
        open={openAgenda}
        onCancel={() => setOpenAgenda(false)}
        onOk={() => void handleSaveAgenda()}
        okText={t('Enregistrer')}
        cancelText={t('Annuler')}
        confirmLoading={savingAgenda}
      >
        <Form form={agendaForm} layout="vertical">
          <Form.Item
            label={t('Titre du point')}
            name="title"
            rules={[{ required: true, message: t('Le titre est obligatoire') }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label={t('Ordre')}
            name="orderIndex"
            rules={[{ required: true, message: t("L'ordre est obligatoire") }]}
          >
            <Input type="number" min={1} />
          </Form.Item>
          <Form.Item label={t('Discussions (une ligne par discussion)')} name="discussionsText">
            <Input.TextArea rows={6} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};
