import React from 'react';
import type { ColumnsType } from 'antd/es/table';
import type { AnyObject } from 'antd/es/_util/type';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { DataView } from '../../primitives';
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
  /** Phrase d'accueil de la liste vide SANS critère actif (sous critère, la liste propose d'effacer). */
  emptyText: string;
  /** Représentation en carte sous 992 px : pas de tableau sans stratégie mobile. */
  renderCard: (item: T) => React.ReactNode;
  /** Largeur minimale du tableau (défilement horizontal entre 992 et 1200 px). */
  scrollX?: number;
  /** Identifiant de la fiche d'aide du tableau (« ? »). */
  helpId?: string;
}

/**
 * Liste de recouvrement paginée et filtrée par le serveur : tableau au-dessus
 * de 992 px, cartes en dessous. Les critères, la page et la taille de page
 * vivent dans l'URL (préfixe de la section) ; les critères partent à l'API,
 * jamais de filtre sur la page reçue. Une panne de chargement propose
 * « Réessayer » à l'endroit de la liste.
 */
export function ServerListTab<T extends AnyObject>({
  queryKey,
  search,
  fetchPage,
  columns,
  rowKey,
  exportFilename,
  emptyText,
  renderCard,
  scrollX,
  helpId
}: ServerListTabProps<T>) {
  const query = useQuery({
    queryKey: [...queryKey, search.apiParams],
    queryFn: () => fetchPage(search.apiParams),
    placeholderData: keepPreviousData
  });

  const failure = query.error as { response?: { data?: { error?: string } } } | null;

  return (
    <DataView<T>
      aria-label={exportFilename}
      helpId={helpId}
      search={search.searchProps}
      {...search.dataViewProps}
      items={query.data?.items ?? []}
      total={query.data?.pagination.total ?? 0}
      loading={query.isLoading}
      isReloading={query.isFetching && !query.isLoading}
      error={failure ? failure.response?.data?.error || t('Impossible de charger le recouvrement') : null}
      errorCause={query.error}
      onRetry={() => void query.refetch()}
      emptyDescription={emptyText}
      columns={columns}
      rowKey={item => String((item as Record<string, unknown>)[rowKey])}
      scrollX={scrollX}
      renderCard={renderCard}
      export={{
        filename: exportFilename,
        fetchAll: () =>
          collectAllPages<T>(async (nextPage, nextLimit) => {
            const result = await fetchPage({ ...search.filterParams, page: nextPage, limit: nextLimit });
            return { items: result.items, total: result.pagination.total };
          })
      }}
    />
  );
}
