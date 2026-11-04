import React, { useMemo, useState } from 'react';
import { Button, Card, Space, Typography } from 'antd';
import { DownloadOutlined, SyncOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { DataCard, DataView, MoneyValue } from '../../components/primitives';
import { collectAllPages } from '../../utils/table-export/collect';
import { useListSearch } from '../../hooks/useListSearch';
import type { SearchCriterion } from '../../utils/list-search';
import { feedback } from '../../lib/feedback';
import { t } from '../../i18n/t';
import {
  downloadCoOwnerReceiptFile,
  listMyLots,
  listMyReceipts,
  type CoOwnerDocumentKind,
  type CoOwnerReceipt,
  type CoOwnerReceiptsQuery
} from '../../services/coowner-portal-service';
import { saveBlob } from '../../utils/save-blob';
import { displayCurrency } from '../../utils/syndic-currency';
import { blobErrorMessage, portalErrorMessage } from './portal-error';

const { Title, Text } = Typography;

/** « Reçu » (paiement) ou « Quittance » (période soldée) — même libellé que la gestion. */
function receiptKindLabel(kind: CoOwnerDocumentKind): string {
  return kind === 'QUITTANCE' ? t('Quittance') : t('Reçu');
}

function DownloadButton({ receipt }: { receipt: CoOwnerReceipt }) {
  const [loading, setLoading] = useState(false);
  const download = async () => {
    setLoading(true);
    try {
      const { blob, filename } = await downloadCoOwnerReceiptFile(
        receipt.downloadPath,
        t('{{label}} {{number}}.pdf', { label: receiptKindLabel(receipt.kind), number: receipt.number })
      );
      saveBlob(blob, filename);
    } catch (error) {
      feedback.error(await blobErrorMessage(error, t('Téléchargement impossible.')));
    } finally {
      setLoading(false);
    }
  };
  return (
    <Button icon={<DownloadOutlined />} loading={loading} onClick={() => void download()}>
      {t('Télécharger')}
    </Button>
  );
}

/**
 * « Mes quittances » (lot S5, besoin 2) : reçus et quittances émis pour les
 * lots du copropriétaire, filtrables par lot, type et période. Pagination
 * serveur (`pagination` de la réponse), jamais `items.length`.
 */
export default function CoOwnerReceipts() {
  const lots = useQuery({ queryKey: ['coowner-portal', 'lots'], staleTime: 30_000, queryFn: () => listMyLots() });
  const lotOptions = useMemo(
    () =>
      (lots.data ?? []).map(lot => ({ value: lot.id, label: t('Lot {{lotNumber}}', { lotNumber: lot.lotNumber }) })),
    [lots.data]
  );

  // Liste paginée par le serveur : seuls les critères de `/quittances` (lot, nature, période) existent,
  // sans champ libre (l'API n'a pas de `search`). Aucun filtrage côté client. L'API ne trie pas.
  const criteria: SearchCriterion[] = [
    { key: 'lotId', type: 'select', label: t('Lot'), primary: true, options: lotOptions },
    {
      key: 'kind',
      type: 'select',
      label: t('Type de document'),
      primary: true,
      options: [
        { value: 'RECEIPT', label: t('Reçu') },
        { value: 'QUITTANCE', label: t('Quittance') }
      ]
    },
    { key: 'period', type: 'dateRange', label: t('Période'), api: ['from', 'to'] }
  ];
  const search = useListSearch({ criteria, apiNames: { sort: false } });

  const receipts = useQuery({
    queryKey: ['coowner-portal', 'receipts', search.apiParams],
    staleTime: 30_000,
    queryFn: () => listMyReceipts(search.apiParams as CoOwnerReceiptsQuery),
    placeholderData: keepPreviousData
  });

  const columns: ColumnsType<CoOwnerReceipt> = [
    { title: t('Numéro'), dataIndex: 'number', key: 'number' },
    { title: t('Type'), key: 'kind', render: (_, row) => receiptKindLabel(row.kind) },
    { title: t('Lot'), key: 'lot', render: (_, row) => row.lot.lotNumber },
    { title: t('Période'), key: 'period', render: (_, row) => row.periodLabel ?? '—' },
    {
      title: t('Montant'),
      key: 'amount',
      align: 'end',
      exportValue: row => Number(row.amount),
      render: (_, row) => <MoneyValue value={row.amount} currency={displayCurrency(row.currency)} />
    },
    { title: t('Émise le'), key: 'issuedAt', render: (_, row) => dayjs(row.issuedAt).format('DD/MM/YYYY') },
    { title: t('Action'), key: 'action', align: 'end', render: (_, row) => <DownloadButton receipt={row} /> }
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div className="it-toolbar">
        <div>
          <Title level={2}>{t('Mes quittances')}</Title>
          <Text type="secondary">{t('Reçus de paiement et quittances de charges émis pour vos lots.')}</Text>
        </div>
        <Button icon={<SyncOutlined />} onClick={() => void receipts.refetch()} loading={receipts.isFetching}>
          {t('Actualiser')}
        </Button>
      </div>

      {/* Sur erreur, la barre et ses critères restent affichés : l'erreur s'affiche dessous (DataView). */}
      <Card>
        <DataView<CoOwnerReceipt>
          {...search.dataViewProps}
          search={search.searchProps}
          items={receipts.data?.items ?? []}
          total={receipts.data?.pagination.total ?? 0}
          loading={receipts.isPending}
          error={receipts.error ? portalErrorMessage(receipts.error, t('Impossible de charger vos quittances.')) : null}
          onRetry={() => void receipts.refetch()}
          isReloading={receipts.isFetching && !receipts.isPending}
          rowKey={row => row.id}
          aria-label={t('Mes quittances')}
          // Toutes les quittances, avec les mêmes filtres que la liste affichée.
          export={{
            filename: t('Mes quittances'),
            fetchAll: () =>
              collectAllPages<CoOwnerReceipt>(async (exportPage, limit) => {
                const result = await listMyReceipts({
                  ...(search.filterParams as CoOwnerReceiptsQuery),
                  page: exportPage,
                  limit
                });
                return { items: result.items, total: result.pagination.total };
              })
          }}
          emptyDescription={t("Aucun document n'a encore été émis pour vos lots.")}
          columns={columns}
          renderCard={row => (
            <DataCard
              title={`${receiptKindLabel(row.kind)} ${row.number}`}
              subtitle={[t('Lot {{lotNumber}}', { lotNumber: row.lot.lotNumber }), row.periodLabel]
                .filter(Boolean)
                .join(' · ')}
              highlight={<MoneyValue value={row.amount} currency={displayCurrency(row.currency)} />}
              fields={[
                { label: t('Émise le'), value: dayjs(row.issuedAt).format('DD/MM/YYYY') },
                { label: t('Téléchargement'), value: <DownloadButton receipt={row} /> }
              ]}
            />
          )}
        />
      </Card>
    </Space>
  );
}
