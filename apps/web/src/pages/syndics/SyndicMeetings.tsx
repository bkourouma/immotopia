import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  App,
  Alert,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  TimePicker,
  Tag,
  Typography
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { Table } from '../../components/primitives';
import { meetingStatusLabels, meetingTypeLabels } from '../../components/syndics/labels';
import { MeetingStatusActions } from '../../components/syndics/MeetingStatusActions';
import { describeConvocation, meetingStatusColors } from '../../components/syndics/meeting-governance';
import {
  createMeetingWithConvocation,
  listMeetings,
  resendMeetingConvocation,
  updateMeetingStatus
} from '../../services/syndic-service';
import { GeneralMeeting, MeetingConvocationResult, MeetingStatus, MeetingType } from '../../types/syndic-types';
import { useSyndicRouteContext } from './useSyndicRouteContext';
import { t } from '../../i18n/t';

const { Paragraph, Title } = Typography;

function newIdempotencyKey(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    // contexte non sécurisé : repli ci-dessous
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

const meetingTypeOptions: Array<{ label: string; value: MeetingType }> = [
  { label: t('Ordinaire'), value: 'ORDINARY' },
  { label: t('Extraordinaire'), value: 'EXTRAORDINARY' }
];

export const SyndicMeetings: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId: effectiveTenantId, syndicId } = useSyndicRouteContext();
  const navigate = useNavigate();

  const [meetings, setMeetings] = useState<GeneralMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [changingStatusId, setChangingStatusId] = useState<string | null>(null);
  const [convocation, setConvocation] = useState<{ meetingId: string; result: MeetingConvocationResult | null } | null>(
    null
  );
  const [resending, setResending] = useState(false);
  const [convocationPending, setConvocationPending] = useState(false);
  // Clé d'idempotence : posée à l'ouverture de la fenêtre, conservée tant qu'aucune réponse
  // définitive du serveur n'est arrivée (un réessai après 503/coupure rejoue la même création).
  const idempotencyKeyRef = useRef<string>(newIdempotencyKey());
  const fingerprintRef = useRef<string | null>(null);
  const submittingRef = useRef(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (!effectiveTenantId || !syndicId) {
      setLoading(false);
      setError(t('Paramètres assemblées manquants'));
      return;
    }
    void loadMeetings();
  }, [effectiveTenantId, syndicId]);

  const loadMeetings = async () => {
    if (!effectiveTenantId || !syndicId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listMeetings(effectiveTenantId, syndicId);
      setMeetings(data);
    } catch (err: any) {
      setError(err.response?.data?.error || t('Impossible de charger les assemblées'));
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (meetingId: string, status: MeetingStatus) => {
    if (!effectiveTenantId || !syndicId) return;
    setChangingStatusId(meetingId);
    try {
      await updateMeetingStatus(effectiveTenantId, syndicId, meetingId, status);
      const successMessages: Partial<Record<MeetingStatus, string>> = {
        IN_PROGRESS: t('Séance ouverte'),
        COMPLETED: t('Séance clôturée : les votes sont figés'),
        CANCELLED: t('Assemblée annulée')
      };
      message.success(successMessages[status] || t('Statut mis à jour'));
      await loadMeetings();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Changement de statut impossible'));
    } finally {
      setChangingStatusId(null);
    }
  };

  const handleCreate = async () => {
    if (!effectiveTenantId || !syndicId) return;
    const values = await form.validateFields();
    // `showTime` sur un seul DatePicker ouvrait un panneau (calendrier +
    // colonnes heures/minutes) qui débordait de la fenêtre sur mobile, avec le
    // bouton OK masqué : impossible de valider. La date et l'heure de début
    // sont désormais deux champs distincts, recombinés ici.
    const startAt = values.date
      .hour(values.startTime.hour())
      .minute(values.startTime.minute())
      .second(0)
      .millisecond(0);
    if (values.endTime) {
      const endAt = values.date.hour(values.endTime.hour()).minute(values.endTime.minute()).second(0).millisecond(0);
      if (!endAt.isAfter(startAt)) {
        message.error(t("L'heure de fin doit suivre l'heure de début"));
        return;
      }
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const payload = {
        type: values.type,
        scheduledAt: startAt.toISOString(),
        startTime: startAt.toISOString(),
        endTime: values.endTime
          ? values.date
              .hour(values.endTime.hour())
              .minute(values.endTime.minute())
              .second(0)
              .millisecond(0)
              .toISOString()
          : undefined,
        location: values.location
      };
      // La clé suit le contenu : une saisie modifiée après un échec est une nouvelle création.
      const fingerprint = JSON.stringify(payload);
      if (fingerprintRef.current !== fingerprint) {
        idempotencyKeyRef.current = newIdempotencyKey();
        fingerprintRef.current = fingerprint;
      }
      const created = await createMeetingWithConvocation(
        effectiveTenantId,
        syndicId,
        payload,
        idempotencyKeyRef.current
      );
      idempotencyKeyRef.current = newIdempotencyKey();
      message.success(t('Assemblée créée'));
      setConvocationPending(created.convocationPending);
      setConvocation({ meetingId: created.meeting?.id, result: created.convocation });
      setOpen(false);
      form.resetFields();
      await loadMeetings();
    } catch (err: any) {
      const status = err.response?.status as number | undefined;
      if (status && status >= 400 && status < 500) {
        // Refus définitif du serveur : rien n'a été créé, une nouvelle tentative est une nouvelle création.
        idempotencyKeyRef.current = newIdempotencyKey();
        message.error(err.response?.data?.error || t('Création impossible'));
      } else {
        // Réseau coupé, délai dépassé, 5xx : l'assemblée a pu être créée. La clé est conservée :
        // un nouveau clic rejoue la même création au lieu d'en ajouter une.
        message.error(t("L'assemblée a peut-être été créée, vérifiez la liste avant de réessayer."), 8);
        void loadMeetings();
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!effectiveTenantId || !syndicId || !convocation?.meetingId) return;
    setResending(true);
    try {
      const result = await resendMeetingConvocation(effectiveTenantId, syndicId, convocation.meetingId);
      setConvocationPending(false);
      setConvocation({ meetingId: convocation.meetingId, result });
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Renvoi de la convocation impossible'));
    } finally {
      setResending(false);
    }
  };

  const convocationSummary = convocation
    ? convocationPending
      ? { type: 'info' as const, text: t("Convocations en cours d'envoi."), failed: false }
      : describeConvocation(convocation.result)
    : null;

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <Space direction="vertical" size={4}>
            <Title level={2} style={{ margin: 0 }}>
              {t('Assemblées générales')}
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {t('Planifiez, suivez les résolutions et centralisez les votes.')}
            </Paragraph>
          </Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
            {t('Nouvelle assemblée')}
          </Button>
        </div>

        {error ? <Alert type="error" message={error} showIcon /> : null}

        {convocationSummary ? (
          <Alert
            type={convocationSummary.type}
            showIcon
            closable
            onClose={() => {
              setConvocation(null);
              setConvocationPending(false);
            }}
            message={convocationSummary.text}
            action={
              convocationSummary.failed && convocation?.meetingId ? (
                <Button size="small" loading={resending} onClick={() => void handleResend()}>
                  {t('Renvoyer la convocation')}
                </Button>
              ) : null
            }
          />
        ) : null}

        {loading ? (
          <div style={{ minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spin size="large" />
          </div>
        ) : (
          <Card title={t('Liste des assemblées')}>
            <Table
              exportFilename={t('Liste des assemblées')}
              scroll={{ x: 'max-content' }}
              rowKey="id"
              dataSource={meetings}
              columns={[
                {
                  title: t('Type'),
                  dataIndex: 'type',
                  key: 'type',
                  render: (value: MeetingType) => meetingTypeLabels[value]
                },
                {
                  title: t('Date'),
                  dataIndex: 'scheduledAt',
                  key: 'scheduledAt',
                  render: (value: string) => dayjs(value).format('DD/MM/YYYY HH:mm')
                },
                {
                  title: t('Début'),
                  dataIndex: 'startTime',
                  key: 'startTime',
                  render: (value?: string | null) => (value ? dayjs(value).format('HH:mm') : '-')
                },
                {
                  title: t('Fin'),
                  dataIndex: 'endTime',
                  key: 'endTime',
                  render: (value?: string | null) => (value ? dayjs(value).format('HH:mm') : '-')
                },
                {
                  title: t('Lieu'),
                  dataIndex: 'location',
                  key: 'location',
                  render: (value?: string | null) => value || t('Non renseigné')
                },
                {
                  title: t('Statut'),
                  dataIndex: 'status',
                  key: 'status',
                  render: (value: GeneralMeeting['status']) => (
                    <Tag color={meetingStatusColors[value]}>{meetingStatusLabels[value]}</Tag>
                  )
                },
                {
                  title: t('Actions'),
                  key: 'actions',
                  render: (_: unknown, item: GeneralMeeting) => (
                    <Space wrap>
                      <Button
                        size="small"
                        onClick={() =>
                          navigate(`/tenant/${effectiveTenantId}/syndics/${syndicId}/assemblees/${item.id}`)
                        }
                      >
                        {t('Voir détails')}
                      </Button>
                      <MeetingStatusActions
                        size="small"
                        status={item.status}
                        loading={changingStatusId === item.id}
                        onChange={status => handleStatusChange(item.id, status)}
                      />
                    </Space>
                  )
                }
              ]}
            />
          </Card>
        )}
      </Space>

      <Modal
        title={t('Créer une assemblée générale')}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => void handleCreate()}
        okText={t('Créer')}
        cancelText={t('Annuler')}
        confirmLoading={submitting}
        okButtonProps={{ disabled: submitting }}
        cancelButtonProps={{ disabled: submitting }}
        maskClosable={!submitting}
      >
        <Form form={form} layout="vertical" initialValues={{ type: 'ORDINARY' }}>
          <Form.Item label={t('Type')} name="type" rules={[{ required: true, message: t('Le type est obligatoire') }]}>
            <Select showSearch optionFilterProp="label" options={meetingTypeOptions} />
          </Form.Item>
          <Form.Item label={t('Date')} name="date" rules={[{ required: true, message: t('La date est obligatoire') }]}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item
            label={t('Heure de début')}
            name="startTime"
            rules={[{ required: true, message: t("L'heure de début est obligatoire") }]}
          >
            <TimePicker style={{ width: '100%' }} format="HH:mm" minuteStep={5} needConfirm={false} />
          </Form.Item>
          <Form.Item label={t('Heure de fin')} name="endTime">
            <TimePicker style={{ width: '100%' }} format="HH:mm" minuteStep={5} needConfirm={false} />
          </Form.Item>
          <Form.Item label={t('Lieu')} name="location">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};
