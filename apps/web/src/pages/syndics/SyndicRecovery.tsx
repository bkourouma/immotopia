import React, { useEffect, useMemo, useState } from 'react';
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
  Table,
  Tag,
  Typography
} from 'antd';
import { ClockCircleOutlined, ExclamationCircleOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { formatMoney, MoneyValue, StatCard } from '../../components/primitives';
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
import { formatLotLabel } from '../../utils/syndic-lot-label';
import { t } from '../../i18n/t';

const { Paragraph, Title, Text } = Typography;

const reminderChannelOptions: Array<{ label: string; value: ReminderChannel }> = [
  { label: t('Email'), value: 'EMAIL' },
  { label: 'SMS', value: 'SMS' },
  { label: 'WhatsApp', value: 'WHATSAPP' },
  { label: t('Push'), value: 'PUSH' }
];

const reminderStatusLabels: Record<ReminderStatus, string> = {
  SENT: t('Envoyé'),
  DELIVERED: t('Distribué'),
  FAILED: t('Échec')
};

function ownerLabel(owner?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null) {
  if (!owner) return t('Sans propriétaire');
  const name = [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim();
  return name || owner.email || t('Propriétaire');
}

function propertyLabel(item: OverdueDashboardItem): string {
  return formatLotLabel({ lotNumber: item.lotNumber, property: item.property }, item.lotNumber);
}

export const SyndicRecovery: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId: effectiveTenantId, syndicId } = useSyndicRouteContext();

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
      setError(t('Paramètres recouvrement manquants'));
      return;
    }
    void loadData();
  }, [effectiveTenantId, syndicId]);

  const chargeOptions = useMemo(
    () =>
      dashboard.items.map(item => ({
        value: item.chargeCallId,
        label: t('{{value}} - {{value2}} - reste {{value3}}', {
          value: propertyLabel(item),
          value2: ownerLabel(item.owner),
          value3: formatMoney(item.outstanding)
        })
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
      setError(err.response?.data?.error || t('Impossible de charger le recouvrement'));
    } finally {
      setLoading(false);
    }
  };

  const handleRunBatch = async () => {
    if (!effectiveTenantId || !syndicId) return;
    setSubmitting(true);
    try {
      const result = await runReminderBatch(effectiveTenantId, syndicId);
      message.success(
        t('Relances groupées envoyées : {{remindersCreated}} relance(s) créée(s)', {
          remindersCreated: result.remindersCreated
        })
      );
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Envoi des relances groupées impossible'));
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
      message.success(t('Relance créée'));
      setManualOpen(false);
      manualForm.resetFields();
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Création de relance impossible'));
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
      message.success(t('Pénalité appliquée'));
      setPenaltyOpen(false);
      penaltyForm.resetFields();
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Application de pénalité impossible'));
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
      message.success(t('Remise appliquée'));
      setWaiveOpen(false);
      setSelectedPenalty(null);
      waiveForm.resetFields();
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Remise impossible'));
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
      message.success(t('Échéancier créé'));
      setScheduleOpen(false);
      scheduleForm.resetFields();
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || t("Création d'échéancier impossible"));
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
              {t('Recouvrement des impayés')}
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {t('Suivi des retards, relances, pénalités et échéanciers.')}
            </Paragraph>
          </Space>
          <Space wrap>
            <Button onClick={() => setManualOpen(true)} icon={<PlusOutlined />} disabled={dashboard.items.length === 0}>
              {t('Relance manuelle')}
            </Button>
            <Button
              onClick={() => setPenaltyOpen(true)}
              icon={<ExclamationCircleOutlined />}
              disabled={dashboard.items.length === 0}
            >
              {t('Appliquer pénalité')}
            </Button>
            <Button
              onClick={() => setScheduleOpen(true)}
              icon={<ClockCircleOutlined />}
              disabled={dashboard.items.length === 0}
            >
              {t('Créer échéancier')}
            </Button>
            <Button type="primary" onClick={() => void handleRunBatch()} loading={submitting}>
              {t('Lancer les relances groupées')}
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
                <StatCard
                  label={t('Lots en retard')}
                  value={dashboard.totals.overdueCount}
                  tone={dashboard.totals.overdueCount > 0 ? 'danger' : 'neutral'}
                />
              </Col>
              <Col xs={24} md={12}>
                <StatCard
                  label={t('Montant restant dû')}
                  value={<MoneyValue value={dashboard.totals.overdueAmount} />}
                  tone={dashboard.totals.overdueAmount > 0 ? 'danger' : 'neutral'}
                />
              </Col>
            </Row>

            <Card title={t('Tableau des retards')}>
              <Table
                scroll={{ x: 'max-content' }}
                rowKey="chargeCallId"
                dataSource={dashboard.items}
                pagination={{ pageSize: 10 }}
                columns={[
                  {
                    title: t('Propriété'),
                    render: (_, item) => propertyLabel(item)
                  },
                  {
                    title: t('Propriétaire'),
                    render: (_, item) => ownerLabel(item.owner)
                  },
                  {
                    title: t('Échéance'),
                    dataIndex: 'dueDate',
                    render: (value: string) => dayjs(value).format('DD/MM/YYYY')
                  },
                  { title: t('Jours retard'), dataIndex: 'daysLate' },
                  {
                    title: 'Montant',
                    dataIndex: 'amount',
                    align: 'end',
                    render: (value: number) => <MoneyValue value={value} />
                  },
                  {
                    title: t('Payé'),
                    dataIndex: 'paid',
                    align: 'end',
                    render: (value: number) => <MoneyValue value={value} />
                  },
                  {
                    title: 'Reste',
                    dataIndex: 'outstanding',
                    align: 'end',
                    render: (value: number) => <MoneyValue value={value} />
                  }
                ]}
              />
            </Card>

            <Card title={t('Historique relances')}>
              <Table
                scroll={{ x: 'max-content' }}
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
                  { title: 'Lot', render: (_, item) => formatLotLabel(item.lot, item.lotId) },
                  { title: t('Propriétaire'), render: (_, item) => ownerLabel(item.lot?.owner) },
                  {
                    title: t('Envoyé le'),
                    dataIndex: 'sentAt',
                    render: (value: string) => dayjs(value).format('DD/MM/YYYY HH:mm')
                  }
                ]}
              />
            </Card>

            <Card title={t('Pénalités de retard')}>
              <Table
                scroll={{ x: 'max-content' }}
                rowKey="id"
                dataSource={penalties}
                pagination={{ pageSize: 10 }}
                columns={[
                  { title: 'Lot', render: (_, item) => formatLotLabel(item.lot, item.lotId) },
                  { title: t('Propriétaire'), render: (_, item) => ownerLabel(item.lot?.owner) },
                  { title: t('Jours retard'), dataIndex: 'daysLate' },
                  { title: 'Taux', dataIndex: 'penaltyRate', render: (value: number) => `${value}%` },
                  {
                    title: 'Montant',
                    dataIndex: 'penaltyAmount',
                    align: 'end',
                    render: (value: number) => <MoneyValue value={value} />
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
                          {t('Remise')}
                        </Button>
                      )
                  }
                ]}
              />
            </Card>

            <Card title={t('Échéanciers')}>
              <Table
                scroll={{ x: 'max-content' }}
                rowKey="id"
                dataSource={schedules}
                pagination={{ pageSize: 10 }}
                columns={[
                  { title: 'Lot', render: (_, item) => formatLotLabel(item.lot, item.lotId) },
                  { title: t('Propriétaire'), render: (_, item) => ownerLabel(item.lot?.owner) },
                  { title: 'Appel', render: (_, item) => item.chargeCall?.period || '-' },
                  {
                    title: t('Montant total'),
                    dataIndex: 'totalAmount',
                    align: 'end',
                    render: (value: number | string) => <MoneyValue value={value} />
                  },
                  {
                    title: 'Accord',
                    dataIndex: 'agreedAt',
                    render: (value: string) => dayjs(value).format('DD/MM/YYYY')
                  },
                  {
                    title: t('Échéances'),
                    render: (_, item) =>
                      (item.instalments || [])
                        .map(inst => `${dayjs(inst.dueDate).format('DD/MM/YYYY')} (${formatMoney(inst.amount)})`)
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
        title={t('Créer une relance manuelle')}
        open={manualOpen}
        onCancel={() => setManualOpen(false)}
        onOk={() => void handleCreateManualReminder()}
        okText={t('Créer')}
        cancelText={t('Annuler')}
        confirmLoading={submitting}
      >
        <Form form={manualForm} layout="vertical" initialValues={{ reminderLevel: 1, channel: 'EMAIL' }}>
          <Form.Item
            label={t('Appel de charges')}
            name="chargeCallId"
            rules={[{ required: true, message: t('Sélectionnez un appel') }]}
          >
            <Select showSearch optionFilterProp="label" options={chargeOptions} />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item label={t('Niveau')} name="reminderLevel" rules={[{ required: true }]}>
                <InputNumber min={1} max={4} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label={t('Canal')} name="channel" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="label" options={reminderChannelOptions} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title={t('Appliquer une pénalité')}
        open={penaltyOpen}
        onCancel={() => setPenaltyOpen(false)}
        onOk={() => void handleCreatePenalty()}
        okText={t('Appliquer')}
        cancelText={t('Annuler')}
        confirmLoading={submitting}
      >
        <Form form={penaltyForm} layout="vertical" initialValues={{ penaltyRate: 5 }}>
          <Form.Item
            label={t('Appel de charges')}
            name="chargeCallId"
            rules={[{ required: true, message: t('Sélectionnez un appel') }]}
          >
            <Select showSearch optionFilterProp="label" options={chargeOptions} />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item
                label={t('Taux (%)')}
                name="penaltyRate"
                rules={[{ required: true, message: t('Le taux est obligatoire') }]}
              >
                <InputNumber min={0.01} max={100} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label={t('Jours de retard (optionnel)')} name="daysLate">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title={t('Créer un échéancier')}
        open={scheduleOpen}
        onCancel={() => setScheduleOpen(false)}
        onOk={() => void handleCreateSchedule()}
        okText={t('Créer')}
        cancelText={t('Annuler')}
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
            label={t('Appel de charges')}
            name="chargeCallId"
            rules={[{ required: true, message: t('Sélectionnez un appel') }]}
          >
            <Select showSearch optionFilterProp="label" options={chargeOptions} />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item
                label={t('Montant total')}
                name="totalAmount"
                rules={[{ required: true, message: t('Le total est obligatoire') }]}
              >
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label={t('Date accord (optionnel)')} name="agreedAt">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>

          <Form.List name="instalments">
            {(fields, { add, remove }) => (
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                {fields.map((field, index) => (
                  <Row gutter={12} key={field.key}>
                    <Col xs={24} md={10}>
                      <Form.Item
                        {...field}
                        label={t('Échéance #{{value}}', { value: index + 1 })}
                        name={[field.name, 'dueDate']}
                        rules={[{ required: true, message: t('Date requise') }]}
                      >
                        <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={10}>
                      <Form.Item
                        {...field}
                        label={t('Montant')}
                        name={[field.name, 'amount']}
                        rules={[{ required: true, message: t('Montant requis') }]}
                      >
                        <InputNumber min={1} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={4} style={{ display: 'flex', alignItems: 'center' }}>
                      <Button danger onClick={() => remove(field.name)} disabled={fields.length <= 1}>
                        {t('Supprimer')}
                      </Button>
                    </Col>
                  </Row>
                ))}
                <Button onClick={() => add()} icon={<PlusOutlined />}>
                  {t('Ajouter une échéance')}
                </Button>
              </Space>
            )}
          </Form.List>
        </Form>
      </Modal>

      <Modal
        title={t('Remise de pénalité')}
        open={waiveOpen}
        onCancel={() => {
          setWaiveOpen(false);
          setSelectedPenalty(null);
          waiveForm.resetFields();
        }}
        onOk={() => void handleWaivePenalty()}
        okText={t('Appliquer remise')}
        cancelText={t('Annuler')}
        confirmLoading={submitting}
      >
        <Form form={waiveForm} layout="vertical">
          <Form.Item
            label={t('Motif de remise')}
            name="waivedReason"
            rules={[{ required: true, message: t('Le motif est obligatoire') }]}
          >
            <Input.TextArea rows={4} placeholder={t('Ex: accord exceptionnel suite à contestation validée.')} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};
