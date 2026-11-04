import React, { useState } from 'react';
import { App, Alert, Button, Card, Space, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SafetyCertificateOutlined, SyncOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { MoneyValue, Table, formatMoney } from '../../primitives';
import {
  CheckoutOrigin,
  OnlineCheckoutStatus,
  SyndicOnlineCheckoutRow,
  SyndicOnlineCheckoutsQuery,
  listSyndicOnlineCheckouts,
  verifySyndicOnlineCheckout
} from '../../../services/syndic-online-payment-service';
import { useListSearch } from '../../../hooks/useListSearch';
import { queryKey, STALE_TIME } from '../../../lib/query-keys';
import { collectAllPages } from '../../../utils/table-export/collect';
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
  /** Droit `SYNDIC_EDIT` : sans lui, « Vérifier » et « Trancher » sont masqués (l'API répondrait 403). */
  canEdit: boolean;
}

/** Les paramètres de la barre partent tels quels, sauf `status` : le service attend un tableau. */
function toQuery(params: object): SyndicOnlineCheckoutsQuery {
  const { status, ...rest } = params as Record<string, string | number | undefined>;
  return {
    ...(rest as SyndicOnlineCheckoutsQuery),
    status: status ? (String(status).split(',') as OnlineCheckoutStatus[]) : undefined
  };
}

/** Suivi des paiements en ligne de la copropriété (contrat §1.5 et §1.6). */
export const CheckoutsTable: React.FC<CheckoutsTableProps> = ({
  tenantId,
  syndicId,
  refreshToken = 0,
  onDecide,
  onChanged,
  canEdit
}) => {
  const { message } = App.useApp();
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const search = useListSearch({
    paramPrefix: 'co',
    ariaLabel: t('Rechercher dans les paiements en ligne'),
    criteria: [
      {
        key: 'q',
        type: 'text',
        label: t('Rechercher'),
        placeholder: t('Code de paiement, lot, payeur…')
      },
      {
        key: 'status',
        type: 'multiSelect',
        label: t('Statut'),
        primary: true,
        options: STATUS_ORDER.map(status => ({ value: status, label: statusLabel(status) }))
      },
      {
        key: 'origin',
        type: 'select',
        label: t('Origine'),
        primary: true,
        options: [
          { value: 'PORTAL', label: originLabel('PORTAL') },
          { value: 'SECURE_LINK', label: originLabel('SECURE_LINK') }
        ]
      },
      { key: 'period', type: 'dateRange', label: t('Période'), api: ['from', 'to'] }
    ]
  });

  const {
    data,
    isFetching,
    error: queryError,
    refetch
  } = useQuery({
    queryKey: queryKey('syndic-online-checkouts', tenantId, { syndicId, refreshToken, ...search.apiParams }),
    queryFn: () => listSyndicOnlineCheckouts(tenantId, syndicId, toQuery(search.apiParams)),
    staleTime: STALE_TIME.list,
    placeholderData: keepPreviousData
  });
  const items = data?.items ?? [];
  const counts: Counts = { ...EMPTY_COUNTS, ...data?.counts };
  const error = queryError ? apiErrorMessage(queryError, t('Impossible de charger les paiements en ligne')) : null;
  const statusValues = search.values.status;
  const reviewOnly = Array.isArray(statusValues) && statusValues.length === 1 && statusValues[0] === 'REVIEW';

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
      await refetch();
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
            {canEdit && verifiable ? (
              <Button
                size="small"
                icon={<SyncOutlined aria-hidden />}
                loading={verifyingId === row.id}
                onClick={() => void handleVerify(row)}
              >
                {t('Vérifier')}
              </Button>
            ) : null}
            {canEdit && row.status === 'REVIEW' ? (
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
      {counts.REVIEW > 0 && !reviewOnly ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('{{count}} paiement(s) à trancher', { count: counts.REVIEW })}
          description={t(
            'Ces paiements ont été encaissés chez le fournisseur mais n’ont pas pu être enregistrés automatiquement.'
          )}
          action={
            <Button size="small" onClick={() => search.setValues({ status: ['REVIEW'] })}>
              {t('Voir')}
            </Button>
          }
        />
      ) : null}

      <Space wrap size={[4, 4]} style={{ marginBottom: 16 }}>
        <Tag>{t('Tous ({{count}})', { count: totalCount })}</Tag>
        {STATUS_ORDER.map(status => (
          <Tag key={status} color={STATUS_COLOR[status]}>
            {`${statusLabel(status)} (${counts[status] ?? 0})`}
          </Tag>
        ))}
      </Space>

      {error ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={error}
          action={
            <Button size="small" onClick={() => void refetch()}>
              {t('Réessayer')}
            </Button>
          }
        />
      ) : null}

      <Table<SyndicOnlineCheckoutRow>
        aria-label={t('Paiements en ligne')}
        search={search.searchProps}
        exportFilename={t('Paiements en ligne')}
        exportFetchAll={() =>
          collectAllPages<SyndicOnlineCheckoutRow>(async (page, limit) => {
            const response = await listSyndicOnlineCheckouts(
              tenantId,
              syndicId,
              toQuery({ ...search.filterParams, page, limit })
            );
            return { items: response.items, total: response.pagination.total };
          })
        }
        rowKey="id"
        size="middle"
        loading={isFetching}
        columns={columns}
        dataSource={items}
        scroll={{ x: 'max-content' }}
        locale={search.isFiltered ? undefined : { emptyText: t('Aucun paiement en ligne') }}
        pagination={search.tablePagination(data?.pagination.total ?? 0)}
      />
    </Card>
  );
};

export default CheckoutsTable;
