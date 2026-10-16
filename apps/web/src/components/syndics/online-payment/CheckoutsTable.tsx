import React, { useCallback, useEffect, useState } from 'react';
import { App, Alert, Button, Card, Radio, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SafetyCertificateOutlined, SyncOutlined } from '@ant-design/icons';
import { MoneyValue, formatMoney } from '../../primitives';
import {
  CheckoutOrigin,
  OnlineCheckoutStatus,
  Pagination,
  SyndicOnlineCheckoutRow,
  listSyndicOnlineCheckouts,
  verifySyndicOnlineCheckout
} from '../../../services/syndic-online-payment-service';
import { displayCurrency } from '../../../utils/syndic-currency';
import { t } from '../../../i18n/t';
import { STATUS_COLOR, STATUS_ORDER, apiErrorMessage, formatDateTime, originLabel, statusLabel } from './helpers';

const { Text } = Typography;

type Counts = Record<OnlineCheckoutStatus, number>;
const EMPTY_COUNTS: Counts = { PENDING: 0, SUCCESS: 0, FAILED: 0, CANCELED: 0, EXPIRED: 0, REVIEW: 0 };

export interface CheckoutsTableProps {
  tenantId: string;
  syndicId: string;
  /** Change quand une autre partie de l'écran a modifié des paiements. */
  refreshToken?: number;
  /** Ouvre la décision d'un paiement `REVIEW`. */
  onDecide: (row: SyndicOnlineCheckoutRow) => void;
  /** Un paiement a changé d'état à la suite d'un « Vérifier » : les soldes ont pu bouger. */
  onChanged?: () => void;
}

/** Suivi des paiements en ligne de la copropriété (contrat §1.5 et §1.6). */
export const CheckoutsTable: React.FC<CheckoutsTableProps> = ({
  tenantId,
  syndicId,
  refreshToken = 0,
  onDecide,
  onChanged
}) => {
  const { message } = App.useApp();
  const [items, setItems] = useState<SyndicOnlineCheckoutRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<OnlineCheckoutStatus | 'ALL'>('ALL');
  const [originFilter, setOriginFilter] = useState<CheckoutOrigin | undefined>(undefined);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const load = useCallback(
    async (page = 1, limit = 20) => {
      setLoading(true);
      setError(null);
      try {
        const result = await listSyndicOnlineCheckouts(tenantId, syndicId, {
          status: statusFilter === 'ALL' ? undefined : [statusFilter],
          origin: originFilter,
          page,
          limit
        });
        setItems(result.items);
        setPagination(result.pagination);
        setCounts({ ...EMPTY_COUNTS, ...result.counts });
      } catch (e) {
        setError(apiErrorMessage(e, t('Impossible de charger les paiements en ligne')));
      } finally {
        setLoading(false);
      }
    },
    [tenantId, syndicId, statusFilter, originFilter]
  );

  useEffect(() => {
    void load(1, pagination.limit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, refreshToken]);

  const handleVerify = async (row: SyndicOnlineCheckoutRow) => {
    setVerifyingId(row.id);
    try {
      const result = await verifySyndicOnlineCheckout(tenantId, syndicId, row.id);
      if (result.changed) {
        message.success(
          t('Paiement {{code}} : statut mis à jour ({{status}})', {
            code: row.codePaiement,
            status: statusLabel(result.checkout.status)
          })
        );
        onChanged?.();
      } else {
        message.info(t('Aucun changement chez le fournisseur'));
      }
      await load(pagination.page, pagination.limit);
    } catch (e) {
      message.error(apiErrorMessage(e, t('La vérification a échoué')));
    } finally {
      setVerifyingId(null);
    }
  };

  const totalCount = STATUS_ORDER.reduce((sum, status) => sum + (counts[status] ?? 0), 0);

  const columns: ColumnsType<SyndicOnlineCheckoutRow> = [
    {
      title: t('Date'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value: string) => formatDateTime(value)
    },
    {
      title: t('Code'),
      dataIndex: 'codePaiement',
      key: 'codePaiement',
      render: (value: string, row) => (
        <Space direction="vertical" size={0}>
          <Text copyable={{ text: value }}>{value}</Text>
          {row.mode === 'SIMULATOR' ? <Tag>{t('Simulateur')}</Tag> : null}
        </Space>
      )
    },
    {
      title: t('Lot'),
      key: 'lot',
      render: (_: unknown, row) => row.lot.lotNumber
    },
    {
      title: t('Payeur'),
      key: 'payer',
      render: (_: unknown, row) => row.payer?.name ?? <Text type="secondary">{t('Fiche introuvable')}</Text>
    },
    {
      title: t('Appels'),
      key: 'calls',
      render: (_: unknown, row) => row.chargeCalls.map(call => call.period).join(', ') || '—'
    },
    {
      title: t('Montant'),
      key: 'amount',
      align: 'end',
      render: (_: unknown, row) => (
        <Space direction="vertical" size={0} style={{ textAlign: 'end' }}>
          <MoneyValue value={row.amount} currency={displayCurrency(row.currency)} />
          {row.receivedAmount !== null && row.receivedAmount !== row.amount ? (
            <Text type="warning" style={{ fontSize: 12 }}>
              {t('Reçu : {{amount}}', {
                amount: formatMoney(row.receivedAmount, { currency: displayCurrency(row.currency) })
              })}
            </Text>
          ) : null}
        </Space>
      )
    },
    {
      title: t('Origine'),
      dataIndex: 'origin',
      key: 'origin',
      render: (value: CheckoutOrigin, row) => (
        <Space direction="vertical" size={0}>
          <span>{originLabel(value)}</span>
          {row.providerServiceName ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {row.providerServiceName}
            </Text>
          ) : null}
        </Space>
      )
    },
    {
      title: t('Statut'),
      key: 'status',
      render: (_: unknown, row) => (
        <Space direction="vertical" size={0}>
          <Tag color={STATUS_COLOR[row.status]}>{statusLabel(row.status)}</Tag>
          {row.status === 'REVIEW' && row.reviewReason ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {row.reviewReason}
            </Text>
          ) : null}
          {row.failureMessage && row.status !== 'REVIEW' ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {row.failureMessage}
            </Text>
          ) : null}
        </Space>
      )
    },
    {
      title: t('Actions'),
      key: 'actions',
      render: (_: unknown, row) => {
        const verifiable = row.status === 'PENDING' || row.status === 'REVIEW';
        return (
          <Space wrap>
            {verifiable ? (
              <Button
                size="small"
                icon={<SyncOutlined aria-hidden />}
                loading={verifyingId === row.id}
                onClick={() => void handleVerify(row)}
              >
                {t('Vérifier')}
              </Button>
            ) : null}
            {row.status === 'REVIEW' ? (
              <Button
                size="small"
                type="primary"
                icon={<SafetyCertificateOutlined aria-hidden />}
                onClick={() => onDecide(row)}
              >
                {t('Trancher')}
              </Button>
            ) : null}
          </Space>
        );
      }
    }
  ];

  return (
    <Card title={t('Paiements en ligne')}>
      {counts.REVIEW > 0 && statusFilter !== 'REVIEW' ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('{{count}} paiement(s) à trancher', { count: counts.REVIEW })}
          description={t(
            'Ces paiements ont été encaissés chez le fournisseur mais n’ont pas pu être enregistrés automatiquement.'
          )}
          action={
            <Button size="small" onClick={() => setStatusFilter('REVIEW')}>
              {t('Voir')}
            </Button>
          }
        />
      ) : null}

      <Space wrap style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <Radio.Group
          value={statusFilter}
          onChange={event => setStatusFilter(event.target.value)}
          optionType="button"
          buttonStyle="solid"
        >
          <Radio.Button value="ALL">{t('Tous ({{count}})', { count: totalCount })}</Radio.Button>
          {STATUS_ORDER.map(status => (
            <Radio.Button key={status} value={status}>
              {`${statusLabel(status)} (${counts[status] ?? 0})`}
            </Radio.Button>
          ))}
        </Radio.Group>
        <Select
          allowClear
          aria-label={t('Origine')}
          placeholder={t('Toutes les origines')}
          value={originFilter}
          onChange={value => setOriginFilter(value)}
          options={[
            { value: 'PORTAL', label: originLabel('PORTAL') },
            { value: 'SECURE_LINK', label: originLabel('SECURE_LINK') }
          ]}
          style={{ minWidth: 200 }}
        />
      </Space>

      {error ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={error}
          action={
            <Button size="small" onClick={() => void load(pagination.page, pagination.limit)}>
              {t('Réessayer')}
            </Button>
          }
        />
      ) : null}

      <Table<SyndicOnlineCheckoutRow>
        rowKey="id"
        size="middle"
        loading={loading}
        columns={columns}
        dataSource={items}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: t('Aucun paiement en ligne') }}
        pagination={{
          current: pagination.page,
          pageSize: pagination.limit,
          total: pagination.total,
          showSizeChanger: false,
          onChange: (page, pageSize) => void load(page, pageSize)
        }}
      />
    </Card>
  );
};

export default CheckoutsTable;
