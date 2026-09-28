import React, { useMemo, useState } from 'react';
import { Button, Card, DatePicker, Select, Space, Typography } from 'antd';
import { DownloadOutlined, SyncOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { DataCard, DataView, MoneyValue, StateBlock } from '../../components/primitives';
import { feedback } from '../../lib/feedback';
import { t } from '../../i18n/t';
import {
  downloadCoOwnerReceiptFile,
  listMyLots,
  listMyReceipts,
  type CoOwnerDocumentKind,
  type CoOwnerReceipt
} from '../../services/coowner-portal-service';
import { saveBlob } from '../../utils/save-blob';
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

const PAGE_SIZE = 20;

/** `AAAA-MM-JJ`, ou `undefined` si la date n'est pas posée. */
function isoDayOf(value: Dayjs | null | undefined): string | undefined {
  return value ? value.format('YYYY-MM-DD') : undefined;
}

/**
 * « Mes quittances » (lot S5, besoin 2) : reçus et quittances émis pour les
 * lots du copropriétaire, filtrables par lot, type et période. Pagination
 * serveur (`pagination` de la réponse), jamais `items.length`.
 */
export default function CoOwnerReceipts() {
  const [lotId, setLotId] = useState<string | undefined>(undefined);
  const [kind, setKind] = useState<CoOwnerDocumentKind | undefined>(undefined);
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [page, setPage] = useState(1);

  const lots = useQuery({ queryKey: ['coowner-portal', 'lots'], queryFn: () => listMyLots() });
  const from = isoDayOf(range?.[0]);
  const to = isoDayOf(range?.[1]);

  const receipts = useQuery({
    queryKey: ['coowner-portal', 'receipts', lotId ?? null, kind ?? null, from ?? null, to ?? null, page],
    queryFn: () => listMyReceipts({ lotId, kind, from, to, page, limit: PAGE_SIZE })
  });

  const lotOptions = useMemo(
    () =>
      (lots.data ?? []).map(lot => ({ value: lot.id, label: t('Lot {{lotNumber}}', { lotNumber: lot.lotNumber }) })),
    [lots.data]
  );

  const columns: ColumnsType<CoOwnerReceipt> = [
    { title: t('Numéro'), dataIndex: 'number', key: 'number' },
    { title: t('Type'), key: 'kind', render: (_, row) => receiptKindLabel(row.kind) },
    { title: t('Lot'), key: 'lot', render: (_, row) => row.lot.lotNumber },
    { title: t('Période'), key: 'period', render: (_, row) => row.periodLabel ?? '—' },
    {
      title: t('Montant'),
      key: 'amount',
      align: 'end',
      render: (_, row) => <MoneyValue value={row.amount} currency={row.currency} />
    },
    { title: t('Émise le'), key: 'issuedAt', render: (_, row) => dayjs(row.issuedAt).format('DD/MM/YYYY') },
    { title: t('Action'), key: 'action', align: 'end', render: (_, row) => <DownloadButton receipt={row} /> }
  ];

  const resetPage = () => setPage(1);

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

      <Space wrap size="middle">
        <Select
          allowClear
          style={{ minWidth: 200 }}
          placeholder={t('Tous les lots')}
          options={lotOptions}
          value={lotId}
          onChange={value => {
            setLotId(value ?? undefined);
            resetPage();
          }}
          aria-label={t('Lot')}
        />
        <Select
          allowClear
          style={{ minWidth: 180 }}
          placeholder={t('Tous les types')}
          options={[
            { value: 'RECEIPT', label: t('Reçu') },
            { value: 'QUITTANCE', label: t('Quittance') }
          ]}
          value={kind}
          onChange={value => {
            setKind(value ?? undefined);
            resetPage();
          }}
          aria-label={t('Type de document')}
        />
        <DatePicker.RangePicker
          format="DD/MM/YYYY"
          value={range as [Dayjs, Dayjs] | null}
          onChange={value => {
            setRange(value as [Dayjs | null, Dayjs | null] | null);
            resetPage();
          }}
          aria-label={t('Période')}
        />
      </Space>

      {receipts.error ? (
        <StateBlock
          variant="error"
          description={portalErrorMessage(receipts.error, t('Impossible de charger vos quittances.'))}
          actions={[{ label: t('Réessayer'), onClick: () => void receipts.refetch(), primary: true }]}
        />
      ) : (
        <Card>
          <DataView<CoOwnerReceipt>
            items={receipts.data?.items ?? []}
            total={receipts.data?.pagination.total ?? 0}
            page={receipts.data?.pagination.page ?? page}
            pageSize={receipts.data?.pagination.limit ?? PAGE_SIZE}
            onPageChange={nextPage => setPage(nextPage)}
            loading={receipts.isPending}
            isReloading={receipts.isFetching && !receipts.isPending}
            rowKey={row => row.id}
            aria-label={t('Mes quittances')}
            emptyDescription={t("Aucun document n'a encore été émis pour vos lots.")}
            columns={columns}
            renderCard={row => (
              <DataCard
                title={`${receiptKindLabel(row.kind)} ${row.number}`}
                subtitle={[t('Lot {{lotNumber}}', { lotNumber: row.lot.lotNumber }), row.periodLabel]
                  .filter(Boolean)
                  .join(' · ')}
                highlight={<MoneyValue value={row.amount} currency={row.currency} />}
                fields={[
                  { label: t('Émise le'), value: dayjs(row.issuedAt).format('DD/MM/YYYY') },
                  { label: t('Téléchargement'), value: <DownloadButton receipt={row} /> }
                ]}
              />
            )}
          />
        </Card>
      )}
    </Space>
  );
}
