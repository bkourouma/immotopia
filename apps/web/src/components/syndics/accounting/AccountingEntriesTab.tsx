import React, { useMemo } from 'react';
import { Alert, Button, Space, Tag } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { MoneyValue, Table } from '../../primitives';
import { listAccountingEntries, type AccountingEntriesPageQuery } from '../../../services/syndic-service';
import type { AccountingJournal, JournalEntry } from '../../../types/syndic-types';
import { useListSearch } from '../../../hooks/useListSearch';
import { collectAllPages } from '../../../utils/table-export/collect';
import { t } from '../../../i18n/t';
import {
  AccountingTabProps,
  ENTRIES_PAGE_SIZE,
  ENTRIES_PREFIX,
  EntryLineView,
  accountCriterion,
  accountLabel,
  accountingKey
} from './accounting-shared';

interface AccountingEntriesTabProps extends AccountingTabProps {
  journals: AccountingJournal[];
  submitting: boolean;
  onLock: (entryId: string) => void;
}

const lineColumns = () => [
  {
    title: t('Compte'),
    render: (_: unknown, line: EntryLineView) => (line.account ? accountLabel(line.account) : '-')
  },
  { title: t('Lot'), render: (_: unknown, line: EntryLineView) => line.lot?.lotNumber || '-' },
  { title: t('Libellé'), dataIndex: 'label' },
  {
    title: t('Débit'),
    dataIndex: 'debit',
    align: 'end' as const,
    render: (value: number | string) => <MoneyValue value={value} />
  },
  {
    title: t('Crédit'),
    dataIndex: 'credit',
    align: 'end' as const,
    render: (value: number | string) => <MoneyValue value={value} />
  }
];

/**
 * Journal des écritures : pagination, recherche et critères sont portés par le serveur
 * (`GET …/comptabilite/ecritures`), l'état vit dans l'URL sous le préfixe `ecr`.
 */
export const AccountingEntriesTab: React.FC<AccountingEntriesTabProps> = ({
  tenantId,
  syndicId,
  journals,
  submitting,
  onLock
}) => {
  const queryClient = useQueryClient();

  const search = useListSearch({
    paramPrefix: ENTRIES_PREFIX,
    ariaLabel: t('Rechercher dans les écritures'),
    defaultPageSize: ENTRIES_PAGE_SIZE,
    apiNames: { sort: false },
    criteria: [
      {
        key: 'q',
        type: 'text',
        label: t('Rechercher'),
        placeholder: t('Référence, description, libellé de ligne…')
      },
      accountCriterion({
        key: 'account',
        label: t('Compte'),
        api: 'accountId',
        primary: true,
        tenantId,
        syndicId,
        queryClient
      }),
      {
        key: 'period',
        type: 'dateRange',
        label: t('Période'),
        primary: true,
        api: ['from', 'to']
      },
      {
        key: 'journal',
        type: 'select',
        label: t('Journal'),
        api: 'journalId',
        options: journals.map(journal => ({
          value: journal.id,
          label: `${journal.code} - ${journal.label} (${journal.fiscalYear})`
        }))
      },
      {
        key: 'status',
        type: 'select',
        label: t('Statut'),
        options: [
          { value: 'locked', label: t('Verrouillée') },
          { value: 'open', label: t('Ouverte') }
        ]
      }
    ]
  });

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: accountingKey(tenantId, syndicId, 'ecritures', search.apiParams),
    queryFn: () => listAccountingEntries(tenantId, syndicId, search.apiParams as AccountingEntriesPageQuery),
    placeholderData: keepPreviousData
  });
  const total = data?.pagination.total ?? 0;

  const columns = useMemo(
    () => [
      {
        title: t('Date'),
        dataIndex: 'entryDate',
        render: (value: string) => dayjs(value).format('DD/MM/YYYY')
      },
      { title: t('Référence'), dataIndex: 'reference' },
      { title: t('Description'), dataIndex: 'description' },
      {
        title: t('Journal'),
        render: (_: unknown, entry: JournalEntry) => entry.journal?.code || entry.journalId
      },
      {
        title: t('Statut'),
        render: (_: unknown, entry: JournalEntry) =>
          entry.isLocked ? <Tag color="green">{t('VERROUILLÉE')}</Tag> : <Tag color="orange">{t('Ouverte')}</Tag>
      },
      {
        title: t('Action'),
        exportable: false,
        render: (_: unknown, entry: JournalEntry) =>
          entry.isLocked ? (
            <Tag>{t('Verrouillée')}</Tag>
          ) : (
            <Button size="small" icon={<LockOutlined />} loading={submitting} onClick={() => onLock(entry.id)}>
              {t('Verrouiller')}
            </Button>
          )
      }
    ],
    [submitting, onLock]
  );

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {error ? <Alert type="error" showIcon message={t('Impossible de charger la comptabilité')} /> : null}

      <Table<JournalEntry>
        search={search.searchProps}
        exportFilename={t('Écritures comptables')}
        exportFetchAll={() =>
          collectAllPages<JournalEntry>(async (exportPage, limit) => {
            const result = await listAccountingEntries(tenantId, syndicId, {
              ...search.filterParams,
              page: exportPage,
              limit
            } as AccountingEntriesPageQuery);
            return { items: result.items, total: result.pagination.total };
          })
        }
        scroll={{ x: 'max-content' }}
        rowKey="id"
        loading={isLoading || isFetching}
        dataSource={data?.items ?? []}
        columns={columns}
        expandable={{
          expandedRowRender: entry => (
            <Table<EntryLineView>
              exportable={false}
              size="small"
              rowKey="id"
              pagination={false}
              scroll={{ x: 'max-content' }}
              dataSource={(entry.lines ?? []) as unknown as EntryLineView[]}
              columns={lineColumns()}
            />
          )
        }}
        pagination={search.tablePagination(total)}
        locale={search.isFiltered ? undefined : { emptyText: t('Aucune écriture comptable.') }}
      />
    </Space>
  );
};
