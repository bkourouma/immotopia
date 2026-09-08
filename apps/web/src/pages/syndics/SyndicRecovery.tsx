import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  App,
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography
} from 'antd';
import { ArrowLeftOutlined, ClockCircleOutlined, ExclamationCircleOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  createLatePaymentPenalty,
  createManualReminder,
  createPaymentSchedule,
  getOverdueDashboard,
  listLatePaymentPenalties,
  listPaymentSchedules,
  listPaymentReminders,
  runReminderBatch,
  waiveLatePaymentPenalty
} from '../../services/syndic-service';
import {
  LatePaymentPenalty,
  OverdueDashboard,
  OverdueDashboardItem,
  PaymentReminder,
  PaymentSchedule,
  ReminderChannel,
  ReminderStatus
} from '../../types/syndic-types';
import { useSyndicRouteContext } from './useSyndicRouteContext';

const { Paragraph, Title, Text } = Typography;

const reminderChannelOptions: Array<{ label: string; value: ReminderChannel }> = [
  { label: 'Email', value: 'EMAIL' },
  { label: 'SMS', value: 'SMS' },
  { label: 'WhatsApp', value: 'WHATSAPP' },
  { label: 'Push', value: 'PUSH' }
];

const reminderStatusLabels: Record<ReminderStatus, string> = {
  SENT: 'Envoyé',
  DELIVERED: 'Distribué',
  FAILED: 'Échec'
};

type LotWithPropertyLabel =
  | {
      lotNumber?: string | null;
      property?: {
        title?: string | null;
        address?: string | null;
        internalReference?: string | null;
      } | null;
    }
  | null
  | undefined;

function ownerLabel(owner?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null) {
  if (!owner) return 'Sans propriétaire';
  const name = [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim();
  return name || owner.email || 'Propriétaire';
}

function lotPropertyLabel(lot: LotWithPropertyLabel): string {
  const title = lot?.property?.title?.trim();
  const address = lot?.property?.address?.trim();
  const internalReference = lot?.property?.internalReference?.trim();
  const isTechnicalReference = Boolean(title && /^PROP-\d{8}-[A-Z0-9]{4}-\d{4}$/i.test(title));

  if (title && !isTechnicalReference) {
    return title;
  }

  if (address) {
    return address;
  }

  if (title) {
    return title;
  }

  if (internalReference) {
    return internalReference;
  }

  return lot?.lotNumber || '-';
}

function propertyLabel(item: OverdueDashboardItem): string {
  const title = item.property?.title?.trim();
  const address = item.property?.address?.trim();
  const internalReference = item.property?.internalReference?.trim();
  const isTechnicalReference = Boolean(title && /^PROP-\d{8}-[A-Z0-9]{4}-\d{4}$/i.test(title));

  if (title && !isTechnicalReference) {
    return title;
  }

  if (address) {
    return address;
  }

  if (title) {
    return title;
  }

  if (internalReference) {
    return internalReference;
  }

  return item.lotNumber;
}

export const SyndicRecovery: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId: effectiveTenantId, syndicId } = useSyndicRouteContext();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<OverdueDashboard>({
    items: [],
    totals: { overdueCount: 0, overdueAmount: 0 }
  });
  const [reminders, setReminders] = useState<PaymentReminder[]>([]);
  const [penalties, setPenalties] = useState<LatePaymentPenalty[]>([]);
  const [schedules, setSchedules] = useState<PaymentSchedule[]>([]);

  const [manualOpen, setManualOpen] = useState(false);
  const [penaltyOpen, setPenaltyOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [waiveOpen, setWaiveOpen] = useState(false);
  const [selectedPenalty, setSelectedPenalty] = useState<LatePaymentPenalty | null>(null);

  const [manualForm] = Form.useForm();
  const [penaltyForm] = Form.useForm();
  const [scheduleForm] = Form.useForm();
  const [waiveForm] = Form.useForm();

  useEffect(() => {
    if (!effectiveTenantId || !syndicId) {
      setLoading(false);
      setError('Paramètres recouvrement manquants');
      return;
    }
    void loadData();
  }, [effectiveTenantId, syndicId]);

  const chargeOptions = useMemo(
    () =>
      dashboard.items.map(item => ({
        value: item.chargeCallId,
        label: `${propertyLabel(item)} - ${ownerLabel(item.owner)} - reste ${item.outstanding.toLocaleString('fr-FR')} XOF`
      })),
    [dashboard.items]
  );

  const loadData = async () => {
    if (!effectiveTenantId || !syndicId) return;
    setLoading(true);
    setError(null);
    try {
      const [dashboardData, remindersData, penaltiesData, schedulesData] = await Promise.all([
        getOverdueDashboard(effectiveTenantId, syndicId),
        listPaymentReminders(effectiveTenantId, syndicId, { page: 1, limit: 50 }),
        listLatePaymentPenalties(effectiveTenantId, syndicId, { page: 1, limit: 50 }),
        listPaymentSchedules(effectiveTenantId, syndicId, { page: 1, limit: 50 })
      ]);
      setDashboard(dashboardData);
      setReminders(remindersData);
      setPenalties(penaltiesData);
      setSchedules(schedulesData);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Impossible de charger le recouvrement');
    } finally {
      setLoading(false);
    }
  };

  const handleRunBatch = async () => {
    if (!effectiveTenantId || !syndicId) return;
    setSubmitting(true);
    try {
      const result = await runReminderBatch(effectiveTenantId, syndicId);
      message.success(`Batch terminé: ${result.remindersCreated} relance(s) créée(s)`);
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Batch de relances impossible');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateManualReminder = async () => {
    if (!effectiveTenantId || !syndicId) return;
    const values = await manualForm.validateFields();
    setSubmitting(true);
    try {
      await createManualReminder(effectiveTenantId, syndicId, values.chargeCallId, {
        reminderLevel: values.reminderLevel,
        channel: values.channel,
        status: 'SENT'
      });
      message.success('Relance créée');
      setManualOpen(false);
      manualForm.resetFields();
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Création de relance impossible');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreatePenalty = async () => {
    if (!effectiveTenantId || !syndicId) return;
    const values = await penaltyForm.validateFields();
    setSubmitting(true);
    try {
      await createLatePaymentPenalty(effectiveTenantId, syndicId, values.chargeCallId, {
        penaltyRate: values.penaltyRate,
        daysLate: values.daysLate
      });
      message.success('Pénalité appliquée');
      setPenaltyOpen(false);
      penaltyForm.resetFields();
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Application de pénalité impossible');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWaivePenalty = async () => {
    if (!effectiveTenantId || !syndicId || !selectedPenalty) return;
    const values = await waiveForm.validateFields();
    setSubmitting(true);
    try {
      await waiveLatePaymentPenalty(effectiveTenantId, syndicId, selectedPenalty.id, {
        waivedReason: values.waivedReason
      });
      message.success('Remise appliquée');
      setWaiveOpen(false);
      setSelectedPenalty(null);
      waiveForm.resetFields();
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Remise impossible');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateSchedule = async () => {
    if (!effectiveTenantId || !syndicId) return;
    const values = await scheduleForm.validateFields();
    setSubmitting(true);
    try {
      await createPaymentSchedule(effectiveTenantId, syndicId, values.chargeCallId, {
        agreedAt: values.agreedAt ? values.agreedAt.toISOString() : undefined,
        totalAmount: values.totalAmount,
        instalments: (values.instalments || []).map((item: any) => ({
          dueDate: item.dueDate.toISOString(),
          amount: item.amount
        }))
      });
      message.success('Échéancier créé');
      setScheduleOpen(false);
      scheduleForm.resetFields();
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || "Création d'échéancier impossible");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <Space direction="vertical" size={4}>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate(`/tenant/${effectiveTenantId}/syndics/${syndicId}`)}
            >
              Retour à la fiche syndic
            </Button>
            <Title level={2} style={{ margin: 0 }}>
              Recouvrement des impayés
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              Suivi des retards, relances, pénalités et échéanciers.
            </Paragraph>
          </Space>
          <Space wrap>
            <Button onClick={() => setManualOpen(true)} icon={<PlusOutlined />} disabled={dashboard.items.length === 0}>
              Relance manuelle
            </Button>
            <Button
              onClick={() => setPenaltyOpen(true)}
              icon={<ExclamationCircleOutlined />}
              disabled={dashboard.items.length === 0}
            >
              Appliquer pénalité
            </Button>
            <Button
              onClick={() => setScheduleOpen(true)}
              icon={<ClockCircleOutlined />}
              disabled={dashboard.items.length === 0}
            >
              Créer échéancier
            </Button>
            <Button type="primary" onClick={() => void handleRunBatch()} loading={submitting}>
              Lancer batch relances
            </Button>
          </Space>
        </div>

        {error ? <Alert type="error" message={error} showIcon /> : null}

        {loading ? (
          <div style={{ minHeight: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spin size="large" />
          </div>
        ) : (
          <>
            <Row gutter={[16, 16]}>
              <Col xs={24} md={12}>
                <Card>
                  <Statistic title="Lots en retard" value={dashboard.totals.overdueCount} />
                </Card>
              </Col>
              <Col xs={24} md={12}>
                <Card>
                  <Statistic title="Montant restant du" value={dashboard.totals.overdueAmount} suffix="XOF" />
                </Card>
              </Col>
            </Row>

            <Card title="Dashboard retards">
              <Table
                rowKey="chargeCallId"
                dataSource={dashboard.items}
                pagination={{ pageSize: 10 }}
                columns={[
                  {
                    title: 'Propriété',
                    render: (_, item) => propertyLabel(item)
                  },
                  {
                    title: 'Propriétaire',
                    render: (_, item) => ownerLabel(item.owner)
                  },
                  {
                    title: 'Échéance',
                    dataIndex: 'dueDate',
                    render: (value: string) => dayjs(value).format('DD/MM/YYYY')
                  },
                  { title: 'Jours retard', dataIndex: 'daysLate' },
                  {
                    title: 'Montant',
                    dataIndex: 'amount',
                    render: (value: number) => `${value.toLocaleString('fr-FR')} XOF`
                  },
                  {
                    title: 'Payé',
                    dataIndex: 'paid',
                    render: (value: number) => `${value.toLocaleString('fr-FR')} XOF`
                  },
                  {
                    title: 'Reste',
                    dataIndex: 'outstanding',
                    render: (value: number) => `${value.toLocaleString('fr-FR')} XOF`
                  }
                ]}
              />
            </Card>

            <Card title="Historique relances">
              <Table
                rowKey="id"
                dataSource={reminders}
                pagination={{ pageSize: 10 }}
                columns={[
                  { title: 'Niveau', dataIndex: 'reminderLevel' },
                  { title: 'Canal', dataIndex: 'channel' },
                  {
                    title: 'Statut',
                    dataIndex: 'status',
                    render: (value: ReminderStatus) => <Tag>{reminderStatusLabels[value] ?? value}</Tag>
                  },
                  { title: 'Lot', render: (_, item) => item.lot?.lotNumber || '-' },
                  { title: 'Propriétaire', render: (_, item) => ownerLabel(item.lot?.owner) },
                  {
                    title: 'Envoyé le',
                    dataIndex: 'sentAt',
                    render: (value: string) => dayjs(value).format('DD/MM/YYYY HH:mm')
                  }
                ]}
              />
            </Card>

            <Card title="Pénalités de retard">
              <Table
                rowKey="id"
                dataSource={penalties}
                pagination={{ pageSize: 10 }}
                columns={[
                  { title: 'Lot', render: (_, item) => lotPropertyLabel(item.lot) },
                  { title: 'Propriétaire', render: (_, item) => ownerLabel(item.lot?.owner) },
                  { title: 'Jours retard', dataIndex: 'daysLate' },
                  { title: 'Taux', dataIndex: 'penaltyRate', render: (value: number) => `${value}%` },
                  {
                    title: 'Montant',
                    dataIndex: 'penaltyAmount',
                    render: (value: number) => `${Number(value).toLocaleString('fr-FR')} XOF`
                  },
                  {
                    title: 'Statut',
                    render: (_, item) => (item.waived ? <Tag color="orange">REMIS</Tag> : <Tag color="red">ACTIF</Tag>)
                  },
                  {
                    title: 'Action',
                    render: (_, item) =>
                      item.waived ? (
                        <Text type="secondary">-</Text>
                      ) : (
                        <Button
                          size="small"
                          onClick={() => {
                            setSelectedPenalty(item);
                            setWaiveOpen(true);
                          }}
                        >
                          Remise
                        </Button>
                      )
                  }
                ]}
              />
            </Card>

            <Card title="Échéanciers">
              <Table
                rowKey="id"
                dataSource={schedules}
                pagination={{ pageSize: 10 }}
                columns={[
                  { title: 'Lot', render: (_, item) => lotPropertyLabel(item.lot) },
                  { title: 'Propriétaire', render: (_, item) => ownerLabel(item.lot?.owner) },
                  { title: 'Appel', render: (_, item) => item.chargeCall?.period || '-' },
                  {
                    title: 'Montant total',
                    dataIndex: 'totalAmount',
                    render: (value: number | string) => `${Number(value).toLocaleString('fr-FR')} XOF`
                  },
                  {
                    title: 'Accord',
                    dataIndex: 'agreedAt',
                    render: (value: string) => dayjs(value).format('DD/MM/YYYY')
                  },
                  {
                    title: 'Échéances',
                    render: (_, item) =>
                      (item.instalments || [])
                        .map(
                          inst =>
                            `${dayjs(inst.dueDate).format('DD/MM/YYYY')} (${Number(inst.amount).toLocaleString('fr-FR')} XOF)`
                        )
                        .join(' | ') || '-'
                  },
                  { title: 'Statut', dataIndex: 'status', render: (value: string) => <Tag>{value}</Tag> }
                ]}
              />
            </Card>
          </>
        )}
      </Space>

      <Modal
        title="Créer une relance manuelle"
        open={manualOpen}
        onCancel={() => setManualOpen(false)}
        onOk={() => void handleCreateManualReminder()}
        okText="Créer"
        cancelText="Annuler"
        confirmLoading={submitting}
      >
        <Form form={manualForm} layout="vertical" initialValues={{ reminderLevel: 1, channel: 'EMAIL' }}>
          <Form.Item
            label="Appel de charges"
            name="chargeCallId"
            rules={[{ required: true, message: 'Sélectionnez un appel' }]}
          >
            <Select showSearch optionFilterProp="label" options={chargeOptions} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="Niveau" name="reminderLevel" rules={[{ required: true }]}>
                <InputNumber min={1} max={4} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Canal" name="channel" rules={[{ required: true }]}>
                <Select options={reminderChannelOptions} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title="Appliquer une pénalité"
        open={penaltyOpen}
        onCancel={() => setPenaltyOpen(false)}
        onOk={() => void handleCreatePenalty()}
        okText="Appliquer"
        cancelText="Annuler"
        confirmLoading={submitting}
      >
        <Form form={penaltyForm} layout="vertical" initialValues={{ penaltyRate: 5 }}>
          <Form.Item
            label="Appel de charges"
            name="chargeCallId"
            rules={[{ required: true, message: 'Sélectionnez un appel' }]}
          >
            <Select showSearch optionFilterProp="label" options={chargeOptions} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                label="Taux (%)"
                name="penaltyRate"
                rules={[{ required: true, message: 'Le taux est obligatoire' }]}
              >
                <InputNumber min={0.01} max={100} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Jours de retard (optionnel)" name="daysLate">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title="Créer un échéancier"
        open={scheduleOpen}
        onCancel={() => setScheduleOpen(false)}
        onOk={() => void handleCreateSchedule()}
        okText="Créer"
        cancelText="Annuler"
        confirmLoading={submitting}
        width={760}
      >
        <Form
          form={scheduleForm}
          layout="vertical"
          initialValues={{
            instalments: [{ amount: undefined, dueDate: undefined }]
          }}
        >
          <Form.Item
            label="Appel de charges"
            name="chargeCallId"
            rules={[{ required: true, message: 'Sélectionnez un appel' }]}
          >
            <Select showSearch optionFilterProp="label" options={chargeOptions} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                label="Montant total"
                name="totalAmount"
                rules={[{ required: true, message: 'Le total est obligatoire' }]}
              >
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Date accord (optionnel)" name="agreedAt">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>

          <Form.List name="instalments">
            {(fields, { add, remove }) => (
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                {fields.map((field, index) => (
                  <Row gutter={12} key={field.key}>
                    <Col span={10}>
                      <Form.Item
                        {...field}
                        label={`Échéance #${index + 1}`}
                        name={[field.name, 'dueDate']}
                        rules={[{ required: true, message: 'Date requise' }]}
                      >
                        <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                      </Form.Item>
                    </Col>
                    <Col span={10}>
                      <Form.Item
                        {...field}
                        label="Montant"
                        name={[field.name, 'amount']}
                        rules={[{ required: true, message: 'Montant requis' }]}
                      >
                        <InputNumber min={1} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={4} style={{ display: 'flex', alignItems: 'center' }}>
                      <Button danger onClick={() => remove(field.name)} disabled={fields.length <= 1}>
                        Supprimer
                      </Button>
                    </Col>
                  </Row>
                ))}
                <Button onClick={() => add()} icon={<PlusOutlined />}>
                  Ajouter une échéance
                </Button>
              </Space>
            )}
          </Form.List>
        </Form>
      </Modal>

      <Modal
        title="Remise de pénalité"
        open={waiveOpen}
        onCancel={() => {
          setWaiveOpen(false);
          setSelectedPenalty(null);
          waiveForm.resetFields();
        }}
        onOk={() => void handleWaivePenalty()}
        okText="Appliquer remise"
        cancelText="Annuler"
        confirmLoading={submitting}
      >
        <Form form={waiveForm} layout="vertical">
          <Form.Item
            label="Motif de remise"
            name="waivedReason"
            rules={[{ required: true, message: 'Le motif est obligatoire' }]}
          >
            <Input.TextArea rows={4} placeholder="Ex: accord exceptionnel suite à contestation validée." />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};
