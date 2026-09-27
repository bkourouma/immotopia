import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Col, Form, Input, InputNumber, Modal, Row, Select, Space, Tag, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { DataCard, DataView, MoneyValue, StatCard } from '../../components/primitives';
import { FundMovementsDrawer } from '../../components/syndics/FundMovementsDrawer';
import type { Sort } from '../../hooks/useListParams';
import {
  adjustSyndicateFundBalance,
  createSyndicateFund,
  getOverdueDashboard,
  getSyndicFinanceSummary,
  listAllChargeCalls,
  listPaymentReminders,
  renameSyndicateFund
} from '../../services/syndic-service';
import {
  ChargeCall,
  ChargeCallStatus,
  FinanceSummary,
  OverdueDashboard,
  PaymentReminder,
  SyndicateLot
} from '../../types/syndic-types';
import { useSyndicRouteContext } from './useSyndicRouteContext';
import { formatLotLabel } from '../../utils/syndic-lot-label';
import { dateFormat } from '../../i18n/format';
import { t } from '../../i18n/t';

const { Paragraph, Title } = Typography;

/**
 * Étiquettes de statut d'un appel de charges — mêmes clés que
 * `ChargeCallTable` (composants/syndics), pour ne pas dupliquer la
 * traduction sous une forme légèrement différente.
 */
const chargeStatusConfig: Record<ChargeCallStatus, { color: string; label: string }> = {
  PENDING: { color: 'gold', label: t('En attente') },
  PARTIAL: { color: 'blue', label: t('Partiel') },
  PAID: { color: 'green', label: t('Payé') },
  OVERDUE: { color: 'red', label: t('En retard') }
};

type LotWithOwner = SyndicateLot & {
  owner?: { id: string; firstName?: string | null; lastName?: string | null; email?: string | null } | null;
};

function ownerLabel(
  owner?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null
): string {
  if (!owner) return t('Sans copropriétaire');
  const name = [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim();
  return name || owner.email || t('Copropriétaire');
}

function shortReference(id: string): string {
  return `APPEL-${id.slice(0, 8).toUpperCase()}`;
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Tri et pagination d'une liste déjà chargée en mémoire, appliqués côté
 * client.
 *
 * Les quatre tableaux de cette page partagent une seule requête combinée
 * (résumé + appels + retards + relances) : il n'y a pas de pagination serveur
 * à interroger de nouveau à chaque page ou tri. Ce hook rejoue localement le
 * contrat attendu par `<DataView>` — page courante, total, tri — pour que les
 * quatre tableaux se comportent de façon identique.
 */
function useLocalTable<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<Sort | null>(null);

  useEffect(() => {
    setPage(1);
  }, [items]);

  const sorted = useMemo(() => {
    if (!sort) return items;
    const { field, order } = sort;
    return [...items].sort((a, b) => {
      const av = (a as Record<string, unknown>)[field];
      const bv = (b as Record<string, unknown>)[field];
      if (av === bv) return 0;
      if (av === null || av === undefined) return order === 'asc' ? -1 : 1;
      if (bv === null || bv === undefined) return order === 'asc' ? 1 : -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return order === 'asc' ? av - bv : bv - av;
      }
      const as = String(av);
      const bs = String(bv);
      return order === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
    });
  }, [items, sort]);

  const total = sorted.length;
  const pageItems = useMemo(
    () => sorted.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize),
    [sorted, page, pageSize]
  );

  return {
    pageItems,
    total,
    page,
    pageSize,
    onPageChange: (nextPage: number) => setPage(nextPage),
    sort,
    onSortChange: (nextSort: Sort | null) => {
      setSort(nextSort);
      setPage(1);
    }
  };
}

interface FundRow {
  id: string;
  name: string;
  balance: number;
  currency: string;
}

interface ChargeRow {
  id: string;
  reference: string;
  period: string;
  lotLabel: string;
  ownerLabel: string;
  amount: number;
  paid: number;
  outstanding: number;
  dueDate: string;
  status: ChargeCallStatus;
}

interface PaymentRow {
  id: string;
  paidAt: string;
  lotLabel: string;
  ownerLabel: string;
  chargeReference: string;
  amount: number;
  method: string;
}

interface OverdueRow {
  chargeCallId: string;
  lotLabel: string;
  ownerLabel: string;
  outstanding: number;
  daysLate: number;
  remindersCount: number;
}

function buildFundRows(summary: FinanceSummary | null): FundRow[] {
  if (!summary) return [];
  return summary.funds.map(fund => ({
    id: fund.id,
    name: fund.name,
    balance: Number(fund.balance),
    currency: fund.currency
  }));
}

function buildChargeRows(charges: ChargeCall[]): ChargeRow[] {
  return charges.map(charge => {
    const lot = charge.lot as LotWithOwner | undefined;
    // Lot S2 : `paidAmount`/`outstandingAmount` sont calculés côté API à
    // partir des affectations ; repli sur `payments[]` si absents.
    const amount = Number(charge.amount);
    const paid =
      charge.paidAmount !== undefined
        ? Number(charge.paidAmount)
        : (charge.payments || []).reduce((sum, payment) => sum + Number(payment.amount), 0);
    return {
      id: charge.id,
      reference: shortReference(charge.id),
      period: charge.period,
      lotLabel: formatLotLabel(lot, charge.lotId),
      ownerLabel: ownerLabel(lot?.owner),
      amount,
      paid,
      outstanding:
        charge.outstandingAmount !== undefined ? Number(charge.outstandingAmount) : Math.max(0, amount - paid),
      dueDate: charge.dueDate,
      status: charge.status
    };
  });
}

function buildPaymentRows(charges: ChargeCall[]): PaymentRow[] {
  const rows: PaymentRow[] = [];
  for (const charge of charges) {
    const lot = charge.lot as LotWithOwner | undefined;
    for (const payment of charge.payments || []) {
      rows.push({
        id: payment.id,
        paidAt: payment.paidAt,
        lotLabel: formatLotLabel(lot, charge.lotId),
        ownerLabel: ownerLabel(lot?.owner),
        chargeReference: `${charge.period} · ${shortReference(charge.id)}`,
        amount: Number(payment.amount),
        method: payment.method || '—'
      });
    }
  }
  return rows;
}

function buildOverdueRows(dashboard: OverdueDashboard, reminders: PaymentReminder[]): OverdueRow[] {
  const reminderCounts = new Map<string, number>();
  for (const reminder of reminders) {
    reminderCounts.set(reminder.chargeCallId, (reminderCounts.get(reminder.chargeCallId) || 0) + 1);
  }
  return dashboard.items.map(item => ({
    chargeCallId: item.chargeCallId,
    lotLabel: formatLotLabel({ lotNumber: item.lotNumber, property: item.property }, item.lotNumber),
    ownerLabel: ownerLabel(item.owner),
    outstanding: item.outstanding,
    daysLate: item.daysLate,
    remindersCount: reminderCounts.get(item.chargeCallId) || 0
  }));
}

export const SyndicFinances: React.FC = () => {
  const { message } = App.useApp();
  const { tenantId: effectiveTenantId, syndicId } = useSyndicRouteContext();

  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [charges, setCharges] = useState<ChargeCall[]>([]);
  const [dashboard, setDashboard] = useState<OverdueDashboard>({
    items: [],
    totals: { overdueCount: 0, overdueAmount: 0 }
  });
  const [reminders, setReminders] = useState<PaymentReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!effectiveTenantId || !syndicId) {
      setLoading(false);
      setError(t('Paramètres finances manquants'));
      return;
    }
    void loadAll();
  }, [effectiveTenantId, syndicId]);

  const loadAll = async () => {
    if (!effectiveTenantId || !syndicId) return;
    setLoading(true);
    setError(null);
    try {
      const [summaryData, chargesData, dashboardData, remindersData] = await Promise.all([
        getSyndicFinanceSummary(effectiveTenantId, syndicId),
        listAllChargeCalls(effectiveTenantId, syndicId),
        getOverdueDashboard(effectiveTenantId, syndicId),
        listPaymentReminders(effectiveTenantId, syndicId, { page: 1, limit: 100 })
      ]);
      setSummary(summaryData);
      setCharges(chargesData);
      setDashboard(dashboardData);
      setReminders(remindersData);
    } catch (err: any) {
      setError(err.response?.data?.error || t('Impossible de charger la synthèse financière'));
    } finally {
      setLoading(false);
    }
  };

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
      await loadAll();
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
      await loadAll();
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
      await adjustSyndicateFundBalance(effectiveTenantId, syndicId, adjustTarget.id, {
        direction: values.direction,
        amount: values.amount,
        reason: values.reason
      });
      message.success(t('Solde du fonds ajusté'));
      setAdjustTarget(null);
      await loadAll();
    } catch (err: any) {
      message.error(err.response?.data?.error || t('Ajustement du fonds impossible'));
    } finally {
      setAdjustSubmitting(false);
    }
  };

  const fundRows = useMemo(() => buildFundRows(summary), [summary]);
  const chargeRows = useMemo(() => buildChargeRows(charges), [charges]);
  const paymentRows = useMemo(() => buildPaymentRows(charges), [charges]);
  const overdueRows = useMemo(() => buildOverdueRows(dashboard, reminders), [dashboard, reminders]);

  const fundsTable = useLocalTable(fundRows, 10);
  const chargesTable = useLocalTable(chargeRows, 10);
  const paymentsTable = useLocalTable(paymentRows, 10);
  const overdueTable = useLocalTable(overdueRows, 10);

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
              adjustForm.setFieldsValue({ direction: 'CREDIT' });
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

  const chargeColumns: ColumnsType<ChargeRow> = [
    { title: t('Référence'), dataIndex: 'reference', key: 'reference' },
    { title: t('Période'), dataIndex: 'period', key: 'period', sorter: true },
    { title: t('Lot'), dataIndex: 'lotLabel', key: 'lotLabel' },
    { title: t('Copropriétaire'), dataIndex: 'ownerLabel', key: 'ownerLabel' },
    {
      title: t('Montant appelé'),
      dataIndex: 'amount',
      key: 'amount',
      align: 'end',
      sorter: true,
      render: (_: number, row) => <MoneyValue value={row.amount} />
    },
    {
      title: t('Payé'),
      dataIndex: 'paid',
      key: 'paid',
      align: 'end',
      sorter: true,
      render: (_: number, row) => <MoneyValue value={row.paid} />
    },
    {
      title: t('Reste'),
      dataIndex: 'outstanding',
      key: 'outstanding',
      align: 'end',
      sorter: true,
      render: (_: number, row) => <MoneyValue value={row.outstanding} />
    },
    {
      title: t('Échéance'),
      dataIndex: 'dueDate',
      key: 'dueDate',
      sorter: true,
      render: (value: string) => dayjs(value).format(dateFormat('short'))
    },
    {
      title: t('Statut'),
      dataIndex: 'status',
      key: 'status',
      render: (value: ChargeCallStatus) => (
        <Tag color={chargeStatusConfig[value].color}>{chargeStatusConfig[value].label}</Tag>
      )
    }
  ];

  const paymentColumns: ColumnsType<PaymentRow> = [
    {
      title: t('Date'),
      dataIndex: 'paidAt',
      key: 'paidAt',
      sorter: true,
      render: (value: string) => dayjs(value).format(dateFormat('short'))
    },
    { title: t('Lot'), dataIndex: 'lotLabel', key: 'lotLabel' },
    { title: t('Copropriétaire'), dataIndex: 'ownerLabel', key: 'ownerLabel' },
    { title: t('Appel concerné'), dataIndex: 'chargeReference', key: 'chargeReference' },
    {
      title: t('Montant'),
      dataIndex: 'amount',
      key: 'amount',
      align: 'end',
      sorter: true,
      render: (_: number, row) => <MoneyValue value={row.amount} />
    },
    { title: t('Mode'), dataIndex: 'method', key: 'method' }
  ];

  const overdueColumns: ColumnsType<OverdueRow> = [
    { title: t('Lot'), dataIndex: 'lotLabel', key: 'lotLabel' },
    { title: t('Copropriétaire'), dataIndex: 'ownerLabel', key: 'ownerLabel' },
    {
      title: t('Montant dû'),
      dataIndex: 'outstanding',
      key: 'outstanding',
      align: 'end',
      sorter: true,
      render: (_: number, row) => <MoneyValue value={row.outstanding} />
    },
    { title: t('Jours de retard'), dataIndex: 'daysLate', key: 'daysLate', align: 'end', sorter: true },
    { title: t('Relances'), dataIndex: 'remindersCount', key: 'remindersCount', align: 'end', sorter: true }
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
              onClick={() => scrollToSection('finances-fonds')}
            />
          </Col>
          <Col xs={24} md={8}>
            <StatCard
              label={t('Total appelé')}
              value={<MoneyValue value={summary?.totals.totalCalled} />}
              onClick={() => scrollToSection('finances-appels')}
            />
          </Col>
          <Col xs={24} md={8}>
            <StatCard
              label={t('Total payé')}
              value={<MoneyValue value={summary?.totals.totalPaid} />}
              onClick={() => scrollToSection('finances-paiements')}
            />
          </Col>
          <Col xs={24} md={8}>
            <StatCard
              label={t('Reste à payer')}
              value={<MoneyValue value={summary?.totals.totalOutstanding} />}
              onClick={() => scrollToSection('finances-appels')}
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
              onClick={() => scrollToSection('finances-retards')}
            />
          </Col>
          <Col xs={24} md={8}>
            <StatCard
              label={t('Montant en retard')}
              value={<MoneyValue value={dashboard.totals.overdueAmount} />}
              tone={dashboard.totals.overdueAmount > 0 ? 'danger' : 'neutral'}
              onClick={() => scrollToSection('finances-retards')}
            />
          </Col>
        </Row>

        <div id="finances-fonds">
          <Card title={t('Détail des fonds')}>
            <DataView<FundRow>
              items={fundsTable.pageItems}
              total={fundsTable.total}
              page={fundsTable.page}
              pageSize={fundsTable.pageSize}
              onPageChange={fundsTable.onPageChange}
              sort={fundsTable.sort}
              onSortChange={fundsTable.onSortChange}
              loading={loading}
              error={error}
              onRetry={() => void loadAll()}
              emptyDescription={t('Aucun fonds enregistré pour cette copropriété.')}
              columns={fundColumns}
              rowKey={row => row.id}
              aria-label={t('Détail des fonds')}
              renderCard={row => (
                <DataCard
                  title={row.name}
                  aria-label={row.name}
                  highlight={<MoneyValue value={row.balance} />}
                  primaryAction={{
                    label: t('Ajuster le solde'),
                    onClick: () => {
                      setAdjustTarget(row);
                      adjustForm.resetFields();
                      adjustForm.setFieldsValue({ direction: 'CREDIT' });
                    }
                  }}
                  secondaryActions={[
                    {
                      key: 'renommer',
                      label: t('Renommer'),
                      onClick: () => {
                        setRenameTarget(row);
                        renameForm.setFieldsValue({ name: row.name });
                      }
                    },
                    {
                      key: 'mouvements',
                      label: t('Historique des mouvements'),
                      onClick: () => setMovementsTarget(row)
                    }
                  ]}
                />
              )}
            />
          </Card>
        </div>

        <div id="finances-appels">
          <Card title={t('Détail des appels de fonds')}>
            <DataView<ChargeRow>
              items={chargesTable.pageItems}
              total={chargesTable.total}
              page={chargesTable.page}
              pageSize={chargesTable.pageSize}
              onPageChange={chargesTable.onPageChange}
              sort={chargesTable.sort}
              onSortChange={chargesTable.onSortChange}
              loading={loading}
              error={error}
              onRetry={() => void loadAll()}
              emptyDescription={t('Aucun appel de charges enregistré pour cette copropriété.')}
              columns={chargeColumns}
              rowKey={row => row.id}
              aria-label={t('Détail des appels de fonds')}
              scrollX={1100}
              renderCard={row => (
                <DataCard
                  title={`${row.lotLabel} — ${row.ownerLabel}`}
                  aria-label={row.reference}
                  subtitle={`${row.reference} · ${row.period}`}
                  highlight={<MoneyValue value={row.amount} />}
                  status={
                    <Tag color={chargeStatusConfig[row.status].color}>{chargeStatusConfig[row.status].label}</Tag>
                  }
                  fields={[
                    { label: t('Payé'), value: <MoneyValue value={row.paid} /> },
                    { label: t('Reste'), value: <MoneyValue value={row.outstanding} /> },
                    { label: t('Échéance'), value: dayjs(row.dueDate).format(dateFormat('short')) }
                  ]}
                />
              )}
            />
          </Card>
        </div>

        <div id="finances-paiements">
          <Card title={t('Détail des paiements reçus')}>
            <DataView<PaymentRow>
              items={paymentsTable.pageItems}
              total={paymentsTable.total}
              page={paymentsTable.page}
              pageSize={paymentsTable.pageSize}
              onPageChange={paymentsTable.onPageChange}
              sort={paymentsTable.sort}
              onSortChange={paymentsTable.onSortChange}
              loading={loading}
              error={error}
              onRetry={() => void loadAll()}
              emptyDescription={t('Aucun paiement enregistré pour cette copropriété.')}
              columns={paymentColumns}
              rowKey={row => row.id}
              aria-label={t('Détail des paiements reçus')}
              scrollX={1000}
              renderCard={row => (
                <DataCard
                  title={`${row.lotLabel} — ${row.ownerLabel}`}
                  aria-label={row.id}
                  subtitle={`${dayjs(row.paidAt).format(dateFormat('short'))} · ${row.chargeReference}`}
                  highlight={<MoneyValue value={row.amount} />}
                  fields={[{ label: t('Mode'), value: row.method }]}
                />
              )}
            />
          </Card>
        </div>

        <div id="finances-retards">
          <Card title={t('Détail des impayés et retards')}>
            <DataView<OverdueRow>
              items={overdueTable.pageItems}
              total={overdueTable.total}
              page={overdueTable.page}
              pageSize={overdueTable.pageSize}
              onPageChange={overdueTable.onPageChange}
              sort={overdueTable.sort}
              onSortChange={overdueTable.onSortChange}
              loading={loading}
              error={error}
              onRetry={() => void loadAll()}
              emptyDescription={t('Aucun dossier en retard pour cette copropriété.')}
              columns={overdueColumns}
              rowKey={row => row.chargeCallId}
              aria-label={t('Détail des impayés et retards')}
              renderCard={row => (
                <DataCard
                  title={`${row.lotLabel} — ${row.ownerLabel}`}
                  aria-label={row.lotLabel}
                  highlight={<MoneyValue value={row.outstanding} />}
                  fields={[
                    { label: t('Jours de retard'), value: row.daysLate },
                    { label: t('Relances'), value: row.remindersCount }
                  ]}
                />
              )}
            />
          </Card>
        </div>
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
                <Input />
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
        <Form form={adjustForm} layout="vertical" initialValues={{ direction: 'CREDIT' }}>
          <Form.Item label={t('Direction')} name="direction" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={[
                { label: t('Crédit (augmenter le solde)'), value: 'CREDIT' },
                { label: t('Débit (diminuer le solde)'), value: 'DEBIT' }
              ]}
            />
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
