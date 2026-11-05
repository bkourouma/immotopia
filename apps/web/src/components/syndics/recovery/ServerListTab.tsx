import React from 'react';
import { Alert, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { AnyObject } from 'antd/es/_util/type';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Table } from '../../primitives';
import type { SyndicPage } from '../../../services/syndic-service';
import type { UseListSearchResult } from '../../../hooks/useListSearch';
import type { ApiParams } from '../../../utils/list-search';
import { collectAllPages } from '../../../utils/table-export/collect';
import { t } from '../../../i18n/t';

interface ServerListTabProps<T extends AnyObject> {
  /** Clé de la requête SANS les paramètres de recherche : y mettre le tenant et la copropriété. */
  queryKey: readonly unknown[];
  /** Recherche du tableau (`useListSearch` de la section, avec son préfixe d'URL). */
  search: UseListSearchResult;
  /** Appelle l'API avec les paramètres de recherche, page et limite comprises. */
  fetchPage: (params: ApiParams) => Promise<SyndicPage<T>>;
  columns: ColumnsType<T>;
  rowKey: string;
  exportFilename: string;
  /** Texte du tableau vide SANS critère actif (sous critère, la Table propose d'effacer). */
  emptyText: string;
}

/**
 * Tableau de recouvrement paginé et filtré par le serveur. Les critères, la
 * page et la taille de page vivent dans l'URL (préfixe de la section) ; les
 * critères partent à l'API, jamais de filtre sur la page reçue.
 */
export function ServerListTab<T extends AnyObject>({
  queryKey,
  search,
  fetchPage,
  columns,
  rowKey,
  exportFilename,
  emptyText
}: ServerListTabProps<T>) {
  const query = useQuery({
    queryKey: [...queryKey, search.apiParams],
    queryFn: () => fetchPage(search.apiParams),
    placeholderData: keepPreviousData
  });

  const failure = query.error as { response?: { data?: { error?: string } } } | null;

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {failure ? (
        <Alert
          type="error"
          showIcon
          message={failure.response?.data?.error || t('Impossible de charger le recouvrement')}
        />
      ) : null}
      <Table<T>
        aria-label={exportFilename}
        search={search.searchProps}
        exportFilename={exportFilename}
        exportFetchAll={() =>
          collectAllPages<T>(async (nextPage, nextLimit) => {
            const result = await fetchPage({ ...search.filterParams, page: nextPage, limit: nextLimit });
            return { items: result.items, total: result.pagination.total };
          })
        }
        scroll={{ x: 'max-content' }}
        rowKey={rowKey}
        dataSource={query.data?.items ?? []}
        loading={query.isFetching}
        columns={columns}
        pagination={{
          ...search.tablePagination(query.data?.pagination.total ?? 0),
          pageSizeOptions: [10, 20, 50, 100]
        }}
        locale={search.isFiltered ? undefined : { emptyText }}
      />
    </Space>
  );
}
