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
import { CheckOutlined, LockOutlined, PlusOutlined, ReloadOutlined, UndoOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { formatMoney, MoneyValue } from '../../components/primitives';
import {
  assignBudgetLineFund,
  createBudget,
  createChargeCallBatch,
  generateBudgetChargeCalls,
  listBudgets,
  listChargeCallBatches,
  listSyndicateFunds,
  listSyndicateLots,
  recomputeBudgetAllocations,
  updateBudget
} from '../../services/syndic-service';
import {
  BudgetAllocation,
  BudgetLineItem,
  ChargeCallBatch,
  SyndicateBudget,
  SyndicateFund,
  SyndicateLot
} from '../../types/syndic-types';
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

const budgetStatusLabels: Record<SyndicateBudget['status'], string> = {
  DRAFT: t('Brouillon'),
  APPROVED: t('Approuvé'),
  REVISED: t('Révisé'),
  CLOSED: t('Clôturé')
};

const budgetStatusColors: Record<SyndicateBudget['status'], string> = {
  DRAFT: 'default',
  APPROVED: 'green',
  REVISED: 'orange',
  CLOSED: 'red'
};

function sumBudgetLines(budget: SyndicateBudget, field: 'amountForecast' | 'amountActual'): number {
  return (budget.lines || []).reduce((acc, line) => acc + Number(line[field] || 0), 0);
}

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

  // Fonds de la copropriété : un poste qui en alimente un lui verse sa part de
  // chaque paiement de charges. Leur chargement ne bloque jamais la page.
  const [funds, setFunds] = useState<SyndicateFund[]>([]);
  const [linesBudget, setLinesBudget] = useState<SyndicateBudget | null>(null);
  const [savingLineId, setSavingLineId] = useState<string | null>(null);

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
      setLinesBudget(current => (current ? (budgetsData.find(item => item.id === current.id) ?? null) : null));
    } catch (err: any) {
      setError(err.response?.data?.error || t('Impossible de charger les budgets'));
    } finally {
      setLoading(false);
    }
    await loadFunds();
  };

  const loadFunds = async () => {
    if (!effectiveTenantId || !syndicId) return;
    try {
      const data = await listSyndicateFunds(effectiveTenantId, syndicId);
      setFunds(Array.isArray(data) ? data : []);
    } catch {
      setFunds([]);
    }
  };

  const fundSelectOptions = useMemo(() => funds.map(fund => ({ value: fund.id, label: fund.name })), [funds]);

  const handleAssignLineFund = async (line: BudgetLineItem, fundId: string | undefined) => {
    if (!effectiveTenantId || !syndicId) return;
    setSavingLineId(line.id);
    try {
      await assignBudgetLineFund(effectiveTenantId, syndicId, line.budgetId, line.id, { fundId: fundId ?? null });
      message.success(t('Affectation au fonds enregistrée'));
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Affectation au fonds impossible'));
    } finally {
      setSavingLineId(null);
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
            distributionKey: values.distributionKey,
            fundId: values.fundId || undefined
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

  const handleChangeBudgetStatus = async (
    budgetId: string,
    status: SyndicateBudget['status'],
    successMessage: string,
    errorMessage: string
  ) => {
    if (!effectiveTenantId || !syndicId) return;
    setSubmitting(true);
    try {
      await updateBudget(effectiveTenantId, syndicId, budgetId, { status });
      message.success(successMessage);
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveBudget = (budgetId: string) =>
    handleChangeBudgetStatus(budgetId, 'APPROVED', t('Budget approuvé'), t('Approbation impossible'));

  const handleReviseBudget = (budgetId: string) =>
    handleChangeBudgetStatus(budgetId, 'REVISED', t('Budget repassé en révision'), t('Révision impossible'));

  const handleCloseBudget = (budget: SyndicateBudget) => {
    const budgeted = Number(budget.totalAmount || 0);
    const actual = sumBudgetLines(budget, 'amountActual');
    const gap = budgeted - actual;
    Modal.confirm({
      title: t('Clôturer le budget {{label}} ?', { label: `${budget.label} (${budget.fiscalYear})` }),
      content: (
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <span>
            {t('Total budgété')}: <MoneyValue value={budgeted} />
          </span>
          <span>
            {t('Total réalisé')}: <MoneyValue value={actual} />
          </span>
          <span>
            {t('Écart')}: <MoneyValue value={gap} />
          </span>
          <Alert
            type="warning"
            showIcon
            message={t(
              'La clôture est définitive : ce budget, ses postes et sa répartition ne pourront plus être modifiés.'
            )}
          />
        </Space>
      ),
      okText: t('Clôturer'),
      okButtonProps: { danger: true },
      cancelText: t('Annuler'),
      onOk: () => handleChangeBudgetStatus(budget.id, 'CLOSED', t('Budget clôturé'), t('Clôture impossible'))
    });
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
        currency: values.currency || 'XOF',
        periodsPerYear: values.periodsPerYear || 1,
        periodIndex: values.periodIndex || 1
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
                    render: (status: SyndicateBudget['status']) => (
                      <Tag color={budgetStatusColors[status]}>{budgetStatusLabels[status] || status}</Tag>
                    )
                  },
                  {
                    title: 'Actions',
                    render: (_, budget) => {
                      const isClosed = budget.status === 'CLOSED';
                      return (
                        <Space wrap>
                          {(budget.status === 'DRAFT' || budget.status === 'REVISED') && (
                            <Button
                              size="small"
                              icon={<CheckOutlined />}
                              onClick={() => void handleApproveBudget(budget.id)}
                            >
                              {t('Approuver')}
                            </Button>
                          )}
                          {budget.status === 'APPROVED' && (
                            <Button
                              size="small"
                              icon={<UndoOutlined />}
                              onClick={() => void handleReviseBudget(budget.id)}
                            >
                              {t('Réviser')}
                            </Button>
                          )}
                          {(budget.status === 'APPROVED' || budget.status === 'REVISED') && (
                            <Button
                              size="small"
                              danger
                              icon={<LockOutlined />}
                              onClick={() => handleCloseBudget(budget)}
                            >
                              {t('Clôturer')}
                            </Button>
                          )}
                          <Button size="small" disabled={isClosed} onClick={() => void handleRecompute(budget.id)}>
                            {t('Répartir')}
                          </Button>
                          <Button size="small" onClick={() => setLinesBudget(budget)}>
                            {t('Postes et fonds')}
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
                            disabled={isClosed}
                            onClick={() => {
                              setSelectedBudget(budget);
                              setOpenGenerateModal(true);
                              generateForm.setFieldsValue({
                                label: t('Campagne {{fiscalYear}}', { fiscalYear: budget.fiscalYear }),
                                period: `${budget.fiscalYear}-01`,
                                batchType: 'REGULAR',
                                currency: budget.currency || 'XOF',
                                periodsPerYear: 1,
                                periodIndex: 1
                              });
                            }}
                          >
                            {t('Générer appels')}
                          </Button>
                        </Space>
                      );
                    }
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
          {funds.length > 0 ? (
            <Form.Item
              label={t('Fonds alimenté par ce poste (optionnel)')}
              name="fundId"
              extra={t('Le fonds recevra la part de ce poste dans chaque paiement de charges.')}
            >
              <Select allowClear showSearch optionFilterProp="label" options={fundSelectOptions} />
            </Form.Item>
          ) : null}
        </Form>
      </Modal>

      <Modal
        title={
          linesBudget
            ? t('Postes et fonds — {{label}}', { label: `${linesBudget.label} (${linesBudget.fiscalYear})` })
            : t('Postes et fonds')
        }
        open={Boolean(linesBudget)}
        onCancel={() => setLinesBudget(null)}
        footer={null}
        width={720}
      >
        <Paragraph type="secondary">
          {t(
            'Un poste affecté à un fonds lui verse sa part de chaque paiement de charges enregistré ensuite, au prorata de la répartition du lot.'
          )}
        </Paragraph>
        {funds.length === 0 ? (
          <Alert type="info" showIcon message={t("Créez d'abord un fonds dans la trésorerie de la copropriété.")} />
        ) : null}
        {linesBudget?.status === 'CLOSED' ? (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message={t('Budget clôturé : les postes et fonds ne sont plus modifiables, lecture seule.')}
          />
        ) : null}
        <Table
          scroll={{ x: 'max-content' }}
          rowKey="id"
          dataSource={linesBudget?.lines || []}
          pagination={false}
          summary={rows => {
            const totalForecast = rows.reduce((acc, line: any) => acc + Number(line.amountForecast || 0), 0);
            const totalActual = rows.reduce((acc, line: any) => acc + Number(line.amountActual || 0), 0);
            const totalGap = totalForecast - totalActual;
            return (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={2}>
                  {t('Total')}
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="end">
                  <MoneyValue value={totalForecast} />
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="end">
                  <MoneyValue value={totalActual} />
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="end">
                  <span style={{ color: totalGap < 0 ? 'var(--ant-color-error, #cf1322)' : undefined }}>
                    <MoneyValue value={totalGap} />
                  </span>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} />
              </Table.Summary.Row>
            );
          }}
          columns={[
            { title: t('Catégorie'), dataIndex: 'category' },
            { title: t('Description'), dataIndex: 'description' },
            {
              title: t('Budgété'),
              dataIndex: 'amountForecast',
              align: 'end',
              render: (value: number | string) => <MoneyValue value={value} />
            },
            {
              title: t('Réalisé'),
              dataIndex: 'amountActual',
              align: 'end',
              render: (value: number | string) => <MoneyValue value={value} />
            },
            {
              title: t('Écart'),
              align: 'end',
              render: (_, line: BudgetLineItem) => {
                const gap = Number(line.amountForecast || 0) - Number(line.amountActual || 0);
                return (
                  <span style={{ color: gap < 0 ? 'var(--ant-color-error, #cf1322)' : undefined }}>
                    <MoneyValue value={gap} />
                  </span>
                );
              }
            },
            {
              title: t('Fonds alimenté'),
              render: (_, line: BudgetLineItem) => (
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  style={{ minWidth: 200 }}
                  placeholder={t('Aucun fonds')}
                  disabled={funds.length === 0 || savingLineId === line.id || linesBudget?.status === 'CLOSED'}
                  value={line.fundId ?? undefined}
                  onChange={value => void handleAssignLineFund(line, value)}
                  options={fundSelectOptions}
                />
              )
            }
          ]}
        />
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
        <Form form={generateForm} layout="vertical" initialValues={{ periodsPerYear: 1, periodIndex: 1 }}>
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
          <Form.Item
            label={t('Répartir sur')}
            name="periodsPerYear"
            tooltip={t(
              "Découpe le montant annuel du budget en plusieurs appels égaux (le dernier absorbe l'arrondi). « 1 » reproduit le comportement précédent : un appel annuel unique."
            )}
            rules={[{ required: true }]}
          >
            <Select
              onChange={() => generateForm.setFieldsValue({ periodIndex: 1 })}
              options={[
                { value: 1, label: t('1 période (annuel)') },
                { value: 2, label: t('2 périodes (semestriel)') },
                { value: 4, label: t('4 périodes (trimestriel)') },
                { value: 12, label: t('12 périodes (mensuel)') }
              ]}
            />
          </Form.Item>
          <Form.Item noStyle dependencies={['periodsPerYear']}>
            {({ getFieldValue }) => {
              const periodsPerYear = getFieldValue('periodsPerYear') || 1;
              return (
                <Form.Item
                  label={t('Période n°')}
                  name="periodIndex"
                  tooltip={t('Quelle part générer maintenant, de 1 à la valeur choisie ci-dessus.')}
                  rules={[{ required: true }]}
                >
                  <InputNumber min={1} max={periodsPerYear} style={{ width: '100%' }} />
                </Form.Item>
              );
            }}
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
