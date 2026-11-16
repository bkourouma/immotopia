import React, { useMemo } from 'react';
import { Alert, Button, Space } from 'antd';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { MoneyValue, StatCard, Table } from '../../primitives';
import {
  getTrialBalance,
  type SyndicTrialBalanceLine,
  type SyndicTrialBalanceQuery
} from '../../../services/syndic-service';
import { useListSearch } from '../../../hooks/useListSearch';
import { t } from '../../../i18n/t';
import {
  AccountingTabProps,
  BALANCE_PREFIX,
  LOCAL_PAGE_SIZE_BALANCE,
  accountClassOptions,
  accountingKey
} from './accounting-shared';

interface AccountingBalanceTabProps extends AccountingTabProps {
  /** Ouvre le grand livre du compte en gardant la période de la balance (jours `aaaa-mm-jj`, si posée). */
  onOpenLedger: (accountId: string, period: { from?: string; to?: string }) => void;
}

/**
 * Balance de vérification. L'API renvoie la balance COMPLÈTE agrégée en SQL (non paginée) : les
 * critères (recherche, classes, comptes soldés, période) sont envoyés au serveur — c'est lui qui
 * recalcule aussi `filteredTotals` — et seule la pagination (50) est locale, sur la réponse reçue.
 * Aucun filtre client supplémentaire : compteur, lignes et totaux restent cohérents.
 */
export const AccountingBalanceTab: React.FC<AccountingBalanceTabProps> = ({ tenantId, syndicId, onOpenLedger }) => {
  const search = useListSearch({
    paramPrefix: BALANCE_PREFIX,
    ariaLabel: t('Rechercher dans la balance'),
    defaultPageSize: LOCAL_PAGE_SIZE_BALANCE,
    apiNames: { sort: false },
    criteria: [
      {
        key: 'q',
        type: 'text',
        label: t('Rechercher'),
        placeholder: t('Numéro ou intitulé du compte…')
      },
      {
        key: 'class',
        type: 'multiSelect',
        label: t('Classe'),
        primary: true,
        api: 'accountClass',
        options: accountClassOptions()
      },
      {
        key: 'period',
        type: 'dateRange',
        label: t('Période'),
        primary: true,
        api: ['from', 'to']
      },
      {
        key: 'hideZero',
        type: 'boolean',
        label: t('Masquer les comptes soldés')
      }
    ]
  });

  // `filterParams` : critères seuls, sans `page`/`limit` (la balance n'est pas paginée par l'API).
  const query = search.filterParams;

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: accountingKey(tenantId, syndicId, 'balance', query),
    queryFn: () => getTrialBalance(tenantId, syndicId, query as SyndicTrialBalanceQuery),
    placeholderData: keepPreviousData
  });
  const period = search.values.period as { from?: string; to?: string } | undefined;

  const columns = useMemo(
    () => [
      {
        title: t('Compte'),
        render: (_: unknown, item: SyndicTrialBalanceLine) => `${item.accountNumber} - ${item.accountName}`
      },
      {
        title: t('Débit'),
        dataIndex: 'totalDebit',
        align: 'end' as const,
        render: (value: number) => <MoneyValue value={value} />
      },
      {
        title: t('Crédit'),
        dataIndex: 'totalCredit',
        align: 'end' as const,
        render: (value: number) => <MoneyValue value={value} />
      },
      {
        title: t('Solde'),
        dataIndex: 'balance',
        align: 'end' as const,
        render: (value: number) => <MoneyValue value={value} />
      },
      {
        title: t('Action'),
        exportable: false,
        render: (_: unknown, item: SyndicTrialBalanceLine) => (
          <Button size="small" onClick={() => onOpenLedger(item.accountId, period ?? {})}>
            {t('Grand livre')}
          </Button>
        )
      }
    ],
    [onOpenLedger, period]
  );

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {data ? (
        <StatCard
          label={t('Balance équilibrée')}
          value={data.totals.isBalanced ? t('Oui') : t('Non')}
          tone={data.totals.isBalanced ? 'positive' : 'danger'}
        />
      ) : null}

      {error ? <Alert type="error" showIcon message={t('Impossible de charger la comptabilité')} /> : null}

      <Table<SyndicTrialBalanceLine>
        helpId="syndic.comptabilite.balance"
        search={search.searchProps}
        exportFilename={t('Balance de vérification')}
        scroll={{ x: 'max-content' }}
        rowKey="accountId"
        loading={isLoading || isFetching}
        dataSource={data?.items ?? []}
        columns={columns}
        pagination={search.tablePagination(data?.items.length ?? 0)}
        locale={search.isFiltered ? undefined : { emptyText: t('Aucun mouvement sur la période.') }}
        summary={() =>
          data ? (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}>
                  <strong>{t('Total')}</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="end">
                  <MoneyValue value={data.filteredTotals.totalDebit} />
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="end">
                  <MoneyValue value={data.filteredTotals.totalCredit} />
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} />
                <Table.Summary.Cell index={4} />
              </Table.Summary.Row>
            </Table.Summary>
          ) : null
        }
      />
    </Space>
  );
};
