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
import { formatMoney, MoneyValue, StatCard } from '../../components/primitives';
import {
  createChargeCall,
  getSyndicate,
  listChargeCalls,
  listSyndicateLots,
  recordChargePayment
} from '../../services/syndic-service';
import {
  ChargeCall,
  ChargeCallStatus,
  CreateChargeCallRequest,
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

// FR-005 : modes de paiement acceptes pour un appel de charges. Le paiement en
// ligne n'y figure jamais — voir docs/recette/SCENARIO_SYNDIC_MODULES.md,
// regle absolue n°1 (compte PaySecureHub de recette en mode LIVE).
const paymentMethodOptions = [
  { label: t('Espèces'), value: 'ESPECES' },
  { label: t('Virement'), value: 'VIREMENT' },
  { label: t('Chèque'), value: 'CHEQUE' },
  { label: t('Mobile money'), value: 'MOBILE_MONEY' }
];

function computeChargePaid(charge: ChargeCall): number {
  return (charge.payments || []).reduce((sum, payment) => sum + Number(payment.amount), 0);
}

function computeChargeOutstanding(charge: ChargeCall): number {
  return Math.max(0, Number(charge.amount) - computeChargePaid(charge));
}

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

  const [paymentTarget, setPaymentTarget] = useState<ChargeCall | null>(null);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentForm] = Form.useForm();

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
    const periodStart = values.periodStart ? dayjs(values.periodStart).format('YYYY-MM-DD') : '';
    const periodEnd = values.periodEnd ? dayjs(values.periodEnd).format('YYYY-MM-DD') : '';
    const payload: CreateChargeCallRequest = {
      lotId: targetMode === 'single' ? values.lotId : undefined,
      lotIds: targetMode === 'multiple' ? values.lotIds : undefined,
      applyToAllLots: targetMode === 'all',
      period: `${periodStart} au ${periodEnd}`,
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

  const paymentOutstanding = useMemo(
    () => (paymentTarget ? computeChargeOutstanding(paymentTarget) : 0),
    [paymentTarget]
  );

  const handleOpenPayment = (charge: ChargeCall) => {
    setPaymentTarget(charge);
    paymentForm.resetFields();
    paymentForm.setFieldsValue({ paidAt: dayjs(), method: 'VIREMENT' });
  };

  const handleRecordPayment = async () => {
    if (!effectiveTenantId || !syndicId || !paymentTarget) {
      return;
    }

    let values: { amount: number; paidAt: dayjs.Dayjs; method: string; reference?: string };
    try {
      values = await paymentForm.validateFields();
    } catch {
      // Le formulaire affiche deja l'erreur sous le champ concerne (ex. « Le
      // montant depasse le reste du ») : rien d'autre a faire ici.
      return;
    }
    setPaymentSubmitting(true);
    try {
      await recordChargePayment(effectiveTenantId, syndicId, paymentTarget.id, {
        amount: values.amount,
        paidAt: values.paidAt.toISOString(),
        method: values.method,
        reference: values.reference || undefined
      });
      message.success(t('Paiement enregistré'));
      setPaymentTarget(null);
      await loadCharges();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Enregistrement du paiement impossible'));
    } finally {
      setPaymentSubmitting(false);
    }
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

          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)} disabled={lots.length === 0}>
            {t('Nouvel appel de charges')}
          </Button>
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
              <ChargeCallTable items={charges} onRecordPayment={handleOpenPayment} />
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

          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item
                label={t('Date de début')}
                name="periodStart"
                rules={[{ required: true, message: t('La date de début est obligatoire') }]}
              >
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label={t('Date de fin')}
                name="periodEnd"
                rules={[{ required: true, message: t('La date de fin est obligatoire') }]}
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

      <Modal
        title={t('Enregistrer un paiement')}
        open={Boolean(paymentTarget)}
        onCancel={() => setPaymentTarget(null)}
        onOk={() => void handleRecordPayment()}
        okText={t('Enregistrer')}
        cancelText={t('Annuler')}
        confirmLoading={paymentSubmitting}
      >
        {paymentTarget ? (
          <Paragraph type="secondary">
            {t('Reste à payer')} : <MoneyValue value={paymentOutstanding} />
          </Paragraph>
        ) : null}
        <Form form={paymentForm} layout="vertical">
          <Form.Item
            label={t('Montant')}
            name="amount"
            rules={[
              { required: true, message: t('Le montant est obligatoire') },
              {
                // Constat de recette (module 7) : `InputNumber max` plafonne
                // silencieusement la valeur saisie a la perte de focus — une
                // saisie de 250 000 sur un reste dû de 200 000 partait donc
                // avec 200 000 sans que personne ne le remarque, alors que
                // l'agence croyait avoir encaissé le montant saisi. Un
                // validateur qui bloque l'envoi avec un message explicite
                // remplace ce plafond muet ; l'API reste le dernier rempart
                // (422) si ce contrôle était contourné.
                validator: (_rule, value) => {
                  if (typeof value === 'number' && value > paymentOutstanding) {
                    return Promise.reject(
                      new Error(t('Le montant dépasse le reste dû ({{value}})', { value: formatMoney(paymentOutstanding) }))
                    );
                  }
                  return Promise.resolve();
                }
              }
            ]}
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label={t('Date de paiement')}
            name="paidAt"
            rules={[{ required: true, message: t('La date est obligatoire') }]}
          >
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item
            label={t('Mode de paiement')}
            name="method"
            rules={[{ required: true, message: t('Le mode de paiement est obligatoire') }]}
          >
            <Select showSearch optionFilterProp="label" options={paymentMethodOptions} />
          </Form.Item>
          <Form.Item label={t('Référence (optionnel)')} name="reference">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};
