import React, { useMemo, useState } from 'react';
import { App, Button, Col, Form, Input, InputNumber, Modal, Row, Select, Space, Tabs, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DataCard, DataView, MoneyValue, StatCard } from '../../components/primitives';
import { FundMovementsDrawer } from '../../components/syndics/FundMovementsDrawer';
import { ChargeCallsTab } from '../../components/syndics/finances/ChargeCallsTab';
import { OverdueTab } from '../../components/syndics/finances/OverdueTab';
import { PaymentsTab } from '../../components/syndics/finances/PaymentsTab';
import { financeLoadError } from '../../components/syndics/finances/finance-rows';
import { financeKeys } from '../../components/syndics/finances/query-keys';
import { useLocalTable } from '../../components/syndics/finances/useLocalTable';
import { useTabParam } from '../../components/syndics/finances/url-params';
import {
  adjustSyndicateFundBalance,
  createSyndicateFund,
  getOverdueDashboard,
  getSyndicFinanceSummary,
  renameSyndicateFund
} from '../../services/syndic-service';
import { FinanceSummary, OverdueDashboard } from '../../types/syndic-types';
import { useSyndicRouteContext } from './useSyndicRouteContext';
import { t } from '../../i18n/t';
import { displayCurrency } from '../../utils/syndic-currency';

const { Paragraph, Title } = Typography;

/** Onglets de l'écran, dans l'ordre d'affichage (le premier est le défaut de `?tab=`). */
const FINANCE_TABS = ['fonds', 'appels', 'paiements', 'impayes'] as const;
type FinanceTab = (typeof FINANCE_TABS)[number];

const EMPTY_DASHBOARD: OverdueDashboard = { items: [], totals: { overdueCount: 0, overdueAmount: 0 } };

interface FundRow {
  id: string;
  name: string;
  balance: number;
  currency: string;
}

function buildFundRows(summary: FinanceSummary | undefined): FundRow[] {
  if (!summary) return [];
  return summary.funds.map(fund => ({
    id: fund.id,
    name: fund.name,
    balance: Number(fund.balance),
    currency: fund.currency
  }));
}

/**
 * Finances d'une copropriété : cartes de synthèse, puis quatre onglets
 * paresseux (`?tab=`). Chaque onglet charge ses propres données quand il est
 * affiché — plus de chargement global. Convention d'URL : voir
 * `components/syndics/finances/url-params.ts`.
 */
export const SyndicFinances: React.FC = () => {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { tenantId: effectiveTenantId, syndicId } = useSyndicRouteContext();
  const [activeTab, setActiveTab] = useTabParam<FinanceTab>(FINANCE_TABS, 'fonds');

  const ready = Boolean(effectiveTenantId && syndicId);
  const tenantKey = effectiveTenantId ?? '';
  const syndicKey = syndicId ?? '';

  const summaryQuery = useQuery({
    queryKey: financeKeys.summary(tenantKey, syndicKey),
    queryFn: () => getSyndicFinanceSummary(tenantKey, syndicKey),
    enabled: ready
  });
  // Le tableau de bord des retards alimente deux cartes de synthèse ET l'onglet Impayés.
  const dashboardQuery = useQuery({
    queryKey: financeKeys.overdue(tenantKey, syndicKey),
    queryFn: () => getOverdueDashboard(tenantKey, syndicKey),
    enabled: ready
  });
  const summary = summaryQuery.data;
  const dashboard = dashboardQuery.data ?? EMPTY_DASHBOARD;

  const [fundModalOpen, setFundModalOpen] = useState(false);
  const [fundSubmitting, setFundSubmitting] = useState(false);
  const [fundForm] = Form.useForm();

  const [renameTarget, setRenameTarget] = useState<FundRow | null>(null);
  const [renameSubmitting, setRenameSubmitting] = useState(false);
  const [renameForm] = Form.useForm();

  const [adjustTarget, setAdjustTarget] = useState<FundRow | null>(null);
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [adjustForm] = Form.useForm();

  const [movementsTarget, setMovementsTarget] = useState<FundRow | null>(null);

  // Un fonds créé, renommé ou ajusté ne change que la synthèse (soldes, totaux).
  const refreshSummary = () => queryClient.invalidateQueries({ queryKey: financeKeys.summary(tenantKey, syndicKey) });

  const handleCreateFund = async () => {
    if (!effectiveTenantId || !syndicId) return;
    const values = await fundForm.validateFields();
    setFundSubmitting(true);
    try {
      await createSyndicateFund(effectiveTenantId, syndicId, {
        name: values.name,
        initialBalance: values.initialBalance ?? 0,
        currency: values.currency || 'XOF'
      });
      message.success(t('Fonds créé'));
      setFundModalOpen(false);
      fundForm.resetFields();
      await refreshSummary();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Création du fonds impossible'));
    } finally {
      setFundSubmitting(false);
    }
  };

  const handleRenameFund = async () => {
    if (!effectiveTenantId || !syndicId || !renameTarget) return;
    const values = await renameForm.validateFields();
    setRenameSubmitting(true);
    try {
      await renameSyndicateFund(effectiveTenantId, syndicId, renameTarget.id, { name: values.name });
      message.success(t('Fonds renommé'));
      setRenameTarget(null);
      await refreshSummary();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Renommage du fonds impossible'));
    } finally {
      setRenameSubmitting(false);
    }
  };

  const handleAdjustFund = async () => {
    if (!effectiveTenantId || !syndicId || !adjustTarget) return;
    const values = await adjustForm.validateFields();
    setAdjustSubmitting(true);
    try {
      const isExpense = values.kind === 'EXPENSE';
      const adjusted = await adjustSyndicateFundBalance(effectiveTenantId, syndicId, adjustTarget.id, {
        // Une dépense payée par le fonds le diminue toujours.
        direction: isExpense ? 'DEBIT' : values.direction,
        amount: values.amount,
        reason: values.reason,
        kind: isExpense ? 'EXPENSE' : 'ADJUSTMENT'
      });
      message.success(t('Solde du fonds ajusté'));
      // Permis (avance de trésorerie), mais le gestionnaire doit le voir.
      if (adjusted?.negativeBalance) {
        message.warning(t('Attention : le solde du fonds est désormais négatif.'));
      }
      setAdjustTarget(null);
      await refreshSummary();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Ajustement du fonds impossible'));
    } finally {
      setAdjustSubmitting(false);
    }
  };

  const fundRows = useMemo(() => buildFundRows(summary), [summary]);
  const fundsTable = useLocalTable(fundRows, 10);

  const fundColumns: ColumnsType<FundRow> = [
    { title: t('Fonds'), dataIndex: 'name', key: 'name' },
    {
      title: t('Solde'),
      dataIndex: 'balance',
      key: 'balance',
      align: 'end',
      sorter: true,
      render: (_: number, row) => <MoneyValue value={row.balance} />
    },
    {
      title: t('Actions'),
      key: 'actions',
      render: (_: unknown, row: FundRow) => (
        <Space size={8}>
          <Button
            size="small"
            onClick={() => {
              setRenameTarget(row);
              renameForm.setFieldsValue({ name: row.name });
            }}
          >
            {t('Renommer')}
          </Button>
          <Button
            size="small"
            onClick={() => {
              setAdjustTarget(row);
              adjustForm.resetFields();
              adjustForm.setFieldsValue({ kind: 'ADJUSTMENT', direction: 'CREDIT' });
            }}
          >
            {t('Ajuster le solde')}
          </Button>
          <Button size="small" onClick={() => setMovementsTarget(row)}>
            {t('Historique des mouvements')}
          </Button>
        </Space>
      )
    }
  ];

  const missingParams = ready ? null : t('Paramètres finances manquants');
  const fundsError = missingParams ?? financeLoadError(summaryQuery.error);

  const fundsPanel = (
    <DataView<FundRow>
      items={fundsTable.pageItems}
      total={fundsTable.total}
      page={fundsTable.page}
      pageSize={fundsTable.pageSize}
      onPageChange={fundsTable.onPageChange}
      sort={fundsTable.sort}
      onSortChange={fundsTable.onSortChange}
      loading={ready && summaryQuery.isLoading}
      error={fundsError}
      errorCause={summaryQuery.error}
      onRetry={() => void summaryQuery.refetch()}
      emptyDescription={t('Aucun fonds enregistré pour cette copropriété.')}
      columns={fundColumns}
      rowKey={row => row.id}
      aria-label={t('Détail des fonds')}
      export={{ filename: t('Détail des fonds'), fetchAll: async () => fundsTable.allItems }}
      renderCard={row => (
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <DataCard
              title={row.name}
              aria-label={row.name}
              highlight={<MoneyValue value={row.balance} />}
              primaryAction={{
                label: t('Ajuster le solde'),
                onClick: () => {
                  setAdjustTarget(row);
                  adjustForm.resetFields();
                  adjustForm.setFieldsValue({ kind: 'ADJUSTMENT', direction: 'CREDIT' });
                }
              }}
              secondaryActions={[
                {
                  key: 'mouvements',
                  label: t('Historique des mouvements'),
                  onClick: () => setMovementsTarget(row)
                }
              ]}
            />
          </div>
          <Button
            type="link"
            size="small"
            onClick={() => {
              setRenameTarget(row);
              renameForm.setFieldsValue({ name: row.name });
            }}
            style={{ marginTop: 'var(--space-2)' }}
          >
            {t('Renommer')}
          </Button>
        </div>
      )}
    />
  );

  const tabItems = [
    { key: 'fonds', label: t('Détail des fonds'), children: fundsPanel },
    {
      key: 'appels',
      label: t('Détail des appels de fonds'),
      children: ready ? <ChargeCallsTab tenantId={tenantKey} syndicId={syndicKey} /> : null
    },
    {
      key: 'paiements',
      label: t('Détail des paiements reçus'),
      children: ready ? <PaymentsTab tenantId={tenantKey} syndicId={syndicKey} /> : null
    },
    {
      key: 'impayes',
      label: t('Détail des impayés et retards'),
      children: ready ? (
        <OverdueTab
          tenantId={tenantKey}
          syndicId={syndicKey}
          dashboard={dashboard}
          dashboardLoading={dashboardQuery.isLoading}
          dashboardError={dashboardQuery.error}
          onRetryDashboard={() => void dashboardQuery.refetch()}
        />
      ) : null
    }
  ];

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <Space direction="vertical" size={4}>
            <Title level={2} style={{ margin: 0 }}>
              {t('Finances copropriété')}
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              {t('Soldes des fonds, appels émis, paiements et impayés.')}
            </Paragraph>
          </Space>

          <Button type="primary" icon={<PlusOutlined />} onClick={() => setFundModalOpen(true)}>
            {t('Nouveau fonds')}
          </Button>
        </div>

        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <StatCard
              label={t('Total fonds')}
              value={<MoneyValue value={summary?.totals.totalFundsBalance} />}
              onClick={() => setActiveTab('fonds')}
            />
          </Col>
          <Col xs={24} md={8}>
            <StatCard
              label={t('Total appelé')}
              value={<MoneyValue value={summary?.totals.totalCalled} />}
              onClick={() => setActiveTab('appels')}
            />
          </Col>
          <Col xs={24} md={8}>
            <StatCard
              label={t('Total payé')}
              value={<MoneyValue value={summary?.totals.totalPaid} />}
              onClick={() => setActiveTab('paiements')}
            />
          </Col>
          <Col xs={24} md={8}>
            <StatCard
              label={t('Reste à payer')}
              value={<MoneyValue value={summary?.totals.totalOutstanding} />}
              onClick={() => setActiveTab('appels')}
            />
          </Col>
          <Col xs={24} md={8}>
            <StatCard label={t('Total des avances')} value={<MoneyValue value={summary?.totals.totalAdvance} />} />
          </Col>
          <Col xs={24} md={8}>
            <StatCard
              label={t('Dossiers en retard')}
              value={dashboard.totals.overdueCount}
              tone={dashboard.totals.overdueCount > 0 ? 'danger' : 'neutral'}
              onClick={() => setActiveTab('impayes')}
            />
          </Col>
          <Col xs={24} md={8}>
            <StatCard
              label={t('Montant en retard')}
              value={<MoneyValue value={dashboard.totals.overdueAmount} />}
              tone={dashboard.totals.overdueAmount > 0 ? 'danger' : 'neutral'}
              onClick={() => setActiveTab('impayes')}
            />
          </Col>
        </Row>

        <Tabs
          activeKey={activeTab}
          onChange={key => setActiveTab(key as FinanceTab)}
          destroyOnHidden
          items={tabItems}
        />
      </Space>

      <Modal
        title={t('Créer un fonds')}
        open={fundModalOpen}
        onCancel={() => setFundModalOpen(false)}
        onOk={() => void handleCreateFund()}
        okText={t('Créer')}
        cancelText={t('Annuler')}
        confirmLoading={fundSubmitting}
      >
        <Form form={fundForm} layout="vertical" initialValues={{ currency: 'XOF', initialBalance: 0 }}>
          <Form.Item
            label={t('Nom du fonds')}
            name="name"
            rules={[{ required: true, message: t('Le nom du fonds est obligatoire') }]}
          >
            <Input placeholder={t('Compte courant')} />
          </Form.Item>
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item label={t('Solde initial')} name="initialBalance">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label={t('Devise')}
                name="currency"
                rules={[{ required: true, message: t('La devise est obligatoire') }]}
              >
                <Select options={[{ label: displayCurrency('XOF'), value: 'XOF' }]} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Modal
        title={t('Renommer le fonds')}
        open={Boolean(renameTarget)}
        onCancel={() => setRenameTarget(null)}
        onOk={() => void handleRenameFund()}
        okText={t('Enregistrer')}
        cancelText={t('Annuler')}
        confirmLoading={renameSubmitting}
      >
        <Form form={renameForm} layout="vertical">
          <Form.Item
            label={t('Nom du fonds')}
            name="name"
            rules={[{ required: true, message: t('Le nom du fonds est obligatoire') }]}
          >
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('Ajuster le solde du fonds')}
        open={Boolean(adjustTarget)}
        onCancel={() => setAdjustTarget(null)}
        onOk={() => void handleAdjustFund()}
        okText={t('Appliquer')}
        cancelText={t('Annuler')}
        confirmLoading={adjustSubmitting}
      >
        {adjustTarget ? (
          <Paragraph type="secondary">
            {t('Solde actuel')} : <MoneyValue value={adjustTarget.balance} />
          </Paragraph>
        ) : null}
        <Form form={adjustForm} layout="vertical" initialValues={{ kind: 'ADJUSTMENT', direction: 'CREDIT' }}>
          <Form.Item label={t('Nature du mouvement')} name="kind" rules={[{ required: true }]}>
            <Select
              options={[
                { label: t('Ajustement'), value: 'ADJUSTMENT' },
                { label: t('Dépense payée par le fonds'), value: 'EXPENSE' }
              ]}
              onChange={value => {
                if (value === 'EXPENSE') adjustForm.setFieldsValue({ direction: 'DEBIT' });
              }}
            />
          </Form.Item>
          <Form.Item noStyle dependencies={['kind']}>
            {({ getFieldValue }) => (
              <Form.Item label={t('Direction')} name="direction" rules={[{ required: true }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  disabled={getFieldValue('kind') === 'EXPENSE'}
                  options={[
                    { label: t('Crédit (augmenter le solde)'), value: 'CREDIT' },
                    { label: t('Débit (diminuer le solde)'), value: 'DEBIT' }
                  ]}
                />
              </Form.Item>
            )}
          </Form.Item>
          <Form.Item
            label={t('Montant')}
            name="amount"
            rules={[{ required: true, message: t('Le montant est obligatoire') }]}
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            label={t('Motif')}
            name="reason"
            rules={[{ required: true, message: t('Le motif est obligatoire') }]}
          >
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {effectiveTenantId && syndicId ? (
        <FundMovementsDrawer
          tenantId={effectiveTenantId}
          syndicId={syndicId}
          fund={movementsTarget}
          onClose={() => setMovementsTarget(null)}
        />
      ) : null}
    </>
  );
};
