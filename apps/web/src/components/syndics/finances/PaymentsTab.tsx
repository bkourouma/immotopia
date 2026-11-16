import React, { useEffect, useMemo, useState } from 'react';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import { DataCard, DataView, MoneyValue } from '../../primitives';
import { listSyndicPaymentsPage, type SyndicPaymentsQuery } from '../../../services/syndic-payment-service';
import { useListSearch } from '../../../hooks/useListSearch';
import { collectAllPages } from '../../../utils/table-export/collect';
import type { SearchCriterion } from '../../../utils/list-search';
import { dateFormat } from '../../../i18n/format';
import { t } from '../../../i18n/t';
import { paymentMethodLabel } from '../labels';
import { buildPaymentAllocationRows, financeLoadError, type PaymentRow } from './finance-rows';
import { financeKeys } from './query-keys';

/**
 * Paiements reçus : une ligne par affectation à un appel, filtrée, triée et
 * paginée côté serveur. Les avances non affectées restent hors de cette liste.
 */
export const PaymentsTab: React.FC<{ tenantId: string; syndicId: string }> = ({ tenantId, syndicId }) => {
  const [methodState, setMethodState] = useState<{ tenantId: string; syndicId: string; methods: string[] } | null>(
    null
  );
  const methodOptions = useMemo(
    () =>
      (methodState?.tenantId === tenantId && methodState.syndicId === syndicId ? methodState.methods : []).map(
        method => ({ value: method, label: paymentMethodLabel(method) })
      ),
    [methodState, tenantId, syndicId]
  );
  const criteria: SearchCriterion[] = [
    {
      key: 'q',
      type: 'text',
      label: t('Rechercher'),
      placeholder: t('Lot, copropriétaire, appel concerné…')
    },
    { key: 'method', type: 'select', label: t('Mode'), primary: true, options: methodOptions },
    { key: 'paid', type: 'dateRange', label: t('Date du paiement'), primary: true },
    { key: 'amount', type: 'numberRange', label: t('Montant'), unit: 'FCFA' }
  ];

  const search = useListSearch({
    paramPrefix: 'pa',
    ariaLabel: t('Rechercher dans les paiements reçus'),
    criteria
  });
  const { pageSize, setPageSize } = search;
  useEffect(() => {
    if (pageSize > 100) setPageSize(100);
  }, [pageSize, setPageSize]);
  const apiParams = { ...search.apiParams, limit: Math.min(pageSize, 100) } as SyndicPaymentsQuery;
  const query = useQuery({
    queryKey: financeKeys.payments(tenantId, syndicId, apiParams),
    queryFn: () => listSyndicPaymentsPage(tenantId, syndicId, apiParams)
  });
  const rows = useMemo(() => buildPaymentAllocationRows(query.data?.items ?? []), [query.data]);
  useEffect(() => {
    if (query.data) setMethodState({ tenantId, syndicId, methods: query.data.methods });
  }, [query.data, tenantId, syndicId]);

  const columns: ColumnsType<PaymentRow> = [
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
    {
      title: t('Mode'),
      dataIndex: 'method',
      key: 'method',
      render: (value: string) => paymentMethodLabel(value)
    }
  ];

  return (
    <DataView<PaymentRow>
      items={rows}
      total={query.data?.pagination.total ?? 0}
      search={search.searchProps}
      {...search.dataViewProps}
      loading={query.isLoading}
      isReloading={query.isFetching && !query.isLoading}
      error={financeLoadError(query.error)}
      errorCause={query.error}
      onRetry={() => void query.refetch()}
      emptyDescription={t('Aucun paiement enregistré pour cette copropriété.')}
      columns={columns}
      rowKey={row => row.id}
      aria-label={t('Détail des paiements reçus')}
      helpId="syndic.tresorerie.paiements"
      export={{
        filename: t('Détail des paiements reçus'),
        fetchAll: () =>
          collectAllPages<PaymentRow>(async (page, limit) => {
            const result = await listSyndicPaymentsPage(tenantId, syndicId, {
              ...(search.filterParams as SyndicPaymentsQuery),
              ...(search.sort ? { sort: `${search.sort.field}:${search.sort.order}` } : {}),
              page,
              limit
            });
            return { items: buildPaymentAllocationRows(result.items), total: result.pagination.total };
          })
      }}
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
  );
};
