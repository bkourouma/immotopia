import { useCallback, useMemo, useRef } from 'react';
import type { TablePaginationConfig } from 'antd';
import { useListParams } from './useListParams';
import type { Sort } from './useListParams';
import { isActiveValue } from '../utils/list-search/filter';
import type {
  ApiParams,
  DateRangeValue,
  ListSearchBinding,
  NumberRangeValue,
  SearchCriterion,
  SelectCriterion,
  SearchValue,
  SearchValues
} from '../utils/list-search/types';

/**
 * Recherche multicritères d'une liste, portée par l'URL.
 *
 * Se place au-dessus de `useListParams` : les critères déclarés (`criteria`)
 * sont lus dans l'URL, écrits dans l'URL, puis traduits en paramètres d'API.
 * Guide : `docs/architecture/recherche-listes.md`.
 *
 * Exemple :
 *
 * ```tsx
 * const criteria = [
 *   { key: 'q', type: 'text', label: t('Recherche') },
 *   { key: 'status', type: 'select', label: t('Statut'), options },
 *   { key: 'date', type: 'dateRange', label: t('Période'), api: ['from', 'to'] }
 * ] as const;
 * const search = useListSearch({ criteria });
 * const { data } = useQuery({ queryKey: ['items', search.apiParams], queryFn: ... });
 * return <DataView items={data.items} total={data.total} search={search.searchProps} {...search.dataViewProps} />;
 * ```
 */

export interface UseListSearchOptions {
  /** Critères déclarés dans le corps du composant (libellés déjà passés par `t()`). */
  criteria: readonly SearchCriterion[];
  /** Préfixe des clés d'URL (voir `useListParams`) : deux tableaux sur un écran. */
  paramPrefix?: string;
  /** Taille de page par défaut (20). */
  defaultPageSize?: number;
  /** Tri par défaut, absent de l'URL tant qu'il n'est pas modifié. */
  defaultSort?: Sort | null;
  /**
   * Noms des paramètres de pagination et de tri envoyés à l'API.
   * Défaut `{ page: 'page', limit: 'limit', sort: 'sort' }` ; `sort: false` = tri non envoyé.
   */
  apiNames?: { page?: string; limit?: string; sort?: string | false };
  /** Nom accessible de la zone de recherche, reporté dans `searchProps['aria-label']`. */
  ariaLabel?: string;
}

export interface UseListSearchResult {
  criteria: readonly SearchCriterion[];
  /** Une entrée par critère (voir `SearchValue`). Mémorisé : sert de clé React Query. */
  values: SearchValues;
  /** Fusionne des valeurs dans l'URL et remet la page à 1. Une valeur vide efface la clé. */
  setValues: (next: Partial<SearchValues>, options?: { replace?: boolean }) => void;
  /** Efface tous les critères (pas le tri ni la taille de page) et remet la page à 1. */
  clear: () => void;
  /** Nombre de critères actifs (un intervalle à une seule borne compte pour 1). */
  activeCount: number;
  /** `activeCount > 0`. */
  isFiltered: boolean;
  page: number;
  pageSize: number;
  sort: Sort | null;
  setPage: (page: number, options?: { replace?: boolean }) => void;
  /**
   * Ramène `?page` hors bornes à la dernière page (mode serveur), sans empiler
   * d'historique. Ne fait rien si `total` vaut 0 ou si la page est valide.
   * `<DataView>` et `<Table>` la déclenchent seuls quand `search` leur est passé ;
   * un écran sur mesure l'appelle dans un `useEffect` dès que `total` est connu.
   */
  clampPage?: (total: number) => void;
  setPageSize: (size: number) => void;
  setSort: (sort: Sort | null) => void;
  /** Critères traduits pour l'API, SANS pagination ni tri : à réutiliser tel quel par l'export. */
  filterParams: ApiParams;
  /** `filterParams` + page + limite (+ tri) : ce que la liste envoie. Mémorisé. */
  apiParams: ApiParams;
  /** À étaler sur `<ListSearch>` ou à passer à `search` de `<DataView>` / `<Table>`. */
  searchProps: ListSearchBinding;
  /** À étaler sur `<DataView>` : page, taille, tri et effacement des filtres. */
  dataViewProps: {
    page: number;
    pageSize: number;
    onPageChange: (page: number, pageSize: number) => void;
    sort: Sort | null;
    onSortChange: (sort: Sort | null) => void;
    isFiltered: boolean;
    onClearFilters: () => void;
  };
  /** Pagination antd prête pour `primitives/Table` d'une liste paginée côté serveur. */
  tablePagination: (total: number) => TablePaginationConfig;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Date `aaaa-mm-jj` réellement existante (le 2025-02-31 est refusé). */
function isValidDay(raw: string): boolean {
  if (!DAY_PATTERN.test(raw)) return false;
  const [y, m, d] = raw.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function parseNumber(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** Noms des deux paramètres d'URL d'un intervalle (hors préfixe). */
function rangeUrlKeys(criterion: SearchCriterion): readonly [string, string] {
  if (criterion.type === 'dateRange') return criterion.urlKeys ?? [`${criterion.key}From`, `${criterion.key}To`];
  if (criterion.type === 'numberRange') return criterion.urlKeys ?? [`${criterion.key}Min`, `${criterion.key}Max`];
  return [criterion.key, criterion.key];
}

/** Clés d'URL (hors préfixe) occupées par un critère. */
function criterionUrlKeys(criterion: SearchCriterion): string[] {
  if (criterion.type === 'dateRange' || criterion.type === 'numberRange') return [...rangeUrlKeys(criterion)];
  return [criterion.key];
}

/**
 * Valeurs des options STATIQUES d'un critère, ou `undefined` s'il n'y a rien à
 * vérifier : `loadOptions` présent, ou tableau absent / vide (options pas encore
 * chargées : un lien partagé ne doit pas perdre son critère pendant ce temps).
 */
function staticOptionValues(criterion: SearchCriterion): Set<string> | undefined {
  if (criterion.type !== 'select' && criterion.type !== 'multiSelect') return undefined;
  if (criterion.type === 'select' && (criterion.loadOptions || criterion.loadOptionsPage)) return undefined;
  const options = criterion.options;
  if (!options || options.length === 0) return undefined;
  return new Set(options.map(option => option.value));
}

/** Lit la valeur d'un critère dans les filtres bruts de l'URL ; toute valeur mal formée est ignorée. */
function readValue(criterion: SearchCriterion, raw: Record<string, string>): SearchValue {
  switch (criterion.type) {
    case 'text': {
      const text = raw[criterion.key]?.trim();
      return text ? text : undefined;
    }
    case 'select': {
      const value = raw[criterion.key] || undefined;
      const known = staticOptionValues(criterion);
      return value !== undefined && known && !known.has(value) ? undefined : value;
    }
    case 'multiSelect': {
      const known = staticOptionValues(criterion);
      return (raw[criterion.key] ?? '')
        .split(',')
        .map(part => part.trim())
        .filter(part => part !== '' && (!known || known.has(part)));
    }
    case 'dateRange': {
      const [fromKey, toKey] = rangeUrlKeys(criterion);
      const value: DateRangeValue = {};
      if (raw[fromKey] && isValidDay(raw[fromKey])) value.from = raw[fromKey];
      if (raw[toKey] && isValidDay(raw[toKey])) value.to = raw[toKey];
      return value;
    }
    case 'numberRange': {
      const [minKey, maxKey] = rangeUrlKeys(criterion);
      const value: NumberRangeValue = {};
      const min = parseNumber(raw[minKey]);
      const max = parseNumber(raw[maxKey]);
      if (min !== undefined) value.min = min;
      if (max !== undefined) value.max = max;
      return value;
    }
    case 'boolean':
      if (raw[criterion.key] === '1') return true;
      if (raw[criterion.key] === '0') return false;
      return undefined;
  }
}

/** Traduit une valeur en paramètres d'URL (`undefined` = effacer la clé). */
function encodeValue(criterion: SearchCriterion, value: SearchValue): Record<string, string | undefined> {
  switch (criterion.type) {
    case 'text':
    case 'select':
      return { [criterion.key]: typeof value === 'string' && value.trim() !== '' ? value : undefined };
    case 'multiSelect': {
      const parts = Array.isArray(value) ? value.map(String).filter(Boolean) : [];
      return { [criterion.key]: parts.length > 0 ? parts.join(',') : undefined };
    }
    case 'dateRange': {
      const [fromKey, toKey] = rangeUrlKeys(criterion);
      const range = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as DateRangeValue;
      return {
        [fromKey]: range.from && isValidDay(range.from) ? range.from : undefined,
        [toKey]: range.to && isValidDay(range.to) ? range.to : undefined
      };
    }
    case 'numberRange': {
      const [minKey, maxKey] = rangeUrlKeys(criterion);
      const range = (value && typeof value === 'object' && !Array.isArray(value) ? value : {}) as NumberRangeValue;
      return {
        [minKey]: typeof range.min === 'number' && Number.isFinite(range.min) ? String(range.min) : undefined,
        [maxKey]: typeof range.max === 'number' && Number.isFinite(range.max) ? String(range.max) : undefined
      };
    }
    case 'boolean':
      return { [criterion.key]: value === true ? '1' : value === false ? '0' : undefined };
  }
}

/** Traduit les valeurs ACTIVES des critères en paramètres d'API. */
function buildFilterParams(criteria: readonly SearchCriterion[], values: SearchValues): ApiParams {
  const params: ApiParams = {};
  for (const criterion of criteria) {
    const value = values[criterion.key];
    if (!isActiveValue(value) || value === undefined) continue;
    const api = criterion.api;
    if (api === false) continue;
    if (typeof api === 'function') {
      Object.assign(params, api(value));
      continue;
    }
    const name = typeof api === 'string' ? api : undefined;
    switch (criterion.type) {
      case 'text':
        params[name ?? 'search'] = value as string;
        break;
      case 'select':
        params[name ?? criterion.key] = value as string;
        break;
      case 'multiSelect':
        params[name ?? criterion.key] = (value as string[]).join(',');
        break;
      case 'boolean':
        params[name ?? criterion.key] = value ? 'true' : 'false';
        break;
      case 'dateRange':
      case 'numberRange': {
        const [lowName, highName] = Array.isArray(api) ? api : rangeUrlKeys(criterion);
        const range = value as Record<string, string | number | undefined>;
        const low = criterion.type === 'dateRange' ? range.from : range.min;
        const high = criterion.type === 'dateRange' ? range.to : range.max;
        if (low !== undefined) params[lowName] = low;
        if (high !== undefined) params[highName] = high;
        break;
      }
    }
  }
  return params;
}

function formatSort(sort: Sort): string {
  return `${sort.field}:${sort.order}`;
}

/**
 * Déclare des critères de recherche et en fait l'état d'une liste : valeurs
 * lues dans l'URL, paramètres d'API, props prêtes pour `<ListSearch>`,
 * `<DataView>` et `<Table>`.
 *
 * Le hook ne dépend que des CLÉS des critères : les redéclarer à chaque rendu
 * est sans coût et ne produit ni boucle ni nouvel objet.
 */
export function useListSearch(options: UseListSearchOptions): UseListSearchResult {
  const { criteria, paramPrefix, defaultPageSize, defaultSort, apiNames, ariaLabel } = options;

  // Signature structurelle : clés, types et clés d'URL. Seule elle pilote les
  // mémos de données ; l'identité du tableau `criteria` ne compte pas.
  // Les options statiques entrent dans la signature des données : elles filtrent
  // les valeurs d'URL (voir `readValue`), `values` doit donc suivre leur arrivée.
  // Les chaînes ne sont reconstruites que si la RÉFÉRENCE de `criteria` change ;
  // les mémos en aval restent pilotés par les chaînes elles-mêmes.
  const dataSignature = useMemo(
    () =>
      criteria
        .map(c => {
          const known = staticOptionValues(c);
          return `${c.type}:${c.key}:${criterionUrlKeys(c).join('+')}:${known ? [...known].join(',') : ''}`;
        })
        .join('|'),
    [criteria]
  );
  // Signature d'affichage : ajoute libellés, options et textes, pour que la barre
  // suive un changement de langue ou des options chargées sans changer à chaque rendu.
  const displaySignature = useMemo(
    () =>
      criteria
        .map(c => {
          const opts = 'options' in c && c.options ? c.options.map(o => `${o.value}=${o.label}`).join(',') : '';
          const extras = [
            'placeholder' in c ? c.placeholder : '',
            c.help,
            'unit' in c ? c.unit : '',
            'trueLabel' in c ? c.trueLabel : '',
            'falseLabel' in c ? c.falseLabel : '',
            'tristate' in c && c.tristate ? 1 : 0,
            'loadOptions' in c && c.loadOptions ? 1 : 0,
            'loadOptionsPage' in c && c.loadOptionsPage ? 1 : 0,
            'resolveLabel' in c && c.resolveLabel ? 1 : 0
          ].join('~');
          return `${c.key}:${c.label}:${c.primary ? 1 : 0}:${opts}:${extras}`;
        })
        .join('|'),
    [criteria]
  );

  // Version COURANTE des critères : les fonctions (`loadOptions`, `resolveLabel`,
  // `api`) ferment sur l'état du composant et changent d'un rendu à l'autre alors
  // que la signature, elle, ne bouge pas.
  const criteriaRef = useRef(criteria);
  criteriaRef.current = criteria;

  // eslint-disable-next-line react-hooks/exhaustive-deps -- volontairement piloté par la signature
  const stableData = useMemo(() => criteria, [dataSignature]);
  // Critères exposés : `loadOptions` et `resolveLabel` sont des enveloppes à
  // identité stable qui délèguent à la version courante lue dans la ref.
  const stableCriteria = useMemo<readonly SearchCriterion[]>(
    () =>
      criteria.map(criterion => {
        if (
          criterion.type !== 'select' ||
          (!criterion.loadOptions && !criterion.loadOptionsPage && !criterion.resolveLabel)
        )
          return criterion;
        const current = (): SelectCriterion | undefined => {
          const found = criteriaRef.current.find(c => c.key === criterion.key);
          return found && found.type === 'select' ? found : undefined;
        };
        const wrapped: SelectCriterion = { ...criterion };
        if (criterion.loadOptions) {
          wrapped.loadOptions = (search: string) => current()?.loadOptions?.(search) ?? Promise.resolve([]);
        }
        if (criterion.loadOptionsPage) {
          wrapped.loadOptionsPage = (search: string, page: number) =>
            current()?.loadOptionsPage?.(search, page) ?? Promise.resolve({ items: [], total: 0 });
        }
        if (criterion.resolveLabel) {
          wrapped.resolveLabel = (value: string) => current()?.resolveLabel?.(value);
        }
        return wrapped;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- volontairement piloté par la signature
    [dataSignature, displaySignature]
  );

  const filterKeys = useMemo(() => stableData.flatMap(criterionUrlKeys), [stableData]);

  const list = useListParams<Record<string, string>>({
    filterKeys,
    defaultPageSize,
    defaultSort,
    paramPrefix
  });
  const { filters, page, pageSize, sort, setFilters, clearFilters, setPage, setPageSize, setSort } = list;

  const rawValues = useMemo<SearchValues>(() => {
    const result: SearchValues = {};
    for (const criterion of stableData) result[criterion.key] = readValue(criterion, filters);
    return result;
  }, [stableData, filters]);
  // Un paramètre étranger ou d'une autre instance change `filters` sans changer
  // nos valeurs : on garde la même référence tant que leur contenu est identique.
  const valuesSignature = JSON.stringify(rawValues);
  const previousValues = useRef<SearchValues>({});
  const values = useMemo(() => {
    // Une valeur de critère inchangée (intervalle, liste) garde sa référence :
    // les contrôles mémoïsés des AUTRES critères ne se re-rendent pas.
    const shared: SearchValues = {};
    for (const key of Object.keys(rawValues)) {
      const before = previousValues.current[key];
      const now = rawValues[key];
      shared[key] =
        before !== undefined && typeof before === 'object' && JSON.stringify(before) === JSON.stringify(now)
          ? before
          : now;
    }
    previousValues.current = shared;
    return shared;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- piloté par le contenu
  }, [valuesSignature]);

  const activeCount = useMemo(
    () => stableData.reduce((count, c) => count + (isActiveValue(values[c.key]) ? 1 : 0), 0),
    [stableData, values]
  );

  const setValues = useCallback<UseListSearchResult['setValues']>(
    (next, setOptions) => {
      const updates: Record<string, string | undefined> = {};
      for (const criterion of stableData) {
        if (Object.prototype.hasOwnProperty.call(next, criterion.key)) {
          Object.assign(updates, encodeValue(criterion, next[criterion.key]));
        }
      }
      setFilters(updates, setOptions);
    },
    [stableData, setFilters]
  );

  // Recalculé à chaque rendu avec les critères COURANTS (`api` fonction qui ferme
  // sur un état), puis stabilisé par contenu comme `values`.
  const rawFilterParams = useMemo(() => buildFilterParams(criteria, values), [criteria, values]);
  const filterSignature = JSON.stringify(rawFilterParams);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- piloté par le contenu
  const filterParams = useMemo(() => rawFilterParams, [filterSignature]);

  const pageName = apiNames?.page ?? 'page';
  const limitName = apiNames?.limit ?? 'limit';
  const sortName = apiNames?.sort === undefined ? 'sort' : apiNames.sort;

  const apiParams = useMemo<ApiParams>(() => {
    const params: ApiParams = { ...filterParams, [pageName]: page, [limitName]: pageSize };
    if (sort && sortName !== false) params[sortName] = formatSort(sort);
    return params;
  }, [filterParams, pageName, limitName, sortName, page, pageSize, sort]);

  const isFiltered = activeCount > 0;

  const searchProps = useMemo<ListSearchBinding>(
    () => ({
      criteria: stableCriteria,
      values,
      onChange: setValues,
      onClear: clearFilters,
      activeCount,
      ...(ariaLabel ? { 'aria-label': ariaLabel } : {})
    }),
    [stableCriteria, values, setValues, clearFilters, activeCount, ariaLabel]
  );

  const clampPage = useCallback(
    (total: number) => {
      if (!(total > 0)) return;
      const last = Math.max(1, Math.ceil(total / pageSize));
      if (page > last) setPage(last, { replace: true });
    },
    [page, pageSize, setPage]
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
      page,
      pageSize,
      onPageChange,
      sort,
      onSortChange: setSort,
      isFiltered,
      onClearFilters: clearFilters
    }),
    [page, pageSize, onPageChange, sort, setSort, isFiltered, clearFilters]
  );

  const tablePagination = useCallback(
    (total: number): TablePaginationConfig => ({
      current: page,
      pageSize,
      total,
      onChange: onPageChange,
      showSizeChanger: true
    }),
    [page, pageSize, onPageChange]
  );

  return {
    criteria: stableCriteria,
    values,
    setValues,
    clear: clearFilters,
    activeCount,
    isFiltered,
    page,
    pageSize,
    sort,
    setPage,
    clampPage,
    setPageSize,
    setSort,
    filterParams,
    apiParams,
    searchProps,
    dataViewProps,
    tablePagination
  };
}
