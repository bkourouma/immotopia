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
   * Préfixe des paramètres d'URL de cette liste (`doc_` → `doc_status`,
   * `doc_page`…). À poser quand deux listes partagent la même URL, comme les
   * onglets d'une fiche : un onglet monté mais masqué lit toujours l'URL.
   */
  paramPrefix?: string;
}

export interface UseListParamsResult<F extends Record<string, string>> extends ListParams<F> {
  /** Pose ou modifie des filtres. Remet la page à 1. */
  setFilters: (next: Partial<Record<keyof F & string, string | undefined>>) => void;
  /** Efface tous les filtres reconnus. Remet la page à 1. */
  clearFilters: () => void;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  /** Change le tri. Remet la page à 1 : la page 3 d'un autre ordre n'a pas de sens. */
  setSort: (sort: Sort | null) => void;
  /** Les paramètres tels qu'ils partent à l'API : filtres + page + limite. */
  queryParams: Record<string, string | number>;
}

const BASE_PAGE_KEY = 'page';
const BASE_SIZE_KEY = 'limit';
const BASE_SORT_KEY = 'sort';

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
  const { filterKeys, defaultPageSize = 20, defaultSort = null, paramPrefix = '' } = options;
  const [searchParams, setSearchParams] = useSearchParams();
  // Avec un préfixe, les clés d'URL propres à cette liste (filtres, page, taille,
  // tri) ne se confondent pas avec celles d'une autre liste montée dans la même
  // page (onglets d'une fiche) ; les noms vus par l'appelant restent inchangés.
  const PAGE_KEY = `${paramPrefix}${BASE_PAGE_KEY}`;
  const SIZE_KEY = `${paramPrefix}${BASE_SIZE_KEY}`;
  const SORT_KEY = `${paramPrefix}${BASE_SORT_KEY}`;
  const urlKey = useCallback((key: string) => `${paramPrefix}${key}`, [paramPrefix]);

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

  const page = Math.max(1, Number(searchParams.get(PAGE_KEY)) || 1);
  const pageSize = Math.max(1, Number(searchParams.get(SIZE_KEY)) || defaultPageSize);
  const sort = parseSort(searchParams.get(SORT_KEY)) ?? defaultSort;
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

      if (next.get(PAGE_KEY) === '1') next.delete(PAGE_KEY);
      if (next.get(SIZE_KEY) === String(defaultPageSize)) next.delete(SIZE_KEY);
      if (next.get(SORT_KEY) === formatSort(defaultSort)) next.delete(SORT_KEY);

      setSearchParams(next, { replace: options?.replace ?? false });
    },
    [searchParams, setSearchParams, defaultPageSize, defaultSort, PAGE_KEY, SIZE_KEY, SORT_KEY]
  );

  const setFilters = useCallback<UseListParamsResult<F>['setFilters']>(
    updates => {
      write(next => {
        for (const [key, value] of Object.entries(updates)) {
          if (value === undefined || value === '') next.delete(urlKey(key));
          else next.set(urlKey(key), value);
        }
        // Changer un filtre remet à la page 1. Sans cela, quelqu'un qui filtre
        // depuis la page 7 atterrit sur une liste vide alors que des résultats
        // existent — il conclut que le filtre ne marche pas.
        next.delete(PAGE_KEY);
      });
    },
    [write, urlKey, PAGE_KEY]
  );

  const clearFilters = useCallback(() => {
    write(next => {
      for (const key of filterKeys) next.delete(urlKey(key));
      next.delete(PAGE_KEY);
    });
  }, [write, filterKeys, urlKey, PAGE_KEY]);

  const setPage = useCallback(
    (value: number) => {
      write(next => next.set(PAGE_KEY, String(Math.max(1, value))));
    },
    [write, PAGE_KEY]
  );

  const setPageSize = useCallback(
    (value: number) => {
      write(next => {
        next.set(SIZE_KEY, String(Math.max(1, value)));
        // La page courante n'a pas d'équivalent dans une autre taille de page.
        next.delete(PAGE_KEY);
      });
    },
    [write, PAGE_KEY, SIZE_KEY]
  );

  const setSort = useCallback(
    (value: Sort | null) => {
      write(next => {
        const formatted = formatSort(value);
        if (formatted) next.set(SORT_KEY, formatted);
        else next.delete(SORT_KEY);
        next.delete(PAGE_KEY);
      });
    },
    [write, PAGE_KEY, SORT_KEY]
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
