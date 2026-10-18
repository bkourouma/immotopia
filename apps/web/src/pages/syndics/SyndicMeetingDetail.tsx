import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  App,
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Tag,
  TimePicker,
  Tooltip,
  Typography
} from 'antd';
import { ArrowLeftOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { meetingStatusLabels, meetingTypeLabels } from '../../components/syndics/labels';
import { MeetingAgenda } from '../../components/syndics/MeetingAgenda';
import { MeetingConvocationWord } from '../../components/syndics/MeetingConvocationWord';
import { MANUAL_VOTE_ANCHOR_ID, MeetingLiveConsole } from '../../components/syndics/MeetingLiveConsole';
import { MeetingProxies } from '../../components/syndics/MeetingProxies';
import { MeetingStatusActions } from '../../components/syndics/MeetingStatusActions';
import { VoteBoard } from '../../components/syndics/VoteBoard';
import {
  DEFAULT_MAJORITY_RULE,
  isMeetingFrozen,
  majorityRuleHint,
  majorityRuleOptions,
  describeConvocation,
  meetingFrozenReason,
  meetingStatusColors
} from '../../components/syndics/meeting-governance';
import {
  addMeetingAgendaItem,
  addMeetingResolution,
  castResolutionVote,
  deleteMeetingAgendaItem,
  generateMeetingMinutesDocx,
  getMeeting,
  resendMeetingConvocation,
  updateMeeting,
  updateMeetingAgendaItem,
  updateMeetingStatus
} from '../../services/syndic-service';
import {
  GeneralMeeting,
  MajorityRule,
  MeetingAgendaItem,
  MeetingLot,
  MeetingStatus,
  VoteChoice
} from '../../types/syndic-types';
import { useSyndicRouteContext } from './useSyndicRouteContext';
import { t } from '../../i18n/t';
import { saveBlob } from '../../utils/save-blob';
import { describeDownloadError } from '../../utils/download-error';

const { Paragraph, Title, Text } = Typography;

export const SyndicMeetingDetail: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId: effectiveTenantId, syndicId, meetingId } = useSyndicRouteContext();
  const navigate = useNavigate();

  const [meeting, setMeeting] = useState<GeneralMeeting | null>(null);
  const [resendingConvocation, setResendingConvocation] = useState(false);
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
  const [changingStatus, setChangingStatus] = useState(false);
  const [selectedMajorityRule, setSelectedMajorityRule] = useState<MajorityRule>(DEFAULT_MAJORITY_RULE);
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

  /**
   * Rafraîchit le détail en silence (séance en direct) : ni `loading` ni message d'erreur,
   * la console reste montée et les blocs du bas se mettent à jour.
   */
  const refreshMeetingSilently = async () => {
    if (!effectiveTenantId || !syndicId || !meetingId) return;
    try {
      setMeeting(await getMeeting(effectiveTenantId, syndicId, meetingId));
    } catch {
      // Échec passager : on garde l'état affiché, la prochaine variation relancera une lecture.
    }
  };

  const metaStartTime = meeting?.startTime ?? null;
  const metaEndTime = meeting?.endTime ?? null;
  const metaLocation = meeting?.location ?? '';
  const hasMeeting = meeting !== null;

  // Dépendances ciblées : un rafraîchissement silencieux ne doit pas écraser une saisie en cours.
  useEffect(() => {
    if (!hasMeeting) return;
    meetingMetaForm.setFieldsValue({
      startTime: metaStartTime ? dayjs(metaStartTime) : null,
      endTime: metaEndTime ? dayjs(metaEndTime) : null,
      location: metaLocation || ''
    });
  }, [hasMeeting, metaStartTime, metaEndTime, metaLocation, meetingMetaForm]);

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

  const handleStatusChange = async (status: MeetingStatus) => {
    if (!effectiveTenantId || !syndicId || !meetingId) return;
    setChangingStatus(true);
    try {
      await updateMeetingStatus(effectiveTenantId, syndicId, meetingId, status);
      const successMessages: Partial<Record<MeetingStatus, string>> = {
        IN_PROGRESS: t('Séance ouverte'),
        COMPLETED: t('Séance clôturée : les votes sont figés'),
        CANCELLED: t('Assemblée annulée')
      };
      message.success(successMessages[status] || t('Statut mis à jour'));
      await loadMeeting();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Changement de statut impossible'));
    } finally {
      setChangingStatus(false);
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
      setSelectedMajorityRule(DEFAULT_MAJORITY_RULE);
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
      message.error(err.response?.data?.error || t("Échec de l'enregistrement du point"));
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

  const handleResendConvocation = async () => {
    if (!effectiveTenantId || !syndicId || !meetingId) return;
    setResendingConvocation(true);
    try {
      const result = await resendMeetingConvocation(effectiveTenantId, syndicId, meetingId);
      const summary = describeConvocation(result);
      if (summary.type === 'warning') message.warning(summary.text);
      else message.success(summary.text);
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Renvoi de la convocation impossible'));
    } finally {
      setResendingConvocation(false);
    }
  };

  const handleGenerateMinutes = async () => {
    if (!effectiveTenantId || !syndicId || !meetingId) return;
    setGeneratingMinutes(true);
    try {
      const fallbackName = `compte-rendu-AG-${dayjs(meeting?.scheduledAt).format('YYYY-MM-DD')}.docx`;
      const { blob, filename } = await generateMeetingMinutesDocx(effectiveTenantId, syndicId, meetingId, fallbackName);
      saveBlob(blob, filename);
      message.success(t('Compte rendu téléchargé : {{filename}}', { filename }));
    } catch (err) {
      message.error(await describeDownloadError(err));
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

  const frozen = isMeetingFrozen(meeting.status);
  const meetingLots = (meeting.syndicate?.lots || []) as MeetingLot[];

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
            <Space wrap>
              <Title level={2} style={{ margin: 0 }}>
                {t('Détail assemblée générale')}
              </Title>
              <Tag color={meetingStatusColors[meeting.status]}>{meetingStatusLabels[meeting.status]}</Tag>
            </Space>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              Date: {dayjs(meeting.scheduledAt).format('DD/MM/YYYY HH:mm')} {t('| Type:')}{' '}
              {meetingTypeLabels[meeting.type]}
            </Paragraph>
            <Form form={meetingMetaForm} layout="inline" disabled={frozen}>
              <Form.Item label={t('Heure début')} name="startTime">
                <TimePicker format="HH:mm" minuteStep={5} allowClear disabled={frozen} />
              </Form.Item>
              <Form.Item label={t('Heure fin')} name="endTime">
                <TimePicker format="HH:mm" minuteStep={5} allowClear disabled={frozen} />
              </Form.Item>
              <Form.Item label={t('Lieu')} name="location">
                <Input placeholder={t("Lieu de l'assemblée")} style={{ minWidth: 240 }} disabled={frozen} />
              </Form.Item>
              <Form.Item>
                {frozen ? (
                  <Tooltip title={meetingFrozenReason(meeting.status)}>
                    <Button disabled>{t('Enregistrer')}</Button>
                  </Tooltip>
                ) : (
                  <Button onClick={() => void handleSaveMeetingMeta()} loading={savingMeetingMeta}>
                    {t('Enregistrer')}
                  </Button>
                )}
              </Form.Item>
            </Form>
          </Space>
          <Space wrap align="start">
            <MeetingStatusActions status={meeting.status} onChange={handleStatusChange} loading={changingStatus} />
            <Button
              icon={<DownloadOutlined />}
              onClick={() => void handleGenerateMinutes()}
              loading={generatingMinutes}
            >
              {t('Générer compte rendu Word')}
            </Button>
            <MeetingConvocationWord
              tenantId={effectiveTenantId || ''}
              syndicId={syndicId || ''}
              meetingId={meeting.id}
              lots={meetingLots}
            />
            {meeting.status === 'PLANNED' ? (
              <Button loading={resendingConvocation} onClick={() => void handleResendConvocation()}>
                {t('Renvoyer la convocation')}
              </Button>
            ) : null}
            {frozen ? null : (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpenResolution(true)}>
                {t('Ajouter une résolution')}
              </Button>
            )}
          </Space>
        </div>

        {meeting.status === 'CANCELLED' ? null : (
          <Card title={t('En direct')}>
            <MeetingLiveConsole
              tenantId={effectiveTenantId || ''}
              syndicId={syndicId || ''}
              meetingId={meeting.id}
              meetingStatus={meeting.status}
              videoConferenceUrl={meeting.videoConferenceUrl}
              refreshKey={meeting.updatedAt}
              onMeetingChanged={loadMeeting}
              onLiveChanged={refreshMeetingSilently}
            />
          </Card>
        )}

        <VoteBoard
          quorum={meeting.quorum || 0}
          resolutions={meeting.resolutions || []}
          attendance={meeting.attendance}
          frozen={frozen}
        />

        <MeetingProxies
          tenantId={effectiveTenantId || ''}
          syndicId={syndicId || ''}
          meetingId={meeting.id}
          proxies={meeting.proxies || []}
          lots={meetingLots}
          readOnly={frozen}
          onChanged={loadMeeting}
        />

        <Card
          title={t('Ordre du jour')}
          extra={
            frozen ? (
              <Tooltip title={meetingFrozenReason(meeting.status)}>
                <Button size="small" type="primary" icon={<PlusOutlined />} disabled>
                  {t('Ajouter un point')}
                </Button>
              </Tooltip>
            ) : (
              <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openCreateAgendaModal}>
                {t('Ajouter un point')}
              </Button>
            )
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
                        {frozen ? (
                          <Tooltip title={meetingFrozenReason(meeting.status)}>
                            <Button size="small" icon={<EditOutlined />} disabled>
                              {t('Modifier')}
                            </Button>
                          </Tooltip>
                        ) : (
                          <Button size="small" icon={<EditOutlined />} onClick={() => openEditAgendaModal(item)}>
                            {t('Modifier')}
                          </Button>
                        )}
                        {frozen ? (
                          <Tooltip title={meetingFrozenReason(meeting.status)}>
                            <Button size="small" danger icon={<DeleteOutlined />} disabled>
                              {t('Supprimer')}
                            </Button>
                          </Tooltip>
                        ) : (
                          <Button
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            loading={deletingAgendaId === item.id}
                            onClick={() => void handleDeleteAgenda(item.id)}
                          >
                            {t('Supprimer')}
                          </Button>
                        )}
                      </Space>
                    }
                  >
                    <Space direction="vertical" size={4}>
                      {(item.discussions || []).length === 0 ? (
                        <Text type="secondary">{t('Aucune discussion renseignée.')}</Text>
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

        <Card id={MANUAL_VOTE_ANCHOR_ID} title={t('Ordre du jour et votes')}>
          <MeetingAgenda
            resolutions={meeting.resolutions || []}
            lots={meetingLots}
            onVote={handleVote}
            voting={voting}
            proxies={meeting.proxies || []}
            readOnly={frozen}
            readOnlyReason={
              meeting.status === 'CANCELLED'
                ? t('Assemblée annulée : aucun vote possible.')
                : t('Séance clôturée : les votes sont figés.')
            }
          />
        </Card>
      </Space>

      <Modal
        title={t('Ajouter une résolution')}
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
          <Form.Item
            label={t('Règle de majorité')}
            name="majorityRule"
            initialValue={DEFAULT_MAJORITY_RULE}
            extra={majorityRuleHint(selectedMajorityRule)}
          >
            <Select<MajorityRule> options={majorityRuleOptions()} onChange={value => setSelectedMajorityRule(value)} />
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
