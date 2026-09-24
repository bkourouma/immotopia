import React, { useEffect, useMemo, useState } from 'react';
import { Card, Col, Row, Space, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { DataCard, DataView, MoneyValue, StatCard } from '../../components/primitives';
import type { Sort } from '../../hooks/useListParams';
import {
  getOverdueDashboard,
  getSyndicFinanceSummary,
  listAllChargeCalls,
  listPaymentReminders
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
  PAID: { color: 'green', label: t('Paye') },
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

function lotLabel(
  lotNumber: string,
  property?: { title?: string | null; address?: string | null; internalReference?: string | null } | null
): string {
  const title = property?.title?.trim();
  const address = property?.address?.trim();
  const internalReference = property?.internalReference?.trim();
  const isTechnicalReference = Boolean(title && /^PROP-\d{8}-[A-Z0-9]{4}-\d{4}$/i.test(title));

  if (title && !isTechnicalReference) return `${lotNumber} — ${title}`;
  if (address) return `${lotNumber} — ${address}`;
  if (internalReference) return `${lotNumber} — ${internalReference}`;
  return lotNumber;
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
  return summary.funds.map(fund => ({ id: fund.id, name: fund.name, balance: Number(fund.balance) }));
}

function buildChargeRows(charges: ChargeCall[]): ChargeRow[] {
  return charges.map(charge => {
    const lot = charge.lot as LotWithOwner | undefined;
    const paid = (charge.payments || []).reduce((sum, payment) => sum + Number(payment.amount), 0);
    const amount = Number(charge.amount);
    return {
      id: charge.id,
      reference: shortReference(charge.id),
      period: charge.period,
      lotLabel: lotLabel(lot?.lotNumber || charge.lotId, lot?.property),
      ownerLabel: ownerLabel(lot?.owner),
      amount,
      paid,
      outstanding: Math.max(0, amount - paid),
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
        lotLabel: lotLabel(lot?.lotNumber || charge.lotId, lot?.property),
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
    lotLabel: lotLabel(item.lotNumber, item.property),
    ownerLabel: ownerLabel(item.owner),
    outstanding: item.outstanding,
    daysLate: item.daysLate,
    remindersCount: reminderCounts.get(item.chargeCallId) || 0
  }));
}

export const SyndicFinances: React.FC = () => {
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
      setError(err.response?.data?.error || t('Impossible de charger la synthese financiere'));
    } finally {
      setLoading(false);
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
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Space direction="vertical" size={4}>
        <Title level={2} style={{ margin: 0 }}>
          {t('Finances copropriété')}
        </Title>
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          {t('Soldes des fonds, appels émis, paiements et impayés.')}
        </Paragraph>
      </Space>

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
            label={t('Total appele')}
            value={<MoneyValue value={summary?.totals.totalCalled} />}
            onClick={() => scrollToSection('finances-appels')}
          />
        </Col>
        <Col xs={24} md={8}>
          <StatCard
            label={t('Total paye')}
            value={<MoneyValue value={summary?.totals.totalPaid} />}
            onClick={() => scrollToSection('finances-paiements')}
          />
        </Col>
        <Col xs={24} md={8}>
          <StatCard
            label={t('Reste a payer')}
            value={<MoneyValue value={summary?.totals.totalOutstanding} />}
            onClick={() => scrollToSection('finances-appels')}
          />
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
              <DataCard title={row.name} aria-label={row.name} highlight={<MoneyValue value={row.balance} />} />
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
                status={<Tag color={chargeStatusConfig[row.status].color}>{chargeStatusConfig[row.status].label}</Tag>}
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
  );
};
