import React, { useEffect, useMemo, useState } from 'react';
import {
  App,
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography
} from 'antd';
import {
  DeleteOutlined,
  HistoryOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { ConfirmAction, MoneyValue, useConfirmAction } from '../../components/primitives';
import { listBudgets } from '../../services/syndic-service';
import {
  createChargeSchedule,
  deleteChargeSchedule,
  executeChargeScheduleNow,
  listChargeScheduleRuns,
  listChargeSchedules,
  pauseChargeSchedule,
  previewChargeSchedule,
  resumeChargeSchedule,
  updateChargeSchedule
} from '../../services/syndic-charge-schedule-service';
import {
  ChargeSchedule,
  ChargeScheduleAmountSource,
  ChargeScheduleFrequency,
  ChargeSchedulePreview,
  ChargeScheduleRun,
  CreateChargeScheduleRequest,
  SyndicateBudget
} from '../../types/syndic-types';
import { useSyndicRouteContext } from './useSyndicRouteContext';
import { dateFormat } from '../../i18n/format';
import { t } from '../../i18n/t';

const { Paragraph, Text, Title } = Typography;

/**
 * Onglet « Programmation » (lot S4, besoin 6) : appels de charges
 * automatiques. Contrat :
 * `packages/api/src/routes/syndic-charge-schedules-routes.ts`.
 */

const frequencyLabels: Record<ChargeScheduleFrequency, string> = {
  MONTHLY: t('Mensuelle'),
  QUARTERLY: t('Trimestrielle'),
  SEMIANNUAL: t('Semestrielle'),
  ANNUAL: t('Annuelle')
};

const amountSourceLabels: Record<ChargeScheduleAmountSource, string> = {
  BUDGET: t('Budget approuvé'),
  FIXED: t('Montant fixe')
};

const runStatusConfig: Record<ChargeScheduleRun['status'], { color: string; label: string }> = {
  SUCCESS: { color: 'green', label: t('Réussie') },
  FAILED: { color: 'red', label: t('Échec') },
  SKIPPED: { color: 'default', label: t('Ignorée (déjà traitée)') }
};

const runTriggerLabels: Record<ChargeScheduleRun['trigger'], string> = {
  CRON: t('Automatique'),
  MANUAL: t('Manuelle')
};

/**
 * L'API journalise deux refus d'émission sous forme de CODE brut (pas une
 * phrase) : agence suspendue, ou abonnement sans le module Syndic / en
 * lecture seule (audit sécurité, lot S4). Tout autre message d'erreur —
 * conflit 409, message technique générique — est déjà une phrase lisible et
 * s'affiche tel quel.
 */
const SCHEDULE_ERROR_CODE_LABELS: Record<string, string> = {
  TENANT_INACTIVE: t('Agence suspendue : réactivez-la avant de rejouer cette période avec « Exécuter maintenant ».'),
  SUBSCRIPTION_DENIED: t(
    'Abonnement sans module Syndic, ou en lecture seule : régularisez puis rejouez cette période avec « Exécuter maintenant ».'
  )
};

function describeScheduleError(error: string | null | undefined): string | null {
  if (!error) return null;
  return SCHEDULE_ERROR_CODE_LABELS[error] ?? error;
}

function formatDay(value: string | null | undefined): string {
  if (!value) return '—';
  return dayjs(value).format(dateFormat('short'));
}

/** « N avis non envoyé(s) », avec la remarque de l'exécution en infobulle quand il y en a une. */
function NotificationsSkipped({ count, notes }: { count: number; notes: string | null }) {
  if (!count) return <>—</>;
  const label = t('{{count}} avis non envoyé(s)', { count });
  return notes ? (
    <Tooltip title={notes}>
      <Text type="warning" style={{ textDecoration: 'underline dotted', cursor: 'help' }}>
        {label}
      </Text>
    </Tooltip>
  ) : (
    <Text type="warning">{label}</Text>
  );
}

interface ScheduleFormValues {
  label: string;
  frequency: ChargeScheduleFrequency;
  issueDay: number;
  dueOffsetDays: number;
  amountSource: ChargeScheduleAmountSource;
  budgetId?: string;
  fixedAmount?: number;
  currency: string;
  startDate: string;
  endDate?: string;
  active: boolean;
}

export const SyndicChargeSchedules: React.FC = () => {
  const { message } = App.useApp();
  const confirmAction = useConfirmAction();
  const { tenantId: effectiveTenantId, syndicId } = useSyndicRouteContext();

  const [schedules, setSchedules] = useState<ChargeSchedule[]>([]);
  const [budgets, setBudgets] = useState<SyndicateBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ChargeSchedule | null>(null);
  const [drawerTab, setDrawerTab] = useState('form');
  const [form] = Form.useForm<ScheduleFormValues>();

  const [preview, setPreview] = useState<ChargeSchedulePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [runs, setRuns] = useState<ChargeScheduleRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!effectiveTenantId || !syndicId) {
      setLoading(false);
      setError(t('Paramètres programmation manquants'));
      return;
    }
    void loadData();
  }, [effectiveTenantId, syndicId]);

  const loadData = async () => {
    if (!effectiveTenantId || !syndicId) return;
    setLoading(true);
    setError(null);
    try {
      const [schedulesData, budgetsData] = await Promise.all([
        listChargeSchedules(effectiveTenantId, syndicId),
        listBudgets(effectiveTenantId, syndicId)
      ]);
      setSchedules(schedulesData);
      setBudgets(budgetsData);
    } catch (err: any) {
      setError(err.response?.data?.error || t('Impossible de charger les programmations'));
    } finally {
      setLoading(false);
    }
  };

  const approvedBudgetOptions = useMemo(
    () =>
      budgets
        .filter(budget => budget.status === 'APPROVED')
        .map(budget => ({ value: budget.id, label: `${budget.label} (${budget.fiscalYear})` })),
    [budgets]
  );

  const loadPreview = async (scheduleId: string) => {
    if (!effectiveTenantId || !syndicId) return;
    setPreviewLoading(true);
    try {
      setPreview(await previewChargeSchedule(effectiveTenantId, syndicId, scheduleId));
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Aperçu des prochaines périodes impossible'));
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const loadRuns = async (scheduleId: string) => {
    if (!effectiveTenantId || !syndicId) return;
    setRunsLoading(true);
    try {
      setRuns(await listChargeScheduleRuns(effectiveTenantId, syndicId, scheduleId, 50));
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Historique des exécutions impossible à charger'));
      setRuns([]);
    } finally {
      setRunsLoading(false);
    }
  };

  const openCreateDrawer = () => {
    setEditing(null);
    setPreview(null);
    setRuns([]);
    setDrawerTab('form');
    form.resetFields();
    form.setFieldsValue({
      frequency: 'MONTHLY',
      issueDay: 1,
      dueOffsetDays: 15,
      amountSource: 'BUDGET',
      currency: 'XOF',
      startDate: dayjs().format('YYYY-MM-DD'),
      active: true
    });
    setDrawerOpen(true);
  };

  const openEditDrawer = (schedule: ChargeSchedule) => {
    setEditing(schedule);
    setPreview(null);
    setRuns([]);
    setDrawerTab('form');
    form.resetFields();
    form.setFieldsValue({
      label: schedule.label,
      frequency: schedule.frequency,
      issueDay: schedule.issueDay,
      dueOffsetDays: schedule.dueOffsetDays,
      amountSource: schedule.amountSource,
      budgetId: schedule.budgetId ?? undefined,
      fixedAmount: schedule.fixedAmount ?? undefined,
      currency: schedule.currency,
      startDate: schedule.startDate,
      endDate: schedule.endDate ?? undefined,
      active: schedule.active
    });
    setDrawerOpen(true);
    void loadPreview(schedule.id);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditing(null);
    setPreview(null);
    setRuns([]);
  };

  const handleDrawerTabChange = (key: string) => {
    setDrawerTab(key);
    if (!editing) return;
    if (key === 'apercu' && !preview) void loadPreview(editing.id);
    if (key === 'historique' && runs.length === 0) void loadRuns(editing.id);
  };

  const handleSubmit = async () => {
    if (!effectiveTenantId || !syndicId) return;
    let values: ScheduleFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    const payload: CreateChargeScheduleRequest = {
      label: values.label,
      frequency: values.frequency,
      issueDay: values.issueDay,
      dueOffsetDays: values.dueOffsetDays,
      amountSource: values.amountSource,
      budgetId: values.amountSource === 'BUDGET' ? values.budgetId || null : null,
      fixedAmount: values.amountSource === 'FIXED' ? (values.fixedAmount ?? null) : null,
      currency: values.currency || 'XOF',
      startDate: values.startDate,
      endDate: values.endDate || null,
      active: values.active
    };
    setSubmitting(true);
    try {
      if (editing) {
        await updateChargeSchedule(effectiveTenantId, syndicId, editing.id, payload);
        message.success(t('Programmation modifiée'));
      } else {
        await createChargeSchedule(effectiveTenantId, syndicId, payload);
        message.success(t('Programmation créée'));
      }
      closeDrawer();
      await loadData();
    } catch (err: any) {
      const fieldErrors: Array<{ field: string; message: string }> | undefined = err.response?.data?.errors;
      if (fieldErrors && fieldErrors.length > 0) {
        fieldErrors.forEach(fieldErr =>
          form.setFields([{ name: fieldErr.field as keyof ScheduleFormValues, errors: [fieldErr.message] }])
        );
      }
      message.error(err.response?.data?.error || t('Enregistrement de la programmation impossible'));
    } finally {
      setSubmitting(false);
    }
  };

  const handlePause = async (schedule: ChargeSchedule) => {
    if (!effectiveTenantId || !syndicId) return;
    setBusyId(schedule.id);
    try {
      await pauseChargeSchedule(effectiveTenantId, syndicId, schedule.id);
      message.success(t('Programmation mise en pause'));
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Mise en pause impossible'));
    } finally {
      setBusyId(null);
    }
  };

  const handleResume = async (schedule: ChargeSchedule) => {
    if (!effectiveTenantId || !syndicId) return;
    setBusyId(schedule.id);
    try {
      await resumeChargeSchedule(effectiveTenantId, syndicId, schedule.id);
      message.success(t('Programmation reprise'));
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Reprise impossible'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (schedule: ChargeSchedule) => {
    if (!effectiveTenantId || !syndicId) return;
    setBusyId(schedule.id);
    try {
      const result = await deleteChargeSchedule(effectiveTenantId, syndicId, schedule.id);
      message.success(
        result.deleted
          ? t('Programmation supprimée')
          : t('Des appels ont déjà été émis : la programmation a été désactivée plutôt que supprimée.')
      );
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Suppression impossible'));
    } finally {
      setBusyId(null);
    }
  };

  const handleExecute = (schedule: ChargeSchedule) => {
    confirmAction({
      title: t('Exécuter la programmation « {{label}} » maintenant ?', { label: schedule.label }),
      description: t(
        'La période due (ou en cours) sera émise immédiatement : appels de charges, imputation des avances, quittances et notifications. Une exécution déjà faite pour cette période ne recrée rien.'
      ),
      okText: t('Exécuter'),
      onConfirm: async () => {
        if (!effectiveTenantId || !syndicId) return;
        setBusyId(schedule.id);
        try {
          const result = await executeChargeScheduleNow(effectiveTenantId, syndicId, schedule.id);
          const { run } = result;
          if (run.status === 'FAILED') {
            message.error(
              t('Exécution en échec — {{period}} : {{error}}', {
                period: run.periodLabel,
                error: describeScheduleError(run.error) || t('Erreur inconnue.')
              })
            );
          } else if (run.alreadyProcessed || run.status === 'SKIPPED') {
            message.info(t('Période {{period}} déjà traitée : rien à créer.', { period: run.periodLabel }));
          } else {
            const counts = {
              period: run.periodLabel,
              created: run.callsCreated,
              covered: run.callsCovered,
              notified: run.notificationsSent,
              skipped: run.notificationsSkipped
            };
            // Deux appels à t() littéraux : l'extracteur ne lit pas un ternaire passé à t().
            message.success(
              run.notificationsSkipped > 0
                ? t(
                    "Exécution réussie — {{period}} : {{created}} appel(s) créé(s), {{covered}} couvert(s) par une avance, {{notified}} notification(s) envoyée(s), {{skipped}} avis non envoyé(s) (détail dans l'historique).",
                    counts
                  )
                : t(
                    'Exécution réussie — {{period}} : {{created}} appel(s) créé(s), {{covered}} couvert(s) par une avance, {{notified}} notification(s) envoyée(s).',
                    counts
                  )
            );
          }
          await loadData();
          if (editing?.id === schedule.id) void loadRuns(schedule.id);
        } catch (err: any) {
          message.error(err.response?.data?.error || t('Exécution impossible'));
        } finally {
          setBusyId(null);
        }
      }
    });
  };

  const columns: ColumnsType<ChargeSchedule> = [
    {
      title: t('Libellé'),
      dataIndex: 'label',
      key: 'label',
      render: (value: string, schedule) => (
        <Space direction="vertical" size={0}>
          <Text strong>{value}</Text>
          <Text type="secondary">{frequencyLabels[schedule.frequency]}</Text>
        </Space>
      )
    },
    {
      title: t('Source et montant'),
      key: 'source',
      render: (_, schedule) =>
        schedule.amountSource === 'FIXED' ? (
          <Space direction="vertical" size={0}>
            <Text>{amountSourceLabels.FIXED}</Text>
            <Text type="secondary">
              <MoneyValue value={schedule.fixedAmount ?? 0} currency={schedule.currency} />
            </Text>
          </Space>
        ) : (
          <Space direction="vertical" size={0}>
            <Text>{amountSourceLabels.BUDGET}</Text>
            <Text type="secondary">
              {schedule.budget ? `${schedule.budget.label} (${schedule.budget.fiscalYear})` : '—'}
            </Text>
          </Space>
        )
    },
    {
      title: t('Prochaine émission'),
      key: 'next',
      render: (_, schedule) =>
        schedule.nextPeriod ? (
          <Space direction="vertical" size={0}>
            <Text>{schedule.nextPeriod.label}</Text>
            <Text type="secondary">
              {t('Émission')} {formatDay(schedule.nextPeriod.issueDate)} · {t('Échéance')}{' '}
              {formatDay(schedule.nextPeriod.dueDate)}
            </Text>
          </Space>
        ) : (
          <Text type="secondary">{t('Aucune (fin de programmation atteinte)')}</Text>
        )
    },
    {
      title: t('Statut'),
      key: 'status',
      render: (_, schedule) =>
        schedule.active ? <Tag color="green">{t('Active')}</Tag> : <Tag color="default">{t('En pause')}</Tag>
    },
    {
      title: t('Dernière exécution'),
      key: 'lastRun',
      render: (_, schedule) =>
        schedule.lastRun ? (
          <Space direction="vertical" size={0}>
            <Tag color={runStatusConfig[schedule.lastRun.status].color}>
              {schedule.lastRun.periodLabel} · {runStatusConfig[schedule.lastRun.status].label}
            </Tag>
            {schedule.lastRun.error ? (
              <Text type="danger" style={{ fontSize: 12 }}>
                {describeScheduleError(schedule.lastRun.error)}
              </Text>
            ) : null}
            {schedule.lastRun.notificationsSkipped > 0 ? (
              <NotificationsSkipped count={schedule.lastRun.notificationsSkipped} notes={schedule.lastRun.notes} />
            ) : null}
          </Space>
        ) : (
          <Text type="secondary">{t('Aucune')}</Text>
        )
    },
    {
      title: t('Actions'),
      key: 'actions',
      render: (_, schedule) => (
        <Space size={4} wrap>
          <Button size="small" onClick={() => openEditDrawer(schedule)}>
            {t('Ouvrir')}
          </Button>
          <Button
            size="small"
            icon={<ThunderboltOutlined />}
            loading={busyId === schedule.id}
            disabled={!schedule.active}
            onClick={() => handleExecute(schedule)}
          >
            {t('Exécuter maintenant')}
          </Button>
          {schedule.active ? (
            <Button
              size="small"
              icon={<PauseCircleOutlined />}
              loading={busyId === schedule.id}
              onClick={() => void handlePause(schedule)}
            >
              {t('Pause')}
            </Button>
          ) : (
            <Button
              size="small"
              icon={<PlayCircleOutlined />}
              loading={busyId === schedule.id}
              onClick={() => void handleResume(schedule)}
            >
              {t('Reprise')}
            </Button>
          )}
          <ConfirmAction
            title={t('Supprimer la programmation « {{label}} » ?', { label: schedule.label })}
            description={t(
              "Si des appels ont déjà été émis, la programmation sera désactivée au lieu d'être supprimée."
            )}
            okText={t('Supprimer')}
            danger
            onConfirm={() => handleDelete(schedule)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} loading={busyId === schedule.id}>
              {t('Supprimer')}
            </Button>
          </ConfirmAction>
        </Space>
      )
    }
  ];

  const watchedAmountSource = Form.useWatch('amountSource', form);
  const watchedFrequency = Form.useWatch('frequency', form);

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <Space direction="vertical" size={4}>
            <Title level={2} style={{ margin: 0 }}>
              {t('Programmation des appels de charges')}
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {t(
                'Émission automatique et récurrente des appels de charges, avec imputation des avances et notification des copropriétaires.'
              )}
            </Paragraph>
          </Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateDrawer}>
            {t('Nouvelle programmation')}
          </Button>
        </div>

        {error ? <Alert type="error" message={error} showIcon /> : null}

        {loading ? (
          <div style={{ minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spin size="large" />
          </div>
        ) : (
          <Card>
            <Table
              rowKey="id"
              scroll={{ x: 'max-content' }}
              dataSource={schedules}
              columns={columns}
              pagination={{ pageSize: 10 }}
              locale={{ emptyText: t('Aucune programmation pour cette copropriété.') }}
            />
          </Card>
        )}
      </Space>

      <Drawer
        title={editing ? t('Programmation : {{label}}', { label: editing.label }) : t('Nouvelle programmation')}
        open={drawerOpen}
        onClose={closeDrawer}
        width={560}
        destroyOnHidden
        extra={
          <Button type="primary" loading={submitting} onClick={() => void handleSubmit()}>
            {editing ? t('Enregistrer') : t('Créer')}
          </Button>
        }
      >
        <Tabs
          activeKey={drawerTab}
          onChange={handleDrawerTabChange}
          items={[
            {
              key: 'form',
              label: t('Paramètres'),
              children: (
                <Form form={form} layout="vertical">
                  <Form.Item
                    label={t('Libellé')}
                    name="label"
                    rules={[{ required: true, message: t('Le libellé est obligatoire') }]}
                  >
                    <Input placeholder={t('Ex : Charges courantes trimestrielles')} />
                  </Form.Item>

                  <Form.Item
                    label={t('Fréquence')}
                    name="frequency"
                    rules={[{ required: true }]}
                    extra={
                      editing?.hasIssuedPeriods
                        ? t('Des périodes ont déjà été émises : la fréquence ne peut plus changer.')
                        : undefined
                    }
                  >
                    <Select
                      disabled={Boolean(editing?.hasIssuedPeriods)}
                      options={(Object.keys(frequencyLabels) as ChargeScheduleFrequency[]).map(value => ({
                        value,
                        label: frequencyLabels[value]
                      }))}
                    />
                  </Form.Item>

                  <Form.Item
                    label={t("Jour d'émission")}
                    name="issueDay"
                    rules={[{ required: true, message: t("Le jour d'émission est obligatoire") }]}
                    extra={t(
                      "Le jour d'émission est le jour du premier mois de chaque période (1 à 28, pour rester valable tous les mois)."
                    )}
                  >
                    <InputNumber min={1} max={28} style={{ width: '100%' }} />
                  </Form.Item>

                  <Form.Item
                    label={t('Délai avant échéance (jours)')}
                    name="dueOffsetDays"
                    rules={[{ required: true, message: t('Le délai est obligatoire') }]}
                    extra={t("Nombre de jours entre l'émission de l'appel et sa date d'échéance.")}
                  >
                    <InputNumber min={0} max={365} style={{ width: '100%' }} />
                  </Form.Item>

                  <Form.Item label={t('Source du montant')} name="amountSource" rules={[{ required: true }]}>
                    <Select
                      options={(Object.keys(amountSourceLabels) as ChargeScheduleAmountSource[]).map(value => ({
                        value,
                        label: amountSourceLabels[value]
                      }))}
                    />
                  </Form.Item>

                  {watchedAmountSource === 'BUDGET' ? (
                    <Form.Item
                      label={t('Budget')}
                      name="budgetId"
                      rules={[{ required: true, message: t('Choisissez un budget approuvé') }]}
                      extra={t(
                        "Seuls les budgets APPROUVÉS de la copropriété apparaissent : chaque exécution reprend le budget approuvé de l'exercice au moment de l'émission."
                      )}
                    >
                      <Select
                        showSearch
                        optionFilterProp="label"
                        placeholder={t('Budget approuvé de l’exercice')}
                        options={approvedBudgetOptions}
                        notFoundContent={t('Aucun budget approuvé pour cette copropriété.')}
                      />
                    </Form.Item>
                  ) : (
                    <Form.Item
                      label={t('Montant fixe')}
                      name="fixedAmount"
                      rules={[{ required: true, message: t('Le montant fixe est obligatoire') }]}
                      extra={t(
                        'Montant fixe réparti par tantièmes entre les lots principaux (appartements, bureaux, locaux commerciaux).'
                      )}
                    >
                      <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>
                  )}

                  <Form.Item
                    label={t('Devise')}
                    name="currency"
                    rules={[{ required: true, message: t('La devise est obligatoire') }]}
                  >
                    <Input />
                  </Form.Item>

                  <Form.Item
                    label={t('Date de début')}
                    name="startDate"
                    rules={[{ required: true, message: t('La date de début est obligatoire') }]}
                    extra={
                      editing?.hasIssuedPeriods
                        ? t('Des périodes ont déjà été émises : la date de début ne peut plus changer.')
                        : undefined
                    }
                  >
                    <Input type="date" disabled={Boolean(editing?.hasIssuedPeriods)} />
                  </Form.Item>

                  <Form.Item label={t('Date de fin (optionnelle)')} name="endDate">
                    <Input type="date" />
                  </Form.Item>

                  <Form.Item
                    label={t('Active')}
                    name="active"
                    tooltip={t('Une programmation en pause ne génère plus rien, mais garde son historique.')}
                  >
                    <Select
                      options={[
                        { value: true, label: t('Active') },
                        { value: false, label: t('En pause') }
                      ]}
                    />
                  </Form.Item>
                </Form>
              )
            },
            {
              key: 'apercu',
              label: t('Aperçu'),
              disabled: !editing,
              children: (
                <SchedulePreviewPanel
                  preview={preview}
                  loading={previewLoading}
                  currency={editing?.currency}
                  frequency={watchedFrequency}
                />
              )
            },
            {
              key: 'historique',
              label: (
                <span>
                  <HistoryOutlined /> {t('Historique')}
                </span>
              ),
              disabled: !editing,
              children: <ScheduleRunsPanel runs={runs} loading={runsLoading} />
            }
          ]}
        />
      </Drawer>
    </>
  );
};

const SchedulePreviewPanel: React.FC<{
  preview: ChargeSchedulePreview | null;
  loading: boolean;
  currency?: string;
  frequency?: ChargeScheduleFrequency;
}> = ({ preview, loading, currency }) => {
  if (loading) {
    return (
      <div style={{ minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin />
      </div>
    );
  }
  if (!preview || preview.periods.length === 0) {
    return <Alert type="info" showIcon message={t('Aucune période à venir pour cette programmation.')} />;
  }
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {preview.periods.map(period => (
        <Card key={`${period.periodStart}-${period.periodEnd}`} size="small" title={period.label}>
          <Descriptions column={1} size="small">
            <Descriptions.Item label={t('Émission')}>{formatDay(period.issueDate)}</Descriptions.Item>
            <Descriptions.Item label={t('Échéance')}>{formatDay(period.dueDate)}</Descriptions.Item>
            <Descriptions.Item label={t('Montant total')}>
              {period.error ? (
                <Text type="danger">{period.error}</Text>
              ) : (
                <MoneyValue value={period.totalAmount ?? 0} currency={period.currency || currency} />
              )}
            </Descriptions.Item>
          </Descriptions>
          {!period.error && period.lots.length > 0 ? (
            <Table
              style={{ marginTop: 12 }}
              size="small"
              rowKey="lotId"
              dataSource={period.lots}
              pagination={{ pageSize: 5, hideOnSinglePage: true }}
              columns={[
                { title: t('Lot'), dataIndex: 'lotNumber' },
                {
                  title: t('Montant'),
                  dataIndex: 'amount',
                  align: 'end',
                  render: (value: number) => <MoneyValue value={value} currency={period.currency || currency} />
                }
              ]}
            />
          ) : null}
        </Card>
      ))}
    </Space>
  );
};

const ScheduleRunsPanel: React.FC<{ runs: ChargeScheduleRun[]; loading: boolean }> = ({ runs, loading }) => (
  <Table
    rowKey="id"
    loading={loading}
    dataSource={runs}
    pagination={{ pageSize: 10 }}
    locale={{ emptyText: t('Aucune exécution enregistrée.') }}
    columns={[
      { title: t('Période'), dataIndex: 'periodLabel' },
      {
        title: t('Statut'),
        dataIndex: 'status',
        render: (value: ChargeScheduleRun['status']) => (
          <Tag color={runStatusConfig[value].color}>{runStatusConfig[value].label}</Tag>
        )
      },
      {
        title: t('Déclenchement'),
        dataIndex: 'trigger',
        render: (value: ChargeScheduleRun['trigger']) => runTriggerLabels[value]
      },
      { title: t('Appels créés'), dataIndex: 'callsCreated', align: 'end' },
      { title: t('Couverts'), dataIndex: 'callsCovered', align: 'end' },
      { title: t('Notifications'), dataIndex: 'notificationsSent', align: 'end' },
      {
        title: t('Avis non envoyés'),
        key: 'notificationsSkipped',
        align: 'end',
        render: (_, run) => <NotificationsSkipped count={run.notificationsSkipped} notes={run.notes} />
      },
      {
        title: t('Date'),
        dataIndex: 'createdAt',
        render: (value: string) => dayjs(value).format(dateFormat('short'))
      },
      {
        title: t('Erreur'),
        dataIndex: 'error',
        render: (value: string | null) => {
          const label = describeScheduleError(value);
          return label ? <Text type="danger">{label}</Text> : '—';
        }
      }
    ]}
  />
);
