import React, { useEffect, useState } from 'react';
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
  Table,
  Tag,
  Typography
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { meetingStatusLabels, meetingTypeLabels } from '../../components/syndics/labels';
import { createMeeting, listMeetings } from '../../services/syndic-service';
import { GeneralMeeting, MeetingType } from '../../types/syndic-types';
import { useSyndicRouteContext } from './useSyndicRouteContext';
import { t } from '../../i18n/t';

const { Paragraph, Title } = Typography;

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

  const handleCreate = async () => {
    if (!effectiveTenantId || !syndicId) return;
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      await createMeeting(effectiveTenantId, syndicId, {
        type: values.type,
        scheduledAt: values.scheduledAt.toISOString(),
        startTime: values.startTime
          ? values.scheduledAt
              .hour(values.startTime.hour())
              .minute(values.startTime.minute())
              .second(0)
              .millisecond(0)
              .toISOString()
          : undefined,
        endTime: values.endTime
          ? values.scheduledAt
              .hour(values.endTime.hour())
              .minute(values.endTime.minute())
              .second(0)
              .millisecond(0)
              .toISOString()
          : undefined,
        location: values.location
      });
      message.success(t('Assemblée créée'));
      setOpen(false);
      form.resetFields();
      await loadMeetings();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Création impossible'));
    } finally {
      setSubmitting(false);
    }
  };

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

        {loading ? (
          <div style={{ minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spin size="large" />
          </div>
        ) : (
          <Card title={t('Liste des assemblées')}>
            <Table
              scroll={{ x: 'max-content' }}
              rowKey="id"
              dataSource={meetings}
              columns={[
                {
                  title: 'Type',
                  dataIndex: 'type',
                  key: 'type',
                  render: (value: MeetingType) => meetingTypeLabels[value]
                },
                {
                  title: 'Date',
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
                  title: 'Fin',
                  dataIndex: 'endTime',
                  key: 'endTime',
                  render: (value?: string | null) => (value ? dayjs(value).format('HH:mm') : '-')
                },
                {
                  title: 'Lieu',
                  dataIndex: 'location',
                  key: 'location',
                  render: (value?: string | null) => value || t('Non renseigné')
                },
                {
                  title: 'Statut',
                  dataIndex: 'status',
                  key: 'status',
                  render: (value: GeneralMeeting['status']) => <Tag>{meetingStatusLabels[value]}</Tag>
                },
                {
                  title: 'Actions',
                  key: 'actions',
                  render: (_: unknown, item: GeneralMeeting) => (
                    <Button
                      size="small"
                      onClick={() => navigate(`/tenant/${effectiveTenantId}/syndics/${syndicId}/assemblees/${item.id}`)}
                    >
                      {t('Voir détails')}
                    </Button>
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
      >
        <Form form={form} layout="vertical" initialValues={{ type: 'ORDINARY' }}>
          <Form.Item label={t('Type')} name="type" rules={[{ required: true, message: t('Le type est obligatoire') }]}>
            <Select showSearch optionFilterProp="label" options={meetingTypeOptions} />
          </Form.Item>
          <Form.Item
            label={t('Date et heure')}
            name="scheduledAt"
            rules={[{ required: true, message: t('La date est obligatoire') }]}
          >
            <DatePicker showTime style={{ width: '100%' }} format="DD/MM/YYYY HH:mm" />
          </Form.Item>
          <Form.Item label={t('Heure de début')} name="startTime">
            <TimePicker style={{ width: '100%' }} format="HH:mm" />
          </Form.Item>
          <Form.Item label={t('Heure de fin')} name="endTime">
            <TimePicker style={{ width: '100%' }} format="HH:mm" />
          </Form.Item>
          <Form.Item label={t('Lieu')} name="location">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};
