import { useCallback, useMemo } from 'react';
import type { TablePaginationConfig } from 'antd';
import { useListSearch } from '../../hooks/useListSearch';
import type { UseListSearchOptions, UseListSearchResult } from '../../hooks/useListSearch';
import type { Sort } from '../../hooks/useListParams';
import { filterItems } from './filter';
import type { LocalFilterConfig } from './filter';
import { paginate } from './paginate';
import type { ListSearchBinding } from './types';

/**
 * Recherche, tri et pagination LOCAUX d'une liste reçue en entier (pas de
 * pagination côté serveur). Même contrat d'URL que `useListSearch`, mais le
 * filtrage se fait ici : voir `LocalFilterConfig` pour les accesseurs.
 */
export interface UseLocalListSearchOptions<T>
  extends Omit<UseListSearchOptions, 'apiNames'>, Omit<LocalFilterConfig<T>, 'criteria'> {
  /** Tri local optionnel appliqué après filtrage (le tri d'en-tête reste à l'écran sinon). */
  sortItems?: (items: T[], sort: Sort | null) => T[];
}

export interface UseLocalListSearchResult<T> extends UseListSearchResult {
  /** Toute la liste filtrée (et triée) : c'est ce que l'export doit exporter. */
  filtered: T[];
  /** La page courante de `filtered`. */
  pageItems: T[];
  /** `filtered.length`. */
  total: number;
  /** À étaler sur `<DataView>` : items, total, page, taille, tri, effacement, `paginated: true`, `search`. */
  dataViewProps: UseListSearchResult['dataViewProps'] & {
    items: T[];
    total: number;
    paginated: true;
    search: ListSearchBinding;
  };
  /** À étaler sur `primitives/Table` : `dataSource` (la page), pagination locale, `search`. */
  tableProps: { dataSource: T[]; pagination: TablePaginationConfig; search: ListSearchBinding };
  /** Pour `export.fetchAll` / `exportFetchAll` : rend `filtered`. */
  exportAll: () => Promise<T[]>;
}

const NO_ITEMS: readonly never[] = [];

/**
 * Filtre, trie et découpe `items` selon les critères portés par l'URL.
 *
 * `text`, `accessors`, `predicates` et `sortItems` pilotent la mémoïsation par
 * identité : les déclarer hors du composant (ou dans un `useMemo`) pour garder
 * des références stables ; sinon la liste est simplement recalculée à chaque
 * rendu (correct, un peu plus coûteux).
 *
 * Choix antd : `tableProps.dataSource` est déjà la PAGE courante et
 * `pagination.total` le total filtré. Dans ce cas antd 6 ne re-découpe pas
 * (`dataSource.length < total` → données rendues telles quelles ; sur une page
 * unique, la découpe de `[0, pageSize)` est neutre). Un tri d'en-tête antd ne
 * porte donc que sur la page affichée : pour un tri global, passer `sortItems`.
 *
 * La page demandée par l'URL est ramenée dans les bornes (`page` rendu = page
 * réellement affichée) sans réécrire l'URL.
 */
export function useLocalListSearch<T>(
  items: readonly T[] | undefined,
  options: UseLocalListSearchOptions<T>
): UseLocalListSearchResult<T> {
  const { text, accessors, predicates, sortItems, ...searchOptions } = options;
  const search = useListSearch(searchOptions);
  const { criteria, values, sort, pageSize, page: requestedPage, setPage, setPageSize } = search;
  const source = items ?? (NO_ITEMS as readonly T[]);

  const filtered = useMemo(() => {
    const matching = filterItems(source, values, { criteria, text, accessors, predicates });
    return sortItems ? sortItems(matching, sort) : matching;
  }, [source, values, criteria, text, accessors, predicates, sortItems, sort]);

  const paged = useMemo(() => paginate(filtered, requestedPage, pageSize), [filtered, requestedPage, pageSize]);
  const { items: pageItems, page } = paged;
  const total = filtered.length;

  const searchProps = useMemo<ListSearchBinding>(
    () => ({ ...search.searchProps, resultCount: total }),
    [search.searchProps, total]
  );

  const onPageChange = useCallback(
    (nextPage: number, nextSize: number) => {
      if (nextSize !== pageSize) setPageSize(nextSize);
      else setPage(nextPage);
    },
    [pageSize, setPage, setPageSize]
  );

  const dataViewProps = useMemo(
    () => ({
      ...search.dataViewProps,
      page,
      onPageChange,
      items: pageItems,
      total,
      paginated: true as const,
      search: searchProps
    }),
    [search.dataViewProps, page, onPageChange, pageItems, total, searchProps]
  );

  const tableProps = useMemo(
    () => ({
      dataSource: pageItems,
      pagination: { current: page, pageSize, total, onChange: onPageChange, showSizeChanger: true },
      search: searchProps
    }),
    [pageItems, page, pageSize, total, onPageChange, searchProps]
  );

  const exportAll = useCallback(() => Promise.resolve(filtered), [filtered]);

  return {
    ...search,
    page,
    searchProps,
    filtered,
    pageItems,
    total,
    dataViewProps,
    tableProps,
    exportAll
  };
}
