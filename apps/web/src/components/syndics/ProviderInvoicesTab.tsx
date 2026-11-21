import React, { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Tag,
  Typography,
  Upload
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, UploadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { MoneyValue } from '../primitives/MoneyValue';
import { DataCard, DataView } from '../primitives';
import { collectAllPages } from '../../utils/table-export/collect';
import { useListSearch } from '../../hooks/useListSearch';
import { useLocalListSearch } from '../../utils/list-search';
import type { SearchCriterion } from '../../utils/list-search';
import { STALE_TIME } from '../../lib/query-keys';
import {
  createProviderInvoice,
  listProviderBalances,
  listProviderInvoices
} from '../../services/syndic-provider-invoice-service';
import type { ProviderInvoiceListParams } from '../../services/syndic-provider-invoice-service';
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
import { useFormFieldModes } from '../../hooks/useFormFieldModes';
import { HelpButton, HelpSectionTitle } from '../../help';
import { displayCurrency } from '../../utils/syndic-currency';
import { montantSaisiProps } from '../../utils/montant-saisi';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { currencyFractionDigits } from './budget-money';

const { Paragraph, Title, Text } = Typography;

const INVOICE_STATUSES: ProviderInvoiceStatus[] = ['RECORDED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'];

// Accesseurs stables (hors du composant) : le filtrage des soldes reste mémoïsé.
const SOLDES_TEXTE = [(balance: ProviderBalance) => balance.providerName];
const SOLDES_ACCESSEURS = {
  due: (balance: ProviderBalance) => balance.totalDue,
  overdue: (balance: ProviderBalance) => balance.overdueDue > 0
};

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
  const { isMobile } = useBreakpoint();

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
  const fm = useFormFieldModes('syndic.facture-prestataire');

  useEffect(() => {
    void loadReferenceData();
  }, [tenantId, syndicId]);

  // Factures : liste paginée et filtrée par le serveur (préfixe d'URL « fa »).
  // Les critères partent à l'API ; l'onglet n'est monté que lorsqu'il est affiché.
  const contractOptions = useMemo(
    () =>
      contracts.map(contract => ({
        value: contract.id,
        label: contract.provider?.name ? `${contract.provider.name} · ${contract.nature}` : contract.nature
      })),
    [contracts]
  );
  const incidentOptions = useMemo(
    () =>
      incidents.map(incident => ({
        value: incident.id,
        label: incident.description.length > 80 ? `${incident.description.slice(0, 80)}…` : incident.description
      })),
    [incidents]
  );
  const criteria: SearchCriterion[] = [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Numéro de facture, libellé, prestataire…')
    },
    {
      key: 'providerId',
      type: 'select',
      label: t('Prestataire'),
      primary: true,
      options: providers.map(provider => ({ value: provider.id, label: provider.name }))
    },
    {
      key: 'status',
      type: 'multiSelect',
      label: t('Statut'),
      primary: true,
      options: INVOICE_STATUSES.map(status => ({ value: status, label: providerInvoiceStatusLabels[status] }))
    },
    { key: 'period', type: 'dateRange', label: t('Date de facture'), api: ['from', 'to'] },
    { key: 'contractId', type: 'select', label: t('Contrat'), options: contractOptions },
    { key: 'incidentId', type: 'select', label: t('Incident'), options: incidentOptions }
  ];
  const search = useListSearch({
    paramPrefix: 'fa',
    ariaLabel: t('Rechercher dans les factures'),
    apiNames: { sort: false },
    criteria
  });

  const invoicesQuery = useQuery({
    queryKey: ['syndic-provider-invoices', tenantId, syndicId, search.apiParams],
    queryFn: () => listProviderInvoices(tenantId, syndicId, search.apiParams as ProviderInvoiceListParams),
    staleTime: STALE_TIME.list,
    placeholderData: keepPreviousData
  });
  const items = invoicesQuery.data?.items ?? [];
  const total = invoicesQuery.data?.total ?? 0;
  const invoicesError = invoicesQuery.error as { response?: { data?: { error?: string } } } | null;
  const error = invoicesError ? invoicesError.response?.data?.error || t('Impossible de charger les factures') : null;
  const loadInvoices = async () => {
    await invoicesQuery.refetch();
  };

  // Soldes par prestataire : liste reçue en entier (un solde par prestataire facturé),
  // recherche et pagination locales (préfixe d'URL « so »).
  const balanceCriteria: SearchCriterion[] = [
    { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Nom du prestataire…') },
    { key: 'due', type: 'numberRange', label: t('Reste dû'), primary: true, unit: 'FCFA' },
    { key: 'overdue', type: 'boolean', label: t('Avec retard'), primary: true }
  ];
  const balanceSearch = useLocalListSearch<ProviderBalance>(balances, {
    paramPrefix: 'so',
    ariaLabel: t('Rechercher dans les soldes'),
    criteria: balanceCriteria,
    text: SOLDES_TEXTE,
    accessors: SOLDES_ACCESSEURS
  });

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
        // Un champ masqué n'est pas envoyé.
        contractId: (fm.isVisible('contractId') && values.contractId) || undefined,
        incidentId: (fm.isVisible('incidentId') && values.incidentId) || undefined,
        budgetLineItemId: (fm.isVisible('budgetLineItemId') && values.budgetLineItemId) || undefined,
        fundId: (fm.isVisible('fundId') && values.fundId) || undefined,
        expenseKind: values.expenseKind,
        number: values.number,
        label: values.label,
        invoiceDate: values.invoiceDate.toISOString(),
        dueDate: fm.isVisible('dueDate') && values.dueDate ? values.dueDate.toISOString() : undefined,
        amountHT: values.amountHT,
        vatAmount: values.vatAmount ?? 0,
        currency: values.currency || 'XOF',
        file: fm.isVisible('file') ? (createFile ?? undefined) : undefined
      });
      message.success(t('Facture {{number}} enregistrée', { number: values.number }));
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
      exportValue: row => Number(row.amountTTC),
      render: (_: unknown, row) => <MoneyValue value={row.amountTTC} currency={displayCurrency(row.currency)} />
    },
    {
      title: t('Payé'),
      key: 'amountPaid',
      align: 'end',
      exportValue: row => Number(row.amountPaid),
      render: (_: unknown, row) => <MoneyValue value={row.amountPaid} currency={displayCurrency(row.currency)} />
    },
    {
      title: t('Reste dû'),
      key: 'amountDue',
      align: 'end',
      exportValue: row => Number(row.amountDue),
      render: (_: unknown, row) => <MoneyValue value={row.amountDue} currency={displayCurrency(row.currency)} />
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
      exportable: false,
      render: (_: unknown, row) => (
        <Button
          size="small"
          aria-label={t('Ouvrir la facture {{number}}', { number: row.number })}
          onClick={() => setOpenInvoiceId(row.id)}
        >
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
      exportValue: row => Number(row.totalInvoiced),
      render: (_: unknown, row) => <MoneyValue value={row.totalInvoiced} currency={displayCurrency(row.currency)} />
    },
    {
      title: t('Total payé'),
      key: 'totalPaid',
      align: 'end',
      exportValue: row => Number(row.totalPaid),
      render: (_: unknown, row) => <MoneyValue value={row.totalPaid} currency={displayCurrency(row.currency)} />
    },
    {
      title: t('Reste dû'),
      key: 'totalDue',
      align: 'end',
      exportValue: row => Number(row.totalDue),
      render: (_: unknown, row) => <MoneyValue value={row.totalDue} currency={displayCurrency(row.currency)} />
    },
    {
      title: t('Dont en retard'),
      key: 'overdueDue',
      align: 'end',
      exportValue: row => Number(row.overdueDue),
      render: (_: unknown, row) => (
        <Text type={row.overdueDue > 0 ? 'danger' : undefined}>
          <MoneyValue value={row.overdueDue} currency={displayCurrency(row.currency)} />
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
          <HelpSectionTitle title={t('Factures des prestataires')} helpId="syndic.prestataires.factures" />
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
          {t('Enregistrer une facture')}
        </Button>
      </div>
      <Paragraph type="secondary" style={{ marginBottom: 0 }}>
        {t('Factures, pièces jointes et paiements partiels ou complets des prestataires.')}
      </Paragraph>

      <Card title={t('Soldes par prestataire')}>
        <DataView<ProviderBalance>
          {...balanceSearch.dataViewProps}
          helpId="syndic.prestataires.soldes"
          aria-label={t('Soldes par prestataire')}
          export={{ filename: t('Soldes par prestataire'), fetchAll: balanceSearch.exportAll }}
          rowKey={row => row.providerId}
          columns={balanceColumns}
          emptyDescription={t('Aucune facture enregistrée')}
          scrollX={760}
          renderCard={row => (
            <DataCard
              title={row.providerName}
              aria-label={row.providerName}
              highlight={<MoneyValue value={row.totalDue} currency={displayCurrency(row.currency)} />}
              fields={[
                { label: t('Factures'), value: row.invoicesCount },
                {
                  label: t('Total facturé'),
                  value: <MoneyValue value={row.totalInvoiced} currency={displayCurrency(row.currency)} />
                },
                {
                  label: t('Total payé'),
                  value: <MoneyValue value={row.totalPaid} currency={displayCurrency(row.currency)} />
                },
                {
                  label: t('Dont en retard'),
                  value: (
                    <Text type={row.overdueDue > 0 ? 'danger' : undefined}>
                      <MoneyValue value={row.overdueDue} currency={displayCurrency(row.currency)} />
                    </Text>
                  )
                }
              ]}
            />
          )}
        />
      </Card>

      <Card>
        <DataView<ProviderInvoice>
          {...search.dataViewProps}
          search={search.searchProps}
          items={items}
          total={total}
          helpId="syndic.prestataires.factures-liste"
          aria-label={t('Factures des prestataires')}
          loading={invoicesQuery.isLoading}
          isReloading={invoicesQuery.isFetching && !invoicesQuery.isLoading}
          error={error}
          errorCause={invoicesQuery.error}
          onRetry={() => void invoicesQuery.refetch()}
          emptyDescription={t('Aucune facture enregistrée')}
          emptyAction={{ label: t('Enregistrer une facture'), onClick: openCreateModal }}
          export={{
            filename: t('Factures des prestataires'),
            // Toutes les factures, avec les mêmes critères que la liste affichée.
            fetchAll: () =>
              collectAllPages<ProviderInvoice>(async (exportPage, limit) => {
                const data = await listProviderInvoices(tenantId, syndicId, {
                  ...search.filterParams,
                  page: exportPage,
                  limit
                } as ProviderInvoiceListParams);
                return { items: data.items, total: data.total };
              })
          }}
          rowKey={row => row.id}
          columns={columns}
          scrollX={1100}
          renderCard={row => (
            <DataCard
              title={`${row.number} — ${row.provider?.name || row.providerId}`}
              aria-label={t('Facture {{number}}', { number: row.number })}
              subtitle={row.label}
              highlight={<MoneyValue value={row.amountTTC} currency={displayCurrency(row.currency)} />}
              status={
                <Tag color={providerInvoiceStatusColors[row.status]}>{providerInvoiceStatusLabels[row.status]}</Tag>
              }
              fields={[
                { label: t('Date de facture'), value: dayjs(row.invoiceDate).format(dateFormat('short')) },
                {
                  label: t('Payé'),
                  value: <MoneyValue value={row.amountPaid} currency={displayCurrency(row.currency)} />
                },
                {
                  label: t('Reste dû'),
                  value: <MoneyValue value={row.amountDue} currency={displayCurrency(row.currency)} />
                },
                { label: t('Pièce'), value: row.hasFile ? t('Jointe') : t('Aucune') }
              ]}
              primaryAction={{ label: t('Ouvrir'), onClick: () => setOpenInvoiceId(row.id) }}
            />
          )}
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
        okText={t('Enregistrer la facture')}
        cancelText={t('Annuler')}
        confirmLoading={creating}
        maskClosable={!creating}
        // Plein écran sur téléphone : le clavier et les sélecteurs de date ne débordent plus.
        width={isMobile ? '100%' : 680}
        style={isMobile ? { top: 0, maxWidth: '100vw', paddingBottom: 0 } : undefined}
        afterOpenChange={visible => {
          if (visible) document.getElementById('invoice-provider')?.focus();
        }}
      >
        <HelpButton helpId="syndic.prestataires.facture-nouvelle" />
        <Form form={createForm} layout="vertical">
          <Form.Item
            label={t('Prestataire')}
            name="providerId"
            rules={[{ required: true, message: t('Choisissez le prestataire qui a émis la facture') }]}
          >
            <Select
              id="invoice-provider"
              showSearch
              optionFilterProp="label"
              options={providers.map(provider => ({ value: provider.id, label: provider.name }))}
              placeholder={t('Sélectionner un prestataire')}
            />
          </Form.Item>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label={t('Numéro de facture')}
                name="number"
                rules={[{ required: true, whitespace: true, message: t('Saisissez le numéro inscrit sur la facture') }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label={t('Libellé')}
                name="label"
                rules={[{ required: true, whitespace: true, message: t('Décrivez la facture en quelques mots') }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label={t('Date de facture')}
                name="invoiceDate"
                rules={[{ required: true, message: t('Choisissez la date de la facture') }]}
              >
                <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
              </Form.Item>
            </Col>
            {fm.isVisible('dueDate') && (
              <Col xs={24} md={12}>
                <Form.Item
                  label={t('Échéance')}
                  name="dueDate"
                  dependencies={['invoiceDate']}
                  rules={[
                    { required: fm.isRequired('dueDate', false), message: t("Choisissez la date d'échéance") },
                    ({ getFieldValue }) => ({
                      validator: (_rule, value) => {
                        const invoiceDate = getFieldValue('invoiceDate');
                        if (value && invoiceDate && dayjs(value).isBefore(dayjs(invoiceDate), 'day')) {
                          return Promise.reject(new Error(t("L'échéance ne peut pas précéder la date de facture")));
                        }
                        return Promise.resolve();
                      }
                    })
                  ]}
                >
                  <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
                </Form.Item>
              </Col>
            )}
          </Row>

          <Divider titlePlacement="start" plain>
            {t('Montants')}
          </Divider>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item
                label={t('Montant HT')}
                name="amountHT"
                rules={[{ required: true, message: t('Saisissez le montant hors taxes') }]}
              >
                <InputNumber
                  {...montantSaisiProps}
                  precision={currencyFractionDigits(createCurrency)}
                  min={0}
                  inputMode="decimal"
                  style={{ width: '100%' }}
                  addonAfter={displayCurrency(createCurrency || 'XOF') ?? 'FCFA'}
                  onChange={value => setCreateAmountHT(Number(value) || 0)}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label={t('TVA')} name="vatAmount">
                <InputNumber
                  {...montantSaisiProps}
                  precision={currencyFractionDigits(createCurrency)}
                  min={0}
                  inputMode="decimal"
                  style={{ width: '100%' }}
                  addonAfter={displayCurrency(createCurrency || 'XOF') ?? 'FCFA'}
                  onChange={value => setCreateVatAmount(Number(value) || 0)}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label={t('Montant TTC (calculé)')}>
                <Text strong>
                  <MoneyValue
                    value={createAmountHT + createVatAmount}
                    currency={displayCurrency(createCurrency || 'XOF')}
                  />
                </Text>
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label={t('Devise')} name="currency">
                <Input onChange={event => setCreateCurrency(event.target.value)} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label={t('Nature de la dépense')} name="expenseKind">
                <Select
                  options={[
                    { value: 'CURRENT', label: t('Charges courantes') },
                    { value: 'WORKS', label: t('Travaux') }
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider titlePlacement="start" plain>
            {t('Rattachement (facultatif)')}
          </Divider>
          <Row gutter={16}>
            {fm.isVisible('contractId') && (
              <Col xs={24} md={12}>
                <Form.Item
                  label={t('Contrat')}
                  name="contractId"
                  rules={[{ required: fm.isRequired('contractId', false), message: t('Choisissez un contrat') }]}
                >
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    options={contracts.map(contract => ({ value: contract.id, label: contract.nature }))}
                    placeholder={t('Sans contrat')}
                  />
                </Form.Item>
              </Col>
            )}
            {fm.isVisible('incidentId') && (
              <Col xs={24} md={12}>
                <Form.Item
                  label={t('Incident')}
                  name="incidentId"
                  rules={[{ required: fm.isRequired('incidentId', false), message: t('Choisissez un incident') }]}
                >
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    options={incidents.map(incident => ({ value: incident.id, label: incident.description }))}
                    placeholder={t('Sans incident')}
                  />
                </Form.Item>
              </Col>
            )}
            {fm.isVisible('budgetLineItemId') && (
              <Col xs={24} md={12}>
                <Form.Item
                  label={t('Ligne budgétaire')}
                  name="budgetLineItemId"
                  rules={[
                    {
                      required: fm.isRequired('budgetLineItemId', false),
                      message: t('Choisissez une ligne budgétaire')
                    }
                  ]}
                >
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    options={budgetLineOptions}
                    placeholder={t('Déduite du contrat si possible')}
                  />
                </Form.Item>
              </Col>
            )}
            {fm.isVisible('fundId') && (
              <Col xs={24} md={12}>
                <Form.Item
                  label={t('Fonds débité par défaut')}
                  name="fundId"
                  rules={[{ required: fm.isRequired('fundId', false), message: t('Choisissez un fonds') }]}
                >
                  <Select
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    options={funds.map(fund => ({ value: fund.id, label: fund.name }))}
                    placeholder={t('À choisir au moment du paiement')}
                  />
                </Form.Item>
              </Col>
            )}
          </Row>
          {fm.isVisible('file') && (
            <Form.Item
              label={t('Pièce jointe')}
              extra={t('PDF, PNG ou JPG. Facultatif : vous pourrez l’ajouter plus tard.')}
            >
              <Upload
                maxCount={1}
                accept=".pdf,.png,.jpg,.jpeg"
                beforeUpload={file => {
                  setCreateFile(file as unknown as File);
                  return false;
                }}
                onRemove={() => setCreateFile(null)}
              >
                <Button icon={<UploadOutlined />}>{t('Choisir un fichier')}</Button>
              </Upload>
            </Form.Item>
          )}
        </Form>
      </Modal>
    </Space>
  );
};
