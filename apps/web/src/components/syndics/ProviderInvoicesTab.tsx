import React, { useEffect, useMemo, useState } from 'react';
import {
  App,
  Alert,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, UploadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { MoneyValue } from '../primitives/MoneyValue';
import {
  createProviderInvoice,
  listProviderBalances,
  listProviderInvoices
} from '../../services/syndic-provider-invoice-service';
import { listBudgets, listSyndicIncidents, listSyndicateFunds } from '../../services/syndic-service';
import {
  BudgetLineItem,
  MaintenanceContract,
  ProviderBalance,
  ProviderInvoice,
  ProviderInvoiceStatus,
  ServiceProvider,
  SyndicateFund,
  SyndicateIncident
} from '../../types/syndic-types';
import { providerInvoiceStatusColors, providerInvoiceStatusLabels } from './labels';
import { ProviderInvoiceDrawer } from './ProviderInvoiceDrawer';
import { dateFormat } from '../../i18n/format';
import { t } from '../../i18n/t';

const { Paragraph, Title, Text } = Typography;
const { RangePicker } = DatePicker;

const INVOICE_STATUSES: ProviderInvoiceStatus[] = ['RECORDED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'];

interface BudgetLineOption extends BudgetLineItem {
  budgetLabel: string;
}

interface ProviderInvoicesTabProps {
  tenantId: string;
  syndicId: string;
  providers: ServiceProvider[];
  contracts: MaintenanceContract[];
}

/**
 * Onglet « Factures » de la page Prestataires (lot S6, besoin 3) : factures et
 * paiements des prestataires d'une copropriété, plus les soldes dus par
 * prestataire (§ « Nouveau code dans lib/syndics/provider-invoices.ts »
 * côté backend, ici son pendant web dans un fichier dédié).
 */
export const ProviderInvoicesTab: React.FC<ProviderInvoicesTabProps> = ({
  tenantId,
  syndicId,
  providers,
  contracts
}) => {
  const { message } = App.useApp();

  const [items, setItems] = useState<ProviderInvoice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [providerFilter, setProviderFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<ProviderInvoiceStatus | undefined>();
  const [range, setRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);

  const [balances, setBalances] = useState<ProviderBalance[]>([]);
  const [incidents, setIncidents] = useState<SyndicateIncident[]>([]);
  const [funds, setFunds] = useState<SyndicateFund[]>([]);
  const [budgetLines, setBudgetLines] = useState<BudgetLineOption[]>([]);

  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createFile, setCreateFile] = useState<File | null>(null);
  const [createAmountHT, setCreateAmountHT] = useState(0);
  const [createVatAmount, setCreateVatAmount] = useState(0);
  const [createCurrency, setCreateCurrency] = useState('XOF');
  const [createForm] = Form.useForm();

  useEffect(() => {
    void loadReferenceData();
  }, [tenantId, syndicId]);

  useEffect(() => {
    void loadInvoices();
  }, [tenantId, syndicId, providerFilter, statusFilter, range, page, pageSize]);

  const loadReferenceData = async () => {
    try {
      const [incidentsData, fundsData, budgetsData, balancesData] = await Promise.all([
        listSyndicIncidents(tenantId, syndicId),
        listSyndicateFunds(tenantId, syndicId),
        listBudgets(tenantId, syndicId),
        listProviderBalances(tenantId, syndicId)
      ]);
      setIncidents(incidentsData);
      setFunds(fundsData);
      setBudgetLines(
        budgetsData.flatMap(budget => (budget.lines || []).map(line => ({ ...line, budgetLabel: budget.label })))
      );
      setBalances(balancesData);
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Impossible de charger les données de référence'));
    }
  };

  const loadInvoices = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listProviderInvoices(tenantId, syndicId, {
        providerId: providerFilter,
        status: statusFilter,
        from: range?.[0] ? range[0]!.startOf('day').toISOString() : undefined,
        to: range?.[1] ? range[1]!.endOf('day').toISOString() : undefined,
        page,
        limit: pageSize
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (err: any) {
      setError(err.response?.data?.error || t('Impossible de charger les factures'));
    } finally {
      setLoading(false);
    }
  };

  const refreshBalances = async () => {
    try {
      setBalances(await listProviderBalances(tenantId, syndicId));
    } catch {
      // Les soldes ne sont qu'un complément d'affichage : une erreur ici ne
      // bloque pas la liste principale des factures.
    }
  };

  const openCreateModal = () => {
    createForm.resetFields();
    createForm.setFieldsValue({ expenseKind: 'CURRENT', currency: 'XOF', invoiceDate: dayjs() });
    setCreateFile(null);
    setCreateAmountHT(0);
    setCreateVatAmount(0);
    setCreateCurrency('XOF');
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    const values = await createForm.validateFields();
    setCreating(true);
    try {
      const result = await createProviderInvoice(tenantId, syndicId, {
        providerId: values.providerId,
        contractId: values.contractId || undefined,
        incidentId: values.incidentId || undefined,
        budgetLineItemId: values.budgetLineItemId || undefined,
        fundId: values.fundId || undefined,
        expenseKind: values.expenseKind,
        number: values.number,
        label: values.label,
        invoiceDate: values.invoiceDate.toISOString(),
        dueDate: values.dueDate ? values.dueDate.toISOString() : undefined,
        amountHT: values.amountHT,
        vatAmount: values.vatAmount ?? 0,
        currency: values.currency || 'XOF',
        file: createFile ?? undefined
      });
      message.success(t('Facture enregistrée'));
      if (!result.incidentImputation.linked && result.incidentImputation.reason !== 'NO_INCIDENT') {
        const reasonLabel =
          result.incidentImputation.reason === 'AMBIGUOUS'
            ? t("Plusieurs imputations d'incident possibles : rattachez-la manuellement.")
            : t("Aucune imputation budgétaire de copropriété n'attend cet incident.");
        message.warning(reasonLabel);
      }
      setCreateOpen(false);
      setCreateFile(null);
      await Promise.all([loadInvoices(), refreshBalances()]);
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Enregistrement de la facture impossible'));
    } finally {
      setCreating(false);
    }
  };

  const handleDrawerChanged = () => {
    void Promise.all([loadInvoices(), refreshBalances()]);
  };

  const columns: ColumnsType<ProviderInvoice> = [
    { title: t('Numéro'), dataIndex: 'number', key: 'number' },
    { title: t('Prestataire'), key: 'provider', render: (_: unknown, row) => row.provider?.name || row.providerId },
    { title: t('Libellé'), dataIndex: 'label', key: 'label' },
    {
      title: t('Date de facture'),
      dataIndex: 'invoiceDate',
      key: 'invoiceDate',
      render: (value: string) => dayjs(value).format(dateFormat('short'))
    },
    {
      title: t('Montant TTC'),
      key: 'amountTTC',
      align: 'end',
      render: (_: unknown, row) => <MoneyValue value={row.amountTTC} currency={row.currency} />
    },
    {
      title: t('Payé'),
      key: 'amountPaid',
      align: 'end',
      render: (_: unknown, row) => <MoneyValue value={row.amountPaid} currency={row.currency} />
    },
    {
      title: t('Reste dû'),
      key: 'amountDue',
      align: 'end',
      render: (_: unknown, row) => <MoneyValue value={row.amountDue} currency={row.currency} />
    },
    {
      title: t('Pièce'),
      key: 'hasFile',
      render: (_: unknown, row) => (row.hasFile ? <Tag color="blue">{t('Jointe')}</Tag> : <Tag>{t('Aucune')}</Tag>)
    },
    {
      title: t('Statut'),
      key: 'status',
      render: (_: unknown, row) => (
        <Tag color={providerInvoiceStatusColors[row.status]}>{providerInvoiceStatusLabels[row.status]}</Tag>
      )
    },
    {
      title: t('Actions'),
      key: 'actions',
      align: 'end',
      render: (_: unknown, row) => (
        <Button size="small" onClick={() => setOpenInvoiceId(row.id)}>
          {t('Ouvrir')}
        </Button>
      )
    }
  ];

  const balanceColumns: ColumnsType<ProviderBalance> = [
    { title: t('Prestataire'), dataIndex: 'providerName', key: 'providerName' },
    { title: t('Factures'), dataIndex: 'invoicesCount', key: 'invoicesCount', align: 'end' },
    {
      title: t('Total facturé'),
      key: 'totalInvoiced',
      align: 'end',
      render: (_: unknown, row) => <MoneyValue value={row.totalInvoiced} currency={row.currency} />
    },
    {
      title: t('Total payé'),
      key: 'totalPaid',
      align: 'end',
      render: (_: unknown, row) => <MoneyValue value={row.totalPaid} currency={row.currency} />
    },
    {
      title: t('Reste dû'),
      key: 'totalDue',
      align: 'end',
      render: (_: unknown, row) => <MoneyValue value={row.totalDue} currency={row.currency} />
    },
    {
      title: t('Dont en retard'),
      key: 'overdueDue',
      align: 'end',
      render: (_: unknown, row) => (
        <Text type={row.overdueDue > 0 ? 'danger' : undefined}>
          <MoneyValue value={row.overdueDue} currency={row.currency} />
        </Text>
      )
    }
  ];

  const budgetLineOptions = useMemo(
    () =>
      budgetLines.map(line => ({
        value: line.id,
        label: `${line.budgetLabel} · ${line.category} — ${line.description}`
      })),
    [budgetLines]
  );

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div className="it-toolbar">
        <Title level={3} className="it-toolbar__title" style={{ margin: 0 }}>
          {t('Factures des prestataires')}
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
          {t('Enregistrer une facture')}
        </Button>
      </div>
      <Paragraph type="secondary" style={{ marginBottom: 0 }}>
        {t('Factures, pièces jointes et paiements partiels ou complets des prestataires.')}
      </Paragraph>

      <Card title={t('Soldes par prestataire')}>
        <Table
          rowKey="providerId"
          dataSource={balances}
          columns={balanceColumns}
          pagination={{ pageSize: 5, hideOnSinglePage: true }}
          locale={{ emptyText: t('Aucune facture enregistrée') }}
        />
      </Card>

      <Card>
        <Space wrap size="middle">
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('Filtrer par prestataire')}
            style={{ minWidth: 220 }}
            value={providerFilter}
            onChange={value => {
              setPage(1);
              setProviderFilter(value);
            }}
            options={providers.map(provider => ({ value: provider.id, label: provider.name }))}
          />
          <Select
            allowClear
            placeholder={t('Filtrer par statut')}
            style={{ minWidth: 200 }}
            value={statusFilter}
            onChange={value => {
              setPage(1);
              setStatusFilter(value);
            }}
            options={INVOICE_STATUSES.map(status => ({ value: status, label: providerInvoiceStatusLabels[status] }))}
          />
          <RangePicker
            format="DD/MM/YYYY"
            value={range as any}
            onChange={value => {
              setPage(1);
              setRange(value as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null);
            }}
          />
        </Space>
      </Card>

      {error ? <Alert type="error" message={error} showIcon /> : null}

      <Card>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={items}
          columns={columns}
          scroll={{ x: 'max-content' }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPage);
              setPageSize(nextPageSize);
            }
          }}
          locale={{ emptyText: t('Aucune facture pour ces filtres') }}
        />
      </Card>

      <ProviderInvoiceDrawer
        tenantId={tenantId}
        syndicId={syndicId}
        invoiceId={openInvoiceId}
        funds={funds}
        onClose={() => setOpenInvoiceId(null)}
        onChanged={handleDrawerChanged}
      />

      <Modal
        title={t('Enregistrer une facture')}
        open={createOpen}
        onOk={() => void handleCreate()}
        onCancel={() => setCreateOpen(false)}
        okText={t('Enregistrer')}
        cancelText={t('Annuler')}
        confirmLoading={creating}
        width={640}
      >
        <Form form={createForm} layout="vertical">
          <Form.Item
            label={t('Prestataire')}
            name="providerId"
            rules={[{ required: true, message: t('Le prestataire est obligatoire') }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={providers.map(provider => ({ value: provider.id, label: provider.name }))}
              placeholder={t('Sélectionner un prestataire')}
            />
          </Form.Item>
          <Form.Item label={t('Contrat')} name="contractId">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={contracts.map(contract => ({ value: contract.id, label: contract.nature }))}
              placeholder={t('Sans contrat')}
            />
          </Form.Item>
          <Form.Item label={t('Incident')} name="incidentId">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={incidents.map(incident => ({ value: incident.id, label: incident.description }))}
              placeholder={t('Sans incident')}
            />
          </Form.Item>
          <Form.Item label={t('Ligne budgétaire')} name="budgetLineItemId">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={budgetLineOptions}
              placeholder={t('Déduite du contrat si possible')}
            />
          </Form.Item>
          <Form.Item label={t('Fonds débité par défaut')} name="fundId">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              options={funds.map(fund => ({ value: fund.id, label: fund.name }))}
              placeholder={t('À choisir au moment du paiement')}
            />
          </Form.Item>
          <Form.Item label={t('Nature de la dépense')} name="expenseKind">
            <Select
              options={[
                { value: 'CURRENT', label: t('Charges courantes') },
                { value: 'WORKS', label: t('Travaux') }
              ]}
            />
          </Form.Item>
          <Form.Item
            label={t('Numéro de facture')}
            name="number"
            rules={[{ required: true, message: t('Le numéro de facture est obligatoire') }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label={t('Libellé')}
            name="label"
            rules={[{ required: true, message: t('Le libellé de la facture est obligatoire') }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label={t('Date de facture')}
            name="invoiceDate"
            rules={[{ required: true, message: t('La date de facture est obligatoire') }]}
          >
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item label={t('Échéance')} name="dueDate">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>
          <Form.Item
            label={t('Montant HT')}
            name="amountHT"
            rules={[{ required: true, message: t('Le montant HT est obligatoire') }]}
          >
            <InputNumber
              min={0}
              style={{ width: '100%' }}
              precision={2}
              onChange={value => setCreateAmountHT(Number(value) || 0)}
            />
          </Form.Item>
          <Form.Item label={t('TVA')} name="vatAmount">
            <InputNumber
              min={0}
              style={{ width: '100%' }}
              precision={2}
              onChange={value => setCreateVatAmount(Number(value) || 0)}
            />
          </Form.Item>
          <Form.Item label={t('Montant TTC (calculé)')}>
            <MoneyValue value={createAmountHT + createVatAmount} currency={createCurrency || 'XOF'} />
          </Form.Item>
          <Form.Item label={t('Devise')} name="currency">
            <Input onChange={event => setCreateCurrency(event.target.value)} />
          </Form.Item>
          <Form.Item label={t('Pièce jointe')}>
            <Upload
              maxCount={1}
              beforeUpload={file => {
                setCreateFile(file as unknown as File);
                return false;
              }}
              onRemove={() => setCreateFile(null)}
            >
              <Button icon={<UploadOutlined />}>{t('Choisir un fichier')}</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
};
