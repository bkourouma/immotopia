import React, { useMemo } from 'react';
import { Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { DataCard, DataView, MoneyValue } from '../../primitives';
import { listChargeCallsPage, type ChargeCallsPageQuery } from '../../../services/syndic-service';
import { useListSearch } from '../../../hooks/useListSearch';
import { collectAllPages } from '../../../utils/table-export/collect';
import { dateFormat } from '../../../i18n/format';
import { t } from '../../../i18n/t';
import { chargeCallCriteria } from './charge-call-criteria';
import { buildChargeRows, chargeStatusConfig, financeLoadError, type ChargeRow } from './finance-rows';
import { useSyndicLotOptions } from './lot-options';
import { financeKeys } from './query-keys';

/**
 * Détail des appels de fonds, paginé et filtré par le serveur (préfixe d'URL
 * « ap » : `ap.q`, `ap.status`, `ap.lotId`, `ap.page`, `ap.limit`).
 *
 * Pas de tri de colonne : l'API ne trie pas, et trier la seule page reçue
 * donnerait un ordre trompeur (la page 2 ne prolongerait pas la page 1).
 */
export const ChargeCallsTab: React.FC<{ tenantId: string; syndicId: string }> = ({ tenantId, syndicId }) => {
  const lotOptions = useSyndicLotOptions(tenantId, syndicId);
  const search = useListSearch({
    paramPrefix: 'ap',
    ariaLabel: t('Rechercher dans les appels de fonds'),
    apiNames: { sort: false },
    criteria: chargeCallCriteria(lotOptions)
  });

  const query = useQuery({
    queryKey: financeKeys.charges(tenantId, syndicId, search.apiParams),
    queryFn: () => listChargeCallsPage(tenantId, syndicId, search.apiParams as ChargeCallsPageQuery),
    placeholderData: keepPreviousData
  });

  const rows = useMemo(() => buildChargeRows(query.data?.items ?? []), [query.data]);

  const columns: ColumnsType<ChargeRow> = [
    { title: t('Référence'), dataIndex: 'reference', key: 'reference' },
    { title: t('Période'), dataIndex: 'period', key: 'period' },
    { title: t('Lot'), dataIndex: 'lotLabel', key: 'lotLabel' },
    { title: t('Copropriétaire'), dataIndex: 'ownerLabel', key: 'ownerLabel' },
    {
      title: t('Montant appelé'),
      dataIndex: 'amount',
      key: 'amount',
      align: 'end',
      render: (_: number, row) => <MoneyValue value={row.amount} />
    },
    {
      title: t('Payé'),
      dataIndex: 'paid',
      key: 'paid',
      align: 'end',
      render: (_: number, row) => <MoneyValue value={row.paid} />
    },
    {
      title: t('Reste'),
      dataIndex: 'outstanding',
      key: 'outstanding',
      align: 'end',
      render: (_: number, row) => <MoneyValue value={row.outstanding} />
    },
    {
      title: t('Échéance'),
      dataIndex: 'dueDate',
      key: 'dueDate',
      render: (value: string) => dayjs(value).format(dateFormat('short'))
    },
    {
      title: t('Statut'),
      dataIndex: 'status',
      key: 'status',
      render: (value: ChargeRow['status']) => (
        <Tag color={chargeStatusConfig[value].color}>{chargeStatusConfig[value].label}</Tag>
      )
    }
  ];

  return (
    <DataView<ChargeRow>
      items={rows}
      total={query.data?.pagination.total ?? 0}
      search={search.searchProps}
      {...search.dataViewProps}
      loading={query.isLoading}
      isReloading={query.isFetching && !query.isLoading}
      error={financeLoadError(query.error)}
      errorCause={query.error}
      onRetry={() => void query.refetch()}
      emptyDescription={t('Aucun appel de charges enregistré pour cette copropriété.')}
      columns={columns}
      rowKey={row => row.id}
      aria-label={t('Détail des appels de fonds')}
      helpId="syndic.tresorerie.appels"
      export={{
        filename: t('Détail des appels de fonds'),
        fetchAll: () =>
          collectAllPages<ChargeRow>(async (nextPage, nextLimit) => {
            const result = await listChargeCallsPage(tenantId, syndicId, {
              ...(search.filterParams as ChargeCallsPageQuery),
              page: nextPage,
              limit: nextLimit
            });
            return { items: buildChargeRows(result.items), total: result.pagination.total };
          })
      }}
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
  );
};
