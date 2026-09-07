import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
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
  Typography,
  message,
} from 'antd';
import { ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
import { ChargeCallTable } from '../../components/syndics/ChargeCallTable';
import { createChargeCall, getSyndicate, listChargeCalls, listSyndicateLots } from '../../services/syndic-service';
import { ChargeCall, ChargeCallStatus, CreateChargeCallRequest, Syndicate, SyndicateLot } from '../../types/syndic-types';
import { useSyndicRouteContext } from './useSyndicRouteContext';

const { Paragraph, Title } = Typography;

const statusOptions: Array<{ label: string; value: ChargeCallStatus }> = [
  { label: 'En attente', value: 'PENDING' },
  { label: 'Partiel', value: 'PARTIAL' },
  { label: 'Paye', value: 'PAID' },
  { label: 'En retard', value: 'OVERDUE' },
];

const targetModeOptions = [
  { label: 'Un lot', value: 'single' },
  { label: 'Plusieurs lots', value: 'multiple' },
  { label: 'Tous les lots', value: 'all' },
];

const recurrenceFrequencyOptions = [
  { label: 'Mensuelle', value: 'MONTHLY' },
  { label: 'Trimestrielle', value: 'QUARTERLY' },
  { label: 'Annuelle', value: 'ANNUAL' },
];

const lotTypeLabels: Record<SyndicateLot['lotType'], string> = {
  APARTMENT: 'Appartement',
  PARKING: 'Parking',
  CELLAR: 'Cave',
  OFFICE: 'Bureau',
  COMMERCIAL: 'Commerce',
  OTHER: 'Autre',
};

function buildPropertyNomenclatureFromLot(lot: SyndicateLot): string {
  const property = lot.property;
  if (!property) {
    return 'Bien non lié';
  }

  const ownerLabel = property.owner?.fullName?.trim() || '';
  const title = property.title?.trim() || property.internalReference || property.id || 'Sans libellé';
  return ownerLabel ? `${ownerLabel} - ${title}` : title;
}

export const SyndicCharges: React.FC = () => {
  const { tenantId: effectiveTenantId, syndicId } = useSyndicRouteContext();
  const navigate = useNavigate();

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

  useEffect(() => {
    if (!effectiveTenantId || !syndicId) {
      setLoading(false);
      setError('Paramètres charges manquants');
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
        listSyndicateLots(effectiveTenantId, syndicId),
      ]);
      setSyndicate(syndicateData);
      setLots(lotData);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Impossible de charger la page charges');
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
        period: periodFilter || undefined,
      });
      setCharges(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Impossible de charger les appels de charges');
    }
  };

  const summary = useMemo(() => {
    const total = charges.reduce((sum, charge) => sum + Number(charge.amount), 0);
    const overdue = charges.filter((charge) => charge.status === 'OVERDUE').length;
    const pending = charges.filter((charge) => charge.status === 'PENDING' || charge.status === 'PARTIAL').length;
    return { total, overdue, pending };
  }, [charges]);

  const lotSelectOptions = useMemo(
    () =>
      lots.map((lot) => ({
        value: lot.id,
        label: `${buildPropertyNomenclatureFromLot(lot)} (${lotTypeLabels[lot.lotType]})`,
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
      recurrenceCount: values.isRecurring ? values.recurrenceCount : undefined,
    };

    setSubmitting(true);
    try {
      const result = await createChargeCall(effectiveTenantId, syndicId, payload);
      const createdCount = 'totalCreated' in result ? result.totalCreated : 1;
      message.success(createdCount > 1 ? `${createdCount} appels de charges créés` : 'Appel de charges créé');
      setOpen(false);
      form.resetFields();
      await loadCharges();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Création impossible');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
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
              Charges de {syndicate?.name || 'la copropriété'}
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              Suivez les appels de charges, les échéances et les impayés.
            </Paragraph>
          </Space>

          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)} disabled={lots.length === 0}>
            Nouvel appel de charges
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
                <Card>
                  <Statistic title="Montant appele" value={summary.total} suffix="XOF" precision={0} />
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card>
                  <Statistic title="Dossiers en attente" value={summary.pending} />
                </Card>
              </Col>
              <Col xs={24} md={8}>
                <Card>
                  <Statistic title="Dossiers en retard" value={summary.overdue} />
                </Card>
              </Col>
            </Row>

            <Card>
              <Space wrap size={12}>
                <Select
                  allowClear
                  style={{ minWidth: 210 }}
                  placeholder="Filtrer par statut"
                  value={statusFilter}
                  onChange={(value) => setStatusFilter(value)}
                  options={statusOptions}
                />
                <Input
                  allowClear
                  style={{ minWidth: 220 }}
                  placeholder="Filtrer par periode (ex: 2026-Q1)"
                  value={periodFilter}
                  onChange={(event) => setPeriodFilter(event.target.value)}
                />
              </Space>
            </Card>

            <Card title="Liste des appels de charges">
              <ChargeCallTable items={charges} />
            </Card>
          </>
        )}
      </Space>

      <Modal
        title="Créer un appel de charges"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => void handleCreate()}
        okText="Créer"
        cancelText="Annuler"
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
            recurrenceCount: 1,
          }}
        >
          <Form.Item label="Cible" name="targetMode" rules={[{ required: true, message: 'La cible est obligatoire' }]}>
            <Select
              options={targetModeOptions}
            />
          </Form.Item>

          <Form.Item noStyle dependencies={['targetMode']}>
            {({ getFieldValue }) =>
              getFieldValue('targetMode') === 'single' ? (
                <Form.Item label="Lot" name="lotId" rules={[{ required: true, message: 'Le lot est obligatoire' }]}>
                  <Select
                    showSearch
                    optionFilterProp="label"
                  options={lotSelectOptions}
                  />
                </Form.Item>
              ) : null
            }
          </Form.Item>

          <Form.Item noStyle dependencies={['targetMode']}>
            {({ getFieldValue }) =>
              getFieldValue('targetMode') === 'multiple' ? (
                <Form.Item
                  label="Lots"
                  name="lotIds"
                  rules={[{ required: true, message: 'Sélectionnez au moins un lot' }]}
                >
                  <Select
                    mode="multiple"
                    showSearch
                    optionFilterProp="label"
                    options={lotSelectOptions}
                  />
                </Form.Item>
              ) : null
            }
          </Form.Item>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                label="Date de début"
                name="periodStart"
                rules={[{ required: true, message: 'La date de début est obligatoire' }]}
              >
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Date de fin"
                name="periodEnd"
                rules={[{ required: true, message: 'La date de fin est obligatoire' }]}
              >
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="Montant" name="amount" rules={[{ required: true, message: 'Le montant est obligatoire' }]}>
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Devise" name="currency" rules={[{ required: true, message: 'La devise est obligatoire' }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="Date d'échéance" name="dueDate" rules={[{ required: true, message: 'La date est obligatoire' }]}>
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" disabledDate={(current) => current && current < dayjs().startOf('day')} />
          </Form.Item>

          <Form.Item label="Charge récurrente" name="isRecurring">
            <Select options={[{ label: 'Non', value: false }, { label: 'Oui', value: true }]} />
          </Form.Item>

          <Form.Item noStyle dependencies={['isRecurring']}>
            {({ getFieldValue }) =>
              getFieldValue('isRecurring') ? (
                <Row gutter={12}>
                  <Col span={12}>
                    <Form.Item
                      label="Fréquence"
                      name="recurrenceFrequency"
                      rules={[{ required: true, message: 'La fréquence est obligatoire' }]}
                    >
                      <Select options={recurrenceFrequencyOptions} />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      label="Occurrences"
                      name="recurrenceCount"
                      rules={[{ required: true, message: 'Le nombre d occurrences est obligatoire' }]}
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
    </DashboardLayout>
  );
};

