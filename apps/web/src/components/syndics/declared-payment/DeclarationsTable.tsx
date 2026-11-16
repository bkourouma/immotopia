import React, { useMemo } from 'react';
import { Alert, Button, Card, Space, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EyeOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { formatMoney, Table } from '../../primitives';
import {
  SyndicDeclarationRow,
  ListDeclarationsQuery,
  listSyndicDeclarations,
  listSyndicReceivingNumbers
} from '../../../services/syndic-declared-payment-service';
import { listSyndicateLots } from '../../../services/syndic-service';
import { useListSearch } from '../../../hooks/useListSearch';
import { queryKey, STALE_TIME } from '../../../lib/query-keys';
import { collectAllPages } from '../../../utils/table-export/collect';
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

type Counts = { pending: number; overdue: number; suspectedDuplicate: number };
const EMPTY_COUNTS: Counts = { pending: 0, overdue: 0, suspectedDuplicate: 0 };

/** Sans choix de statut, l'API (et l'écran) montrent la file à traiter : les paiements en attente. */
const DEFAULT_STATUS: NonNullable<ListDeclarationsQuery['status']> = 'PENDING';
const withDefaultStatus = (params: object): ListDeclarationsQuery => ({
  status: DEFAULT_STATUS,
  ...(params as ListDeclarationsQuery)
});

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
  // Un échec de chargement des numéros ou des lots ne bloque pas la table : le critère reste sans options.
  const { data: numbers = [] } = useQuery({
    queryKey: queryKey('syndic-receiving-numbers', tenantId, { syndicId }),
    queryFn: () => listSyndicReceivingNumbers(tenantId, syndicId),
    staleTime: STALE_TIME.reference
  });
  const { data: lots = [] } = useQuery({
    queryKey: queryKey('syndic-lots', tenantId, { syndicId }),
    queryFn: () => listSyndicateLots(tenantId, syndicId),
    staleTime: STALE_TIME.reference
  });

  const numberOptions = useMemo(
    () =>
      numbers.map(n => ({
        value: n.id,
        label: `${operatorLabel(n.operator)} · ${formatPhone(n.phoneNumber)} · ${n.holderName}`
      })),
    [numbers]
  );
  const lotOptions = useMemo(() => lots.map(lot => ({ value: lot.id, label: lot.lotNumber })), [lots]);

  const search = useListSearch({
    paramPrefix: 'dec',
    ariaLabel: t('Rechercher dans les paiements déclarés'),
    criteria: [
      {
        key: 'q',
        type: 'text',
        label: t('Rechercher'),
        placeholder: t('Déclarant, référence, téléphone du payeur, lot…')
      },
      {
        key: 'status',
        type: 'select',
        label: t('Statut'),
        primary: true,
        help: t('Sans choix, seuls les paiements en attente sont affichés.'),
        options: [
          { value: 'PENDING', label: t('En attente') },
          { value: 'APPROVED', label: t('Validées') },
          { value: 'REJECTED', label: t('Rejetées') },
          { value: 'CANCELED', label: t('Annulées') },
          { value: 'ALL', label: t('Toutes') }
        ]
      },
      { key: 'period', type: 'dateRange', label: t('Paiement du'), primary: true, api: ['from', 'to'] },
      {
        key: 'receivingNumberId',
        type: 'select',
        label: t('Numéro de réception'),
        options: numberOptions
      },
      { key: 'lotId', type: 'select', label: t('Lot'), options: lotOptions },
      {
        key: 'overdue',
        type: 'boolean',
        label: t('En retard'),
        api: () => ({ overdue: 'true' })
      }
    ]
  });

  const query = withDefaultStatus(search.apiParams);
  const {
    data,
    isFetching,
    error: queryError,
    refetch
  } = useQuery({
    queryKey: queryKey('syndic-declarations', tenantId, { syndicId, refreshToken, ...query }),
    queryFn: () => listSyndicDeclarations(tenantId, syndicId, query),
    staleTime: STALE_TIME.list,
    placeholderData: keepPreviousData
  });
  const items = data?.items ?? [];
  const counts: Counts = { ...EMPTY_COUNTS, ...data?.counts };
  const error = queryError ? apiErrorMessage(queryError, t('Impossible de charger les paiements déclarés')) : null;

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
        {/* Raccourci vers le critère « En retard » de la barre. */}
        <Button
          size="small"
          type={search.values.overdue ? 'primary' : 'default'}
          danger
          aria-pressed={search.values.overdue === true}
          onClick={() => search.setValues({ overdue: search.values.overdue === true ? undefined : true })}
        >
          {`${t('En retard')} ${counts.overdue}`}
        </Button>
        <Tag color="orange">{`${t('Doublon suspecté')} ${counts.suspectedDuplicate}`}</Tag>
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

      <Table<SyndicDeclarationRow>
        aria-label={t('Paiements déclarés')}
        helpId="syndic.paiements.declares"
        search={search.searchProps}
        exportFilename={t('Paiements déclarés')}
        exportFetchAll={() =>
          collectAllPages<SyndicDeclarationRow>(async (page, limit) => {
            const response = await listSyndicDeclarations(
              tenantId,
              syndicId,
              withDefaultStatus({ ...search.filterParams, page, limit })
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
        locale={search.isFiltered ? undefined : { emptyText: t('Aucun paiement déclaré') }}
        onRow={row => ({ onClick: () => onOpen(row), style: { cursor: 'pointer' } })}
        pagination={search.tablePagination(data?.pagination.total ?? 0)}
      />
    </Card>
  );
};

export default DeclarationsTable;
