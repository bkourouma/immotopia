import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, DatePicker, Radio, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { EyeOutlined } from '@ant-design/icons';
import { formatMoney } from '../../primitives';
import {
  DeclarationStatus,
  Pagination,
  ReceivingNumberAdmin,
  SyndicDeclarationRow,
  listSyndicDeclarations,
  listSyndicReceivingNumbers
} from '../../../services/syndic-declared-payment-service';
import { listSyndicateLots } from '../../../services/syndic-service';
import type { SyndicateLot } from '../../../types/syndic-types';
import { formatLotLabel } from '../../../utils/syndic-lot-label';
import { t } from '../../../i18n/t';
import {
  STATUS_COLOR,
  apiErrorMessage,
  formatDateTime,
  formatPhone,
  hasDuplicateSuspicion,
  operatorLabel,
  statusLabel
} from './helpers';

const { Text } = Typography;
const { RangePicker } = DatePicker;

type StatusFilter = DeclarationStatus | 'ALL';
type Counts = { pending: number; overdue: number; suspectedDuplicate: number };
const EMPTY_COUNTS: Counts = { pending: 0, overdue: 0, suspectedDuplicate: 0 };
const PAGE_SIZE = 20;

export interface DeclarationsTableProps {
  tenantId: string;
  syndicId: string;
  /** Change quand une autre partie de l'écran a modifié des déclarations. */
  refreshToken?: number;
  /** Ouvre le détail d'une déclaration. */
  onOpen: (row: SyndicDeclarationRow) => void;
  /** Boutons ajoutés par la page (ex. « Déclarer pour un copropriétaire »). */
  toolbarExtra?: React.ReactNode;
}

/** File de validation des paiements mobile money déclarés (contrat §1.6). */
export const DeclarationsTable: React.FC<DeclarationsTableProps> = ({
  tenantId,
  syndicId,
  refreshToken = 0,
  onOpen,
  toolbarExtra
}) => {
  const [items, setItems] = useState<SyndicDeclarationRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING');
  const [receivingNumberId, setReceivingNumberId] = useState<string | undefined>(undefined);
  const [lotId, setLotId] = useState<string | undefined>(undefined);
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [numbers, setNumbers] = useState<ReceivingNumberAdmin[]>([]);
  const [lots, setLots] = useState<SyndicateLot[]>([]);

  // Un échec de chargement des filtres ne bloque pas la table : le filtre reste vide.
  useEffect(() => {
    let cancelled = false;
    listSyndicReceivingNumbers(tenantId, syndicId)
      .then(result => {
        if (!cancelled) setNumbers(result);
      })
      .catch(() => {
        if (!cancelled) setNumbers([]);
      });
    listSyndicateLots(tenantId, syndicId)
      .then(result => {
        if (!cancelled) setLots(result);
      })
      .catch(() => {
        if (!cancelled) setLots([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, syndicId]);

  const from = range?.[0]?.format('YYYY-MM-DD');
  const to = range?.[1]?.format('YYYY-MM-DD');

  const load = useCallback(
    async (page = 1) => {
      setLoading(true);
      setError(null);
      try {
        const result = await listSyndicDeclarations(tenantId, syndicId, {
          status: statusFilter,
          receivingNumberId,
          lotId,
          from,
          to,
          overdue: overdueOnly ? true : undefined,
          page,
          limit: PAGE_SIZE
        });
        setItems(result.items);
        setPagination(result.pagination);
        setCounts({ ...EMPTY_COUNTS, ...result.counts });
      } catch (e) {
        setError(apiErrorMessage(e, t('Impossible de charger les paiements déclarés')));
      } finally {
        setLoading(false);
      }
    },
    [tenantId, syndicId, statusFilter, receivingNumberId, lotId, from, to, overdueOnly]
  );

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, refreshToken]);

  const numberOptions = useMemo(
    () =>
      numbers.map(n => ({
        value: n.id,
        label: `${operatorLabel(n.operator)} · ${formatPhone(n.phoneNumber)} · ${n.holderName}`
      })),
    [numbers]
  );
  const lotOptions = useMemo(() => lots.map(lot => ({ value: lot.id, label: formatLotLabel(lot) })), [lots]);

  const columns: ColumnsType<SyndicDeclarationRow> = [
    {
      title: t('Déposée le'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value: string) => formatDateTime(value)
    },
    {
      title: t('Déclarant'),
      key: 'declaredBy',
      render: (_: unknown, row) => (
        <Space size={4} wrap>
          <span>{row.declaredBy.name}</span>
          {row.declaredBy.type === 'MANAGER' ? <Tag>{t('Gestionnaire')}</Tag> : null}
        </Space>
      )
    },
    {
      title: t('Lot(s)'),
      key: 'lots',
      render: (_: unknown, row) => row.lines.map(line => line.lot.lotNumber).join(', ') || '—'
    },
    {
      title: t('Numéro de réception'),
      key: 'receivingNumber',
      render: (_: unknown, row) => (
        <Space direction="vertical" size={0}>
          <span>{`${operatorLabel(row.receivingNumber.operator)} · ${formatPhone(row.receivingNumber.phoneNumber)}`}</span>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {row.receivingNumber.holderName}
          </Text>
        </Space>
      )
    },
    {
      title: t('Référence'),
      dataIndex: 'transactionReference',
      key: 'transactionReference',
      render: (value: string) => (
        // Le clic sur « copier » ne doit pas ouvrir la ligne.
        <span onClick={event => event.stopPropagation()}>
          <Text copyable={{ text: value }}>{value}</Text>
        </span>
      )
    },
    {
      title: t('Montant déclaré'),
      key: 'amount',
      align: 'end',
      render: (_: unknown, row) => (
        <Space direction="vertical" size={0} style={{ textAlign: 'end' }}>
          <span>{formatMoney(row.amount)}</span>
          {row.acceptedAmount !== null && row.acceptedAmount !== row.amount ? (
            <Text type="warning" style={{ fontSize: 12 }}>
              {t('retenu : {{montant}}', { montant: formatMoney(row.acceptedAmount) })}
            </Text>
          ) : null}
        </Space>
      )
    },
    {
      title: t('Paiement du'),
      dataIndex: 'paidAt',
      key: 'paidAt',
      render: (value: string) => formatDateTime(value)
    },
    {
      title: t('Statut'),
      key: 'status',
      render: (_: unknown, row) => (
        <Space size={4} wrap>
          <Tag color={STATUS_COLOR[row.status]}>{statusLabel(row.status)}</Tag>
          {row.status === 'PENDING' && row.overdue ? <Tag color="red">{t('En retard')}</Tag> : null}
          {row.status === 'PENDING' && hasDuplicateSuspicion(row) ? (
            <Tag color="orange">{t('Doublon suspecté')}</Tag>
          ) : null}
          {row.status === 'PENDING' && row.aiPrefilled ? <Tag color="blue">{t('Lue par IA')}</Tag> : null}
        </Space>
      )
    },
    {
      title: t('Actions'),
      key: 'actions',
      render: (_: unknown, row) => (
        <Button
          size="small"
          icon={<EyeOutlined aria-hidden />}
          onClick={event => {
            event.stopPropagation();
            onOpen(row);
          }}
        >
          {t('Examiner')}
        </Button>
      )
    }
  ];

  return (
    <Card title={t('Paiements déclarés')} extra={toolbarExtra}>
      <Space wrap style={{ marginBottom: 16 }}>
        <Tag color="processing">{`${t('En attente')} ${counts.pending}`}</Tag>
        <Button
          size="small"
          type={overdueOnly ? 'primary' : 'default'}
          danger
          aria-pressed={overdueOnly}
          onClick={() => setOverdueOnly(value => !value)}
        >
          {`${t('En retard')} ${counts.overdue}`}
        </Button>
        <Tag color="orange">{`${t('Doublon suspecté')} ${counts.suspectedDuplicate}`}</Tag>
      </Space>

      <Space wrap style={{ marginBottom: 16, width: '100%' }}>
        <Radio.Group
          value={statusFilter}
          onChange={event => setStatusFilter(event.target.value as StatusFilter)}
          optionType="button"
          buttonStyle="solid"
        >
          <Radio.Button value="PENDING">{t('En attente')}</Radio.Button>
          <Radio.Button value="APPROVED">{t('Validées')}</Radio.Button>
          <Radio.Button value="REJECTED">{t('Rejetées')}</Radio.Button>
          <Radio.Button value="CANCELED">{t('Annulées')}</Radio.Button>
          <Radio.Button value="ALL">{t('Toutes')}</Radio.Button>
        </Radio.Group>
        <Select
          allowClear
          aria-label={t('Numéro de réception')}
          placeholder={t('Tous les numéros')}
          value={receivingNumberId}
          onChange={value => setReceivingNumberId(value)}
          options={numberOptions}
          style={{ minWidth: 220, maxWidth: '100%' }}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          aria-label={t('Lot')}
          placeholder={t('Tous les lots')}
          value={lotId}
          onChange={value => setLotId(value)}
          options={lotOptions}
          style={{ minWidth: 200, maxWidth: '100%' }}
        />
        <RangePicker
          allowClear
          value={range}
          onChange={value => setRange(value && value[0] && value[1] ? [value[0], value[1]] : null)}
          placeholder={[t('Paiement du'), t('au')]}
          style={{ maxWidth: '100%' }}
        />
      </Space>

      {error ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={error}
          action={
            <Button size="small" onClick={() => void load(pagination.page)}>
              {t('Réessayer')}
            </Button>
          }
        />
      ) : null}

      <Table<SyndicDeclarationRow>
        rowKey="id"
        size="middle"
        loading={loading}
        columns={columns}
        dataSource={items}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: t('Aucun paiement déclaré') }}
        onRow={row => ({ onClick: () => onOpen(row), style: { cursor: 'pointer' } })}
        pagination={{
          current: pagination.page,
          pageSize: pagination.limit,
          total: pagination.total,
          showSizeChanger: false,
          onChange: page => void load(page)
        }}
      />
    </Card>
  );
};

export default DeclarationsTable;
