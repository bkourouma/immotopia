import React, { useEffect, useState } from 'react';
import { App, Alert, Button, DatePicker, Input, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SafetyCertificateOutlined, SyncOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Dayjs } from 'dayjs';
import { formatMoney } from '../../primitives';
import type { RentalOnlineCheckoutStatus, RentalOnlinePaymentRowDto } from '../../../types/rental-online-payment';
import { listRentalOnlinePayments, verifyRentalOnlinePayment } from '../../../services/rental-online-payment-service';
import { t } from '../../../i18n/t';
import { HelpButton } from '../../../help';
import {
  STATUS_COLOR,
  STATUS_ORDER,
  apiErrorMessage,
  canVerifyStatus,
  formatDateTime,
  originLabel,
  periodLabel,
  reviewKindLabel,
  statusLabel
} from './helpers';

const { Text } = Typography;
const { RangePicker } = DatePicker;

export interface RentalOnlineCheckoutsTableProps {
  tenantId: string;
  /** Change quand une autre partie de l'écran a modifié des paiements. */
  refreshToken: number;
  onDecide: (row: RentalOnlinePaymentRowDto) => void;
  onChanged: () => void;
  /** Droit RENTAL_PAYMENTS_ALLOCATE : sans lui, « Vérifier » et « Trancher » sont masqués. */
  canDecide: boolean;
}

function money(amount: number, currency: string): string {
  return formatMoney(amount, { currency: currency === 'XOF' ? 'FCFA' : currency });
}

/** Suivi des paiements en ligne du locatif (contrat 049 §2.1 et §2.4). */
export const RentalOnlineCheckoutsTable: React.FC<RentalOnlineCheckoutsTableProps> = ({
  tenantId,
  refreshToken,
  onDecide,
  onChanged,
  canDecide
}) => {
  const { message } = App.useApp();
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<RentalOnlineCheckoutStatus[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [searchText, setSearchText] = useState('');
  const [range, setRange] = useState<[string, string] | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    const handle = setTimeout(() => {
      setSearchText(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const query = {
    status: statuses.length ? statuses.join(',') : undefined,
    search: searchText || undefined,
    from: range?.[0],
    to: range?.[1],
    page,
    pageSize
  };

  const {
    data,
    isFetching,
    error: queryError,
    refetch
  } = useQuery({
    queryKey: ['rental-online-checkouts', tenantId, refreshToken, query],
    queryFn: () => listRentalOnlinePayments(tenantId, query),
    placeholderData: keepPreviousData
  });
  const error = queryError ? apiErrorMessage(queryError, t('Impossible de charger les paiements en ligne')) : null;

  const handleVerify = async (row: RentalOnlinePaymentRowDto) => {
    setVerifyingId(row.id);
    try {
      const result = await verifyRentalOnlinePayment(tenantId, row.id);
      if (result.changed) {
        message.success(
          t('Paiement {{code}} : statut mis à jour ({{status}})', {
            code: row.codePaiement,
            status: statusLabel(result.checkout.status)
          })
        );
      } else {
        message.info(t('Aucun changement chez la passerelle'));
      }
      onChanged();
      await refetch();
    } catch (e) {
      message.error(apiErrorMessage(e, t('La vérification a échoué')));
    } finally {
      setVerifyingId(null);
    }
  };

  const columns: ColumnsType<RentalOnlinePaymentRowDto> = [
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
      title: t('Bail'),
      key: 'lease',
      render: (_: unknown, row) => (
        <Space direction="vertical" size={0}>
          <span>{row.leaseReference ?? '—'}</span>
          {row.propertyLabel ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {row.propertyLabel}
            </Text>
          ) : null}
        </Space>
      )
    },
    {
      title: t('Locataire'),
      key: 'renter',
      render: (_: unknown, row) => row.renter?.name ?? <Text type="secondary">{t('Fiche introuvable')}</Text>
    },
    {
      title: t('Échéances'),
      key: 'installments',
      render: (_: unknown, row) => row.installments.map(i => periodLabel(i.periodYear, i.periodMonth)).join(', ') || '—'
    },
    {
      title: t('Montant'),
      key: 'amount',
      align: 'end',
      render: (_: unknown, row) => (
        <Space direction="vertical" size={0} style={{ textAlign: 'end' }}>
          <span>{money(row.amount, row.currency)}</span>
          {row.receivedAmount !== null && row.receivedAmount !== row.amount ? (
            <Text type="warning" style={{ fontSize: 12 }}>
              {t('Reçu : {{amount}}', { amount: money(row.receivedAmount, row.currency) })}
            </Text>
          ) : null}
        </Space>
      )
    },
    {
      title: t('Origine'),
      dataIndex: 'origin',
      key: 'origin',
      render: (value: RentalOnlinePaymentRowDto['origin'], row) => (
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
          {row.status === 'REVIEW' && row.reviewKind ? (
            <Tooltip title={row.reviewReason ?? undefined}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {reviewKindLabel(row.reviewKind)}
              </Text>
            </Tooltip>
          ) : null}
          {row.failureMessage && row.status !== 'REVIEW' ? (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {row.failureMessage}
            </Text>
          ) : null}
          {row.resolution ? (
            <Space direction="vertical" size={0}>
              <Text style={{ fontSize: 12 }}>
                {row.resolution === 'ACCEPT' ? t('Accepté') : t('Refusé')}
                {row.resolvedByName ? ` — ${row.resolvedByName}` : ''}
              </Text>
              {row.resolutionNote ? (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {row.resolutionNote}
                </Text>
              ) : null}
            </Space>
          ) : null}
        </Space>
      )
    },
    {
      title: t('Actions'),
      key: 'actions',
      render: (_: unknown, row) => {
        const verifiable = canVerifyStatus(row.status);
        return (
          <Space wrap>
            {canDecide && verifiable ? (
              <Button
                size="small"
                icon={<SyncOutlined aria-hidden />}
                loading={verifyingId === row.id}
                onClick={() => void handleVerify(row)}
              >
                {t('Vérifier')}
              </Button>
            ) : null}
            {canDecide && row.status === 'REVIEW' && row.resolution === null ? (
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
    <div>
      <Space wrap style={{ marginBottom: 16 }}>
        <Select<RentalOnlineCheckoutStatus[]>
          mode="multiple"
          allowClear
          style={{ minWidth: 220 }}
          aria-label={t('Statut')}
          placeholder={t('Statut')}
          value={statuses}
          onChange={values => {
            setStatuses(values);
            setPage(1);
          }}
          options={STATUS_ORDER.map(status => ({ value: status, label: statusLabel(status) }))}
        />
        <Input.Search
          allowClear
          style={{ width: 280 }}
          aria-label={t('Rechercher dans les paiements en ligne')}
          placeholder={t('Code de paiement, locataire, bail…')}
          value={searchInput}
          onChange={event => setSearchInput(event.target.value)}
        />
        <RangePicker
          format="DD/MM/YYYY"
          placeholder={[t('Du'), t('Au')]}
          onChange={(values: null | (Dayjs | null)[]) => {
            setRange(
              values && values[0] && values[1] ? [values[0].format('YYYY-MM-DD'), values[1].format('YYYY-MM-DD')] : null
            );
            setPage(1);
          }}
        />
        <HelpButton helpId="locatif.enligne.liste.tableau" size="small" />
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

      <Table<RentalOnlinePaymentRowDto>
        aria-label={t('Paiements en ligne')}
        rowKey="id"
        size="middle"
        loading={isFetching}
        columns={columns}
        dataSource={data?.items ?? []}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: t('Aucun paiement en ligne') }}
        pagination={{
          current: page,
          pageSize,
          total: data?.total ?? 0,
          showSizeChanger: true,
          onChange: (nextPage, nextSize) => {
            setPage(nextPage);
            setPageSize(nextSize);
          }
        }}
      />
    </div>
  );
};

export default RentalOnlineCheckoutsTable;
