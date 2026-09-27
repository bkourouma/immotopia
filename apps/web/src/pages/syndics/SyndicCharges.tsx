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
  Typography
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { ChargeCallTable } from '../../components/syndics/ChargeCallTable';
import { LotPaymentModal } from '../../components/syndics/LotPaymentModal';
import { MoneyValue, StatCard } from '../../components/primitives';
import { createChargeCall, getSyndicate, listChargeCalls, listSyndicateLots } from '../../services/syndic-service';
import { downloadChargeCallNotice } from '../../services/syndic-charge-schedule-service';
import {
  ChargeCall,
  ChargeCallStatus,
  CreateChargeCallRequest,
  LotPaymentResult,
  Syndicate,
  SyndicateLot
} from '../../types/syndic-types';
import { useSyndicRouteContext } from './useSyndicRouteContext';
import { formatLotLabel } from '../../utils/syndic-lot-label';
import { t } from '../../i18n/t';

const { Paragraph, Title } = Typography;

const statusOptions: Array<{ label: string; value: ChargeCallStatus }> = [
  { label: t('En attente'), value: 'PENDING' },
  { label: t('Partiel'), value: 'PARTIAL' },
  { label: t('Payé'), value: 'PAID' },
  { label: t('En retard'), value: 'OVERDUE' }
];

const targetModeOptions = [
  { label: t('Un lot'), value: 'single' },
  { label: t('Plusieurs lots'), value: 'multiple' },
  { label: t('Tous les lots'), value: 'all' }
];

const recurrenceFrequencyOptions = [
  { label: t('Mensuelle'), value: 'MONTHLY' },
  { label: t('Trimestrielle'), value: 'QUARTERLY' },
  { label: t('Annuelle'), value: 'ANNUAL' }
];

export const SyndicCharges: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId: effectiveTenantId, syndicId } = useSyndicRouteContext();

  const [syndicate, setSyndicate] = useState<Syndicate | null>(null);
  const [lots, setLots] = useState<SyndicateLot[]>([]);
  const [charges, setCharges] = useState<ChargeCall[]>([]);
  const [statusFilter, setStatusFilter] = useState<ChargeCallStatus | undefined>(undefined);
  const [periodFilter, setPeriodFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  // Lot S2 : la modale de paiement travaille PAR LOT. `paymentContext` porte
  // le lot et, si elle a été ouverte depuis un dossier précis, l'appel à
  // pré-cocher ; `paymentOpen` seul (sans lot) ouvre la modale en demandant
  // au gestionnaire de choisir le lot lui-même.
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentContext, setPaymentContext] = useState<{ lotId?: string; chargeCallId?: string }>({});

  useEffect(() => {
    if (!effectiveTenantId || !syndicId) {
      setLoading(false);
      setError(t('Paramètres charges manquants'));
      return;
    }
    void loadBaseData();
  }, [effectiveTenantId, syndicId]);

  useEffect(() => {
    if (!effectiveTenantId || !syndicId) {
      return;
    }
    void loadCharges();
  }, [effectiveTenantId, syndicId, statusFilter, periodFilter]);

  const loadBaseData = async () => {
    if (!effectiveTenantId || !syndicId) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [syndicateData, lotData] = await Promise.all([
        getSyndicate(effectiveTenantId, syndicId),
        listSyndicateLots(effectiveTenantId, syndicId)
      ]);
      setSyndicate(syndicateData);
      setLots(lotData);
    } catch (err: any) {
      setError(err.response?.data?.error || t('Impossible de charger la page charges'));
    } finally {
      setLoading(false);
    }
  };

  const loadCharges = async () => {
    if (!effectiveTenantId || !syndicId) {
      return;
    }

    try {
      const data = await listChargeCalls(effectiveTenantId, syndicId, {
        status: statusFilter,
        period: periodFilter || undefined
      });
      setCharges(data);
    } catch (err: any) {
      setError(err.response?.data?.error || t('Impossible de charger les appels de charges'));
    }
  };

  const summary = useMemo(() => {
    const total = charges.reduce((sum, charge) => sum + Number(charge.amount), 0);
    const overdue = charges.filter(charge => charge.status === 'OVERDUE').length;
    const pending = charges.filter(charge => charge.status === 'PENDING' || charge.status === 'PARTIAL').length;
    return { total, overdue, pending };
  }, [charges]);

  const lotSelectOptions = useMemo(
    () =>
      lots.map(lot => ({
        value: lot.id,
        label: formatLotLabel(lot)
      })),
    [lots]
  );

  const handleCreate = async () => {
    if (!effectiveTenantId || !syndicId) {
      return;
    }

    const values = await form.validateFields();
    const targetMode = values.targetMode as 'single' | 'multiple' | 'all';
    // Lot S2 : les bornes de période sont désormais facultatives (les deux ou
    // aucune). Quand elles sont renseignées et que le libellé n'a pas été
    // saisi à la main, on le préremplit comme avant (compatibilité du format
    // existant) ; sans bornes, le libellé doit être saisi.
    const periodStart = values.periodStart ? dayjs(values.periodStart).format('YYYY-MM-DD') : undefined;
    const periodEnd = values.periodEnd ? dayjs(values.periodEnd).format('YYYY-MM-DD') : undefined;
    const period: string =
      (values.period && String(values.period).trim()) ||
      (periodStart && periodEnd ? `${periodStart} au ${periodEnd}` : '');
    const payload: CreateChargeCallRequest = {
      lotId: targetMode === 'single' ? values.lotId : undefined,
      lotIds: targetMode === 'multiple' ? values.lotIds : undefined,
      applyToAllLots: targetMode === 'all',
      period,
      periodStart,
      periodEnd,
      amount: values.amount,
      currency: values.currency || 'XOF',
      dueDate: values.dueDate.toISOString(),
      isRecurring: Boolean(values.isRecurring),
      recurrenceFrequency: values.isRecurring ? values.recurrenceFrequency : undefined,
      recurrenceCount: values.isRecurring ? values.recurrenceCount : undefined
    };

    setSubmitting(true);
    try {
      const result = await createChargeCall(effectiveTenantId, syndicId, payload);
      const createdCount = 'totalCreated' in result ? result.totalCreated : 1;
      message.success(
        createdCount > 1
          ? t('{{createdCount}} appels de charges créés', { createdCount: createdCount })
          : t('Appel de charges créé')
      );
      setOpen(false);
      form.resetFields();
      await loadCharges();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Création impossible'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadNotice = async (charge: ChargeCall) => {
    if (!effectiveTenantId || !syndicId) return;
    try {
      await downloadChargeCallNotice(effectiveTenantId, syndicId, charge.id);
    } catch (err: any) {
      message.error(err.response?.data?.error || t("Téléchargement de l'avis d'appel impossible"));
    }
  };

  const handleOpenPaymentForCharge = (charge: ChargeCall) => {
    setPaymentContext({ lotId: charge.lotId, chargeCallId: charge.id });
    setPaymentOpen(true);
  };

  const handleOpenPaymentGeneric = () => {
    setPaymentContext({});
    setPaymentOpen(true);
  };

  const handlePaymentRecorded = (result: LotPaymentResult) => {
    setPaymentOpen(false);
    const settledCount = result.allocations.filter(item => item.callStatusAfter === 'PAID').length;
    message.success(
      settledCount > 0
        ? t('Paiement enregistré : {{settledCount}} appel(s) soldé(s), avance de {{advance}}', {
            settledCount,
            advance: new Intl.NumberFormat('fr-FR').format(result.lotAdvanceBalance)
          })
        : t('Paiement enregistré : avance de {{advance}}', {
            advance: new Intl.NumberFormat('fr-FR').format(result.lotAdvanceBalance)
          })
    );
    void loadCharges();
  };

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <Space direction="vertical" size={4}>
            <Title level={2} style={{ margin: 0 }}>
              {t('Charges de')} {syndicate?.name || t('la copropriété')}
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {t('Suivez les appels de charges, les échéances et les impayés.')}
            </Paragraph>
          </Space>

          <Space>
            <Button onClick={handleOpenPaymentGeneric} disabled={lots.length === 0}>
              {t('Enregistrer un paiement')}
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)} disabled={lots.length === 0}>
              {t('Nouvel appel de charges')}
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
              <Col xs={24} md={8}>
                <StatCard label={t('Montant appelé')} value={<MoneyValue value={summary.total} />} />
              </Col>
              <Col xs={24} md={8}>
                <StatCard label={t('Dossiers en attente')} value={summary.pending} />
              </Col>
              <Col xs={24} md={8}>
                <StatCard
                  label={t('Dossiers en retard')}
                  value={summary.overdue}
                  tone={summary.overdue > 0 ? 'danger' : 'neutral'}
                />
              </Col>
            </Row>

            <Card>
              <Space wrap size={12}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  allowClear
                  style={{ minWidth: 210 }}
                  placeholder={t('Filtrer par statut')}
                  value={statusFilter}
                  onChange={value => setStatusFilter(value)}
                  options={statusOptions}
                />
                <Input
                  allowClear
                  style={{ minWidth: 220 }}
                  placeholder={t('Filtrer par periode (ex: 2026-Q1)')}
                  value={periodFilter}
                  onChange={event => setPeriodFilter(event.target.value)}
                />
              </Space>
            </Card>

            <Card title={t('Liste des appels de charges')}>
              <ChargeCallTable
                items={charges}
                onRecordPayment={handleOpenPaymentForCharge}
                onDownloadNotice={charge => void handleDownloadNotice(charge)}
              />
            </Card>
          </>
        )}
      </Space>

      <Modal
        title={t('Créer un appel de charges')}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => void handleCreate()}
        okText={t('Créer')}
        cancelText={t('Annuler')}
        confirmLoading={submitting}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            currency: 'XOF',
            targetMode: 'single',
            isRecurring: false,
            recurrenceFrequency: 'MONTHLY',
            recurrenceCount: 1
          }}
        >
          <Form.Item
            label={t('Cible')}
            name="targetMode"
            rules={[{ required: true, message: t('La cible est obligatoire') }]}
          >
            <Select showSearch optionFilterProp="label" options={targetModeOptions} />
          </Form.Item>

          <Form.Item noStyle dependencies={['targetMode']}>
            {({ getFieldValue }) =>
              getFieldValue('targetMode') === 'single' ? (
                <Form.Item
                  label={t('Lot')}
                  name="lotId"
                  rules={[{ required: true, message: t('Le lot est obligatoire') }]}
                >
                  <Select showSearch optionFilterProp="label" options={lotSelectOptions} />
                </Form.Item>
              ) : null
            }
          </Form.Item>

          <Form.Item noStyle dependencies={['targetMode']}>
            {({ getFieldValue }) =>
              getFieldValue('targetMode') === 'multiple' ? (
                <Form.Item
                  label={t('Lots')}
                  name="lotIds"
                  rules={[{ required: true, message: t('Sélectionnez au moins un lot') }]}
                >
                  <Select mode="multiple" showSearch optionFilterProp="label" options={lotSelectOptions} />
                </Form.Item>
              ) : null
            }
          </Form.Item>

          <Form.Item
            label={t('Libellé de la période')}
            name="period"
            dependencies={['periodStart', 'periodEnd']}
            tooltip={t(
              'Facultatif si vous renseignez les deux dates ci-dessous : le libellé est alors composé automatiquement.'
            )}
            rules={[
              {
                validator: (_rule, value) => {
                  const hasLabel = Boolean(value && String(value).trim());
                  const hasBounds = Boolean(form.getFieldValue('periodStart') && form.getFieldValue('periodEnd'));
                  if (!hasLabel && !hasBounds) {
                    return Promise.reject(
                      new Error(t('Saisissez un libellé de période ou les deux dates de début et de fin'))
                    );
                  }
                  return Promise.resolve();
                }
              }
            ]}
          >
            <Input placeholder={t('ex : 2026-Q1')} />
          </Form.Item>

          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item label={t('Début de période (optionnel)')} name="periodStart">
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label={t('Fin de période (optionnel)')}
                name="periodEnd"
                dependencies={['periodStart']}
                rules={[
                  {
                    validator: (_rule, value) => {
                      const start = form.getFieldValue('periodStart');
                      if (Boolean(start) !== Boolean(value)) {
                        return Promise.reject(new Error(t('Les deux dates de période vont ensemble, ou aucune')));
                      }
                      return Promise.resolve();
                    }
                  }
                ]}
              >
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item
                label={t('Montant')}
                name="amount"
                rules={[{ required: true, message: t('Le montant est obligatoire') }]}
              >
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label={t('Devise')}
                name="currency"
                rules={[{ required: true, message: t('La devise est obligatoire') }]}
              >
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label={t("Date d'échéance")}
            name="dueDate"
            rules={[{ required: true, message: t('La date est obligatoire') }]}
          >
            <DatePicker
              style={{ width: '100%' }}
              format="DD/MM/YYYY"
              disabledDate={current => current && current < dayjs().startOf('day')}
            />
          </Form.Item>

          <Form.Item label={t('Charge récurrente')} name="isRecurring">
            <Select
              showSearch
              optionFilterProp="label"
              options={[
                { label: 'Non', value: false },
                { label: 'Oui', value: true }
              ]}
            />
          </Form.Item>

          <Form.Item noStyle dependencies={['isRecurring']}>
            {({ getFieldValue }) =>
              getFieldValue('isRecurring') ? (
                <Row gutter={12}>
                  <Col xs={24} md={12}>
                    <Form.Item
                      label={t('Fréquence')}
                      name="recurrenceFrequency"
                      rules={[{ required: true, message: t('La fréquence est obligatoire') }]}
                    >
                      <Select showSearch optionFilterProp="label" options={recurrenceFrequencyOptions} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item
                      label={t('Occurrences')}
                      name="recurrenceCount"
                      rules={[{ required: true, message: t('Le nombre d occurrences est obligatoire') }]}
                    >
                      <InputNumber min={1} max={24} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                </Row>
              ) : null
            }
          </Form.Item>
        </Form>
      </Modal>

      {effectiveTenantId && syndicId ? (
        <LotPaymentModal
          open={paymentOpen}
          tenantId={effectiveTenantId}
          syndicId={syndicId}
          lots={lots}
          initialLotId={paymentContext.lotId}
          initialChargeCallId={paymentContext.chargeCallId}
          onClose={() => setPaymentOpen(false)}
          onRecorded={handlePaymentRecorded}
        />
      ) : null}
    </>
  );
};
