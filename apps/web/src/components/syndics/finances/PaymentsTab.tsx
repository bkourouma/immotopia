import React, { useMemo } from 'react';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { Alert } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { DataCard, DataView, MoneyValue } from '../../primitives';
import { listAllChargeCalls } from '../../../services/syndic-service';
import { useLocalListSearch } from '../../../utils/list-search';
import type { SearchCriterion } from '../../../utils/list-search';
import { dateFormat } from '../../../i18n/format';
import { t } from '../../../i18n/t';
import { paymentMethodLabel } from '../labels';
import { buildPaymentRows, financeLoadError, type PaymentRow } from './finance-rows';
import { financeKeys } from './query-keys';
import { sortRows } from './useLocalTable';

// Accesseurs stables (hors du composant) : le filtrage reste mémoïsé.
const TEXTE_RECHERCHE = [
  (row: PaymentRow) => row.lotLabel,
  (row: PaymentRow) => row.ownerLabel,
  (row: PaymentRow) => row.chargeReference
];
// Plafond de lecture de listAllChargeCalls : 50 pages de 100 appels, triés par échéance croissante.
const PLAFOND_APPELS = 5000;
const ACCESSEURS = {
  method: (row: PaymentRow) => row.method,
  paid: (row: PaymentRow) => row.paidAt,
  amount: (row: PaymentRow) => row.amount
};

/**
 * Paiements reçus. Aucune route ne liste les paiements : ils sont dérivés des
 * appels de charges (`payments[]`). La liste complète des appels n'est donc
 * chargée que lorsque cet onglet est affiché ; la recherche, le tri et la
 * pagination se font en local (préfixe d'URL « pa »).
 */
export const PaymentsTab: React.FC<{ tenantId: string; syndicId: string }> = ({ tenantId, syndicId }) => {
  const query = useQuery({
    queryKey: financeKeys.allCharges(tenantId, syndicId),
    queryFn: () => listAllChargeCalls(tenantId, syndicId)
  });

  const rows = useMemo(() => buildPaymentRows(query.data ?? []), [query.data]);
  // Modes réellement présents dans les paiements reçus (la liste n'est pas figée côté API).
  const methodOptions = useMemo(
    () =>
      [...new Set(rows.map(row => row.method).filter(method => method && method !== '—'))].map(method => ({
        value: method,
        label: paymentMethodLabel(method)
      })),
    [rows]
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

  const local = useLocalListSearch<PaymentRow>(rows, {
    paramPrefix: 'pa',
    ariaLabel: t('Rechercher dans les paiements reçus'),
    criteria,
    text: TEXTE_RECHERCHE,
    accessors: ACCESSEURS,
    sortItems: sortRows
  });

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

  const truncated = (query.data?.length ?? 0) >= PLAFOND_APPELS;

  return (
    <>
      {truncated && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={t(
            'Seuls les 5 000 appels de fonds les plus anciens (par date d’échéance) sont pris en compte ; les paiements des appels plus récents ne figurent pas dans cette liste.'
          )}
        />
      )}
      <DataView<PaymentRow>
        {...local.dataViewProps}
        loading={query.isLoading}
        error={financeLoadError(query.error)}
        errorCause={query.error}
        onRetry={() => void query.refetch()}
        emptyDescription={t('Aucun paiement enregistré pour cette copropriété.')}
        columns={columns}
        rowKey={row => row.id}
        aria-label={t('Détail des paiements reçus')}
        export={{ filename: t('Détail des paiements reçus'), fetchAll: local.exportAll }}
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
    </>
  );
};
