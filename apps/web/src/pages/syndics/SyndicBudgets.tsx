import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { ArrowLeftOutlined, CheckOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { DashboardLayout } from '../../components/dashboard/dashboard-layout';
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

const { Paragraph, Title } = Typography;

const batchTypeLabels: Record<ChargeCallBatch['batchType'], string> = {
  REGULAR: 'Régulier',
  EXCEPTIONAL: 'Exceptionnel'
};

const batchStatusLabels: Record<ChargeCallBatch['status'], string> = {
  DRAFT: 'Brouillon',
  SENT: 'Envoyé',
  CLOSED: 'Clôturé'
};

function buildLotDisplayName(allocation: BudgetAllocation, lotDirectoryEntry?: SyndicateLot): string {
  const lot = allocation.lot || lotDirectoryEntry;
  if (!lot) {
    return allocation.lotId || '-';
  }

  const property = lot.property;
  if (!property) {
    return lot.lotNumber || allocation.lotId || '-';
  }

  const ownerLabel = property.owner?.fullName?.trim() || '';
  const propertyLabel = property.title?.trim() || property.address?.trim() || '';

  if (ownerLabel && propertyLabel) {
    return `${ownerLabel} - ${propertyLabel}`;
  }
  if (propertyLabel) {
    return propertyLabel;
  }

  return lot.lotNumber || allocation.lotId || '-';
}

export const SyndicBudgets: React.FC = () => {
  const { message } = App.useApp();

  const { tenantId: effectiveTenantId, syndicId } = useSyndicRouteContext();
  const navigate = useNavigate();

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
      setError('Paramètres budget manquants');
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
      setError(err.response?.data?.error || 'Impossible de charger les budgets');
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
      message.success('Budget créé');
      setOpenBudgetModal(false);
      budgetForm.resetFields();
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Création budget impossible');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveBudget = async (budgetId: string) => {
    if (!effectiveTenantId || !syndicId) return;
    setSubmitting(true);
    try {
      await updateBudget(effectiveTenantId, syndicId, budgetId, { status: 'APPROVED' });
      message.success('Budget approuvé');
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Approbation impossible');
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
      message.success(`Allocations recalculées (${allocations.length} lot(s))`);
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Recalcul impossible');
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
      message.success("Batch d'appels généré");
      setOpenGenerateModal(false);
      setSelectedBudget(null);
      generateForm.resetFields();
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Generation des appels impossible');
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
      message.success('Batch créé');
      setOpenBatchModal(false);
      batchForm.resetFields();
      await loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || 'Création batch impossible');
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
              Budgets et batches d'appels
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              Budget prévisionnel, répartitions et génération des appels de charges.
            </Paragraph>
          </Space>
          <Space>
            <Button icon={<PlusOutlined />} onClick={() => setOpenBudgetModal(true)}>
              Nouveau budget
            </Button>
            <Button icon={<PlusOutlined />} onClick={() => setOpenBatchModal(true)}>
              Nouveau batch
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => void loadData()}>
              Actualiser
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
            <Card title="Budgets">
              <Table
                rowKey="id"
                dataSource={budgets}
                pagination={{ pageSize: 8 }}
                columns={[
                  { title: 'Exercice', dataIndex: 'fiscalYear' },
                  { title: 'Libellé', dataIndex: 'label' },
                  {
                    title: 'Montant',
                    dataIndex: 'totalAmount',
                    render: (value: number | string) => `${Number(value).toLocaleString('fr-FR')} XOF`
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
                          Approuver
                        </Button>
                        <Button size="small" onClick={() => void handleRecompute(budget.id)}>
                          Répartir
                        </Button>
                        <Button
                          size="small"
                          disabled={!budget.allocations || budget.allocations.length === 0}
                          onClick={() => {
                            setAllocationRows(budget.allocations || []);
                            setAllocationBudgetLabel(`${budget.label} (${budget.fiscalYear})`);
                          }}
                        >
                          Voir allocations
                        </Button>
                        <Button
                          size="small"
                          type="primary"
                          onClick={() => {
                            setSelectedBudget(budget);
                            setOpenGenerateModal(true);
                            generateForm.setFieldsValue({
                              label: `Batch ${budget.fiscalYear}`,
                              period: `${budget.fiscalYear}-01`,
                              batchType: 'REGULAR',
                              currency: budget.currency || 'XOF'
                            });
                          }}
                        >
                          Générer appels
                        </Button>
                      </Space>
                    )
                  }
                ]}
              />
            </Card>

            <Card
              title={allocationBudgetLabel ? `Répartition des lots - ${allocationBudgetLabel}` : 'Répartition des lots'}
            >
              <Table
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
                    title: 'Total alloué',
                    dataIndex: 'totalAllocated',
                    render: (value: number | string) => `${Number(value).toLocaleString('fr-FR')} XOF`
                  },
                  {
                    title: 'Détail lignes',
                    render: (_, row) =>
                      (row.breakdown || [])
                        .map(line => `${line.category}: ${Number(line.allocated).toLocaleString('fr-FR')} XOF`)
                        .join(' | ') || '-'
                  }
                ]}
              />
            </Card>

            <Card title="Batches d'appels">
              <Table
                rowKey="id"
                dataSource={batches}
                pagination={{ pageSize: 8 }}
                columns={[
                  { title: 'Libellé', dataIndex: 'label' },
                  { title: 'Période', dataIndex: 'period' },
                  {
                    title: 'Type',
                    dataIndex: 'batchType',
                    render: (value: ChargeCallBatch['batchType']) => batchTypeLabels[value] || value
                  },
                  {
                    title: 'Échéance',
                    dataIndex: 'dueDate',
                    render: (value: string) => dayjs(value).format('DD/MM/YYYY')
                  },
                  {
                    title: 'Montant',
                    dataIndex: 'totalAmount',
                    render: (value: number | string) => `${Number(value).toLocaleString('fr-FR')} XOF`
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
        title="Nouveau budget"
        open={openBudgetModal}
        onCancel={() => setOpenBudgetModal(false)}
        onOk={() => void handleCreateBudget()}
        okText="Créer budget"
        cancelText="Annuler"
        confirmLoading={submitting}
      >
        <Form
          form={budgetForm}
          layout="vertical"
          initialValues={{ fiscalYear: new Date().getFullYear(), distributionKey: 'GENERAL_SHARES', currency: 'XOF' }}
        >
          <Form.Item label="Exercice" name="fiscalYear" rules={[{ required: true }]}>
            <InputNumber min={2020} max={2100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="Libellé" name="label" rules={[{ required: true, message: 'Libellé obligatoire' }]}>
            <Input />
          </Form.Item>
          <Form.Item
            label="Montant total"
            name="totalAmount"
            rules={[{ required: true, message: 'Montant obligatoire' }]}
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label="Catégorie principale"
            name="category"
            rules={[{ required: true, message: 'Catégorie obligatoire' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label="Description ligne"
            name="description"
            rules={[{ required: true, message: 'Description obligatoire' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label="Clé de distribution" name="distributionKey" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'GENERAL_SHARES', label: 'Tantièmes généraux' },
                { value: 'SPECIAL_SHARES', label: 'Tantièmes spéciaux' },
                { value: 'EQUAL', label: 'Répartition égale' },
                { value: 'MANUAL', label: 'Manuelle' }
              ]}
            />
          </Form.Item>
          <Form.Item label="Devise" name="currency">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Générer appels depuis budget"
        open={openGenerateModal}
        onCancel={() => {
          setOpenGenerateModal(false);
          setSelectedBudget(null);
        }}
        onOk={() => void handleGenerateFromBudget()}
        okText="Générer"
        cancelText="Annuler"
        confirmLoading={submitting}
      >
        <Form form={generateForm} layout="vertical">
          <Form.Item label="Libellé batch" name="label" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Période" name="period" rules={[{ required: true }]}>
            <Input placeholder="Ex: 2026-01" />
          </Form.Item>
          <Form.Item label="Date échéance" name="dueDate" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>
          <Form.Item label="Type batch" name="batchType" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'REGULAR', label: 'Régulier' },
                { value: 'EXCEPTIONAL', label: 'Exceptionnel' }
              ]}
            />
          </Form.Item>
          <Form.Item label="Devise" name="currency">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Nouveau batch d'appels"
        open={openBatchModal}
        onCancel={() => setOpenBatchModal(false)}
        onOk={() => void handleCreateBatch()}
        okText="Créer"
        cancelText="Annuler"
        confirmLoading={submitting}
      >
        <Form form={batchForm} layout="vertical" initialValues={{ batchType: 'EXCEPTIONAL', currency: 'XOF' }}>
          <Form.Item label="Libellé" name="label" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Période" name="period" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="Date échéance" name="dueDate" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>
          <Form.Item label="Montant total" name="totalAmount" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="Type batch" name="batchType" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'REGULAR', label: 'Régulier' },
                { value: 'EXCEPTIONAL', label: 'Exceptionnel' }
              ]}
            />
          </Form.Item>
          <Form.Item label="Devise" name="currency">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </DashboardLayout>
  );
};
