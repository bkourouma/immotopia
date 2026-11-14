import React, { useMemo, useState } from 'react';
import {
  App,
  Alert,
  Button,
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
  Tabs,
  Typography
} from 'antd';
import { ClockCircleOutlined, ExclamationCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatMoney, MoneyValue, StatCard } from '../../components/primitives';
import {
  createLatePaymentPenalty,
  createManualReminder,
  createPaymentSchedule,
  getOverdueDashboard,
  getReminderBatchPreview,
  runReminderBatch,
  waiveLatePaymentPenalty
} from '../../services/syndic-service';
import {
  LatePaymentPenalty,
  OverdueDashboard,
  ReminderBatchPreview as ReminderBatchPreviewData,
  ReminderBatchResult
} from '../../types/syndic-types';
import { useSyndicRouteContext } from './useSyndicRouteContext';
import { computeLatePenaltyPreview, MAX_MONTHLY_PENALTY_RATE } from '../../utils/syndic-penalty';
import { t } from '../../i18n/t';
import { HelpSectionTitle } from '../../help';
import { dateFormat } from '../../i18n/format';
import { reminderExclusionLabel, reminderFailureLabel } from '../../components/syndics/reminder-failure';
import { ReminderBatchPreview } from '../../components/syndics/ReminderBatchPreview';
import { financeKeys } from '../../components/syndics/finances/query-keys';
import { useTabParam } from '../../components/syndics/finances/url-params';
import { OverdueTableTab, overdueLotLabel } from '../../components/syndics/recovery/OverdueTableTab';
import { PenaltiesTab, RemindersTab, SchedulesTab } from '../../components/syndics/recovery/RecoveryTabs';
import { recoveryKeys } from '../../components/syndics/recovery/query-keys';
import { ownerLabel, reminderChannelOptions } from '../../components/syndics/recovery/recovery-labels';

const { Paragraph, Title, Text } = Typography;

/** Onglets de l'écran, dans l'ordre d'affichage (le premier est le défaut de `?tab=`). */
const RECOVERY_TABS = ['retards', 'relances', 'penalites', 'echeanciers'] as const;
type RecoveryTab = (typeof RECOVERY_TABS)[number];

const EMPTY_DASHBOARD: OverdueDashboard = { items: [], totals: { overdueCount: 0, overdueAmount: 0 } };

/**
 * Recouvrement d'une copropriété : cartes de synthèse (tableau de bord des
 * retards), puis quatre onglets paresseux (`?tab=`) ; chacun porte sa barre de
 * recherche (préfixes d'URL rt, re, pe, ec). Relances, pénalités et
 * échéanciers sont paginés par le serveur ; convention d'URL dans
 * `components/syndics/finances/url-params.ts`.
 */
export const SyndicRecovery: React.FC = () => {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();

  const { tenantId: effectiveTenantId, syndicId } = useSyndicRouteContext();
  const [activeTab, setActiveTab] = useTabParam<RecoveryTab>(RECOVERY_TABS, 'retards');

  const ready = Boolean(effectiveTenantId && syndicId);
  const tenantKey = effectiveTenantId ?? '';
  const syndicKey = syndicId ?? '';

  // Le tableau de bord (borné aux appels en retard) alimente les cartes, l'onglet
  // Retards et les sélecteurs d'appel des modales : une seule requête.
  const dashboardQuery = useQuery({
    queryKey: financeKeys.overdue(tenantKey, syndicKey),
    queryFn: () => getOverdueDashboard(tenantKey, syndicKey),
    enabled: ready
  });
  const dashboard = dashboardQuery.data ?? EMPTY_DASHBOARD;
  const loading = ready && dashboardQuery.isLoading;
  const dashboardError = dashboardQuery.error as { response?: { data?: { error?: string } } } | null;
  const error = ready
    ? dashboardError
      ? dashboardError.response?.data?.error || t('Impossible de charger le recouvrement')
      : null
    : t('Paramètres recouvrement manquants');

  const [submitting, setSubmitting] = useState(false);

  const [manualOpen, setManualOpen] = useState(false);
  const [penaltyOpen, setPenaltyOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [batchPreview, setBatchPreview] = useState<ReminderBatchPreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [waiveOpen, setWaiveOpen] = useState(false);
  const [selectedPenalty, setSelectedPenalty] = useState<LatePaymentPenalty | null>(null);

  const [manualForm] = Form.useForm();
  const [penaltyForm] = Form.useForm();
  const [scheduleForm] = Form.useForm();
  const [waiveForm] = Form.useForm();

  // Aperçu de la pénalité avant validation : même règle que l'API (taux mensuel au prorata des jours).
  const buildPenaltyPreview = (chargeCallId?: string, rate?: number, daysLate?: number) => {
    const item = dashboard.items.find(candidate => candidate.chargeCallId === chargeCallId);
    if (!item || !rate) return null;
    const days = Math.max(daysLate ?? item.daysLate, 1);
    return {
      outstanding: item.outstanding,
      rate,
      days,
      amount: computeLatePenaltyPreview(item.outstanding, rate, days)
    };
  };

  // Les appels proposés dans les modales sont ceux du tableau de bord des retards (liste bornée).
  const chargeOptions = useMemo(
    () =>
      dashboard.items.map(item => ({
        value: item.chargeCallId,
        label: t('{{value}} - {{value2}} - reste {{value3}}', {
          value: overdueLotLabel(item),
          value2: ownerLabel(item.owner),
          value3: formatMoney(item.outstanding)
        })
      })),
    [dashboard.items]
  );

  /** Après une écriture : le tableau de bord (cartes, sélecteurs) et la liste de la section touchée. */
  const refreshAfterWrite = async (scope: 'reminders' | 'penalties' | 'schedules') => {
    const keys = {
      reminders: recoveryKeys.reminders(tenantKey, syndicKey),
      penalties: recoveryKeys.penalties(tenantKey, syndicKey),
      schedules: recoveryKeys.schedules(tenantKey, syndicKey)
    };
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: financeKeys.overdue(tenantKey, syndicKey) }),
      queryClient.invalidateQueries({ queryKey: keys[scope] })
    ]);
  };

  const handleOpenBatchPreview = async () => {
    if (!effectiveTenantId || !syndicId) return;
    setPreviewLoading(true);
    try {
      setBatchPreview(await getReminderBatchPreview(effectiveTenantId, syndicId));
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Aperçu des relances groupées impossible'));
    } finally {
      setPreviewLoading(false);
    }
  };

  const showBatchSummary = (result: ReminderBatchResult) => {
    const failed = result.notificationsFailed ?? 0;
    const sent = Math.max(result.remindersCreated - failed, 0);
    const failures = Object.entries(result.failuresByCause ?? {});
    const exclusions = Object.entries(result.excludedByReason ?? {});
    const summary = t('{{sent}} relance(s) envoyée(s), {{failed}} échec(s) d’envoi', { sent, failed });
    if (failed > 0) {
      message.warning(summary);
    } else {
      message.success(summary);
    }
    if (failures.length === 0 && exclusions.length === 0) return;
    modal.info({
      title: t('Résumé des relances groupées'),
      content: (
        <Space direction="vertical" size={8}>
          <Text>{summary}</Text>
          {failures.length > 0 ? (
            <div>
              <Text strong>{t('Échecs par cause')}</Text>
              <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                {failures.map(([code, count]) => (
                  <li key={code}>{`${reminderFailureLabel(code)} : ${count}`}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {exclusions.length > 0 ? (
            <div>
              <Text strong>{t('Appels écartés par motif')}</Text>
              <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                {exclusions.map(([reason, count]) => (
                  <li key={reason}>{`${reminderExclusionLabel(reason)} : ${count}`}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </Space>
      )
    });
  };

  const handleRunBatch = async () => {
    if (!effectiveTenantId || !syndicId) return;
    setSubmitting(true);
    try {
      const result = await runReminderBatch(effectiveTenantId, syndicId);
      setBatchPreview(null);
      showBatchSummary(result);
      await refreshAfterWrite('reminders');
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
      const reminder = await createManualReminder(effectiveTenantId, syndicId, values.chargeCallId, {
        reminderLevel: values.reminderLevel,
        channel: values.channel,
        status: 'SENT'
      });
      if (reminder.notificationFailed) {
        message.warning(
          t('Relance enregistrée, envoi échoué : {{cause}}', {
            cause: reminderFailureLabel(reminder.failureCode, reminder.failureMessage)
          })
        );
      } else {
        message.success(t('Relance créée'));
      }
      setManualOpen(false);
      manualForm.resetFields();
      await refreshAfterWrite('reminders');
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
      await refreshAfterWrite('penalties');
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
      await refreshAfterWrite('penalties');
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
      await refreshAfterWrite('schedules');
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
            <Button type="primary" onClick={() => void handleOpenBatchPreview()} loading={previewLoading}>
              {t('Lancer les relances groupées')}
            </Button>
          </Space>
        </div>

        {error ? <Alert type="error" message={error} showIcon /> : null}

        {loading ? (
          <div style={{ minHeight: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spin size="large" />
          </div>
        ) : (
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <StatCard
                helpId="syndic.recouvrement.indicateurs"
                label={t('Lots en retard')}
                value={dashboard.totals.overdueLotCount ?? dashboard.totals.overdueCount}
                tone={dashboard.totals.overdueCount > 0 ? 'danger' : 'neutral'}
              />
            </Col>
            <Col xs={24} md={12}>
              <StatCard
                helpId="syndic.recouvrement.indicateurs"
                label={t('Montant restant dû')}
                value={<MoneyValue value={dashboard.totals.overdueAmount} />}
                tone={dashboard.totals.overdueAmount > 0 ? 'danger' : 'neutral'}
              />
            </Col>
          </Row>
        )}

        <Tabs
          activeKey={activeTab}
          onChange={key => setActiveTab(key as RecoveryTab)}
          destroyOnHidden
          items={[
            {
              key: 'retards',
              label: t('Tableau des retards'),
              children: <OverdueTableTab items={dashboard.items} loading={loading} />
            },
            {
              key: 'relances',
              label: t('Historique relances'),
              children: ready ? <RemindersTab tenantId={tenantKey} syndicId={syndicKey} /> : null
            },
            {
              key: 'penalites',
              label: t('Pénalités de retard'),
              children: ready ? (
                <PenaltiesTab
                  tenantId={tenantKey}
                  syndicId={syndicKey}
                  onWaive={penalty => {
                    setSelectedPenalty(penalty);
                    setWaiveOpen(true);
                  }}
                />
              ) : null
            },
            {
              key: 'echeanciers',
              label: t('Échéanciers'),
              children: ready ? <SchedulesTab tenantId={tenantKey} syndicId={syndicKey} /> : null
            }
          ]}
        />
      </Space>

      <ReminderBatchPreview
        open={batchPreview !== null}
        preview={batchPreview}
        confirming={submitting}
        onConfirm={() => void handleRunBatch()}
        onCancel={() => setBatchPreview(null)}
      />

      <Modal
        title={
          <HelpSectionTitle title={t('Créer une relance manuelle')} helpId="syndic.recouvrement.relance-manuelle" />
        }
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
        title={<HelpSectionTitle title={t('Appliquer une pénalité')} helpId="syndic.recouvrement.penalites" />}
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
                label={t('Taux mensuel (%)')}
                name="penaltyRate"
                tooltip={t(
                  'Taux par mois de retard, appliqué au prorata des jours (mois de 30 jours) sur le reste dû. Maximum {{max}} % par mois.',
                  { max: MAX_MONTHLY_PENALTY_RATE }
                )}
                rules={[{ required: true, message: t('Le taux est obligatoire') }]}
              >
                <InputNumber min={0.01} max={MAX_MONTHLY_PENALTY_RATE} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label={t('Jours de retard (optionnel)')} name="daysLate">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item noStyle shouldUpdate>
            {({ getFieldValue }) => {
              const preview = buildPenaltyPreview(
                getFieldValue('chargeCallId'),
                getFieldValue('penaltyRate'),
                getFieldValue('daysLate')
              );
              return preview ? (
                <Alert
                  type="info"
                  showIcon
                  message={t('Pénalité estimée : {{amount}}', { amount: formatMoney(preview.amount) })}
                  description={t(
                    '{{outstanding}} (reste dû) × {{rate}} % × {{days}} jours ÷ 30 — plafonnée au reste dû.',
                    {
                      outstanding: formatMoney(preview.outstanding),
                      rate: preview.rate,
                      days: preview.days
                    }
                  )}
                />
              ) : null;
            }}
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={<HelpSectionTitle title={t('Créer un échéancier')} helpId="syndic.recouvrement.echeanciers" />}
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
                <DatePicker style={{ width: '100%' }} format={dateFormat('short')} />
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
                        <DatePicker style={{ width: '100%' }} format={dateFormat('short')} />
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
        title={<HelpSectionTitle title={t('Remise de pénalité')} helpId="syndic.recouvrement.penalites" />}
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
