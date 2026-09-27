import React, { useEffect, useMemo, useState } from 'react';
import {
  App,
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography
} from 'antd';
import { CheckOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { formatMoney, MoneyValue } from '../../components/primitives';
import {
  createBudget,
  createChargeCallBatch,
  generateBudgetChargeCalls,
  listBudgets,
  listChargeCallBatches,
  listSyndicateLots,
  recomputeBudgetAllocations,
  updateBudget
} from '../../services/syndic-service';
import { BudgetAllocation, ChargeCallBatch, SyndicateBudget, SyndicateLot } from '../../types/syndic-types';
import { useSyndicRouteContext } from './useSyndicRouteContext';
import { formatLotLabel } from '../../utils/syndic-lot-label';
import { t } from '../../i18n/t';

const { Paragraph, Title } = Typography;

const batchTypeLabels: Record<ChargeCallBatch['batchType'], string> = {
  REGULAR: t('Régulier'),
  EXCEPTIONAL: 'Exceptionnel'
};

const batchStatusLabels: Record<ChargeCallBatch['status'], string> = {
  DRAFT: 'Brouillon',
  SENT: t('Envoyé'),
  CLOSED: t('Clôturé')
};

function buildLotDisplayName(allocation: BudgetAllocation, lotDirectoryEntry?: SyndicateLot): string {
  const lot = allocation.lot || lotDirectoryEntry;
  return formatLotLabel(lot, allocation.lotId);
}

export const SyndicBudgets: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId: effectiveTenantId, syndicId } = useSyndicRouteContext();

  const [budgets, setBudgets] = useState<SyndicateBudget[]>([]);
  const [batches, setBatches] = useState<ChargeCallBatch[]>([]);
  const [lots, setLots] = useState<SyndicateLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBudget, setSelectedBudget] = useState<SyndicateBudget | null>(null);
  const [allocationBudgetLabel, setAllocationBudgetLabel] = useState<string | null>(null);
  const [allocationRows, setAllocationRows] = useState<BudgetAllocation[]>([]);

  const [openBudgetModal, setOpenBudgetModal] = useState(false);
  const [openGenerateModal, setOpenGenerateModal] = useState(false);
  const [openBatchModal, setOpenBatchModal] = useState(false);

  const [budgetForm] = Form.useForm();
  const [generateForm] = Form.useForm();
  const [batchForm] = Form.useForm();

  useEffect(() => {
    if (!effectiveTenantId || !syndicId) {
      setLoading(false);
      setError(t('Paramètres budget manquants'));
      return;
    }
    void loadData();
  }, [effectiveTenantId, syndicId]);

  const lotsById = useMemo(
    () =>
      lots.reduce<Record<string, SyndicateLot>>((acc, lot) => {
        acc[lot.id] = lot;
        return acc;
      }, {}),
    [lots]
  );

  const loadData = async () => {
    if (!effectiveTenantId || !syndicId) return;
    setLoading(true);
    setError(null);
    try {
      const [budgetsData, batchesData, lotsData] = await Promise.all([
        listBudgets(effectiveTenantId, syndicId),
        listChargeCallBatches(effectiveTenantId, syndicId),
        listSyndicateLots(effectiveTenantId, syndicId)
      ]);
      setBudgets(budgetsData);
      setBatches(batchesData);
      setLots(lotsData);
    } catch (err: any) {
      setError(err.response?.data?.error || t('Impossible de charger les budgets'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBudget = async () => {
    if (!effectiveTenantId || !syndicId) return;
    let values: any;
    try {
      values = await budgetForm.validateFields();
    } catch {
      // Validation errors are displayed directly by Ant Design form items.
      return;
    }
    setSubmitting(true);
    try {
      await createBudget(effectiveTenantId, syndicId, {
        fiscalYear: values.fiscalYear,
        label: values.label,
        totalAmount: values.totalAmount,
        currency: values.currency || 'XOF',
        lines: [
          {
            category: values.category,
            description: values.description,
            amountForecast: values.totalAmount,
            distributionKey: values.distributionKey
          }
        ]
      });
      message.success(t('Budget créé'));
      setOpenBudgetModal(false);
      budgetForm.resetFields();
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Création budget impossible'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveBudget = async (budgetId: string) => {
    if (!effectiveTenantId || !syndicId) return;
    setSubmitting(true);
    try {
      await updateBudget(effectiveTenantId, syndicId, budgetId, { status: 'APPROVED' });
      message.success(t('Budget approuvé'));
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Approbation impossible'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecompute = async (budgetId: string) => {
    if (!effectiveTenantId || !syndicId) return;
    setSubmitting(true);
    try {
      const allocations = await recomputeBudgetAllocations(effectiveTenantId, syndicId, budgetId);
      const budget = budgets.find(item => item.id === budgetId) || null;
      setAllocationRows(allocations);
      setAllocationBudgetLabel(budget ? `${budget.label} (${budget.fiscalYear})` : budgetId);
      message.success(t('Allocations recalculées ({{length}} lot(s))', { length: allocations.length }));
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Recalcul impossible'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateFromBudget = async () => {
    if (!effectiveTenantId || !syndicId || !selectedBudget) return;
    let values: any;
    try {
      values = await generateForm.validateFields();
    } catch {
      // Validation errors are displayed directly by Ant Design form items.
      return;
    }
    setSubmitting(true);
    try {
      await generateBudgetChargeCalls(effectiveTenantId, syndicId, selectedBudget.id, {
        label: values.label,
        period: values.period,
        dueDate: new Date(values.dueDate).toISOString(),
        batchType: values.batchType,
        currency: values.currency || 'XOF'
      });
      message.success(t("Campagne d'appels générée"));
      setOpenGenerateModal(false);
      setSelectedBudget(null);
      generateForm.resetFields();
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Generation des appels impossible'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateBatch = async () => {
    if (!effectiveTenantId || !syndicId) return;
    let values: any;
    try {
      values = await batchForm.validateFields();
    } catch {
      // Validation errors are displayed directly by Ant Design form items.
      return;
    }
    setSubmitting(true);
    try {
      await createChargeCallBatch(effectiveTenantId, syndicId, {
        label: values.label,
        period: values.period,
        dueDate: new Date(values.dueDate).toISOString(),
        batchType: values.batchType,
        totalAmount: values.totalAmount,
        currency: values.currency || 'XOF'
      });
      message.success(t('Campagne créée'));
      setOpenBatchModal(false);
      batchForm.resetFields();
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Création de campagne impossible'));
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
              {t("Budgets et campagnes d'appels")}
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {t('Budget prévisionnel, répartitions et génération des appels de charges.')}
            </Paragraph>
          </Space>
          <Space>
            <Button icon={<PlusOutlined />} onClick={() => setOpenBudgetModal(true)}>
              {t('Nouveau budget')}
            </Button>
            <Button icon={<PlusOutlined />} onClick={() => setOpenBatchModal(true)}>
              {t('Nouvelle campagne')}
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => void loadData()}>
              {t('Actualiser')}
            </Button>
          </Space>
        </div>

        {error ? <Alert type="error" message={error} showIcon /> : null}

        {loading ? (
          <div style={{ minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spin size="large" />
          </div>
        ) : (
          <>
            <Card title={t('Budgets')}>
              <Table
                scroll={{ x: 'max-content' }}
                rowKey="id"
                dataSource={budgets}
                pagination={{ pageSize: 8 }}
                columns={[
                  { title: 'Exercice', dataIndex: 'fiscalYear' },
                  { title: t('Libellé'), dataIndex: 'label' },
                  {
                    title: 'Montant',
                    dataIndex: 'totalAmount',
                    align: 'end',
                    render: (value: number | string) => <MoneyValue value={value} />
                  },
                  { title: 'Allocations', render: (_, budget) => budget.allocations?.length || 0 },
                  {
                    title: 'Statut',
                    dataIndex: 'status',
                    render: (status: string) => <Tag>{status}</Tag>
                  },
                  {
                    title: 'Actions',
                    render: (_, budget) => (
                      <Space>
                        <Button
                          size="small"
                          icon={<CheckOutlined />}
                          onClick={() => void handleApproveBudget(budget.id)}
                          disabled={budget.status === 'APPROVED'}
                        >
                          {t('Approuver')}
                        </Button>
                        <Button size="small" onClick={() => void handleRecompute(budget.id)}>
                          {t('Répartir')}
                        </Button>
                        <Button
                          size="small"
                          disabled={!budget.allocations || budget.allocations.length === 0}
                          onClick={() => {
                            setAllocationRows(budget.allocations || []);
                            setAllocationBudgetLabel(`${budget.label} (${budget.fiscalYear})`);
                          }}
                        >
                          {t('Voir allocations')}
                        </Button>
                        <Button
                          size="small"
                          type="primary"
                          onClick={() => {
                            setSelectedBudget(budget);
                            setOpenGenerateModal(true);
                            generateForm.setFieldsValue({
                              label: t('Campagne {{fiscalYear}}', { fiscalYear: budget.fiscalYear }),
                              period: `${budget.fiscalYear}-01`,
                              batchType: 'REGULAR',
                              currency: budget.currency || 'XOF'
                            });
                          }}
                        >
                          {t('Générer appels')}
                        </Button>
                      </Space>
                    )
                  }
                ]}
              />
            </Card>

            <Card
              title={
                allocationBudgetLabel
                  ? t('Répartition des lots - {{allocationBudgetLabel}}', {
                      allocationBudgetLabel: allocationBudgetLabel
                    })
                  : t('Répartition des lots')
              }
            >
              <Table
                scroll={{ x: 'max-content' }}
                rowKey="id"
                dataSource={allocationRows}
                pagination={{ pageSize: 8 }}
                locale={{ emptyText: 'Cliquez sur Répartir ou Voir allocations pour afficher le détail.' }}
                columns={[
                  {
                    title: 'Lot',
                    render: (_, row) => buildLotDisplayName(row, row.lotId ? lotsById[row.lotId] : undefined)
                  },
                  {
                    title: t('Total alloué'),
                    dataIndex: 'totalAllocated',
                    align: 'end',
                    render: (value: number | string) => <MoneyValue value={value} />
                  },
                  {
                    title: t('Détail lignes'),
                    render: (_, row) =>
                      (row.breakdown || [])
                        .map(line => `${line.category}: ${formatMoney(line.allocated)}`)
                        .join(' | ') || '-'
                  }
                ]}
              />
            </Card>

            <Card title={t("Campagnes d'appels")}>
              <Table
                scroll={{ x: 'max-content' }}
                rowKey="id"
                dataSource={batches}
                pagination={{ pageSize: 8 }}
                columns={[
                  { title: t('Libellé'), dataIndex: 'label' },
                  { title: t('Période'), dataIndex: 'period' },
                  {
                    title: 'Type',
                    dataIndex: 'batchType',
                    render: (value: ChargeCallBatch['batchType']) => batchTypeLabels[value] || value
                  },
                  {
                    title: t('Échéance'),
                    dataIndex: 'dueDate',
                    render: (value: string) => dayjs(value).format('DD/MM/YYYY')
                  },
                  {
                    title: 'Montant',
                    dataIndex: 'totalAmount',
                    align: 'end',
                    render: (value: number | string) => <MoneyValue value={value} />
                  },
                  { title: 'Charges', render: (_, batch) => batch.chargeCalls?.length || 0 },
                  {
                    title: 'Statut',
                    dataIndex: 'status',
                    render: (status: ChargeCallBatch['status']) => <Tag>{batchStatusLabels[status] || status}</Tag>
                  }
                ]}
              />
            </Card>
          </>
        )}
      </Space>

      <Modal
        title={t('Nouveau budget')}
        open={openBudgetModal}
        onCancel={() => setOpenBudgetModal(false)}
        onOk={() => void handleCreateBudget()}
        okText={t('Créer budget')}
        cancelText={t('Annuler')}
        confirmLoading={submitting}
      >
        <Form
          form={budgetForm}
          layout="vertical"
          initialValues={{ fiscalYear: new Date().getFullYear(), distributionKey: 'GENERAL_SHARES', currency: 'XOF' }}
        >
          <Form.Item label={t('Exercice')} name="fiscalYear" rules={[{ required: true }]}>
            <InputNumber min={2020} max={2100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label={t('Libellé')} name="label" rules={[{ required: true, message: t('Libellé obligatoire') }]}>
            <Input />
          </Form.Item>
          <Form.Item
            label={t('Montant total')}
            name="totalAmount"
            rules={[{ required: true, message: t('Montant obligatoire') }]}
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label={t('Catégorie principale')}
            name="category"
            rules={[{ required: true, message: t('Catégorie obligatoire') }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label={t('Description ligne')}
            name="description"
            rules={[{ required: true, message: t('Description obligatoire') }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label={t('Clé de distribution')} name="distributionKey" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={[
                { value: 'GENERAL_SHARES', label: t('Tantièmes généraux') },
                { value: 'SPECIAL_SHARES', label: t('Tantièmes spéciaux') },
                { value: 'EQUAL', label: t('Répartition égale') },
                { value: 'MANUAL', label: 'Manuelle' }
              ]}
            />
          </Form.Item>
          <Form.Item label={t('Devise')} name="currency">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('Générer appels depuis budget')}
        open={openGenerateModal}
        onCancel={() => {
          setOpenGenerateModal(false);
          setSelectedBudget(null);
        }}
        onOk={() => void handleGenerateFromBudget()}
        okText={t('Générer')}
        cancelText={t('Annuler')}
        confirmLoading={submitting}
      >
        <Form form={generateForm} layout="vertical">
          <Form.Item label={t('Libellé de la campagne')} name="label" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label={t('Période')} name="period" rules={[{ required: true }]}>
            <Input placeholder={t('Ex: 2026-01')} />
          </Form.Item>
          <Form.Item label={t('Date échéance')} name="dueDate" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>
          <Form.Item label={t('Type de campagne')} name="batchType" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={[
                { value: 'REGULAR', label: t('Régulier') },
                { value: 'EXCEPTIONAL', label: 'Exceptionnel' }
              ]}
            />
          </Form.Item>
          <Form.Item label={t('Devise')} name="currency">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t("Nouvelle campagne d'appels")}
        open={openBatchModal}
        onCancel={() => setOpenBatchModal(false)}
        onOk={() => void handleCreateBatch()}
        okText={t('Créer')}
        cancelText={t('Annuler')}
        confirmLoading={submitting}
      >
        <Form form={batchForm} layout="vertical" initialValues={{ batchType: 'EXCEPTIONAL', currency: 'XOF' }}>
          <Form.Item label={t('Libellé')} name="label" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label={t('Période')} name="period" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label={t('Date échéance')} name="dueDate" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>
          <Form.Item label={t('Montant total')} name="totalAmount" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label={t('Type de campagne')} name="batchType" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={[
                { value: 'REGULAR', label: t('Régulier') },
                { value: 'EXCEPTIONAL', label: 'Exceptionnel' }
              ]}
            />
          </Form.Item>
          <Form.Item label={t('Devise')} name="currency">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};
