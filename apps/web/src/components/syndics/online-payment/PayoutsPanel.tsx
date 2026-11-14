import React, { useCallback, useEffect, useRef, useState } from 'react';
import { App, Alert, Button, Card } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { MoneyValue, Table, formatMoney } from '../../primitives';
import { useListSearch } from '../../../hooks/useListSearch';
import { collectAllPages } from '../../../utils/table-export/collect';
import {
  RecordGatewayPayoutResult,
  SyndicGatewayPayout,
  listSyndicGatewayPayouts
} from '../../../services/syndic-online-payment-service';
import { listSyndicReceivingNumbers } from '../../../services/syndic-declared-payment-service';
import { t } from '../../../i18n/t';
import { apiErrorMessage, formatDay } from './helpers';
import { PayoutModal, type PayoutAccountOption } from './PayoutModal';

export interface PayoutsPanelProps {
  tenantId: string;
  syndicId: string;
  /** Solde comptable du 5525 (`null` tant que la configuration n'est pas chargée). */
  collectionBalance: number | null;
  /** Pour relire les soldes après un reversement. */
  onRecorded?: (result: RecordGatewayPayoutResult) => void;
  /** Droit d'écriture ; sans lui, le bouton est masqué. */
  canEdit: boolean;
}

// Accesseurs de la recherche locale : déclarés hors du composant pour garder le filtrage mémoïsé.
/** Maximum accepté par l'API : les reversements sont renvoyés du plus récent au plus ancien. */
const PAYOUT_ACCOUNT_DEFAULT = '5525';

/** Reversements PaySecureHub vers la banque : liste (§1.8) et saisie (§1.9). */
export const PayoutsPanel: React.FC<PayoutsPanelProps> = ({
  tenantId,
  syndicId,
  collectionBalance,
  onRecorded,
  canEdit
}) => {
  const { message } = App.useApp();
  const [items, setItems] = useState<SyndicGatewayPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [receivingAccounts, setReceivingAccounts] = useState<PayoutAccountOption[]>([]);
  const [total, setTotal] = useState(0);
  const [accountNumbers, setAccountNumbers] = useState<string[]>([]);
  const version = useRef(0);
  const accounts: PayoutAccountOption[] = [
    { accountNumber: '5525', label: t('PaySecureHub (5525)'), balance: collectionBalance ?? 0 },
    ...receivingAccounts
  ];
  const reversible = accounts.some(account => account.balance > 0);
  const accountOptions = [
    ...accounts.map(account => ({ value: account.accountNumber, label: account.label })),
    ...accountNumbers.map(number => ({ value: number, label: number })),
    ...items
      .map(payout => payout.treasuryAccountNumber ?? PAYOUT_ACCOUNT_DEFAULT)
      .filter(number => !accounts.some(account => account.accountNumber === number))
      .map(number => ({ value: number, label: number }))
  ].filter((option, index, all) => all.findIndex(other => other.value === option.value) === index);
  const search = useListSearch({
    paramPrefix: 'rev',
    ariaLabel: t('Rechercher dans les reversements'),
    apiNames: { sort: false },
    criteria: [
      { key: 'q', type: 'text', label: t('Rechercher'), placeholder: t('Référence, note…') },
      { key: 'account', type: 'select', label: t('Compte'), primary: true, options: accountOptions },
      { key: 'period', type: 'dateRange', label: t('Période'), primary: true, api: ['from', 'to'] }
    ]
  });
  const requestKey = JSON.stringify(search.apiParams);

  const load = useCallback(async () => {
    const current = ++version.current;
    setLoading(true);
    setError(null);
    try {
      const result = await listSyndicGatewayPayouts(tenantId, syndicId, search.apiParams);
      if (current !== version.current) return;
      setItems(result.items);
      setTotal(result.pagination?.total ?? result.items.length);
      setAccountNumbers(result.accountNumbers ?? []);
      // Sous-comptes 5521x des numéros de réception : reversables comme le 5525 (R23). Un échec ne bloque pas le 5525.
      try {
        const numbers = await listSyndicReceivingNumbers(tenantId, syndicId);
        if (current !== version.current) return;
        setReceivingAccounts(
          numbers.map(number => ({
            accountNumber: number.treasuryAccountNumber,
            label: `${number.holderName} (${number.treasuryAccountNumber})`,
            balance: number.treasuryBalance
          }))
        );
      } catch {
        if (current === version.current) setReceivingAccounts([]);
      }
    } catch (e) {
      if (current === version.current) setError(apiErrorMessage(e, t('Impossible de charger les reversements')));
    } finally {
      if (current === version.current) setLoading(false);
    }
  }, [tenantId, syndicId, requestKey]);

  useEffect(() => {
    void load();
    return () => {
      version.current += 1;
    };
  }, [load]);

  const columns: ColumnsType<SyndicGatewayPayout> = [
    { title: t('Date'), dataIndex: 'date', key: 'date', render: (value: string) => formatDay(value) },
    {
      title: t('Compte'),
      dataIndex: 'treasuryAccountNumber',
      key: 'treasuryAccountNumber',
      render: (value?: string) => value ?? '5525'
    },
    { title: t('Référence'), dataIndex: 'reference', key: 'reference' },
    {
      title: t('Montant'),
      dataIndex: 'amount',
      key: 'amount',
      align: 'end',
      render: (value: number) => <MoneyValue value={value} />
    },
    { title: t('Note'), dataIndex: 'note', key: 'note', render: (value: string | null) => value || '—' }
  ];

  return (
    <Card
      title={t('Reversements vers la banque')}
      extra={
        canEdit ? (
          <Button
            type="primary"
            icon={<PlusOutlined aria-hidden />}
            disabled={!reversible}
            onClick={() => setModalOpen(true)}
          >
            {t('Enregistrer un reversement')}
          </Button>
        ) : null
      }
    >
      {error ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={error}
          action={
            <Button size="small" onClick={() => void load()}>
              {t('Réessayer')}
            </Button>
          }
        />
      ) : null}

      <Table<SyndicGatewayPayout>
        dataSource={items}
        search={search.searchProps}
        pagination={search.tablePagination(total)}
        aria-label={t('Reversements vers la banque')}
        helpId="syndic.paiements.reversements"
        exportFilename={t('Reversements vers la banque')}
        exportFetchAll={() =>
          collectAllPages<SyndicGatewayPayout>(async (page, limit) => {
            const result = await listSyndicGatewayPayouts(tenantId, syndicId, { ...search.filterParams, page, limit });
            return { items: result.items, total: result.pagination?.total ?? result.items.length };
          })
        }
        rowKey="entryId"
        size="middle"
        loading={loading}
        columns={columns}
        scroll={{ x: 'max-content' }}
        locale={search.isFiltered ? undefined : { emptyText: t('Aucun reversement enregistré') }}
      />

      <PayoutModal
        tenantId={tenantId}
        syndicId={syndicId}
        open={modalOpen}
        accounts={accounts}
        onClose={() => setModalOpen(false)}
        onRecorded={result => {
          setModalOpen(false);
          message.success(
            t('Reversement enregistré. Solde du compte {{account}} : {{amount}}', {
              account: result.treasuryAccountNumber ?? '5525',
              amount: formatMoney(result.collectionBalanceAfter)
            })
          );
          void load();
          onRecorded?.(result);
        }}
      />
    </Card>
  );
};

export default PayoutsPanel;
