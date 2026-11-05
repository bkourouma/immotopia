import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * État d'une liste — filtres, tri, page — porté par l'URL.
 *
 * `REFONTE_UI_UX.md` §10.1 : « Filtres, tri et page dans l'URL ; l'écran est
 * restaurable par son URL seule. » Ce n'est pas un confort. Aujourd'hui, un
 * collaborateur qui veut montrer une liste filtrée à un collègue doit lui
 * décrire les filtres à appliquer ; un retour arrière depuis un détail ramène
 * à la page 1 sans filtres ; et un rechargement perd tout.
 *
 * L'URL est ici la **source unique**. Il n'y a pas d'état local qui doublerait
 * les paramètres : le composant lit l'URL, écrit dans l'URL, et se re-rend.
 * Un état local en parallèle finirait toujours par diverger — c'est ce qui
 * arrive quand on revient en arrière dans l'historique.
 */

export type SortOrder = 'asc' | 'desc';

export interface Sort {
  field: string;
  order: SortOrder;
}

export interface ListParams<F extends Record<string, string>> {
  page: number;
  pageSize: number;
  sort: Sort | null;
  filters: F;
  /** Vrai dès qu'un filtre est posé. Distingue « aucune donnée » de « aucun résultat ». */
  isFiltered: boolean;
}

export interface UseListParamsOptions<F extends Record<string, string>> {
  /**
   * Noms des filtres reconnus. Tout autre paramètre de l'URL est ignoré et
   * laissé intact — l'écran ne doit pas effacer un paramètre qu'il ne
   * comprend pas (jeton de suivi, ancre, paramètre d'un autre composant).
   */
  filterKeys: readonly (keyof F & string)[];
  /** Taille de page par défaut. Absente de l'URL tant qu'elle vaut ce défaut. */
  defaultPageSize?: number;
  /** Tri par défaut. Absent de l'URL tant qu'il n'est pas modifié. */
  defaultSort?: Sort | null;
  /**
   * Préfixe des clés d'URL de cette instance : `paramPrefix: 'lots'` donne
   * `lots.q`, `lots.page`, `lots.limit`, `lots.sort`. Permet à deux tableaux
   * d'un même écran de porter chacun leur état sans s'écraser. `filters`,
   * `queryParams` et les arguments de `setFilters` restent en clés non
   * préfixées. Absent : clés brutes (comportement historique).
   */
  paramPrefix?: string;
}

export interface UseListParamsResult<F extends Record<string, string>> extends ListParams<F> {
  /**
   * Pose ou modifie des filtres. Remet la page à 1. `replace: true` remplace
   * l'entrée d'historique au lieu d'en empiler une (frappe dans un champ libre).
   */
  setFilters: (next: Partial<Record<keyof F & string, string | undefined>>, options?: { replace?: boolean }) => void;
  /** Efface tous les filtres reconnus. Remet la page à 1. */
  clearFilters: () => void;
  /** `replace: true` remplace l'entrée d'historique (ramener une page hors bornes sans empiler). */
  setPage: (page: number, options?: { replace?: boolean }) => void;
  setPageSize: (size: number) => void;
  /** Change le tri. Remet la page à 1 : la page 3 d'un autre ordre n'a pas de sens. */
  setSort: (sort: Sort | null) => void;
  /** Les paramètres tels qu'ils partent à l'API : filtres + page + limite. */
  queryParams: Record<string, string | number>;
}

const PAGE_KEY = 'page';
const SIZE_KEY = 'limit';
const SORT_KEY = 'sort';
const MAX_PAGE = 1_000_000;
const MAX_PAGE_SIZE = 100;
const MAX_DEFAULT_PAGE_SIZE = 1_000;

function normalizePositiveInteger(value: unknown, fallback: number, max: number): number {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function parseSort(raw: string | null): Sort | null {
  if (!raw) return null;
  const [field, order] = raw.split(':');
  if (!field) return null;
  return { field, order: order === 'desc' ? 'desc' : 'asc' };
}

function formatSort(sort: Sort | null): string | null {
  return sort ? `${sort.field}:${sort.order}` : null;
}

export function useListParams<F extends Record<string, string>>(
  options: UseListParamsOptions<F>
): UseListParamsResult<F> {
  const { filterKeys, defaultPageSize: requestedDefault = 20, defaultSort = null, paramPrefix } = options;
  const defaultPageSize = normalizePositiveInteger(requestedDefault, 20, MAX_DEFAULT_PAGE_SIZE);
  const maxPageSize = Math.max(MAX_PAGE_SIZE, defaultPageSize);
  const [searchParams, setSearchParams] = useSearchParams();

  // Clés d'URL réelles de cette instance (préfixées si `paramPrefix`).
  const pageKey = paramPrefix ? `${paramPrefix}.${PAGE_KEY}` : PAGE_KEY;
  const sizeKey = paramPrefix ? `${paramPrefix}.${SIZE_KEY}` : SIZE_KEY;
  const sortKey = paramPrefix ? `${paramPrefix}.${SORT_KEY}` : SORT_KEY;
  const urlKey = useCallback((key: string) => (paramPrefix ? `${paramPrefix}.${key}` : key), [paramPrefix]);

  const filters = useMemo(() => {
    const result = {} as F;
    for (const key of filterKeys) {
      const value = searchParams.get(urlKey(key));
      // Un paramètre présent mais vide vaut absent : `?q=` ne doit pas filtrer
      // sur la chaîne vide, sinon vider un champ ne ramène aucun résultat.
      if (value) (result as Record<string, string>)[key] = value;
    }
    return result;
  }, [searchParams, filterKeys, urlKey]);

  const page = normalizePositiveInteger(searchParams.get(pageKey), 1, MAX_PAGE);
  const pageSize = normalizePositiveInteger(searchParams.get(sizeKey), defaultPageSize, maxPageSize);
  const sort = parseSort(searchParams.get(sortKey)) ?? defaultSort;
  const isFiltered = Object.keys(filters).length > 0;

  /**
   * Écrit dans l'URL en ne gardant que ce qui s'écarte du défaut.
   *
   * Une URL qui porte `?page=1&limit=20&sort=` est illisible et donne
   * l'illusion d'un état alors qu'il n'y en a pas. Elle doit rester courte
   * pour être partageable, et seule la différence mérite d'y figurer.
   */
  const write = useCallback(
    (mutate: (next: URLSearchParams) => void, options?: { replace?: boolean }) => {
      const next = new URLSearchParams(searchParams);
      mutate(next);

      if (next.get(pageKey) === '1') next.delete(pageKey);
      if (next.get(sizeKey) === String(defaultPageSize)) next.delete(sizeKey);
      if (next.get(sortKey) === formatSort(defaultSort)) next.delete(sortKey);

      setSearchParams(next, { replace: options?.replace ?? false });
    },
    [searchParams, setSearchParams, defaultPageSize, defaultSort, pageKey, sizeKey, sortKey]
  );

  const setFilters = useCallback<UseListParamsResult<F>['setFilters']>(
    (updates, setOptions) => {
      write(next => {
        for (const [key, value] of Object.entries(updates)) {
          if (value === undefined || value === '') next.delete(urlKey(key));
          else next.set(urlKey(key), value);
        }
        // Changer un filtre remet à la page 1. Sans cela, quelqu'un qui filtre
        // depuis la page 7 atterrit sur une liste vide alors que des résultats
        // existent — il conclut que le filtre ne marche pas.
        next.delete(pageKey);
      }, setOptions);
    },
    [write, urlKey, pageKey]
  );

  const clearFilters = useCallback(() => {
    write(next => {
      for (const key of filterKeys) next.delete(urlKey(key));
      next.delete(pageKey);
    });
  }, [write, filterKeys, urlKey, pageKey]);

  const setPage = useCallback(
    (value: number, setOptions?: { replace?: boolean }) => {
      write(next => next.set(pageKey, String(normalizePositiveInteger(value, 1, MAX_PAGE))), setOptions);
    },
    [write, pageKey]
  );

  const setPageSize = useCallback(
    (value: number) => {
      write(next => {
        next.set(sizeKey, String(normalizePositiveInteger(value, defaultPageSize, maxPageSize)));
        // La page courante n'a pas d'équivalent dans une autre taille de page.
        next.delete(pageKey);
      });
    },
    [write, sizeKey, pageKey, defaultPageSize, maxPageSize]
  );

  const setSort = useCallback(
    (value: Sort | null) => {
      write(next => {
        const formatted = formatSort(value);
        if (formatted) next.set(sortKey, formatted);
        else next.delete(sortKey);
        next.delete(pageKey);
      });
    },
    [write, sortKey, pageKey]
  );

  const queryParams = useMemo(() => {
    const params: Record<string, string | number> = { ...filters, page, limit: pageSize };
    if (sort) params.sort = formatSort(sort) as string;
    return params;
  }, [filters, page, pageSize, sort]);

  return {
    page,
    pageSize,
    sort,
    filters,
    isFiltered,
    setFilters,
    clearFilters,
    setPage,
    setPageSize,
    setSort,
    queryParams
  };
}
